# Vaultora India business-model assessment

This is a preliminary product and engineering assessment, not legal advice.
Vaultora must obtain advice from Indian securities, payments, AML, tax, and
privacy counsel before selecting a launch model.

## The first decision

Vaultora should not begin by implementing a generic “investment platform”.
The regulatory and operating model changes based on what the company actually
does:

1. Displays information and records only
2. Gives personalized investment advice
3. Manages client portfolios or makes investment decisions
4. Routes or executes securities trades
5. Pools investor money into an investment vehicle
6. Receives, holds, or settles customer money

The team should select one primary model and document which activities are
outside scope. A disclaimer cannot substitute for a registration or regulated
partner where the product performs a regulated activity.

## Candidate models

### Model A: information and account-record workspace

Vaultora displays user-provided or regulated-partner data and provides account
organization, statements, education, and operational tooling.

This is the lowest-regulatory-scope starting point, but it still requires:

- Privacy and data-protection compliance
- Secure account access
- Clear non-advice boundaries
- Vendor and processor controls
- Accurate provenance for every displayed value
- No fabricated performance or holdings

This is the safest initial engineering launch model.

### Model B: registered investment-adviser model

If Vaultora or its personnel provide personalized advice about securities,
portfolios, or investment products, the SEBI Investment Adviser framework must
be assessed. The product would need compliant advice processes, disclosures,
client agreements, suitability and recordkeeping controls, and the relevant
registration or regulated-partner arrangement.

### Model C: portfolio-management model

If Vaultora manages client portfolios or makes investment decisions on behalf
of clients, the SEBI Portfolio Managers framework must be assessed. This is
materially different from a dashboard product and requires operational,
capital, client-asset, disclosure, reporting, and governance controls.

### Model D: broker-powered trading platform

If users place orders through Vaultora, the execution model should use an
authorised broker and clearly define who is the registered intermediary.
Requirements may include broker integration controls, KYC/AML responsibilities,
order records, trade confirmations, market-data rights, customer disclosures,
complaint handling, and controlled access to client accounts.

Vaultora should not store broker credentials in the browser or send live orders
until the authorised integration and legal responsibilities are documented.

### Model E: pooled investment vehicle

If Vaultora pools customer money or issues interests in a collective vehicle,
additional fund, securities, custody, trustee, reporting, and offering
requirements may apply. This model should not be implemented as an extension of
the current user-wallet or Stripe tables.

### Model F: customer-money and payments layer

If Vaultora receives, holds, routes, or settles customer money, the payment and
banking structure must be designed with an authorised regulated partner. Stripe
checkout capability by itself does not establish a lawful investment-money,
custody, escrow, or settlement model.

## Compliance workstreams

The selected model should be reviewed against:

- SEBI registration and intermediary obligations
- KYC, AML, beneficial-owner, and suspicious-activity processes
- Broker, exchange, depository, and custody arrangements where applicable
- Payment, banking, escrow, and settlement arrangements where applicable
- Client agreements, disclosures, risk statements, and grievance handling
- Tax reporting and transaction records
- Indian privacy and personal-data obligations
- Cybersecurity, access review, incident response, and audit retention

Useful starting references include:

- SEBI Investment Adviser FAQs and Investment Adviser regulations
- SEBI Portfolio Managers regulations
- SEBI's securities-market KYC master circular
- RBI requirements relevant to the chosen payment and banking structure
- India's Digital Personal Data Protection framework

These references must be checked again by counsel before launch because rules,
interpretations, and circulars change.

## Recommended sequence

1. Launch no-money information and account-readiness functionality.
2. Select the legal model and regulated partners.
3. Complete KYC/AML, client-money, custody, broker, and privacy design.
4. Build sandbox broker and ledger integrations.
5. Complete security, reconciliation, operational, and compliance testing.
6. Enable production funding or live trading only through a documented release
   approval.