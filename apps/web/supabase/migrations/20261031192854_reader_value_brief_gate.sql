-- Factual support alone is insufficient for a public-service Brief.
create or replace function public.brief_editorial_quality_passes(q jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(q @> '{"passed":true,"reader_value":true,"adds_explanation":true,"context_not_metadata":true,"paraphrases_sources":true,"timing_clear":true}'::jsonb
 and q->'issues' = '[]'::jsonb,false);
$$;
revoke all on function public.brief_editorial_quality_passes(jsonb) from public,anon,authenticated;
grant execute on function public.brief_editorial_quality_passes(jsonb) to service_role;

create or replace function public.publish_verified_brief(p_job bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare j public.brief_job; a public.brief_attempt; c public.brief_source_change; cfg public.brief_pipeline_settings; result bigint; s text; d jsonb;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 select * into j from public.brief_job where id=p_job for update;
 if j.status='published' then return j.brief_id; end if;
 if cfg.editorial_review_required or not cfg.publication_enabled or j.status<>'verified' then return null; end if;
 s:=case j.source_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end;
 perform 1 where public.brief_source_ready(j.source_type,j.item_id);
 if not found then return null; end if;
 select * into c from public.brief_source_change where item_type=j.source_type and item_id=j.item_id for share;
 if c.revision is distinct from j.source_revision or public.brief_source_bundle(j.source_type,j.item_id) is distinct from j.source_metadata then return null; end if;
 select * into a from public.brief_attempt where job_id=j.id order by id desc limit 1;
 if not found or not a.passed or a.verification->>'passed'<>'true' or a.verification->>'deterministic_passed'<>'true' then raise exception 'Verified evidence required'; end if;
 -- Older factual-only verification must be screened and written under the new rubric.
 if not public.brief_editorial_quality_passes(a.verification->'editorial_quality') then
   update public.brief_job set status='retry',attempts=0,next_attempt_at=now(),
     reason='Editorial quality re-screen required',updated_at=now() where id=j.id;
   return null;
 end if;
 if (select count(*) from public.brief_job where status='published' and updated_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= cfg.daily_publication_limit then return null; end if;
 -- A correction can replace only the exact untouched automated version captured at discovery.
 if j.target_brief_id is not null then
   perform 1 from public.brief where id=j.target_brief_id and version=j.target_version and auto_generated and updated_by is null and status='published' for update;
   if not found then
     update public.brief_job set status='withheld',reason='Existing brief was edited; automatic replacement withheld',updated_at=now() where id=j.id;
     return null;
   end if;
   d:=a.draft;
   update public.brief set title=d->>'title',dek=d->>'dek',points=d->'points',context_markdown=nullif(d->>'context_markdown',''),
     sources=d->'sources',policy_areas=array(select jsonb_array_elements_text(d->'policy_areas')),
     generation_metadata=generation_metadata || jsonb_build_object('job_id',j.id,'attempt_id',a.id,'fingerprint',j.fingerprint,'correction',true)
   where id=j.target_brief_id;
   update public.brief_job set status='published',brief_id=j.target_brief_id,updated_at=now() where id=j.id;
   return j.target_brief_id;
 end if;
 if exists(select 1 from public.brief b where b.primary_item_id=j.item_id
 and b.primary_item_type in (j.item_type,j.source_type)
 and b.generation_metadata->>'development_key'=j.development_key) then
 update public.brief_job set status='withheld',reason='This development already has a brief',updated_at=now() where id=j.id;
 return null;
 end if;
 d:=a.draft;
 insert into public.brief(title,slug,dek,points,context_markdown,primary_item_type,primary_item_id,policy_areas,sources,author_name,status,published_at,auto_generated,generation_metadata)
 values(d->>'title',d->>'slug',d->>'dek',d->'points',nullif(d->>'context_markdown',''),j.item_type,j.item_id,
 array(select jsonb_array_elements_text(d->'policy_areas')),d->'sources','GovSource Briefs','published',now(),true,
 jsonb_build_object('pipeline','continuous-v1','job_id',j.id,'attempt_id',a.id,'fingerprint',j.fingerprint,'development_key',j.development_key,'prompt_version',a.prompt_version,'writer_model',a.writer_model,'verifier_model',a.verifier_model)) returning id into result;
 insert into public.brief_related_item(brief_id,item_type,item_id,relation_role,sort_order)
 select result,b.primary_item_type,b.primary_item_id,'Earlier coverage',0 from public.brief b
 where b.primary_item_id=j.item_id and b.primary_item_type in (j.item_type,j.source_type) and b.id<>result limit 1 on conflict do nothing;
 update public.brief_job set status='published',brief_id=result,updated_at=now() where id=j.id;
 return result;
end $$;

create or replace function public.stage_verified_brief(p_job bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare j public.brief_job; a public.brief_attempt; c public.brief_source_change; cfg public.brief_pipeline_settings; result bigint; s text; d jsonb;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 select * into j from public.brief_job where id=p_job for update;
 if j.brief_id is not null then return j.brief_id; end if;
 if not cfg.editorial_review_required or j.status<>'verified' then return null; end if;
 s:=case j.source_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end;
 perform 1 where public.brief_source_ready(j.source_type,j.item_id);
 if not found then return null; end if;
 select * into c from public.brief_source_change where item_type=j.source_type and item_id=j.item_id for share;
 if c.revision is distinct from j.source_revision or public.brief_source_bundle(j.source_type,j.item_id) is distinct from j.source_metadata then return null; end if;
 select * into a from public.brief_attempt where job_id=j.id order by id desc limit 1;
 if not found or not a.passed or a.verification->>'passed'<>'true' or a.verification->>'deterministic_passed'<>'true' then raise exception 'Verified evidence required'; end if;
 -- Older factual-only verification must be screened and written under the new rubric.
 if not public.brief_editorial_quality_passes(a.verification->'editorial_quality') then
   update public.brief_job set status='retry',attempts=0,next_attempt_at=now(),
     reason='Editorial quality re-screen required',updated_at=now() where id=j.id;
   return null;
 end if;
 -- Corrections never overwrite public copy without an editor's intervention.
 if j.target_brief_id is not null then
   update public.brief_job set status='withheld',reason='Correction requires editorial review of the saved verified attempt',updated_at=now() where id=j.id;
   return null;
 end if;
 if exists(select 1 from public.brief b where b.primary_item_id=j.item_id
 and b.primary_item_type in (j.item_type,j.source_type)
 and b.generation_metadata->>'development_key'=j.development_key) then
 update public.brief_job set status='withheld',reason='This development already has a brief',updated_at=now() where id=j.id;
 return null;
 end if;
 d:=a.draft;
 insert into public.brief(title,slug,dek,points,context_markdown,primary_item_type,primary_item_id,policy_areas,sources,author_name,status,published_at,auto_generated,generation_metadata)
 values(d->>'title',d->>'slug',d->>'dek',d->'points',nullif(d->>'context_markdown',''),j.item_type,j.item_id,
 array(select jsonb_array_elements_text(d->'policy_areas')),d->'sources','GovSource Briefs','review',null,true,
 jsonb_build_object('pipeline','continuous-v1','job_id',j.id,'attempt_id',a.id,'fingerprint',j.fingerprint,'development_key',j.development_key,'prompt_version',a.prompt_version,'writer_model',a.writer_model,'verifier_model',a.verifier_model)) returning id into result;
 insert into public.brief_related_item(brief_id,item_type,item_id,relation_role,sort_order)
 select result,b.primary_item_type,b.primary_item_id,'Earlier coverage',0 from public.brief b
 where b.primary_item_id=j.item_id and b.primary_item_type in (j.item_type,j.source_type) and b.id<>result limit 1 on conflict do nothing;
 update public.brief_job set brief_id=result,updated_at=now() where id=j.id;
 return result;
end $$;

-- Preserve existing drafts and paid attempts. Only un-staged legacy results
-- return to selection; their saved work is invalidated by the prompt version.
update public.brief_job j set status='retry',attempts=0,next_attempt_at=now(),
 reason='Editorial quality re-screen required',updated_at=now()
where j.status='verified' and j.brief_id is null
and not public.brief_editorial_quality_passes((select a.verification->'editorial_quality'
 from public.brief_attempt a where a.job_id=j.id order by a.id desc limit 1));
