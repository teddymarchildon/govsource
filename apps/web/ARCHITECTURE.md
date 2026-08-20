# GovSource frontend architecture

## Domain model

GovSource presents three source families:

- **Legislative:** bills and laws share the `bill` record. A law is a bill with enactment fields.
- **Executive and regulatory:** agency documents belong to agencies through `agency_agencydocument`. Executive orders are agency documents with the `Executive Order` subtype.
- **Judicial:** a case `cluster` groups one or more court opinions, which connect to courts and authoring judges.

Cross-domain features—published Briefs, homepage rankings, and source links—use the canonical `ContentType` definition in `types/content.ts`. Route construction must go through `utils/contentReferences.ts` instead of duplicating path switches.

## Rendering and data access

Use these boundaries for new work:

1. Fetch initial public data in an async Server Component.
2. Put reusable server queries in `lib/repositories/<domain>.ts` and mark the module `server-only`.
3. Pass minimal serializable data to Client Components for filters, PDF interaction, watch controls, or other browser state.
4. Put browser-only Supabase reads in a domain module under `services/`.
5. Use Route Handlers for Stripe, OpenAI, webhooks, and external consumers—not as an extra hop for Server Components.

Independent queries should start together with `Promise.all`. Missing records should call `notFound()` from a Server Component rather than redirecting to a made-up `/404` route.

## Supabase clients

- `utils/supabase/server.ts`: cookie-aware server client operating as the signed-in user or anonymous role.
- `utils/supabase/client.ts`: browser client for interactive reads and RLS-protected mutations.
- `utils/supabase/admin.ts`: service-role client for tightly scoped server-only operations.

Never import the admin client from a Client Component. A service-role query must still enforce the product-level access rule explicitly, including status and publication-time checks for public Briefs.

## Public content and editorial workflow

Published Briefs are available at `/briefs` and `/briefs/[slug]`. The public repository returns only rows that:

- have `status = published`;
- have a slug;
- have a `published_at` value that is not in the future.

Each Brief contains three to five structured points and links to its primary government record through the shared content-reference mapping. Drafting, review, scheduling, and homepage featuring remain protected under `/admin`.

## Route conventions

`/congress-members` is canonical. Next.js permanently redirects the historical `/congressmen` URLs. New internal links must use the canonical path.

The root loading, error, and not-found boundaries provide consistent route states. Domain routes may add narrower boundaries when they need specialized recovery UI.
