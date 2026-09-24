import Stripe from "stripe";
import {
  db,
  fundingRequests,
  notifications,
  stripeWebhookEvents,
  transactions,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStripeCredentials, getStripeSync } from "./stripeClient";
import { writeAuditLog } from "./lib/audit";
import { isStripeEnabled } from "./lib/capabilities";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!isStripeEnabled()) {
      throw new Error("Stripe integration is disabled");
    }

    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be a Buffer");
    }

    const { secretKey, webhookSecret } = await getStripeCredentials();
    if (!webhookSecret) {
      throw new Error("Stripe webhook signing secret is not configured");
    }

    const stripe = new Stripe(secretKey);
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    const [recorded] = await db
      .insert(stripeWebhookEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: stripeWebhookEvents.id });

    if (!recorded) return;

    const stripeSync = await getStripeSync();
    await stripeSync.processWebhook(payload, signature);

    if (
      event.type !== "payment_intent.succeeded" &&
      event.type !== "payment_intent.payment_failed"
    ) {
      return;
    }

    const intent = event.data.object as Stripe.PaymentIntent;
    const requestId = intent.metadata?.fundingRequestId;
    if (!requestId) return;

    const [request] = await db
      .select()
      .from(fundingRequests)
      .where(eq(fundingRequests.id, requestId));
    if (!request) return;

    const succeeded = event.type === "payment_intent.succeeded";
    const nextStatus = succeeded ? "completed" : "failed";

    await db.transaction(async (tx) => {
      await tx
        .update(fundingRequests)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(fundingRequests.id, requestId));
      await tx
        .update(transactions)
        .set({
          status: nextStatus,
          stripePaymentIntentId: intent.id,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, requestId));
      await tx.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: request.userId,
        type: succeeded ? "deposit_completed" : "deposit_failed",
        title: succeeded ? "Deposit received" : "Deposit failed",
        body: succeeded
          ? "Your deposit has been confirmed and added to your available cash balance."
          : "Stripe could not complete your deposit. No balance was added.",
      });
    });

    await writeAuditLog({
      actorUserId: null,
      action: `stripe.${event.type}`,
      entityType: "funding_request",
      entityId: requestId,
      metadata: { stripeEventId: event.id, paymentIntentId: intent.id },
    });
  }
}