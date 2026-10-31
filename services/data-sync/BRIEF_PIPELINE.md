## Current editorial policy — October 31, 2026

This section supersedes the automatic-publication and throughput guidance below.
Apply `20261031182351_selective_editorial_briefs.sql` before deploying the updated
workers. It defaults to editorial review, pauses automatic publication, and caps
new daily drafting admissions at five documents across all workers. The existing
$5/day AI budget is unchanged. Screening still uses that budget; it does not use a
drafting slot. Extraction, writing and verification share a slot for each job per
UTC day, including retries. An unfinished job resumed on another day uses a slot
on that day. This is a maximum, never a production target.

Source ingestion remains broad. Workers discover up to 500 changed sources and
process up to 30 candidates per run with two workers. Importance is screened from
full evidence before extraction. Priority plus a bounded ten-point aging bonus
keeps important fresh developments ahead of old routine notices. Source-type
priority is a heuristic, not an independent judgment of newsworthiness. Selection
must identify a concrete practical change and enough evidence for an explainer;
there is no requirement to produce content on a quiet day.

Context is required and may contain up to 6,000 characters, with all existing
quotation and independent-verification checks preserved. New prompt versions
invalidate saved work from older prompts. Passing drafts are staged idempotently
in `/admin/briefs` with `review` status and no publication date. The automatic
publication RPC is blocked while editorial review is required, even if its old
publication switch is enabled. Corrections to already-covered developments are
withheld for an editor to inspect in pipeline verification history; public copy
is never automatically overwritten. Previously published articles are unchanged.

Editors must check significance, evidence, legal status, affected audience,
timing, exceptions and original explanatory value. The publication form requires
context, author attribution and source links. These mechanical checks do not
certify editorial quality. Automated checks are not human review. No article-count
or word-count target establishes AdSense eligibility.

The admin pipeline screen exposes the daily draft limit. Health checks no longer
require publication every 48 hours or treat paused publication as an error in
editorial mode; source failures and stalled/overdue processing remain visible.
The separate campaign-finance pilot is already limited to five total Briefs per
cycle and requires review; it is not a five-per-day generator.

AdSense ad serving is disabled in the root layout; the account-verification meta
tag remains. Before enabling ads, audit the intended pages and configure the
appropriate consent controls. Do not reintroduce a global ad script for empty,
authentication, or reference-only pages. No indexing or visibility guarantee is
inferred from a sitemap entry.

Deployment checks: apply the migration, deploy the worker and application changes,
run a bounded processing pass, confirm new drafts appear only in the admin review
list, and inspect public HTML on mobile. Publish a focused set of source-checked
explainers before requesting another AdSense review. Content, production crawl
access, and provider-backed results still require a live editorial audit.

---

# Continuous brief pipeline

The pipeline uses the existing Congress.gov, Federal Register and Supreme Court / CourtListener records and Storage buckets. It creates structured briefs in the existing `brief` table. GitHub Actions runs bounded workers; Supabase holds durable progress.

## Deployment and activation

1. Apply `apps/web/supabase/migrations/20260906223838_continuous_brief_pipeline.sql` and the subsequent `brief_source_refresh_tracking` migration to the existing project. It is additive, enables RLS on internal tables, restricts worker functions to `service_role`, and starts automatic publication **paused**. The migration does not seed records, call models, or publish anything.
2. Deploy the application and workflow changes. Existing repository secrets are reused: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CONGRESS_API_KEY`, `COURT_LISTENER_API_KEY`, `OPENAI_API_KEY`. The web application needs its existing server-side Supabase credentials and admin authentication.
3. Set repository variable `BRIEF_PIPELINE_ENABLED=true`. This enables the new workflows and disables the legacy daily sync. Keep this variable false or absent until the migration is installed. The global Actions switch is separate from the database publication switch.
4. Run the weekly reference workflow and the source workflows manually once, then run **Generate and verify briefs**. Each source packet must be complete and unchanged before discovery/publication; unrelated source-run failures do not block it. Optional bootstrap: `python scripts/process_briefs.py --seed-days 30 --discover-only`. This queues unbriefed existing records and excludes records already covered. It does not mark an incomplete source run successful.
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

Health checks also fail after 48 hours without a publicly visible brief, even
when workers are succeeding, the queue is empty, or publication is paused. The
four-hour scheduled check reports the last publication timestamp in its error
and summary. Drafts and future scheduled publications do not reset the clock;
an empty public feed also raises an alert. This uses the existing GitHub Actions
failure notifications and requires no database migration.

The processor workflow drains verified results before and after generation, including after individual generation failures. Each generation run handles up to 100 jobs within its existing 20-minute time budget. `python scripts/process_briefs.py --publish-only --limit 30` drains verified work without discovery or model calls; it still honors every database publication gate. Publication logs show the pause switch, verified count, daily cap, usage, and published IDs. A paused pipeline with verified work now raises a health alert.

Daily CourtListener runs also retry failed/expired court-reference refreshes, or refresh references older than seven days, using the existing shared lock and daily request allowance. A live lease is never displaced.

## Models and cost controls

### Delayed schedule recovery

`pipeline-catch-up.yml` checks every 30 minutes and after independent source,
classification, reference, and health workflows complete. It dispatches the
Federal Register, Congress, and brief processor when their latest attempt is
older than their normal cadence. Active runs suppress duplicate dispatches;
failed attempts also start the cooldown so an outage cannot cause tight retries.
The workflow uses the repository Actions token and honors `BRIEF_PIPELINE_ENABLED`.
This provides additional recovery opportunities, but GitHub schedules remain
best effort; a complete scheduler outage requires an external dispatcher.

Brief generation uses four independent clients within the same 100-job and
20-minute limits. Atomic database claims, shared daily AI reservations, the
30-publication cap, and all evidence and verification gates are unchanged.

Defaults retain `gpt-5-mini` for writing and use a separate, independent verification request. The verifier receives all original passages, not only the extracted facts. `OPENAI_BRIEF_MODEL` and `OPENAI_BRIEF_VERIFIER_MODEL` can be overridden as repository variables.

`BRIEF_PRICING_MODELS` lists the models covered by the configured pricing ceilings. If either selected model is missing, the worker refuses to call the API. Set `BRIEF_INPUT_USD_PER_MILLION` and `BRIEF_OUTPUT_USD_PER_MILLION` to ceilings that cover **both** models, including reasoning output. Default workflow values are 0.25 and 2.00 for `gpt-5-mini`; recheck provider pricing before changing models. These are accounted estimates, not a provider invoice.

Before each call, the database serializes a conservative reservation against the UTC daily budget. Completed calls record response ID, tokens, model and estimated cost. An uncertain request retains the entire reservation. No automatic HTTP retry can create an unreserved model request. Budget exhaustion defers work to the next UTC day without consuming a failure attempt. Daily publication limits also apply to automated corrections.

Provider completion status, incomplete reason, error code, stage, response ID, output allowance, and token counts are recorded under `brief_api_call.usage.response_diagnostics`. The ledger's `completed` status means usage was accounted, not that generation succeeded. Only an explicit `max_output_tokens` response gets one immediate retry, increasing the allowance from 8,000 to 16,000 with a separate budget reservation and a deadline check. Unknown provider failures keep the normal bounded job retries. Prompt and response bodies are not logged.

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

Copying differences in whitespace, line wrapping after hyphens, double quotation
mark styles, and sentence-initial capitalization can be resolved back to a literal
source substring before validation. The stored quotation must occur exactly in
the original cited passage. This does not repair changed words or numbers, erase
page markers, or join distant text across ellipses. Independent verification still
checks that the original source entails the claim. Validated drafts are checkpointed
before verification, so a timeout or provider failure resumes the same draft without
paying to rewrite it. Rejected drafts still use the existing bounded repair process.

A mislabeled passage can also be corrected when its quotation resolves to exactly
one passage in the same source document. Cross-document and ambiguous matches
remain invalid. The corrected reference and literal quotation are saved before
independent verification.

For existing extraction failures, run `python scripts/recover_brief_extractions.py` to preview jobs whose saved extraction now passes. Add `--apply` to requeue only those jobs, preserving the validated extraction and prior history. Source revision and metadata must still match, and a concurrent job update prevents recovery. This performs no model calls and publishes nothing; the jobs must complete normal draft and independent verification stages.

Selection version 3 reads the complete evidence packet and recognizes substantive
regional and sector-specific proposals, licenses, sanctions, and public-participation
opportunities. A notice label or prior appearance on an agency website does not
by itself establish low importance or duplicate site coverage. Extraction repairs
replace only invalid facts and preserve validated facts and qualifications; every
replacement still needs literal supporting quotations. Verification evaluates
omissions that change the meaning of the brief rather than demanding every source
detail. No quotation, independent verification, budget, or publication gate is bypassed.

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

## Recovery and throughput (September 2026)

Apply the `tolerate_partial_congress_records`, `resilient_brief_processing`, and `fec_publication_timeout` migrations before deploying the corresponding worker changes.

- Congress preserves unavailable collections (`NULL`) and replaces successfully fetched collections, including confirmed empty lists. Missing cosponsors/summaries do not block briefs. Missing actions or text metadata, and in-progress record refreshes, do. Missing individual text formats retain stored copies only when the version and URL still match. Failed bill references and missing collections live in `brief_source_run.checkpoint.retry_bills`; each run retries up to 20 due records with exponential backoff, independently of the new update window. Authentication and database errors remain failures.
- Current developments (source date in the last 30 days, or unknown) and historical backfill use separate queues. Scheduled and source-completion-triggered brief runs process current work with two independent clients and atomic claims, sharing the existing $5/day reservation limit and 30/day publication cap. Dispatch **Generate and verify briefs** with `queue=backfill` for historical work; backfill yields while eligible current work is waiting. Old jobs are retained, not deleted.
- Explicit provider content filters/refusals are withheld for review immediately. Network failures get one separately budgeted retry within the run deadline. The worker retains completed extraction and draft checkpoints.
- Source failures have an `error_kind`: `temporary` retries with backoff; `waiting` wakes on source revision changes; `review` needs operator intervention or corrected source material. To requeue reviewed evidence after resolving its blocker, call `note_brief_source_refresh(type,id)`. Never truncate a document to bypass the evidence limit.
- Health reports current and historical backlog separately and checks actual job progress, not only worker exits. Review-required source counts stay visible as warnings; temporary repeated failures and stalled current work remain errors.
- FEC publication stays atomic and retry-safe for the same run token. The trusted `service_role` has a 55-second statement timeout (public-user roles are unchanged), and its worker uses a 65-second HTTP timeout. A function-local timeout alone cannot extend PostgREST’s inherited 8-second timer. A failed publication retains the durable staging area and prior public dataset; resume with the existing weekly workflow (`fec_only=true`), without `--restart`.

## Actionable queue health (October 2026)

Apply `20261011003652_actionable_brief_queue_health.sql` before deploying the
updated health script. This migration adds a service-only eligibility helper
shared by the worker and health overview. It preserves queued data and the
existing total backlog fields used by the admin UI.

The 24-hour backlog and six-hour progress checks now concern eligible current
jobs. Source revisions, source readiness, retry timing, attempt limits, and
worker leases determine eligibility. Backfill activity cannot mask stalled
current processing. Blocked counts and the oldest blocked job IDs/reasons appear
in health logs. Source changes and expected waiting remain visible as warnings;
missing source tracking, exhausted retries, expired/missing leases, stale sources,
and genuinely stalled eligible work remain failures. Older databases retain the
previous conservative health behavior until the migration is applied.

Model output is checked recursively for null characters before checkpoint or
result writes. Affected jobs are withheld for review with a safe reason, without
publishing or modifying source quotations. The paid call remains accounted for,
and subsequent jobs continue. Database and transport failures still fail the
worker; this does not use blanket workflow error suppression.


## Free screening of routine candidates

`brief_prefilter.py` runs before paid screening, including a keyset-paginated
sweep of the selected queue before generation. A budget-deferred or substantive
item does not prevent later routine items from being filtered. The daily AI cap
and publication limit are unchanged.

The rules skip only introduction/referral-only post-office naming bills with complete action
and text metadata, explicit unchanged paperwork renewals, closed scientific
grant-review meetings, and internal Senior Executive Service performance-review
board memberships. Mixed/new/revised collections, uncertain notices, rules,
presidential documents, court opinions, advanced bills, saved AI work, and items
with previous coverage remain eligible for normal screening. Full evidence is
validated first. Optional missing bill summaries/cosponsors do not block an
introduction-only decision.

Skipped jobs retain their evidence, fingerprint, and a versioned `Prefilter
routine-v2` reason. The queue sweep compares status, source revision and update
time before writing, so it cannot take a job from a concurrent worker. Source
changes still use normal revision discovery. No filtered job can publish.

Manual workflow modes in **Generate and verify briefs**:

- `mode=prefilter-preview`: report matches without writes, AI calls, or publication.
- `mode=prefilter-only`: apply the free filters without AI calls or publication.
- `mode=process` (default): discovery, free filtering, normal generation and gated publication.

All modes accept `queue=current` or `queue=backfill`. The CLI equivalents are
`python scripts/process_briefs.py --prefilter-dry-run --queue current` and
`python scripts/process_briefs.py --prefilter-only --queue current`.

Filtering is intentionally conservative and does not guarantee an empty queue:
substantive work still requires the normal budget and verification. Health checks
continue reporting real overdue work rather than treating every old notice as
low-value or resetting its age.


## Reader-value selection and generation (v5)

Before paid screening, `brief_editorial.py` refreshes pending/retry queue priorities
using document stage and concrete reader-facing subjects. Routine paperwork,
registration, ceremonial, and instrument-procedure signals lower priority. The
score is a transparent triage aid, never a finding of importance or permission to
publish. Full-text AI selection can still reject a highly ranked item or accept
an unusual lower-ranked notice. Important introductions are no longer rejected
just because they have not passed a chamber; they must be described as proposals.

Selection must identify a reader question, cite the practical reader value, and
supply at least two supported explanatory angles. Unsupported selection claims
are withheld before extraction. The writer receives that plan and the current
UTC date, separates publication from effective dates, and explains supported
practical distinctions in original prose rather than copying quotations.

Verification now checks factual support AND five editorial criteria: reader
value, added explanation, context beyond metadata, paraphrasing, and clear timing.
All must pass. A factual but thin draft gets specific repair feedback, at most
two repairs, then is withheld. The full rubric and selection plan are saved in the
attempt report. A database gate independently prevents old or failing reports
from reaching review or automatic publication. Existing review drafts are kept;
un-staged legacy verified results return to selection with paid attempts intact.

The daily five-draft limit and dollar cap remain enforced atomically. Reaching
the draft limit defers that candidate until the next budget day but continues
screening other candidates within the run limit and dollar budget. The limit is a
ceiling, not a target; zero drafts is a valid outcome. Publication still requires
an editor. Discovery is bounded to five minutes per run so source fetching cannot
consume the entire worker window.

Preview ranking without writes or AI calls:
`python scripts/process_briefs.py --rank-dry-run --queue current`

Regression tests cover routine-vs-consequential ranking, evidence-backed selection,
accurate-but-thin rejection, old checkpoint invalidation, concurrent queue claims,
continued selection after the draft cap, and both database publication paths.
The rubric improves selection discipline; editors must still assess each draft.


## Editor-requested generation

The admin review page accepts GovSource source-document URLs and can regenerate
an existing Brief as a separate review draft. The authenticated admin API records
the actor and resolves the original Brief's source server-side. Repeated requests
reuse active work or its existing review draft. Campaign-finance overviews retain
their dedicated generator.

`brief_generation_request` is a service-only durable queue. Each normal processing
run prepares up to five requests before automated discovery. Source evidence and
revision checks are unchanged. Requested sources, including historical records,
enter the current worker queue with priority over automated jobs. Manual requests
bypass routine-topic filtering and age/duplicate selection objections, but must
still support a reader question, useful explanation, and every verification gate.
They share the existing daily dollar/drafting limits and may wait for the next day.

Manual jobs have independent fingerprints and cannot be superseded by automated
discovery. They always stage a new review draft, even if automatic publication is
later enabled. Existing public copy is never overwritten. The draft records its
request and original Brief IDs. Editors should archive superseded coverage when
publishing a replacement. Preparation failures and verification failures remain
visible in Recent generation requests; editors can retry once the source or
underlying issue is resolved. A changed source invalidates queued manual evidence
and requires a fresh request.
