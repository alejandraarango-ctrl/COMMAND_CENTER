"""One-off script: upload a local video directly to YouTube as a Private draft.

Usage:
  python -m scripts.queue_youtube_video /path/to/video.mp4

Use this for "Clip" and "Long" videos (Jazmin's YouTube-only content) that
you'd otherwise upload manually to YouTube Studio -- this does the exact
same thing via the API instead, so you don't have to open Studio yourself.

Reels don't need this script: scripts/queue_jazmin_post.py already
uploads reels to YouTube automatically as part of queuing them for
Instagram/TikTok. Use this one only for content that comes from the
YouTube Drive folder (Clips, Longs, or any other YouTube-only video).

Cost note: a direct upload costs YouTube ~1600 quota units (flat, regardless
of file size), same as the reel cross-post. Combined with the ~300 units
the next scheduling/titling cron run costs per video, that's roughly
1900 units per video -- against the default 10,000/day quota, that's a
firm ceiling of about 5 videos/day across everything routed through direct
upload (reels + Clips + Longs combined). Manually uploading through
YouTube Studio itself is still free of API quota if you ever need more
headroom in a single day.

What happens after this runs:
  - The video lands as a Private draft with this script's placeholder
    title (the filename, extension stripped).
  - If a thumbnail image for the same clip sits in the same folder as the
    video (matched by clip number in the filename -- see
    `scripts/_youtube_thumbnail_utils.py` for the exact patterns), it's
    applied automatically right after upload. No match, no ambiguous
    match (more than one candidate image), or no clip number in the
    filename (e.g. "Long" videos) all just skip this step quietly -- run
    `scripts/set_youtube_thumbnail.py` by hand afterward if you still want
    one applied.
  - The YouTube studio-scheduler cron picks it up on its next run,
    generates the real title (and, for Reels, description) in Spanish
    from the transcript.
  - Based on the filename: "Reel" gets scheduled automatically; "Clip"
    or "Long" gets titled/described and kept Private for you to publish
    manually whenever you're ready. Anything else defaults to the
    scheduled path -- keep using "Clip"/"Long"/"Reel" in filenames so it
    routes correctly.
"""

from __future__ import annotations

import argparse
import os
import sys

from platforms.youtube import YouTube
from scripts._youtube_thumbnail_utils import (
    compress_thumbnail_to_fit,
    find_matching_thumbnail,
)

_MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024


def _try_auto_thumbnail(yt: YouTube, video_id: str, media_path: str) -> None:
    """Best-effort: find and apply a matching local thumbnail. Never raises --
    a thumbnail failure shouldn't undo an already-successful video upload.
    """
    thumb_path = find_matching_thumbnail(media_path)
    if not thumb_path:
        print(
            "\nNo encontre un thumbnail que haga match automatico en la misma "
            "carpeta (o el nombre no tiene numero de clip, o hay mas de una "
            "imagen candidata). Si ya tienes uno listo, aplica lo con:\n"
            '  python3 -m scripts.set_youtube_thumbnail "TEXTO_DEL_TITULO" '
            '"/ruta/al/thumbnail.png"'
        )
        return

    print(f"\nThumbnail encontrado: {thumb_path!r} -- aplicando ...")
    try:
        upload_path = thumb_path
        if os.path.getsize(thumb_path) > _MAX_THUMBNAIL_BYTES:
            print(
                f"  Imagen pesa mas de 2MB (limite de YouTube) -- comprimiendo ..."
            )
            upload_path = compress_thumbnail_to_fit(thumb_path)
        yt.set_thumbnail(video_id, upload_path)
        print("Thumbnail aplicado correctamente.")
    except Exception as exc:
        print(f"AVISO: no se pudo aplicar el thumbnail automaticamente ({exc}).")
        print(
            "El video ya esta subido de todos modos -- puedes aplicar el "
            "thumbnail a mano despues con scripts/set_youtube_thumbnail.py."
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("media_path", help="Path to the local video file")
    args = parser.parse_args()

    if not os.path.isfile(args.media_path):
        sys.exit(f"File not found: {args.media_path}")

    title = os.path.splitext(os.path.basename(args.media_path))[0]
    print(f"Subiendo a YouTube como borrador Private: {title!r} ...")

    yt = YouTube()
    yt.refresh_credentials()
    video_id = yt.upload_video(args.media_path, title=title)

    print(f"Subido correctamente: video {video_id}")

    _try_auto_thumbnail(yt, video_id, args.media_path)

    print(
        "\nEl cron de YouTube (proxima corrida) le pondra titulo (y, si aplica, "
        "descripcion) en espanol, segun el nombre del archivo:"
    )
    print('  - Contiene "Reel"          -> se programa automaticamente')
    print('  - Contiene "Clip" o "Long" -> queda Private para que lo publiques tu')
    print(
        "\nSi quieres verlo de inmediato sin esperar al cron programado en Render:"
    )
    print("  python3 -m cron.youtube_cron")


if __name__ == "__main__":
    main()
