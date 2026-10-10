"""Import permitted local documents or explicitly selected official webpages."""

from __future__ import annotations

import argparse
import json
import mimetypes
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import requests

from backend.knowledge_base import (
    SOURCES_DIR,
    TOPICS,
    KnowledgeBaseError,
    create_source_record,
    extract_document_text,
    rebuild_index,
    retrieve_relevant,
    save_source_record,
)


ALLOWED_HOSTS = {
    "investor.gov": "Investor.gov",
    "finra.org": "FINRA",
    "sec.gov": "U.S. Securities and Exchange Commission",
}
USER_AGENT = "TradeLabLocalKnowledgeBot/1.0 (single-page fetch; local educational use)"
MAX_SOURCE_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3


def validate_source_url(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise KnowledgeBaseError("Only HTTPS URLs on the allowlisted official domains are accepted.")
    try:
        port = parsed.port
    except ValueError as error:
        raise KnowledgeBaseError("The source URL has an invalid port.") from error
    if port not in (None, 443):
        raise KnowledgeBaseError("Non-standard URL ports are not accepted.")
    hostname = parsed.hostname.lower().rstrip(".")
    root = next(
        (domain for domain in ALLOWED_HOSTS if hostname == domain or hostname.endswith(f".{domain}")),
        None,
    )
    if root is None:
        raise KnowledgeBaseError("URL host is not allowlisted. Supported domains: investor.gov, finra.org, sec.gov.")
    clean_url = urlunparse(("https", parsed.netloc, parsed.path or "/", parsed.params, parsed.query, ""))
    return clean_url, root


def _get_without_redirects(url: str, timeout: int = 20) -> requests.Response:
    return requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/plain;q=0.9"},
        timeout=timeout,
        allow_redirects=False,
        stream=True,
    )


def _check_robots(url: str) -> None:
    origin = f"https://{urlparse(url).netloc}"
    robots_url = f"{origin}/robots.txt"
    response = _get_without_redirects(robots_url, timeout=10)
    try:
        if response.status_code == 404:
            return
        if response.status_code == 403:
            raise KnowledgeBaseError(
                "Could not verify robots.txt access permission (HTTP 403). "
                "Permission is unresolved; the page was not fetched. Use a permitted local document if you have verified rights."
            )
        if response.status_code != 200:
            raise KnowledgeBaseError(f"Could not verify robots.txt access permission (HTTP {response.status_code}).")
        body = _read_limited_response(response)
        if len(body) > 512 * 1024:
            raise KnowledgeBaseError("robots.txt response is too large to verify safely.")
        parser = RobotFileParser(robots_url)
        parser.parse(body.decode(response.encoding or "utf-8", errors="replace").splitlines())
        if not parser.can_fetch(USER_AGENT, url):
            raise KnowledgeBaseError("robots.txt disallows fetching this page.")
    finally:
        response.close()


def _read_limited_response(response: requests.Response) -> bytes:
    content = bytearray()
    for part in response.iter_content(chunk_size=16 * 1024):
        if not part:
            continue
        content.extend(part)
        if len(content) > MAX_SOURCE_BYTES:
            raise KnowledgeBaseError("Source response exceeded the 2 MB import limit.")
    return bytes(content)


def fetch_official_page(url: str) -> tuple[str, str, str, str]:
    """Fetch exactly one robots-allowed page, following only allowlisted HTTPS redirects."""
    current_url, domain = validate_source_url(url)
    visited: set[str] = set()

    for _ in range(MAX_REDIRECTS + 1):
        if current_url in visited:
            raise KnowledgeBaseError("The source returned a redirect loop.")
        visited.add(current_url)
        _check_robots(current_url)
        response = _get_without_redirects(current_url)
        try:
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("Location")
                if not location:
                    raise KnowledgeBaseError("The source returned a redirect without a destination.")
                current_url, redirect_domain = validate_source_url(urljoin(current_url, location))
                if redirect_domain != domain:
                    raise KnowledgeBaseError("Cross-domain redirects are not accepted.")
                continue
            if response.status_code != 200:
                raise KnowledgeBaseError(f"Source page returned HTTP {response.status_code}.")
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
            if content_type not in {"text/html", "text/plain"}:
                raise KnowledgeBaseError(f"Unsupported source content type: {content_type or 'unknown'}.")
            raw_bytes = _read_limited_response(response)
            charset = response.encoding or "utf-8"
            try:
                raw_text = raw_bytes.decode(charset, errors="replace")
            except LookupError:
                raw_text = raw_bytes.decode("utf-8", errors="replace")
            return raw_text, content_type, current_url, domain
        finally:
            response.close()
    raise KnowledgeBaseError("The source exceeded the redirect limit.")


def _metadata_date(meta: dict[str, str]) -> str | None:
    for key in ("article:published_time", "datepublished", "date", "dc.date", "dcterms.created"):
        value = meta.get(key)
        if value:
            return value[:40]
    return None


def import_local_file(
    file_path: Path,
    *,
    title: str,
    publisher: str,
    topic: str,
    url: str | None,
    publication_date: str | None,
    rights_basis: str,
) -> Path:
    resolved = file_path.expanduser().resolve(strict=True)
    if not resolved.is_file():
        raise KnowledgeBaseError("Choose a local file.")
    if resolved.stat().st_size > MAX_SOURCE_BYTES:
        raise KnowledgeBaseError("Local source files must be 2 MB or smaller.")
    if not title.strip():
        raise KnowledgeBaseError("Provide the document's title.")
    if not publisher.strip():
        raise KnowledgeBaseError("Provide the document's publisher.")
    if not rights_basis.strip():
        raise KnowledgeBaseError("Provide the verified license or permission basis for this import.")
    suffix = resolved.suffix.lower()
    if suffix not in {".txt", ".md", ".html", ".htm", ".pdf"}:
        raise KnowledgeBaseError("Supported local files are .txt, .md, .html, .htm, and .pdf.")
    if suffix == ".pdf":
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError

        try:
            reader = PdfReader(str(resolved))
            if reader.is_encrypted:
                raise KnowledgeBaseError("Encrypted PDFs are not supported; provide an accessible local document.")
            content = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except PdfReadError as error:
            raise KnowledgeBaseError(f"Could not read PDF document: {error}") from error
    else:
        raw_text = resolved.read_text(encoding="utf-8-sig")
        content_type = "text/html" if suffix in {".html", ".htm"} else mimetypes.guess_type(resolved.name)[0] or "text/plain"
        content, extracted = extract_document_text(raw_text, content_type)
    if suffix == ".pdf":
        extracted = {}
    record = create_source_record(
        title=title,
        publisher=publisher,
        topic=topic,
        content=content,
        source_key=str(resolved),
        url=url,
        publication_date=publication_date or _metadata_date(extracted),
        rights_basis=rights_basis,
        provenance_note=(
            "Local file supplied by the user. The supplied title, publisher, URL, and rights basis "
            "are user-reported and were not independently verified by this importer."
        ),
    )
    return save_source_record(record, SOURCES_DIR)


def import_official_url(
    url: str,
    *,
    title: str | None,
    publisher: str | None,
    topic: str,
    publication_date: str | None,
    rights_basis: str,
) -> Path:
    raw_text, content_type, final_url, domain = fetch_official_page(url)
    content, extracted = extract_document_text(raw_text, content_type)
    record = create_source_record(
        title=title or extracted.get("og:title") or extracted.get("title") or final_url,
        publisher=publisher or ALLOWED_HOSTS[domain],
        topic=topic,
        content=content,
        source_key=final_url,
        url=final_url,
        publication_date=publication_date or _metadata_date(extracted),
        rights_basis=rights_basis,
        provenance_note=f"Fetched over HTTPS from allowlisted host {urlparse(final_url).hostname}; page content and publisher identity are not independently fact-checked.",
    )
    return save_source_record(record, SOURCES_DIR)


def _add_shared_options(parser: argparse.ArgumentParser, url_mode: bool = False) -> None:
    parser.add_argument("--topic", choices=TOPICS, required=True, help="Knowledge topic assigned to the source.")
    parser.add_argument("--title", required=not url_mode, help="Exact source title (required for local files).")
    parser.add_argument("--publisher", required=not url_mode, help="Source publisher (required for local files).")
    parser.add_argument("--publication-date", help="Source publication/update date, if known.")
    parser.add_argument(
        "--rights-basis",
        required=True,
        help="Verified license/permission and scope for storing and using this material; claims are not independently verified.",
    )
    parser.add_argument(
        "--confirm-rights",
        action="store_true",
        required=True,
        help="Attest that you verified permission; does not bypass robots.txt or authorize web fetching.",
    )
    if url_mode:
        parser.add_argument("--url", required=True, help="One HTTPS page from investor.gov, finra.org, or sec.gov.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import permitted financial education material into the local RAG library.")
    commands = parser.add_subparsers(dest="command", required=True)

    local = commands.add_parser("add-file", help="Import a permitted local .txt, .md, HTML, or PDF file.")
    local.add_argument("path", type=Path)
    _add_shared_options(local)
    local.add_argument("--url", help="Original source URL for citation, if available; this is recorded, not fetched.")

    remote = commands.add_parser("add-url", help="Fetch one HTTPS page only after its robots.txt access check passes.")
    _add_shared_options(remote, url_mode=True)

    commands.add_parser("rebuild", help="Rebuild the local index from all imported sources.")
    commands.add_parser("list", help="List imported source metadata.")
    search = commands.add_parser("search", help="Search locally indexed passages without calling an AI service.")
    search.add_argument("query", help="Question or terms to search for.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "add-file":
            path = import_local_file(
                args.path,
                title=args.title or "",
                publisher=args.publisher or "",
                topic=args.topic,
                url=args.url,
                publication_date=args.publication_date,
                rights_basis=args.rights_basis,
            )
            print(f"Imported source record: {path}")
            print("Rebuild the local index with: python -m backend.ingest_knowledge rebuild")
        elif args.command == "add-url":
            path = import_official_url(
                args.url,
                title=args.title,
                publisher=args.publisher,
                topic=args.topic,
                publication_date=args.publication_date,
                rights_basis=args.rights_basis,
            )
            print(f"Imported source record: {path}")
            print("Rebuild the local index with: python -m backend.ingest_knowledge rebuild")
        elif args.command == "rebuild":
            result = rebuild_index()
            print(f"Indexed {result['documents']} documents into {result['chunks']} passages.")
        elif args.command == "list":
            sources = sorted(SOURCES_DIR.glob("*.json")) if SOURCES_DIR.exists() else []
            for path in sources:
                record = json.loads(path.read_text(encoding="utf-8"))
                metadata = record["metadata"]
                print(f"{metadata['title']} | {metadata['publisher']} | {metadata['topic']} | {metadata.get('url') or 'no URL'}")
            if not sources:
                print("No source documents imported yet.")
        elif args.command == "search":
            passages = retrieve_relevant(args.query)
            if not passages:
                print("No relevant passages found in the local index.")
            for number, passage in enumerate(passages, start=1):
                metadata = passage["metadata"]
                print(f"[{number}] {metadata['title']} — {metadata['publisher']}")
                print(f"URL: {metadata.get('url') or 'not recorded'}")
                print(f"Relevance score: {passage['score']:.3f}")
                print(passage["text"])
                print()
        return 0
    except (KnowledgeBaseError, OSError, requests.RequestException) as error:
        print(f"Knowledge ingestion failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
