# Vaultora production architecture

This document describes the production target and the boundaries that must be
completed before Vaultora can handle customer money or execute trades. It is an
engineering architecture document, not a legal opinion.

## Current foundation

- React and Vite web application
- Express API server
- PostgreSQL with Drizzle ORM
- Clerk-managed authentication
- Account, profile, KYC-status, portfolio, holdings, transaction, funding-request,
  notification, audit-log, and Stripe webhook-event tables
- Stripe connector integration present but disabled by default
- Funding and trading are release-gated and must remain unavailable until the
  business model, regulated partners, and controls are approved

## Target service boundaries

```text
Web application
  -> Authenticated API
       -> Identity and access service (Clerk + Vaultora authorization)
       -> Account and KYC orchestration
       -> Portfolio read model
       -> Order and broker adapter
       -> Risk engine
       -> Ledger and reconciliation service
       -> Notification and statement service
       -> Admin and compliance operations
       -> PostgreSQL

Regulated external boundaries
  -> KYC/AML provider
  -> Authorised broker and, where applicable, depository/custodian
  -> Approved payment and banking rail
  -> Market-data provider
  -> Monitoring, alerting, and incident-response tooling
```

The web application must never be the source of truth for balances, fills,
portfolio value, KYC status, or risk decisions. It should render signed-in API
responses and show an explicit unavailable state when a capability is gated.

## Core domain boundaries

### Identity and authorization

- Clerk handles authentication and session security.
- Vaultora maps the Clerk subject to a local account.
- Authorization is enforced server-side on every account-owned query.
- Admin access uses explicit roles and permissions, not frontend visibility.
- High-risk actions require step-up authentication or equivalent controls once
  the regulated model is selected.

### KYC and compliance

- KYC is an orchestration workflow, not a Boolean flag.
- Provider references and statuses are stored; raw identity documents should
  remain in an approved, access-controlled provider or document store.
- Every review and decision is audited with actor, timestamp, reason, and
  source reference.

### Orders and broker integration

- Broker integrations use an adapter interface.
- Sandbox/paper trading is the only permitted mode until a release gate is
  approved.
- Client order IDs and broker order IDs are both persisted.
- Order, acknowledgement, rejection, partial fill, fill, cancel, and error
  events are append-only and idempotent.

### Ledger and reconciliation

- Money movement requires a double-entry ledger rather than a mutable balance
  column.
- Every external settlement has an idempotency key and reconciliation status.
- A transaction is not completed because a request was created; it is completed
  only after verified settlement evidence.
- Fees, reversals, chargebacks, and corrections have separate ledger entries.

### Risk controls

- Pre-trade checks run on the server before broker submission.
- Controls include instrument eligibility, position limits, exposure limits,
  notional limits, loss limits, concentration limits, and account status.
- A global emergency trading pause must override all user requests.

## Release gates

The following capabilities remain disabled by default:

- Customer deposits
- Customer withdrawals
- Stripe funding webhooks
- Live broker order submission
- Investment-management actions

Enabling any of them requires an explicit release decision supported by legal,
banking, broker, KYC, security, reconciliation, and operational evidence.

## Required production controls

- Environment-specific secrets managed outside source control
- Production-only Clerk configuration
- Database backups and restore drills
- Migration review and rollback procedure
- Structured audit logs with restricted access
- Security headers, rate limits, CSRF protection, and request correlation IDs
- Monitoring for authentication abuse, authorization failures, webhook failures,
  reconciliation breaks, and unusual trading activity
- Incident response, access review, and breach-notification procedures
- Automated tests for ownership isolation, privilege boundaries, idempotency,
  replay protection, ledger invariants, and release gates