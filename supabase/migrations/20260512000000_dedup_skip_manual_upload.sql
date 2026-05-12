-- The dedup unique index added in 20260412105433_rls_and_dedup.sql exists
-- to stop cron-driven retries from double-posting the same caption. That
-- guarantee makes sense for scheduled posts but is actively harmful for
-- the manual TikTok upload pathway (Pathway 3): the user explicitly
-- clicks Upload for each file, often with the same caption when batch-
-- testing or re-uploading variants of the same video. Hitting a 409 on
-- the second click breaks the queue UX.
--
-- This migration recreates the partial unique index with an extra WHERE
-- clause excluding rows where metadata.source = 'manual_upload'. The
-- cron-side dedup guarantee is preserved (those rows don't set
-- metadata.source = 'manual_upload'), while manual uploads can now share
-- captions across as many TikTok / YouTube / LinkedIn posts as the user
-- wants.
--
-- Why drop+create rather than ALTER: PostgreSQL has no syntax for
-- editing the WHERE predicate of an existing partial index. The new
-- index is created first under a temporary name, then we swap and drop
-- the old one. This minimises the window where dedup is unenforced —
-- during the swap, both indexes exist, so writes still get checked.

CREATE UNIQUE INDEX idx_posts_platform_caption_dedup_v2
    ON posts (platform, md5(caption))
    WHERE status NOT IN ('failed', 'buffer_error')
      AND coalesce(metadata->>'source', '') <> 'manual_upload';

DROP INDEX idx_posts_platform_caption_dedup;

ALTER INDEX idx_posts_platform_caption_dedup_v2
    RENAME TO idx_posts_platform_caption_dedup;
