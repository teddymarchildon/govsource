-- Optional editorial headline for listings; full titles, slugs and article metadata stay intact.
alter table public.brief
  add column display_title text
  constraint brief_display_title_length check (
    display_title is null or (char_length(btrim(display_title)) between 1 and 100)
  );

comment on column public.brief.display_title is
  'Optional short editorial headline for previews. Null falls back to title.';
