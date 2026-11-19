create or replace function stock_security.save_depot_order(request_id uuid, requested_lines jsonb, requested_depot text, edit_order boolean)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  depot_name text;
  item jsonb;
  material record;
  line_pack text;
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
    line_pack := btrim(item->>'pack');
    if jsonb_typeof(item->'pack') is distinct from 'string' or length(line_pack)>120 then
      raise exception 'Invalid packaging unit' using errcode='23514';
    end if;
    select c.code,c.product into material from stock_security.depot_catalog() as c
      where c.code=item->>'code'
      order by (c.pack=line_pack) desc, (c.pack='') desc, c.pack
      limit 1;
    if not found then raise exception 'Material is unavailable' using errcode='23514'; end if;
    if exists (select 1 from jsonb_array_elements(saved_lines) as a(saved)
      where saved->>'code'=material.code and saved->>'pack'=line_pack) then
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
    bag_kg := (regexp_match(line_pack, '([0-9]+(?:\.[0-9]+)?)\s*kg\y', 'i'))[1]::numeric;
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
      'code',material.code,'product',material.product,'pack',line_pack,'quantity',quantity,'mt',weight,
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
