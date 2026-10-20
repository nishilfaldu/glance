import { getSession } from "../auth/session";
import { charge } from "../payments/charge";

export interface CheckoutRequest {
  token: string;
  cartId: string;
  amountCents: number;
}

export interface CheckoutResponse {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export async function handleCheckout(req: CheckoutRequest): Promise<CheckoutResponse> {
  const session = getSession(req.token);
  if (!session) return { status: 401, body: { error: "unauthorized" } };

  const receipt = await charge(session.userId, req.cartId, req.amountCents);
  return { status: 200, body: { receiptId: receipt.id } };
}
