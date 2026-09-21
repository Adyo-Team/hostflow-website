-- HostFlow foundation. Additive; run once through Supabase migrations.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.organization_role as enum ('organization_admin','manager','staff','property_owner','guest');
create type public.membership_status as enum ('active','suspended');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  timezone text not null default 'Europe/Brussels',
  currency text not null default 'EUR' check (currency in ('EUR','USD','GBP','MAD','CHF','CAD')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  role public.organization_role not null,
  status public.membership_status not null default 'active',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,user_id),
  unique (organization_id,id)
);
create index membership_user_active on public.organization_memberships (user_id,organization_id) where status='active';
create index membership_org_role on public.organization_memberships (organization_id,role,status);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null check (email=lower(btrim(email)) and char_length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role public.organization_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);
create index invitation_org_created on public.organization_invitations (organization_id,created_at desc);
create unique index one_pending_invite on public.organization_invitations (organization_id,email) where accepted_at is null and revoked_at is null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_org_created on public.audit_logs (organization_id,created_at desc);
create table private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
revoke all on private.platform_admins from public,anon,authenticated;

create function private.role_in(org uuid) returns public.organization_role
language sql stable security definer set search_path=''
as $$ select m.role from public.organization_memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.status='active' $$;
create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path=''
as $$ select exists(select 1 from private.platform_admins where user_id=(select auth.uid())) $$;
create function private.touch_updated_at() returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now(); return new; end $$;
create function private.audit_change() returns trigger language plpgsql security definer set search_path=''
as $$
declare org uuid; details jsonb:='{}';
begin
  if tg_table_name='organizations' then org:=new.id;
  else org:=new.organization_id; end if;
  if tg_table_name='organization_memberships' then
    details:=jsonb_build_object('role',new.role,'status',new.status);
    if tg_op='UPDATE' then details:=details || jsonb_build_object('previous_role',old.role,'previous_status',old.status); end if;
  elsif tg_table_name='organization_invitations' then
    details:=jsonb_build_object('role',new.role,'accepted',new.accepted_at is not null,'revoked',new.revoked_at is not null);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,auth.uid(),lower(tg_op),tg_table_name,new.id,details);
  return new;
end $$;
create trigger touch_org before update on public.organizations for each row execute function private.touch_updated_at();
create trigger touch_membership before update on public.organization_memberships for each row execute function private.touch_updated_at();
create trigger touch_invitation before update on public.organization_invitations for each row execute function private.touch_updated_at();
create trigger audit_org after insert or update on public.organizations for each row execute function private.audit_change();
create trigger audit_membership after insert or update on public.organization_memberships for each row execute function private.audit_change();
create trigger audit_invitation after insert or update on public.organization_invitations for each row execute function private.audit_change();

alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_memberships force row level security;
alter table public.organization_invitations enable row level security;
alter table public.organization_invitations force row level security;
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
alter table private.platform_admins enable row level security;
create policy org_read on public.organizations for select to authenticated using (private.role_in(id) is not null);
create policy members_read on public.organization_memberships for select to authenticated using (
  private.role_in(organization_id) in ('organization_admin','manager') or (user_id=(select auth.uid()) and status='active')
);
create policy invitations_read on public.organization_invitations for select to authenticated using (private.role_in(organization_id)='organization_admin');
create policy audit_read on public.audit_logs for select to authenticated using (private.role_in(organization_id)='organization_admin');
revoke all on public.organizations,public.organization_memberships,public.organization_invitations,public.audit_logs from public,anon,authenticated;
grant select on public.organizations,public.organization_memberships,public.audit_logs to authenticated;
grant select(id,organization_id,email,role,expires_at,accepted_at,revoked_at,created_by,created_at,updated_at) on public.organization_invitations to authenticated;

create function public.create_organization(p_name text,p_slug text,p_timezone text,p_currency text,p_display_name text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare org uuid; uid uuid:=auth.uid();
begin
  if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'verified_user_required' using errcode='42501'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid_timezone' using errcode='22023'; end if;
  insert into public.organizations(name,slug,timezone,currency,created_by) values(btrim(p_name),lower(btrim(p_slug)),p_timezone,p_currency,uid) returning id into org;
  insert into public.organization_memberships(organization_id,user_id,display_name,role,created_by) values(org,uid,btrim(p_display_name),'organization_admin',uid);
  return org;
end $$;
create function public.update_organization(p_organization_id uuid,p_name text,p_timezone text,p_currency text)
returns void language plpgsql security definer set search_path=''
as $$ begin
  perform 1 from public.organizations where id=p_organization_id for update;
  if private.role_in(p_organization_id) is distinct from 'organization_admin'::public.organization_role then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid_timezone' using errcode='22023'; end if;
  update public.organizations set name=btrim(p_name),timezone=p_timezone,currency=p_currency where id=p_organization_id;
end $$;
create function public.update_my_profile(p_organization_id uuid,p_display_name text)
returns void language plpgsql security definer set search_path=''
as $$ begin
  perform 1 from public.organizations where id=p_organization_id for update;
  if private.role_in(p_organization_id) is null then raise exception 'forbidden' using errcode='42501'; end if;
  update public.organization_memberships set display_name=btrim(p_display_name) where organization_id=p_organization_id and user_id=auth.uid() and status='active';
end $$;
create function public.update_membership(p_organization_id uuid,p_membership_id uuid,p_role public.organization_role,p_status public.membership_status)
returns void language plpgsql security definer set search_path=''
as $$
declare target public.organization_memberships;
begin
  -- All membership mutations lock the tenant first, including invite acceptance.
  perform 1 from public.organizations where id=p_organization_id for update;
  if private.role_in(p_organization_id) is distinct from 'organization_admin'::public.organization_role then raise exception 'forbidden' using errcode='42501'; end if;
  select * into target from public.organization_memberships where id=p_membership_id and organization_id=p_organization_id for update;
  if not found then raise exception 'member_not_found' using errcode='22023'; end if;
  if target.role='organization_admin' and target.status='active' and (p_role<>'organization_admin' or p_status<>'active') and
    (select count(*) from public.organization_memberships where organization_id=p_organization_id and role='organization_admin' and status='active')<=1 then
    raise exception 'last_admin_required' using errcode='23514';
  end if;
  update public.organization_memberships set role=p_role,status=p_status where id=target.id;
end $$;
create function public.create_invitation(p_organization_id uuid,p_email text,p_role public.organization_role)
returns text language plpgsql security definer set search_path=''
as $$
declare token text; normalized text:=lower(btrim(p_email));
begin
  perform 1 from public.organizations where id=p_organization_id for update;
  if private.role_in(p_organization_id) is distinct from 'organization_admin'::public.organization_role then raise exception 'forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.organization_memberships m join auth.users u on u.id=m.user_id where m.organization_id=p_organization_id and lower(u.email)=normalized) then raise exception 'already_member' using errcode='23505'; end if;
  update public.organization_invitations set revoked_at=now() where organization_id=p_organization_id and email=normalized and accepted_at is null and revoked_at is null;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.organization_invitations(organization_id,email,role,token_hash,created_by)
  values(p_organization_id,normalized,p_role,encode(extensions.digest(token,'sha256'),'hex'),auth.uid());
  return token;
end $$;
create function public.revoke_invitation(p_organization_id uuid,p_invitation_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ begin
  perform 1 from public.organizations where id=p_organization_id for update;
  if private.role_in(p_organization_id) is distinct from 'organization_admin'::public.organization_role then raise exception 'forbidden' using errcode='42501'; end if;
  update public.organization_invitations set revoked_at=now() where id=p_invitation_id and organization_id=p_organization_id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'invitation_unavailable' using errcode='22023'; end if;
end $$;
create function public.accept_invitation(p_token text,p_display_name text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare invite public.organization_invitations; org uuid; user_email text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  select lower(email) into user_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if user_email is null then raise exception 'verified_user_required' using errcode='42501'; end if;
  select organization_id into org from public.organization_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  perform 1 from public.organizations where id=org for update;
  select * into invite from public.organization_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or invite.accepted_at is not null or invite.revoked_at is not null or invite.expires_at<=now() or invite.email<>user_email then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  if exists(select 1 from public.organization_memberships where organization_id=invite.organization_id and user_id=auth.uid()) then raise exception 'already_member' using errcode='23505'; end if;
  insert into public.organization_memberships(organization_id,user_id,display_name,role,created_by) values(invite.organization_id,auth.uid(),btrim(p_display_name),invite.role,auth.uid());
  update public.organization_invitations set accepted_at=now() where id=invite.id;
  return invite.organization_id;
end $$;

-- Default PostgreSQL EXECUTE to PUBLIC must be removed for every definer.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.role_in(uuid) to authenticated;
revoke all on function public.create_organization(text,text,text,text,text),public.update_organization(uuid,text,text,text),public.update_my_profile(uuid,text),public.update_membership(uuid,uuid,public.organization_role,public.membership_status),public.create_invitation(uuid,text,public.organization_role),public.revoke_invitation(uuid,uuid),public.accept_invitation(text,text) from public,anon,authenticated;
grant execute on function public.create_organization(text,text,text,text,text),public.update_organization(uuid,text,text,text),public.update_my_profile(uuid,text),public.update_membership(uuid,uuid,public.organization_role,public.membership_status),public.create_invitation(uuid,text,public.organization_role),public.revoke_invitation(uuid,uuid),public.accept_invitation(text,text) to authenticated;
commit;
