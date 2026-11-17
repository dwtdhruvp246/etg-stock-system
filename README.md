# ETG Stock & Dispatch

[Open Stock & Dispatch](https://dwtdhruvp246.github.io/etg-stock-system/)

The static app in `dist/` uses Supabase Auth and the Supabase Data API. The database starts empty.

## Supabase setup

1. Apply the SQL files in [supabase/migrations](supabase/migrations) in timestamp order. They create the stock tables, access policies and movement validation.
2. In **Authentication → Sign In / Providers**, switch off **Allow new users to sign up** and anonymous sign-ins. Keep the email/password provider enabled.
3. Under **Authentication → Users**, create the user manually with an email and password. Copy the user's ID.
4. In SQL Editor, assign the user one role. Replace the example UUID and set `full_access` or `view_only`.

```sql
insert into public.etg_stock_users (user_id, access_role)
values ('00000000-0000-0000-0000-000000000000', 'full_access')
on conflict (user_id) do update set access_role = excluded.access_role;
```

**Full Access** allows adding and editing stock, recording and voiding movements, managing warehouses and contacts, and importing and exporting. **View Only** allows viewing records, reports and history. Accounts without an ETG role have no ETG database access. Remove a user's role row to revoke access.

Add warehouses first, then stock, clients and transporters. Removing stock or a directory entry uses archiving. Voiding a movement reverses its balance and keeps the original entry in the register. Correct posted quantities by voiding and re-entering the movement.

- **Warehouse transfer.** Choose **Transfer Out** or **Transfer In**, then select the sending and receiving warehouses. Both warehouse balances update together.
- **Loose truck receipt.** Choose **Stock Received**, set **Load type** to **Bulk (loose)**, and enter the net weighbridge weight in MT.
- **Production.** Select the finished product, warehouse and raw materials used, then enter the finished weight. The app records loss as total raw material weight minus finished weight. Choose warehouse stock to add the finished product, or direct dispatch and enter a customer and truck registration to send it out without increasing warehouse stock.
- **Repacking.** Set up separate material codes for the source packaging and the finished bags in Stock Management. Choose **Repacking**, select the warehouse and both codes, then enter the number and weight of the finished bags. The same tonnage is deducted from the source and added to the finished material. Both entries appear under **Repacking** in the Transaction Register and Stock Movement Report.

## Hosting

Serve `dist/` over HTTPS. The project is set in `dist/supabase-config.js`. Use only a browser publishable or legacy anon key in this file. If the host uses a separate sharing gate, staff also need access through the host.

The app includes the pinned Supabase JavaScript browser bundle in `dist/vendor/`. If you change Supabase projects, also update the allowed API origin in the Content Security Policy in `dist/index.html`.

The current adapter stores one versioned stock snapshot and checks for changes about every 12 seconds. Writes are atomic. Report and stock pagination is client-side, so this storage model should be revisited for high transaction volumes.
