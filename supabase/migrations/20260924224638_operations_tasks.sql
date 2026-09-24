-- Operations uses the existing role_in / can_manage_properties authority.
begin;
alter table public.reservations add constraint reservations_task_identity unique(organization_id,property_id,id);
create table public.tasks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 property_id uuid not null,
 reservation_id uuid,
 assignee_id uuid,
 type text not null check(type in ('cleaning','check_in','check_out','maintenance','internal')),
 title text not null check(char_length(btrim(title)) between 1 and 150),
 description text check(char_length(description)<=5000),
 scheduled_at timestamptz not null check(isfinite(scheduled_at)),
 status text not null default 'todo' check(status in ('todo','in_progress','done','cancelled')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 version integer not null default 1,
 foreign key(organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
 foreign key(organization_id,property_id,reservation_id) references public.reservations(organization_id,property_id,id) on update cascade on delete restrict,
 foreign key(organization_id,assignee_id) references public.organization_members(organization_id,user_id) on delete set null (assignee_id)
);
create index tasks_org_date on public.tasks(organization_id,scheduled_at,id);
create index tasks_property on public.tasks(organization_id,property_id,reservation_id);
create index tasks_reservation on public.tasks(reservation_id);
create index tasks_assignee on public.tasks(organization_id,assignee_id,status);
create index tasks_creator on public.tasks(created_by);
alter table public.tasks enable row level security;
alter table public.tasks force row level security;
create policy tasks_read on public.tasks for select to authenticated using(
 private.can_manage_properties(organization_id) or (private.role_in(organization_id)='staff' and assignee_id=(select auth.uid()))
);
create policy tasks_insert on public.tasks for insert to authenticated with check(private.can_manage_properties(organization_id) and created_by=(select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated using(
 private.can_manage_properties(organization_id) or (private.role_in(organization_id)='staff' and assignee_id=(select auth.uid()))
) with check(
 private.can_manage_properties(organization_id) or (private.role_in(organization_id)='staff' and assignee_id=(select auth.uid()))
);
revoke all on public.tasks from public,anon,authenticated;
grant select,insert,update on public.tasks to authenticated;
create function private.guard_task() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  if (new.id,new.organization_id,new.created_by,new.created_at) is distinct from (old.id,old.organization_id,old.created_by,old.created_at) then raise exception 'task_identity_immutable' using errcode='42501'; end if;
  if not private.can_manage_properties(new.organization_id) then
   if private.role_in(new.organization_id) is distinct from 'staff' or old.assignee_id is distinct from auth.uid() then raise exception 'forbidden' using errcode='42501'; end if;
   if (to_jsonb(new)-'status'-'updated_at'-'version') is distinct from (to_jsonb(old)-'status'-'updated_at'-'version') or new.status='cancelled' or old.status='cancelled' then raise exception 'task_status_only' using errcode='42501'; end if;
  end if;
  new.version:=old.version+1;
 else
  if not private.can_manage_properties(new.organization_id) or new.created_by is distinct from auth.uid() then raise exception 'forbidden' using errcode='42501'; end if;
  new.created_at:=now(); new.version:=1;
 end if;
 -- Validate references only on creation / changes, allowing status edits after a member is suspended.
 if tg_op='INSERT' or new.assignee_id is distinct from old.assignee_id then
  if new.assignee_id is not null and not exists(select 1 from public.organization_members m where m.organization_id=new.organization_id and m.user_id=new.assignee_id and m.status='active' and m.role in ('owner','admin','manager','staff')) then raise exception 'task_assignee_unavailable' using errcode='23514'; end if;
 end if;
 new.updated_at:=now(); return new;
end $$;
revoke all on function private.guard_task() from public,anon,authenticated;
create trigger guard_task before insert or update on public.tasks for each row execute function private.guard_task();
create trigger audit_task after insert or update on public.tasks for each row execute function private.audit_change();
-- Only the names of properties attached to a staff member's own tasks. No expansion of portfolio access.
create function private.task_property_names(p_organization_id uuid) returns table(id uuid,name text)
language sql stable security definer set search_path='' as $$
 select p.id,p.name from public.properties p where auth.uid() is not null and p.organization_id=p_organization_id and (
 private.can_manage_properties(p_organization_id) or (private.role_in(p_organization_id)='staff' and exists(select 1 from public.tasks t where t.organization_id=p.organization_id and t.property_id=p.id and t.assignee_id=auth.uid()))
 )
$$;
revoke all on function private.task_property_names(uuid) from public,anon;
grant execute on function private.task_property_names(uuid) to authenticated;
create function public.task_property_names(p_organization_id uuid) returns table(id uuid,name text)
language sql stable security invoker set search_path='' as $$ select * from private.task_property_names(p_organization_id) $$;
revoke all on function public.task_property_names(uuid) from public,anon;
grant execute on function public.task_property_names(uuid) to authenticated;
commit;
