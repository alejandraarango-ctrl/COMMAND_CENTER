"""Logging filter that strips secrets from every record before it's emitted.

Cron jobs catch exceptions from HTTP clients (Buffer, Apify, Supabase Storage,
Google APIs). Those exceptions carry the failing request URL — which often
contains a signed token in the query string — and sometimes the full response
body. When a cron logs them with ``logger.error("...", e, exc_info=True)``,
both the message and the traceback are written to Render stdout verbatim.
Render's log shipping then makes that text durable, so a single bad publish
attempt can leak a credential into long-term storage.

This module installs a single ``logging.Filter`` on every handler of the root
logger. The filter pre-renders the formatted message and the exception
traceback, runs both through a redaction pass, and stores the sanitized text
back on the ``LogRecord`` so the handler's formatter never sees the original.

Why a filter on handlers (not on a logger):
    Python's logging propagates records up to ancestor loggers, but only
    handlers along the chain are invoked — the ancestor loggers' own filters
    are NOT re-applied during propagation. Attaching to handlers guarantees
    the filter runs on every record that's actually emitted, no matter which
    child logger produced it.
"""

from __future__ import annotations

import logging
import re
import traceback

# Three patterns cover the realistic leak surface for this project:
#   - "Bearer <token>"          : auth headers echoed in exception text.
#   - "?token=...&key=..."      : signed Supabase/Apify URLs in error bodies.
#   - 64+ char alphanumeric run : opaque API keys / JWTs not caught above.
# UUIDs (32 hex chars + 4 hyphens = 36 total) sit safely under the 64 char
# threshold so legitimate post IDs are never redacted.
_BEARER_RE = re.compile(r"Bearer\s+\S+")
_URL_SECRET_RE = re.compile(
    r"([?&](token|key|secret|api_key|apikey|access_token|refresh_token)=)[^\s&]+",
    re.IGNORECASE,
)
_LONG_TOKEN_RE = re.compile(r"[A-Za-z0-9_\-]{64,}")


def sanitize_log_text(text: str) -> str:
    """Redact bearer tokens, URL secrets, and long opaque keys from arbitrary text."""
    text = _BEARER_RE.sub("Bearer [REDACTED]", text)
    text = _URL_SECRET_RE.sub(r"\1[REDACTED]", text)
    text = _LONG_TOKEN_RE.sub("[REDACTED_KEY]", text)
    return text


class SanitizingLogFilter(logging.Filter):
    """Strip credentials from each LogRecord's message and attached traceback.

    Runs before a handler's formatter, so the formatted output a handler
    finally emits is already redacted. We rewrite the record in place:
      - ``record.msg`` is replaced with the fully %-substituted, sanitized
        text and ``record.args`` is cleared, so any later handler that calls
        ``record.getMessage()`` sees the already-sanitized form.
      - If ``exc_info`` is present, the traceback is pre-rendered, sanitized,
        and stashed on ``record.exc_text``. The standard ``Formatter.format()``
        path reuses ``exc_text`` when it's set, which means it skips its own
        traceback rendering and never sees the raw exception object.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        # Pre-render the message. ``getMessage`` may itself raise if the
        # caller passed mismatched %-args — fall back to ``str(msg)`` so a
        # bad log line never silently disappears.
        try:
            rendered = record.getMessage()
        except Exception:
            rendered = str(record.msg)
        record.msg = sanitize_log_text(rendered)
        record.args = None

        # Pre-render and sanitize the traceback. Setting ``exc_text``
        # short-circuits ``Formatter.formatException`` in the standard
        # library, so the raw ``exc_info`` tuple is never re-formatted by
        # any handler downstream.
        if record.exc_info:
            tb = "".join(traceback.format_exception(*record.exc_info))
            record.exc_text = sanitize_log_text(tb)
            record.exc_info = None
        elif record.exc_text:
            record.exc_text = sanitize_log_text(record.exc_text)

        return True


def install_log_sanitizer() -> None:
    """Attach :class:`SanitizingLogFilter` to every handler on the root logger.

    Idempotent: a second call is a no-op so callers can invoke it freely
    from each cron's ``main()`` without stacking duplicate filters.

    Must be called AFTER ``logging.basicConfig()`` (or any other handler
    setup) because we attach to existing handlers — a filter installed on
    a logger does not propagate to handlers attached on ancestor loggers.
    """
    root = logging.getLogger()
    for handler in root.handlers:
        if any(isinstance(f, SanitizingLogFilter) for f in handler.filters):
            continue
        handler.addFilter(SanitizingLogFilter())
