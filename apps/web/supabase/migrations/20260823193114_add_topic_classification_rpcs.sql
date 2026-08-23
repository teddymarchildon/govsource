-- Service-role-only helpers for bounded AI topic classification jobs.
set search_path = public;

create or replace function public.get_topic_classification_candidates(
    p_limit integer default 100,
    p_lookback_days integer default 90,
    p_record_type text default 'all'
)
returns table (
    record_type text,
    record_id bigint,
    source_updated_at timestamptz,
    record_data jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
    with candidate_records as (
        select
            'agency_document'::text as record_type,
            document.id as record_id,
            coalesce(
                document.updated_at at time zone 'UTC',
                document.publication_date::timestamp at time zone 'UTC',
                document.created_at
            ) as source_updated_at,
            jsonb_build_object(
                'id', document.id,
                'remote_document_number', document.remote_document_number,
                'title', document.title,
                'abstract', document.abstract,
                'type', document.type,
                'subtype', document.subtype,
                'publication_date', document.publication_date,
                'signing_date', document.signing_date,
                'president', document.president,
                'html_file_path', document.html_file_path
            ) as record_data
        from public.agency_document document
        where p_record_type in ('all', 'agency_document')
          and coalesce(
                document.updated_at at time zone 'UTC',
                document.publication_date::timestamp at time zone 'UTC',
                document.created_at
              ) >= now() - make_interval(days => greatest(p_lookback_days, 0))
          and not exists (
              select 1
              from public.agency_document_topic assignment
              where assignment.agency_document_id = document.id
                and assignment.assignment_status = 'approved'
          )

        union all

        select
            'cluster'::text as record_type,
            cluster.id as record_id,
            coalesce(
                cluster.source_date_modified,
                cluster.updated_at at time zone 'UTC',
                cluster.date_filed::timestamp at time zone 'UTC',
                cluster.created_at
            ) as source_updated_at,
            jsonb_build_object(
                'id', cluster.id,
                'remote_id', cluster.remote_id,
                'slug', cluster.slug,
                'case_name', cluster.case_name,
                'case_name_short', cluster.case_name_short,
                'date_filed', cluster.date_filed,
                'judges', cluster.judges
            ) as record_data
        from public.cluster cluster
        where p_record_type in ('all', 'cluster')
          and coalesce(
                cluster.source_date_modified,
                cluster.updated_at at time zone 'UTC',
                cluster.date_filed::timestamp at time zone 'UTC',
                cluster.created_at
              ) >= now() - make_interval(days => greatest(p_lookback_days, 0))
          and not exists (
              select 1
              from public.cluster_topic assignment
              where assignment.cluster_id = cluster.id
                and assignment.assignment_status = 'approved'
          )
    ),
    limited_records as (
        select *
        from candidate_records
        order by source_updated_at desc, record_type, record_id desc
        limit least(greatest(p_limit, 1), 500)
    )
    select
        candidate.record_type,
        candidate.record_id,
        candidate.source_updated_at,
        case candidate.record_type
            when 'agency_document' then candidate.record_data || jsonb_build_object(
                'agencies', coalesce((
                    select jsonb_agg(agency.name order by agency.name)
                    from public.agency_agencydocument relationship
                    join public.agency agency on agency.id = relationship.agency_id
                    where relationship.agency_document_id = candidate.record_id
                ), '[]'::jsonb)
            )
            when 'cluster' then candidate.record_data || jsonb_build_object(
                'opinions', coalesce((
                    select jsonb_agg(
                        jsonb_build_object(
                            'type', opinion.type,
                            'text_file_path', opinion.text_file_path,
                            'html_file_path', opinion.html_file_path,
                            'source_sha1', opinion.source_sha1
                        )
                        order by opinion.id
                    )
                    from public.court_opinion opinion
                    where opinion.cluster_id = candidate.record_id
                ), '[]'::jsonb)
            )
        end as record_data
    from limited_records candidate
    order by candidate.source_updated_at desc, candidate.record_type, candidate.record_id desc;
$$;

create or replace function public.replace_ai_topic_assignments(
    p_record_type text,
    p_record_id bigint,
    p_assignments jsonb,
    p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
    assignment_count integer;
    inserted_count integer;
begin
    if p_record_type is null or p_record_type not in ('agency_document', 'cluster') then
        raise exception 'Unsupported topic record type: %', p_record_type;
    end if;
    if p_assignments is null or jsonb_typeof(p_assignments) is distinct from 'array' then
        raise exception 'Assignments must be a JSON array';
    end if;
    if p_metadata is not null and jsonb_typeof(p_metadata) is distinct from 'object' then
        raise exception 'Assignment metadata must be a JSON object';
    end if;

    assignment_count := jsonb_array_length(p_assignments);
    if assignment_count < 1 or assignment_count > 3 then
        raise exception 'Expected between 1 and 3 topic assignments';
    end if;
    if (
        select count(*)
        from jsonb_array_elements(p_assignments) item
        where coalesce((item->>'is_primary')::boolean, false)
    ) <> 1 then
        raise exception 'Exactly one assignment must be primary';
    end if;
    if (
        select count(distinct item->>'slug')
        from jsonb_array_elements(p_assignments) item
    ) <> assignment_count then
        raise exception 'Topic assignment slugs must be unique';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(p_assignments) item
        left join public.topic
          on topic.slug = item->>'slug'
         and topic.status = 'active'
        where topic.id is null
           or item->>'confidence' is null
           or (item->>'confidence')::numeric not between 0 and 1
           or item->>'is_primary' is null
           or nullif(item->>'rationale', '') is null
    ) then
        raise exception 'Assignments contain an invalid topic, confidence, or rationale';
    end if;

    if p_record_type = 'agency_document' then
        delete from public.agency_document_topic
        where agency_document_id = p_record_id
          and assignment_source = 'ai_suggested';

        insert into public.agency_document_topic (
            agency_document_id,
            topic_id,
            assignment_source,
            assignment_status,
            confidence,
            is_primary,
            evidence,
            reviewed_at
        )
        select
            p_record_id,
            topic.id,
            'ai_suggested',
            'approved',
            (item->>'confidence')::numeric,
            (item->>'is_primary')::boolean,
            coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
                'rationale', item->>'rationale'
            ),
            now()
        from jsonb_array_elements(p_assignments) item
        join public.topic on topic.slug = item->>'slug';
    else
        delete from public.cluster_topic
        where cluster_id = p_record_id
          and assignment_source = 'ai_suggested';

        insert into public.cluster_topic (
            cluster_id,
            topic_id,
            assignment_source,
            assignment_status,
            confidence,
            is_primary,
            evidence,
            reviewed_at
        )
        select
            p_record_id,
            topic.id,
            'ai_suggested',
            'approved',
            (item->>'confidence')::numeric,
            (item->>'is_primary')::boolean,
            coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
                'rationale', item->>'rationale'
            ),
            now()
        from jsonb_array_elements(p_assignments) item
        join public.topic on topic.slug = item->>'slug';
    end if;

    get diagnostics inserted_count = row_count;
    if inserted_count <> assignment_count then
        raise exception 'Expected % assignments but inserted %', assignment_count, inserted_count;
    end if;
    return inserted_count;
end;
$$;

revoke execute on function public.get_topic_classification_candidates(integer, integer, text)
from public, anon, authenticated;
revoke execute on function public.replace_ai_topic_assignments(text, bigint, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.get_topic_classification_candidates(integer, integer, text)
to service_role;
grant execute on function public.replace_ai_topic_assignments(text, bigint, jsonb, jsonb)
to service_role;

comment on function public.get_topic_classification_candidates(integer, integer, text) is
    'Returns the most recently updated, unclassified agency documents and court clusters within a bounded lookback window.';
comment on function public.replace_ai_topic_assignments(text, bigint, jsonb, jsonb) is
    'Atomically replaces AI-owned topic assignments with approved canonical topics.';
