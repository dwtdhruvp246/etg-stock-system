# ETG Stock & Dispatch

The static app in `dist/` uses Supabase Auth and the Supabase Data API. The database starts empty.

## Supabase setup

1. In the ETG project, open **SQL Editor** and run [the migration](supabase/migrations/20261116151000_etg_stock.sql) once. It creates the ETG tables and policies.
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

## Hosting

Serve `dist/` over HTTPS. The project is set in `dist/supabase-config.js`. Use only a browser publishable or legacy anon key in this file. If the host uses a separate sharing gate, staff also need access through the host.

The app includes the pinned Supabase JavaScript browser bundle in `dist/vendor/`. If you change Supabase projects, also update the allowed API origin in the Content Security Policy in `dist/index.html`.

The current adapter stores one versioned stock snapshot and checks for changes about every 12 seconds. Writes are atomic. Report and stock pagination is client-side, so this storage model should be revisited for high transaction volumes.
