#!/usr/bin/env python3
"""Generate compressed AVIF/WebP preview thumbnails for gallery artwork.

Reads assets/json/artwork.json, generates a small AVIF preview (primary) and
WebP preview (fallback for browsers without AVIF support) next to each source
image on the MuffinMode server (in a sibling "thumbs" folder), and writes
"preview_avif_url"/"preview_webp_url" fields back into artwork.json. Originals
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
AVIF_QUALITY = 62
AVIF_SPEED = 6
WEBP_QUALITY = 80

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTWORK_JSON = os.path.join(REPO_ROOT, "assets", "json", "artwork.json")


def url_to_local_path(url, muffin_root):
    path = urlsplit(url).path  # e.g. /cache/narch/furry/foo.png
    rel = path.lstrip("/")
    return os.path.join(muffin_root, *rel.split("/"))


def make_preview_url(url, ext):
    parts = urlsplit(url)
    dirname, filename = parts.path.rsplit("/", 1)
    stem = os.path.splitext(filename)[0]
    return f"{parts.scheme}://{parts.netloc}{dirname}/thumbs/{stem}.{ext}"


def load_flattened(src_path):
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
        return im


def generate_previews(src_path, avif_path, webp_path):
    im = load_flattened(src_path)
    os.makedirs(os.path.dirname(avif_path), exist_ok=True)
    im.save(avif_path, "AVIF", quality=AVIF_QUALITY, speed=AVIF_SPEED)
    im.save(webp_path, "WEBP", quality=WEBP_QUALITY, method=6)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--muffin-root", default=r"F:\MuffinMode",
                         help=r"Local path to the MuffinMode server root (default: F:\MuffinMode)")
    parser.add_argument("--force", action="store_true",
                         help="Regenerate previews even if up-to-date ones already exist")
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

        avif_url = make_preview_url(img_url, "avif")
        webp_url = make_preview_url(img_url, "webp")
        avif_path = url_to_local_path(avif_url, args.muffin_root)
        webp_path = url_to_local_path(webp_url, args.muffin_root)

        needs_generate = (
            args.force
            or not os.path.isfile(avif_path)
            or not os.path.isfile(webp_path)
            or os.path.getmtime(avif_path) < os.path.getmtime(src_path)
            or os.path.getmtime(webp_path) < os.path.getmtime(src_path)
        )

        if needs_generate:
            generate_previews(src_path, avif_path, webp_path)
            processed += 1
        else:
            skipped += 1

        # Remove a stale JPEG preview from a previous run of this script.
        legacy_jpg = url_to_local_path(make_preview_url(img_url, "jpg"), args.muffin_root)
        if os.path.isfile(legacy_jpg):
            os.remove(legacy_jpg)

        total_src_bytes += os.path.getsize(src_path)
        total_dst_bytes += os.path.getsize(avif_path) + os.path.getsize(webp_path)

        # Rebuild the dict so the preview fields sit right after img_url.
        item.pop("preview_url", None)
        new_item = {}
        for key, value in item.items():
            new_item[key] = value
            if key == "img_url":
                new_item["preview_avif_url"] = avif_url
                new_item["preview_webp_url"] = webp_url
        item.clear()
        item.update(new_item)

    with open(ARTWORK_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)
        f.write("\n")

    print(f"Generated/updated: {processed}, skipped (up-to-date or missing): {skipped}")
    if total_src_bytes:
        pct = 100 * (1 - total_dst_bytes / total_src_bytes)
        print(f"Original total: {total_src_bytes/1024/1024:.1f} MiB, "
              f"preview total (avif+webp): {total_dst_bytes/1024/1024:.1f} MiB "
              f"({pct:.0f}% smaller)")


if __name__ == "__main__":
    main()
