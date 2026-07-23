-- Quran School SaaS - finance payment scope index
-- Covers the composite foreign key used to bind payments to the exact charge,
-- student, branch, and school.

begin;

create index payments_school_branch_student_charge_idx
  on public.payments (school_id, branch_id, student_id, charge_id);

commit;
