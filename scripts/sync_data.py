#!/usr/bin/env python3
"""Inject data/places.json into index.html between the @PLACES anchors.

Canonical data lives in data/places.json (single-writer rule: only the data
pipeline writes it). index.html embeds a copy so the app works as a static
single file with no fetch/CORS issues. Run this after editing places.json:

    python3 scripts/sync_data.py

Anchor-based (not line-number-based) per playbook: survives any other edits
to index.html.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
DATA = ROOT / "data" / "places.json"

START = "/* @PLACES_START */"
END = "/* @PLACES_END */"


def main() -> int:
    places = json.loads(DATA.read_text(encoding="utf-8"))
    if not isinstance(places, list) or not places:
        print("ERROR: places.json is not a non-empty list", file=sys.stderr)
        return 1
    ids = [p.get("id") for p in places]
    if len(ids) != len(set(ids)):
        print("ERROR: duplicate ids in places.json", file=sys.stderr)
        return 1
    for p in places:
        for k in ("id", "en", "kr", "cat", "price", "lat", "lng", "party",
                  "engMenu", "cardOk", "late", "wait", "reserve", "rating",
                  "reviews", "sum"):
            if k not in p:
                print(f"ERROR: place {p.get('id')} missing key {k}", file=sys.stderr)
                return 1

    src = INDEX.read_text(encoding="utf-8")
    i, j = src.find(START), src.find(END)
    if i == -1 or j == -1 or j < i:
        print("ERROR: anchors not found in index.html", file=sys.stderr)
        return 1

    block = (
        START
        + "\nconst PLACES = "
        + json.dumps(places, ensure_ascii=False, indent=2)
        + ";\n"
        + END
    )
    out = src[:i] + block + src[j + len(END):]
    if out != src:
        INDEX.write_text(out, encoding="utf-8")
        print(f"index.html updated with {len(places)} places")
    else:
        print("index.html already up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
