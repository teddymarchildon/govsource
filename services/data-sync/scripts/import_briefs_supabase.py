#!/usr/bin/env python3
"""Validate and idempotently import source-linked Briefs into Supabase."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List
from urllib.parse import urlparse

from dotenv import load_dotenv
from sync_common import create_supabase_client

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

ALLOWED_TYPES = {"bill", "law", "agency_document", "executive_order", "cluster"}
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def load_manifest(path: Path) -> List[Dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    briefs = payload.get("briefs") if isinstance(payload, dict) else None
    if not isinstance(briefs, list) or not briefs:
        raise ValueError("Manifest must contain a non-empty 'briefs' array")
    validate_manifest(briefs)
    return briefs


def validate_manifest(briefs: Iterable[Dict[str, Any]]) -> None:
    seen_slugs = set()
    for index, brief in enumerate(briefs, start=1):
        label = f"Brief {index}"
        title = brief.get("title")
        slug = brief.get("slug")
        dek = brief.get("dek")
        points = brief.get("points")
        sources = brief.get("sources")
        primary = brief.get("primary_record")

        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 180:
            raise ValueError(f"{label} has an invalid title")
        if not isinstance(slug, str) or len(slug) > 180 or not SLUG_PATTERN.fullmatch(slug):
            raise ValueError(f"{label} has an invalid slug")
        if slug in seen_slugs:
            raise ValueError(f"Duplicate slug in manifest: {slug}")
        seen_slugs.add(slug)
        if not isinstance(dek, str) or not dek.strip() or len(dek) > 360:
            raise ValueError(f"{label} has an invalid dek")
        if not isinstance(points, list) or not 3 <= len(points) <= 5:
            raise ValueError(f"{label} must contain 3 to 5 points")
        if not isinstance(sources, list) or not sources:
            raise ValueError(f"{label} must contain at least one source")
        if not isinstance(primary, dict) or primary.get("type") not in ALLOWED_TYPES:
            raise ValueError(f"{label} has an invalid primary record")

        source_ids = set()
        for source in sources:
            source_id = source.get("id")
            parsed_url = urlparse(str(source.get("url") or ""))
            if not isinstance(source_id, str) or not source_id:
                raise ValueError(f"{label} contains a source without an id")
            if source_id in source_ids:
                raise ValueError(f"{label} contains duplicate source id {source_id}")
            if not source.get("label") or parsed_url.scheme not in {"http", "https"}:
                raise ValueError(f"{label} contains an invalid source {source_id}")
            source_ids.add(source_id)

        point_ids = set()
        for point in points:
            point_id = point.get("id")
            text = point.get("text")
            refs = point.get("source_refs")
            if not isinstance(point_id, str) or not point_id or point_id in point_ids:
                raise ValueError(f"{label} contains an invalid or duplicate point id")
            if not isinstance(text, str) or not text.strip() or len(text) > 900:
                raise ValueError(f"{label} contains an invalid point {point_id}")
            if not isinstance(refs, list) or not refs or not set(refs).issubset(source_ids):
                raise ValueError(f"{label} point {point_id} has invalid source_refs")
            point_ids.add(point_id)

        context = brief.get("context_markdown")
        if context is not None and (not isinstance(context, str) or len(context) > 12000):
            raise ValueError(f"{label} has invalid context_markdown")
        related = brief.get("related_records", [])
        if not isinstance(related, list) or any(
            not isinstance(item, dict) or item.get("type") not in ALLOWED_TYPES
            for item in related
        ):
            raise ValueError(f"{label} has invalid related records")


def _single_row(query: Any, description: str) -> Dict[str, Any]:
    result = query.limit(2).execute()
    rows = result.data or []
    if len(rows) != 1:
        raise RuntimeError(f"Expected exactly one {description}; found {len(rows)}")
    return rows[0]


def resolve_record(supabase: Any, reference: Dict[str, Any]) -> Dict[str, Any]:
    item_type = reference["type"]
    external_id = str(reference.get("external_id") or "").strip()
    if not external_id:
        raise ValueError(f"{item_type} reference is missing external_id")

    if item_type in {"bill", "law"}:
        row = _single_row(
            supabase.table("bill")
            .select("id,bill_unique_id,law_enacted_date")
            .eq("bill_unique_id", external_id),
            f"bill record for {external_id}",
        )
        is_law = bool(row.get("law_enacted_date"))
        if item_type == "law" and not is_law:
            raise RuntimeError(f"{external_id} is not marked as an enacted law")
        if item_type == "bill" and is_law:
            raise RuntimeError(f"{external_id} is marked as a law, not a bill")
        return {"type": item_type, "id": row["id"], "external_id": external_id}

    if item_type in {"agency_document", "executive_order"}:
        row = _single_row(
            supabase.table("agency_document")
            .select("id,remote_document_number,subtype")
            .eq("remote_document_number", external_id),
            f"agency document for {external_id}",
        )
        is_order = row.get("subtype") == "Executive Order"
        if item_type == "executive_order" and not is_order:
            raise RuntimeError(f"{external_id} is not an Executive Order")
        if item_type == "agency_document" and is_order:
            raise RuntimeError(f"{external_id} is an Executive Order")
        return {"type": item_type, "id": row["id"], "external_id": external_id}

    row = _single_row(
        supabase.table("cluster")
        .select("id,remote_id,case_name")
        .eq("remote_id", external_id),
        f"court cluster for {external_id}",
    )
    return {"type": item_type, "id": row["id"], "external_id": external_id}


def brief_payload(
    brief: Dict[str, Any], primary: Dict[str, Any], manifest_hash: str
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    metadata = dict(brief.get("generation_metadata") or {})
    metadata.update(
        {
            "importer": "import_briefs_supabase.py",
            "manifest_sha256": manifest_hash,
            "imported_at": now,
            "primary_external_id": primary["external_id"],
        }
    )
    return {
        "title": brief["title"].strip(),
        "slug": brief["slug"],
        "dek": brief["dek"].strip(),
        "points": brief["points"],
        "context_markdown": brief.get("context_markdown"),
        "primary_item_type": primary["type"],
        "primary_item_id": primary["id"],
        "policy_areas": list(dict.fromkeys(brief.get("policy_areas") or [])),
        "sources": brief["sources"],
        "author_name": brief.get("author_name") or "GovSource Editorial",
        "editor_notes": brief.get("editor_notes"),
        "status": "review",
        "published_at": None,
        "is_featured": False,
        "featured_until": None,
        "auto_generated": True,
        "generation_metadata": metadata,
    }


def sync_related_items(
    supabase: Any, brief_id: Any, related: List[Dict[str, Any]]
) -> None:
    existing_result = (
        supabase.table("brief_related_item")
        .select("id,item_type,item_id")
        .eq("brief_id", brief_id)
        .execute()
    )
    existing = existing_result.data or []
    desired_keys = {(item["type"], str(item["id"])) for item in related}

    if related:
        rows = [
            {
                "brief_id": brief_id,
                "item_type": item["type"],
                "item_id": item["id"],
                "relation_role": item.get("relation_role"),
                "sort_order": index,
            }
            for index, item in enumerate(related)
        ]
        supabase.table("brief_related_item").upsert(
            rows, on_conflict="brief_id,item_type,item_id"
        ).execute()

    for row in existing:
        if (row["item_type"], str(row["item_id"])) not in desired_keys:
            supabase.table("brief_related_item").delete().eq("id", row["id"]).execute()


def import_brief(
    supabase: Any,
    brief: Dict[str, Any],
    manifest_hash: str,
    *,
    write: bool,
) -> Dict[str, Any]:
    primary = resolve_record(supabase, brief["primary_record"])
    related = [resolve_record(supabase, item) | {"relation_role": item.get("relation_role")} for item in brief.get("related_records", [])]
    payload = brief_payload(brief, primary, manifest_hash)

    existing_result = (
        supabase.table("brief")
        .select("id,slug,status,version")
        .eq("slug", brief["slug"])
        .limit(1)
        .execute()
    )
    existing = (existing_result.data or [None])[0]
    action = "update" if existing else "insert"
    logger.info(
        "%s %s -> %s #%s",
        "Would" if not write else "Will",
        action,
        primary["type"],
        primary["id"],
    )
    if not write:
        return {"slug": brief["slug"], "action": action, "primary": primary}

    if existing:
        result = (
            supabase.table("brief")
            .update(payload)
            .eq("id", existing["id"])
            .execute()
        )
    else:
        result = supabase.table("brief").insert(payload).execute()
    if not result.data:
        raise RuntimeError(f"Brief write returned no row for {brief['slug']}")
    brief_id = result.data[0]["id"]
    sync_related_items(supabase, brief_id, related)

    verified = _single_row(
        supabase.table("brief")
        .select("id,slug,status,auto_generated,primary_item_type,primary_item_id")
        .eq("id", brief_id),
        f"written Brief {brief['slug']}",
    )
    if verified["status"] != "review" or not verified["auto_generated"]:
        raise RuntimeError(f"Brief verification failed for {brief['slug']}")
    return {"slug": brief["slug"], "action": action, "id": brief_id, "primary": primary}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write to Supabase; without this flag the command only validates and resolves",
    )
    args = parser.parse_args()

    load_dotenv()
    try:
        raw_manifest = args.manifest.read_bytes()
        briefs = load_manifest(args.manifest)
        manifest_hash = hashlib.sha256(raw_manifest).hexdigest()
        supabase = create_supabase_client()
    except Exception as exc:
        logger.error("Setup failed: %s", exc)
        return 2

    results = []
    failures = 0
    for brief in briefs:
        try:
            results.append(
                import_brief(
                    supabase,
                    brief,
                    manifest_hash,
                    write=args.write,
                )
            )
        except Exception as exc:
            failures += 1
            logger.exception("Failed to import %s: %s", brief.get("slug"), exc)

    logger.info(
        "brief_import_summary mode=%s total=%d succeeded=%d failed=%d",
        "write" if args.write else "dry-run",
        len(briefs),
        len(results),
        failures,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
