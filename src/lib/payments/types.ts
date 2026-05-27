export interface CheckoutParams {
  userId: string;
  userEmail: string;
  amount: number;
  title: string;
  description: string;
  itemId: string; // ID del curso o tipo de suscripción
  type: 'COURSE' | 'SUBSCRIPTION';
  plan?: 'MONTHLY' | 'ANNUAL';
  purchaseId: string; // ID del registro Purchase en nuestra BD
}

export interface CheckoutResult {
  url: string;
}

export interface WebhookResult {
  success: boolean;
  purchaseId?: string;
  paymentId?: string;
  status?: 'COMPLETED' | 'FAILED' | 'PENDING';
  error?: string;
}

export interface PaymentProvider {
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  handleWebhook(req: Request): Promise<WebhookResult>;
}
