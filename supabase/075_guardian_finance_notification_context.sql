-- QuranOS V2: keep finance reminders in the guardian portal for dual-role profiles.
-- Finance reminders created by the recurring billing engine target a guardian,
-- even when that profile also has a staff or teacher membership.

begin;

create or replace function public.set_app_notification_audiences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_audiences text[];
  allowed_audiences text[];
  campaign_summary jsonb;
  campaign_sender_kind text;
  guardian_directed boolean;
begin
  guardian_directed :=
    new.source_type = 'guardian_attendance'
    or new.event_type in (
      'fee_due_soon',
      'fee_overdue',
      'finance_charge_due_soon',
      'finance_charge_overdue'
    )
    or (
      new.category = 'finance'
      and coalesce(new.target_path, '') like '/parent/%'
    );

  if cardinality(coalesce(new.recipient_audiences, '{}'::text[])) = 0
    and new.source_type = 'manual_campaign'
  then
    select campaign.targeting_summary
    into campaign_summary
    from public.notification_campaigns campaign
    where campaign.id = new.source_id;
    campaign_sender_kind := campaign_summary->>'senderKind';

    if campaign_summary is not null
      and jsonb_typeof(campaign_summary->'recipientAudiences') = 'object'
      and jsonb_typeof(campaign_summary->'recipientAudiences'->new.recipient_profile_id::text) = 'array'
    then
      select coalesce(array_agg(distinct item.value), '{}'::text[])
      into requested_audiences
      from jsonb_array_elements_text(
        campaign_summary->'recipientAudiences'->new.recipient_profile_id::text
      ) as item(value)
      where item.value in ('staff','teacher','guardian','student');

      allowed_audiences := public.resolve_app_notification_audiences(
        new.school_id, new.recipient_profile_id, new.student_id
      );

      if cardinality(coalesce(requested_audiences, '{}'::text[])) = 0
        or not (requested_audiences <@ coalesce(allowed_audiences, '{}'::text[]))
      then
        raise exception using errcode = '42501',
          message = 'NOTIFICATION_RECIPIENT_AUDIENCE_INVALID';
      end if;

      new.recipient_audiences := requested_audiences;
    end if;
  end if;

  if cardinality(coalesce(new.recipient_audiences, '{}'::text[])) = 0 then
    if new.source_type = 'manual_campaign' then
      new.recipient_audiences := public.resolve_manual_notification_recipient_audiences(
        new.school_id, new.recipient_profile_id, new.student_id, campaign_sender_kind
      );
    elsif guardian_directed then
      new.recipient_audiences := array['guardian']::text[];
    else
      new.recipient_audiences := public.resolve_app_notification_audiences(
        new.school_id, new.recipient_profile_id, new.student_id
      );
    end if;
  end if;

  if cardinality(coalesce(new.recipient_audiences, '{}'::text[])) = 0 then
    raise exception using errcode = '42501',
      message = 'NOTIFICATION_RECIPIENT_CONTEXT_UNRESOLVED';
  end if;

  if new.sender_profile_id is not null
    and cardinality(coalesce(new.sender_audiences, '{}'::text[])) = 0
  then
    if new.source_type = 'manual_campaign' then
      select campaign.targeting_summary->>'senderKind'
      into campaign_sender_kind
      from public.notification_campaigns campaign
      where campaign.id = new.source_id;

      if campaign_sender_kind in ('staff','teacher','guardian') then
        new.sender_audiences := array[
          case when campaign_sender_kind = 'teacher' then 'teacher'
               when campaign_sender_kind = 'guardian' then 'guardian'
               else 'staff' end
        ]::text[];
      end if;
    end if;

    if cardinality(coalesce(new.sender_audiences, '{}'::text[])) = 0 then
      new.sender_audiences := public.resolve_app_notification_audiences(
        new.school_id, new.sender_profile_id, null
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.set_app_notification_audiences()
  from public, anon, authenticated;

drop trigger if exists app_notifications_set_audiences on public.app_notifications;
create trigger app_notifications_set_audiences
before insert or update
on public.app_notifications
for each row execute function public.set_app_notification_audiences();

-- Correct already-created finance reminders without changing their content.
update public.app_notifications notification
set recipient_audiences = array['guardian']::text[]
where notification.source_type <> 'manual_campaign'
  and (
    notification.event_type in (
      'fee_due_soon',
      'fee_overdue',
      'finance_charge_due_soon',
      'finance_charge_overdue'
    )
    or (
      notification.category = 'finance'
      and coalesce(notification.target_path, '') like '/parent/%'
    )
  )
  and cardinality(notification.recipient_audiences) > 0;

commit;
