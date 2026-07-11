"""Shared helpers for matching a video file to its thumbnail image by clip number.

Used by both `scripts/queue_youtube_video.py` (automatic match right after
upload -- no command needed beyond the upload itself) and
`scripts/set_youtube_thumbnail.py` (manual, title-based lookup for videos
already uploaded, or for disambiguating when the automatic match fails).

Clip numbers show up inconsistently across Jazmin's file naming, so
`extract_clip_number` tries two patterns in order:

  1. A number immediately following the word "Clip" (optional space/"#"
     in between) -- covers both of these:
       "(10-07-2026)_YouTube_El mercado en 2026_Clip#01.mp4"  -> 1
       "Clip1.Vendiste en panico.png"                          -> 1
       "Clip 3. El Mercado Esta en Oferta.png"                 -> 3

  2. The LAST "#NN" anywhere in the filename -- covers naming where the
     ordinal is separated from the word "Clip" by other text:
       "(11-07-2026)_Clip_Class-June11_#02.mp4"                -> 2

Returns None if neither pattern matches (e.g. "Long" videos, which have
no clip number and are intentionally never auto-matched to a thumbnail --
Jazmin's "Long" thumbnails are still multiple undecided options in her
Drive "Thumbnail" folder, not a single settled file).
"""

from __future__ import annotations

import os
import re

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

_CLIP_NEAR_WORD_RE = re.compile(r"clip\s*#?\s*(\d+)", re.IGNORECASE)
_TRAILING_HASH_RE = re.compile(r"#(\d+)(?!.*\d)")


def extract_clip_number(filename: str) -> int | None:
    """Pull the clip ordinal out of a filename, or None if there isn't one.

    Strips the file extension first -- ".mp4" contains a literal digit
    ("4"), which broke the trailing-"#NN" fallback below (its "no more
    digits after this point" check saw the "4" in ".mp4" and refused to
    match what was actually the last real number in the name).
    """
    stem = os.path.splitext(filename)[0]
    m = _CLIP_NEAR_WORD_RE.search(stem)
    if m:
        return int(m.group(1))
    m = _TRAILING_HASH_RE.search(stem)
    if m:
        return int(m.group(1))
    return None


def find_matching_thumbnail(video_path: str, search_dir: str | None = None) -> str | None:
    """Look in `search_dir` (default: the video's own folder) for exactly
    one image file whose extracted clip number matches the video's.

    Returns the image path, or None if: the video's filename has no clip
    number (e.g. "Long"), no image in `search_dir` matches, or more than
    one image matches. The "more than one" case is deliberately treated
    as "don't guess" -- e.g. if both an "El mercado cae" Clip#02 thumbnail
    and an unrelated "Live Class" Clip#02 thumbnail happen to sit in the
    same folder, silently picking one would risk applying the wrong image.
    Callers should fall back to `scripts/set_youtube_thumbnail.py` (which
    reports the ambiguity explicitly) in that case.
    """
    clip_number = extract_clip_number(os.path.basename(video_path))
    if clip_number is None:
        return None

    directory = search_dir or os.path.dirname(video_path) or "."
    try:
        entries = os.listdir(directory)
    except OSError:
        return None

    candidates = []
    for entry in entries:
        ext = os.path.splitext(entry)[1].lower()
        if ext not in _IMAGE_EXTENSIONS:
            continue
        if extract_clip_number(entry) == clip_number:
            candidates.append(os.path.join(directory, entry))

    if len(candidates) == 1:
        return candidates[0]
    return None


def compress_thumbnail_to_fit(
    image_path: str,
    *,
    max_bytes: int = 2 * 1024 * 1024,
    target_width: int = 1280,
    quality_steps: tuple[int, ...] = (90, 80, 70, 60, 50, 40),
) -> str:
    """Return a path to a JPEG copy of image_path guaranteed to be <=max_bytes.

    Writes to a new temp file rather than mutating the original. Downsizes
    to `target_width` first if the image is wider than that (thumbnails
    don't need to be larger than YouTube's own 1280x720 recommendation),
    then steps down JPEG quality until the encoded size clears the limit.

    Imports Pillow lazily so callers that never hit an oversized image
    (rare, but possible if Jazmin exports a already-compressed thumbnail)
    don't need it installed.
    """
    import io
    import sys
    import tempfile

    from PIL import Image

    img = Image.open(image_path).convert("RGB")
    if img.width > target_width:
        ratio = target_width / img.width
        img = img.resize((target_width, int(img.height * ratio)))

    for quality in quality_steps:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        size = buf.tell()
        if size <= max_bytes:
            tmp = tempfile.NamedTemporaryFile(
                delete=False, suffix=".jpg", prefix="yt_thumb_"
            )
            tmp.write(buf.getvalue())
            tmp.close()
            print(f"  (comprimido a JPEG calidad={quality}, {size / 1024:.0f} KB)")
            return tmp.name

    sys.exit(
        "No se pudo comprimir la imagen por debajo de 2MB incluso a calidad "
        f"{quality_steps[-1]} -- revisa manualmente el archivo original "
        "(puede que tenga una resolucion muy alta o mucho detalle)."
    )
