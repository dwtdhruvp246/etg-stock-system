begin;

alter table public.etg_stock_users drop constraint etg_stock_users_access_role_check;
alter table public.etg_stock_users add constraint etg_stock_users_access_role_check
  check (access_role in ('full_access','view_only','depot_only','depot_manager','stock_manager'));

-- Preserve the depot-only access of existing assigned supervisors.
insert into public.etg_stock_users (user_id,access_role)
select user_id,'depot_only' from public.depot_supervisors
on conflict (user_id) do update set access_role=excluded.access_role;

alter table public.depot_orders
  add column status text not null default 'pending' check (status in ('pending','preparing','sent','received')),
  add column status_changed_at timestamptz,
  add column status_changed_by uuid,
  add column deleted_at timestamptz,
  add column deleted_by uuid;

create function stock_security.workspace_role()
returns text language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    (select access_role from public.etg_stock_users where user_id=(select auth.uid())),
    (select 'depot_only' from public.depot_supervisors where user_id=(select auth.uid()))
  );
$$;
revoke all on function stock_security.workspace_role() from public, anon;
grant execute on function stock_security.workspace_role() to authenticated;

drop policy depot_supervisor_no_stock on public.etg_stock_state;
drop policy etg_full_access_write on public.etg_stock_state;
create policy stock_role_write on public.etg_stock_state for update to authenticated
  using ((select stock_security.workspace_role()) in ('full_access','stock_manager'))
  with check ((select stock_security.workspace_role()) in ('full_access','stock_manager'));
create policy stock_role_boundary on public.etg_stock_state as restrictive for all to authenticated
  using ((select stock_security.workspace_role()) in ('full_access','view_only','stock_manager'))
  with check ((select stock_security.workspace_role()) in ('full_access','stock_manager'));

drop policy depot_orders_read on public.depot_orders;
create policy depot_orders_read on public.depot_orders for select to authenticated
  using (deleted_at is null and (select stock_security.has_live_session()) and
    ((select stock_security.workspace_role()) in ('full_access','view_only','depot_manager','stock_manager')
      or ((select stock_security.workspace_role())='depot_only' and user_id=(select auth.uid()))));

create or replace function stock_security.depot_catalog()
returns table(code text, product text, pack text)
language sql stable security definer set search_path = ''
as $$
  select distinct on (s.item->>'code', s.item->>'pack')
    s.item->>'code', s.item->>'product', s.item->>'pack'
  from public.etg_stock_state as state
  cross join lateral jsonb_array_elements(state.data->'stock') as s(item)
  where (select stock_security.has_live_session())
    and (stock_security.workspace_role()='full_access' or
      (stock_security.workspace_role()='depot_only' and exists
        (select 1 from public.depot_supervisors where user_id = (select auth.uid()))))
    and (s.item->>'archived') is distinct from 'true'
  order by s.item->>'code', s.item->>'pack', s.item->>'product';
$$;

create function stock_security.save_depot_order(request_id uuid, requested_lines jsonb, requested_depot text, edit_order boolean)
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
  existing_order public.depot_orders%rowtype;
  role_name text := stock_security.workspace_role();
  quantity numeric;
  bag_kg numeric;
  field_name text;
begin
  if role_name='full_access' then
    depot_name := btrim(requested_depot);
    if length(coalesce(depot_name,'')) not between 1 and 120 then
      raise exception 'Enter a depot name' using errcode='23514';
    end if;
  elsif role_name='depot_only' and not edit_order then
    select depot into depot_name from public.depot_supervisors where user_id=actor;
  end if;
  if depot_name is null or not stock_security.has_live_session() then
    raise exception 'Order write permission required' using errcode='42501';
  end if;
  select * into existing_order from public.depot_orders where id=request_id for update;
  if edit_order then
    if not found or existing_order.deleted_at is not null then
      raise exception 'Order unavailable' using errcode='23514';
    end if;
  elsif found then
    if existing_order.user_id=actor and existing_order.deleted_at is null then return request_id; end if;
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
  if edit_order then
    update public.depot_orders set depot=depot_name, lines=saved_lines, total_mt=total_weight where id=request_id;
    return request_id;
  end if;
  insert into public.depot_orders(id,user_id,depot,submitted_by,lines,total_mt)
  values(request_id,actor,depot_name,coalesce(nullif(auth.jwt()->>'email',''),actor::text),saved_lines,total_weight)
  on conflict (id) do nothing;
  if not exists(select 1 from public.depot_orders where id=request_id and user_id=actor and deleted_at is null) then
    raise exception 'Order reference already in use' using errcode='23514';
  end if;
  return request_id;
end;
$$;

revoke all on function stock_security.save_depot_order(uuid,jsonb,text,boolean) from public, anon, authenticated;

create or replace function stock_security.submit_depot_order(request_id uuid, requested_lines jsonb)
returns uuid language sql security definer set search_path = ''
as $$ select stock_security.save_depot_order(request_id,requested_lines,null,false); $$;

create function stock_security.save_managed_depot_order(request_id uuid, requested_lines jsonb, requested_depot text, edit_order boolean)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if stock_security.workspace_role() is distinct from 'full_access' then
    raise exception 'Full Access required' using errcode='42501';
  end if;
  return stock_security.save_depot_order(request_id,requested_lines,requested_depot,edit_order);
end;
$$;

create function stock_security.change_depot_order_status(order_id uuid, expected_status text, new_status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not stock_security.has_live_session() or
     coalesce(stock_security.workspace_role(),'') not in ('full_access','depot_manager') then
    raise exception 'Order status permission required' using errcode='42501';
  end if;
  update public.depot_orders set status=new_status, status_changed_at=clock_timestamp(), status_changed_by=auth.uid()
  where id=order_id and deleted_at is null and status=expected_status;
  if not found then raise exception 'Order status changed or order unavailable' using errcode='23514'; end if;
end;
$$;

create function stock_security.delete_depot_order(order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not stock_security.has_live_session() or stock_security.workspace_role() is distinct from 'full_access' then
    raise exception 'Full Access required' using errcode='42501';
  end if;
  update public.depot_orders set deleted_at=clock_timestamp(), deleted_by=auth.uid()
  where id=order_id and deleted_at is null;
  if not found then raise exception 'Order unavailable' using errcode='23514'; end if;
end;
$$;

create function public.save_managed_depot_order(request_id uuid, requested_lines jsonb, requested_depot text, edit_order boolean)
returns uuid language sql security invoker set search_path = ''
as $$ select stock_security.save_managed_depot_order(request_id,requested_lines,requested_depot,edit_order); $$;

create function public.change_depot_order_status(order_id uuid, expected_status text, new_status text)
returns void language sql security invoker set search_path = ''
as $$ select stock_security.change_depot_order_status(order_id,expected_status,new_status); $$;

create function public.delete_depot_order(order_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select stock_security.delete_depot_order(order_id); $$;

revoke all on function public.save_managed_depot_order(uuid,jsonb,text,boolean),
  public.change_depot_order_status(uuid,text,text), public.delete_depot_order(uuid),
  stock_security.save_managed_depot_order(uuid,jsonb,text,boolean),
  stock_security.change_depot_order_status(uuid,text,text), stock_security.delete_depot_order(uuid) from public, anon, authenticated;
grant execute on function public.save_managed_depot_order(uuid,jsonb,text,boolean),
  public.change_depot_order_status(uuid,text,text), public.delete_depot_order(uuid),
  stock_security.save_managed_depot_order(uuid,jsonb,text,boolean),
  stock_security.change_depot_order_status(uuid,text,text), stock_security.delete_depot_order(uuid) to authenticated;

commit;
