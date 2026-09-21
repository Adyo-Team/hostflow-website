-- Run against the migrated Supabase PostgreSQL database as its migration role.
-- These are transient SQL identities, NOT end-to-end Supabase Auth accounts.
-- Every fixture is rolled back. Any failed assertion aborts before the PASS row.
begin;
select set_config('hostflow.test.a',gen_random_uuid()::text,true),
       set_config('hostflow.test.b',gen_random_uuid()::text,true),
       set_config('hostflow.test.c',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select current_setting('hostflow.test.'||label)::uuid,
       current_setting('hostflow.test.'||label)||'@hostflow.test',now(),
       jsonb_build_object('first_name','QA','last_name',upper(label))
from (values ('a'),('b'),('c')) as labels(label);

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('hostflow.test.a'),true);
select set_config('hostflow.test.alpha',public.create_organization('QA Alpha','qa-alpha-'||current_setting('hostflow.test.a'),'Europe/Brussels','EUR','BE')::text,true);
do $$ begin
  if (select count(*) from public.profiles)<>1 then raise exception 'FAIL: self-only profiles'; end if;
  if (select role from public.organization_members where organization_id=current_setting('hostflow.test.alpha')::uuid)<>'owner' then raise exception 'FAIL: creator owner'; end if;
  begin
    perform public.update_membership(current_setting('hostflow.test.alpha')::uuid,(select id from public.organization_members where user_id=auth.uid()),'admin','active');
    raise exception 'FAIL: last owner demoted';
  exception when check_violation then null; end;
  begin
    insert into public.organizations(name,slug,created_by) values('Unauthorized','unauthorized-'||gen_random_uuid(),auth.uid());
    raise exception 'FAIL: direct write allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('hostflow.test.invitation',public.create_invitation(current_setting('hostflow.test.alpha')::uuid,current_setting('hostflow.test.c')||'@hostflow.test','staff'),true);

select set_config('request.jwt.claim.sub',current_setting('hostflow.test.c'),true);
select public.accept_invitation(current_setting('hostflow.test.invitation'));
do $$ begin
  if (select role from public.organization_members where user_id=auth.uid())<>'staff' then raise exception 'FAIL: invitation role'; end if;
  if (select count(*) from public.organization_members)<>1 then raise exception 'FAIL: staff membership visibility'; end if;
  if (select count(*) from public.list_team(current_setting('hostflow.test.alpha')::uuid))<>1 then raise exception 'FAIL: staff roster visibility'; end if;
  if exists(select 1 from public.organization_invitations) or exists(select 1 from public.audit_logs) then raise exception 'FAIL: staff sensitive data'; end if;
  begin
    perform public.create_invitation(current_setting('hostflow.test.alpha')::uuid,current_setting('hostflow.test.b')||'@hostflow.test','admin');
    raise exception 'FAIL: staff invite allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.accept_invitation(current_setting('hostflow.test.invitation'));
    raise exception 'FAIL: token reuse allowed';
  exception when invalid_parameter_value then null; end;
end $$;

select set_config('request.jwt.claim.sub',current_setting('hostflow.test.b'),true);
select set_config('hostflow.test.beta',public.create_organization('QA Beta','qa-beta-'||current_setting('hostflow.test.b'),'Europe/Paris','EUR','FR')::text,true);
do $$ begin
  if exists(select 1 from public.organizations where id=current_setting('hostflow.test.alpha')::uuid)
  or exists(select 1 from public.organization_members where organization_id=current_setting('hostflow.test.alpha')::uuid)
  or exists(select 1 from public.organization_memberships where organization_id=current_setting('hostflow.test.alpha')::uuid)
  or exists(select 1 from public.organization_invitations where organization_id=current_setting('hostflow.test.alpha')::uuid)
  or exists(select 1 from public.audit_logs where organization_id=current_setting('hostflow.test.alpha')::uuid)
  or exists(select 1 from public.profiles where id=current_setting('hostflow.test.a')::uuid)
  then raise exception 'FAIL CRITICAL: B can read Alpha'; end if;
  begin
    perform public.list_team(current_setting('hostflow.test.alpha')::uuid);
    raise exception 'FAIL CRITICAL: B can read Alpha roster';
  exception when insufficient_privilege then null; end;
  begin
    perform public.update_organization(current_setting('hostflow.test.alpha')::uuid,'Intrusion','Europe/Paris','EUR','FR');
    raise exception 'FAIL CRITICAL: B can mutate Alpha';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub',current_setting('hostflow.test.a'),true);
do $$ begin
  if exists(select 1 from public.organizations where id=current_setting('hostflow.test.beta')::uuid) then raise exception 'FAIL: A can read Beta'; end if;
  if (select count(*) from public.list_team(current_setting('hostflow.test.alpha')::uuid))<>2 then raise exception 'FAIL: owner roster'; end if;
end $$;
select set_config('hostflow.test.member',id::text,true) from public.organization_members where organization_id=current_setting('hostflow.test.alpha')::uuid and user_id=current_setting('hostflow.test.c')::uuid;
select public.update_membership(current_setting('hostflow.test.alpha')::uuid,current_setting('hostflow.test.member')::uuid,'manager','active');
select public.complete_team_setup(current_setting('hostflow.test.alpha')::uuid);
do $$ begin
  if (select team_setup_completed_at from public.organizations where id=current_setting('hostflow.test.alpha')::uuid) is null then raise exception 'FAIL: team progress'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('hostflow.test.c'),true);
do $$ begin
  if (select count(*) from public.list_team(current_setting('hostflow.test.alpha')::uuid))<>2 then raise exception 'FAIL: manager roster'; end if;
  begin
    perform public.update_organization(current_setting('hostflow.test.alpha')::uuid,'Intrusion','Europe/Paris','EUR','FR');
    raise exception 'FAIL: manager settings';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('hostflow.test.a'),true);
select public.update_membership(current_setting('hostflow.test.alpha')::uuid,current_setting('hostflow.test.member')::uuid,'manager','suspended');
select set_config('request.jwt.claim.sub',current_setting('hostflow.test.c'),true);
do $$ begin
  if exists(select 1 from public.organizations) or exists(select 1 from public.organization_members) then raise exception 'FAIL: suspended member access'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('hostflow.test.a'),true);
select public.remove_member(current_setting('hostflow.test.alpha')::uuid,current_setting('hostflow.test.member')::uuid);
do $$ begin
  if exists(select 1 from public.organization_members where user_id=current_setting('hostflow.test.c')::uuid) then raise exception 'FAIL: removal'; end if;
  if not exists(select 1 from public.audit_logs where action='delete' and entity_id=current_setting('hostflow.test.member')::uuid) then raise exception 'FAIL: removal audit'; end if;
end $$;

set local role anon;
do $$ begin
  begin
    perform 1 from public.organizations;
    raise exception 'FAIL: anonymous table access';
  exception when insufficient_privilege then null; end;
  begin
    perform public.list_team(current_setting('hostflow.test.alpha')::uuid);
    raise exception 'FAIL: anonymous RPC';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: remote PostgreSQL RLS, owner, invitations, roles, suspension, removal, audit and anonymous denial. All test fixtures rolled back. Supabase Auth sessions not covered.' as result;
