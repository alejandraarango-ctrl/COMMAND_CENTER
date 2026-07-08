"""TikTok publisher cron for Jazmin — claims due schedules, posts via Buffer.

Same shape as cron/jazmin_instagram_cron.py, targeting the "tiktok" queue.
"""

import logging
import sys

from core.database import log_cron_finish, log_cron_start
from core.env_diag import log_env_diagnostics
from core.scheduler import process_due_posts
from platforms.tiktok import TikTok

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> None:
    log_env_diagnostics(
        "jazmin-tiktok-cron",
        required=["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "BUFFER_ACCESS_TOKEN", "BUFFER_ORG_ID"],
    )

    client = TikTok()
    client.validate_config()

    run_id = log_cron_start(platform="tiktok", job_type="post")
    try:
        processed = process_due_posts(client, "tiktok")
        log_cron_finish(run_id, status="success", posts_processed=processed)
        logger.info("TikTok publish complete: %d posts processed", processed)
    except Exception as e:
        safe_msg = client.sanitize_error(e)
        logger.error("TikTok publish failed: %s", safe_msg, exc_info=True)
        log_cron_finish(run_id, status="failed", error_message=safe_msg)
        sys.exit(1)


if __name__ == "__main__":
    main()
