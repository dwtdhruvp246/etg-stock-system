begin;

create function stock_security.validate_bulk_and_repacking()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  recent_audit jsonb;
  event_item jsonb;
  movement jsonb;
  action text;
  movement_type text;
  amount numeric;
begin
  select coalesce(jsonb_agg(entry), '[]'::jsonb) into recent_audit
  from jsonb_array_elements(new.data->'audit') with ordinality as a(entry, position)
  where position <= jsonb_array_length(new.data->'audit') - jsonb_array_length(old.data->'audit');

  for event_item in
    select entry from jsonb_array_elements(recent_audit) as a(entry)
    where entry->>'kind' = 'Transaction'
      and (entry->'after'->>'type' in ('Repacking','Repacking In','Repacking Out')
        or (entry->'after'->>'loadType' = 'bulk' and entry->>'action' = 'Transaction recorded'))
  loop
    movement := event_item->'after';
    action := event_item->>'action';
    movement_type := movement->>'type';
    amount := (movement->>'delta')::numeric;

    if movement_type = 'Repacking' then
      raise exception 'Repacking must record separate source and finished movements' using errcode = '23514';
    end if;

    if movement_type in ('Repacking In','Repacking Out') then
      if coalesce(movement->>'group','') = '' or (
        select count(*) from jsonb_array_elements(recent_audit) as a(entry)
        where entry->>'kind' = 'Transaction' and entry->>'action' = action
          and entry->'after'->>'type' = case movement_type
            when 'Repacking In' then 'Repacking Out' else 'Repacking In' end
          and entry->'after'->>'group' = movement->>'group'
          and entry->'after'->>'warehouse' = movement->>'warehouse'
          and entry->'after'->>'code' <> movement->>'code'
          and entry->'after'->>'date' = movement->>'date'
          and (entry->'after'->>'delta')::numeric = -amount
      ) <> 1 or (
        select count(*) from jsonb_array_elements(new.data->'transactions') as t(item)
        where item->>'group' = movement->>'group'
      ) <> 2 then
        raise exception 'Both repacking movements must balance in the same warehouse' using errcode = '23514';
      end if;

      if action = 'Transaction recorded' and (
        movement->'accounting' is distinct from to_jsonb(abs(amount))
        or movement->'out' is distinct from to_jsonb(greatest(-amount, 0))
        or (movement_type = 'Repacking Out' and (amount >= 0 or movement->>'bags' is not null or movement->>'weightKg' is not null))
        or (movement_type = 'Repacking In' and (
          amount <= 0 or movement->>'loadType' is distinct from 'bags'
          or case when jsonb_typeof(movement->'bags') = 'number' and jsonb_typeof(movement->'weightKg') = 'number' then
            (movement->>'bags')::numeric <= 0
            or (movement->>'bags')::numeric <> trunc((movement->>'bags')::numeric)
            or (movement->>'weightKg')::numeric <= 0
            or (movement->>'weightKg')::numeric <> round((movement->>'weightKg')::numeric, 3)
            or amount <> round((movement->>'bags')::numeric * (movement->>'weightKg')::numeric / 1000, 3)
          else true end
        ))
      ) then
        raise exception 'Repacking quantities must match the finished bag count and weight' using errcode = '23514';
      end if;

      if action = 'Transaction details updated' and
        (movement - array['notes','updatedBy','updatedAt','rev'])
          is distinct from ((event_item->'before') - array['notes','updatedBy','updatedAt','rev'])
      then
        raise exception 'Only the notes can be edited on posted repacking movements' using errcode = '23514';
      end if;
    else
      if movement_type is null or movement_type not in ('Stock Received','Transfer In','Transfer Out')
        or (movement_type = 'Transfer Out' and amount >= 0)
        or (movement_type <> 'Transfer Out' and amount <= 0)
        or movement->>'bags' is not null or movement->>'weightKg' is not null
        or movement->>'expected' is not null or movement->>'variance' is not null
        or movement->'weigh' is distinct from to_jsonb(abs(amount))
        or movement->'accounting' is distinct from to_jsonb(abs(amount))
        or movement->'out' is distinct from to_jsonb(greatest(-amount, 0))
        or abs(amount) <> round(abs(amount), 3)
      then
        raise exception 'Bulk movements must use a positive net weight without bag quantities' using errcode = '23514';
      end if;

      if movement_type in ('Transfer In','Transfer Out') and not exists (
        select 1 from jsonb_array_elements(recent_audit) as a(entry)
        where entry->>'kind' = 'Transaction' and entry->>'action' = action
          and entry->'after'->>'type' = case movement_type
            when 'Transfer In' then 'Transfer Out' else 'Transfer In' end
          and entry->'after'->>'group' = movement->>'group'
          and entry->'after'->>'code' = movement->>'code'
          and entry->'after'->>'warehouse' <> movement->>'warehouse'
          and entry->'after'->>'loadType' = 'bulk'
          and (entry->'after'->>'delta')::numeric = -amount
      ) then
        raise exception 'Both warehouse transfer entries must use the same bulk weight' using errcode = '23514';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function stock_security.validate_bulk_and_repacking() from public, anon, authenticated;

-- Runs after the existing audit and transaction validation triggers.
create trigger etg_stock_validate_weights
before update on public.etg_stock_state
for each row execute function stock_security.validate_bulk_and_repacking();

commit;
