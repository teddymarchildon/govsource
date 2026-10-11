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

Set `ADMIN_EMAILS` to a comma-separated list of accounts allowed to use `/admin`. The existing administrator remains the fallback for backwards compatibility.

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
It does not generate or publish any briefs, or change ingestion schedules.

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
