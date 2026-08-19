# GovLens

GovLens is a monorepo for the public web application and the data-ingestion
scripts that populate its Supabase database and storage buckets.

## Repository layout

- `apps/web` — Next.js frontend deployed by Vercel.
- `services/data-sync` — Python synchronization scripts for Congress.gov, the
  Federal Register, and CourtListener.

## Frontend

```bash
cd apps/web
npm install
npm run dev
```

Configure the Vercel project with `apps/web` as its Root Directory. Environment
variables used by the frontend are documented in `apps/web/README.md`.

## Data synchronization

```bash
cd services/data-sync
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The synchronization scripts require Supabase credentials and API credentials
for their respective upstream data sources. They are independent jobs and are
not part of the Vercel frontend build.
