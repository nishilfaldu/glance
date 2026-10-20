export interface Receipt {
  id: string;
  amountCents: number;
}

// Illustrative stub; the real implementation calls the payment provider.
export async function charge(userId: string, cartId: string, amountCents: number): Promise<Receipt> {
  return { id: `rcpt_${cartId}_${userId}`, amountCents };
}
