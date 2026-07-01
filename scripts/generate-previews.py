#!/usr/bin/env python3
"""Generate compressed JPEG preview thumbnails for gallery artwork.

Reads assets/json/artwork.json, generates a small JPEG preview next to each
source image on the MuffinMode server (in a sibling "thumbs" folder), and
writes a "preview_url" field back into artwork.json pointing at it. Originals
are never modified.

Usage:
    python generate-previews.py [--muffin-root PATH] [--force]
"""

import argparse
import json
import os
import sys
from urllib.parse import urlsplit

from PIL import Image

BASE_URL = "https://muffinmode.net"
MAX_DIM = 700
JPEG_QUALITY = 72

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTWORK_JSON = os.path.join(REPO_ROOT, "assets", "json", "artwork.json")


def url_to_local_path(url, muffin_root):
    path = urlsplit(url).path  # e.g. /cache/narch/furry/foo.png
    rel = path.lstrip("/")
    return os.path.join(muffin_root, *rel.split("/"))


def make_preview_url(url):
    parts = urlsplit(url)
    dirname, filename = parts.path.rsplit("/", 1)
    stem = os.path.splitext(filename)[0]
    return f"{parts.scheme}://{parts.netloc}{dirname}/thumbs/{stem}.jpg"


def generate_preview(src_path, dst_path):
    with Image.open(src_path) as im:
        im.load()
        if im.mode in ("RGBA", "LA", "P"):
            rgba = im.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.split()[3])
            im = background
        else:
            im = im.convert("RGB")

        im.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        im.save(dst_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--muffin-root", default=r"F:\MuffinMode",
                         help=r"Local path to the MuffinMode server root (default: F:\MuffinMode)")
    parser.add_argument("--force", action="store_true",
                         help="Regenerate previews even if an up-to-date one already exists")
    args = parser.parse_args()

    with open(ARTWORK_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    total_src_bytes = 0
    total_dst_bytes = 0
    processed = 0
    skipped = 0

    for item in data:
        img_url = item.get("img_url")
        if not img_url:
            continue

        src_path = url_to_local_path(img_url, args.muffin_root)
        if not os.path.isfile(src_path):
            print(f"  [skip] source not found: {src_path}", file=sys.stderr)
            skipped += 1
            continue

        preview_url = make_preview_url(img_url)
        dst_path = url_to_local_path(preview_url, args.muffin_root)

        needs_generate = (
            args.force
            or not os.path.isfile(dst_path)
            or os.path.getmtime(dst_path) < os.path.getmtime(src_path)
        )

        if needs_generate:
            generate_preview(src_path, dst_path)
            processed += 1
        else:
            skipped += 1

        total_src_bytes += os.path.getsize(src_path)
        total_dst_bytes += os.path.getsize(dst_path)

        # Rebuild the dict so preview_url sits right after img_url.
        new_item = {}
        for key, value in item.items():
            new_item[key] = value
            if key == "img_url":
                new_item["preview_url"] = preview_url
        item.clear()
        item.update(new_item)

    with open(ARTWORK_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)
        f.write("\n")

    print(f"Generated/updated: {processed}, skipped (up-to-date or missing): {skipped}")
    if total_src_bytes:
        pct = 100 * (1 - total_dst_bytes / total_src_bytes)
        print(f"Original total: {total_src_bytes/1024/1024:.1f} MiB, "
              f"preview total: {total_dst_bytes/1024/1024:.1f} MiB "
              f"({pct:.0f}% smaller)")


if __name__ == "__main__":
    main()
