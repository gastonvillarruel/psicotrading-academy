import { PaymentProvider } from './types';
import { MercadoPagoProvider } from './mercadopago';
import { PayPalProvider } from './paypal';
import { NOWPaymentsProvider } from './nowpayments';

export function getProvider(name: 'mercadopago' | 'paypal' | 'nowpayments' | 'stripe'): PaymentProvider {
  switch (name) {
    case 'mercadopago':
      return new MercadoPagoProvider();
    case 'paypal':
      return new PayPalProvider();
    case 'nowpayments':
      return new NOWPaymentsProvider();
    case 'stripe':
      throw new Error('Stripe está desactivado temporalmente.');
    default:
      throw new Error(`Proveedor de pago no soportado: ${name}`);
  }
}
