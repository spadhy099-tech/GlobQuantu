export type BrokerOrderRequest = {
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
  clientOrderId: string;
};

export type BrokerOrderSnapshot = {
  externalOrderId: string;
  status:
    | "pending"
    | "submitted"
    | "accepted"
    | "rejected"
    | "partially_filled"
    | "filled"
    | "cancelled";
  rejectionReason?: string;
  submittedAt?: Date;
  acceptedAt?: Date;
  completedAt?: Date;
};

export interface BrokerAdapter {
  submitOrder(input: BrokerOrderRequest): Promise<BrokerOrderSnapshot>;
  cancelOrder(externalOrderId: string): Promise<BrokerOrderSnapshot>;
  getOrder(externalOrderId: string): Promise<BrokerOrderSnapshot>;
}

export class BrokerUnavailableError extends Error {
  statusCode = 503;
}

export function getBrokerAdapter(): BrokerAdapter {
  throw new BrokerUnavailableError(
    "No authorised broker adapter is configured. Sandbox credentials and a broker agreement are required before orders can be submitted.",
  );
}