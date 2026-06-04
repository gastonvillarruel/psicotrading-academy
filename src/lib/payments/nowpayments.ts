import * as crypto from 'crypto';
import { PaymentProvider, CheckoutParams, CheckoutResult, WebhookResult } from './types';

export class NOWPaymentsProvider implements PaymentProvider {
  private apiKey = process.env.NOWPAYMENTS_API_KEY || '';
  private ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || '';
  private env = process.env.NOWPAYMENTS_ENV || 'live';

  private getApiUrl(path: string): string {
    const baseUrl = this.env === 'sandbox'
      ? 'https://api-sandbox.nowpayments.io/v1'
      : 'https://api.nowpayments.io/v1';
    return `${baseUrl}${path}`;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    if (!this.apiKey) {
      throw new Error('NOWPayments API Key no configurada.');
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

    try {
      const response = await fetch(this.getApiUrl('/invoice'), {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_amount: params.amount,
          price_currency: 'usd', // Moneda de referencia
          pay_currency: params.payCurrency || 'usdttrc20',
          ipn_callback_url: `${appUrl}/api/webhooks/nowpayments`,
          order_id: params.purchaseId,
          order_description: params.title,
          success_url: `${appUrl}/checkout/success?provider=nowpayments&purchaseId=${params.purchaseId}`,
          cancel_url: `${appUrl}/checkout/failure?provider=nowpayments&purchaseId=${params.purchaseId}`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al crear invoice en NOWPayments');
      }

      const data = await response.json();
      
      if (!data.invoice_url) {
        throw new Error('No se recibió la URL de la factura de NOWPayments');
      }

      return {
        url: data.invoice_url,
      };
    } catch (error: any) {
      console.error('Error en NOWPayments createCheckout:', error);
      throw new Error(`Error en NOWPayments: ${error.message}`);
    }
  }

  async verifyWebhookSignature(headers: Headers, rawBody: string): Promise<boolean> {
    if (!this.ipnSecret) {
      console.error('NOWPayments IPN Secret no configurado.');
      return false;
    }

    const receivedSig = headers.get('x-nowpayments-sig');
    if (!receivedSig) return false;

    try {
      // Método 1: Firma utilizando el body con llaves ordenadas alfabéticamente
      const parsedBody = JSON.parse(rawBody);
      const sortedKeys = Object.keys(parsedBody).sort();
      const sortedObj: any = {};
      for (const key of sortedKeys) {
        sortedObj[key] = parsedBody[key];
      }
      
      const sortedStr = JSON.stringify(sortedObj);
      const hmac1 = crypto.createHmac('sha512', this.ipnSecret);
      hmac1.update(sortedStr);
      const sig1 = hmac1.digest('hex');

      if (sig1.toLowerCase() === receivedSig.toLowerCase()) {
        return true;
      }

      // Método 2: Firma directamente sobre el raw body recibido
      const hmac2 = crypto.createHmac('sha512', this.ipnSecret);
      hmac2.update(rawBody);
      const sig2 = hmac2.digest('hex');

      if (sig2.toLowerCase() === receivedSig.toLowerCase()) {
        return true;
      }

      return false;
    } catch (err) {
      console.error('Error al verificar firma IPN de NOWPayments:', err);
      return false;
    }
  }

  async handleWebhook(req: Request): Promise<WebhookResult> {
    try {
      const rawBody = await req.clone().text();
      const isValid = await this.verifyWebhookSignature(req.headers, rawBody);
      
      if (!isValid) {
        return { success: false, error: 'Firma de webhook de NOWPayments no válida.' };
      }

      const body = JSON.parse(rawBody);
      const purchaseId = body.order_id;
      const paymentId = body.payment_id;
      const paymentStatus = body.payment_status; // finished, confirmed, failed, expired, etc.

      if (!purchaseId) {
        return { success: false, error: 'Falta order_id en el callback de NOWPayments.' };
      }

      let internalStatus: 'pending' | 'approved' | 'failed' | 'expired' = 'pending';
      
      // Aprobado únicamente con estado "finished"
      if (paymentStatus === 'finished') {
        internalStatus = 'approved';
      } else if (paymentStatus === 'failed') {
        internalStatus = 'failed';
      } else if (paymentStatus === 'expired') {
        internalStatus = 'expired';
      }

      return {
        success: true,
        purchaseId,
        paymentId: String(paymentId),
        status: internalStatus,
      };
    } catch (error: any) {
      console.error('Error al manejar IPN de NOWPayments:', error);
      return { success: false, error: error.message };
    }
  }
}
