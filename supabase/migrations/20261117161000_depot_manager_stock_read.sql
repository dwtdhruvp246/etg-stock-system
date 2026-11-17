alter policy stock_role_boundary on public.etg_stock_state
  using ((select stock_security.workspace_role()) in ('full_access','view_only','stock_manager','depot_manager'));
