\set ON_ERROR_STOP on

create or replace function public.test_memorization_analytics_assert(condition boolean,message text) returns void language plpgsql set search_path='' as $$ begin if condition is not true then raise exception '%',message; end if; end; $$;

do $$ declare function_signature text := 'public.get_memorization_follow_up_analytics(uuid,uuid,uuid,uuid,date,date,text,text,integer,integer)'; begin
  if not has_function_privilege('authenticated',function_signature,'EXECUTE') then raise exception 'authenticated missing analytics EXECUTE'; end if;
  if has_function_privilege('anon',function_signature,'EXECUTE') then raise exception 'anon unexpectedly has analytics EXECUTE'; end if;
  if exists(select 1 from pg_proc as procedure cross join lateral aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) as privilege where procedure.oid=function_signature::regprocedure and privilege.grantee=0 and privilege.privilege_type='EXECUTE') then raise exception 'PUBLIC unexpectedly has analytics EXECUTE'; end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000005',false);
select public.get_memorization_follow_up_analytics('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001',current_date-30,current_date+30,null,null,null,10)::text as analytics_payload \gset
select public.test_memorization_analytics_assert((:'analytics_payload'::jsonb #>> '{overview,observation_count}')::bigint>=4,'current teacher analytics must include historical observations after transfer');
select public.test_memorization_analytics_assert((:'analytics_payload'::jsonb #>> '{overview,recurring_signature_count}')::bigint>=1,'analytics must derive at least one recurring signature');
select public.test_memorization_analytics_assert(exists(select 1 from jsonb_to_recordset(:'analytics_payload'::jsonb->'categories') as c(category text,observation_count bigint,unresolved_count bigint,student_count bigint) where c.category='hesitation' and c.observation_count>=4),'hesitation aggregate must preserve recurrence across transfer');
select public.test_memorization_analytics_assert(exists(select 1 from jsonb_to_recordset(:'analytics_payload'::jsonb->'locations') as l(surah_number smallint,ayah_start smallint,ayah_end smallint,observation_count bigint,unresolved_count bigint,student_count bigint) where l.surah_number=2 and l.ayah_start=10 and l.ayah_end=12 and l.observation_count>=4),'surah/ayah aggregate must preserve recurring weak location');
select public.test_memorization_analytics_assert(exists(select 1 from jsonb_to_recordset(:'analytics_payload'::jsonb->'students') as s(student_id uuid,student_name text,branch_id uuid,class_id uuid,class_name text,observation_count bigint,unresolved_count bigint,high_priority_unresolved_count bigint,recurring_signature_count bigint) where s.student_id='70000000-0000-4000-8000-000000000001' and s.class_id='21000000-0000-4000-8000-000000000003' and s.recurring_signature_count>=1),'student load must use current class scope after transfer');
select public.test_memorization_analytics_assert(exists(select 1 from jsonb_to_recordset(:'analytics_payload'::jsonb->'recent_high_priority') as i(id uuid,student_id uuid,student_name text,branch_id uuid,class_id uuid,class_name text,category text,status text,priority integer,surah_number smallint,ayah_start smallint,ayah_end smallint,note_text text,observed_on date,recurrence_count bigint) where i.student_id='70000000-0000-4000-8000-000000000001' and i.class_id='21000000-0000-4000-8000-000000000003' and i.priority=1 and i.status<>'resolved' and i.recurrence_count>=4),'high-priority analytics must preserve current scope and recurrence');
select public.test_memorization_analytics_assert(exists(select 1 from jsonb_to_recordset(:'analytics_payload'::jsonb->'trend') as t(event_date date,improved_events bigint,resolved_events bigint,reopened_events bigint) where t.resolved_events>0),'audit history must contribute resolved events to improvement trend');

select public.get_memorization_follow_up_analytics('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001',current_date-30,current_date+30,'hesitation','open',1,10)::text as filtered_payload \gset
select public.test_memorization_analytics_assert((:'filtered_payload'::jsonb #>> '{overview,observation_count}')::bigint>0 and (:'filtered_payload'::jsonb #>> '{overview,improved_count}')::bigint=0 and (:'filtered_payload'::jsonb #>> '{overview,resolved_count}')::bigint=0,'category/status/priority filters must apply inside RPC');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',false);
select public.test_memorization_analytics_assert((public.get_memorization_follow_up_analytics('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000003',null,current_date-30,current_date+30,null,null,null,10)#>>'{overview,observation_count}')::bigint>=4,'academic supervisor should read permitted analytics');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000004',false);
do $$ begin begin perform public.get_memorization_follow_up_analytics('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000003',null,current_date-30,current_date+30,null,null,null,10); raise exception 'no-permission member unexpectedly read analytics'; exception when insufficient_privilege then if sqlerrm<>'MEMORIZATION_FOLLOW_UP_ANALYTICS_VIEW_REQUIRED' then raise; end if; end; end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',false);
do $$ declare known_message text; missing_message text; begin
  begin perform public.get_memorization_follow_up_analytics('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',current_date-30,current_date+30,null,null,null,10); exception when insufficient_privilege then known_message:=sqlerrm; end;
  begin perform public.get_memorization_follow_up_analytics('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','99999999-0000-4000-8000-000000000999',current_date-30,current_date+30,null,null,null,10); exception when insufficient_privilege then missing_message:=sqlerrm; end;
  if known_message<>'MEMORIZATION_FOLLOW_UP_ANALYTICS_SCOPE_DENIED' or missing_message<>known_message then raise exception 'known transferred and nonexistent students must share denial shape'; end if;
  begin perform public.get_memorization_follow_up_analytics('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002',null,current_date-30,current_date+30,null,null,null,10); raise exception 'cross-tenant analytics unexpectedly allowed'; exception when insufficient_privilege then if sqlerrm<>'MEMORIZATION_FOLLOW_UP_ANALYTICS_VIEW_REQUIRED' then raise; end if; end;
end $$;

do $$ begin
  begin perform public.get_memorization_follow_up_analytics('10000000-0000-4000-8000-000000000001',null,null,null,current_date-400,current_date,null,null,null,10); raise exception 'oversized date range accepted'; exception when invalid_parameter_value then if sqlerrm<>'MEMORIZATION_FOLLOW_UP_ANALYTICS_DATE_RANGE_INVALID' then raise; end if; end;
  begin perform public.get_memorization_follow_up_analytics('10000000-0000-4000-8000-000000000001',null,null,null,current_date-30,current_date,'not-a-category',null,null,10); raise exception 'invalid category accepted'; exception when invalid_parameter_value then if sqlerrm<>'MEMORIZATION_FOLLOW_UP_ANALYTICS_CATEGORY_INVALID' then raise; end if; end;
end $$;
reset role;

drop function public.test_memorization_analytics_assert(boolean,text);
