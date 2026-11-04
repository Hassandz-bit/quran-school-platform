-- Remove the legacy unscoped unread-count RPC.
-- All callers must provide one of the three authorized notification contexts.
begin;

drop function if exists public.get_my_unread_notification_count();

commit;
