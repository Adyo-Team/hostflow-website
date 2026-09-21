-- HostFlow v0.3. Additive: existing authentication, tenant roles and policies unchanged.
begin;
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  -- Owners are a future independent entity, not auth users or team memberships.
  -- Replace this reservation check with a tenant-composite FK in the Owners migration.
  owner_id uuid constraint properties_owner_reserved check(owner_id is null),
  name text not null check(char_length(btrim(name)) between 2 and 150),
  internal_name text check(char_length(internal_name)<=150),
  status text not null default 'active' check(status in ('active','inactive','archived')),
  address_line1 text not null check(char_length(btrim(address_line1)) between 1 and 250),
  address_line2 text check(char_length(address_line2)<=250),
  postal_code text check(char_length(postal_code)<=30),
  city text not null check(char_length(btrim(city)) between 1 and 100),
  country text not null check(country ~ '^[A-Z]{2}$'),
  latitude numeric(9,6) check(latitude between -90 and 90),
  longitude numeric(9,6) check(longitude between -180 and 180),
  property_type text not null check(property_type in ('apartment','house','villa','studio','loft','other')),
  capacity integer not null check(capacity between 1 and 1000),
  bedrooms integer not null check(bedrooms between 0 and 1000),
  beds integer not null check(beds between 0 and 1000),
  bathrooms numeric(5,1) not null check(bathrooms between 0 and 1000),
  check_in_time time not null default '15:00' check(check_in_time < time '24:00'),
  check_out_time time not null default '11:00' check(check_out_time < time '24:00'),
  wifi_name text check(char_length(wifi_name)<=150),
  wifi_password text check(char_length(wifi_password)<=250),
  access_instructions text check(char_length(access_instructions)<=5000),
  cleaning_instructions text check(char_length(cleaning_instructions)<=5000),
  private_notes text check(char_length(private_notes)<=5000),
  cleaning_fee numeric(12,2) check(cleaning_fee between 0 and 9999999999.99),
  management_commission_percent numeric(5,2) check(management_commission_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  search_text text generated always as (lower(name||' '||coalesce(internal_name,'')||' '||city)) stored,
  version integer not null default 1 check(version>=1),
  unique(organization_id,id),
  check((latitude is null)=(longitude is null))
);
create index properties_org_status on public.properties(organization_id,status,created_at desc);
create index properties_org_city on public.properties(organization_id,city);
create index properties_org_type on public.properties(organization_id,property_type);
create index properties_org_name on public.properties(organization_id,name,id);
create index properties_owner on public.properties(organization_id,owner_id) where owner_id is not null;
create index properties_creator on public.properties(created_by);

create table public.amenities (
  id text primary key check(id ~ '^[a-z][a-z0-9_]{1,59}$'),
  name text not null check(char_length(name) between 1 and 100),
  category text not null,
  sort_order integer not null default 0
);
insert into public.amenities(id,name,category,sort_order) values
('wifi','Wi-Fi','Confort',1),('air_conditioning','Climatisation','Confort',2),
('heating','Chauffage','Confort',3),('parking','Parking','Extérieur',4),
('pool','Piscine','Extérieur',5),('elevator','Ascenseur','Accès',6),
('terrace','Terrasse','Extérieur',7),('washing_machine','Lave-linge','Pratique',8),
('dishwasher','Lave-vaisselle','Pratique',9),('kitchen','Cuisine','Pratique',10),
('tv','TV','Confort',11),('workspace','Espace de travail','Confort',12),
('smoke_detector','Détecteur de fumée','Sécurité',13),('fire_extinguisher','Extincteur','Sécurité',14);

create table public.property_amenities (
  organization_id uuid not null,
  property_id uuid not null,
  amenity_id text not null references public.amenities(id) on delete restrict,
  primary key(organization_id,property_id,amenity_id),
  foreign key(organization_id,property_id) references public.properties(organization_id,id) on delete restrict
);
create index property_amenities_catalog on public.property_amenities(amenity_id);
create table public.property_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  storage_path text not null unique,
  sort_order integer not null default 0 check(sort_order>=0),
  is_cover boolean not null default false,
  state text not null default 'pending' check(state in ('pending','ready','deleting')),
  content_type text not null check(content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 5242880),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  foreign key(organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  check(storage_path=organization_id::text||'/'||property_id::text||'/'||id::text||case content_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end),
  check(not is_cover or state='ready')
);
create index property_images_order on public.property_images(organization_id,property_id,sort_order,id);
create index property_images_creator on public.property_images(created_by);
create unique index property_images_one_cover on public.property_images(property_id) where is_cover;

-- No operational assignments exist yet: staff/guest/property_owner cannot read this portfolio.
-- Helpers are INVOKER; the existing role_in() remains the sole membership authority.
create function private.can_manage_properties(org uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(private.role_in(org) in ('owner','admin','manager'),false)
$$;
create function private.property_editable(org uuid,property uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select private.can_manage_properties(org) and exists(select 1 from public.properties p where p.organization_id=org and p.id=property and p.status<>'archived')
$$;
revoke all on function private.can_manage_properties(uuid),private.property_editable(uuid,uuid) from public,anon;
grant execute on function private.can_manage_properties(uuid),private.property_editable(uuid,uuid) to authenticated;

alter table public.properties enable row level security;
alter table public.properties force row level security;
alter table public.amenities enable row level security;
alter table public.amenities force row level security;
alter table public.property_amenities enable row level security;
alter table public.property_amenities force row level security;
alter table public.property_images enable row level security;
alter table public.property_images force row level security;
create policy properties_read on public.properties for select to authenticated using(private.can_manage_properties(organization_id));
create policy properties_insert on public.properties for insert to authenticated with check(private.can_manage_properties(organization_id) and created_by=(select auth.uid()) and status<>'archived');
create policy properties_update on public.properties for update to authenticated using(private.can_manage_properties(organization_id)) with check(private.can_manage_properties(organization_id));
create policy amenities_read on public.amenities for select to authenticated using((select auth.uid()) is not null);
create policy property_amenities_read on public.property_amenities for select to authenticated using(private.can_manage_properties(organization_id));
create policy property_amenities_insert on public.property_amenities for insert to authenticated with check(private.property_editable(organization_id,property_id));
create policy property_amenities_delete on public.property_amenities for delete to authenticated using(private.property_editable(organization_id,property_id));
create policy property_images_read on public.property_images for select to authenticated using(private.can_manage_properties(organization_id));
create policy property_images_insert on public.property_images for insert to authenticated with check(private.property_editable(organization_id,property_id) and created_by=(select auth.uid()));
create policy property_images_update on public.property_images for update to authenticated using(private.property_editable(organization_id,property_id)) with check(private.property_editable(organization_id,property_id));
create policy property_images_delete on public.property_images for delete to authenticated using(private.property_editable(organization_id,property_id));
revoke all on public.properties,public.amenities,public.property_amenities,public.property_images from public,anon,authenticated;
grant select,insert,update on public.properties to authenticated;
grant select on public.amenities to authenticated;
grant select,insert,delete on public.property_amenities to authenticated;
grant select,insert,update,delete on public.property_images to authenticated;

create function private.guard_property() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.id,new.organization_id,new.created_by,new.created_at,new.owner_id) is distinct from (old.id,old.organization_id,old.created_by,old.created_at,old.owner_id) then raise exception 'property_identity_immutable' using errcode='42501'; end if;
  if (old.status='archived' or new.status='archived') and private.role_in(old.organization_id) not in ('owner','admin') then raise exception 'property_archive_forbidden' using errcode='42501'; end if;
  if old.status='archived' and new.status='archived' then raise exception 'property_archived' using errcode='23514'; end if;
  new.version:=old.version+1;
 else
  if new.created_by is distinct from auth.uid() then raise exception 'forbidden' using errcode='42501'; end if;
  new.created_at:=now(); new.version:=1;
 end if;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function private.guard_property() from public,anon,authenticated;
create trigger guard_property before insert or update on public.properties for each row execute function private.guard_property();
create trigger audit_property after insert or update on public.properties for each row execute function private.audit_change();

-- This shared private bucket contains no public URLs or cross-tenant object paths.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('property-photos','property-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy property_photos_read on storage.objects for select to authenticated using(
 bucket_id='property-photos' and exists(select 1 from public.property_images i where i.storage_path=name and private.can_manage_properties(i.organization_id))
);
create policy property_photos_insert on storage.objects for insert to authenticated with check(
 bucket_id='property-photos' and exists(select 1 from public.property_images i where i.storage_path=name and i.state='pending' and i.created_by=(select auth.uid()) and private.property_editable(i.organization_id,i.property_id))
);
create policy property_photos_delete on storage.objects for delete to authenticated using(
 bucket_id='property-photos' and exists(select 1 from public.property_images i where i.storage_path=name and private.property_editable(i.organization_id,i.property_id))
);
-- No UPDATE/upsert: every new photo receives an immutable UUID path.

create function private.guard_property_image() returns trigger language plpgsql security invoker set search_path='' as $$
declare target public.property_images; begin
 if tg_op='DELETE' then
  if exists(select 1 from storage.objects where bucket_id='property-photos' and name=old.storage_path) then raise exception 'image_file_exists' using errcode='23514'; end if;
  return old;
 end if;
 -- Serializes reservations/metadata changes per property, including direct REST writes.
 perform 1 from public.properties where id=new.property_id and organization_id=new.organization_id for update;
 if tg_op='INSERT' then
  if (select count(*) from public.property_images where property_id=new.property_id)>=30 then raise exception 'image_limit' using errcode='23514'; end if;
  if new.state<>'pending' or new.is_cover or new.created_by is distinct from auth.uid() then raise exception 'image_invalid_state' using errcode='23514'; end if;
 elsif (new.id,new.organization_id,new.property_id,new.storage_path,new.created_by,new.created_at,new.content_type,new.size_bytes) is distinct from (old.id,old.organization_id,old.property_id,old.storage_path,old.created_by,old.created_at,old.content_type,old.size_bytes) then
  raise exception 'image_identity_immutable' using errcode='42501';
 end if;
 if new.state='ready' and not exists(select 1 from storage.objects where bucket_id='property-photos' and name=new.storage_path) then raise exception 'image_file_missing' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.guard_property_image() from public,anon,authenticated;
create trigger guard_property_image before insert or update or delete on public.property_images for each row execute function private.guard_property_image();
create trigger audit_property_image after insert or update or delete on public.property_images for each row execute function private.audit_change();

create function public.save_property(p_organization_id uuid,p_id uuid,p_data jsonb,p_amenities text[],p_expected_version integer default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.properties; incoming public.properties; begin
 if not private.can_manage_properties(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if coalesce(array_length(p_amenities,1),0)>100 then raise exception 'invalid_amenities' using errcode='22023'; end if;
 -- Lock before changing both fields and the normalized set of amenities.
 select * into existing from public.properties where id=p_id and organization_id=p_organization_id for update;
 if found then
  if p_expected_version is null and existing.created_by=auth.uid() then return existing.id; end if; -- retry after an uncertain create response
  if p_expected_version is null or existing.version<>p_expected_version then raise exception 'property_conflict' using errcode='40001'; end if;
  if existing.status='archived' then raise exception 'property_archived' using errcode='23514'; end if;
 elsif p_expected_version is not null then raise exception 'property_unavailable' using errcode='P0002';
 end if;
 if p_data->>'status'='archived' then raise exception 'use_archive_action' using errcode='22023'; end if;
 select * into incoming from jsonb_populate_record(null::public.properties,p_data);
 if existing.id is null then
  insert into public.properties(id,organization_id,name,internal_name,status,address_line1,address_line2,postal_code,city,country,latitude,longitude,property_type,capacity,bedrooms,beds,bathrooms,check_in_time,check_out_time,wifi_name,wifi_password,access_instructions,cleaning_instructions,private_notes,cleaning_fee,management_commission_percent) values(p_id,p_organization_id,incoming.name,incoming.internal_name,incoming.status,incoming.address_line1,incoming.address_line2,incoming.postal_code,incoming.city,incoming.country,incoming.latitude,incoming.longitude,incoming.property_type,incoming.capacity,incoming.bedrooms,incoming.beds,incoming.bathrooms,incoming.check_in_time,incoming.check_out_time,incoming.wifi_name,incoming.wifi_password,incoming.access_instructions,incoming.cleaning_instructions,incoming.private_notes,incoming.cleaning_fee,incoming.management_commission_percent);
 else
  update public.properties set name=incoming.name,internal_name=incoming.internal_name,status=incoming.status,address_line1=incoming.address_line1,address_line2=incoming.address_line2,postal_code=incoming.postal_code,city=incoming.city,country=incoming.country,latitude=incoming.latitude,longitude=incoming.longitude,property_type=incoming.property_type,capacity=incoming.capacity,bedrooms=incoming.bedrooms,beds=incoming.beds,bathrooms=incoming.bathrooms,check_in_time=incoming.check_in_time,check_out_time=incoming.check_out_time,wifi_name=incoming.wifi_name,wifi_password=incoming.wifi_password,access_instructions=incoming.access_instructions,cleaning_instructions=incoming.cleaning_instructions,private_notes=incoming.private_notes,cleaning_fee=incoming.cleaning_fee,management_commission_percent=incoming.management_commission_percent where id=p_id and organization_id=p_organization_id;
 end if;
 delete from public.property_amenities where organization_id=p_organization_id and property_id=p_id;
 insert into public.property_amenities(organization_id,property_id,amenity_id) select p_organization_id,p_id,unnest(coalesce(p_amenities,array[]::text[])) on conflict do nothing;
 return p_id;
end $$;
create function public.set_property_archived(p_organization_id uuid,p_id uuid,p_archived boolean,p_expected_version integer) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(private.role_in(p_organization_id) not in ('owner','admin'),true) then raise exception 'property_archive_forbidden' using errcode='42501'; end if;
 update public.properties set status=case when p_archived then 'archived' else 'inactive' end where organization_id=p_organization_id and id=p_id and version=p_expected_version and (status='archived')<>p_archived;
 if not found then raise exception 'property_conflict' using errcode='40001'; end if;
end $$;
create function public.reserve_property_image(p_organization_id uuid,p_property_id uuid,p_id uuid,p_content_type text,p_size_bytes integer) returns text
language plpgsql security invoker set search_path='' as $$
declare path text; position integer; begin
 if not private.property_editable(p_organization_id,p_property_id) then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.properties where id=p_property_id and organization_id=p_organization_id for update;
 path:=p_organization_id::text||'/'||p_property_id::text||'/'||p_id::text||case p_content_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '' end;
 select coalesce(max(sort_order)+1,0) into position from public.property_images where property_id=p_property_id;
 insert into public.property_images(id,organization_id,property_id,storage_path,sort_order,content_type,size_bytes) values(p_id,p_organization_id,p_property_id,path,position,p_content_type,p_size_bytes);
 return path;
end $$;
create function public.finish_property_image(p_organization_id uuid,p_property_id uuid,p_image_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare first_image boolean; begin
 if not private.property_editable(p_organization_id,p_property_id) then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.properties where id=p_property_id and organization_id=p_organization_id for update;
 first_image:=not exists(select 1 from public.property_images where property_id=p_property_id and is_cover);
 update public.property_images set state='ready',is_cover=first_image where id=p_image_id and property_id=p_property_id and organization_id=p_organization_id and state='pending';
 if not found then raise exception 'property_unavailable' using errcode='P0002'; end if;
end $$;
create function public.arrange_property_images(p_organization_id uuid,p_property_id uuid,p_order uuid[],p_cover uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare n integer; begin
 if not private.property_editable(p_organization_id,p_property_id) then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.properties where id=p_property_id and organization_id=p_organization_id for update;
 select count(*) into n from public.property_images where property_id=p_property_id and organization_id=p_organization_id and state='ready';
 if n=0 or cardinality(p_order)<>n or (select count(distinct x) from unnest(p_order) x)<>n or not(p_cover=any(p_order)) or exists(select 1 from unnest(p_order) x where not exists(select 1 from public.property_images where id=x and property_id=p_property_id and organization_id=p_organization_id and state='ready')) then raise exception 'image_order_conflict' using errcode='40001'; end if;
 update public.property_images set is_cover=false where property_id=p_property_id and organization_id=p_organization_id and is_cover;
 update public.property_images set sort_order=array_position(p_order,id)-1,is_cover=(id=p_cover) where property_id=p_property_id and organization_id=p_organization_id and state='ready';
end $$;
create function public.prepare_property_image_delete(p_organization_id uuid,p_property_id uuid,p_image_id uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare path text; begin
 if not private.property_editable(p_organization_id,p_property_id) then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.properties where id=p_property_id and organization_id=p_organization_id for update;
 update public.property_images set state='deleting',is_cover=false where id=p_image_id and organization_id=p_organization_id and property_id=p_property_id returning storage_path into path;
 if path is null then raise exception 'property_unavailable' using errcode='P0002'; end if;
 if not exists(select 1 from public.property_images where property_id=p_property_id and is_cover) then
  update public.property_images set is_cover=true where id=(select id from public.property_images where property_id=p_property_id and state='ready' order by sort_order,id limit 1);
 end if;
 return path;
end $$;
revoke all on function public.save_property(uuid,uuid,jsonb,text[],integer),public.set_property_archived(uuid,uuid,boolean,integer),public.reserve_property_image(uuid,uuid,uuid,text,integer),public.finish_property_image(uuid,uuid,uuid),public.arrange_property_images(uuid,uuid,uuid[],uuid),public.prepare_property_image_delete(uuid,uuid,uuid) from public,anon;
grant execute on function public.save_property(uuid,uuid,jsonb,text[],integer),public.set_property_archived(uuid,uuid,boolean,integer),public.reserve_property_image(uuid,uuid,uuid,text,integer),public.finish_property_image(uuid,uuid,uuid),public.arrange_property_images(uuid,uuid,uuid[],uuid),public.prepare_property_image_delete(uuid,uuid,uuid) to authenticated;
create function public.property_filter_cities(p_organization_id uuid) returns text[] language sql stable security invoker set search_path='' as $$ select coalesce(array_agg(distinct city order by city),array[]::text[]) from public.properties where organization_id=p_organization_id $$;
revoke all on function public.property_filter_cities(uuid) from public,anon;
grant execute on function public.property_filter_cities(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
