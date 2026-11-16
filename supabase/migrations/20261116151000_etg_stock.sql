begin;

create table public.etg_stock_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_role text not null check (access_role in ('full_access', 'view_only'))
);

create table public.etg_stock_state (
  id integer primary key check (id = 1),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  data jsonb not null check (
    jsonb_typeof(data) = 'object'
    and data ?& array['stock','transactions','audit','imports','warehouses','transporters','clients','tolerance','sequence']
    and jsonb_typeof(data->'stock') = 'array'
    and jsonb_typeof(data->'transactions') = 'array'
    and jsonb_typeof(data->'audit') = 'array'
    and jsonb_typeof(data->'imports') = 'array'
    and jsonb_typeof(data->'warehouses') = 'array'
    and jsonb_typeof(data->'transporters') = 'array'
    and jsonb_typeof(data->'clients') = 'array'
    and jsonb_typeof(data->'tolerance') = 'object'
    and jsonb_typeof(data->'sequence') = 'number'
  )
);

insert into public.etg_stock_state (id, data) values (1, '{
  "stock": [], "transactions": [], "audit": [], "imports": [],
  "warehouses": [], "transporters": [], "clients": [],
  "tolerance": {"check": 0.1, "allowed": 0.25}, "sequence": 0
}');

alter table public.etg_stock_users enable row level security;
alter table public.etg_stock_state enable row level security;
revoke all on public.etg_stock_users, public.etg_stock_state from public, anon, authenticated;
grant select on public.etg_stock_users, public.etg_stock_state to authenticated;
grant update (data, version) on public.etg_stock_state to authenticated;

create policy etg_read_own_role on public.etg_stock_users
for select to authenticated
using (user_id = (select auth.uid()) and not coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false));

create policy etg_authorized_read on public.etg_stock_state
for select to authenticated
using (exists (
  select 1 from public.etg_stock_users as u where u.user_id = (select auth.uid())
));

create policy etg_full_access_write on public.etg_stock_state
for update to authenticated
using (exists (
  select 1 from public.etg_stock_users as u
  where u.user_id = (select auth.uid()) and u.access_role = 'full_access'
))
with check (exists (
  select 1 from public.etg_stock_users as u
  where u.user_id = (select auth.uid()) and u.access_role = 'full_access'
));

create function public.etg_validate_stock_write()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  written_at timestamptz := statement_timestamp();
  actor uuid := auth.uid();
  actor_label text := coalesce(nullif(auth.jwt()->>'email', ''), actor::text);
  original_events jsonb := old.data->'audit';
  events jsonb := new.data->'audit';
  new_event_count integer;
  old_tail jsonb;
  new_head jsonb;
begin
  if actor is null or new.version <> old.version + 1 then
    raise exception 'Invalid stock update version' using errcode = '40001';
  end if;

  if jsonb_typeof(events) is distinct from 'array' then
    raise exception 'Audit history must be an array' using errcode = '23514';
  end if;
  new_event_count := jsonb_array_length(events) - jsonb_array_length(original_events);
  if new_event_count <= 0 then
    raise exception 'A stock update must append an audit event' using errcode = '23514';
  end if;

  select
    coalesce(jsonb_agg(e.value order by e.ordinality) filter (where e.ordinality > new_event_count), '[]'::jsonb),
    coalesce(jsonb_agg(
      e.value || jsonb_build_object('user', actor_label, 'authUserId', actor, 'at', written_at)
      order by e.ordinality
    ) filter (where e.ordinality <= new_event_count), '[]'::jsonb)
  into old_tail, new_head
  from jsonb_array_elements(events) with ordinality as e(value, ordinality);

  if old_tail is distinct from original_events then
    raise exception 'Existing audit entries cannot be changed' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(new.data->'stock') as s(item)
    where jsonb_typeof(s.item->'balance') is distinct from 'number'
       or (s.item->'balance') < '0'::jsonb
       or not exists (
         select 1 from jsonb_array_elements(new.data->'warehouses') as w(item)
         where w.item->>'id' = s.item->>'warehouse'
       )
  ) then
    raise exception 'Each stock balance must be nonnegative and reference a warehouse' using errcode = '23514';
  end if;

  new.data := jsonb_set(new.data, '{audit}', new_head || original_events);
  new.data := jsonb_set(new.data, '{lastUser}', to_jsonb(actor_label));
  new.updated_by := actor;
  new.updated_at := written_at;
  return new;
end;
$$;

revoke all on function public.etg_validate_stock_write() from public, anon, authenticated;
create trigger etg_stock_before_update
before update on public.etg_stock_state
for each row execute function public.etg_validate_stock_write();

commit;
