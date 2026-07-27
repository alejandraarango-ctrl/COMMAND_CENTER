"""Facebook platform adapter — posts to Facebook via Buffer's GraphQL API.

Mirrors platforms/instagram.py's Buffer-backed pattern. Used to cross-post
Jazmin's reels and "frase" quote images to her Facebook Page
(https://www.facebook.com/jazmin.bautista.12382/) alongside Instagram and
TikTok.

Required env vars:
  BUFFER_ACCESS_TOKEN  — OAuth token for Buffer's API
  BUFFER_ORG_ID        — Buffer organization ID

Note: the Buffer organization behind this pipeline also hosts channels for
Alex's and Leila's content (see cron/tiktok_pipeline.py, cron/_tweet_card_legs.py).
If that org ever has more than one Facebook Page connected, pass
`channel_name` (matching the Page's name as shown in Buffer) to disambiguate
-- otherwise `get_channel_id` may resolve to the wrong creator's Page. Confirm
in Buffer (buffer.com -> Channels) which name corresponds to Jazmin's Page
before relying on the default (None).
"""
from __future__ import annotations

import logging
from datetime import datetime

from core.buffer import get_channel_id, send_to_buffer
from core.exceptions import PlatformAPIError
from core.models import MediaUploadResult, Post
from platforms.base import PlatformBase

logger = logging.getLogger(__name__)


class Facebook(PlatformBase):
    name = "facebook"

    # create_post only hands the post to Buffer's queue -- it isn't live yet.
    # The scheduler marks it 'sent_to_buffer' and cron/buffer_reconcile.py
    # confirms it later. Same pattern as Instagram and TikTok.
    publishes_via_buffer = True

    def __init__(self, channel_name: str | None = None) -> None:
        # channel_name disambiguates if the Buffer org has more than one
        # Facebook Page connected (it's shared with Alex's/Leila's
        # pipelines) -- see module docstring. Pass Jazmin's Page name here
        # once confirmed in Buffer if the org ever has more than one.
        self._channel_name = channel_name

    def validate_config(self) -> None:
        self._check_env_vars("BUFFER_ACCESS_TOKEN", "BUFFER_ORG_ID")

    def refresh_credentials(self) -> None:
        """No-op — Buffer tokens are long-lived and don't need refreshing."""
        return

    def validate_credentials(self) -> bool:
        try:
            get_channel_id(service="facebook", name=self._channel_name)
            return True
        except Exception:
            return False

    def create_post(self, post: Post) -> str:
        if not post.media_urls:
            raise PlatformAPIError("Facebook post has no media_urls", status_code=400)
        channel_id = get_channel_id(service="facebook", name=self._channel_name)
        media_url = post.media_urls[0]
        media_type = post.media_type or "video"
        caption = post.caption or post.title or ""
        # Buffer requires a Facebook post type ("post", "story", or "reel" --
        # confirmed via dashboard/src/lib/buffer.ts's facebookPostType type
        # and cron/_tweet_card_legs.py's usage). Vertical video reels (the
        # same clips already going to Instagram Reels/TikTok) map to
        # Facebook's Reels tab; a static "frase" image is a normal feed post.
        facebook_post_type = "reel" if media_type == "video" else "post"

        # due_at / save_to_draft come from post.metadata -- set by
        # scripts/queue_jazmin_post.py when it parses a DD-MM-YYYY date out
        # of the source filename. Same contract as platforms/instagram.py.
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
            facebook_post_type=facebook_post_type,
            caption_limit=2200,
            due_at=due_at,
            save_to_draft=save_to_draft,
        )

    def buffer_replay(self, post: Post) -> dict:
        return {"channel_id": get_channel_id(service="facebook", name=self._channel_name)}

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
