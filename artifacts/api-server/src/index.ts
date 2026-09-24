import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { isStripeEnabled } from "./lib/capabilities";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initializeStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  await runMigrations({ databaseUrl });
  const stripeSync = await getStripeSync();
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) {
    await stripeSync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
  }
  await stripeSync.syncBackfill();
}

function listen() {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

try {
  if (!isStripeEnabled()) {
    logger.info(
      "Stripe integration is disabled by default; set VAULTORA_STRIPE_ENABLED=true only after the Stripe and compliance release gate is approved",
    );
    listen();
  } else {
    await initializeStripe();
    listen();
  }
} catch (error) {
  logger.error({ err: error }, "Unable to initialize API server");
  if (isStripeEnabled()) {
    process.exit(1);
  }
  logger.warn("API is running without Stripe sync");
  listen();
}
