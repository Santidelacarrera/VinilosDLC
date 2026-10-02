-- Defense in depth: the API only talks to Postgres through service_role (Netlify Functions).
-- Ensure nothing in `public` is reachable by anon/authenticated, now or by default in the future.
begin;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Trigger functions run as invoker inside service_role writes; they must not be callable via RPC.
revoke all on function public.sync_manual_tracks() from public, anon, authenticated;
revoke all on function public.initialize_album_copy() from public, anon, authenticated;

commit;
