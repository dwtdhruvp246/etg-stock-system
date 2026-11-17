create or replace function stock_security.change_depot_order_status(order_id uuid, expected_status text, new_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor_role text := stock_security.workspace_role();
  receiving boolean := actor_role is not distinct from 'depot_only'
    and expected_status is not distinct from 'sent'
    and new_status is not distinct from 'received';
begin
  if not stock_security.has_live_session() or
     (coalesce(actor_role,'') not in ('full_access','depot_manager') and not receiving) then
    raise exception 'Order status permission required' using errcode='42501';
  end if;
  update public.depot_orders set status=new_status, status_changed_at=clock_timestamp(), status_changed_by=auth.uid()
  where id=order_id and deleted_at is null and status=expected_status
    and (not receiving or user_id=auth.uid());
  if not found then raise exception 'Order status changed or order unavailable' using errcode='23514'; end if;
end;
$$;

