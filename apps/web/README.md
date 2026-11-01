GovSource frontend is a Next.js app for browsing federal legislation, executive orders, agency documents, and Supreme Court cases with personalized tracking and AI-assisted analysis.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Environment

Create a `.env.local` file with the required variables for:
- Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- App domain (`NEXT_PUBLIC_DOMAIN_BASE`)
- OpenAI (`OPENAI_API_KEY`)
- Stripe (checkout + webhook secrets used by API routes)

The shared navigation also requires `SUPABASE_SERVICE_ROLE_KEY` for server-side
topic reads. Keep this server-only key out of all `NEXT_PUBLIC_` variables.

## Authentication

Email links, signup confirmations, and Google sign-in return to
`/auth/callback?redirect=<local path>`. The callback exchanges the PKCE code for
session cookies, then `/login` waits for the current user's onboarding status
before navigating. Password sign-in uses the same onboarding decision. Completing
or skipping onboarding preserves the original destination.

Before deployment, verify Supabase Authentication → URL Configuration allows the
callback URL on each supported origin, including its `redirect` query string
(for example `https://www.govsrc.com/auth/callback**` and
`http://localhost:3000/auth/callback**` for local development). Set the Site URL
to the canonical production origin. Email templates should honor `RedirectTo`
through Supabase's confirmation URL. Open email links in the browser where they
were requested; PKCE depends on that browser's verifier cookie.

Run `node --test scripts/auth-flow.test.mjs` for redirect, callback failure,
session-race, and onboarding regression coverage. Release verification should
also complete Google, password, and email-link sign-in with a test account,
check a page reload retains the session, and verify sign-out. Automated callback
tests use a mocked provider; they do not prove email delivery or provider settings.

## Main App Areas

- `app/bills`, `app/laws`
- `app/executive-orders`, `app/agency-rules`
- `app/supreme-court-cases`
- `app/briefs` for published, source-linked Briefs
- `app/profile`, `app/onboarding`, `app/login`
- `app/api/*` for AI chat, Stripe, and admin APIs

## Architecture

- Server reads belong in `lib/repositories/*` and are consumed directly by Server Components.
- Browser-only reads and interactions are grouped by domain in `services/*`; `services/api.ts` remains a compatibility facade while the older API surface is split up.
- Shared government-content identifiers use `types/content.ts` and `utils/contentReferences.ts` so rankings, Briefs, and public routes resolve entities consistently.
- Supabase service-role access is centralized in `utils/supabase/admin.ts` and must only be imported by server-only modules.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the domain model and contribution rules.

## Tech Stack

- Next.js App Router + React + TypeScript
- Supabase (auth, database, storage)
- Tailwind CSS + shadcn/ui
- OpenAI (document assistant)
- Stripe (subscriptions + billing)

Admin access is managed in Supabase's `public.admin_user` table, linked to
Authentication users by `user_id`. In the Supabase dashboard, copy an existing
user's UUID from **Authentication → Users**, then insert that UUID into the
`user_id` column of **Table Editor → admin_user**. Delete their membership row to
revoke access. Keep at least one administrator assigned. Only trusted database
operators can edit membership; app users cannot read or modify this table, and
the application's server role has read-only access.

The admin-users migration seeds the existing verified account
`ted.marchildon@gmail.com`. Apply the migration before deploying this code. All
admin pages and APIs check membership for the authenticated user on every request;
removal applies to subsequent requests without signing out. Database errors deny
access. `ADMIN_EMAILS` and the previous hardcoded email fallback are no longer
used; a leftover deployment variable can be removed. New environments without the
seed account must add their initial admin through the dashboard.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Contribution overviews

Member profiles now open the Contributions tab on an overview with separate
party/PAC and itemized individual totals, top groups, and receipt-month charts.
Select a group or month to filter transactions. Search, date, signed-amount,
employer and occupation filters are preserved in the URL and pagination; summary
cards continue to describe the full reporting period. Employer/occupation filters
match the same capitalization/spacing normalization as the summary groups.

Apply `supabase/migrations/20261011005959_contribution_overviews.sql` before
deploying this feature, followed by `supabase/migrations/20261011010041_contribution_views_read_only.sql`. It adds invoker-security reporting views, the
`campaign_finance` Brief type, and a unique member/reporting-cycle constraint.
The migration does not generate or publish any briefs. Existing ingestion schedules are unchanged.

In `/admin/briefs`, use **Draft a contribution overview**, select a member and
cycle ending year, and review the result in the existing editor. Initial drafts
use deterministic prose templates over the same repository summaries as the UI;
no model call or automatic publication occurs. The aggregate evidence is retained
in the existing generation metadata. Repeating the action opens the existing
brief, including an archived one, without replacing editorial changes. Published
briefs appear on the member overview and in the Campaign finance brief feed.

This release covers verified member-linked campaigns, not all election candidates.
Missing coverage is not zero fundraising; signed amounts are before refunds and
exclude unitemized donations. Briefs include their data dates and do not refresh
automatically. The existing editorial revision behavior remains unchanged.

Run `npm run test:contributions`, `npm run test:briefs`, and `npx tsc --noEmit` in
`apps/web`; run `npm run test:database` in `services/data-sync` for schema,
reporting-view, uniqueness, and access checks.

### Continuous campaign-finance drafting

Apply `20261101121359_continuous_contribution_briefs.sql` before deploying these
workers. `Draft campaign finance briefs` runs daily and after successful FEC
imports. The former five-per-cycle pilot cap is removed. Draft admissions share
the existing daily editorial limit with other Brief source types, atomically;
this is an allowance, not a production target. No additional model spending.

Both FEC imports now attempt daily and resume saved pages after failures or quota
pauses. Weekly reference data remains weekly. Catch-up also dispatches overdue
FEC attempts daily, with `fec_only=true` for committee recovery and shared API
concurrency. Import failures remain failures; partial snapshots never replace
complete public datasets.

Drafting requires complete attributable coverage refreshed within eight days and
exact reconciliation with the FEC financial summaries. A first overview needs at
least 100 receipts and $100,000 across the separately reported categories. A
follow-up needs a change of at least $100,000 AND 10% in either category compared
with the latest prior brief's evidence. These are explicit editorial triage
thresholds, not proof of political significance or new donations. Corrections can
qualify in either direction. Editors must inspect amendments and scope changes.

Evidence fingerprints ignore retrieval timestamps and prevent repeated coverage
of the same snapshot, including archived articles. Pending editorial work blocks
another automatic draft for that member/cycle. New developments get separate
review drafts; existing publications and edited drafts are never overwritten.
A failure for one member does not block other members. Least recently covered
members go first and each run has a 15-minute processing budget.

Each draft records its reader question, audience, selection reason and prior
brief ID. Explanatory context distinguishes receipts from available cash,
employer labels from employer giving, transactions from unique donors, and
retrieval dates from filing coverage. Sources and signed amounts remain visible;
political influence is not inferred. This deterministic template does not claim
an independent AI editorial review. Editors must assess original reader value,
at least two supported explanatory angles, clear timing and qualifications.
All drafts require review; publication still rebuilds and checks figures against
live FEC evidence and cannot be scheduled.

Run `npm run briefs:contributions` with server-side `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Run `npm run test:contributions` for verification.

## Front-page editorial selections

Apply `supabase/migrations/20261017205830_brief_front_pages.sql` before using
**Admin → Customize front pages** (`/admin/front-pages`). Choose a lead and up to
two supporting Briefs independently for Today, Campaign Finance, Congress, White
House, Agencies, and Courts. Search published Briefs by headline or summary, move
selections between slots, and **Save this page**. Each tab has its own save state;
an asterisk marks unsaved edits. A Brief may be highlighted on multiple tabs.

Selections override recency and the legacy homepage feature checkbox. Empty slots
use automatic selection; clearing all slots restores the automatic layout. The
legacy checkbox remains a homepage fallback when no lead is selected. Only live
Briefs can be selected, and public reads recheck visibility: archived, unpublished,
or future-dated stories never appear through a saved placement. Older selected
Briefs are loaded independently of recent-feed limits. Other slots and Latest
Briefs exclude stories already used in the lead/supporting area.

Assignments are private to the server-side admin API. Saves update all three
slots atomically and reject stale versions from another editing session. The
migration does not alter Brief publication status or existing homepage choices.
Public pages continue using automatic selection if the new table is not yet
available, while the admin screen reports the missing migration.

Validation: `npm run test:briefs` and `npx tsc --noEmit` in `apps/web`;
`node tests/database/brief_front_pages.mjs` in `services/data-sync`.
