-- M1 · Security hardening for advisor lints 0011/0028/0029.
-- set_updated_at: pin search_path (mutable-search_path lint).
-- Both fns are trigger-only, so revoke the auto-granted RPC EXECUTE that would
-- otherwise expose them via /rest/v1/rpc to anon/authenticated.

create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
