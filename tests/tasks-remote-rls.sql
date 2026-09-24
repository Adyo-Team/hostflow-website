begin;
select set_config('qa.owner',gen_random_uuid()::text,true),set_config('qa.staff',gen_random_uuid()::text,true),set_config('qa.foreign',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select current_setting('qa.'||n)::uuid,current_setting('qa.'||n)||'@hostflow.test',now(),'{"first_name":"QA","last_name":"Tasks"}'::jsonb from (values('owner'),('staff'),('foreign')) x(n);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
select set_config('qa.org',public.create_organization('QA Tasks RLS','qa-tasks-'||gen_random_uuid(),'Europe/Brussels','EUR','BE')::text,true);
select set_config('qa.invite',public.create_invitation(current_setting('qa.org')::uuid,current_setting('qa.staff')||'@hostflow.test','staff'),true);
select set_config('request.jwt.claim.sub',current_setting('qa.staff'),true);
select public.accept_invitation(current_setting('qa.invite'));
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
with p as (insert into public.properties(organization_id,name,address_line1,city,country,property_type,capacity,bedrooms,beds,bathrooms) values(current_setting('qa.org')::uuid,'QA Tasks','Test','Test','BE','house',4,1,2,1) returning id) select set_config('qa.property',id::text,true) from p;
with t as (insert into public.tasks(organization_id,property_id,assignee_id,type,title,scheduled_at) values(current_setting('qa.org')::uuid,current_setting('qa.property')::uuid,current_setting('qa.staff')::uuid,'cleaning','QA rollback',now()) returning id) select set_config('qa.task',id::text,true) from t;
select set_config('request.jwt.claim.sub',current_setting('qa.staff'),true);
do $$ begin
 if not exists(select 1 from public.tasks where id=current_setting('qa.task')::uuid) then raise exception 'staff cannot see assigned task';end if;
 update public.tasks set status='in_progress' where id=current_setting('qa.task')::uuid;
 if not exists(select 1 from public.task_property_names(current_setting('qa.org')::uuid) where id=current_setting('qa.property')::uuid) then raise exception 'missing scoped property name';end if;
 if exists(select 1 from public.properties where id=current_setting('qa.property')::uuid) then raise exception 'portfolio leaked';end if;
 begin update public.tasks set title='forbidden' where id=current_setting('qa.task')::uuid;raise exception 'staff edit allowed';exception when insufficient_privilege then null;end;
 begin insert into public.tasks(organization_id,property_id,type,title,scheduled_at) values(current_setting('qa.org')::uuid,current_setting('qa.property')::uuid,'cleaning','forbidden',now());raise exception 'staff insert allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.foreign'),true);
select public.create_organization('QA Foreign','qa-foreign-'||gen_random_uuid(),'Europe/Brussels','EUR','BE');
do $$ declare n integer; begin
 if exists(select 1 from public.tasks where organization_id=current_setting('qa.org')::uuid) then raise exception 'cross tenant read';end if;
 update public.tasks set status='done' where id=current_setting('qa.task')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'cross tenant update';end if;
 if exists(select 1 from public.task_property_names(current_setting('qa.org')::uuid)) then raise exception 'cross tenant context';end if;
 begin insert into public.tasks(organization_id,property_id,type,title,scheduled_at) values(current_setting('qa.org')::uuid,current_setting('qa.property')::uuid,'cleaning','forbidden',now());raise exception 'cross tenant insert';exception when insufficient_privilege then null;end;
 begin delete from public.tasks where id=current_setting('qa.task')::uuid;raise exception 'delete allowed';exception when insufficient_privilege then null;end;
end $$;
select 'PASS: live tasks RLS, assignment, status, scoped context and tenant isolation; fixtures rolled back' result;
rollback;
