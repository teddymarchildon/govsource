-- Source revision metadata used for incremental CourtListener synchronization.
alter table public.cluster
  add column if not exists source_date_modified timestamptz;

alter table public.court_opinion
  add column if not exists source_date_modified timestamptz,
  add column if not exists source_sha1 text,
  add column if not exists source_local_path text;

create index if not exists cluster_source_date_modified_idx
  on public.cluster (source_date_modified)
  where source_date_modified is not null;

create index if not exists court_opinion_source_date_modified_idx
  on public.court_opinion (source_date_modified)
  where source_date_modified is not null;
