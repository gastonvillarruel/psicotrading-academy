import { PaymentProvider, CheckoutParams, CheckoutResult, WebhookResult } from './types';

export class PayPalProvider implements PaymentProvider {
  private clientId = process.env.PAYPAL_CLIENT_ID || '';
  private clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
  private env = process.env.PAYPAL_ENV || 'sandbox';

  private getApiUrl(path: string): string {
    const baseUrl = this.env === 'live' 
      ? 'https://api-m.paypal.com' 
      : 'https://api-m.sandbox.paypal.com';
    return `${baseUrl}${path}`;
  }

  private async getAccessToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('PayPal Client ID o Secret no configurado.');
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response = await fetch(this.getApiUrl('/v1/oauth2/token'), {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error al obtener Access Token de PayPal: ${errText}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    
    try {
      const accessToken = await this.getAccessToken();

      const response = await fetch(this.getApiUrl('/v2/checkout/orders'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              amount: {
                currency_code: 'USD',
                value: params.amount.toFixed(2),
              },
              custom_id: params.purchaseId,
              description: params.description,
            },
          ],
          application_context: {
            brand_name: 'PSICOEMOTRADING',
            landing_page: 'NO_PREFERENCE',
            user_action: 'PAY_NOW',
            return_url: `${appUrl}/checkout/success?provider=paypal&purchaseId=${params.purchaseId}`,
            cancel_url: `${appUrl}/checkout/failure?provider=paypal&purchaseId=${params.purchaseId}`,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al crear orden en PayPal');
      }

      const order = await response.json();
      
      // Encontrar el link del tipo "approve"
      const approveLink = order.links.find((l: any) => l.rel === 'approve');
      if (!approveLink) {
        throw new Error('No se encontró link de aprobación en PayPal');
      }

      return {
        url: approveLink.href,
        providerPaymentId: order.id,
      };
    } catch (error: any) {
      console.error('Error en PayPal createCheckout:', error);
      throw new Error(`Error en PayPal: ${error.message}`);
    }
  }

  async captureOrder(orderId: string): Promise<any> {
    const accessToken = await this.getAccessToken();
    
    const response = await fetch(this.getApiUrl(`/v2/checkout/orders/${orderId}/capture`), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Error de PayPal capture response: ${errText}`);
      throw new Error(`Error al capturar orden de PayPal: ${errText}`);
    }

    return await response.json();
  }

  async verifyWebhookSignature(req: Request): Promise<boolean> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      console.error('Falta PAYPAL_WEBHOOK_ID para verificar firmas.');
      return false;
    }

    try {
      const transmissionId = req.headers.get('paypal-transmission-id');
      const transmissionTime = req.headers.get('paypal-transmission-time');
      const transmissionSig = req.headers.get('paypal-transmission-sig');
      const certUrl = req.headers.get('paypal-cert-url');
      const authAlgo = req.headers.get('paypal-auth-algo');

      if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
        return false;
      }

      // PayPal requiere el raw body de la petición para verificar la firma
      const rawBody = await req.clone().text();
      const bodyJson = JSON.parse(rawBody);

      const accessToken = await this.getAccessToken();
      const response = await fetch(this.getApiUrl('/v1/notifications/verify-webhook-signature'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transmission_id: transmissionId,
          transmission_time: transmissionTime,
          cert_url: certUrl,
          auth_algo: authAlgo,
          transmission_sig: transmissionSig,
          webhook_id: webhookId,
          webhook_event: bodyJson,
        }),
      });

      if (!response.ok) return false;
      const data = await response.json();
      return data.verification_status === 'SUCCESS';
    } catch (err) {
      console.error('Error al validar firma de PayPal:', err);
      return false;
    }
  }

  async handleWebhook(req: Request): Promise<WebhookResult> {
    try {
      const isValid = await this.verifyWebhookSignature(req);
      if (!isValid) {
        return { success: false, error: 'Firma de webhook de PayPal no válida.' };
      }

      const body = await req.json();
      const eventType = body.event_type;

      if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
        return { success: false, error: `Evento de PayPal no soportado: ${eventType}` };
      }

      const resource = body.resource;
      const purchaseId = resource.custom_id;
      const paymentId = resource.id; // Capture ID
      const status = resource.status; // COMPLETED, DENIED, etc.

      if (!purchaseId) {
        return { success: false, error: 'Falta custom_id en el recurso de PayPal.' };
      }

      let paymentStatus: 'approved' | 'failed' | 'pending' = 'pending';
      if (status === 'COMPLETED') {
        paymentStatus = 'approved';
      } else if (['DECLINED', 'FAILED'].includes(status)) {
        paymentStatus = 'failed';
      }

      return {
        success: true,
        purchaseId,
        paymentId,
        status: paymentStatus,
      };
    } catch (error: any) {
      console.error('Error al manejar webhook de PayPal:', error);
      return { success: false, error: error.message };
    }
  }
}
