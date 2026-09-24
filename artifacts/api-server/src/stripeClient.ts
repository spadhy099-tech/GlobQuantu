import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";
import { isStripeEnabled } from "./lib/capabilities";

export async function getStripeCredentials(): Promise<{
  secretKey: string;
  webhookSecret?: string;
  publishableKey?: string;
}> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error("Stripe connection environment is unavailable");
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Stripe credentials unavailable: ${response.status}`);
  }

  const data = (await response.json()) as {
    items?: Array<{
      settings?: {
        secret_key?: string;
        webhook_secret?: string;
        publishable_key?: string;
      };
    }>;
  };
  const item = data.items?.[0];
  const settings = (item?.settings ?? {}) as Record<string, unknown>;
  const readString = (...values: unknown[]) =>
    values.find((value): value is string => typeof value === "string" && value.length > 0);
  const secretKey = readString(
    settings.secret_key,
    settings.secret,
    (settings.secret as { secret_key?: unknown } | undefined)?.secret_key,
  );
  const publishableKey = readString(
    settings.publishable_key,
    settings.publishable,
    (settings.publishable as { key?: unknown } | undefined)?.key,
  );
  const webhookSecret = readString(
    settings.webhook_secret,
    (item as { webhook_config?: { secret?: unknown } } | undefined)?.webhook_config?.secret,
  );

  if (!secretKey) {
    throw new Error("Stripe is connected without a server secret key");
  }

  return {
    secretKey,
    webhookSecret,
    publishableKey,
  };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  if (!isStripeEnabled()) {
    throw new Error("Stripe integration is disabled");
  }
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  if (!isStripeEnabled()) {
    throw new Error("Stripe integration is disabled");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Stripe sync");

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}