import { and, eq } from "drizzle-orm";
import {
  db,
  holdings,
  riskLimits,
  tradingControls,
} from "@workspace/db";

export class RiskViolationError extends Error {
  statusCode = 409;
}

type RiskOrderInput = {
  userId: string;
  portfolioId: string;
  side: "buy" | "sell";
  quantity: number;
  limitPrice?: number;
};

export async function validateOrderRisk(input: RiskOrderInput): Promise<void> {
  const [control] = await db
    .select()
    .from(tradingControls)
    .where(
      and(
        eq(tradingControls.scope, "portfolio"),
        eq(tradingControls.scopeId, input.portfolioId),
      ),
    );

  if (control && control.status !== "enabled") {
    throw new RiskViolationError(`Trading is ${control.status}: ${control.reason}`);
  }

  const [limits] = await db
    .select()
    .from(riskLimits)
    .where(
      and(
        eq(riskLimits.portfolioId, input.portfolioId),
        eq(riskLimits.active, true),
      ),
    );

  if (!limits) {
    throw new RiskViolationError("No active risk limits are configured for this portfolio");
  }

  if (!input.limitPrice || input.limitPrice <= 0) {
    throw new RiskViolationError(
      "A verified price is required to evaluate order exposure before submission",
    );
  }

  const orderValue = input.quantity * input.limitPrice;
  if (
    limits.maxOrderValue !== null &&
    limits.maxOrderValue !== undefined &&
    orderValue > Number(limits.maxOrderValue)
  ) {
    throw new RiskViolationError("Order exceeds the configured maximum order value");
  }

  const portfolioHoldings = await db
    .select({ quantity: holdings.quantity, currentPrice: holdings.currentPrice })
    .from(holdings)
    .where(eq(holdings.portfolioId, input.portfolioId));
  const exposure = portfolioHoldings.reduce(
    (total, holding) => total + Number(holding.quantity) * Number(holding.currentPrice),
    0,
  );

  if (
    limits.maxExposureValue !== null &&
    limits.maxExposureValue !== undefined &&
    exposure + (input.side === "buy" ? orderValue : 0) > Number(limits.maxExposureValue)
  ) {
    throw new RiskViolationError("Order would exceed the configured portfolio exposure limit");
  }
}