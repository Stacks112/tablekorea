#!/usr/bin/env python3
"""Build static SEO pages (p/<id>.html) + sitemap.xml from data/places.json.

Each page carries real <h1>/OG meta for crawlers, then redirects humans into
the app with ?place=<id>. Pattern reused from Stacks (/s/:id) per playbook 1
§10. Run:

    python3 scripts/build_pages.py

BASE must be updated when the custom domain is decided.
"""
import html
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "places.json"
OUT = ROOT / "p"

# TODO: replace with custom domain when purchased (e.g. https://tablekorea.com)
BASE = "https://REPLACE-ME.github.io/tablekorea"

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{en} ({kr}) — Seongsu, Seoul | TableKorea</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{en} — Seongsu, Seoul">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="place">
<meta property="og:url" content="{base}/p/{pid}.html">
<link rel="canonical" href="{base}/p/{pid}.html">
<meta http-equiv="refresh" content="0; url=../index.html?place={pid}">
<script type="application/ld+json">{ldjson}</script>
</head>
<body>
<h1>{en} <span lang="ko">{kr}</span></h1>
<p>{desc}</p>
<p><a href="../index.html?place={pid}">Open in TableKorea →</a></p>
</body>
</html>
"""


def main() -> int:
    places = json.loads(DATA.read_text(encoding="utf-8"))
    OUT.mkdir(exist_ok=True)

    written = []
    for p in places:
        desc = f"{p['cat']} in Seongsu, Seoul. {p['sum']['dish']}"
        ldjson = json.dumps({
            "@context": "https://schema.org",
            "@type": "Restaurant",
            "name": p["en"],
            "alternateName": p["kr"],
            "servesCuisine": p["cat"],
            "geo": {"@type": "GeoCoordinates",
                    "latitude": p["lat"], "longitude": p["lng"]},
            "aggregateRating": {"@type": "AggregateRating",
                                "ratingValue": p["rating"],
                                "reviewCount": sum(p["reviews"].values())},
        }, ensure_ascii=False)
        page = PAGE.format(
            en=html.escape(p["en"]), kr=html.escape(p["kr"]),
            desc=html.escape(desc), pid=p["id"], base=BASE, ldjson=ldjson,
        )
        path = OUT / f"{p['id']}.html"
        path.write_text(page, encoding="utf-8")
        written.append(path.name)

    # prune pages for removed places
    keep = {f"{p['id']}.html" for p in places}
    for f in OUT.glob("*.html"):
        if f.name not in keep:
            f.unlink()
            print(f"pruned {f.name}")

    urls = [f"{BASE}/"] + [f"{BASE}/p/{p['id']}.html" for p in places]
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls)
        + "</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    print(f"built {len(written)} pages + sitemap.xml")
    return 0


if __name__ == "__main__":
    sys.exit(main())
