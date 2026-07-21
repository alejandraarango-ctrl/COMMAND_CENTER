"""One-off script: queue a local video for Jazmin's Instagram + TikTok Crosspost.

Usage:
  python -m scripts.queue_jazmin_post /path/to/video.mp4 "Caption text here"
  python -m scripts.queue_jazmin_post /path/to/video.mp4
  python -m scripts.queue_jazmin_post /path/to/video.mp4 --tema "como ahorrar en dolares"

What it does:
  1. Uploads the video to Supabase Storage (bucket: media).
  2. Gets a 1-hour signed URL Buffer can fetch it from (Buffer downloads
     immediately on createPost, so 1 hour is plenty).
  3. Inserts a posts row + a schedules row (scheduled_for=now) for both
     "instagram" and "tiktok".

Caption: pass it directly as the second argument, or omit it entirely --
Claude will look at the actual video/image (extracting a few frames via
ffmpeg for video) and write a caption suggestion in Spanish, which you can
accept, regenerate, or edit before continuing. Pass --tema "de que trata el
video" to give Claude extra context alongside what it sees.

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
import base64
import os
import re
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, time, timezone

from core.database import insert_post, insert_schedule
from core.media import get_signed_url, upload_to_storage
from core.models import Post
from platforms.youtube import YouTube

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

_IMAGE_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
}


def _get_video_duration(video_path: str) -> float:
    """Duracion del video en segundos, via ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", video_path,
        ],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def extract_video_frames(video_path: str, count: int = 5) -> list[bytes]:
    """Extrae `count` fotogramas distribuidos a lo largo del video con ffmpeg."""
    try:
        duration = _get_video_duration(video_path)
    except FileNotFoundError:
        sys.exit(
            "No se encontro ffmpeg/ffprobe. Instalalo con:\n"
            "  brew install ffmpeg"
        )
    except (subprocess.CalledProcessError, ValueError):
        sys.exit(f"No se pudo leer la duracion del video: {video_path}")

    frames: list[bytes] = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for i in range(count):
            timestamp = duration * (i + 0.5) / count
            frame_path = os.path.join(tmpdir, f"frame_{i}.jpg")
            subprocess.run(
                [
                    "ffmpeg", "-y", "-ss", f"{timestamp:.2f}", "-i", video_path,
                    "-frames:v", "1", "-q:v", "3", frame_path,
                ],
                capture_output=True, check=True,
            )
            with open(frame_path, "rb") as f:
                frames.append(f.read())
    return frames


def _load_anthropic_client():
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
            "ANTHROPIC_API_KEY no esta configurada en tu .env. Agregala o "
            "pasa un caption manual como segundo argumento."
        )
    return anthropic.Anthropic(api_key=api_key)


_COMMUNITY_CTA_INSTRUCTION = (
    "El caption SIEMPRE debe incluir, ademas de -- no en vez de -- cualquier "
    "otra llamada a la accion, una linea pidiendo comentar una palabra clave "
    "para dar el siguiente paso. Cual palabra depende del tipo de contenido "
    "que ves en los fotogramas (o del contexto adicional dado, si lo hay):\n"
    "- Si el reel es de una llamada/entrevista 1:1 donde Jazmin explica o "
    "revisa el portafolio personalizado de un cliente (se ve una "
    "conversacion uno a uno analizando acciones, ETFs o el portafolio "
    "especifico de esa persona -- contenido tipo consultoria individual), "
    "el CTA debe pedir comentar la palabra 'AVANZADO' para recibir una "
    "asesoria personalizada con Jazmin (por ejemplo: \"Comenta 'AVANZADO' "
    "si quieres una asesoria personalizada con Jazmin para armar tu "
    "portafolio\").\n"
    "- Para cualquier otro contenido (educativo general, tips, noticias del "
    "mercado, contenido para principiantes -- es decir, todo lo que no sea "
    "una asesoria 1:1 de portafolio), el CTA debe pedir comentar "
    "'COMUNIDAD' o 'INVERTIR' para unirse a la comunidad gratuita y "
    "aprender a invertir paso a paso (por ejemplo: \"Comenta 'COMUNIDAD' si "
    "quieres unirte gratis y aprender a invertir paso a paso\", o \"Escribe "
    "'INVERTIR' y te comparto como unirte\").\n"
    "Usa solo UNA de las dos segun aplique -- nunca las dos a la vez. Esta "
    "CTA (una de las dos) es obligatoria en todos los captions generados "
    "para Instagram y TikTok."
)

_CAPTION_INSTRUCTIONS = (
    "Tono: cercano, motivador, claro, sin tecnicismos. Incluye un gancho en "
    "la primera linea, 2-3 lineas de contexto o valor, una llamada a la "
    "accion (seguir, comentar o guardar), y termina con 5 a 8 hashtags "
    "relevantes en espanol e ingles. " + _COMMUNITY_CTA_INSTRUCTION + " "
    "Maximo 150 palabras. Responde unicamente con el caption, sin "
    "explicaciones adicionales ni comillas."
)


def generate_caption_from_media(media_path: str, media_type: str, tema: str | None = None) -> str:
    """Analiza el video/imagen (vision) y genera una sugerencia de caption."""
    client = _load_anthropic_client()

    if media_type == "video":
        print("Extrayendo fotogramas del video con ffmpeg...")
        images = extract_video_frames(media_path, count=5)
        mime_type = "image/jpeg"
    else:
        with open(media_path, "rb") as f:
            images = [f.read()]
        ext = os.path.splitext(media_path)[1].lower()
        mime_type = _IMAGE_MIME_TYPES.get(ext, "image/jpeg")

    content: list[dict] = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": mime_type,
                "data": base64.standard_b64encode(img_bytes).decode("utf-8"),
            },
        }
        for img_bytes in images
    ]

    instruction = (
        "Estas viendo fotogramas de un Reel/post de Instagram y TikTok de "
        "Jazmin Bautista, educadora financiera para inmigrantes latinos en "
        "Estados Unidos (finanzasparamislatinos). Identifica de que trata "
        "el contenido a partir de lo que aparece en pantalla (texto en "
        "pantalla, graficas, escenas) y escribe una descripcion (caption) "
        "corta en espanol para acompanarlo. "
    )
    if tema:
        instruction += f"Contexto adicional dado por el equipo: {tema}. "
    instruction += _CAPTION_INSTRUCTIONS
    content.append({"type": "text", "text": instruction})

    print("Generando sugerencia de caption con Claude...")
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=400,
        messages=[{"role": "user", "content": content}],
    )
    return message.content[0].text.strip()


def prompt_for_caption(media_path: str, media_type: str, tema: str | None = None) -> str:
    """Genera un caption (analizando el archivo) y permite aceptar, regenerar o editar."""
    while True:
        suggestion = generate_caption_from_media(media_path, media_type, tema)
        print("\n--- Sugerencia de caption ---")
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
        help="Caption text for the post (si se omite, Claude analiza el archivo y sugiere uno)",
    )
    parser.add_argument(
        "--tema",
        default=None,
        help="Contexto adicional sobre el video para ayudar a Claude a generar el caption",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.media_path):
        sys.exit(f"File not found: {args.media_path}")

    ext = os.path.splitext(args.media_path)[1].lower()
    if ext in IMAGE_EXTENSIONS:
        media_type = "image"
        platforms = ["instagram"]
    elif ext in VIDEO_EXTENSIONS:
        media_type = "video"
        platforms = ["instagram", "tiktok"]
    else:
        sys.exit(f"Unrecognized file type: {ext}")

    if args.caption:
        caption = args.caption
    else:
        caption = prompt_for_caption(args.media_path, media_type, args.tema)

    storage_path = f"jazmin/{uuid.uuid4().hex}{ext}"

    print(f"Uploading {args.media_path} ({media_type}) -> media/{storage_path} ...")
    upload_to_storage(args.media_path, storage_path)

    # Posts sit as Buffer drafts until Alejandra manually clicks "Schedule
    # Post" -- that can be hours or days after queuing, not the "immediate"
    # fetch a 1-hour signed URL assumes. A short-lived URL expires before
    # Buffer ever fetches the media, producing "Please update the media URL
    # to be publicly accessible" errors that "Retry Now" can't fix (it
    # retries the same dead URL). 7 days comfortably covers manual review.
    _SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600
    media_url = get_signed_url(storage_path, expires_in=_SIGNED_URL_TTL_SECONDS)
    print(f"Signed URL (valid 7 dias): {media_url}")

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

    # Cross-post reels to YouTube as Shorts. Videos only (images have no
    # Shorts equivalent) -- uploaded as a Private draft with just a
    # placeholder title; the next run of the YouTube studio-scheduler cron
    # picks it up, generates the real Spanish title/description from the
    # transcript, and schedules it, exactly like a manually-Studio-uploaded
    # reel. This costs YouTube quota (~1600 units/upload) so failures here
    # are reported but never block the Instagram/TikTok queueing above,
    # which already succeeded.
    if media_type == "video":
        placeholder_title = os.path.splitext(os.path.basename(args.media_path))[0]
        print(f"\nSubiendo tambien a YouTube como Short (borrador Private): {placeholder_title!r} ...")
        try:
            yt = YouTube()
            yt.refresh_credentials()
            video_id = yt.upload_video(args.media_path, title=placeholder_title)
            print(
                f"Subido a YouTube: video {video_id}. El cron de YouTube le "
                "pondra titulo/descripcion en espanol y lo programara en su "
                "proxima corrida."
            )
        except Exception as exc:
            print(
                f"AVISO: no se pudo subir a YouTube ({exc}). El post de "
                "Instagram/TikTok si quedo encolado correctamente -- puedes "
                "subir este video a YouTube Studio manualmente si quieres "
                "que tambien salga ahi."
            )

    print("\nDone. Run the crons to publish now:")
    for platform in platforms:
        print(f"  python -m cron.jazmin_{platform}_cron")


if __name__ == "__main__":
    main()
