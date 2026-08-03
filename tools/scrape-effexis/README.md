# Scrape Effexis website → Markdown

Personal research archive of [http://www.effexis.com/](http://www.effexis.com/) text content (Achieve Planner training, tour copy, and online help). Videos, images, installers, and other binaries are skipped.

## Why

Effexis is no longer active; the site is an archive for previous customers and may disappear. The training pages and online documentation describe how the creator intended Achieve Planner to be used — useful before diverging from that workflow in this reimplementation.

## Setup

```bash
cd tools/scrape-effexis
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

From the repo root (or this directory):

```bash
tools/scrape-effexis/.venv/bin/python tools/scrape-effexis/scrape.py
```

Options:

- `--out DIR` — default `docs/effexis-site`
- `--delay 0.2` — seconds between requests
- `--max-pages N` — stop after N successful pages (for testing)
- extra positional args are seed URLs

## Output

- `docs/effexis-site/**/*.md` — one Markdown file per HTML page (path mirrors the site)
- `docs/effexis-site/INDEX.md` — table of contents with priority reading list
- `docs/effexis-site/MANIFEST.txt` — scrape status per URL

Each page has YAML front matter (`source_url`, `title`, `scraped_at`) and the converted body.

## Notes

- Site is HTTP-only (HTTPS may fail).
- Encoding is mostly Windows-1252.
- Some tour index paths return 403; individual tour/training pages still work.
- Re-run anytime; files are overwritten.
