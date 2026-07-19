-- Quran School SaaS - fictional, idempotent seed data (phase 1)
-- No Auth users, emails, passwords, memberships or real personal data are inserted.

begin;

insert into public.schools (id, name, slug, status, default_locale, timezone)
values (
  '10000000-0000-4000-8000-000000000001',
  'مدرسة النور القرآنية',
  'al-noor-quran-school',
  'active',
  'ar',
  'Africa/Algiers'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  default_locale = excluded.default_locale,
  timezone = excluded.timezone;

insert into public.branches (id, school_id, name, code, status, is_main)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'الفرع الرئيسي',
  'MAIN',
  'active',
  true
)
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  status = excluded.status,
  is_main = excluded.is_main;

insert into public.permissions (id, code, module, name_ar, description) values
  ('30000000-0000-4000-8000-000000000001', 'school.view',          'school',      'عرض بيانات المدرسة',          'عرض البيانات الأساسية للمدرسة الحالية'),
  ('30000000-0000-4000-8000-000000000002', 'school.update',        'school',      'تعديل بيانات المدرسة',         'تعديل إعدادات المدرسة الأساسية'),
  ('30000000-0000-4000-8000-000000000003', 'branches.view',        'branches',    'عرض الفروع',                   'عرض فروع المدرسة الحالية'),
  ('30000000-0000-4000-8000-000000000004', 'branches.manage',      'branches',    'إدارة الفروع',                 'إضافة الفروع وتعديلها وتعطيلها'),
  ('30000000-0000-4000-8000-000000000005', 'profiles.view',        'profiles',    'عرض ملفات المستخدمين',         'عرض الملف العام لأعضاء المدرسة المسموح بهم'),
  ('30000000-0000-4000-8000-000000000006', 'members.view',         'members',     'عرض الأعضاء',                  'عرض عضويات المدرسة وأدوارها'),
  ('30000000-0000-4000-8000-000000000007', 'members.manage',       'members',     'إدارة الأعضاء',                'إضافة العضويات وتحديث حالتها أو إلغاؤها'),
  ('30000000-0000-4000-8000-000000000008', 'members.assign_roles', 'members',     'إسناد الأدوار',                'إسناد الأدوار للأعضاء وسحبها'),
  ('30000000-0000-4000-8000-000000000009', 'roles.view',           'roles',       'عرض الأدوار',                  'عرض أدوار المدرسة والصلاحيات المسندة إليها'),
  ('30000000-0000-4000-8000-000000000010', 'roles.manage',         'roles',       'إدارة الأدوار والصلاحيات',      'إنشاء الأدوار وتعديل منح الصلاحيات')
on conflict (code) do update set
  module = excluded.module,
  name_ar = excluded.name_ar,
  description = excluded.description;

insert into public.roles (id, school_id, code, name_ar, description, is_system, status) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'school_admin',        'مدير المدرسة',       'إدارة المدرسة وأعضائها وأدوارها', true, 'active'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'branch_manager',      'مدير الفرع',          'إدارة الفرع والأعضاء ضمن الصلاحيات الممنوحة', true, 'active'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'academic_supervisor', 'المشرف الأكاديمي',    'الإشراف الأكاديمي', true, 'active'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'teacher',             'المعلم',              'دور المعلم', true, 'active'),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'registrar',           'مسؤول التسجيل',       'إدارة التسجيل والعضويات وفق التفويض', true, 'active'),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'finance_officer',     'المسؤول المالي',      'دور مالي تمهيدي دون جداول مالية في هذه المرحلة', true, 'active'),
  ('40000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'student',             'الطالب',              'دور الطالب الأساسي', true, 'active'),
  ('40000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'guardian',            'ولي الأمر',           'دور ولي الأمر الأساسي', true, 'active')
on conflict (school_id, code) do update set
  name_ar = excluded.name_ar,
  description = excluded.description,
  is_system = excluded.is_system,
  status = excluded.status;

-- The school administrator receives the full phase-one catalogue.
insert into public.role_permissions (school_id, role_id, permission_id)
select '10000000-0000-4000-8000-000000000001',
       '40000000-0000-4000-8000-000000000001',
       p.id
from public.permissions p
on conflict (role_id, permission_id) do nothing;

-- Conservative defaults for the remaining roles; later phases may extend them.
with grants(role_code, permission_code) as (
  values
    ('branch_manager', 'school.view'),
    ('branch_manager', 'branches.view'),
    ('branch_manager', 'profiles.view'),
    ('branch_manager', 'members.view'),
    ('academic_supervisor', 'school.view'),
    ('academic_supervisor', 'branches.view'),
    ('teacher', 'school.view'),
    ('teacher', 'branches.view'),
    ('registrar', 'school.view'),
    ('registrar', 'branches.view'),
    ('registrar', 'profiles.view'),
    ('registrar', 'members.view'),
    ('registrar', 'members.manage'),
    ('finance_officer', 'school.view'),
    ('finance_officer', 'branches.view'),
    ('student', 'school.view'),
    ('student', 'branches.view'),
    ('guardian', 'school.view'),
    ('guardian', 'branches.view')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select r.school_id, r.id, p.id
from grants g
join public.roles r
  on r.school_id = '10000000-0000-4000-8000-000000000001'
 and r.code = g.role_code
join public.permissions p on p.code = g.permission_code
on conflict (role_id, permission_id) do nothing;

commit;
