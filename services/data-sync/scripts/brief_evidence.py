"""Versioned, complete text packets from the application's existing Storage buckets."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

import html2text

from generate_briefs_batch import congress_url

MAX_DOCUMENT_CHARS = 300_000
CHUNK_CHARS = 18_000


class EvidenceUnavailable(ValueError):
    pass


def fingerprint(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def clean_text(value: str, markup: bool = False) -> str:
    if markup:
        value = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', value, flags=re.I | re.S)
        value = html2text.html2text(value)
    return re.sub(r'\n{3,}', '\n\n', value).strip()


def read_text(db: Any, options: list[tuple[str, Any, bool]]) -> str:
    for bucket, path, markup in options:
        if not path:
            continue
        try:
            raw = db.storage.from_(bucket).download(path)
            text = clean_text(raw.decode('utf-8', errors='strict'), markup)
            if len(text) >= 120:
                if len(text) > MAX_DOCUMENT_CHARS:
                    raise EvidenceUnavailable('Source exceeds processing limit; full text must not be truncated')
                return text
        except EvidenceUnavailable:
            raise
        except Exception:
            continue
    raise EvidenceUnavailable('Complete readable source text is not yet stored; retry after source recovery')


def chunks(text: str) -> list[str]:
    """Cover every character, preserving paragraph breaks and stable chunk locators."""
    result = []
    while text:
        end = min(len(text), CHUNK_CHARS)
        if end < len(text):
            boundary = text.rfind('\n', end // 2, end)
            if boundary > 0:
                end = boundary + 1
        result.append(text[:end])
        text = text[end:]
    return result


def build_packet(db: Any, source_type: str, row: dict) -> dict:
    documents = []
    if source_type == 'bill':
        versions = row.get('texts') or []
        if not versions:
            raise EvidenceUnavailable('Bill text has not arrived')
        latest_date = max(str(t.get('date') or '') for t in versions)
        latest = [t for t in versions if str(t.get('date') or '') == latest_date]
        if len(latest) != 1:
            raise EvidenceUnavailable('Latest bill text version is ambiguous')
        version = latest[0]
        if row.get('law_enacted_date') and not re.search(r'enrolled|public law|private law', str(version.get('type')), re.I):
            raise EvidenceUnavailable('Enacted bill is missing its enrolled or law text')
        action = (row.get('actions') or [{}])[0]
        if (str(action.get('date') or '')[:10] > str(version.get('date') or '')[:10]
                and re.search(r'passed|agreed to|amend', str(action.get('text')), re.I)):
            raise EvidenceUnavailable('Latest legislative action is newer than the stored text; await matching text')
        text = read_text(db, [('bill-htmls', version.get('html_file_path'), True), ('bill-xmls', version.get('xml_file_path'), True)])
        documents.append((f"Bill text: {version.get('type')} ({version.get('date')})", version.get('html_url') or version.get('xml_url') or congress_url(row), text))
        # Actions are an explicit source, separate from potentially older bill text.
        documents.append(('Congress.gov bill status and actions', congress_url(row), json.dumps({k: row.get(k) for k in ('title','introduced_date','law_enacted_date','law_number','actions')}, ensure_ascii=False)))
        item_type = 'law' if row.get('law_enacted_date') else 'bill'
        latest_action = (row.get('actions') or [{}])[0]
        development = fingerprint({'action': latest_action, 'version': version.get('type'), 'date': version.get('date'), 'law': row.get('law_enacted_date')})
        priority = 95 if item_type == 'law' else 65 if re.search('passed|agreed to', str(latest_action.get('text')), re.I) else 35
    elif source_type == 'agency_document':
        text = read_text(db, [('agency-docs', row.get('html_file_path'), True), ('agency-docs', row.get('xml_file_path'), True)])
        number = row['remote_document_number']
        documents.append((row['title'], f'https://www.federalregister.gov/d/{number}', text))
        item_type = 'executive_order' if row.get('subtype') == 'Executive Order' else 'agency_document'
        development = str(number)  # Corrections to the same document are held for explicit correction, not duplicate stories.
        priority = 90 if item_type == 'executive_order' else 70 if row.get('type') in ('Rule','Proposed Rule') else 30
    elif source_type == 'cluster':
        if row.get('court') != 'scotus':
            raise EvidenceUnavailable('Initial court coverage is Supreme Court only')
        opinions = row.get('opinions') or []
        if not opinions or not any(o.get('type') in ('010combined','020lead') for o in opinions):
            raise EvidenceUnavailable('Lead or combined opinion not available')
        for opinion in opinions:
            text = read_text(db, [('opinions', opinion.get('text_file_path'), False), ('opinions', opinion.get('html_file_path'), True)])
            documents.append((f"{row['case_name']} — opinion {opinion['remote_id']} ({opinion.get('type')})", f"https://www.courtlistener.com/opinion/{row['remote_id']}/{row['slug']}/", text))
        item_type, development, priority = 'cluster', str(row['remote_id']), 85
    else:
        raise EvidenceUnavailable('Unsupported source')
    if sum(len(d[2]) for d in documents) > MAX_DOCUMENT_CHARS:
        raise EvidenceUnavailable('Combined source packet exceeds processing limit')
    sources, passages = [], []
    for i, (label, url, text) in enumerate(documents, 1):
        source_id = f'source_{i}'
        sources.append({'id': source_id, 'label': label[:160], 'url': url})
        for n, part in enumerate(chunks(text), 1):
            passages.append({'id': f'{source_id}_section_{n}', 'source_id': source_id, 'text': part})
    return {'item_type': item_type, 'development_key': f'{source_type}:{row["id"]}:{development}', 'priority': priority, 'sources': sources, 'passages': passages}
