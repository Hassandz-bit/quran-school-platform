\set ON_ERROR_STOP on

insert into public.schools (id, name, status) values
  ('10000000-0000-4000-8000-000000000001', 'School One', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'School Two', 'active');

insert into public.branches (id, school_id, name, status) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Main Branch', 'active'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Other Branch', 'active'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Inactive Branch', 'inactive');

insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('40000000-0000-4000-8000-000000000001', 'invited@example.test'),
  ('40000000-0000-4000-8000-000000000002', 'rollback@example.test'),
  ('40000000-0000-4000-8000-000000000003', 'different-auth@example.test'),
  ('40000000-0000-4000-8000-000000000004', 'long-name@example.test'),
  ('40000000-0000-4000-8000-000000000009', 'linked@example.test');

insert into public.profiles (id, full_name, locale, status) values
  ('30000000-0000-4000-8000-000000000001', 'Admin Profile', 'ar', 'active'),
  ('40000000-0000-4000-8000-000000000009', 'Linked Profile', 'ar', 'active');

insert into public.school_memberships (id, school_id, profile_id, status, joined_at) values
  ('31000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'active', now());

insert into public.roles (id, school_id, code, name_ar, status) values
  ('32000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'school_admin', 'Admin', 'active'),
  ('32000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'teacher', 'Teacher', 'active'),
  ('32000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'teacher', 'Other Teacher', 'active');

insert into public.permissions (id, code) values
  ('33000000-0000-4000-8000-000000000001', 'members.manage'),
  ('33000000-0000-4000-8000-000000000002', 'members.assign_roles'),
  ('33000000-0000-4000-8000-000000000003', 'teachers.manage');

insert into public.role_permissions (school_id, role_id, permission_id) values
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003');

insert into public.membership_roles (school_id, membership_id, role_id, branch_id) values
  ('10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', null);

insert into public.teachers (id, school_id, branch_id, first_name, last_name, email, status) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Active', 'One', null, 'active'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Active', 'Two', null, 'active'),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Inactive', 'Teacher', null, 'inactive'),
  ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Other', 'School', null, 'active'),
  ('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Provision', 'Teacher', null, 'active'),
  ('50000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Rollback', 'Teacher', null, 'active'),
  ('50000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Auth', 'Mismatch', null, 'active'),
  ('50000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', repeat('A', 100), repeat('B', 60), null, 'active'),
  ('50000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Linked', 'One', null, 'active'),
  ('50000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Linked', 'Two', null, 'active');

insert into public.teacher_invitations (
  id, school_id, branch_id, teacher_id, email, idempotency_key, invited_by
) values (
  '60000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'duplicate@example.test',
  '70000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001'
);

-- Active invitation duplicates are rejected by teacher and by normalized email.
do $$
begin
  begin
    insert into public.teacher_invitations (
      school_id, branch_id, teacher_id, email, idempotency_key, invited_by
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      'other@example.test',
      '70000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'duplicate teacher invitation was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.teacher_invitations (
      school_id, branch_id, teacher_id, email, idempotency_key, invited_by
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      'duplicate@example.test',
      '70000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'duplicate school email invitation was accepted';
  exception when unique_violation then null;
  end;
end;
$$;

-- Scope and eligibility cannot be forged.
do $$
begin
  begin
    insert into public.teacher_invitations (
      school_id, branch_id, teacher_id, email, idempotency_key, invited_by
    ) values (
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000001',
      'cross-school@example.test',
      '70000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-school invitation was accepted';
  exception when foreign_key_violation or check_violation then null;
  end;

  begin
    insert into public.teacher_invitations (
      school_id, branch_id, teacher_id, email, idempotency_key, invited_by
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      'inactive@example.test',
      '70000000-0000-4000-8000-000000000005',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'inactive teacher invitation was accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- A profile cannot be linked to teachers in two different schools.
update public.teachers
set profile_id = '40000000-0000-4000-8000-000000000009'
where id = '50000000-0000-4000-8000-000000000008';

do $$
begin
  begin
    update public.teachers
    set profile_id = '40000000-0000-4000-8000-000000000009'
    where id = '50000000-0000-4000-8000-000000000009';
    raise exception 'one profile linked to multiple teachers';
  exception when unique_violation then null;
  end;
end;
$$;

-- Successful provisioning resolves the teacher role and branch inside the function.
insert into public.teacher_invitations (
  id, school_id, branch_id, teacher_id, email, idempotency_key, invited_by
) values (
  '60000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000005',
  'invited@example.test',
  '70000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000001'
);

set role service_role;
select * from public.provision_teacher_invitation(
  '60000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000001',
  'invited@example.test',
  '30000000-0000-4000-8000-000000000001'
);
reset role;

do $$
declare
  created_membership_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = '40000000-0000-4000-8000-000000000001'
      and full_name = 'Provision Teacher'
      and status = 'active'
  ) then raise exception 'profile not provisioned'; end if;

  select id into created_membership_id
  from public.school_memberships
  where school_id = '10000000-0000-4000-8000-000000000001'
    and profile_id = '40000000-0000-4000-8000-000000000001'
    and status = 'pending'
    and joined_at is null;
  if created_membership_id is null then raise exception 'pending membership not provisioned'; end if;

  if exists (
    select 1 from public.school_memberships
    where school_id = '10000000-0000-4000-8000-000000000001'
      and profile_id = '40000000-0000-4000-8000-000000000001'
      and status = 'active'
  ) then raise exception 'membership active before invite acceptance'; end if;

  if not exists (
    select 1
    from public.membership_roles as assignment
    join public.roles as role on role.id = assignment.role_id
    where assignment.membership_id = created_membership_id
      and assignment.branch_id = '20000000-0000-4000-8000-000000000001'
      and role.code = 'teacher'
      and role.school_id = '10000000-0000-4000-8000-000000000001'
  ) then raise exception 'teacher role branch scope incorrect'; end if;

  if not exists (
    select 1 from public.teachers
    where id = '50000000-0000-4000-8000-000000000005'
      and profile_id = '40000000-0000-4000-8000-000000000001'
      and email = 'invited@example.test'
  ) then raise exception 'teacher not linked'; end if;

  if not exists (
    select 1 from public.teacher_invitations
    where id = '60000000-0000-4000-8000-000000000005'
      and status = 'sent'
      and invited_user_id = '40000000-0000-4000-8000-000000000001'
      and sent_at is not null
  ) then raise exception 'invitation not marked sent'; end if;
end;
$$;

-- Force a failure after profile and membership inserts, then verify full rollback.
insert into public.teacher_invitations (
  id, school_id, branch_id, teacher_id, email, idempotency_key, invited_by
) values (
  '60000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000006',
  'rollback@example.test',
  '70000000-0000-4000-8000-000000000007',
  '30000000-0000-4000-8000-000000000001'
);

create or replace function public.test_reject_rollback_role()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.school_memberships
    where id = new.membership_id
      and profile_id = '40000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'forced_role_failure';
  end if;
  return new;
end;
$$;
create trigger test_reject_rollback_role
before insert on public.membership_roles
for each row execute function public.test_reject_rollback_role();

do $$
begin
  begin
    perform public.provision_teacher_invitation(
      '60000000-0000-4000-8000-000000000006',
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000006',
      '40000000-0000-4000-8000-000000000002',
      'rollback@example.test',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'forced provisioning failure did not occur';
  exception when others then
    if sqlerrm = 'forced provisioning failure did not occur' then raise; end if;
  end;

  if exists (select 1 from public.profiles where id = '40000000-0000-4000-8000-000000000002') then
    raise exception 'profile survived rollback';
  end if;
  if exists (select 1 from public.school_memberships where profile_id = '40000000-0000-4000-8000-000000000002') then
    raise exception 'membership survived rollback';
  end if;
  if exists (select 1 from public.teachers where id = '50000000-0000-4000-8000-000000000006' and profile_id is not null) then
    raise exception 'teacher link survived rollback';
  end if;
  if not exists (select 1 from public.teacher_invitations where id = '60000000-0000-4000-8000-000000000006' and status = 'processing') then
    raise exception 'invitation state did not roll back';
  end if;
end;
$$;

drop trigger test_reject_rollback_role on public.membership_roles;
drop function public.test_reject_rollback_role();

-- Acceptance rolls back if either the membership or invitation update fails.
set role service_role;
select * from public.provision_teacher_invitation(
  '60000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000006',
  '40000000-0000-4000-8000-000000000002',
  'rollback@example.test',
  '30000000-0000-4000-8000-000000000001'
);
reset role;

create or replace function public.test_reject_accept_invitation()
returns trigger
language plpgsql
as $
begin
  if new.id = '60000000-0000-4000-8000-000000000006'
    and old.status = 'sent'
    and new.status = 'accepted'
  then
    raise exception 'forced_invitation_acceptance_failure';
  end if;
  return new;
end;
$;
create trigger test_reject_accept_invitation
before update on public.teacher_invitations
for each row execute function public.test_reject_accept_invitation();

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', false);
set role authenticated;
do $
begin
  begin
    perform public.accept_teacher_invitation();
    raise exception 'forced acceptance failure did not occur';
  exception when others then
    if sqlerrm = 'forced acceptance failure did not occur' then raise; end if;
  end;
end;
$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

do $
begin
  if not exists (
    select 1 from public.school_memberships
    where school_id = '10000000-0000-4000-8000-000000000001'
      and profile_id = '40000000-0000-4000-8000-000000000002'
      and status = 'pending'
      and joined_at is null
  ) then raise exception 'membership update survived failed acceptance'; end if;

  if not exists (
    select 1 from public.teacher_invitations
    where id = '60000000-0000-4000-8000-000000000006'
      and status = 'sent'
      and accepted_at is null
  ) then raise exception 'invitation update survived failed acceptance'; end if;
end;
$;

drop trigger test_reject_accept_invitation on public.teacher_invitations;
drop function public.test_reject_accept_invitation();

-- Auth ID/email mismatch is rejected before any provisioning writes.
insert into public.teacher_invitations (
  id, school_id, branch_id, teacher_id, email, idempotency_key, invited_by
) values (
  '60000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000007',
  'expected-auth@example.test',
  '70000000-0000-4000-8000-000000000008',
  '30000000-0000-4000-8000-000000000001'
);
set role service_role;
do $$
begin
  begin
    perform public.provision_teacher_invitation(
      '60000000-0000-4000-8000-000000000007',
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000007',
      '40000000-0000-4000-8000-000000000003',
      'expected-auth@example.test',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'Auth email mismatch was accepted';
  exception when check_violation then
    if sqlerrm <> 'invited_auth_email_mismatch' then raise; end if;
  end;
end;
$$;
reset role;
do $$
begin
  if exists (select 1 from public.profiles where id = '40000000-0000-4000-8000-000000000003') then raise exception 'mismatch profile created'; end if;
  if exists (select 1 from public.school_memberships where profile_id = '40000000-0000-4000-8000-000000000003') then raise exception 'mismatch membership created'; end if;
  if exists (
    select 1 from public.membership_roles assignment
    join public.school_memberships membership on membership.id = assignment.membership_id
    where membership.profile_id = '40000000-0000-4000-8000-000000000003'
  ) then raise exception 'mismatch role created'; end if;
  if exists (select 1 from public.teachers where id = '50000000-0000-4000-8000-000000000007' and profile_id is not null) then raise exception 'mismatch teacher linked'; end if;
  if not exists (
    select 1 from public.teacher_invitations
    where id = '60000000-0000-4000-8000-000000000007'
      and status = 'processing' and invited_user_id is null
  ) then raise exception 'mismatch invitation did not roll back'; end if;
end;
$$;

-- Combined names outside the profiles.full_name 2..150 limit are rejected.
insert into public.teacher_invitations (
  id, school_id, branch_id, teacher_id, email, idempotency_key, invited_by
) values (
  '60000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000010',
  'long-name@example.test',
  '70000000-0000-4000-8000-000000000010',
  '30000000-0000-4000-8000-000000000001'
);
set role service_role;
do $$
begin
  begin
    perform public.provision_teacher_invitation(
      '60000000-0000-4000-8000-000000000010',
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000010',
      '40000000-0000-4000-8000-000000000004',
      'long-name@example.test',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'overlong name was accepted';
  exception when check_violation then
    if sqlerrm <> 'teacher_name_invalid' then raise; end if;
  end;
end;
$$;
reset role;
do $$
begin
  if exists (select 1 from public.profiles where id = '40000000-0000-4000-8000-000000000004') then raise exception 'long-name profile created'; end if;
  if exists (select 1 from public.school_memberships where profile_id = '40000000-0000-4000-8000-000000000004') then raise exception 'long-name membership created'; end if;
  if exists (
    select 1 from public.membership_roles assignment
    join public.school_memberships membership on membership.id = assignment.membership_id
    where membership.profile_id = '40000000-0000-4000-8000-000000000004'
  ) then raise exception 'long-name role created'; end if;
  if exists (select 1 from public.teachers where id = '50000000-0000-4000-8000-000000000010' and profile_id is not null) then raise exception 'long-name teacher linked'; end if;
  if not exists (
    select 1 from public.teacher_invitations
    where id = '60000000-0000-4000-8000-000000000010'
      and status = 'processing' and invited_user_id is null
  ) then raise exception 'long-name invitation did not roll back'; end if;
end;
$$;

-- Recipient table SELECT returns no rows; safe RPC returns only recipient context.
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$
declare direct_rows integer; safe_rows integer;
begin
  select count(*) into direct_rows from public.teacher_invitations;
  if direct_rows <> 0 then raise exception 'recipient read invitation table directly'; end if;
  select count(*) into safe_rows from public.get_my_teacher_invitation();
  if safe_rows <> 1 then raise exception 'safe recipient RPC context missing'; end if;
  if not exists (
    select 1 from public.get_my_teacher_invitation()
    where invitation_id = '60000000-0000-4000-8000-000000000005'
      and school_name = 'School One'
      and teacher_name = 'Provision Teacher'
      and branch_name = 'Main Branch'
      and invitation_status = 'sent'
  ) then raise exception 'safe recipient RPC context incorrect'; end if;

  if not coalesce(public.accept_teacher_invitation(), false) then
    raise exception 'invite acceptance failed';
  end if;

  if not coalesce(public.accept_teacher_invitation(), false) then
    raise exception 'second invite acceptance was not idempotent';
  end if;
end;
$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

do $
declare
  accepted_membership_id uuid;
begin
  select id into accepted_membership_id
  from public.school_memberships
  where school_id = '10000000-0000-4000-8000-000000000001'
    and profile_id = '40000000-0000-4000-8000-000000000001'
    and status = 'active'
    and joined_at is not null;
  if accepted_membership_id is null then raise exception 'membership not activated after acceptance'; end if;

  if not exists (
    select 1 from public.teacher_invitations
    where id = '60000000-0000-4000-8000-000000000005'
      and status = 'accepted'
      and accepted_at is not null
  ) then raise exception 'invitation not accepted atomically'; end if;
end;
$;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000003', false);
set role authenticated;
do $
begin
  if coalesce(public.accept_teacher_invitation(), false) then
    raise exception 'unrelated user accepted another invitation';
  end if;
end;
$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- Administrators with all three permissions retain direct SELECT.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$
declare visible_rows integer;
begin
  select count(*) into visible_rows from public.teacher_invitations
  where school_id = '10000000-0000-4000-8000-000000000001';
  if visible_rows = 0 then raise exception 'authorized admin lost invitation SELECT'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- The browser has read-only access to administrator-visible invitation rows and cannot call provisioning.
do $$
begin
  if has_table_privilege('authenticated', 'public.teacher_invitations', 'INSERT')
    or has_table_privilege('authenticated', 'public.teacher_invitations', 'UPDATE')
    or has_table_privilege('authenticated', 'public.teacher_invitations', 'DELETE')
  then raise exception 'authenticated received invitation write privilege'; end if;

  if has_function_privilege(
    'authenticated',
    'public.provision_teacher_invitation(uuid,uuid,uuid,uuid,text,uuid)',
    'EXECUTE'
  ) then raise exception 'authenticated can execute privileged provisioning'; end if;
end;
$$;

select 'teacher invitation migration acceptance passed' as result;
