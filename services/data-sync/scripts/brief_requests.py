"""Prepare editor-requested sources for the existing verified-draft pipeline."""
import logging
import time
from brief_evidence import build_packet


def discover_requests(db, deadline):
    requests = db.table('brief_generation_request').select('*').eq('status', 'queued').order('id').limit(5).execute().data or []
    for request in requests:
        if time.monotonic() >= deadline:
            break
        try:
            kind, item_id = request['source_type'], request['item_id']
            change = db.table('brief_source_change').select('revision').eq('item_type', kind).eq('item_id', item_id).single().execute().data
            row = db.rpc('brief_source_bundle', {'p_type': kind, 'p_id': item_id}).execute().data
            if not row:
                raise ValueError('Source record no longer exists')
            packet = build_packet(db, kind, row)
            db.rpc('enqueue_requested_brief', {'p_request': request['id'], 'p_revision': change['revision'],
                'p_item_type': packet['item_type'], 'p_metadata': row, 'p_evidence': packet,
                'p_development': packet['development_key']}).execute()
        except Exception as exc:
            # Preserve the request and show the actual preparation failure to the editor.
            # Compare status so a concurrent successful preparation is never overwritten.
            db.table('brief_generation_request').update({'status': 'failed', 'error': str(exc)[:1000]}).eq(
                'id', request['id']).eq('status', 'queued').execute()
            logging.getLogger(__name__).warning('Editorial request %s: %s', request['id'], exc)
