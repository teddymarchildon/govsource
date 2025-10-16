# Supabase Schema Documentation

## Public Schema Tables

### Bill
A table for storing bills proposed by congressional members.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp (nullable)
- `congress` smallint (nullable)
- `number` smallint (nullable)
- `title` text (nullable)
- `type` text (nullable)
- `introduced_date` date (nullable)
- `policy_area` text (nullable)
- `bill_unique_id` text (unique, required)
- `law_enacted_date` date (nullable)
- `law_unique_id` text (nullable)
- `law_type` text (nullable)
- `law_number` text (nullable)
- `law_title` text (nullable)

**Relationships:**
- Referenced by `sponsored_bills.bill_id`
- Referenced by `cosponsored_bills.bill_id`
- Referenced by `saved_bill.bill_id`
- Referenced by `bill_text.bill_id`
- Referenced by `bill_action.bill_id`
- Referenced by `bill_summary.bill`

### Bill Text
A model for storing the text URLs and copies for a bill.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `date` date (nullable)
- `pdf_url` text (nullable)
- `xml_url` text (nullable)
- `html_url` text (nullable)
- `bill_id` bigint (FK, required)
- `pdf_file_path` text (nullable)
- `html_file_path` text (nullable)
- `xml_file_path` text (nullable)
- `extracted_pdf_text_path` text (nullable)
- `fallback_key` text (nullable)
- `type` text (nullable)

**Relationships:**
- References `bill.id` via `bill_id`

### Bill Action
Actions taken on bills.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp (nullable)
- `bill_id` bigint (FK, nullable)
- `date` date (nullable)
- `text` text (nullable)
- `type` text (nullable)

**Relationships:**
- References `bill.id` via `bill_id`

### Bill Summary
A table for storing summaries of bills.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `bill` bigint (FK, required)
- `date` date (nullable)
- `text` text (required)

**Relationships:**
- References `bill.id` via `bill`

### Congressman
A table to represent congressman.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp (nullable)
- `bioguide_id` text (required, PK)
- `first_name` text (nullable)
- `middle_name` text (nullable)
- `last_name` text (nullable)
- `suffix` text (nullable)
- `full_name` text (nullable)
- `party` text (nullable)
- `chamber` text (nullable)
- `leadership_role` text (nullable)
- `office` text (nullable)
- `phone` text (nullable)
- `district` text (nullable)
- `state` text (nullable)

**Relationships:**
- Referenced by `sponsored_bills.congressman_id`
- Referenced by `cosponsored_bills.congressman_id`
- Referenced by `congressman_term.congressman_id`
- Referenced by `saved_congressman.congressman_id`

### Congressman Term
Term information for congressmen.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `congressman_id` bigint (FK)
- `congress` smallint
- `start_year` smallint
- `end_year` smallint
- `state` text
- `district` text
- `chamber` text

**Relationships:**
- References `congressman.id`

### Sponsored Bills
A join table between congressmen and bills for sponsored bills.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp (nullable)
- `bill_id` bigint (FK, required)
- `congressman_id` bigint (FK, required)

**Relationships:**
- References `bill.id` via `bill_id`
- References `congressman.id` via `congressman_id`

### Cosponsored Bills
Join table for cosponsored bills.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp (nullable)
- `bill_id` bigint (FK, required)
- `congressman_id` bigint (FK, required)

**Relationships:**
- References `bill.id` via `bill_id`
- References `congressman.id` via `congressman_id`

### Saved Bill
A user's saved bills.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `user_id` uuid (FK)
- `bill_id` bigint (FK)

**Relationships:**
- References `auth.users.id`
- References `bill.id`

### Saved Congressman
A user's saved congressman.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `user_id` uuid (FK)
- `congressman_id` bigint (FK)

**Relationships:**
- References `auth.users.id`
- References `congressman.id`

### Saved Cluster
A user's saved clusters.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `user_id` uuid (FK)
- `cluster_id` bigint (FK)

**Relationships:**
- References `auth.users.id`
- References `cluster.id`

### Saved Judge
A user's saved judges.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `user_id` uuid (FK)
- `judge_id` bigint (FK)

**Relationships:**
- References `auth.users.id`
- References `judge.id`

### Saved AgencyDocument
A user's saved agency documents.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `user_id` uuid (FK)
- `agency_document_id` bigint (FK)

**Relationships:**
- References `auth.users.id`
- References `agency_document.id`

### Agency
Government agencies.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `remote_agency_id` bigint (unique)
- `url` text
- `name` text
- `short_name` text
- `parent_id` bigint (FK)
- `remote_parent_id` bigint
- `description` text
- `slug` text

**Relationships:**
- Self-references `agency.id` via `parent_id`
- Referenced by `saved_agency.agency_id`
- Referenced by `agency_agencydocument.agency_id`

### Saved Agency
A user's saved agencies.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `agency_id` bigint (FK)
- `user_id` uuid (FK)

**Relationships:**
- References `agency.id`
- References `auth.users.id`

### Agency Document
Documents published by agencies.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `pdf_file_path` text
- `type` text
- `publication_date` date
- `title` text
- `html_url` text
- `pdf_url` text
- `xml_url` text
- `xml_file_path` text
- `html_file_path` text
- `remote_document_number` text (unique)
- `abstract` text
- `subtype` text
- `signing_date` date
- `president` text
- `extracted_pdf_text_path` text

**Relationships:**
- Referenced by `agency_agencydocument.agency_document_id`

### Agency AgencyDocument
Join table between agencies and their documents.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `agency_id` bigint (FK)
- `agency_document_id` bigint (FK)

**Relationships:**
- References `agency.id`
- References `agency_document.id`

### Court Opinion
Court opinions and decisions.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `remote_id` text
- `pdf_file_path` text
- `text_file_path` text
- `html_file_path` text
- `date` date
- `author_id` bigint (FK)
- `type` text
- `cluster_id` bigint (FK)
- `joined_by` bigint[]
- `extracted_pdf_text_path` text

**Relationships:**
- References `court.id`
- References `cluster.id`
- References `judge.id` via `author_id`

### Judge
Information about judges.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `first_name` text
- `middle_name` text
- `last_name` text
- `suffix` text
- `full_name` text
- `remote_id` text (unique)

**Relationships:**
- Referenced by `court_opinion.author_id`

### Court
Court information.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `jurisdiction` text
- `full_name` text
- `short_name` text
- `remote_id` text
- `start_date` date
- `end_date` date

**Relationships:**
- Referenced by `court_opinion.court_id`
- Referenced by `cluster.court_id`

### Cluster
Groups related court opinions.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `remote_id` text
- `court_id` bigint (FK)
- `slug` text
- `case_name` text
- `case_name_short` text
- `date_filed` date
- `judges` text

**Relationships:**
- References `court.id`
- Referenced by `court_opinion.cluster_id`

### User Preferences
A table for storing user preferences such as states and policy areas of interest.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp
- `user_id` uuid (FK, default: gen_random_uuid())
- `states` text[] (default: '{}')
- `policy_areas` text[] (default: '{}')

**Relationships:**
- References `auth.users.id` via `user_id`

### User Usage
A table for tracking user engagement and onboarding progress.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamp (default: now())
- `user_id` uuid (FK, unique, default: gen_random_uuid())
- `saw_onboarding_flow_at` timestamptz (nullable)
- `ai_interactions` bigint (not null, default: 0) — Integer count of documents processed using AI

**Relationships:**
- References `auth.users.id` via `user_id`

### Subscription
A table for tracking Stripe subscriptions for each user.

**Columns:**
- `id` uuid (PK, default: gen_random_uuid())
- `user_id` uuid (FK, references auth.users.id, not null, unique)
- `stripe_customer_id` text (nullable)
- `stripe_subscription_id` text (nullable)
- `stripe_price_id` text (nullable)
- `status` text (not null)
- `current_period_end` timestamptz (nullable)
- `created_at` timestamptz (default: now(), not null)
- `updated_at` timestamptz (default: now(), not null)
- `tier` text (not null, default: 'free')
- `canceled_at` timestamptz (nullable)
- `trial_ends_at` date (nullable)

**Relationships:**
- References `auth.users.id` via `user_id`

### User Feedback
A table for storing user feedback.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `user_id` uuid (FK, default: gen_random_uuid())
- `feedback` text (required)

**Relationships:**
- References `auth.users.id` via `user_id`

### Ranked Item
A table for ranking and featuring important items of various types (bills, laws, agency documents, court cases, etc).

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now())
- `updated_at` timestamptz (default: now())
- `item_type` text (required) — The type of item (e.g., 'bill', 'law', 'agency_document', 'cluster', 'executive_order')
- `item_id` bigint (required) — The ID of the referenced item
- `rank` bigint (required) — The order or priority for display
- `effectively_ranked_at` timestamptz (nullable) — When this ranking became effective
- `ranking_ended_at` timestamptz (nullable) — When this ranking ended (if applicable)

**Relationships:**
- None (item_type and item_id are used to reference other tables generically)

### Article
Editorial content that summarizes or contextualizes important legislative or regulatory events.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now(), not null)
- `updated_at` timestamptz (default: now(), not null)
- `status` text (default: 'draft', not null, check: draft|review|scheduled|published|archived)
- `title` text (not null)
- `slug` text (unique, nullable)
- `dek` text (nullable)
- `excerpt` text (nullable)
- `summary` text (nullable)
- `body` jsonb (nullable) — Structured article body produced by the LLM or editors
- `body_markdown` text (nullable) — Optional markdown representation of the article body
- `reading_time` smallint (nullable, check: >= 0)
- `hero_image_url` text (nullable)
- `source_urls` text[] (default: '{}', not null) — References to official documents or external coverage
- `auto_generated` boolean (default: true, not null) — Whether the article was produced automatically
- `prompt_template` text (nullable) — Prompt used to generate the article
- `generation_metadata` jsonb (nullable) — Model, temperature, token counts, etc.
- `generated_at` timestamptz (nullable)
- `published_at` timestamptz (nullable)
- `is_featured` boolean (default: false, not null)
- `featured_until` timestamptz (nullable)
- `primary_item_type` text (not null, check: bill|law|agency_document|cluster|executive_order)
- `primary_item_id` bigint (not null) — ID of the primary referenced record
- `author` text (nullable) — Display name of the agent or editor
- `agent_identifier` text (nullable) — Identifier for the automated agent that produced the article
- `editor_notes` text (nullable)
- `views_count` bigint (default: 0, not null)
- `clickthroughs` bigint (default: 0, not null)

**Relationships:**
- `primary_item_type`/`primary_item_id` polymorphically reference domain tables (bill, law, agency_document, cluster, executive_order)

### Article Related Item
Join table mapping articles to other relevant entities beyond the primary reference.

**Columns:**
- `id` bigint (PK, identity)
- `created_at` timestamptz (default: now(), not null)
- `article_id` bigint (FK, not null)
- `item_type` text (not null, check: bill|law|agency_document|cluster|executive_order)
- `item_id` bigint (not null)
- `relation_role` text (nullable) — Context, such as `primary_source`, `background`, `analysis`

**Relationships:**
- References `article.id`

## Auth Schema Tables

The auth schema contains tables managed by Supabase Auth, including:

### Users
User accounts and authentication data. This table is managed by Supabase and not directly editable via the API.

**Columns:**
- `id` uuid (PK)
- `aud` text
- `role` text
- `email` text
- `email_confirmed_at` timestamptz (nullable) - The timestamp that the user's email was confirmed. If null, the email is not confirmed.
- `phone` text
- `phone_confirmed_at` timestamptz (nullable) - The timestamp that the user's phone was confirmed. If null, the phone is not confirmed.
- `confirmed_at` timestamptz (nullable) - The timestamp that either the user's email or phone was confirmed. If null, neither is confirmed.
- `last_sign_in_at` timestamptz
- `app_metadata` jsonb
- `user_metadata` jsonb
- `identities` jsonb
- `created_at` timestamptz
- `updated_at` timestamptz
- `is_anonymous` boolean

**Notes:**
- Use `email_confirmed_at` to check if a user's email is confirmed after sign up.
- The table is referenced by various tables in the public schema via `user_id`.

## Storage Schema Tables

The storage schema contains tables managed by Supabase Storage:

- `buckets` - Storage bucket configurations
- `objects`
