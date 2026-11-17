begin;

create or replace function stock_security.validate_record_changes()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  event_count integer := jsonb_array_length(new.data->'audit') - jsonb_array_length(old.data->'audit');
  actor_label text := new.data->>'lastUser';
  collections text[] := array['stock','transactions','warehouses','transporters','clients','imports'];
  collection text;
  transaction_details text[] := array[
    'truck','trailer1','trailer2','notes','invoice','grv','dv','stv','beiraDv','clientDoc','eiz','delNote',
    'transporterId','transporter','clientId','client','updatedBy','updatedAt','rev'
  ];
begin
  -- The preceding trigger authenticates the writer and stamps the new audit entries.
  foreach collection in array collections loop
    if jsonb_typeof(new.data->collection) is distinct from 'array' or exists (
      select 1 from jsonb_array_elements(new.data->collection) as records(item)
      group by item->>'id'
      having count(*) > 1 or item->>'id' is null or item->>'id' = ''
        or not bool_and(jsonb_typeof(item->'id') = 'string')
    ) then
      raise exception 'Records must have distinct IDs' using errcode = '23514';
    end if;
  end loop;

  if (new.data - (collections || array['audit','tolerance','lastUser','sequence']))
    is distinct from (old.data - (collections || array['audit','tolerance','lastUser','sequence']))
    or jsonb_typeof(new.data->'tolerance'->'check') is distinct from 'number'
    or jsonb_typeof(new.data->'tolerance'->'allowed') is distinct from 'number'
    or (new.data->'tolerance'->'check') < '0'::jsonb
    or (new.data->'tolerance'->'allowed') < (new.data->'tolerance'->'check')
    or (new.data->>'sequence')::numeric is distinct from
      (old.data->>'sequence')::numeric + jsonb_array_length(new.data->'transactions') - jsonb_array_length(old.data->'transactions')
  then
    raise exception 'Invalid workspace settings or transaction sequence' using errcode = '23514';
  end if;

  if exists (
    with collection_names(collection_name, kind) as (
      values ('stock','Stock'), ('transactions','Transaction'), ('warehouses','Warehouse'),
             ('transporters','Transporter'), ('clients','Client'), ('imports','Import')
    ),
    events as (
      select item, item->>'kind' as kind, item->>'recordId' as id,
        count(*) over (partition by item->>'kind', item->>'recordId') as record_events
      from jsonb_array_elements(new.data->'audit') with ordinality as entries(item, position)
      where position <= event_count
    ),
    changes as (
      select kind, change.id, change.before_item, change.after_item
      from collection_names
      cross join lateral (
        select coalesce(b.item->>'id', a.item->>'id') as id, b.item as before_item, a.item as after_item
        from jsonb_array_elements(old.data->collection_name) as b(item)
        full join jsonb_array_elements(new.data->collection_name) as a(item)
          on b.item->>'id' = a.item->>'id'
        where b.item is distinct from a.item
      ) as change
      union all
      select 'Settings', 'variance-tolerance', old.data->'tolerance', new.data->'tolerance'
      where old.data->'tolerance' is distinct from new.data->'tolerance'
        or exists (select 1 from events where kind = 'Settings' and id = 'variance-tolerance')
    )
    select 1
    from changes as c
    full join events as e on c.kind = e.kind and c.id = e.id
    where c.id is null or c.after_item is null or e.item is null
      or e.item->'before' is distinct from coalesce(c.before_item, 'null'::jsonb)
      or e.item->'after' is distinct from c.after_item
      or e.record_events <> 1
      or (c.kind not in ('Settings','Import') and c.after_item->>'updatedBy' is distinct from actor_label)
      or (c.kind = 'Import' and (c.before_item is not null or c.after_item->>'user' is distinct from actor_label))
      or (c.kind = 'Stock' and e.item->'delta' is distinct from to_jsonb(round(
        (c.after_item->>'balance')::numeric - coalesce((c.before_item->>'balance')::numeric, 0), 3
      )))
      or (c.kind = 'Stock' and coalesce(e.item->>'movement','') <> '' and not exists (
        select 1 from events as movement
        where movement.kind = 'Transaction' and movement.id = e.item->>'movement'
          and movement.item->>'action' in ('Transaction recorded','Transaction voided')
          and movement.item->'after'->>'code' = c.after_item->>'code'
          and movement.item->'after'->>'warehouse' = c.after_item->>'warehouse'
          and e.item->'delta' = to_jsonb(case when movement.item->>'action' = 'Transaction recorded'
            then (movement.item->'after'->>'delta')::numeric else -(movement.item->'before'->>'delta')::numeric end)
      ))
      or (c.kind = 'Transaction' and (
        (c.before_item is null and (
          c.after_item->>'status' is distinct from 'Completed'
          or c.after_item->>'createdBy' is distinct from actor_label
          or jsonb_typeof(c.after_item->'delta') is distinct from 'number'
          or (c.after_item->'delta' = '0'::jsonb and c.after_item->>'type' is distinct from 'Production Direct')
          or e.item->>'action' is distinct from 'Transaction recorded'
        ))
        or (c.before_item is not null and (
          c.before_item->>'status' is distinct from 'Completed'
          or case c.after_item->>'status'
            when 'Voided' then
              c.after_item - array['status','voidReason','updatedBy','updatedAt','rev']
                is distinct from c.before_item - array['status','voidReason','updatedBy','updatedAt','rev']
              or coalesce(btrim(c.after_item->>'voidReason'),'') = ''
              or e.item->>'action' is distinct from 'Transaction voided'
            when 'Completed' then
              c.after_item - (transaction_details || case when c.before_item->>'type' in ('Transfer In','Transfer Out')
                then array[]::text[] else array['loading','offloading'] end)
                is distinct from c.before_item - (transaction_details || case when c.before_item->>'type' in ('Transfer In','Transfer Out')
                  then array[]::text[] else array['loading','offloading'] end)
              or e.item->>'action' is distinct from 'Transaction details updated'
            else true
          end
        ))
        or (c.after_item->>'type' is distinct from 'Production Direct' and (c.before_item is null or c.after_item->>'status' = 'Voided') and (
          select count(*) from events as stock_event
          where stock_event.kind = 'Stock'
            and stock_event.item->>'movement' = c.id
            and stock_event.item->'after'->>'code' = c.after_item->>'code'
            and stock_event.item->'after'->>'warehouse' = c.after_item->>'warehouse'
            and stock_event.item->'delta' = to_jsonb(case when c.before_item is null
              then (c.after_item->>'delta')::numeric else -(c.before_item->>'delta')::numeric end)
        ) <> 1)
        or (c.after_item->>'type' in ('Transfer In','Transfer Out')
          and (c.before_item is null or c.after_item->>'status' = 'Voided')
          and (
            select count(*) from events as other
            where other.kind = 'Transaction' and other.id <> c.id
              and other.item->>'action' = e.item->>'action'
              and other.item->'after'->>'group' = c.after_item->>'group'
              and other.item->'after'->>'code' = c.after_item->>'code'
              and other.item->'after'->>'warehouse' <> c.after_item->>'warehouse'
              and other.item->'after'->>'type' = case c.after_item->>'type'
                when 'Transfer In' then 'Transfer Out' else 'Transfer In' end
              and (other.item->'after'->>'delta')::numeric = -(c.after_item->>'delta')::numeric
          ) <> 1)
      ))
  ) then
    raise exception 'Each changed record needs a matching audit entry; posted quantities are immutable' using errcode = '23514';
  end if;

  return new;
end;
$$;
create function stock_security.validate_production_batches()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  events jsonb;
  batch record;
  output jsonb;
  consumed numeric;
  batch_size integer;
begin
  select coalesce(jsonb_agg(entry), '[]'::jsonb) into events
  from jsonb_array_elements(new.data->'audit') with ordinality as a(entry, position)
  where position <= jsonb_array_length(new.data->'audit') - jsonb_array_length(old.data->'audit');

  if exists (
    select 1 from jsonb_array_elements(events) as a(entry)
    where entry->>'kind'='Transaction' and entry->>'action'='Transaction recorded'
      and entry->'after'->>'type'='Production'
  ) then
    raise exception 'New production requires a batch with raw materials' using errcode='23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(events) as a(entry)
    where entry->>'kind'='Transaction' and entry->'after'->>'type'='Production Direct'
      and (coalesce(btrim(entry->'after'->>'truck'),'')=''
        or not exists (select 1 from jsonb_array_elements(new.data->'clients') as c(client)
          where client->>'id'=entry->'after'->>'clientId'
            and (entry->>'action'<>'Transaction recorded' or client->>'archived' is distinct from 'true')))
  ) then
    raise exception 'Direct production dispatch requires a truck and customer' using errcode='23514';
  end if;

  for batch in
    select distinct entry->'after'->>'group' as id, entry->>'action' as operation
    from jsonb_array_elements(events) as a(entry)
    where entry->>'kind'='Transaction' and entry->>'action' in ('Transaction recorded','Transaction voided')
      and entry->'after'->>'type' in ('Production Input','Production Output','Production Direct')
  loop
    select count(*), sum(-(item->>'delta')::numeric) filter (where item->>'type'='Production Input')
    into batch_size, consumed
    from jsonb_array_elements(new.data->'transactions') as t(item)
    where item->>'group'=batch.id;

    select item into output
    from jsonb_array_elements(new.data->'transactions') as t(item)
    where item->>'group'=batch.id and item->>'type' in ('Production Output','Production Direct');

    if coalesce(batch.id,'')='' or batch_size<2 or consumed is null or output is null
      or exists (
        select 1 from jsonb_array_elements(new.data->'transactions') as t(item)
        where item->>'group'=batch.id and (
          item->>'warehouse' is distinct from output->>'warehouse'
          or item->>'date' is distinct from output->>'date'
          or (item->>'id'<>output->>'id' and (
            item->>'type' is distinct from 'Production Input'
            or (item->>'delta')::numeric >= 0
            or item->'accounting' is distinct from to_jsonb(-(item->>'delta')::numeric)
          ))
          or not exists (
            select 1 from jsonb_array_elements(events) as a(entry)
            where entry->>'kind'='Transaction' and entry->>'action'=batch.operation and entry->>'recordId'=item->>'id'
          )
        )
      )
      or (select count(distinct item->>'code') from jsonb_array_elements(new.data->'transactions') as t(item)
        where item->>'group'=batch.id)<>batch_size
      or jsonb_typeof(output->'produced') is distinct from 'number'
      or (output->>'produced')::numeric<=0
      or (output->>'produced')::numeric>consumed
      or output->'productionLoss' is distinct from to_jsonb(consumed-(output->>'produced')::numeric)
      or output->'accounting' is distinct from output->'produced'
      or (output->>'type'='Production Output' and (output->'delta' is distinct from output->'produced' or output->'out' is distinct from '0'::jsonb))
      or (output->>'type'='Production Direct' and (
        output->'delta' is distinct from '0'::jsonb or output->'out' is distinct from output->'produced'
        or exists (select 1 from jsonb_array_elements(events) as a(entry)
          where entry->>'kind'='Stock' and entry->>'movement'=output->>'id')
      ))
    then
      raise exception 'Production must post or void all raw inputs and one balanced finished output together' using errcode='23514';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function stock_security.validate_production_batches() from public, anon, authenticated;

create trigger etg_stock_validate_production
before update on public.etg_stock_state
for each row execute function stock_security.validate_production_batches();

commit;
