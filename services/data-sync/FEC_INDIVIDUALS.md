# Individual contributions, employer and occupation summaries

This extends the committee-contribution feature with itemized individual receipts
from OpenFEC's processed `/v1/schedules/schedule_a/` endpoint. The initial scope is
House/Senate principal and authorized campaign committees already linked to a
GovSource Congress member through the verified FEC/Bioguide mapping.

## Scope and interpretation

Requests use `line_number=F3-11AI`, `is_individual=true`, the selected
`two_year_transaction_period`, and the receiving campaign's committee ID.
Memo entries (`memo_code=X` or `memoed_subtotal=true`) are excluded. Signed
corrections are retained. Data is not net of refunds and excludes unitemized
contributions; these totals are not complete individual fundraising totals.
Transaction counts are not counts of unique people. No cross-record donor
identity matching is attempted.

Stored contributor fields are name, city, state, employer and occupation.
Street addresses are not imported. Amounts use `numeric(18,2)` and decimal
strings during ingestion. Original transaction, filing, image and election
identifiers and FEC source links are retained. Dates outside the selected
reporting period and missing dates are preserved.

Employer and occupation summaries derive from these same published records,
rather than the separate OpenFEC aggregate endpoints, so scope, exclusions and
refresh dates agree with the transaction list. Only capitalization and whitespace
are normalized. Spelling variants and employer aliases are not merged. Blank
fields form a separate missing-information bucket; reported values such as
RETIRED, SELF-EMPLOYED and NOT EMPLOYED remain visible.

Employer totals mean contributions by people reporting that employer, not
contributions by the employer. Industry classification is explicitly out of scope.

## Storage and publication

- `fec_individual_contribution`: public, itemized records keyed by reporting
  period, receiving committee and exact FEC `sub_id`.
- `fec_individual_coverage`: public metadata for completed campaign imports,
  including completion time, record count and signed total.
- `fec_individual_group_totals`: public SQL view grouped by campaign, reporting
  period, employer or occupation, with totals and record counts.
- `private.fec_individual_sync` and `private.fec_individual_stage`: service-only
  leases, resumable cursors and staging. A failed or partial import retains the
  previous publication. Publication atomically replaces one campaign's records
  and coverage metadata, then removes staging. Repeating publication with the
  same successful token is safe.
- `fec_individual_import_queue`: service-only view of unambiguously linked
  member campaigns. The importer checks the receipt's current FEC candidate
  association against this mapping and fails if attribution changed.

The frontend independently excludes ambiguous campaign links, even if a link
changes after a previous import. It combines a member's eligible campaigns and
labels partial coverage. A completed zero-record scan is distinguished from a
campaign that has never published. Summary queries page past the database's
default row limit, and transactions use stable pagination with missing dates last.

Public tables have SELECT-only RLS policies for readers. Import functions use
security-invoker permissions and are executable only by the service role.
Supabase's [public-schema exposure notices](https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed)
reflect intentional public data access. Its [no-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
for private staging/state reflect intentional default-deny access.

## Commands and scheduled refreshes

From `services/data-sync`, using the existing FEC and Supabase environment variables:

```sh
# Read-only pilot; no Supabase credentials required.
python scripts/sync_fec_individuals.py --cycle 2026 --committee C00546358 --max-requests 30

# Publish one eligible campaign.
python scripts/sync_fec_individuals.py --cycle 2026 --committee C00546358 --max-requests 30 --write

# Process eligible member campaigns, never-published first, then oldest refresh.
python scripts/sync_fec_individuals.py --write

# Explicit recovery when upstream records changed during a scan.
python scripts/sync_fec_individuals.py --committee C00546358 --restart --write
```

The independent `fec-individuals.yml` workflow runs Sundays at 10:43 UTC, with a
four-hour timeout and a 2,200-attempt budget at four seconds between attempts.
It shares the `govsource-fec` concurrency lock with the party/PAC job to avoid
concurrent quota use. It is activated when the workflow is pushed to the default
branch and reuses the existing secrets. Manual dispatch supports a reporting
period and optional receiving committee; it can resume a partial backfill.

Exit 0 means the selected queue completed, 2 means a request/quota budget stopped
the run with resumable progress, and 1 means a failure. Completed campaigns stay
published even when a later campaign pauses. An initial nationwide backfill may
require multiple runs; the UI never claims complete coverage before publication.
Only the current reporting period refreshes automatically; older periods require
an explicit run. Candidate/committee discovery still comes from the party/PAC
import, so this is not a catalog of every campaign with individual donations.

## Verification

The first live scans on September 20, 2026 published 532 Carson campaign records
totaling $360,173.25 (two memo records excluded) and 185 Adams campaign records
totaling $82,310.00. Both employer and occupation summaries reconcile to those
signed totals. Further campaigns are populated by the resumable backfill.

Python tests cover filtering, field allowlisting, corrections, missing values,
exact IDs, pagination/resume, attribution changes and duplicate conflicts.
Database tests cover atomic replacement, rollback, empty completed scans,
summary reconciliation, leases and public/service-only access. Frontend tests
cover multiple campaigns, ambiguity, partial coverage, complete summary
pagination, missing values and error handling.
