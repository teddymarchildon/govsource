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
- `app/profile`, `app/onboarding`, `app/login`
- `app/api/*` for AI chat, Stripe, and admin APIs

## Tech Stack

- Next.js App Router + React + TypeScript
- Supabase (auth, database, storage)
- Tailwind CSS + shadcn/ui
- OpenAI (document assistant)
- Stripe (subscriptions + billing)

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
