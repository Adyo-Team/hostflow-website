-- v0.4: additive; existing identity, memberships and property permissions unchanged.
begin;
create extension if not exists btree_gist with schema extensions;
create table public.reservations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 property_id uuid not null,
 check_in date not null, check_out date not null,
 status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
 source text not null default 'manual' check(source in ('manual','airbnb','booking','vrbo','direct','other')),
 guest_name text not null check(char_length(btrim(guest_name)) between 1 and 150),
 guest_email text check(char_length(guest_email)<=254),
 guest_phone text check(char_length(guest_phone)<=50),
 guests_count integer not null default 1 check(guests_count between 1 and 1000),
 internal_notes text check(char_length(internal_notes)<=5000),
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 version integer not null default 1,
 unique(organization_id,id),
 foreign key(organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
 check(isfinite(check_in) and isfinite(check_out) and check_in<check_out)
);
create table public.property_blocks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 property_id uuid not null, start_date date not null, end_date date not null,
 reason text not null check(reason in ('owner','works','maintenance','internal')),
 notes text check(char_length(notes)<=5000), active boolean not null default true,
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 version integer not null default 1,
 unique(organization_id,id),
 foreign key(organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
 check(isfinite(start_date) and isfinite(end_date) and start_date<end_date)
);
create index reservations_property_dates on public.reservations(organization_id,property_id,check_in,id);
create index reservations_org_dates on public.reservations(organization_id,check_in,id);
create index reservations_creator on public.reservations(created_by);
create index property_blocks_property_dates on public.property_blocks(organization_id,property_id,start_date,id);
create index property_blocks_creator on public.property_blocks(created_by);

-- Single private availability registry: only triggers can write it. It is not
-- a Calendar module. Exclusion checks concurrent uncommitted index entries too.
create table private.property_occupancy (
 kind text not null check(kind in ('reservation','block')), entity_id uuid not null,
 organization_id uuid not null, property_id uuid not null, period daterange not null,
 primary key(kind,entity_id),
 foreign key(organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
 constraint property_occupancy_no_overlap exclude using gist
 (organization_id with =, property_id with =, period with &&)
);
alter table private.property_occupancy enable row level security;
revoke all on private.property_occupancy from public,anon,authenticated;

alter table public.reservations enable row level security;
alter table public.reservations force row level security;
alter table public.property_blocks enable row level security;
alter table public.property_blocks force row level security;
create policy reservations_read on public.reservations for select to authenticated using(private.can_manage_properties(organization_id));
create policy reservations_insert on public.reservations for insert to authenticated with check(private.can_manage_properties(organization_id) and created_by=(select auth.uid()));
create policy reservations_update on public.reservations for update to authenticated using(private.can_manage_properties(organization_id)) with check(private.can_manage_properties(organization_id));
create policy blocks_read on public.property_blocks for select to authenticated using(private.can_manage_properties(organization_id));
create policy blocks_insert on public.property_blocks for insert to authenticated with check(private.can_manage_properties(organization_id) and created_by=(select auth.uid()));
create policy blocks_update on public.property_blocks for update to authenticated using(private.can_manage_properties(organization_id)) with check(private.can_manage_properties(organization_id));
revoke all on public.reservations,public.property_blocks from public,anon,authenticated;
grant select,insert,update on public.reservations,public.property_blocks to authenticated;

create function private.guard_stay() returns trigger language plpgsql security invoker set search_path='' as $$
declare blocking boolean; target public.properties; begin
 if auth.uid() is null or not private.can_manage_properties(new.organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  if (new.id,new.organization_id,new.created_by,new.created_at) is distinct from (old.id,old.organization_id,old.created_by,old.created_at) then raise exception 'stay_identity_immutable' using errcode='42501'; end if;
  new.version:=old.version+1;
 else
  if new.created_by is distinct from auth.uid() then raise exception 'forbidden' using errcode='42501'; end if;
  new.created_at:=now(); new.version:=1;
 end if;
 if tg_table_name='reservations' then
  blocking:=new.status='confirmed';
  -- Future sources are modelled but not writable before an integration exists.
  if new.source<>'manual' then raise exception 'source_not_supported' using errcode='23514'; end if;
 else blocking:=new.active; end if;
 select * into target from public.properties where organization_id=new.organization_id and id=new.property_id;
 if not found then raise exception 'property_unavailable' using errcode='23503'; end if;
 if blocking and target.status<>'active' then raise exception 'property_not_active' using errcode='23514'; end if;
 if tg_table_name='reservations' and blocking then
  if new.guests_count>target.capacity then raise exception 'capacity_exceeded' using errcode='23514'; end if;
 end if;
 new.updated_at:=now(); return new;
end $$;
revoke all on function private.guard_stay() from public,anon,authenticated;

-- Definer is deliberately limited to the private registry; no client EXECUTE.
-- Re-check membership; never use user_metadata or a client supplied role.
create function private.sync_stay_occupancy() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; blocking boolean; dates daterange; begin
 if auth.uid() is null or not private.can_manage_properties(new.organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if tg_table_name='reservations' then
  k:='reservation'; blocking:=new.status='confirmed'; dates:=daterange(new.check_in,new.check_out,'[)');
 else
  k:='block'; blocking:=new.active; dates:=daterange(new.start_date,new.end_date,'[)');
 end if;
 if blocking then
  insert into private.property_occupancy(kind,entity_id,organization_id,property_id,period)
  values(k,new.id,new.organization_id,new.property_id,dates)
  on conflict(kind,entity_id) do update set property_id=excluded.property_id,period=excluded.period;
 else delete from private.property_occupancy where kind=k and entity_id=new.id; end if;
 return new;
end $$;
revoke all on function private.sync_stay_occupancy() from public,anon,authenticated;
create trigger guard_reservation before insert or update on public.reservations for each row execute function private.guard_stay();
create trigger guard_block before insert or update on public.property_blocks for each row execute function private.guard_stay();
create trigger sync_reservation_occupancy after insert or update on public.reservations for each row execute function private.sync_stay_occupancy();
create trigger sync_block_occupancy after insert or update on public.property_blocks for each row execute function private.sync_stay_occupancy();
create trigger audit_reservation after insert or update on public.reservations for each row execute function private.audit_change();
create trigger audit_block after insert or update on public.property_blocks for each row execute function private.audit_change();
commit;
