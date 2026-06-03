import Stripe from 'stripe';
import { PaymentProvider, CheckoutParams, CheckoutResult, WebhookResult } from './types';

export class StripeProvider implements PaymentProvider {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16' as any, // Especificar versión compatible
  });

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Stripe Secret Key no configurada.');
    }

    const domain = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    try {
      // Crear sesión de Stripe Checkout
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'ars',
              product_data: {
                name: params.title,
                description: params.description,
              },
              unit_amount: Math.round(params.amount * 100), // Stripe recibe centavos
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${domain}/mi-campus?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${domain}/campus?payment=failure`,
        // Guardamos metadatos relevantes
        metadata: {
          purchaseId: params.purchaseId,
          userId: params.userId,
          itemId: params.itemId,
          type: params.type,
          plan: params.plan || null,
        },
        payment_intent_data: {
          metadata: {
            purchaseId: params.purchaseId,
          },
        },
      });

      if (!session.url) {
        throw new Error('No se pudo generar la URL de Stripe Checkout');
      }

      return {
        url: session.url,
      };
    } catch (error: any) {
      console.error('Error en Stripe createCheckout:', error);
      throw new Error(`Error en Stripe: ${error.message}`);
    }
  }

  async handleWebhook(req: Request): Promise<WebhookResult> {
    const sig = req.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return { success: false, error: 'Falta stripe-signature o webhook secret' };
    }

    try {
      // Leer raw body necesario para la validación de firmas de Stripe
      const rawBody = await req.text();
      const event = this.stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

      let purchaseId: string | undefined;
      let paymentId: string | undefined;
      let paymentStatus: 'pending' | 'approved' | 'failed' | 'rejected' | 'cancelled' | 'expired' | 'refunded' = 'pending';

      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          purchaseId = paymentIntent.metadata.purchaseId;
          paymentId = paymentIntent.id;
          paymentStatus = 'approved';
          break;
        }
        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          purchaseId = paymentIntent.metadata.purchaseId;
          paymentId = paymentIntent.id;
          paymentStatus = 'failed';
          break;
        }
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          purchaseId = session.metadata?.purchaseId;
          paymentId = session.payment_intent as string || session.id;
          paymentStatus = 'approved';
          break;
        }
        default:
          return { success: false, error: `Evento no manejado: ${event.type}` };
      }

      if (!purchaseId) {
        return { success: false, error: 'Falta purchaseId en los metadatos de Stripe' };
      }

      return {
        success: true,
        purchaseId,
        paymentId,
        status: paymentStatus,
      };
    } catch (error: any) {
      console.error('Error al manejar Webhook de Stripe:', error);
      return { success: false, error: error.message };
    }
  }
}
