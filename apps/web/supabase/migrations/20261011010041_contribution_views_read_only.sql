-- Hosted default privileges can grant writes to new views. Readers only need SELECT.
revoke all on public.fec_contribution_month_totals, public.fec_individual_receipts_normalized from public, anon, authenticated;
grant select on public.fec_contribution_month_totals, public.fec_individual_receipts_normalized to anon, authenticated;
