"""One-off script: queue a local video for Jazmin's Instagram + TikTok Crosspost.

Usage:
  python -m scripts.queue_jazmin_post /path/to/video.mp4 "Caption text here"
  python -m scripts.queue_jazmin_post /path/to/video.mp4 --tema "como ahorrar en dolares"

What it does:
  1. Uploads the video to Supabase Storage (bucket: media).
  2. Gets a 1-hour signed URL Buffer can fetch it from (Buffer downloads
     immediately on createPost, so 1 hour is plenty).
  3. Inserts a posts row + a schedules row (scheduled_for=now) for both
     "instagram" and "tiktok".

Caption: pass it directly as the second argument, or pass --tema "de que
trata el video" to have Claude (ANTHROPIC_API_KEY) sugerir un caption en
espanol que puedes aceptar, regenerar o editar antes de continuar.

This is a manual stand-in for what an automated content pipeline would do
(see cron/tiktok_pipeline.py for how Alex's automated version works).
Jazmin's content is manually produced/edited, so there's no automatic
trigger yet -- run this by hand each time a video is ready to post.

After running this, either run the two crons manually to publish right away:
  python -m cron.jazmin_instagram_cron
  python -m cron.jazmin_tiktok_cron
or wait for Render to run them on their schedule (once registered).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import uuid
from datetime import datetime, time, timezone

from core.database import insert_post, insert_schedule
from core.media import get_signed_url, upload_to_storage
from core.models import Post

# Matches DD-MM-YYYY at the very start of the filename, e.g.
# "10-07-2026_reel-jazmin.mp4" -- the naming convention Jazmin uses to mark
# the intended publish date. Requires day-month-year in that order (not
# month-day) to match how she names files.
_DATE_PREFIX_RE = re.compile(r"^(\d{2})-(\d{2})-(\d{4})")

# Default time-of-day applied to a date parsed from the filename (the
# filename only carries a date, not a time). UTC. Adjust here if a
# different default posting time is wanted later.
_DEFAULT_DUE_TIME_UTC = time(15, 0)


def parse_due_date(filename: str) -> datetime | None:
    """Extract a DD-MM-YYYY date from the start of a filename.

    Returns a UTC datetime at _DEFAULT_DUE_TIME_UTC on that date, or None
    if the filename doesn't start with a recognizable date.
    """
    match = _DATE_PREFIX_RE.match(os.path.basename(filename))
    if not match:
        return None
    day, month, year = (int(g) for g in match.groups())
    try:
        return datetime.combine(
            datetime(year, month, day).date(), _DEFAULT_DUE_TIME_UTC, tzinfo=timezone.utc
        )
    except ValueError:
        # Matched the pattern but not a real calendar date (e.g. 31-02-2026)
        return None

# Images post to Instagram only -- our TikTok adapter (platforms/tiktok.py)
# only exercises Buffer's video path; TikTok photo-mode posting via Buffer
# hasn't been tested, so we don't queue images there yet.
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def generate_caption(tema: str) -> str:
    """Pide a Claude una sugerencia de caption en espanol para el video."""
    try:
        import anthropic
    except ImportError:
        sys.exit(
            "Falta el paquete 'anthropic'. Instalalo con:\n"
            "  pip3 install anthropic"
        )

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit(
            "ANTHROPIC_API_KEY no esta configurada en tu .env. Agregala o usa "
            "un caption manual en vez de --tema."
        )

    client = anthropic.Anthropic(api_key=api_key)
    prompt = (
        "Escribe una descripcion (caption) corta en espanol para un Reel de "
        "Instagram/TikTok de Jazmin Bautista, educadora financiera para "
        "inmigrantes latinos en Estados Unidos (finanzasparamislatinos). "
        f"El video trata sobre: {tema}. "
        "Tono: cercano, motivador, claro, sin tecnicismos. "
        "Incluye un gancho en la primera linea, 2-3 lineas de contexto o "
        "valor, una llamada a la accion (seguir, comentar o guardar), y "
        "termina con 5 a 8 hashtags relevantes en espanol e ingles. "
        "Maximo 150 palabras. Responde unicamente con el caption, sin "
        "explicaciones adicionales ni comillas."
    )
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


def prompt_for_caption(tema: str) -> str:
    """Genera un caption con Claude y permite aceptarlo, regenerarlo o editarlo."""
    while True:
        print(f"\nGenerando sugerencia de caption con Claude para: {tema!r} ...\n")
        suggestion = generate_caption(tema)
        print("--- Sugerencia de caption ---")
        print(suggestion)
        print("-----------------------------")
        choice = input(
            "\n[Enter] usar esta / 'r' para regenerar / 'm' para escribirla manualmente: "
        ).strip().lower()
        if choice == "r":
            continue
        if choice == "m":
            return input("Escribe tu caption: ").strip()
        return suggestion


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("media_path", help="Path to the local video or image file")
    parser.add_argument(
        "caption",
        nargs="?",
        default=None,
        help="Caption text for the post (omite este argumento y usa --tema para que Claude lo sugiera)",
    )
    parser.add_argument(
        "--tema",
        default=None,
        help="Tema del video para que Claude sugiera el caption automaticamente",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.media_path):
        sys.exit(f"File not found: {args.media_path}")

    if args.caption:
        caption = args.caption
    elif args.tema:
        caption = prompt_for_caption(args.tema)
    else:
        sys.exit(
            'Debes pasar un caption manual o --tema "de que trata el video" '
            "para que Claude lo sugiera."
        )

    ext = os.path.splitext(args.media_path)[1].lower()
    if ext in IMAGE_EXTENSIONS:
        media_type = "image"
        platforms = ["instagram"]
    elif ext in VIDEO_EXTENSIONS:
        media_type = "video"
        platforms = ["instagram", "tiktok"]
    else:
        sys.exit(f"Unrecognized file type: {ext}")

    storage_path = f"jazmin/{uuid.uuid4().hex}{ext}"

    print(f"Uploading {args.media_path} ({media_type}) -> media/{storage_path} ...")
    upload_to_storage(args.media_path, storage_path)

    media_url = get_signed_url(storage_path, expires_in=3600)
    print(f"Signed URL (valid 1h): {media_url}")

    due_at = parse_due_date(args.media_path)
    metadata = {"source": "jazmin_manual_queue"}
    if due_at:
        # Buffer rejects a dueAt that's already in the past (confirmed live:
        # "Invalid post input: dueAt must be in the future") -- this bites
        # same-day content queued after the default time-of-day. Bump it
        # a few minutes into the future so it's still accepted; the post
        # still lands as a draft either way, so this only affects the
        # "Tentative" time shown in Buffer, not whether it auto-publishes.
        now = datetime.now(timezone.utc)
        if due_at <= now:
            from datetime import timedelta
            adjusted = now + timedelta(minutes=5)
            print(f"La fecha detectada ({due_at.isoformat()}) ya paso -- ajustando a {adjusted.isoformat()}")
            due_at = adjusted

        # save_to_draft=True by default: the post lands in Buffer's Drafts
        # tab with due_at shown as a tentative time, and nothing actually
        # publishes until it's manually approved ("Schedule Post") in
        # Buffer. Confirmed via a live test on 2026-07-04.
        metadata["due_at"] = due_at.isoformat()
        metadata["save_to_draft"] = True
        print(f"Fecha final para Buffer: {due_at.isoformat()} (se enviara como borrador)")
    else:
        print("No se detecto fecha DD-MM-AAAA en el nombre del archivo -- se enviara sin due_at (Buffer usara su proxima hora de cola).")

    for platform in platforms:
        post = Post(
            platform=platform,
            media_type=media_type,
            media_urls=[media_url],
            caption=caption,
            hashtags=[],
            metadata=metadata,
        )
        post_id = insert_post(post)
        # Our own internal schedule is separate from Buffer's due_at -- this
        # just controls when OUR cron picks it up and hands it to Buffer.
        # Since save_to_draft holds it in Buffer regardless, there's no
        # reason to delay our own pickup: process it right away.
        insert_schedule(post_id, datetime.now(timezone.utc))
        print(f"Queued for {platform}: post {post_id}")

    print("\nDone. Run the crons to publish now:")
    for platform in platforms:
        print(f"  python -m cron.jazmin_{platform}_cron")


if __name__ == "__main__":
    main()
