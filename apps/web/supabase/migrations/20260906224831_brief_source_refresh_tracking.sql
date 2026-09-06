-- Storage contents may change without a new path or metadata revision.
create function public.note_brief_source_refresh(p_type text,p_id bigint) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_type not in ('bill','agency_document','cluster') then raise exception 'Invalid source type'; end if;
 insert into public.brief_source_change(item_type,item_id) values(p_type,p_id)
 on conflict(item_type,item_id) do update set revision=brief_source_change.revision+1,
 changed_at=now(),next_attempt_at=now(),error=null,attempts=0;
end $$;
revoke all on function public.note_brief_source_refresh(text,bigint) from public,anon,authenticated;
grant execute on function public.note_brief_source_refresh(text,bigint) to service_role;
