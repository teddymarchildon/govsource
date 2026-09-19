-- Optional failures must not delete previously synchronized data.
alter table public.bill add column sync_pending boolean not null default false;
alter table public.bill add column sync_missing_fields text[] not null default '{}';

create or replace function public.replace_bill_children(
  p_bill_id bigint,
  p_sponsor_ids jsonb,
  p_cosponsor_ids jsonb,
  p_texts jsonb,
  p_actions jsonb,
  p_summaries jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_sponsor_ids is not null and p_sponsor_ids <> 'null'::jsonb then
  delete from public.sponsored_bills where bill_id = p_bill_id;
  insert into public.sponsored_bills (bill_id, congressman_id)
  select distinct p_bill_id, trim(both '"' from value::text)::bigint
  from jsonb_array_elements(coalesce(p_sponsor_ids, '[]'::jsonb));

  end if;

  if p_cosponsor_ids is not null and p_cosponsor_ids <> 'null'::jsonb then
  delete from public.cosponsored_bills where bill_id = p_bill_id;
  insert into public.cosponsored_bills (bill_id, congressman_id)
  select distinct p_bill_id, trim(both '"' from value::text)::bigint
  from jsonb_array_elements(coalesce(p_cosponsor_ids, '[]'::jsonb));

  end if;

  if p_texts is not null and p_texts <> 'null'::jsonb then
  -- Preserve a stored format only when it belongs to the same version and URL.
  select coalesce(jsonb_agg(item || jsonb_build_object(
    'pdf_file_path',coalesce(item->>'pdf_file_path',case when old.pdf_url=item->>'pdf_url' then old.pdf_file_path end),
    'html_file_path',coalesce(item->>'html_file_path',case when old.html_url=item->>'html_url' then old.html_file_path end),
    'xml_file_path',coalesce(item->>'xml_file_path',case when old.xml_url=item->>'xml_url' then old.xml_file_path end)
  )),'[]'::jsonb) into p_texts
  from jsonb_array_elements(p_texts) item
  left join public.bill_text old on old.bill_id=p_bill_id
    and old.date is not distinct from nullif(item->>'date','')::timestamptz::date
    and old.type is not distinct from nullif(item->>'type','')
    and old.fallback_key is not distinct from nullif(item->>'fallback_key','');
  delete from public.bill_text where bill_id = p_bill_id;
  insert into public.bill_text (
    bill_id, date, type, fallback_key, pdf_url, html_url, xml_url,
    pdf_file_path, html_file_path, xml_file_path
  )
  select
    p_bill_id,
    nullif(item->>'date', '')::timestamptz::date,
    nullif(item->>'type', ''),
    nullif(item->>'fallback_key', ''),
    nullif(item->>'pdf_url', ''),
    nullif(item->>'html_url', ''),
    nullif(item->>'xml_url', ''),
    nullif(item->>'pdf_file_path', ''),
    nullif(item->>'html_file_path', ''),
    nullif(item->>'xml_file_path', '')
  from jsonb_array_elements(coalesce(p_texts, '[]'::jsonb)) as item;

  end if;

  if p_actions is not null and p_actions <> 'null'::jsonb then
  perform public.replace_bill_actions(p_bill_id, p_actions);

  end if;

  if p_summaries is not null and p_summaries <> 'null'::jsonb then
  delete from public.bill_summary where bill = p_bill_id;
  insert into public.bill_summary (bill, date, text)
  select distinct
    p_bill_id,
    (item->>'date')::date,
    item->>'text'
  from jsonb_array_elements(coalesce(p_summaries, '[]'::jsonb)) as item
  where nullif(item->>'date', '') is not null
    and nullif(item->>'text', '') is not null;
  end if;

end;
$$;

create function public.complete_bill_sync(p_bill_id bigint,p_sponsor_ids jsonb,p_cosponsor_ids jsonb,
 p_texts jsonb,p_actions jsonb,p_summaries jsonb,p_missing_fields text[])
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.replace_bill_children(p_bill_id,p_sponsor_ids,p_cosponsor_ids,p_texts,p_actions,p_summaries);
 update public.bill set sync_pending=false,sync_missing_fields=coalesce(p_missing_fields,'{}') where id=p_bill_id;
end $$;
revoke all on function public.complete_bill_sync(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.complete_bill_sync(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,text[]) to service_role;
