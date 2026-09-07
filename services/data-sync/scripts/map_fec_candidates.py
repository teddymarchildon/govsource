#!/usr/bin/env python3
"""Backfill FEC candidate -> Congress member links using exact identifier pairs.

Dry run by default. Uses both current and historical congress-legislators files
at one immutable revision. Never infers identity from a person's name.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import re

from dotenv import load_dotenv
import requests

from sync_common import build_http_session, create_supabase_client, DEFAULT_TIMEOUT

REPOSITORY = 'unitedstates/congress-legislators'
FILES = ('legislators-current.json', 'legislators-historical.json')


class MappingError(RuntimeError):
    pass


def fetch_crosswalk(source_ref=None, session=None):
    session = session or build_http_session()
    try:
        if source_ref is None:
            response = session.get(f'https://api.github.com/repos/{REPOSITORY}/commits/gh-pages', timeout=DEFAULT_TIMEOUT)
            response.raise_for_status()
            source_ref = response.json().get('sha')
        if not isinstance(source_ref, str) or not re.fullmatch(r'[0-9a-f]{40}', source_ref):
            raise MappingError('Crosswalk revision must be a full Git commit SHA')
        rows, files = [], []
        for filename in FILES:
            url = f'https://raw.githubusercontent.com/{REPOSITORY}/{source_ref}/{filename}'
            response = session.get(url, timeout=DEFAULT_TIMEOUT)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, list) or not payload:
                raise MappingError('Crosswalk file is empty or is not a list')
            rows.extend(payload)
            files.append({'url': url, 'sha256': hashlib.sha256(response.content).hexdigest(), 'records': len(payload)})
        return rows, {'repository': f'https://github.com/{REPOSITORY}', 'revision': source_ref, 'files': files}
    except (requests.RequestException, ValueError, AttributeError):
        raise MappingError('Unable to fetch or parse the public identifier crosswalk') from None


def index_crosswalk(rows):
    """Keep every Bioguide association so conflicting source IDs stay ambiguous."""
    index = defaultdict(set)
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get('id'), dict):
            raise MappingError('Invalid crosswalk record')
        ids = row['id']
        fec_ids = ids.get('fec') or []
        if not isinstance(fec_ids, list):
            raise MappingError('Crosswalk FEC IDs must be a list')
        for fec_id in fec_ids:
            if not isinstance(fec_id, str):
                raise MappingError('Invalid crosswalk FEC ID')
            if fec_id.startswith('P'):
                continue  # Presidential candidacies are outside the donation model.
            if not re.fullmatch(r'[HS][0-9A-Z]{8}', fec_id):
                raise MappingError('Invalid congressional FEC ID in crosswalk')
            bioguide = ids.get('bioguide')
            if not isinstance(bioguide, str) or not re.fullmatch(r'[A-Z][0-9]{6}', bioguide):
                raise MappingError('FEC crosswalk entry has no valid Bioguide ID')
            index[fec_id].add(bioguide)
    if not index:
        raise MappingError('Crosswalk contains no congressional FEC IDs')
    return index


def read_rows(db, table, columns, order):
    """Page past Supabase's default row limit using a stable unique ordering."""
    rows, offset, seen = [], 0, set()
    while True:
        response = db.table(table).select(columns).order(order).range(offset, offset + 499).execute()
        page = response.data
        if not isinstance(page, list):
            raise MappingError('Database query did not return a row list')
        if not page:
            return rows
        for row in page:
            identity = row[order]
            if identity in seen:
                raise MappingError('Database pagination repeated an identifier; rerun the mapping')
            seen.add(identity)
        rows.extend(page)
        offset += len(page)


def plan_mappings(candidates, members, crosswalk):
    members_by_bioguide = defaultdict(list)
    for member in members:
        members_by_bioguide[member['bioguide_id']].append(member)
    plan = []
    for candidate in candidates:
        existing = candidate.get('congressman_id')
        item = {'candidate_id': candidate['candidate_id'], 'candidate_name': candidate['name'],
                'existing_congressman_id': existing}
        matches = sorted(crosswalk.get(candidate['candidate_id'], set()))
        if not matches:
            item['status'] = 'retained_no_crosswalk' if existing is not None else 'no_crosswalk_match'
        elif len(matches) != 1:
            item.update(status='ambiguous_crosswalk', bioguide_ids=matches)
        else:
            bioguide = matches[0]
            item['bioguide_id'] = bioguide
            member_rows = members_by_bioguide.get(bioguide, [])
            if not member_rows:
                item['status'] = 'member_not_in_database'
            elif len(member_rows) > 1:
                item['status'] = 'ambiguous_database_member'
            else:
                member = member_rows[0]
                item.update(congressman_id=member['id'], member_name=member.get('full_name'))
                if existing is None:
                    item['status'] = 'proposed'
                elif str(existing) == str(member['id']):
                    item['status'] = 'already_linked'
                else:
                    item['status'] = 'existing_link_conflict'
        plan.append(item)
    return plan


def apply_mappings(db, plan):
    """Set only still-null links; never overwrite a concurrent or existing link."""
    for item in plan:
        if item['status'] != 'proposed':
            continue
        result = (db.table('fec_candidate').update({'congressman_id': item['congressman_id']})
                  .eq('candidate_id', item['candidate_id']).is_('congressman_id', 'null').execute())
        if result.data:
            item['status'] = 'linked'
        else:
            # A concurrent mapping can make the conditional update a no-op.
            item['status'] = 'concurrent_change'
        current = (db.table('fec_candidate').select('congressman_id')
                   .eq('candidate_id', item['candidate_id']).execute().data)
        if not current or str(current[0]['congressman_id']) != str(item['congressman_id']):
            item['status'] = 'verification_conflict'
        elif item['status'] == 'concurrent_change':
            item['status'] = 'already_linked'


def main(argv=None):
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / '.env')
    load_dotenv(root.parent / '.env')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Apply only exact, unambiguous ID matches')
    parser.add_argument('--source-ref', help='Pin to a full congress-legislators gh-pages commit SHA')
    parser.add_argument('--report', type=Path, help='Save the JSON plan/results and source provenance')
    args = parser.parse_args(argv)
    for name in ('urllib3', 'httpx', 'httpcore'):
        logging.getLogger(name).setLevel(logging.WARNING)
    report = {'generated_at': datetime.now(timezone.utc).isoformat(), 'write': args.write, 'matches': []}
    try:
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
        rows, report['source'] = fetch_crosswalk(args.source_ref)
        crosswalk = index_crosswalk(rows)
        db = create_supabase_client()
        candidates = read_rows(db, 'fec_candidate', 'candidate_id,name,congressman_id', 'candidate_id')
        members = read_rows(db, 'congressman', 'id,bioguide_id,full_name', 'id')
        report['matches'] = plan_mappings(candidates, members, crosswalk)
        # Save the proposed plan before any writes, then replace it with results.
        if args.report:
            args.report.write_text(json.dumps(report, indent=2) + '\n')
        if args.write:
            apply_mappings(db, report['matches'])
        report['counts'] = dict(Counter(item['status'] for item in report['matches']))
        report['status'] = 'completed'
        exit_code = 0
        if any(item['status'] in ('ambiguous_crosswalk', 'ambiguous_database_member', 'existing_link_conflict', 'verification_conflict')
               for item in report['matches']):
            report['status'] = 'review_required'
            exit_code = 2
    except Exception as exc:
        report['status'] = 'failed'
        report['error'] = str(exc) if isinstance(exc, MappingError) else f'{type(exc).__name__}: mapping failed'
        exit_code = 1
    output = json.dumps(report, indent=2) + '\n'
    if args.report:
        args.report.write_text(output)
    print(output, end='')
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
