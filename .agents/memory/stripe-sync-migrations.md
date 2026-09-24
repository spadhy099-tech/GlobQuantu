---
name: Stripe Sync migrations
description: Runtime bundling constraint for stripe-replit-sync database migrations.
---

`stripe-replit-sync` loads its SQL migration directory relative to the installed package at runtime. The API build must preserve that package boundary rather than inline the library into the server bundle.

**Why:** Bundling the library moved migration resolution under the API `dist` directory, where the SQL files were absent. Stripe Sync then skipped migrations and failed later on the missing `stripe.accounts` relation.

**How to apply:** If the API bundler configuration changes, keep `stripe-replit-sync` external and verify a fresh startup creates or sees the `stripe` schema before testing payment routes.