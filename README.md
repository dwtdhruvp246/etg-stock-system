# ETG Stock & Dispatch

[Open Stock & Dispatch](https://dwtdhruvp246.github.io/etg-stock-system/)

The static app in `dist/` uses Supabase Auth and the Supabase Data API. The database starts empty.

## Supabase setup

1. Apply the SQL files in [supabase/migrations](supabase/migrations) in timestamp order. They create the stock tables, access policies and movement validation.
2. In **Authentication → Sign In / Providers**, switch off **Allow new users to sign up** and anonymous sign-ins. Keep the email/password provider enabled.
3. Under **Authentication → Users**, create the user manually with an email and password. Copy the user's ID.
4. In SQL Editor, assign the user one role. Replace the example UUID and select the role from the table below.

```sql
insert into public.etg_stock_users (user_id, access_role)
values ('00000000-0000-0000-0000-000000000000', 'full_access')
on conflict (user_id) do update set access_role = excluded.access_role;
```

| Role | Stock workspace | Depot orders |
| --- | --- | --- |
| Full Access (`full_access`) | View and manage | View all, create, edit, delete, update status, print and save PDF |
| View Only (`view_only`) | View | View all |
| Depot Only (`depot_only`) | — | Create orders for assigned depot and view own orders |
| Depot Manager (`depot_manager`) | View | View all and update status |
| Stock Manager (`stock_manager`) | View and manage | View all |

Remove both the user's role and any depot assignment to revoke app access.

Add warehouses first, then stock, clients and transporters. Removing stock or a directory entry uses archiving. Voiding a movement reverses its balance and keeps the original entry in the register. Correct posted quantities by voiding and re-entering the movement.

- **Warehouse transfer.** Choose **Transfer Out** or **Transfer In**, then select the sending and receiving warehouses. Both warehouse balances update together.
- **Loose truck receipt.** Choose **Stock Received**, set **Load type** to **Bulk (loose)**, and enter the net weighbridge weight in MT.
- **Production.** Select the finished product, warehouse and raw materials used, then enter the finished weight. The app records loss as total raw material weight minus finished weight. Choose warehouse stock to add the finished product, or direct dispatch and enter a customer and truck registration to send it out without increasing warehouse stock.
- **Repacking.** Set up separate material codes for the source packaging and the finished bags in Stock Management. Choose **Repacking**, select the warehouse and both codes, then enter the number and weight of the finished bags. The same tonnage is deducted from the source and added to the finished material. Both entries appear under **Repacking** in the Transaction Register and Stock Movement Report.

## Depot orders

Create each supervisor under **Authentication → Users**, assign the `depot_only` role above, then set their depot in SQL Editor using their Auth user ID.

```sql
insert into public.depot_supervisors (user_id, depot)
values ('00000000-0000-0000-0000-000000000000', 'Depot name')
on conflict (user_id) do update set depot = excluded.depot;
```

Depot Only users can see their own orders and the product catalog. An explicit app role takes precedence over a depot assignment. Orders use the server submission timestamp and display it in Central Africa Time. Orders start as **Pending**. Full Access and Depot Manager can change the status to **Preparing**, **Sent**, or **Received**, or correct a status. Full Access can print and save orders as PDFs from the order detail. Order changes leave warehouse balances alone.

## Hosting

Serve `dist/` over HTTPS. The project is set in `dist/supabase-config.js`. Use only a browser publishable or legacy anon key in this file. If the host uses a separate sharing gate, staff also need access through the host.

The app includes the pinned Supabase JavaScript browser bundle in `dist/vendor/`. If you change Supabase projects, also update the allowed API origin in the Content Security Policy in `dist/index.html`.

The current adapter stores one versioned stock snapshot and checks for changes about every 12 seconds. Writes are atomic. Report and stock pagination is client-side, so this storage model should be revisited for high transaction volumes.
