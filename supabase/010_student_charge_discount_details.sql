-- Quran School SaaS - auditable discount details for student charges
-- Preserves how an applied discount was calculated and why it was granted.

begin;

alter table public.student_charges
  add column discount_value_type text,
  add column discount_value numeric(12, 2),
  add column discount_reason text;

-- Preserve any charge discounted before this migration without inventing a
-- percentage. Existing applied amounts remain unchanged.
update public.student_charges
set discount_value_type = 'fixed',
    discount_value = discount_amount,
    discount_reason = 'خصم مسجل قبل إضافة تفاصيل الخصم'
where discount_amount > 0;

alter table public.student_charges
  add constraint student_charges_discount_value_type_check
    check (
      discount_value_type is null
      or discount_value_type in ('fixed', 'percentage')
    ),
  add constraint student_charges_discount_value_check
    check (
      discount_value is null
      or (
        discount_value > 0
        and (
          discount_value_type <> 'percentage'
          or discount_value <= 100
        )
      )
    ),
  add constraint student_charges_discount_reason_length_check
    check (
      discount_reason is null
      or char_length(btrim(discount_reason)) between 2 and 250
    ),
  add constraint student_charges_discount_details_check
    check (
      (
        discount_amount = 0
        and discount_value_type is null
        and discount_value is null
        and discount_reason is null
      )
      or
      (
        discount_amount > 0
        and discount_value_type is not null
        and discount_value is not null
        and discount_reason is not null
        and discount_amount = case discount_value_type
          when 'fixed' then discount_value
          when 'percentage'
            then round(original_amount * discount_value / 100, 2)
          else null
        end
      )
    );

comment on column public.student_charges.discount_value_type is
  'The original discount input: fixed DZD amount or percentage.';
comment on column public.student_charges.discount_value is
  'The original fixed or percentage value used to calculate discount_amount.';
comment on column public.student_charges.discount_reason is
  'Required auditable reason when a discount is applied.';

grant insert (
  discount_value_type,
  discount_value,
  discount_reason
) on public.student_charges to authenticated;

grant update (
  discount_value_type,
  discount_value,
  discount_reason
) on public.student_charges to authenticated;

-- Migration 007 allowed finance.view to select charges. Keep finance.manage
-- independently sufficient for viewing, matching the public finance contract
-- and the secure student directory.
create policy student_charges_select_manage_authorized
on public.student_charges
for select to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'finance.manage')
);

commit;
