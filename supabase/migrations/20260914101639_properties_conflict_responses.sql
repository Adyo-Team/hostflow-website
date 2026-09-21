-- Business conflicts are HTTP 409, not retryable serialization failures.
-- PostgREST 14 retries SQLSTATE 40001 indefinitely. Preserve RPC privileges and RLS.
begin;
create or replace function public.save_property(p_organization_id uuid,p_id uuid,p_data jsonb,p_amenities text[],p_expected_version integer default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.properties; incoming public.properties; begin
 if not private.can_manage_properties(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if coalesce(array_length(p_amenities,1),0)>100 then raise exception 'invalid_amenities' using errcode='22023'; end if;
 -- Lock before changing both fields and the normalized set of amenities.
 select * into existing from public.properties where id=p_id and organization_id=p_organization_id for update;
 if found then
  if p_expected_version is null and existing.created_by=auth.uid() then return existing.id; end if; -- retry after an uncertain create response
  if p_expected_version is null or existing.version<>p_expected_version then raise exception 'property_conflict' using errcode='PT409'; end if;
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

create or replace function public.set_property_archived(p_organization_id uuid,p_id uuid,p_archived boolean,p_expected_version integer) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(private.role_in(p_organization_id) not in ('owner','admin'),true) then raise exception 'property_archive_forbidden' using errcode='42501'; end if;
 update public.properties set status=case when p_archived then 'archived' else 'inactive' end where organization_id=p_organization_id and id=p_id and version=p_expected_version and (status='archived')<>p_archived;
 if not found then raise exception 'property_conflict' using errcode='PT409'; end if;
end $$;

create or replace function public.arrange_property_images(p_organization_id uuid,p_property_id uuid,p_order uuid[],p_cover uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare n integer; begin
 if not private.property_editable(p_organization_id,p_property_id) then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.properties where id=p_property_id and organization_id=p_organization_id for update;
 select count(*) into n from public.property_images where property_id=p_property_id and organization_id=p_organization_id and state='ready';
 if n=0 or cardinality(p_order)<>n or (select count(distinct x) from unnest(p_order) x)<>n or not(p_cover=any(p_order)) or exists(select 1 from unnest(p_order) x where not exists(select 1 from public.property_images where id=x and property_id=p_property_id and organization_id=p_organization_id and state='ready')) then raise exception 'image_order_conflict' using errcode='PT409'; end if;
 update public.property_images set is_cover=false where property_id=p_property_id and organization_id=p_organization_id and is_cover;
 update public.property_images set sort_order=array_position(p_order,id)-1,is_cover=(id=p_cover) where property_id=p_property_id and organization_id=p_organization_id and state='ready';
end $$;
notify pgrst,'reload schema';
commit;
