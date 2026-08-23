# GovSource data synchronization

These jobs pull public records from Congress.gov, the Federal Register, and
CourtListener into the hosted Supabase database and Storage. They do not run or
require a project-local PostgreSQL server.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.lock
```

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side ETL only; legacy `SUPABASE_KEY` is
  accepted temporarily with a warning)
- `CONGRESS_API_KEY` for Congress jobs
- `COURT_LISTENER_API_KEY` for CourtListener jobs
- `OPENAI_API_KEY` for AI topic classification

Apply the migrations under `apps/web/supabase/migrations` to the hosted
Supabase project before running the jobs. The integrity migration adds the
unique keys and service-role-only transaction functions used by the scripts.

## Operational behavior

- Network requests use bounded timeouts, retry transient failures, respect
  `Retry-After`, and follow upstream pagination.
- CourtListener API calls use a default 72-second request interval, and opinion
  updates additionally have a 120-request run budget. These defaults stay
  within the standard 50/hour and 125/day authenticated quotas; accounts with
  a different quota can override them with
  `COURT_LISTENER_MINIMUM_REQUEST_INTERVAL` and
  `COURT_LISTENER_MAX_API_REQUESTS`.
- CourtListener opinion updates use source `date_modified` checkpoints with a
  short overlap window.
- CourtListener content is downloaded only when its source SHA-1 changes. PDF
  downloads prefer CourtListener's durable Storage copy and use an
  unauthenticated HTTP session so the API token is never sent to another host.
- A failed or incomplete fetch is never treated as a successful empty result.
- Child collections are reconciled atomically after their complete source data
  has been fetched and validated.
- `--skip-storage` and `--skip-details` omit unavailable fields instead of
  clearing previously stored values.
- Each command logs a structured `data_sync_summary` and exits nonzero when any
  record fails.

Run the test suite with:

```bash
pytest -q
```

Classify the most recently updated, currently unclassified agency documents
and Supreme Court clusters from the last 90 days. Classification is a dry run
unless `--write` is supplied. Use `--list-only` to inspect the bounded queue
without making OpenAI requests.

```bash
python scripts/classify_topics.py --list-only
python scripts/classify_topics.py --limit 100 --lookback-days 90
python scripts/classify_topics.py --limit 100 --lookback-days 90 --write
python scripts/classify_topics.py --record-type cluster --limit 25 --write
```

The default model is `gpt-5-nano`; override it with `--model` or the
`OPENAI_TOPIC_MODEL` environment variable. Each successful classification is
immediately stored as an approved primary topic plus up to two approved
secondary topics. The job records the model, prompt version, response ID,
token usage, source timestamp, and a content fingerprint in assignment
evidence.

## Scheduled GitHub Actions

Three workflows under `.github/workflows` run bounded synchronization jobs:

- `data-sync-daily.yml` refreshes recent bills and their actions, Federal
  Register documents, and Supreme Court opinions at 04:17 UTC each day. Each
  newest-first Federal Register sync stops when it reaches a document already
  in the database.
- `data-sync-weekly.yml` refreshes courts, Congress members, Federal Register
  agencies, and agency relationships at 06:43 UTC each Sunday.
- `topic-classification.yml` classifies up to 100 of the most recently updated
  unclassified agency documents and court clusters from the prior 90 days at
  05:47 UTC each day. Its manual trigger exposes the batch size, lookback, and
  record type.

All three workflows can also be started from the repository's **Actions** tab with
the **Run workflow** button. They share a concurrency group, so a scheduled run
waits rather than overlapping another data sync.

Scheduled jobs install the minimal pinned dependency set in
`requirements.runtime.txt`; development and test tools are intentionally not
installed on the runner.

Configure these repository Actions secrets before the first run:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CONGRESS_API_KEY`
- `COURT_LISTENER_API_KEY`
- `OPENAI_API_KEY`

Keep the service-role key in Actions secrets only. Never commit it or expose it
to frontend code. Apply the Supabase migrations before enabling the schedules.

For initial setup, manually run **Weekly reference data sync** first so court
and agency reference rows exist, then manually run **Daily data sync**. Review
the first few run durations and upstream request volumes before increasing the
bounded page and record limits in the workflow files.
