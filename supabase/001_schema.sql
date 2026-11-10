-- Auto Daak Collector: Phase 1 schema. Browser users can only READ (admins). All writes via service_role worker or RPC.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  cnic text unique, full_name text,
  role text not null default 'viewer' check (role in ('viewer','admin')),
  created_at timestamptz not null default now());

create or replace function public.fn_is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create table public.app_settings (id bigserial primary key, setting_key text unique not null, setting_value jsonb, updated_by uuid, updated_at timestamptz default now());
insert into public.app_settings(setting_key, setting_value) values
 ('global_pause', 'true'), ('outbound_whatsapp', 'false'), ('auto_write', 'false');

create table public.monitored_groups (id bigserial primary key, group_identifier text unique not null, display_name text, enabled boolean not null default false, created_by uuid, created_at timestamptz default now());
create table public.source_connections (id bigserial primary key, source_type text not null, label text, enabled boolean default false, configuration_json jsonb default '{}');
create table public.column_mappings (id bigserial primary key, target_heading text, normalized_heading text, source_table text, source_field text, match_rule text, enabled boolean default true);

create table public.spreadsheet_links (
  id bigserial primary key, url text not null, spreadsheet_id text, group_identifier text,
  detected_at timestamptz default now(), dedupe_key text unique,
  status text not null default 'detected' check (status in
   ('detected','queued','analyzing','awaiting_approval','approved','applying','completed','rejected','needs_review','conflict','failed','cancelled')));
create table public.spreadsheet_snapshots (id bigserial primary key, link_id bigint references public.spreadsheet_links on delete cascade, title text, worksheet_metadata jsonb, headers_json jsonb, snapshot_hash text, created_at timestamptz default now());
create table public.processing_jobs (id bigserial primary key, link_id bigint references public.spreadsheet_links on delete cascade, job_type text, status text default 'queued', attempts int default 0, next_retry_at timestamptz, error_summary text);

create table public.change_proposals (
  id bigserial primary key, link_id bigint references public.spreadsheet_links on delete cascade,
  proposal_version int not null default 1, status text not null default 'awaiting_approval'
   check (status in ('awaiting_approval','approved','rejected','applied','conflict','cancelled')),
  created_at timestamptz default now(), unique (link_id, proposal_version));
create table public.proposed_changes (
  id bigserial primary key, proposal_id bigint references public.change_proposals on delete cascade,
  worksheet text, cell_or_range text, row_key text, column_name text, old_value text, proposed_value text,
  source_reference text, match_status text default 'unverified', reviewed_override text, approved boolean);
create table public.approval_events (id bigserial primary key, proposal_id bigint references public.change_proposals, proposal_version int, decision text check (decision in ('approved','rejected','cancelled')), approved_by uuid, decided_at timestamptz default now(), notes text);
create table public.applied_changes (id bigserial primary key, proposal_id bigint, proposed_change_id bigint, target_range text, before_value text, after_value text, result text, applied_at timestamptz default now());
create table public.audit_logs (id bigserial primary key, actor_id uuid, event_type text, object_type text, object_id text, details_json jsonb, created_at timestamptz default now());

do $$ declare t text; begin
 foreach t in array array['profiles','app_settings','monitored_groups','source_connections','column_mappings','spreadsheet_links','spreadsheet_snapshots','processing_jobs','change_proposals','proposed_changes','approval_events','applied_changes','audit_logs'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy %I on public.%I for select to authenticated using (public.fn_is_admin())', t||'_admin_read', t);
 end loop; end $$;
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid());

-- Approval: admin approves/rejects one exact proposal version; worker applies later (never the browser).
create or replace function public.fn_decide_proposal(p_proposal bigint, p_version int, p_decision text, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_link bigint;
begin
  if not fn_is_admin() then raise exception 'admin only'; end if;
  if p_decision not in ('approved','rejected','cancelled') then raise exception 'bad decision'; end if;
  update change_proposals set status = p_decision where id = p_proposal and proposal_version = p_version and status = 'awaiting_approval' returning link_id into v_link;
  if v_link is null then raise exception 'proposal not awaiting approval or version mismatch'; end if;
  insert into approval_events(proposal_id, proposal_version, decision, approved_by, notes) values (p_proposal, p_version, p_decision, auth.uid(), p_notes);
  update spreadsheet_links set status = case p_decision when 'approved' then 'approved' when 'rejected' then 'rejected' else 'cancelled' end where id = v_link;
  insert into audit_logs(actor_id, event_type, object_type, object_id, details_json) values (auth.uid(), 'proposal_'||p_decision, 'change_proposal', p_proposal::text, jsonb_build_object('version', p_version));
end $$;
revoke all on function public.fn_decide_proposal(bigint,int,text,text) from public, anon;
grant execute on function public.fn_decide_proposal(bigint,int,text,text) to authenticated;
