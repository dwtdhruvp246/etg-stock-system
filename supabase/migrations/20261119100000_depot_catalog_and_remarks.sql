begin;
create table public.depot_products (
 code text not null check(length(btrim(code)) between 1 and 120),
 product text not null check(length(btrim(product)) between 1 and 240),
 pack text not null default '' check(length(pack)<=120),
 primary key(code,pack)
);
alter table public.depot_products enable row level security;
revoke all on public.depot_products from public,anon,authenticated;
grant select,insert,update on public.depot_products to authenticated;
create policy depot_products_read on public.depot_products for select to authenticated using
 ((select stock_security.has_live_session()) and (select stock_security.workspace_role()) is not null);
create policy depot_products_insert on public.depot_products for insert to authenticated with check
 ((select stock_security.has_live_session()) and (select stock_security.workspace_role())='full_access');
create policy depot_products_update on public.depot_products for update to authenticated using
 ((select stock_security.has_live_session()) and (select stock_security.workspace_role())='full_access')
 with check ((select stock_security.has_live_session()) and (select stock_security.workspace_role())='full_access');

create or replace function stock_security.depot_catalog()
returns table(code text,product text,pack text)
language sql stable security definer set search_path='' as $$
 select p.code,p.product,p.pack from public.depot_products p
 where stock_security.has_live_session() and stock_security.workspace_role() is not null
 order by p.code,p.pack;
$$;
alter table public.depot_orders add column remarks jsonb not null default '[]',
 add column remarks_updated_at timestamptz, add column remarks_updated_by uuid;

create function stock_security.save_depot_remarks(order_id uuid, expected_remarks jsonb, new_remarks jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare entry jsonb;
begin
 if not stock_security.has_live_session() or coalesce(stock_security.workspace_role(),'') not in ('full_access','depot_manager') then
  raise exception 'Manager permission required' using errcode='42501';
 end if;
 if jsonb_typeof(new_remarks) is distinct from 'array' or jsonb_array_length(new_remarks)>100 then
  raise exception 'Invalid remarks' using errcode='23514';
 end if;
 for entry in select value from jsonb_array_elements(new_remarks) loop
  if jsonb_typeof(entry->'code') is distinct from 'string' or jsonb_typeof(entry->'pack') is distinct from 'string'
   or jsonb_typeof(entry->'remarks') is distinct from 'string' or length(entry->>'remarks')>2000 then
   raise exception 'Invalid remarks' using errcode='23514';
  end if;
  if not exists(select 1 from public.depot_orders o cross join lateral jsonb_array_elements(o.lines) l
    where o.id=order_id and l->>'code'=entry->>'code' and l->>'pack'=entry->>'pack') then
   raise exception 'Order item changed' using errcode='23514';
  end if;
 end loop;
 update public.depot_orders set remarks=new_remarks, remarks_updated_at=clock_timestamp(), remarks_updated_by=auth.uid()
 where id=order_id and deleted_at is null and remarks=expected_remarks;
 if not found then raise exception 'Order changed. Reopen it before saving' using errcode='23514'; end if;
end $$;
create function public.save_depot_remarks(order_id uuid, expected_remarks jsonb, new_remarks jsonb)
returns void language sql security invoker set search_path='' as $$
 select stock_security.save_depot_remarks(order_id,expected_remarks,new_remarks);
$$;
revoke all on function stock_security.save_depot_remarks(uuid,jsonb,jsonb),public.save_depot_remarks(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function stock_security.save_depot_remarks(uuid,jsonb,jsonb),public.save_depot_remarks(uuid,jsonb,jsonb) to authenticated;
commit;
