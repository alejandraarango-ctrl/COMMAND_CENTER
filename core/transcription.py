"""Audio extraction (ffmpeg) + transcription (Deepgram) for batch video upload.

The batch manual-upload pathway needs a transcript of each uploaded mp4 to
feed the title generator and the caption RAG lookup. Two steps:

  1. extract_audio() — download the uploaded video to a local temp file, then
     pull a small mono 16 kHz mp3 out of it with ffmpeg. Only the audio track
     is decoded; the resulting mp3 is a few MB at most, and the downloaded
     video is deleted as soon as extraction finishes.

  2. transcribe() — POST those mp3 bytes to Deepgram's prerecorded API.

Why download first instead of streaming the signed URL into ffmpeg? The earlier
version passed the Supabase HTTPS signed URL straight to `ffmpeg -i` to avoid
writing the full video to disk. But the bundled `imageio-ffmpeg` static binary
is a minimal build and could not reliably open the remote HTTPS input on Render
— it printed its banner and exited non-zero with no usable diagnostic. Letting
Python's TLS stack fetch the bytes (via core.media.download_file, which already
follows redirects and guards size) and handing ffmpeg a plain local file is far
more robust and matches how every other cron pathway here consumes media.

ffmpeg comes from the `imageio-ffmpeg` package's bundled static binary rather
than a system install: Render's Python build can't apt-get ffmpeg (sudo is
disallowed), and bundling keeps local dev and production identical.
"""

from __future__ import annotations

import logging
import os
import subprocess
import uuid

import httpx

from core.media import download_file, get_signed_url
from core.retry import raise_for_retryable_status, with_retry

logger = logging.getLogger(__name__)

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"

# Deepgram model. nova-3 is their latest general transcription model;
# smart_format adds punctuation/capitalisation so the transcript reads cleanly
# for the title prompt. Bump the model string here if Deepgram ships a newer one.
DEEPGRAM_MODEL = "nova-3"

# ffmpeg can stall if upstream (Supabase Storage) hangs mid-stream. Cap the
# whole extraction so one bad file can't burn the dashboard's 5-minute spawn
# budget. Short clips (the expected 30s–3min Hormozi highlights) finish in
# seconds; this is a safety net for a pathological large/slow file.
_FFMPEG_TIMEOUT_SECONDS = 240

# Cap the video download. Mirror the manual uploader's 2 GB ceiling
# (dashboard sign-url/route.ts) so we accept anything the UI let through but
# never let a runaway download fill Render's /tmp.
_MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024

# Deepgram returns quickly for short audio; generous window for a hung socket.
_DEEPGRAM_TIMEOUT = httpx.Timeout(120.0, connect=10.0)


def _ffmpeg_exe() -> str:
    """Path to the bundled ffmpeg binary.

    Imported lazily so importing this module (e.g. in tests that mock
    transcribe) doesn't require imageio-ffmpeg to be installed.
    """
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def extract_audio(storage_path: str, dest_dir: str = "/tmp") -> str:
    """Extract a mono 16 kHz mp3 from a video in Supabase Storage.

    Downloads the video to a local temp file (via core.media.download_file,
    which uses Python's TLS stack, follows redirects, and guards size) and then
    decodes only its audio track to an mp3 with ffmpeg. Returns the local mp3
    path. The downloaded video is always deleted before we return. Raises if
    ffmpeg fails.

    Mono + 16 kHz keeps the mp3 tiny and is plenty for speech transcription —
    Deepgram resamples internally anyway, and we don't need stereo or music
    fidelity for words.
    """
    signed_url = get_signed_url(storage_path)
    out_path = os.path.join(dest_dir, f"{uuid.uuid4()}.mp3")

    # Fetch the bytes ourselves rather than letting ffmpeg open the remote URL:
    # the bundled static ffmpeg can't reliably read an HTTPS input (see module
    # docstring). download_file streams to /tmp with size + path-traversal
    # guards; we raise the cap to the uploader's 2 GB ceiling.
    logger.info("Extracting audio from %s", storage_path)
    local_video = download_file(signed_url, dest_dir=dest_dir, max_bytes=_MAX_VIDEO_BYTES)

    # -nostdin: never block waiting on stdin (we run non-interactively).
    # -protocol_whitelist file: the input is now a plain local path, so ffmpeg
    #   only ever needs the file protocol — pinning the allow-list keeps a
    #   crafted file from coaxing it into other schemes.
    # -vn: drop the video stream entirely — audio only.
    # -ac 1 / -ar 16000: mono, 16 kHz.
    cmd = [
        _ffmpeg_exe(),
        "-nostdin",
        "-protocol_whitelist", "file",
        "-i", local_video,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-f", "mp3",
        "-y",  # overwrite if the (uuid-named) target somehow exists
        out_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_FFMPEG_TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            # ffmpeg writes diagnostics to stderr. Keep a generous tail with the
            # exit code so the real failure is visible — the old 5-line slice
            # surfaced only ffmpeg's startup banner when it died early. A
            # NEGATIVE returncode means ffmpeg was killed by a signal (e.g. the
            # OOM killer on Render), not a normal error exit. The input is a
            # local path now (no signed token in stderr), but we still lean on
            # install_log_sanitizer() / sanitize_error_message as defense in
            # depth before anything is logged or written to the DB.
            tail = (result.stderr or "").strip().splitlines()[-20:]
            raise RuntimeError(
                f"ffmpeg audio extraction failed (exit {result.returncode}): "
                + " | ".join(tail)
            )
    except Exception:
        # Clean up a partially-written mp3 on ANY failure (non-zero exit,
        # timeout, OSError). Leaving a half-written file behind would waste
        # /tmp space and could be picked up as if it were a valid transcript
        # source. Best-effort: a missing file is fine.
        _safe_remove(out_path)
        raise
    finally:
        # Always drop the downloaded video — we only needed its audio, and a
        # leftover (up to 2 GB) would fill /tmp across repeated jobs.
        _safe_remove(local_video)

    logger.info("Extracted audio → %s", out_path)
    return out_path


def _safe_remove(path: str) -> None:
    """Delete a file if it exists, best-effort (a missing file is fine)."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError as cleanup_err:
        logger.warning("Could not remove %s: %s", path, cleanup_err)


@with_retry()
def _deepgram_request(api_key: str, audio: bytes) -> dict:
    """POST audio to Deepgram, returning the parsed JSON body.

    Wrapped in @with_retry so a transient hiccup (a 429, a 5xx, or a dropped
    connection) is retried with backoff instead of failing the whole batch job
    on the first miss. We translate the HTTP status into our exception
    hierarchy (raise_for_retryable_status) so the retry helper knows a 429/5xx
    is worth retrying but a 4xx (e.g. a bad key) is not — and we honor
    Deepgram's Retry-After header when it sends one.
    """
    resp = httpx.post(
        DEEPGRAM_URL,
        params={"model": DEEPGRAM_MODEL, "smart_format": "true"},
        headers={
            "Authorization": f"Token {api_key}",
            "Content-Type": "audio/mpeg",
        },
        content=audio,
        timeout=_DEEPGRAM_TIMEOUT,
    )
    if not resp.is_success:
        retry_after = _parse_retry_after(resp.headers.get("Retry-After"))
        # resp.text can echo the request context; the log sanitizer + DB
        # sanitizer scrub anything secret before it's persisted/emitted.
        raise_for_retryable_status(
            resp.status_code, retry_after=retry_after, body=resp.text
        )
    return resp.json()


def _parse_retry_after(raw: str | None) -> float | None:
    """Coerce a Retry-After header (seconds) to a float, or None if absent/bad."""
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        # Retry-After can also be an HTTP date; we don't parse that — fall back
        # to the retry helper's exponential backoff by returning None.
        return None


def transcribe(mp3_path: str) -> str:
    """Transcribe a local mp3 via Deepgram's prerecorded API. Returns text.

    Raises if DEEPGRAM_API_KEY is unset, the request fails, or Deepgram
    returns an empty transcript (a video with no speech is not something we
    can title or caption, so the caller should mark the job failed).
    """
    api_key = os.environ.get("DEEPGRAM_API_KEY", "")
    if not api_key:
        raise RuntimeError("DEEPGRAM_API_KEY env var not set")

    with open(mp3_path, "rb") as f:
        audio = f.read()

    body = _deepgram_request(api_key, audio)

    # Deepgram's prerecorded response nests the transcript under
    # results.channels[0].alternatives[0].transcript. Navigate defensively so
    # a schema surprise raises a clear error instead of a bare KeyError.
    try:
        transcript = (
            body["results"]["channels"][0]["alternatives"][0]["transcript"]
        ).strip()
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"Unexpected Deepgram response shape: {e}") from e

    if not transcript:
        raise RuntimeError("Deepgram returned an empty transcript (no speech?)")

    logger.info("Transcribed %s (%d chars)", mp3_path, len(transcript))
    return transcript
