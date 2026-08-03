#!/usr/bin/env python3
"""
Crawl http://www.effexis.com/ (text only) and save pages as Markdown.

Intended for personal archival of Achieve Planner training / docs from the
defunct Effexis site, so we can study the creator's intended workflow.

Skips videos, images, installers, PDFs, and other binary assets.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urljoin, urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Comment, NavigableString, Tag
import html2text

BASE_HOSTS = {"www.effexis.com", "effexis.com"}
BASE_URL = "http://www.effexis.com"

SKIP_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".svg",
    ".ico",
    ".css",
    ".js",
    ".map",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp4",
    ".wmv",
    ".avi",
    ".mov",
    ".flv",
    ".swf",
    ".mp3",
    ".wav",
    ".zip",
    ".exe",
    ".msi",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".rar",
    ".7z",
    ".dmg",
    ".cab",
}

# Paths that are pure chrome / non-content for our purposes
SKIP_PATH_PREFIXES = (
    "/_themes/",
    "/_private/",
    "/cgi-bin/",
)

USER_AGENT = (
    "Mozilla/5.0 (compatible; planner-effexis-archive/1.0; "
    "+personal research text archive of Achieve Planner docs)"
)


@dataclass
class PageResult:
    url: str
    path: str
    title: str
    md_relpath: str
    bytes_html: int
    chars_md: int
    error: str | None = None


@dataclass
class CrawlState:
    visited: set[str] = field(default_factory=set)
    queued: set[str] = field(default_factory=set)
    results: list[PageResult] = field(default_factory=list)
    errors: list[tuple[str, str]] = field(default_factory=list)


def normalize_url(url: str) -> str | None:
    url, _frag = urldefrag(url)
    url = url.strip()
    if not url or url.lower().startswith(("javascript:", "mailto:", "tel:", "data:")):
        return None

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None
    host = parsed.netloc.lower()
    if host not in BASE_HOSTS:
        return None

    path = parsed.path or "/"
    # Collapse //
    path = re.sub(r"/{2,}", "/", path)

    for prefix in SKIP_PATH_PREFIXES:
        if path.startswith(prefix):
            return None

    lower_path = path.lower()
    for ext in SKIP_EXTENSIONS:
        if lower_path.endswith(ext):
            return None

    # Drop query strings that are tracking-only; keep if they look meaningful
    query = parsed.query
    if query and re.fullmatch(r"(utm_[^=&]+=[^&]*&?)+", query, re.I):
        query = ""

    return f"{BASE_URL}{path}{('?' + query) if query else ''}"


def url_to_md_relpath(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path or "/"
    if path.endswith("/"):
        path = path + "index.htm"
    if path == "/":
        path = "/index.htm"

    # .htm / .html → .md; bare paths get .md
    if path.lower().endswith((".htm", ".html")):
        stem = path.rsplit(".", 1)[0]
        md_path = stem + ".md"
    else:
        md_path = path + ".md"

    # Safe filename: strip leading slash
    rel = md_path.lstrip("/")
    # Query → suffix (rare)
    if parsed.query:
        safe_q = re.sub(r"[^a-zA-Z0-9._-]+", "_", parsed.query)[:80]
        rel = rel[:-3] + f"__{safe_q}.md"
    return rel


def should_fetch(url: str) -> bool:
    return normalize_url(url) is not None


def fetch_html(url: str, timeout: float = 30.0) -> tuple[str | None, str | None, str]:
    """Return (html, error, final_url)."""
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*"})
    try:
        with urlopen(req, timeout=timeout) as resp:
            final = resp.geturl()
            content_type = (resp.headers.get("Content-Type") or "").lower()
            raw = resp.read()
    except HTTPError as e:
        return None, f"HTTP {e.code}: {e.reason}", url
    except URLError as e:
        return None, f"URL error: {e.reason}", url
    except TimeoutError:
        return None, "timeout", url
    except Exception as e:  # noqa: BLE001 — surface any network glitch
        return None, f"{type(e).__name__}: {e}", url

    if "html" not in content_type and not urlparse(url).path.lower().endswith(
        (".htm", ".html", "/")
    ):
        return None, f"non-html content-type: {content_type or 'unknown'}", final

    for enc in ("windows-1252", "utf-8", "iso-8859-1", "latin-1"):
        try:
            return raw.decode(enc), None, final
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace"), None, final


def extract_links(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    links: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href:
            continue
        abs_url = urljoin(base_url, href)
        n = normalize_url(abs_url)
        if n:
            links.append(n)
    return links


def _strip_chrome(soup: BeautifulSoup) -> None:
    for tag in soup(["script", "style", "noscript", "iframe", "object", "embed", "applet"]):
        tag.decompose()
    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()
    # Drop pure media tags (text-only archive)
    for tag in soup.find_all(["img", "video", "audio", "source", "picture", "canvas"]):
        alt = ""
        if isinstance(tag, Tag):
            alt = (tag.get("alt") or "").strip()
        if alt:
            tag.replace_with(NavigableString(f"[{alt}]"))
        else:
            tag.decompose()


def _extract_editable_regions(html: str) -> str | None:
    """Pull Dreamweaver/FrontPage Headline + PageBody regions from raw HTML."""
    headline = re.search(
        r"<!--\s*#BeginEditable\s+\"Headline\"\s*-->(.*?)<!--\s*#EndEditable\s*-->",
        html,
        re.I | re.S,
    )
    body = re.search(
        r"<!--\s*#BeginEditable\s+\"PageBody\"\s*-->(.*?)<!--\s*#EndEditable\s*-->",
        html,
        re.I | re.S,
    )
    if not body:
        return None
    parts: list[str] = []
    if headline:
        parts.append(headline.group(1))
    parts.append(body.group(1))
    return "\n".join(parts)


def clean_soup_for_markdown(html: str) -> BeautifulSoup:
    # Prefer raw HTML editable regions BEFORE BeautifulSoup rewrites comments
    region = _extract_editable_regions(html)
    if region:
        fragment = BeautifulSoup(f"<div>{region}</div>", "lxml")
        _strip_chrome(fragment)
        return fragment

    soup = BeautifulSoup(html, "lxml")
    _strip_chrome(soup)
    body = soup.body

    # Online help (Help & Manual): drop thin purple header tables
    if body is not None:
        for table in list(body.find_all("table")):
            if not isinstance(table, Tag):
                continue
            attrs = table.attrs or {}
            bg = str(attrs.get("bgcolor") or "").upper().lstrip("#")
            text = table.get_text(" ", strip=True)
            if bg in ("8080C0",) and len(text) < 200:
                table.decompose()

    return soup


def html_to_markdown(html: str, page_url: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "lxml")
    title = ""
    if soup.title and soup.title.string:
        title = " ".join(soup.title.string.split())
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(" ", strip=True)

    cleaned = clean_soup_for_markdown(html)

    converter = html2text.HTML2Text()
    converter.ignore_links = False
    converter.ignore_images = True
    converter.ignore_emphasis = False
    converter.body_width = 0  # don't wrap
    converter.protect_links = False
    converter.unicode_snob = True
    converter.skip_internal_links = False
    converter.inline_links = True
    converter.ignore_tables = False
    converter.wrap_links = False

    md = converter.handle(str(cleaned)).strip()

    # Normalize excessive blank lines / leftover junk
    md = re.sub(r"\[?\s*\]\(javascript:[^)]*\)", "", md)
    md = md.replace("\xa0", " ")
    # Help & Manual pages are nested layout tables → lots of empty MD table rows
    cleaned_lines: list[str] = []
    for line in md.splitlines():
        stripped = line.strip()
        # Drop pure table scaffolding / empty cells
        if re.fullmatch(r"\|?(?:\s*\|)+", stripped):
            continue
        if re.fullmatch(r"\|?(?:[\s\-:|]+)\|?", stripped) and "|" in stripped:
            continue
        # Flatten table row leftovers: leading/trailing pipes and empty cells
        if "|" in stripped:
            # "| text |" or "| text" or multi-cell with mostly empty → join non-empty cells
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            cells = [c for c in cells if c and not re.fullmatch(r"[\s*_]+", c)]
            if not cells:
                continue
            stripped = " ".join(cells)
        if not stripped:
            continue
        cleaned_lines.append(stripped)
    md = "\n".join(cleaned_lines)
    # Collapse runs of emphasis-only leftovers
    md = re.sub(r"(?m)^[\s*_]+$", "", md)
    md = re.sub(r"\n{3,}", "\n\n", md).strip()

    # Rewrite internal effexis.com links → relative .md paths
    def rewrite_link(match: re.Match[str]) -> str:
        label, href = match.group(1), match.group(2)
        # Strip optional angle brackets from protect_links-style output
        href_clean = href.strip().lstrip("<").rstrip(">")
        n = normalize_url(urljoin(page_url, href_clean))
        if not n:
            return match.group(0)
        rel = url_to_md_relpath(n)
        from_dir = Path(url_to_md_relpath(page_url)).parent
        try:
            import os

            rel_from = Path(
                os.path.relpath(rel, start=str(from_dir) if str(from_dir) != "." else ".")
            ).as_posix()
            return f"[{label}]({rel_from})"
        except Exception:  # noqa: BLE001
            return f"[{label}]({rel})"

    md = re.sub(
        r"\[([^\]]+)\]\((<?https?://(?:www\.)?effexis\.com[^)>]+>?)\)",
        rewrite_link,
        md,
    )
    # Relative .htm links in same-site pages (after region extract they stay relative)
    def rewrite_local(match: re.Match[str]) -> str:
        label, href = match.group(1), match.group(2)
        if href.startswith(("#", "mailto:", "javascript:")):
            return match.group(0)
        if not href.lower().endswith((".htm", ".html", "/")) and "://" in href:
            return match.group(0)
        abs_url = urljoin(page_url, href)
        n = normalize_url(abs_url)
        if not n:
            return match.group(0)
        rel = url_to_md_relpath(n)
        from_dir = Path(url_to_md_relpath(page_url)).parent
        import os

        rel_from = Path(
            os.path.relpath(rel, start=str(from_dir) if str(from_dir) != "." else ".")
        ).as_posix()
        # Preserve fragment
        frag = ""
        if "#" in href:
            frag = "#" + href.split("#", 1)[1]
        return f"[{label}]({rel_from}{frag})"

    md = re.sub(
        r"\[([^\]]+)\]\(([^)]+\.html?[^)]*)\)",
        rewrite_local,
        md,
        flags=re.I,
    )

    return title, md


def write_markdown(
    out_dir: Path,
    url: str,
    title: str,
    body_md: str,
    scraped_at: str,
) -> Path:
    rel = url_to_md_relpath(url)
    dest = out_dir / rel
    dest.parent.mkdir(parents=True, exist_ok=True)

    front = [
        "---",
        f'source_url: "{url}"',
        f'title: "{title.replace(chr(34), chr(39))}"',
        f"scraped_at: {scraped_at}",
        "---",
        "",
        f"# {title}" if title else "# (untitled)",
        "",
        f"*Archived from [{url}]({url})*",
        "",
        "---",
        "",
        body_md,
        "",
    ]
    dest.write_text("\n".join(front), encoding="utf-8")
    return dest


def write_index(out_dir: Path, results: list[PageResult], scraped_at: str) -> None:
    ok = [r for r in results if not r.error]
    err = [r for r in results if r.error]

    # Group by top-level section
    groups: dict[str, list[PageResult]] = {}
    for r in sorted(ok, key=lambda x: x.path):
        parts = r.path.strip("/").split("/")
        if not parts or parts == [""]:
            key = "(root)"
        elif parts[0] == "achieve" and len(parts) > 1:
            key = f"achieve/{parts[1]}"
        else:
            key = parts[0]
        groups.setdefault(key, []).append(r)

    lines = [
        "# Effexis website archive (text only)",
        "",
        f"Scraped at: {scraped_at}",
        "",
        "Source: [http://www.effexis.com/](http://www.effexis.com/)",
        "",
        "Videos, images, installers, and other binaries were skipped. "
        "This is a personal research archive of Achieve Planner training and documentation "
        "to understand the creator's intended workflow.",
        "",
        f"**{len(ok)} pages** archived as Markdown.",
        "",
        "## Priority reading (training & design intent)",
        "",
        "These pages are especially useful for understanding how Achieve Planner was meant to be used:",
        "",
    ]

    priority = [
        "achieve/training/index.md",
        "achieve/training/structured-vs-unstructured.md",
        "achieve/training/prioritized-daily-todo-list.md",
        "achieve/training/printing.md",
        "achieve/training/email-management.md",
        "achieve/next-action-list.md",
        "achieve/tour/get-organized.md",
        "achieve/tour/plan-your-work.md",
        "achieve/tour/work-your-plan.md",
        "achieve/tour/capture-organize-new-work.md",
        "achieve/tour/productivity-tools.md",
        "achieve/tour/gtd.md",
        "achieve/tour/gtd-setup.md",
        "achieve/tour/big-rocks.md",
        "achieve/online_documentation/overview.md",
        "achieve/online_documentation/achieveoverview.md",
        "achieve/online_documentation/weeklyplanningoverview.md",
        "achieve/online_documentation/weeklyplanningwizard.md",
        "achieve/online_documentation/taskchooser.md",
        "achieve/online_documentation/projecttaskscheduling.md",
        "achieve/online_documentation/usingpriorities.md",
    ]
    for rel in priority:
        match = next((r for r in ok if r.md_relpath == rel), None)
        if match:
            lines.append(f"- [{match.title or rel}]({rel})")
    lines.append("")

    lines.append("## All pages by section")
    lines.append("")
    for key in sorted(groups.keys()):
        lines.append(f"### {key}")
        lines.append("")
        for r in groups[key]:
            title = r.title or r.md_relpath
            lines.append(f"- [{title}]({r.md_relpath}) — `{r.path}`")
        lines.append("")

    if err:
        lines.append("## Errors / skipped")
        lines.append("")
        for r in err:
            lines.append(f"- `{r.url}` — {r.error}")
        lines.append("")

    (out_dir / "INDEX.md").write_text("\n".join(lines), encoding="utf-8")


def crawl(
    seeds: list[str],
    out_dir: Path,
    delay: float,
    max_pages: int | None,
) -> CrawlState:
    state = CrawlState()
    queue: deque[str] = deque()
    scraped_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for s in seeds:
        n = normalize_url(s)
        if n and n not in state.queued:
            queue.append(n)
            state.queued.add(n)

    out_dir.mkdir(parents=True, exist_ok=True)

    while queue:
        if max_pages is not None and len([r for r in state.results if not r.error]) >= max_pages:
            break

        url = queue.popleft()
        if url in state.visited:
            continue
        state.visited.add(url)

        path = urlparse(url).path or "/"
        print(f"[{len(state.visited)}] {url}", flush=True)

        html, err, final_url = fetch_html(url)
        if delay:
            time.sleep(delay)

        if err or not html:
            state.errors.append((url, err or "empty"))
            state.results.append(
                PageResult(
                    url=url,
                    path=path,
                    title="",
                    md_relpath=url_to_md_relpath(url),
                    bytes_html=0,
                    chars_md=0,
                    error=err or "empty",
                )
            )
            continue

        # If redirected within domain, use final for path mapping
        final_norm = normalize_url(final_url) or url

        # Discover more links before conversion
        for link in extract_links(html, final_norm):
            if link not in state.visited and link not in state.queued:
                state.queued.add(link)
                queue.append(link)

        try:
            title, md = html_to_markdown(html, final_norm)
            dest = write_markdown(out_dir, final_norm, title, md, scraped_at)
            state.results.append(
                PageResult(
                    url=final_norm,
                    path=urlparse(final_norm).path or "/",
                    title=title,
                    md_relpath=str(dest.relative_to(out_dir)),
                    bytes_html=len(html.encode("utf-8")),
                    chars_md=len(md),
                )
            )
            print(f"    → {dest.relative_to(out_dir)} ({len(md)} chars)", flush=True)
        except Exception as e:  # noqa: BLE001
            msg = f"convert error: {type(e).__name__}: {e}"
            print(f"    ! {msg}", flush=True)
            state.errors.append((url, msg))
            state.results.append(
                PageResult(
                    url=url,
                    path=path,
                    title="",
                    md_relpath=url_to_md_relpath(url),
                    bytes_html=len(html.encode("utf-8")),
                    chars_md=0,
                    error=msg,
                )
            )

    write_index(out_dir, state.results, scraped_at)

    # Manifest for re-runs
    manifest_lines = [
        f"# scrape manifest {scraped_at}",
        f"pages_ok={sum(1 for r in state.results if not r.error)}",
        f"pages_err={sum(1 for r in state.results if r.error)}",
        "",
    ]
    for r in state.results:
        status = "ERR" if r.error else "OK"
        manifest_lines.append(f"{status}\t{r.url}\t{r.md_relpath}\t{r.error or ''}")
    (out_dir / "MANIFEST.txt").write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")

    return state


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "docs" / "effexis-site",
        help="Output directory for Markdown files",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.2,
        help="Delay between requests in seconds (be polite)",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Optional cap on successful page writes (for testing)",
    )
    parser.add_argument(
        "seeds",
        nargs="*",
        default=[
            "http://www.effexis.com/",
            "http://www.effexis.com/achieve/training/index.htm",
            "http://www.effexis.com/achieve/online_documentation/achievehelp_content.htm",
            "http://www.effexis.com/achieve/tour/get-organized.htm",
        ],
        help="Seed URLs to start the crawl",
    )
    args = parser.parse_args()

    print(f"Output: {args.out}", flush=True)
    state = crawl(args.seeds, args.out, args.delay, args.max_pages)
    ok = sum(1 for r in state.results if not r.error)
    err = sum(1 for r in state.results if r.error)
    print(f"\nDone. {ok} pages written, {err} errors. Index: {args.out / 'INDEX.md'}", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
