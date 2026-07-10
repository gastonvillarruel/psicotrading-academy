import { PaymentMethod } from '@prisma/client';

interface PurchaseLike {
  paymentMethod: PaymentMethod;
  amount: any;
}

export function getEnrollmentOrigin(purchase: PurchaseLike | null | undefined): string {
  if (!purchase) {
    return 'Inscripción Manual';
  }

  const amount = Number(purchase.amount) || 0;
  if (amount === 0) {
    return 'Gratuito / Cupón';
  }

  switch (purchase.paymentMethod) {
    case 'mercadopago':
      return 'Mercado Pago';
    case 'paypal':
      return 'PayPal';
    case 'nowpayments':
      return 'NOWPayments';
    default:
      return purchase.paymentMethod || 'Pago';
  }
}
