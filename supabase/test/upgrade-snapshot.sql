-- ---------------------------------------------------------------------------
-- What the schema looks like, recorded once after each pass of run.sh.
--
-- run.sh applies every file, records this as 'first', applies every file
-- again (the upgrade procedure) and records it as 'second'. 18-upgrade.sql
-- then requires the two to be identical: every function with the same
-- signature, result, security, settings and grants; every trigger; every
-- policy; every table's row level security and grants. Nothing is listed by
-- hand, so a function added tomorrow is covered the day it is added.
--
--   psql -v pass=first -f upgrade-snapshot.sql
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on

create schema if not exists upgrade_check;
create table if not exists upgrade_check.objects (
  pass   text not null,
  kind   text not null,
  name   text not null,
  detail text,
  primary key (pass, kind, name)
);
delete from upgrade_check.objects where pass = :'pass';

-- Grants read as a sorted list, so the same grants given in another order
-- (a revoke and a grant run twice) are the same thing.
insert into upgrade_check.objects (pass, kind, name, detail)
select :'pass', 'function', p.oid::regprocedure::text,
       concat_ws(' | ',
         'returns ' || pg_get_function_result(p.oid),
         case when p.prosecdef then 'security definer' else 'invoker' end,
         'volatility ' || p.provolatile::text,
         'settings ' || coalesce(array_to_string(p.proconfig, ','), '-'),
         'grants ' || coalesce((
           select string_agg(case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
                             || ':' || a.privilege_type, ',' order by 1)
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a), '-'))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public';

insert into upgrade_check.objects (pass, kind, name, detail)
select :'pass', 'trigger', t.tgrelid::regclass::text || '.' || t.tgname,
       t.tgenabled::text || ' ' || pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and not t.tgisinternal;

insert into upgrade_check.objects (pass, kind, name, detail)
select :'pass', 'policy', p.tablename || '.' || p.policyname,
       concat_ws(' | ', p.permissive, p.cmd, p.roles::text, p.qual, p.with_check)
  from pg_policies p
 where p.schemaname = 'public';

insert into upgrade_check.objects (pass, kind, name, detail)
select :'pass', 'table', c.relname,
       concat_ws(' | ',
         'rls ' || c.relrowsecurity, 'forced ' || c.relforcerowsecurity,
         'grants ' || coalesce((
           select string_agg(case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
                             || ':' || a.privilege_type, ',' order by 1)
             from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a), '-'))
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p', 'v');
