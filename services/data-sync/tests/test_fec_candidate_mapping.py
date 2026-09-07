from types import SimpleNamespace

import pytest

from map_fec_candidates import MappingError, apply_mappings, fetch_crosswalk, index_crosswalk, plan_mappings, read_rows


MEMBERS = [{'id': 10, 'bioguide_id': 'C001072', 'full_name': 'André Carson'},
           {'id': 20, 'bioguide_id': 'S000033', 'full_name': 'Another Member'}]


def candidate(cid='H8IN07184', existing=None):
    return {'candidate_id': cid, 'name': 'CARSON, ANDRE', 'congressman_id': existing}


def source(bioguide='C001072', fec=None):
    return {'id': {'bioguide': bioguide, 'fec': fec if fec is not None else ['H8IN07184']}}


def test_exact_identifiers_link_despite_name_formatting():
    plan = plan_mappings([candidate()], MEMBERS, index_crosswalk([source()]))
    assert plan[0]['status'] == 'proposed'
    assert plan[0]['congressman_id'] == 10


def test_multiple_fec_ids_per_member_and_historical_duplicates():
    index = index_crosswalk([source(fec=['H8IN07184', 'S8IN00001', 'P80000001']), source()])
    plan = plan_mappings([candidate(), candidate('S8IN00001')], MEMBERS, index)
    assert [row['congressman_id'] for row in plan] == [10, 10]
    assert 'P80000001' not in index


def test_challenger_with_same_name_is_not_matched():
    plan = plan_mappings([candidate('H8IN00001')], MEMBERS, index_crosswalk([source()]))
    assert plan[0]['status'] == 'no_crosswalk_match'
    assert 'congressman_id' not in plan[0]


@pytest.mark.parametrize('existing,status', [(10, 'already_linked'), (20, 'existing_link_conflict')])
def test_preserves_existing_links(existing, status):
    plan = plan_mappings([candidate(existing=existing)], MEMBERS, index_crosswalk([source()]))
    assert plan[0]['status'] == status
    assert plan[0]['existing_congressman_id'] == existing


def test_existing_link_without_crosswalk_is_preserved():
    plan = plan_mappings([candidate('H8IN00001', 10)], MEMBERS, index_crosswalk([source()]))
    assert plan[0]['status'] == 'retained_no_crosswalk'


def test_crosswalk_conflicts_are_not_resolved_by_taking_first():
    index = index_crosswalk([source(), source('S000033')])
    plan = plan_mappings([candidate()], MEMBERS, index)
    assert plan[0]['status'] == 'ambiguous_crosswalk'
    assert set(plan[0]['bioguide_ids']) == {'C001072', 'S000033'}


def test_missing_or_duplicate_database_member_is_unresolved():
    index = index_crosswalk([source()])
    assert plan_mappings([candidate()], [], index)[0]['status'] == 'member_not_in_database'
    assert plan_mappings([candidate()], MEMBERS + [MEMBERS[0]], index)[0]['status'] == 'ambiguous_database_member'


@pytest.mark.parametrize('rows', [[], [{}], [source(fec='H8IN07184')], [source(bioguide=None)], [source(fec=['broken'])]])
def test_invalid_crosswalk_fails_closed(rows):
    with pytest.raises(MappingError):
        index_crosswalk(rows)


def test_crosswalk_downloads_both_files_from_one_immutable_commit():
    urls = []
    revision = 'a' * 40
    class Session:
        def get(self, url, **kwargs):
            urls.append(url)
            body = {'sha': revision} if len(urls) == 1 else [source()]
            return SimpleNamespace(raise_for_status=lambda: None, json=lambda: body, content=b'file')
    rows, provenance = fetch_crosswalk(session=Session())
    assert len(rows) == 2
    assert provenance['revision'] == revision
    assert len(provenance['files']) == 2
    assert all('/' + revision + '/' in url for url in urls[1:])


class FakeDB:
    def __init__(self, rows, concurrent=None):
        self.rows, self.concurrent, self.writes = rows, concurrent, []
    def table(self, name):
        db = self
        class Query:
            changes = None
            expected_null = False
            selected = None
            start, end = 0, 99999
            def select(self, columns): return self
            def order(self, order): return self
            def range(self, start, end):
                self.start, self.end = start, end
                return self
            def update(self, changes):
                self.changes = changes
                return self
            def eq(self, column, value):
                self.selected = value
                return self
            def is_(self, column, value):
                assert column == 'congressman_id' and value == 'null'
                self.expected_null = True
                return self
            def execute(self):
                rows = [r for r in db.rows if self.selected is None or r['candidate_id'] == self.selected]
                if self.changes:
                    assert self.expected_null, 'write must condition on still-null link'
                    if db.concurrent is not None:
                        rows[0]['congressman_id'] = db.concurrent
                    rows = [r for r in rows if r['congressman_id'] is None]
                    for r in rows:
                        r.update(self.changes)
                        db.writes.append(r.copy())
                return SimpleNamespace(data=rows[self.start:self.end+1])
        return Query()


def test_apply_then_rerun_is_idempotent():
    db = FakeDB([candidate()])
    crosswalk = index_crosswalk([source()])
    plan = plan_mappings(db.rows, MEMBERS, crosswalk)
    apply_mappings(db, plan)
    assert plan[0]['status'] == 'linked'
    assert db.rows[0]['congressman_id'] == 10
    plan = plan_mappings(db.rows, MEMBERS, crosswalk)
    apply_mappings(db, plan)
    assert plan[0]['status'] == 'already_linked'
    assert len(db.writes) == 1


def test_concurrent_mapping_is_not_overwritten():
    db = FakeDB([candidate()], concurrent=20)
    plan = plan_mappings(db.rows, MEMBERS, index_crosswalk([source()]))
    apply_mappings(db, plan)
    assert plan[0]['status'] == 'verification_conflict'
    assert db.rows[0]['congressman_id'] == 20
    assert not db.writes


def test_conflict_is_never_written():
    db = FakeDB([candidate(existing=20)])
    plan = plan_mappings(db.rows, MEMBERS, index_crosswalk([source()]))
    apply_mappings(db, plan)
    assert not db.writes


def test_database_pagination_reads_beyond_default_limits():
    db = FakeDB([{'id': n} for n in range(1501)])
    assert len(read_rows(db, 'congressman', 'id', 'id')) == 1501
