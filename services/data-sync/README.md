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

Apply the migrations under `apps/web/supabase/migrations` to the hosted
Supabase project before running the jobs. The integrity migration adds the
unique keys and service-role-only transaction functions used by the scripts.

## Operational behavior

- Network requests use bounded timeouts, retry transient failures, respect
  `Retry-After`, and follow upstream pagination.
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
