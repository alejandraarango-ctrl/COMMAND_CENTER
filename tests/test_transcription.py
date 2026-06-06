"""Tests for core.transcription — extract_audio (ffmpeg) and transcribe (Deepgram).

Everything external is mocked: subprocess.run for ffmpeg, httpx.post for
Deepgram. No network, no real ffmpeg binary, deterministic.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

import core.transcription as tr
from core.exceptions import NonRetryablePlatformError


class _FakeResp:
    """Minimal httpx.Response stand-in for the bits _deepgram_request reads."""

    def __init__(self, status_code=200, body=None, text="", headers=None):
        self.status_code = status_code
        self._body = body if body is not None else {}
        self.text = text
        self.headers = headers or {}

    @property
    def is_success(self) -> bool:
        return 200 <= self.status_code < 300

    def json(self):
        return self._body


def _good_deepgram_body(transcript: str) -> dict:
    """A well-formed Deepgram prerecorded response carrying `transcript`."""
    return {
        "results": {
            "channels": [{"alternatives": [{"transcript": transcript}]}]
        }
    }


# ── extract_audio (ffmpeg) ───────────────────────────────────────────────


def test_extract_audio_raises_on_ffmpeg_nonzero_exit(monkeypatch, tmp_path):
    # The downloaded video is a real temp file so we can assert it's cleaned up
    # even when ffmpeg fails.
    video = tmp_path / "x.mp4"
    video.write_bytes(b"fake video")
    monkeypatch.setattr(tr, "get_signed_url", lambda sp: "https://signed/x.mp4")
    monkeypatch.setattr(tr, "download_file", lambda url, **k: str(video))
    monkeypatch.setattr(tr, "_ffmpeg_exe", lambda: "ffmpeg")
    monkeypatch.setattr(
        tr.subprocess, "run",
        lambda *a, **k: SimpleNamespace(returncode=1, stderr="bad input\nfatal"),
    )

    # The message must carry the exit code (the old version surfaced only the
    # ffmpeg startup banner when it died early).
    with pytest.raises(RuntimeError, match=r"ffmpeg audio extraction failed \(exit 1\)"):
        tr.extract_audio("tiktok/manual/u1/x.mp4")

    # The downloaded video is removed even on failure (no /tmp leak).
    assert not video.exists()


def test_extract_audio_feeds_local_path_with_file_whitelist(monkeypatch, tmp_path):
    # ffmpeg now reads the locally-downloaded file, so the input is that path
    # (not the signed URL) and the protocol allow-list is pinned to `file`.
    video = tmp_path / "x.mp4"
    video.write_bytes(b"fake video")
    captured: dict = {}
    monkeypatch.setattr(tr, "get_signed_url", lambda sp: "https://signed/x.mp4")
    monkeypatch.setattr(tr, "download_file", lambda url, **k: str(video))
    monkeypatch.setattr(tr, "_ffmpeg_exe", lambda: "ffmpeg")

    def fake_run(cmd, **k):
        captured["cmd"] = cmd
        return SimpleNamespace(returncode=0, stderr="")

    monkeypatch.setattr(tr.subprocess, "run", fake_run)

    out = tr.extract_audio("tiktok/manual/u1/x.mp4")

    cmd = captured["cmd"]
    assert cmd[cmd.index("-protocol_whitelist") + 1] == "file"
    # The input is the local file, not the remote URL.
    assert cmd[cmd.index("-i") + 1] == str(video)
    assert "https://signed/x.mp4" not in cmd
    # Output mp3 path is returned; downloaded video is cleaned up on success.
    assert out.endswith(".mp3")
    assert not video.exists()


def test_extract_audio_passes_2gb_cap_to_download(monkeypatch, tmp_path):
    # The batch path must lift download_file's default 100 MB cap so the larger
    # videos the uploader accepts aren't rejected before ffmpeg ever runs.
    video = tmp_path / "x.mp4"
    video.write_bytes(b"fake video")
    captured: dict = {}
    monkeypatch.setattr(tr, "get_signed_url", lambda sp: "https://signed/x.mp4")

    def fake_download(url, **kwargs):
        captured["kwargs"] = kwargs
        return str(video)

    monkeypatch.setattr(tr, "download_file", fake_download)
    monkeypatch.setattr(tr, "_ffmpeg_exe", lambda: "ffmpeg")
    monkeypatch.setattr(
        tr.subprocess, "run",
        lambda *a, **k: SimpleNamespace(returncode=0, stderr=""),
    )

    tr.extract_audio("tiktok/manual/u1/x.mp4")

    assert captured["kwargs"]["max_bytes"] == tr._MAX_VIDEO_BYTES


# ── transcribe (Deepgram) ────────────────────────────────────────────────


def test_transcribe_missing_key_raises(monkeypatch, tmp_path):
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    mp3 = tmp_path / "a.mp3"
    mp3.write_bytes(b"audio")
    with pytest.raises(RuntimeError, match="DEEPGRAM_API_KEY"):
        tr.transcribe(str(mp3))


def test_transcribe_non_200_raises_without_retry(monkeypatch, tmp_path):
    # A 400 is a client error → NonRetryablePlatformError, raised immediately
    # (no backoff sleeps). raise_for_retryable_status maps the status.
    monkeypatch.setenv("DEEPGRAM_API_KEY", "k")
    mp3 = tmp_path / "a.mp3"
    mp3.write_bytes(b"audio")
    monkeypatch.setattr(
        tr.httpx, "post",
        lambda *a, **k: _FakeResp(status_code=400, text="bad request"),
    )
    with pytest.raises(NonRetryablePlatformError):
        tr.transcribe(str(mp3))


def test_transcribe_empty_transcript_raises(monkeypatch, tmp_path):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "k")
    mp3 = tmp_path / "a.mp3"
    mp3.write_bytes(b"audio")
    monkeypatch.setattr(
        tr.httpx, "post",
        lambda *a, **k: _FakeResp(body=_good_deepgram_body("")),
    )
    with pytest.raises(RuntimeError, match="empty transcript"):
        tr.transcribe(str(mp3))


def test_transcribe_malformed_shape_raises(monkeypatch, tmp_path):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "k")
    mp3 = tmp_path / "a.mp3"
    mp3.write_bytes(b"audio")
    monkeypatch.setattr(
        tr.httpx, "post",
        lambda *a, **k: _FakeResp(body={"results": {"channels": []}}),
    )
    with pytest.raises(RuntimeError, match="Unexpected Deepgram response shape"):
        tr.transcribe(str(mp3))


def test_transcribe_happy_path(monkeypatch, tmp_path):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "k")
    mp3 = tmp_path / "a.mp3"
    mp3.write_bytes(b"audio")
    monkeypatch.setattr(
        tr.httpx, "post",
        lambda *a, **k: _FakeResp(body=_good_deepgram_body("hello world")),
    )
    assert tr.transcribe(str(mp3)) == "hello world"
