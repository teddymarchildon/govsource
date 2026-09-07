# FEC committee contributions: implemented v1

This replaces the earlier, larger proposal. The first version answers which
political committees gave money to which House and Senate campaigns.

## Source and scope

[OpenFEC Swagger](https://api.open.fec.gov/swagger/) was downloaded and inspected
on September 6, 2026. `tests/fixtures/openfec_schema.json` preserves the relevant
schema excerpt and full-download SHA-256. `fec_receipts.json` contains four real
API records with unnecessary fields removed. Neither fixture contains API keys.

Use processed `/v1/schedules/schedule_a/` with these filters:

- `two_year_transaction_period`: selected even-numbered reporting period.
- `line_number=F3-11B`: political party committee contributions.
- `line_number=F3-11C`: other political committee contributions.
- `recipient_committee_type=H` and `S`.
- `recipient_committee_designation=P` and `A` (principal/authorized campaigns).

Read the receiving campaign's records only. Exclude `memo_code=X`,
`memoed_subtotal=true`, and explicit individual records from totals. Retain
signed corrections. These are reported contributions, **not net of refunds**.
Independent spending, joint fundraising transfers, loans, individual donors,
employer groupings, and presidential campaigns are outside v1.

Unknown contributor committee IDs remain null with their reported group name;
they are not silently discarded or matched by name. The FEC reporting period
does not guarantee that every receipt date lies in those two calendar years.
Actual responses include old dates; preserve both source fields.

## Models and field mapping

| Table | Key | Contents |
|---|---|---|
| `fec_candidate` | `candidate_id` | Name, office, state, district, party; optional existing `congressman.id` FK |
| `fec_committee` | `committee_id` | Name, committee type, designation, organization type |
| `fec_candidate_committee` | Candidate + committee + cycle | Relationship from cycle-specific nested `committee.candidate_ids` |
| `fec_committee_contribution` | Cycle + `sub_id` | Giving/receiving committees, reported group name, exact amount, receipt date, source IDs/link |
| `fec_sync_state` | Cycle | Lease, checkpoint, status, last successful scope/refresh, last nationwide refresh |

`private.fec_stage` is temporary database staging for resumable pages. It is
cleared after publication. There is no permanent snapshot history or separate
summary table; `fec_group_candidate_totals` is a calculated SQL view.

Receipt mappings: `contributor_id` becomes `giving_committee_id`, `committee_id`
becomes `receiving_committee_id`, `contribution_receipt_amount` becomes `amount`,
and `contribution_receipt_date` becomes `receipt_date`. Preserve `sub_id`,
`transaction_id`, `file_number`, `image_number`, `receipt_type`,
`amendment_indicator`, `election_type`, `fec_election_year`, and `pdf_url`.
Do not substitute `contributor_aggregate_ytd` for a transaction amount or the
receipt's standalone `candidate_id` for the recipient committee's candidate.

Candidate identities come from `/v1/candidates/?candidate_id=...` in batches.
Only candidates associated with imported direct contributions are loaded,
including challengers and former candidates. This is not a catalog of candidates
with zero contributions. Names are not automatically matched to existing
Congress members. Verified member links can be added later and survive refreshes.

Multi-candidate committee links are retained as evidence but excluded from the
candidate totals view to avoid multiplying money. Inspect those mappings before
adding attribution rules. Missing coverage must not be interpreted as zero.

FEC IDs and pagination indices retain their exact representation, including
large `sub_id` values. Money uses `numeric(18,2)`, sent as decimal strings.

## Import behavior

1. Acquire an expiring lease for the reporting period.
2. Scan both lines through all receipt pages using the returned
   `pagination.last_indexes`, including its null-date transition. Require an
   empty page; approximate counts or short pages do not establish completion.
3. Commit each staged page and next cursor in one transaction.
4. Resolve all recipient candidate IDs through the official candidates endpoint.
5. Atomically replace the selected period/scope and its relationships, then clear
   staging. Removed/amended receipts disappear from published totals.

Failed or incomplete imports retain the previous published data. Exit `2` means
partial due to a request/cooldown budget, `1` means failure, and `0` means the
selected scope completed. `--restart` discards incomplete staging, never the
published data. Changing a pending scope requires that explicit option.

OpenFEC does not provide a transactionally frozen dataset across requests.
Weekly full rescans repair drift from upstream changes; a changed duplicate
`sub_id` fails instead of silently overwriting staging. For a known unstable
scan, restart rather than reuse its cursor. This first version does not promise
to detect every upstream amendment made during a multi-hour scan.

## Local setup and commands

Add `FEC_API_KEY` to Git-ignored `services/.env` or `services/data-sync/.env`.
The latter takes precedence; process environment variables take precedence over
both files. Writes also require `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (legacy `SUPABASE_KEY` is accepted).

From `services/data-sync`:

```bash
# Read-only pilot, without Supabase credentials.
python scripts/sync_fec_donations.py --cycle 2026 --committee C00442921 --max-requests 30

# Same small scope written to Supabase after the migration.
python scripts/sync_fec_donations.py --cycle 2026 --committee C00442921 --max-requests 30 --write

# Nationwide current-period import; rerun to resume after request exhaustion.
python scripts/sync_fec_donations.py --write

# Explicit historical refresh/recovery.
python scripts/sync_fec_donations.py --cycle 2024 --write
```

Defaults: 2,200 HTTP attempts, 100 records/page, four seconds between attempts.
Retries also consume the budget. Long quota cooldowns yield a partial run.
Unknown exception messages and response bodies are not logged because they may
contain query-string credentials.

## Weekly activation

`data-sync-weekly.yml` retains 06:43 UTC Sunday. FEC runs independently with the
`govsource-fec` lock and a four-hour timeout; the reference job keeps its existing
CourtListener lock. FEC does not depend on member ingestion because its own
candidate IDs cover challengers and the member link is optional.

The migration was applied to hosted `govlens`. To activate the workflow, add
`FEC_API_KEY` to GitHub Actions secrets and deploy the repository changes. A local
key is not automatically uploaded to Actions. Existing Supabase secrets are reused.
The automatic import refreshes the current period only; older corrections need
an explicit `--cycle` run.

The schema probe reported roughly 178,000 source rows for 2026 before exclusions.
A nationwide first import can take hours under the default API quota. Request
exhaustion marks the job partial/nonzero; rerun manually to resume rather than
waiting until the next Sunday. `last_full_success_at` remains null until a
nationwide import completes; a successful pilot does not claim full coverage.

## Queries

```sql
-- Groups contributing to a candidate.
select group_name, giving_committee_id, total_amount, contribution_count
from public.fec_group_candidate_totals
where candidate_id = 'H8IN07184' and cycle = 2026
order by total_amount desc;

-- Candidates receiving a group's contributions.
select candidate_name, candidate_id, office, state, total_amount
from public.fec_group_candidate_totals
where giving_committee_id = 'C00108613' and cycle = 2026
order by total_amount desc;

-- ETL-only coverage check.
select cycle, status, published_scope, published_rows,
       last_success_at, last_full_success_at
from public.fec_sync_state;
```

## Verification and access

The live pilot fetched 294 source rows, excluded eight, and imported 286
contributions for Andre Carson's campaign: $506,242 in signed contributions from
165 identified committees for reporting period 2026.

A deliberately budget-limited hosted rerun stopped after two requests and kept
all 286 published rows and their $506,242 total available. Resuming used five
more requests and finished with the same 286 rows, without duplicates.

Python tests cover real-schema fields, source responses, exclusions, decimal
amounts, null/old dates, request limits, secret-safe errors, pagination,
attribution, duplicate handling, and resume. PostgreSQL tests cover atomic
replacement/deletion, rollback, leases, incomplete imports, ambiguity, exact
totals, and public versus service-only permissions.

Published data is intentionally publicly readable with RLS. Sync state, staging,
and import functions are service-only. Supabase
[schema exposure notices](https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed)
describe intended published-data read access; its
[no-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
for staging/state reflect intentional default-deny access.

No page or navigation changes are included in this data-source implementation.
