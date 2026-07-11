"""One-off script: set a custom YouTube thumbnail for a specific video.

Usage:
  python3 -m scripts.set_youtube_thumbnail "<texto del titulo actual>" /ruta/al/thumbnail.png

Busca, entre tus videos Private (borradores -- incluye los que todavia
tienen el titulo placeholder = nombre de archivo, antes de que el cron les
ponga titulo en espanol), uno cuyo titulo contenga el texto dado, y le
aplica la imagen como thumbnail.

Ejemplo, para el Clip#01 de "El mercado en 2026":
  python3 -m scripts.set_youtube_thumbnail "Clip#01" ~/Downloads/"Clip1.Vendiste en panico.png"

Si mas de un video coincide con el texto, el script se detiene y lista los
titulos encontrados -- usa un pedazo mas largo/unico del nombre de archivo
para desambiguar.

Compresion automatica: YouTube exige que los thumbnails pesen 2MB o menos.
Los PNG exportados de Canva suelen pesar 3-4MB, asi que si la imagen pasa
de 2MB este script la convierte a JPEG y prueba calidades decrecientes (y,
si hiciera falta, reduce el ancho a 1280px) hasta quedar bajo el limite --
sin tocar el archivo original.

Requiere Pillow (para la compresion): pip install Pillow --break-system-packages
"""

from __future__ import annotations

import argparse
import os
import sys

from platforms.youtube import YouTube
from scripts._youtube_thumbnail_utils import compress_thumbnail_to_fit

_MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "title_substring", help="Texto que debe aparecer en el titulo actual del video"
    )
    parser.add_argument("thumbnail_path", help="Ruta local a la imagen de thumbnail")
    args = parser.parse_args()

    if not os.path.isfile(args.thumbnail_path):
        sys.exit(f"Archivo no encontrado: {args.thumbnail_path}")

    yt = YouTube()
    yt.refresh_credentials()

    print(f"Buscando video Private con {args.title_substring!r} en el titulo ...")
    videos = yt.list_my_private_videos()
    needle = args.title_substring.lower()
    matches = [v for v in videos if needle in v.title.lower()]

    if not matches:
        sys.exit(
            f"No encontre ningun video Private cuyo titulo contenga "
            f"{args.title_substring!r}. Revisa el texto, o confirma que el "
            "video ya termino de subir (puede tardar unos minutos en "
            "aparecer en la lista tras la subida)."
        )
    if len(matches) > 1:
        print(f"Encontre {len(matches)} videos que coinciden con {args.title_substring!r}:")
        for v in matches:
            print(f"  - {v.video_id}: {v.title!r}")
        sys.exit("Se mas especifica -- usa un pedazo mas largo/unico del nombre de archivo.")

    video = matches[0]
    print(f"Video encontrado: {video.video_id} -- {video.title!r}")

    file_size = os.path.getsize(args.thumbnail_path)
    upload_path = args.thumbnail_path
    if file_size > _MAX_THUMBNAIL_BYTES:
        print(
            f"Imagen pesa {file_size / (1024 * 1024):.1f} MB "
            f"(limite de YouTube: 2MB) -- comprimiendo ..."
        )
        upload_path = compress_thumbnail_to_fit(args.thumbnail_path)

    yt.set_thumbnail(video.video_id, upload_path)
    print(f"Thumbnail aplicado correctamente a {video.video_id} ({video.title!r}).")


if __name__ == "__main__":
    main()
