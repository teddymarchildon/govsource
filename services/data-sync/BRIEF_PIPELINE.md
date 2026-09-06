# Continuous brief pipeline

The pipeline uses the existing Congress.gov, Federal Register and Supreme Court / CourtListener records and Storage buckets. It creates structured briefs in the existing `brief` table. GitHub Actions runs bounded workers; Supabase holds durable progress.

## Deployment and activation

1. Apply `apps/web/supabase/migrations/20260906223838_continuous_brief_pipeline.sql` and the subsequent `brief_source_refresh_tracking` migration to the existing project. It is additive, enables RLS on internal tables, restricts worker functions to `service_role`, and starts automatic publication **paused**. The migration does not seed records, call models, or publish anything.
2. Deploy the application and workflow changes. Existing repository secrets are reused: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CONGRESS_API_KEY`, `COURT_LISTENER_API_KEY`, `OPENAI_API_KEY`. The web application needs its existing server-side Supabase credentials and admin authentication.
3. Set repository variable `BRIEF_PIPELINE_ENABLED=true`. This enables the new workflows and disables the legacy daily sync. Keep this variable false or absent until the migration is installed. The global Actions switch is separate from the database publication switch.
4. Run the weekly reference workflow and the source workflows manually once, then run **Generate and verify briefs**. Source success is required before discovery/publication. Optional bootstrap: `python scripts/process_briefs.py --seed-days 30 --discover-only`. This queues unbriefed existing records and excludes records already covered. It does not mark an incomplete source run successful.
5. Inspect `/admin/pipeline`. Evaluate unpublished results against a checked historical benchmark covering all four source types, including complex opinions, exemptions and effective dates. Unit tests and a model agreeing with itself are not a measured editorial accuracy rate. Publication should remain paused until the benchmark is satisfactory.
6. Enable automatic publication in `/admin/pipeline`. Verified jobs will become public on the next processing run. Start with the default cap of 30 publications and $5 of accounted AI usage per UTC day. Pause is checked transactionally on every publication; it does not stop discovery/generation.

Changes to Actions schedules only take effect after the workflow files reach the repository default branch. Enabling a variable on an unmerged branch does not deploy its code. GitHub schedule timing is best effort; the database queue survives delayed or dropped runs.

## Workflows

| Workflow | Schedule | Lock |
| --- | --- | --- |
| `sync-congress.yml` | Every two hours | Congress |
| `sync-federal-register.yml` | Hourly | Federal Register |
| `sync-courtlistener.yml` | Daily | CourtListener |
| `brief-processing.yml` | Every 30 minutes | Brief processor |
| `brief-source-recovery.yml` | Daily | Federal Register |
| `brief-pipeline-health.yml` | Every four hours | Health check |
| Existing weekly reference workflow | Weekly | CourtListener |

The manual Federal Register recovery workflow uses the same source lock and wrapper when the pipeline is enabled. Court reference refreshes share the request allowance but have a separate health record. Topic classification has its own Actions group and does not gate publication.

Configure GitHub failed-workflow notifications to receive health/failure alerts. Health checks fail on stale sources, expired workers, backlog older than 24 hours, and repeatedly unavailable evidence. Successful runs produce logs without messages to external channels.

## Models and cost controls

Defaults retain `gpt-5-mini` for writing and use a separate, independent verification request. The verifier receives all original passages, not only the extracted facts. `OPENAI_BRIEF_MODEL` and `OPENAI_BRIEF_VERIFIER_MODEL` can be overridden as repository variables.

`BRIEF_PRICING_MODELS` lists the models covered by the configured pricing ceilings. If either selected model is missing, the worker refuses to call the API. Set `BRIEF_INPUT_USD_PER_MILLION` and `BRIEF_OUTPUT_USD_PER_MILLION` to ceilings that cover **both** models, including reasoning output. Default workflow values are 0.25 and 2.00 for `gpt-5-mini`; recheck provider pricing before changing models. These are accounted estimates, not a provider invoice.

Before each call, the database serializes a conservative reservation against the UTC daily budget. Completed calls record response ID, tokens, model and estimated cost. An uncertain request retains the entire reservation. No automatic HTTP retry can create an unreserved model request. Budget exhaustion defers work to the next UTC day without consuming a failure attempt. Daily publication limits also apply to automated corrections.

## Data models

- `brief_pipeline_settings`: publication pause and daily limits.
- `brief_source_run`: source leases, health and ingestion checkpoints.
- `brief_source_change`: durable changes captured by database triggers, revision checks and source-recovery errors.
- `brief_job`: immutable source metadata/evidence packet, content fingerprint, development identity, selection priority, persistent work, lease and outcome.
- `brief_attempt`: the completed draft, claim evidence, verification report and model/prompt provenance.
- `brief_api_call`: per-call reservation and usage accounting.
- `brief_revision`: previous published/editorial versions saved before updates.
- `brief_upstream_usage`: daily CourtListener API request accounting shared with court reference refreshes.

The browser cannot access these tables directly. Admin endpoints use existing server-side authorization. Public readers continue using the existing published-brief rules. Pipeline API responses are not cached.

## Recovery and publication guarantees

Congress scans a frozen update-time window and saves progress after completed pages. It overlaps the next window by two hours. Failed pages retain their cursor. Full bill synchronization already retrieves actions and text, so the legacy newest-ID action refresh is unnecessary in the new workflow. `CONGRESS_NUMBER` defaults to 119 and must be updated for a new Congress.

Federal Register hourly scans remain bounded to the newest two pages per type. Daily recovery refreshes two pages of 25 documents per type, advances a persistent page cursor, and wraps to the beginning at the end. It re-fetches stored documents too, detecting corrections at unchanged storage paths; unchanged content is deduplicated before generation. Moving upstream pagination can repeat records; writes and discovery are idempotent. Recovery latency grows with source history; inspect backlog and increase the recovery cadence if required.

CourtListener retains its current modified-time checkpoints, daily schedule and per-run budget. The wrapper additionally reserves each actual HTTP attempt against the shared UTC daily allowance (default 125), with adapter retries disabled. Requests from unrelated clients outside these workflows are not visible to this ledger.

Generation waits for a successful source run; a failed/incomplete source is held until a successful recovery. Other sources can continue independently. Discovery compares source revision and metadata again after reading Storage. Publication rechecks source status, revision and metadata. All automated file transfers must run through the wrapper so the source is marked running before Storage is changed.

Every nonempty headline, dek, point and context claim requires an exact supporting quotation. Numeric literals must occur in cited passages. A separate verifier checks entailment, legal status and omitted qualifications. A passing top-level score is insufficient: every field must be checked and supported. Two repair attempts are allowed; unresolved claims are withheld. Transient failures retry up to three worker attempts. Time-budget deferral saves extraction work without consuming failure attempts.

Full text is never silently truncated. Packets above 300,000 characters, missing readable text, ambiguous bill versions, enacted bills without enrolled/law text, or court packets without a lead/combined opinion are deferred with a reason. PDF-only records currently wait for a stored readable format; OCR is not part of this release.

Publication and job completion are one database transaction. Retrying returns the already-created brief. A new development creates a new brief. A changed source for the same development can correct an untouched automated brief while preserving its URL and previous version. If an editor has modified that brief, automatic replacement is withheld. The article shows an updated date when its version changes.

## Verification

```sh
pip install -r requirements.runtime.txt pytest==8.3.5
pytest -q
npm ci --ignore-scripts
npm run test:database
```

The database integration tests execute the migration in an isolated PostgreSQL runtime, without hosted credentials. They cover publication gating, duplicates, source changes, leases, revisions, budgets and permission boundaries. Python tests cover evidence completeness, exact quotations, independent-verification failures, resumption and source checkpoints. `brief-pipeline-tests.yml` runs both suites in CI.

An end-to-end provider benchmark and authenticated production UI verification require the deployment's credentials/session. Keep automatic publication paused until these have passed. No routine human approval queue is required after activation; unresolved briefs stay withheld.

## Installed database state

The migration was applied to the existing GovLens Supabase project on 2026-09-06 and its version is aligned with the repository filename. Read-only checks confirmed that source bundles resolve, publication is paused, and browser roles cannot access jobs or execute publication. No model calls or public briefs were created during installation. Application/workflow deployment and the provider-backed benchmark remain activation steps.
