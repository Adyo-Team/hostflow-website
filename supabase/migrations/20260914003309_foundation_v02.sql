-- Foundation v0.2: compatible upgrade, no tenant data is deleted.
begin;
-- Preserve the existing membership records, constraints and indexes.
alter table public.organization_memberships rename to organization_members;
create view public.organization_memberships with (security_invoker=true) as select * from public.organization_members;
revoke all on public.organization_memberships from public,anon,authenticated;
grant select on public.organization_memberships to authenticated;

alter table public.organizations add column country text check(country ~ '^[A-Z]{2}$');
alter table public.organizations add column team_setup_completed_at timestamptz;
-- Legacy organizations have unknown country, requiring explicit completion in UI.
-- Upgrade the creator where still active; never silently assign an unrelated user.
update public.organization_members m set role=case when m.user_id=o.created_by then 'owner'::public.organization_role else 'admin'::public.organization_role end
from public.organizations o where o.id=m.organization_id and m.role='organization_admin';
do $$ begin
  if exists(select 1 from public.organizations o where not exists(select 1 from public.organization_members m where m.organization_id=o.id and m.role='owner' and m.status='active')) then
    raise exception 'legacy_organization_requires_owner_review';
  end if;
end $$;
update public.organization_invitations set role='admin' where role='organization_admin';
alter table public.organization_invitations add column invited_by uuid generated always as (created_by) stored references auth.users(id) on delete restrict;
alter table public.organization_invitations add column status text generated always as
  (case when accepted_at is not null then 'accepted' when revoked_at is not null then 'revoked' else 'pending' end) stored;
alter table public.organization_invitations add constraint invitation_one_terminal_state check(accepted_at is null or revoked_at is null);
create index organizations_creator on public.organizations(created_by);
create index members_user on public.organization_members(user_id);
create index members_creator on public.organization_members(created_by);
create index invitations_creator on public.organization_invitations(created_by);
create index invitations_inviter on public.organization_invitations(invited_by);
create index audit_actor on public.audit_logs(actor_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '' check(char_length(first_name)<=100),
  last_name text not null default '' check(char_length(last_name)<=100),
  avatar_url text check(avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url)<=2048)),
  phone text check(phone is null or char_length(phone)<=30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy profiles_read_self on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
revoke all on public.profiles from public,anon,authenticated;
grant select on public.profiles to authenticated;
grant update(first_name,last_name,avatar_url,phone) on public.profiles to authenticated;
create trigger touch_profile before update on public.profiles for each row execute function private.touch_updated_at();
-- User-editable metadata supplies display fields only. It never supplies a role.
create function private.create_user_profile() returns trigger language plpgsql security definer set search_path=''
as $$ begin
  insert into public.profiles(id,first_name,last_name) values(new.id,left(btrim(coalesce(new.raw_user_meta_data->>'first_name','')),100),left(btrim(coalesce(new.raw_user_meta_data->>'last_name','')),100));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_user_profile();
insert into public.profiles(id,first_name,last_name)
select u.id,
  left(coalesce(nullif(btrim(u.raw_user_meta_data->>'first_name'),''),(select split_part(m.display_name,' ',1) from public.organization_members m where m.user_id=u.id order by m.created_at limit 1),''),100),
  left(coalesce(u.raw_user_meta_data->>'last_name',''),100)
from auth.users u on conflict(id) do nothing;

create or replace function private.role_in(org uuid) returns public.organization_role
language sql stable security definer set search_path=''
as $$ select m.role from public.organization_members m where auth.uid() is not null and m.organization_id=org and m.user_id=(select auth.uid()) and m.status='active' $$;
create or replace function private.audit_change() returns trigger language plpgsql security definer set search_path=''
as $$
declare row_data jsonb; org uuid; details jsonb:='{}';
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  org:=case when tg_table_name='organizations' then (row_data->>'id')::uuid else (row_data->>'organization_id')::uuid end;
  if tg_table_name='organization_members' then
    details:=jsonb_build_object('role',row_data->>'role','status',row_data->>'status');
    if tg_op='UPDATE' then details:=details || jsonb_build_object('previous_role',old.role,'previous_status',old.status); end if;
  elsif tg_table_name='organization_invitations' then
    details:=jsonb_build_object('role',new.role,'accepted',new.accepted_at is not null,'revoked',new.revoked_at is not null);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,auth.uid(),lower(tg_op),tg_table_name,(row_data->>'id')::uuid,details);
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger audit_member_delete after delete on public.organization_members for each row execute function private.audit_change();

-- Read authorization depends on current active membership, never the selected tenant cookie.
drop policy members_read on public.organization_members;
create policy members_read on public.organization_members for select to authenticated using (
  private.role_in(organization_id) in ('owner','admin','manager') or (user_id=(select auth.uid()) and status='active')
);
drop policy invitations_read on public.organization_invitations;
create policy invitations_read on public.organization_invitations for select to authenticated using(private.role_in(organization_id) in ('owner','admin'));
drop policy audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using(private.role_in(organization_id) in ('owner','admin'));
grant select(status,invited_by) on public.organization_invitations to authenticated;

-- Remove only superseded entrypoints, without CASCADE or table drops.
-- Sensitive implementations live in private; public RPCs are SECURITY INVOKER wrappers.
drop function public.create_organization(text,text,text,text,text);
drop function public.update_organization(uuid,text,text,text);
drop function public.update_my_profile(uuid,text);
drop function public.update_membership(uuid,uuid,public.organization_role,public.membership_status);
drop function public.create_invitation(uuid,text,public.organization_role);
drop function public.revoke_invitation(uuid,uuid);
drop function public.accept_invitation(text,text);

create function private.require_verified_user() returns uuid language plpgsql stable security definer set search_path=''
as $$ declare uid uuid:=auth.uid(); begin
  if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'verified_user_required' using errcode='42501'; end if;
  return uid;
end $$;
create function private.check_org_settings(p_country text,p_timezone text) returns void language plpgsql set search_path=''
as $$ begin
  if p_country is null or p_country not in ('BE','FR','MA','CH','CA','US','GB','LU','NL','DE','ES','IT','PT','AE','TN','DZ') then raise exception 'invalid_country' using errcode='22023'; end if;
  if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid_timezone' using errcode='22023'; end if;
end $$;
create function private.create_organization(p_name text,p_slug text,p_timezone text,p_currency text,p_country text) returns uuid
language plpgsql security definer set search_path=''
as $$ declare org uuid; uid uuid:=private.require_verified_user(); display text; begin
  perform private.check_org_settings(p_country,p_timezone);
  select nullif(btrim(concat_ws(' ',first_name,last_name)),'') into display from public.profiles where id=uid;
  if display is null then raise exception 'profile_required' using errcode='22023'; end if;
  insert into public.organizations(name,slug,timezone,currency,country,created_by) values(btrim(p_name),lower(btrim(p_slug)),p_timezone,p_currency,p_country,uid) returning id into org;
  insert into public.organization_members(organization_id,user_id,display_name,role,created_by) values(org,uid,left(display,100),'owner',uid);
  return org;
end $$;
create function private.update_organization(p_organization_id uuid,p_name text,p_timezone text,p_currency text,p_country text) returns void
language plpgsql security definer set search_path=''
as $$ begin
  perform private.require_verified_user();
  perform 1 from public.organizations where id=p_organization_id for update;
  if private.role_in(p_organization_id) is null or private.role_in(p_organization_id) not in ('owner','admin') then raise exception 'forbidden' using errcode='42501'; end if;
  perform private.check_org_settings(p_country,p_timezone);
  update public.organizations set name=btrim(p_name),timezone=p_timezone,currency=p_currency,country=p_country where id=p_organization_id;
end $$;
create function private.check_member_change(p_organization_id uuid,p_membership_id uuid,p_role public.organization_role,p_status public.membership_status,p_remove boolean default false)
returns public.organization_members language plpgsql security definer set search_path=''
as $$ declare actor public.organization_role; target public.organization_members; begin
  perform private.require_verified_user();
  -- Serialize all writes affecting membership/permissions on the same tenant.
  perform 1 from public.organizations where id=p_organization_id for update;
  actor:=private.role_in(p_organization_id);
  if actor is null or actor not in ('owner','admin') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into target from public.organization_members where id=p_membership_id and organization_id=p_organization_id for update;
  if not found then raise exception 'member_not_found' using errcode='22023'; end if;
  if not p_remove and (p_role is null or p_role not in ('owner','admin','manager','staff') or p_status is null) then raise exception 'unsupported_role' using errcode='22023'; end if;
  if actor='admin' and (target.role not in ('manager','staff') or (not p_remove and p_role not in ('manager','staff'))) then raise exception 'owner_required' using errcode='42501'; end if;
  if target.role='owner' and target.status='active' and (p_remove or p_role<>'owner' or p_status<>'active') and
    (select count(*) from public.organization_members where organization_id=p_organization_id and role='owner' and status='active')<=1 then raise exception 'last_owner_required' using errcode='23514'; end if;
  return target;
end $$;
create function private.update_membership(p_organization_id uuid,p_membership_id uuid,p_role public.organization_role,p_status public.membership_status) returns void
language plpgsql security definer set search_path=''
as $$ begin
  perform private.check_member_change(p_organization_id,p_membership_id,p_role,p_status);
  update public.organization_members set role=p_role,status=p_status where organization_id=p_organization_id and id=p_membership_id;
end $$;
create function private.remove_member(p_organization_id uuid,p_membership_id uuid) returns void
language plpgsql security definer set search_path=''
as $$ begin
  perform private.check_member_change(p_organization_id,p_membership_id,null,null,true);
  -- Withdraw pending invitations to this account before removing membership.
  update public.organization_invitations set revoked_at=now() where organization_id=p_organization_id and status='pending' and email=(select lower(u.email) from auth.users u join public.organization_members m on m.user_id=u.id where m.id=p_membership_id and m.organization_id=p_organization_id);
  delete from public.organization_members where organization_id=p_organization_id and id=p_membership_id;
end $$;
create function private.create_invitation(p_organization_id uuid,p_email text,p_role public.organization_role) returns text
language plpgsql security definer set search_path=''
as $$ declare token text; normalized text:=lower(btrim(p_email)); actor public.organization_role; begin
  perform private.require_verified_user();
  perform 1 from public.organizations where id=p_organization_id for update;
  actor:=private.role_in(p_organization_id);
  if actor is null or actor not in ('owner','admin') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_role is null or p_role not in ('admin','manager','staff') then raise exception 'unsupported_role' using errcode='22023'; end if;
  if actor='admin' and p_role='admin' then raise exception 'owner_required' using errcode='42501'; end if;
  if exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=p_organization_id and lower(u.email)=normalized) then raise exception 'already_member' using errcode='23505'; end if;
  -- An admin may not replace an owner's pending admin invitation with a lower role.
  if actor='admin' and exists(select 1 from public.organization_invitations where organization_id=p_organization_id and email=normalized and status='pending' and role not in ('manager','staff')) then raise exception 'owner_required' using errcode='42501'; end if;
  update public.organization_invitations set revoked_at=now() where organization_id=p_organization_id and email=normalized and status='pending';
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.organization_invitations(organization_id,email,role,token_hash,created_by) values(p_organization_id,normalized,p_role,encode(extensions.digest(token,'sha256'),'hex'),auth.uid());
  update public.organizations set team_setup_completed_at=coalesce(team_setup_completed_at,now()) where id=p_organization_id;
  return token;
end $$;
create function private.revoke_invitation(p_organization_id uuid,p_invitation_id uuid) returns void
language plpgsql security definer set search_path=''
as $$ declare actor public.organization_role; target public.organization_invitations; begin
  perform private.require_verified_user();
  perform 1 from public.organizations where id=p_organization_id for update;
  actor:=private.role_in(p_organization_id);
  if actor is null or actor not in ('owner','admin') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into target from public.organization_invitations where id=p_invitation_id and organization_id=p_organization_id and status='pending' for update;
  if not found then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  if actor='admin' and target.role not in ('manager','staff') then raise exception 'owner_required' using errcode='42501'; end if;
  update public.organization_invitations set revoked_at=now() where id=target.id;
end $$;
create function private.accept_invitation(p_token text) returns uuid language plpgsql security definer set search_path=''
as $$ declare invite public.organization_invitations; org uuid; user_email text; display text; uid uuid:=private.require_verified_user(); begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  select lower(email) into user_email from auth.users where id=uid;
  select organization_id into org from public.organization_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  perform 1 from public.organizations where id=org for update;
  select * into invite from public.organization_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or invite.status<>'pending' or invite.expires_at<=now() or invite.email<>user_email then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  if invite.role not in ('admin','manager','staff') then raise exception 'unsupported_role' using errcode='22023'; end if;
  -- Removing/suspending/demoting an inviter revokes their outstanding grant authority.
  if not exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=invite.invited_by and m.status='active' and (m.role='owner' or (m.role='admin' and invite.role in ('manager','staff')))) then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  if exists(select 1 from public.organization_members where organization_id=org and user_id=uid) then raise exception 'already_member' using errcode='23505'; end if;
  select nullif(btrim(concat_ws(' ',first_name,last_name)),'') into display from public.profiles where id=uid;
  if display is null then raise exception 'profile_required' using errcode='22023'; end if;
  insert into public.organization_members(organization_id,user_id,display_name,role,created_by) values(org,uid,left(display,100),invite.role,uid);
  update public.organization_invitations set accepted_at=now() where id=invite.id;
  update public.organizations set team_setup_completed_at=coalesce(team_setup_completed_at,now()) where id=org;
  return org;
end $$;
-- Minimal tenant-scoped projection: never expose auth.users or colleagues' phone/avatar.
create function private.list_team(p_organization_id uuid) returns table(id uuid,organization_id uuid,user_id uuid,display_name text,role public.organization_role,status public.membership_status,created_at timestamptz,email text)
language plpgsql stable security definer set search_path=''
as $$ declare actor public.organization_role; begin
  perform private.require_verified_user();
  actor:=private.role_in(p_organization_id);
  if actor is null then raise exception 'forbidden' using errcode='42501'; end if;
  return query select m.id,m.organization_id,m.user_id,coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),m.display_name),m.role,m.status,m.created_at,u.email::text
    from public.organization_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id
    where m.organization_id=p_organization_id and (actor in ('owner','admin','manager') or (m.user_id=auth.uid() and m.status='active')) order by m.created_at;
end $$;
create function private.complete_team_setup(p_organization_id uuid) returns void language plpgsql security definer set search_path=''
as $$ begin
  perform private.require_verified_user();
  perform 1 from public.organizations where id=p_organization_id for update;
  if private.role_in(p_organization_id) is null or private.role_in(p_organization_id) not in ('owner','admin') then raise exception 'forbidden' using errcode='42501'; end if;
  update public.organizations set team_setup_completed_at=coalesce(team_setup_completed_at,now()) where id=p_organization_id;
end $$;

create function public.create_organization(p_name text,p_slug text,p_timezone text,p_currency text,p_country text) returns uuid language sql security invoker set search_path='' as $$ select private.create_organization(p_name,p_slug,p_timezone,p_currency,p_country) $$;
create function public.update_organization(p_organization_id uuid,p_name text,p_timezone text,p_currency text,p_country text) returns void language sql security invoker set search_path='' as $$ select private.update_organization(p_organization_id,p_name,p_timezone,p_currency,p_country) $$;
create function public.update_membership(p_organization_id uuid,p_membership_id uuid,p_role public.organization_role,p_status public.membership_status) returns void language sql security invoker set search_path='' as $$ select private.update_membership(p_organization_id,p_membership_id,p_role,p_status) $$;
create function public.remove_member(p_organization_id uuid,p_membership_id uuid) returns void language sql security invoker set search_path='' as $$ select private.remove_member(p_organization_id,p_membership_id) $$;
create function public.create_invitation(p_organization_id uuid,p_email text,p_role public.organization_role) returns text language sql security invoker set search_path='' as $$ select private.create_invitation(p_organization_id,p_email,p_role) $$;
create function public.revoke_invitation(p_organization_id uuid,p_invitation_id uuid) returns void language sql security invoker set search_path='' as $$ select private.revoke_invitation(p_organization_id,p_invitation_id) $$;
create function public.accept_invitation(p_token text) returns uuid language sql security invoker set search_path='' as $$ select private.accept_invitation(p_token) $$;
create function public.list_team(p_organization_id uuid) returns table(id uuid,organization_id uuid,user_id uuid,display_name text,role public.organization_role,status public.membership_status,created_at timestamptz,email text) language sql security invoker set search_path='' as $$ select * from private.list_team(p_organization_id) $$;
create function public.complete_team_setup(p_organization_id uuid) returns void language sql security invoker set search_path='' as $$ select private.complete_team_setup(p_organization_id) $$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.role_in(uuid),private.create_organization(text,text,text,text,text),private.update_organization(uuid,text,text,text,text),private.update_membership(uuid,uuid,public.organization_role,public.membership_status),private.remove_member(uuid,uuid),private.create_invitation(uuid,text,public.organization_role),private.revoke_invitation(uuid,uuid),private.accept_invitation(text),private.list_team(uuid),private.complete_team_setup(uuid) to authenticated;
revoke all on function public.create_organization(text,text,text,text,text),public.update_organization(uuid,text,text,text,text),public.update_membership(uuid,uuid,public.organization_role,public.membership_status),public.remove_member(uuid,uuid),public.create_invitation(uuid,text,public.organization_role),public.revoke_invitation(uuid,uuid),public.accept_invitation(text),public.list_team(uuid),public.complete_team_setup(uuid) from public,anon,authenticated;
grant execute on function public.create_organization(text,text,text,text,text),public.update_organization(uuid,text,text,text,text),public.update_membership(uuid,uuid,public.organization_role,public.membership_status),public.remove_member(uuid,uuid),public.create_invitation(uuid,text,public.organization_role),public.revoke_invitation(uuid,uuid),public.accept_invitation(text),public.list_team(uuid),public.complete_team_setup(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
