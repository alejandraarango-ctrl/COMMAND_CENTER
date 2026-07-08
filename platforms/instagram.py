"""Instagram platform adapter — posts to Instagram via Buffer's GraphQL API.

Mirrors platforms/threads.py's Buffer-backed pattern, but for media posts
(video Reels) instead of text-only content. Uses core/buffer.py's generic
get_channel_id + send_to_buffer helpers -- those already handle media URLs,
retries, and rate limiting, so this adapter is a thin wrapper around them.

Required env vars:
  BUFFER_ACCESS_TOKEN  — OAuth token for Buffer's API
  BUFFER_ORG_ID        — Buffer organization ID
"""

import logging
from datetime import datetime

from core.buffer import get_channel_id, send_to_buffer
from core.exceptions import PlatformAPIError
from core.models import MediaUploadResult, Post
from platforms.base import PlatformBase

logger = logging.getLogger(__name__)


class Instagram(PlatformBase):
    name = "instagram"

    # create_post only hands the post to Buffer's queue -- it isn't live yet.
    # The scheduler marks it 'sent_to_buffer' and cron/buffer_reconcile.py
    # confirms it later. Same pattern as Threads and the tweet-card fan-out.
    publishes_via_buffer = True

    def __init__(self, channel_name: str | None = None) -> None:
        # channel_name disambiguates if a Buffer org ever has more than one
        # Instagram channel connected. Jazmin's org has exactly one, so the
        # default (None) is fine.
        self._channel_name = channel_name

    def validate_config(self) -> None:
        self._check_env_vars("BUFFER_ACCESS_TOKEN", "BUFFER_ORG_ID")

    def refresh_credentials(self) -> None:
        """No-op — Buffer tokens are long-lived and don't need refreshing."""
        return

    def validate_credentials(self) -> bool:
        try:
            get_channel_id(service="instagram", name=self._channel_name)
            return True
        except Exception:
            return False

    def create_post(self, post: Post) -> str:
        if not post.media_urls:
            raise PlatformAPIError("Instagram post has no media_urls", status_code=400)
        channel_id = get_channel_id(service="instagram", name=self._channel_name)
        media_url = post.media_urls[0]
        media_type = post.media_type or "video"
        caption = post.caption or post.title or ""
        # Buffer requires every Instagram post to declare its type -- confirmed
        # by a live test that failed with "Instagram posts require a type
        # (post, story, or reel)." Videos go to Reels; anything else (a
        # static image, e.g. the Resultados Comunidad carrusel format) goes
        # to a normal feed post.
        instagram_post_type = "reel" if media_type == "video" else "post"

        # due_at / save_to_draft come from post.metadata -- set by
        # scripts/queue_jazmin_post.py when it parses a DD-MM-YYYY date out
        # of the source filename. Confirmed live: save_to_draft=True lands
        # the post in Buffer's Drafts tab (not Queue, not auto-published)
        # with the due_at shown as a "Tentative" time, requiring a manual
        # click on "Schedule Post" before it actually goes out.
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
            instagram_post_type=instagram_post_type,
            caption_limit=2200,
            due_at=due_at,
            save_to_draft=save_to_draft,
        )

    def buffer_replay(self, post: Post) -> dict:
        return {"channel_id": get_channel_id(service="instagram", name=self._channel_name)}

    def upload_media(self, local_path: str, media_type: str) -> MediaUploadResult:
        # Buffer accepts media by URL (Supabase signed URL), not local upload.
        return MediaUploadResult(
            platform_media_id=None,
            metadata={"note": "media sent by URL via Buffer, no local upload step"},
        )

    def get_media_constraints(self) -> dict:
        return {
            "max_video_duration_sec": 90,
            "max_file_size_mb": 1024,
            "supported_video_formats": ["mp4", "mov"],
            "aspect_ratios": ["9:16"],
            "max_caption_length": 2200,
        }
