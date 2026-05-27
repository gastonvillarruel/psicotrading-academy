import { PaymentProvider, CheckoutParams, CheckoutResult, WebhookResult } from './types';

export class MercadoPagoProvider implements PaymentProvider {
  private accessToken = process.env.MP_ACCESS_TOKEN || '';

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    if (!this.accessToken) {
      throw new Error('MercadoPago Access Token no configurado.');
    }

    // URL de retorno y notificación
    const domain = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    
    // Si estamos en localhost, la notification_url de MP fallará en modo producción de prueba a menos que se use ngrok.
    // De todos modos, pasamos la URL del webhook local o la URL configurada.
    const notificationUrl = `${domain}/api/webhooks/mercadopago`;

    try {
      const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              id: params.itemId,
              title: params.title,
              description: params.description,
              quantity: 1,
              unit_price: params.amount,
              currency_id: 'ARS',
            },
          ],
          payer: {
            email: params.userEmail,
          },
          back_urls: {
            success: `${domain}/mi-campus?payment=success`,
            failure: `${domain}/campus?payment=failure`,
            pending: `${domain}/mi-campus?payment=pending`,
          },
          auto_return: 'approved',
          notification_url: notificationUrl,
          external_reference: params.purchaseId, // ID de compra guardado en nuestra base de datos
          metadata: {
            purchase_id: params.purchaseId,
            item_id: params.itemId,
            type: params.type,
            plan: params.plan || null,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al crear preferencia en MercadoPago');
      }

      const data = await response.json();
      
      // La URL de redirección es init_point o sandbox_init_point según el entorno.
      // Usaremos init_point que sirve para ambos.
      return {
        url: data.init_point,
      };
    } catch (error: any) {
      console.error('Error en MercadoPago createCheckout:', error);
      throw new Error(`Error en MercadoPago: ${error.message}`);
    }
  }

  async handleWebhook(req: Request): Promise<WebhookResult> {
    try {
      const url = new URL(req.url);
      
      // MercadoPago envía la info de notificación en query params o body
      // Caso 1: Notificación de IPN / Pago: ?type=payment&data.id=12345
      // Caso 2: Notificación tradicional: ?topic=payment&id=12345
      const type = url.searchParams.get('type') || url.searchParams.get('topic');
      const resourceId = url.searchParams.get('data.id') || url.searchParams.get('id');

      // Intentar leer el body en caso de que lo mande allí
      let bodyData: any = {};
      try {
        bodyData = await req.json();
      } catch (e) {
        // Ignorar si no hay JSON body
      }

      const paymentId = resourceId || (bodyData?.data?.id) || (bodyData?.id);
      const actionType = type || (bodyData?.type) || (bodyData?.action);

      if (actionType !== 'payment' || !paymentId) {
        // Retornar éxito silencioso si no es una acción de pago (ej. merchant_order)
        return { success: false, error: 'Acción no soportada o ID faltante' };
      }

      // Consultar el pago en MercadoPago
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Error al consultar el pago ${paymentId} en MercadoPago`);
      }

      const paymentData = await response.json();
      const status = paymentData.status; // approved, pending, rejected, etc.
      const purchaseId = paymentData.external_reference; // ID de compra

      if (!purchaseId) {
        return { success: false, error: 'Falta external_reference en el pago de MercadoPago' };
      }

      let paymentStatus: 'COMPLETED' | 'FAILED' | 'PENDING' = 'PENDING';
      if (status === 'approved') {
        paymentStatus = 'COMPLETED';
      } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(status)) {
        paymentStatus = 'FAILED';
      }

      return {
        success: true,
        purchaseId,
        paymentId: String(paymentId),
        status: paymentStatus,
      };
    } catch (error: any) {
      console.error('Error al manejar Webhook de MercadoPago:', error);
      return { success: false, error: error.message };
    }
  }
}
