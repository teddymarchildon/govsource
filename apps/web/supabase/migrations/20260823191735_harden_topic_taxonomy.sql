-- Cover audit-user foreign keys used when reviewers are removed or queried.
set search_path = public;

create index bill_topic_assigned_by_idx
    on public.bill_topic (assigned_by);
create index bill_topic_reviewed_by_idx
    on public.bill_topic (reviewed_by);
create index agency_document_topic_assigned_by_idx
    on public.agency_document_topic (assigned_by);
create index agency_document_topic_reviewed_by_idx
    on public.agency_document_topic (reviewed_by);
create index cluster_topic_assigned_by_idx
    on public.cluster_topic (assigned_by);
create index cluster_topic_reviewed_by_idx
    on public.cluster_topic (reviewed_by);
create index brief_topic_assigned_by_idx
    on public.brief_topic (assigned_by);
create index brief_topic_reviewed_by_idx
    on public.brief_topic (reviewed_by);

-- The mapping registry is intentionally invisible to client roles. This
-- explicit service policy documents its server-only access model and keeps
-- RLS auditing unambiguous even though service_role also bypasses RLS.
create policy "Service role manages topic source mappings"
on public.topic_source_mapping
for all
to service_role
using (true)
with check (true);
