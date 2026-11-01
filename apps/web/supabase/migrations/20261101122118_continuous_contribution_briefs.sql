-- Preserve legacy overviews; allow independently reviewed developments in a cycle.
drop index public.brief_contribution_overview_unique;
create unique index brief_contribution_development_unique
 on public.brief(primary_item_id,contribution_cycle,(coalesce(generation_metadata->>'fingerprint','overview')))
 where primary_item_type='campaign_finance';

-- All automatic admissions serialize on the same settings row. No publication.
create function public.stage_contribution_brief(p_draft jsonb) returns bigint
language plpgsql security invoker set search_path='' as $$
declare cfg public.brief_pipeline_settings; result bigint; member bigint := (p_draft->>'primary_item_id')::bigint;
 cycle smallint := (p_draft->>'contribution_cycle')::smallint;
 fingerprint text := p_draft->'generation_metadata'->>'fingerprint';
 today date := (now() at time zone 'UTC')::date;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 if not found then raise exception 'Editorial settings unavailable'; end if;
 if p_draft->>'primary_item_type' is distinct from 'campaign_finance'
 or fingerprint is null or fingerprint !~ '^[a-f0-9]{64}$'
 or p_draft->'generation_metadata'->'verification'->>'checkedAt' is null
 or p_draft->'generation_metadata'->'selection'->>'selected' is distinct from 'true'
 or p_draft->'generation_metadata'->>'trigger' is distinct from 'contribution-continuous'
 then raise exception 'Verified selected contribution development required'; end if;
 -- A concurrent manual draft must also prevent automatic accumulation.
 if exists(select 1 from public.brief where primary_item_type='campaign_finance'
   and primary_item_id=member and contribution_cycle=cycle
   and (generation_metadata->>'fingerprint'=fingerprint or status in ('draft','review','scheduled')))
 then return 0; end if;
 if (select count(distinct job_id) from public.brief_api_call where budget_day=today and stage<>'selection')
   + (select count(*) from public.brief where primary_item_type='campaign_finance'
       and generation_metadata->>'trigger'='contribution-continuous'
       and created_at >= today::timestamp at time zone 'UTC') >= cfg.daily_draft_limit
 then return null; end if;
 insert into public.brief(title,slug,dek,points,context_markdown,primary_item_type,primary_item_id,
   contribution_cycle,policy_areas,sources,author_name,status,published_at,auto_generated,editor_notes,generation_metadata)
 values(p_draft->>'title',p_draft->>'slug',p_draft->>'dek',p_draft->'points',p_draft->>'context_markdown',
   'campaign_finance',member,cycle,array['Campaign finance'],p_draft->'sources','GovSource','review',null,false,
   p_draft->>'editor_notes',p_draft->'generation_metadata') returning id into result;
 return result;
end $$;
revoke all on function public.stage_contribution_brief(jsonb) from public,anon,authenticated;
grant execute on function public.stage_contribution_brief(jsonb) to service_role;

create or replace function public.reserve_brief_api_call(p_job bigint,p_model text,p_stage text,p_amount numeric) returns uuid language plpgsql security invoker set search_path='' as $$
declare cfg public.brief_pipeline_settings; used numeric; result uuid; today date := (now() at time zone 'UTC')::date;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 if p_amount<=0 or p_amount>cfg.daily_budget_usd then raise exception 'Daily AI budget exhausted'; end if;
 if p_stage <> 'selection'
 and not exists(select 1 from public.brief_api_call where job_id=p_job and budget_day=today and stage<>'selection')
 and (select count(distinct job_id) from public.brief_api_call where budget_day=today and stage<>'selection')
 + (select count(*) from public.brief where primary_item_type='campaign_finance'
 and generation_metadata->>'trigger'='contribution-continuous'
 and created_at >= today::timestamp at time zone 'UTC') >= cfg.daily_draft_limit
 then raise exception 'Daily AI budget exhausted: daily draft limit reached'; end if;
 select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into used from public.brief_api_call where budget_day=today;
 if used+p_amount>cfg.daily_budget_usd then raise exception 'Daily AI budget exhausted'; end if;
 insert into public.brief_api_call(job_id,model,stage,reserved_usd) values(p_job,p_model,p_stage,p_amount) returning id into result;
 return result;
end $$;

