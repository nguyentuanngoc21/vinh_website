-- Read-only schema inventory of the `public` schema (+ storage buckets,
-- storage policies, realtime publication). Run it in the Supabase SQL Editor on
-- production, download the result as CSV, and diff it against the same
-- query run on a fresh project bootstrapped from migrations/baseline/*.sql (in order).
-- Identical output ⇒ the baseline reproduces production's schema.
--
-- Nothing here writes; safe to run on production.

with
cols as (
  select 'column' as kind,
         c.table_name || '.' || c.column_name as name,
         c.data_type
           || coalesce('(' || c.character_maximum_length || ')', '')
           || case when c.is_nullable = 'NO' then ' not null' else '' end
           || coalesce(' default ' || c.column_default, '') as detail
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public'
),
rels as (
  select case cl.relkind when 'r' then 'table' when 'v' then 'view'
                         when 'm' then 'matview' when 'S' then 'sequence'
                         else cl.relkind::text end as kind,
         cl.relname as name,
         case when cl.relkind = 'r'
              then 'rls=' || cl.relrowsecurity::text
              when cl.relkind in ('v', 'm')
              then md5(pg_get_viewdef(cl.oid)) end as detail
  from pg_class cl
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and cl.relkind in ('r', 'v', 'm', 'S')
),
cons as (
  select 'constraint' as kind,
         conrelid::regclass::text || '.' || conname as name,
         pg_get_constraintdef(oid) as detail
  from pg_constraint
  where connamespace = 'public'::regnamespace
),
idx as (
  select 'index' as kind, indexname as name, indexdef as detail
  from pg_indexes where schemaname = 'public'
),
fns as (
  select 'function' as kind,
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name,
         -- hash of the body so a stale CREATE OR REPLACE shows up as a diff
         md5(pg_get_functiondef(p.oid)) as detail
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
),
trg as (
  select 'trigger' as kind,
         tgrelid::regclass::text || '.' || tgname as name,
         md5(pg_get_triggerdef(oid)) as detail
  from pg_trigger
  where not tgisinternal
    and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
),
pol as (
  select 'policy' as kind,
         schemaname || '.' || tablename || '.' || policyname as name,
         cmd || ' ' || array_to_string(roles, ',') || ' using=' || coalesce(qual, '')
           || ' check=' || coalesce(with_check, '') as detail
  from pg_policies where schemaname in ('public', 'storage')
),
tbl_grants as (
  select 'grant' as kind,
         table_name || ' → ' || grantee as name,
         string_agg(privilege_type, ',' order by privilege_type) as detail
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
  group by table_name, grantee
),
col_grants as (
  select 'column_grant' as kind,
         table_name || '.' || column_name || ' → ' || grantee as name,
         string_agg(privilege_type, ',' order by privilege_type) as detail
  from information_schema.column_privileges
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  group by table_name, column_name, grantee
),
fn_grants as (
  select 'function_grant' as kind,
         routine_name || ' → ' || grantee as name,
         string_agg(privilege_type, ',') as detail
  from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee in ('anon', 'authenticated', 'public')
  group by routine_name, grantee
),
enums as (
  select 'enum' as kind, t.typname as name,
         string_agg(e.enumlabel, ',' order by e.enumsortorder) as detail
  from pg_type t join pg_enum e on e.enumtypid = t.oid
  where t.typnamespace = 'public'::regnamespace
  group by t.typname
),
ext as (
  select 'extension' as kind, extname as name, null::text as detail from pg_extension
),
buckets as (
  select 'bucket' as kind, id as name,
         'public=' || public::text || ' limit=' || coalesce(file_size_limit::text, '')
           || ' mime=' || coalesce(array_to_string(allowed_mime_types, ','), '') as detail
  from storage.buckets
),
realtime as (
  select 'realtime' as kind, schemaname || '.' || tablename as name, null::text as detail
  from pg_publication_tables where pubname = 'supabase_realtime'
)
select * from cols
union all select * from rels
union all select * from cons
union all select * from idx
union all select * from fns
union all select * from trg
union all select * from pol
union all select * from tbl_grants
union all select * from col_grants
union all select * from fn_grants
union all select * from enums
union all select * from ext
union all select * from buckets
union all select * from realtime
order by kind, name;
