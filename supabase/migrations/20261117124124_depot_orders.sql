begin;

create table public.depot_supervisors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  depot text not null check (length(btrim(depot)) between 1 and 120)
);
create table public.depot_orders (
  id uuid primary key,
  order_number bigint generated always as identity unique,
  user_id uuid not null,
  depot text not null,
  submitted_by text not null,
  created_at timestamptz not null default now(),
  lines jsonb not null,
  total_mt numeric not null
);
create index depot_orders_user_history on public.depot_orders(user_id, created_at desc);

alter table public.depot_supervisors enable row level security;
alter table public.depot_orders enable row level security;
revoke all on public.depot_supervisors, public.depot_orders from public, anon, authenticated;
grant select on public.depot_supervisors, public.depot_orders to authenticated;

create policy depot_assignment_self on public.depot_supervisors for select to authenticated
  using (user_id = (select auth.uid()) and (select stock_security.has_live_session()));
create policy depot_supervisor_no_stock on public.etg_stock_state as restrictive for all to authenticated
  using (not exists (select 1 from public.depot_supervisors))
  with check (not exists (select 1 from public.depot_supervisors));
create policy depot_orders_read on public.depot_orders for select to authenticated
  using (
    (select stock_security.has_live_session())
    and case when exists (select 1 from public.depot_supervisors)
      then user_id = (select auth.uid())
      else exists (select 1 from public.etg_stock_users where user_id = (select auth.uid()) and access_role = 'full_access')
    end
  );

create function stock_security.depot_catalog()
returns table(code text, product text, pack text)
language sql stable security definer set search_path = ''
as $$
  select distinct on (s.item->>'code', s.item->>'pack')
    s.item->>'code', s.item->>'product', s.item->>'pack'
  from public.etg_stock_state as state
  cross join lateral jsonb_array_elements(state.data->'stock') as s(item)
  where (select stock_security.has_live_session())
    and exists (select 1 from public.depot_supervisors where user_id = (select auth.uid()))
    and (s.item->>'archived') is distinct from 'true'
  order by s.item->>'code', s.item->>'pack', s.item->>'product';
$$;

create function stock_security.submit_depot_order(request_id uuid, requested_lines jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  depot_name text;
  item jsonb;
  material record;
  saved_lines jsonb := '[]'::jsonb;
  weight numeric;
  total_weight numeric := 0;
  existing_owner uuid;
  quantity numeric;
  bag_kg numeric;
  field_name text;
begin
  select depot into depot_name from public.depot_supervisors where user_id=actor;
  if depot_name is null or not stock_security.has_live_session() then
    raise exception 'Depot assignment required' using errcode='42501';
  end if;
  select user_id into existing_owner from public.depot_orders where id=request_id;
  if found then
    if existing_owner=actor then return request_id; end if;
    raise exception 'Order reference already in use' using errcode='23514';
  end if;
  if request_id is null or jsonb_typeof(requested_lines) is distinct from 'array' then
    raise exception 'Order lines required' using errcode='23514';
  end if;
  if jsonb_array_length(requested_lines) not between 1 and 100 then
    raise exception 'Enter 1 to 100 order lines' using errcode='23514';
  end if;
  for item in select value from jsonb_array_elements(requested_lines)
  loop
    select * into material from stock_security.depot_catalog() as c
      where c.code=item->>'code' and c.pack=item->>'pack';
    if not found then raise exception 'Material is unavailable' using errcode='23514'; end if;
    if exists (select 1 from jsonb_array_elements(saved_lines) as a(saved)
      where saved->>'code'=material.code and saved->>'pack'=material.pack) then
      raise exception 'Combine duplicate materials on one line' using errcode='23514';
    end if;
    foreach field_name in array array['quantity','average_sales','system_stock','physical_stock']
    loop
      if jsonb_typeof(item->field_name) is distinct from 'number'
        or (item->>field_name)::numeric < 0 or (item->>field_name)::numeric > 1000000000
        or (item->>field_name)::numeric <> round((item->>field_name)::numeric,3) then
        raise exception 'Enter valid quantities' using errcode='23514';
      end if;
    end loop;
    quantity := (item->>'quantity')::numeric;
    bag_kg := (regexp_match(material.pack, '([0-9]+(?:\.[0-9]+)?)\s*kg\y', 'i'))[1]::numeric;
    if bag_kg>0 then
      weight := round(quantity*bag_kg/1000,3);
    else
      if jsonb_typeof(item->'mt') is distinct from 'number' then
        raise exception 'Enter the weight in metric tonnes' using errcode='23514';
      end if;
      weight := (item->>'mt')::numeric;
    end if;
    if quantity<=0 or weight<=0 or weight>1000000000 or weight<>round(weight,3) then
      raise exception 'Quantity and weight must be positive' using errcode='23514';
    end if;
    saved_lines := saved_lines || jsonb_build_array(jsonb_build_object(
      'code',material.code,'product',material.product,'pack',material.pack,'quantity',quantity,'mt',weight,
      'average_sales',item->'average_sales','system_stock',item->'system_stock','physical_stock',item->'physical_stock'));
    total_weight := total_weight + weight;
  end loop;
  insert into public.depot_orders(id,user_id,depot,submitted_by,lines,total_mt)
  values(request_id,actor,depot_name,coalesce(nullif(auth.jwt()->>'email',''),actor::text),saved_lines,total_weight)
  on conflict (id) do nothing;
  if not exists(select 1 from public.depot_orders where id=request_id and user_id=actor) then
    raise exception 'Order reference already in use' using errcode='23514';
  end if;
  return request_id;
end;
$$;

create function public.depot_catalog()
returns table(code text, product text, pack text)
language sql stable security invoker set search_path = ''
as $$ select * from stock_security.depot_catalog(); $$;

create function public.submit_depot_order(request_id uuid, requested_lines jsonb)
returns uuid language sql security invoker set search_path = ''
as $$ select stock_security.submit_depot_order(request_id, requested_lines); $$;

revoke all on function stock_security.depot_catalog(), public.depot_catalog(),
  stock_security.submit_depot_order(uuid,jsonb), public.submit_depot_order(uuid,jsonb) from public, anon, authenticated;
grant execute on function stock_security.depot_catalog(), public.depot_catalog(),
  stock_security.submit_depot_order(uuid,jsonb), public.submit_depot_order(uuid,jsonb) to authenticated;

commit;
