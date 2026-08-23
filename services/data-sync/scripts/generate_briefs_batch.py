#!/usr/bin/env python3
"""Generate a balanced, source-grounded Brief manifest from existing records."""

from __future__ import annotations

import argparse
import html
import json
import logging
import os
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any, Dict, Iterable, List

import requests
from dotenv import load_dotenv

from import_briefs_supabase import validate_manifest
from sync_common import create_supabase_client

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5-mini"
MAX_GENERATED_DEK_LENGTH = 300
MAX_GENERATION_ATTEMPTS = 3
TARGET_COUNTS = {"congress": 30, "executive_order": 24, "cluster": 26}
TYPE_PATHS = {
    "hr": "house-bill",
    "s": "senate-bill",
    "hjres": "house-joint-resolution",
    "sjres": "senate-joint-resolution",
    "hconres": "house-concurrent-resolution",
    "sconres": "senate-concurrent-resolution",
    "hres": "house-resolution",
    "sres": "senate-resolution",
}


def clean_source_text(value: str, limit: int = 18000) -> str:
    value = re.sub(r"<script\b[^>]*>.*?</script>", " ", value, flags=re.I | re.S)
    value = re.sub(r"<style\b[^>]*>.*?</style>", " ", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:limit]


def existing_primary_ids(supabase: Any) -> Dict[str, set]:
    rows = (
        supabase.table("brief")
        .select("primary_item_type,primary_item_id")
        .execute()
        .data
        or []
    )
    used: Dict[str, set] = {}
    for row in rows:
        used.setdefault(row["primary_item_type"], set()).add(row["primary_item_id"])
    return used


def congress_url(bill: Dict[str, Any]) -> str:
    path = TYPE_PATHS[str(bill["type"]).lower()]
    return (
        f"https://www.congress.gov/bill/{bill['congress']}th-congress/"
        f"{path}/{bill['number']}"
    )


def select_congress(supabase: Any, used: Dict[str, set]) -> List[Dict[str, Any]]:
    rows = (
        supabase.table("bill_summary")
        .select(
            "date,text,bill:bill(id,congress,number,type,bill_unique_id,title,"
            "introduced_date,law_enacted_date,law_type,law_number,policy_area)"
        )
        .order("date", desc=True)
        .limit(250)
        .execute()
        .data
        or []
    )
    selected: List[Dict[str, Any]] = []
    seen = set()
    for summary in rows:
        bill = summary.get("bill") or {}
        bill_id = bill.get("id")
        item_type = "law" if bill.get("law_enacted_date") else "bill"
        if (
            not bill_id
            or bill_id in seen
            or bill_id in used.get("bill", set())
            or bill_id in used.get("law", set())
        ):
            continue
        source_text = clean_source_text(str(summary.get("text") or ""))
        if len(source_text) < 120:
            continue
        seen.add(bill_id)
        selected.append(
            {
                "record_key": f"{item_type}:{bill['bill_unique_id']}",
                "primary_record": {
                    "type": item_type,
                    "external_id": bill["bill_unique_id"],
                },
                "record": bill,
                "source": {
                    "id": "source_1",
                    "label": f"Congress.gov — {bill['title']}",
                    "url": congress_url(bill),
                },
                "source_text": source_text,
                "suggested_policy_area": bill.get("policy_area") or "Congress",
            }
        )
        if len(selected) == TARGET_COUNTS["congress"]:
            return selected
    raise RuntimeError(f"Only found {len(selected)} usable congressional records")


def fetch_url_text(url: str) -> str:
    response = requests.get(
        url,
        timeout=(10, 60),
        headers={"User-Agent": "govsource-brief-generator/1.0"},
    )
    response.raise_for_status()
    return clean_source_text(response.text)


def select_executive_orders(
    supabase: Any, used: Dict[str, set]
) -> List[Dict[str, Any]]:
    rows = (
        supabase.table("agency_document")
        .select(
            "id,remote_document_number,title,publication_date,signing_date,"
            "president,html_url,abstract"
        )
        .eq("subtype", "Executive Order")
        .order("publication_date", desc=True)
        .limit(120)
        .execute()
        .data
        or []
    )
    selected = []
    for row in rows:
        if row["id"] in used.get("executive_order", set()) or not row.get("html_url"):
            continue
        try:
            source_text = fetch_url_text(row["html_url"])
        except requests.RequestException as exc:
            logger.warning("Skipping EO %s: %s", row["remote_document_number"], exc)
            continue
        if len(source_text) < 500:
            continue
        selected.append(
            {
                "record_key": f"executive_order:{row['remote_document_number']}",
                "primary_record": {
                    "type": "executive_order",
                    "external_id": row["remote_document_number"],
                },
                "record": row,
                "source": {
                    "id": "source_1",
                    "label": f"Federal Register — {row['title']}",
                    "url": row["html_url"],
                },
                "source_text": source_text,
                "suggested_policy_area": "Executive Branch",
            }
        )
        if len(selected) == TARGET_COUNTS["executive_order"]:
            return selected
    raise RuntimeError(f"Only found {len(selected)} usable executive orders")


def opinion_text(supabase: Any, opinions: Iterable[Dict[str, Any]]) -> str:
    ranked = sorted(
        opinions,
        key=lambda item: (
            item.get("type") not in {"010combined", "020lead"},
            not bool(item.get("text_file_path")),
        ),
    )
    for opinion in ranked:
        path = opinion.get("text_file_path") or opinion.get("html_file_path")
        if not path:
            continue
        try:
            content = supabase.storage.from_("opinions").download(path)
            text = clean_source_text(content.decode("utf-8", errors="replace"))
        except Exception as exc:
            logger.warning("Could not read stored opinion %s: %s", path, exc)
            continue
        if len(text) >= 500:
            return text
    return ""


def select_clusters(supabase: Any, used: Dict[str, set]) -> List[Dict[str, Any]]:
    rows = (
        supabase.table("cluster")
        .select(
            "id,remote_id,slug,case_name,date_filed,judges,court:court(*),"
            "opinions:court_opinion(id,type,html_file_path,text_file_path,"
            "pdf_file_path,author:judge(full_name))"
        )
        .order("date_filed", desc=True)
        .limit(180)
        .execute()
        .data
        or []
    )
    selected = []
    skip_pattern = re.compile(r"revisions|order list|miscellaneous", re.I)
    for row in rows:
        if (
            row["id"] in used.get("cluster", set())
            or (row.get("court") or {}).get("remote_id") != "scotus"
            or skip_pattern.search(row.get("case_name") or "")
        ):
            continue
        source_text = opinion_text(supabase, row.get("opinions") or [])
        if not source_text:
            continue
        selected.append(
            {
                "record_key": f"cluster:{row['remote_id']}",
                "primary_record": {
                    "type": "cluster",
                    "external_id": row["remote_id"],
                },
                "record": {
                    key: value
                    for key, value in row.items()
                    if key not in {"opinions", "court"}
                },
                "source": {
                    "id": "source_1",
                    "label": f"CourtListener — {row['case_name']} opinion",
                    "url": (
                        f"https://www.courtlistener.com/opinion/"
                        f"{row['remote_id']}/{row['slug']}/"
                    ),
                },
                "source_text": source_text,
                "suggested_policy_area": "Law and Courts",
            }
        )
        if len(selected) == TARGET_COUNTS["cluster"]:
            return selected
    raise RuntimeError(f"Only found {len(selected)} usable Supreme Court clusters")


def output_schema(expected_count: int) -> Dict[str, Any]:
    item = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "record_key",
            "title",
            "dek",
            "points",
            "context_markdown",
            "policy_areas",
        ],
        "properties": {
            "record_key": {"type": "string"},
            "title": {"type": "string", "minLength": 1, "maxLength": 180},
            "dek": {
                "type": "string",
                "minLength": 1,
                "maxLength": MAX_GENERATED_DEK_LENGTH,
            },
            "points": {
                "type": "array",
                "minItems": 3,
                "maxItems": 5,
                "items": {"type": "string", "minLength": 1, "maxLength": 900},
            },
            "context_markdown": {"type": "string", "maxLength": 12000},
            "policy_areas": {
                "type": "array",
                "minItems": 1,
                "maxItems": 3,
                "items": {"type": "string", "minLength": 1, "maxLength": 100},
            },
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["briefs"],
        "properties": {
            "briefs": {
                "type": "array",
                "minItems": expected_count,
                "maxItems": expected_count,
                "items": item,
            }
        },
    }


def response_text(payload: Dict[str, Any]) -> str:
    for item in payload.get("output") or []:
        if item.get("type") != "message":
            continue
        for content in item.get("content") or []:
            if content.get("type") == "output_text":
                return content["text"]
    raise RuntimeError(f"OpenAI response contained no output text: {payload.get('status')}")


def dek_is_complete(value: Any) -> bool:
    """Return whether a generated dek ends like a complete sentence."""
    if not isinstance(value, str) or not value.strip():
        return False
    return bool(re.search(r'[.!?][\"\'\u2019\u201d)\]]*$', value.strip()))


def validate_generated_drafts(
    generated: List[Dict[str, Any]], records: List[Dict[str, Any]]
) -> None:
    expected = {item["record_key"] for item in records}
    actual = {item.get("record_key") for item in generated}
    if actual != expected or len(generated) != len(records):
        raise ValueError(
            f"wrong record set: expected {expected}, got {actual}"
        )

    invalid_deks = [
        str(item.get("record_key"))
        for item in generated
        if len(str(item.get("dek") or "").strip()) > MAX_GENERATED_DEK_LENGTH
        or not dek_is_complete(item.get("dek"))
    ]
    if invalid_deks:
        raise ValueError(
            "incomplete or overlong deks for " + ", ".join(invalid_deks)
        )


def generate_batch(
    records: List[Dict[str, Any]], model: str, api_key: str
) -> List[Dict[str, Any]]:
    source_packet = [
        {
            "record_key": item["record_key"],
            "record_metadata": item["record"],
            "suggested_policy_area": item["suggested_policy_area"],
            "source_text": item["source_text"],
        }
        for item in records
    ]
    instructions = (
        "You are the GovSource editorial desk. Write one concise news brief per "
        "record. Use only facts explicitly present in that record's metadata and "
        "source text. The headline must be catchy and journalistic: active, specific, "
        "plain-English, and accurate, without clickbait, partisan framing, predictions, "
        "or unsupported stakes. The dek should be one complete sentence of no more than "
        "280 characters, ending with sentence punctuation, that explains the action or "
        "holding and why it matters. Never truncate a word or sentence to meet the limit. "
        "Write 3 to 5 standalone factual points. For a bill, clearly call it a "
        "proposal unless enacted. For a court opinion, identify the holding, vote or "
        "author only when the source states it; distinguish majority opinions, dissents, "
        "concurrences, and procedural orders. Context should be one short paragraph and "
        "may be empty when the record supplies no additional context. Return each input "
        "record_key exactly once. Do not add citations or URLs to the prose."
    )
    request_payload = {
        "model": model,
        "store": False,
        "instructions": instructions,
        "input": json.dumps(source_packet, ensure_ascii=False),
        "text": {
            "format": {
                "type": "json_schema",
                "name": "govsource_brief_batch",
                "strict": True,
                "schema": output_schema(len(records)),
            },
            "verbosity": "medium",
        },
    }
    last_error: ValueError | None = None
    for attempt in range(1, MAX_GENERATION_ATTEMPTS + 1):
        request_payload["instructions"] = instructions + (
            " The prior attempt was rejected, so regenerate the entire batch and pay "
            f"special attention to this validation error: {last_error}."
            if last_error
            else ""
        )
        response = requests.post(
            OPENAI_RESPONSES_URL,
            json=request_payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=(20, 600),
        )
        if not response.ok:
            raise RuntimeError(
                f"OpenAI API failed ({response.status_code}): {response.text[:1000]}"
            )
        generated = json.loads(response_text(response.json()))["briefs"]
        try:
            validate_generated_drafts(generated, records)
        except ValueError as exc:
            last_error = exc
            logger.warning(
                "Rejecting generated batch attempt %d/%d: %s",
                attempt,
                MAX_GENERATION_ATTEMPTS,
                exc,
            )
            continue
        return generated

    raise RuntimeError(
        f"Model failed to produce complete deks after {MAX_GENERATION_ATTEMPTS} attempts: "
        f"{last_error}"
    )


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value[:150].rstrip("-")


def assemble_brief(source: Dict[str, Any], draft: Dict[str, Any], model: str) -> Dict[str, Any]:
    suffix = re.sub(r"[^a-z0-9]+", "-", source["record_key"].lower()).strip("-")
    slug = f"{slugify(draft['title'])}-{suffix}"[:180].rstrip("-")
    points = [
        {"id": f"point_{index}", "text": text.strip(), "source_refs": ["source_1"]}
        for index, text in enumerate(draft["points"], start=1)
    ]
    return {
        "title": draft["title"].strip(),
        "slug": slug,
        "dek": draft["dek"].strip(),
        "points": points,
        "context_markdown": draft["context_markdown"].strip() or None,
        "primary_record": source["primary_record"],
        "policy_areas": list(dict.fromkeys(draft["policy_areas"])),
        "sources": [source["source"]],
        "author_name": "GovSource Editorial",
        "editor_notes": None,
        "generation_metadata": {
            "model": model,
            "prompt_version": "balanced-journalistic-v2",
            "generated_on": date.today().isoformat(),
            "record_key": source["record_key"],
        },
    }


def chunks(items: List[Dict[str, Any]], size: int) -> Iterable[List[Dict[str, Any]]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", default=os.getenv("OPENAI_BRIEF_MODEL", DEFAULT_MODEL))
    parser.add_argument("--batch-size", type=int, default=3)
    args = parser.parse_args()
    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required")
    if not 1 <= args.batch_size <= 5:
        raise ValueError("--batch-size must be between 1 and 5")

    supabase = create_supabase_client()
    used = existing_primary_ids(supabase)
    groups = {
        "congress": select_congress(supabase, used),
        "executive_order": select_executive_orders(supabase, used),
        "cluster": select_clusters(supabase, used),
    }
    logger.info("Selected records: %s", {key: len(value) for key, value in groups.items()})

    generated_by_key: Dict[str, Dict[str, Any]] = {}
    source_by_key = {
        item["record_key"]: item for records in groups.values() for item in records
    }
    all_records = [item for records in groups.values() for item in records]
    for batch_number, batch in enumerate(chunks(all_records, args.batch_size), start=1):
        drafts = generate_batch(batch, args.model, api_key)
        generated_by_key.update({draft["record_key"]: draft for draft in drafts})
        briefs = [
            assemble_brief(source_by_key[key], generated_by_key[key], args.model)
            for key in generated_by_key
        ]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps({"briefs": briefs}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        logger.info(
            "Generated batch %d (%d/%d briefs)", batch_number, len(briefs), len(all_records)
        )

    manifest = json.loads(args.output.read_text(encoding="utf-8"))
    validate_manifest(manifest["briefs"])
    if len(manifest["briefs"]) != sum(TARGET_COUNTS.values()):
        raise RuntimeError("Manifest does not contain exactly 80 Briefs")
    logger.info("Validated manifest with %d Briefs at %s", len(manifest["briefs"]), args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
