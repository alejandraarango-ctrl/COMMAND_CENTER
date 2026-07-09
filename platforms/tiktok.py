"""TikTok platform adapter — posts to TikTok via Buffer's GraphQL API.

Previously this file was an unused stub reserved for a hypothetical direct
TikTok API integration (see git history / CLAUDE.md for that plan). Alex's
production pipeline (cron/tiktok_pipeline.py) also bypasses this class and
calls core/buffer.py directly inline. For Jazmin's simpler "crosspost an
already-produced video" use case, we want the generic
core.scheduler.process_due_posts flow to work, so this file now implements
a real Buffer-backed adapter -- same pattern as platforms/threads.py and
platforms/instagram.py.

Required env vars:
  BUFFER_ACCESS_TOKEN  — OAuth token for Buffer's API
  BUFFER_ORG_ID        — Buffer organization ID
"""
from __future__ import annotations

import logging
from datetime import datetime

from core.buffer import get_channel_id, send_to_buffer
from core.exceptions import PlatformAPIError
from core.models import MediaUploadResult, Post
from platforms.base import PlatformBase

logger = logging.getLogger(__name__)


class TikTok(PlatformBase):
    name = "tiktok"

    publishes_via_buffer = True

    def __init__(self, channel_name: str | None = None) -> None:
        self._channel_name = channel_name

    def validate_config(self) -> None:
        self._check_env_vars("BUFFER_ACCESS_TOKEN", "BUFFER_ORG_ID")

    def refresh_credentials(self) -> None:
        """No-op — Buffer tokens are long-lived and don't need refreshing."""
        return

    def validate_credentials(self) -> bool:
        try:
            get_channel_id(service="tiktok", name=self._channel_name)
            return True
        except Exception:
            return False

    def create_post(self, post: Post) -> str:
        if not post.media_urls:
            raise PlatformAPIError("TikTok post has no media_urls", status_code=400)
        channel_id = get_channel_id(service="tiktok", name=self._channel_name)
        media_url = post.media_urls[0]
        media_type = post.media_type or "video"
        caption = post.caption or post.title or ""
        # See platforms/instagram.py for why due_at/save_to_draft come from
        # post.metadata rather than being adapter-level config.
        due_at = None
        due_at_raw = (post.metadata or {}).get("due_at")
        if due_at_raw:
            due_at = datetime.fromisoformat(due_at_raw)
        save_to_draft = bool((post.metadata or {}).get("save_to_draft", False))

        return send_to_buffer(
            channel_id,
            caption,
            media_url,
            media_type=media_type,
            # send_to_buffer defaults caption_limit to TikTok's 150-char cap
            # already -- no override needed here.
            due_at=due_at,
            save_to_draft=save_to_draft,
        )

    def buffer_replay(self, post: Post) -> dict:
        return {"channel_id": get_channel_id(service="tiktok", name=self._channel_name)}

    def upload_media(self, local_path: str, media_type: str) -> MediaUploadResult:
        return MediaUploadResult(
            platform_media_id=None,
            metadata={"note": "media sent by URL via Buffer, no local upload step"},
        )

    def get_media_constraints(self) -> dict:
        return {
            "max_video_duration_sec": 600,
            "max_file_size_mb": 287,
            "supported_video_formats": ["mp4", "webm"],
            "aspect_ratios": ["9:16"],
            "max_caption_length": 150,
        }
