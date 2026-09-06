# Editorial front page

Home and institution pages share a compact opening: a lead Brief, two supporting Briefs, and four chronological headline links. Home samples the newest 24 Briefs plus eight per primary institution and an active featured Brief, ensuring a bulk publication cannot hide other desks. Supporting slots prefer different institutions; remaining stories stay in publication order. Every homepage Brief appears only once. Signed-in record feeds follow the editorial stories.

Desktop navigation is 96px tall; mobile is 56px with search behind a button. The mobile feed uses one lead with a two-line dek followed by headline rows. Headlines remain complete, without clipping; only summaries are clamped. Article pages retain the full title, all points, context, and source links. Recommendations stream independently so they cannot delay reading the article.

## Display headlines and rollout

The migration `supabase/migrations/20260906204407_brief_display_title.sql` was applied and verified on the live GovSource database on September 6, 2026, before the main-branch release. Apply it before deploying the updated admin page/API to any other environment. The migration adds only an optional nullable column and its length constraint; it does not change public access or existing content. The local filename matches the recorded remote migration version.

Editors can enter a display headline in Admin → Briefs. Aim for 8–14 words, at most 100 characters. Keep proposal/decision status and key qualifications accurate. Blank means use the existing title. This changes listings only; full article titles, metadata, and slugs are preserved. Existing published headlines were not rewritten as part of this UI change.

## Measurement

The existing Vercel Web Analytics integration receives:

- `brief_preview_view`: once per Brief/placement/page visit after at least half the preview is visible for one second in a foreground tab. A quick click also records a view.
- `brief_preview_click`: once per Brief/placement/page visit, including keyboard and middle-button activation. Properties: `brief_id`, `placement`, `page`, `from_brief`.
- `brief_engaged_read`: once per article mount after 30 foreground seconds and reaching the midpoint of the points/context body.

Compare clicks / preview views by placement and page, and track engagement alongside clicks from article recommendations (`from_brief=true`). These metrics are not historical backfills; begin collecting after deployment. Production custom-event reporting requires an eligible Vercel Analytics plan. No email, search text, or user identifiers are included.

## Verification (September 6, 2026)

- TypeScript, lint for changed files, four story-selection tests, and three existing sitemap tests pass.
- Production `next build` passes with the public Supabase key used for read-only rendering and inert build-time placeholders for unconfigured OpenAI/Stripe SDK initialization. AI and payment behavior was not exercised.
- The migration passes in isolated embedded Postgres: existing-row null fallback, save/clear, full title preservation, and rejection of blank/overlong headlines. The live column and constraint were verified after migration; all 101 existing Briefs retained null display headlines. Live admin save requires authenticated admin credentials.
- Live public data verified locally on Home, Congress, White House, Courts, Agencies, Brief archive, and topic directory, including navigation into a Brief and another recommendation.
- At 1280 × 720, Home and Congress show seven full Brief previews. The first institution headline begins at ~219px (previous Congress layout ~685px).
- At 390 × 844, Home shows four complete headlines without horizontal overflow. Mobile search opens with input focus, closes with Escape, and the section menu navigates correctly.
- At 768px, the Topics dropdown stays within the viewport. Preview-view, click, and engaged-read events appear in the local analytics debug log.
- Topic-detail live-data QA is limited by the intentionally read-only local credentials: the existing repository needs server access to `topic_source_mapping`. Its updated UI compiles and uses the same tested Brief components; production permissions were not changed to accommodate the preview.

The local preview runs on port 3100 using read-only public data. The required live database migration is complete; application deployment follows the main-branch release.
