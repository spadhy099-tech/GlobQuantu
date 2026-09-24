import type { Response } from "express";

function isExplicitlyEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Money movement is a release-gated capability.
 *
 * It is deliberately disabled unless the deployment explicitly opts in.
 * The default must remain safe for previews, development, and deployments
 * where the legal, banking, and payment controls are not complete.
 */
export function isFundingEnabled(): boolean {
  return isExplicitlyEnabled(process.env.VAULTORA_FUNDING_ENABLED);
}

/**
 * Stripe is optional infrastructure. Enabling it does not enable funding;
 * both flags must be explicitly enabled before a money movement flow can run.
 */
export function isStripeEnabled(): boolean {
  return isExplicitlyEnabled(process.env.VAULTORA_STRIPE_ENABLED);
}

export function isMoneyMovementEnabled(): boolean {
  return isFundingEnabled() && isStripeEnabled();
}

export function isTradingEnabled(): boolean {
  return isExplicitlyEnabled(process.env.VAULTORA_TRADING_ENABLED);
}

export function isKycReviewEnabled(): boolean {
  return isExplicitlyEnabled(process.env.VAULTORA_KYC_REVIEW_ENABLED);
}

export function rejectDisabledCapability(
  res: Response,
  capability: "funding" | "stripe" | "trading" | "kyc_review",
): void {
  const labels = {
    funding: "Funding",
    stripe: "Stripe integration",
    trading: "Trading",
    kyc_review: "KYC review",
  } as const;
  res.status(503).json({
    error: `${labels[capability]} is currently unavailable while Vaultora completes its legal, banking, and compliance review.`,
    code: `${capability.toUpperCase()}_DISABLED`,
  });
}