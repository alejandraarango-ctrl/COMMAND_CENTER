"""Tests for cron.tiktok_storage_cleanup._cleanup_orphans.

Pure-logic tests against a hand-built mock of the Supabase Python client.
Covers the orphan-sweep classifier:

  - paths that appear in any posts.media_urls are protected;
  - unclaimed paths newer than ORPHAN_TTL are skipped (in-flight);
  - unclaimed paths older than ORPHAN_TTL are deleted;
  - Storage-level errors are counted, not raised.

We don't hit Supabase. The real integration is exercised by running the
cron locally via `python -m cron.tiktok_storage_cleanup`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from cron.tiktok_storage_cleanup import (
    BUCKET,
    MANUAL_UPLOAD_PREFIX,
    ORPHAN_TTL,
    _cleanup_orphans,
)


def _iso(dt: datetime) -> str:
    """Render a datetime the way Supabase Storage does: ISO-8601 + Z."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _make_client(
    posts_rows: list[dict],
    listings: dict[str, list[dict]],
    remove_errors: set[str] | None = None,
):
    """Build a MagicMock that behaves like a Supabase client for the
    two surfaces _cleanup_orphans touches.

    posts_rows     — what client.table("posts").select(...).execute().data returns.
    listings       — map from list() path argument to the returned entries.
    remove_errors  — set of paths whose remove() call should raise.
    """
    remove_errors = remove_errors or set()
    removed: list[str] = []

    client = MagicMock()

    # client.table("posts").select("media_urls").execute().data
    client.table.return_value.select.return_value.execute.return_value.data = posts_rows

    # client.storage.from_(BUCKET).list(path) — dispatch on the path arg.
    storage_handle = MagicMock()

    def list_side_effect(path):
        return listings.get(path, [])

    storage_handle.list.side_effect = list_side_effect

    def remove_side_effect(paths):
        for p in paths:
            if p in remove_errors:
                raise RuntimeError(f"Storage failure for {p}")
            removed.append(p)
        return None

    storage_handle.remove.side_effect = remove_side_effect

    def from_side_effect(bucket):
        assert bucket == BUCKET, f"expected bucket {BUCKET!r}, got {bucket!r}"
        return storage_handle

    client.storage.from_.side_effect = from_side_effect

    return client, removed


class TestCleanupOrphans:
    def test_old_unclaimed_file_is_deleted(self):
        old = datetime.now(timezone.utc) - timedelta(hours=48)
        client, removed = _make_client(
            posts_rows=[],
            listings={
                MANUAL_UPLOAD_PREFIX: [{"name": "user-alice", "id": None}],
                f"{MANUAL_UPLOAD_PREFIX}/user-alice": [
                    {"name": "abc.mp4", "id": "f1", "created_at": _iso(old)},
                ],
            },
        )

        counts = _cleanup_orphans(client)

        assert removed == [f"{MANUAL_UPLOAD_PREFIX}/user-alice/abc.mp4"]
        assert counts == {"deleted": 1, "skipped_recent": 0, "errors": 0}

    def test_recent_unclaimed_file_is_skipped(self):
        # 1 hour old — well inside ORPHAN_TTL — must NOT be deleted.
        assert ORPHAN_TTL > timedelta(hours=1)
        recent = datetime.now(timezone.utc) - timedelta(hours=1)
        client, removed = _make_client(
            posts_rows=[],
            listings={
                MANUAL_UPLOAD_PREFIX: [{"name": "user-bob", "id": None}],
                f"{MANUAL_UPLOAD_PREFIX}/user-bob": [
                    {"name": "fresh.mp4", "id": "f2", "created_at": _iso(recent)},
                ],
            },
        )

        counts = _cleanup_orphans(client)

        assert removed == []
        assert counts == {"deleted": 0, "skipped_recent": 1, "errors": 0}

    def test_claimed_file_is_protected_even_when_old(self):
        # File is old enough to qualify by age, but a posts row claims
        # it via media_urls — we must NOT delete.
        old = datetime.now(timezone.utc) - timedelta(days=7)
        claimed_path = f"{MANUAL_UPLOAD_PREFIX}/user-carol/keep.mp4"
        client, removed = _make_client(
            posts_rows=[{"media_urls": [claimed_path]}],
            listings={
                MANUAL_UPLOAD_PREFIX: [{"name": "user-carol", "id": None}],
                f"{MANUAL_UPLOAD_PREFIX}/user-carol": [
                    {"name": "keep.mp4", "id": "f3", "created_at": _iso(old)},
                ],
            },
        )

        counts = _cleanup_orphans(client)

        assert removed == []
        assert counts == {"deleted": 0, "skipped_recent": 0, "errors": 0}

    def test_storage_remove_error_is_counted_not_raised(self):
        old = datetime.now(timezone.utc) - timedelta(hours=48)
        bad_path = f"{MANUAL_UPLOAD_PREFIX}/user-dan/broken.mp4"
        client, removed = _make_client(
            posts_rows=[],
            listings={
                MANUAL_UPLOAD_PREFIX: [{"name": "user-dan", "id": None}],
                f"{MANUAL_UPLOAD_PREFIX}/user-dan": [
                    {"name": "broken.mp4", "id": "f4", "created_at": _iso(old)},
                ],
            },
            remove_errors={bad_path},
        )

        counts = _cleanup_orphans(client)

        # remove_side_effect raises, so the file isn't appended to removed.
        # We just need to confirm the error was counted and the cron
        # didn't crash.
        assert counts["errors"] == 1
        assert counts["deleted"] == 0

    def test_mixed_state_with_multiple_users(self):
        old = datetime.now(timezone.utc) - timedelta(hours=48)
        recent = datetime.now(timezone.utc) - timedelta(hours=1)
        keep_path = f"{MANUAL_UPLOAD_PREFIX}/user-eve/keep.mp4"
        reap_path = f"{MANUAL_UPLOAD_PREFIX}/user-eve/reap.mp4"

        client, removed = _make_client(
            posts_rows=[{"media_urls": [keep_path]}],
            listings={
                MANUAL_UPLOAD_PREFIX: [
                    {"name": "user-eve", "id": None},
                    {"name": "user-frank", "id": None},
                ],
                f"{MANUAL_UPLOAD_PREFIX}/user-eve": [
                    {"name": "keep.mp4", "id": "f5", "created_at": _iso(old)},
                    {"name": "reap.mp4", "id": "f6", "created_at": _iso(old)},
                ],
                f"{MANUAL_UPLOAD_PREFIX}/user-frank": [
                    {"name": "defer.mp4", "id": "f7", "created_at": _iso(recent)},
                ],
            },
        )

        counts = _cleanup_orphans(client)

        assert removed == [reap_path]
        assert counts == {"deleted": 1, "skipped_recent": 1, "errors": 0}

    def test_empty_folder_placeholder_is_ignored(self):
        # Supabase Storage emits .emptyFolderPlaceholder rows for paths
        # that exist as a prefix but have no real children. We must
        # not try to delete or list those.
        client, removed = _make_client(
            posts_rows=[],
            listings={
                MANUAL_UPLOAD_PREFIX: [
                    {"name": ".emptyFolderPlaceholder", "id": "x"},
                ],
            },
        )

        counts = _cleanup_orphans(client)

        assert removed == []
        assert counts == {"deleted": 0, "skipped_recent": 0, "errors": 0}
