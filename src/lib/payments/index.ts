import { PaymentProvider } from './types';
import { MercadoPagoProvider } from './mercadopago';
import { StripeProvider } from './stripe';

export function getProvider(name: 'mercadopago' | 'stripe'): PaymentProvider {
  switch (name) {
    case 'mercadopago':
      return new MercadoPagoProvider();
    case 'stripe':
      return new StripeProvider();
    default:
      throw new Error(`Proveedor de pago no soportado: ${name}`);
  }
}
