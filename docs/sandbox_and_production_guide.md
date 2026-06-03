# Guía de Configuración de Sandbox y Producción para Pasarelas de Pago

Esta guía detalla los pasos para configurar e integrar los entornos de prueba (sandbox) y producción para **Mercado Pago**, **PayPal** y **NOWPayments** en el campus de PSICOEMOTRADING.

---

## 1. Mercado Pago Developers

### Configuración de Sandbox (Pruebas)
1. **Crear Cuenta / Ingresar**: Entrá a [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/) con tu cuenta de Mercado Libre o Mercado Pago.
2. **Crear Aplicación**:
   - Ve a **"Tus aplicaciones"** y haz clic en **"Crear aplicación"**.
   - Asigna un nombre (ej. `Psicoemotrading - Sandbox`).
   - Elige el tipo de solución: **Checkout Pro**.
   - Completa el formulario de seguridad y crea la app.
3. **Obtener Credenciales de Prueba**:
   - En el menú de la aplicación, ve a **"Credenciales de prueba"**.
   - Copia el **Access Token** de prueba (empieza con `TEST-`).
   - Pégalo en tu `.env` como:
     ```env
     MERCADOPAGO_ACCESS_TOKEN=TEST-XXXXXX-XXXXXX...
     ```
4. **Crear Usuarios de Prueba (Test Users)**:
   - Ve a la sección **"Cuentas de prueba"** en la consola de Developers.
   - Crea un usuario **Vendedor** de prueba (te dará credenciales de prueba) y un usuario **Comprador** de prueba (usará tarjetas de prueba para simular compras).
   - *Nota*: Debes iniciar sesión en Mercado Pago en una ventana de incógnito con tu usuario vendedor de prueba para que los checkouts que generes localmente usen sus credenciales.
5. **Configurar Webhook/IPN**:
   - Ve a **"Notificaciones de IPN"** o **"Webhooks"** en tu panel de la aplicación de Mercado Pago.
   - Configura la URL del webhook de Mercado Pago:
     `https://tu-dominio.ngrok-free.app/api/webhooks/mercadopago`
   - Activa el evento **payment** (o selecciona recibir todas las notificaciones de pagos de IPN).

### Paso a Producción
1. Ve a la sección **"Credenciales de producción"** de tu aplicación en Mercado Pago Developers.
2. Si no lo has hecho, deberás completar el formulario para **"Activar credenciales"** de tu cuenta Mercado Pago de producción (solicitan datos impositivos/identificación).
3. Una vez aprobadas, copia el **Access Token** de producción (empieza con `APP_USR-`).
4. Reemplaza el token en tu `.env` de producción.
5. Cambia la URL del webhook en el portal de Mercado Pago Developers a tu dominio de producción:
   `https://psicoemotrading.com/api/webhooks/mercadopago`

---

## 2. PayPal Developer Sandbox

### Configuración de Sandbox (Pruebas)
1. **Ingresar al Portal**: Ve a [PayPal Developer Portal](https://developer.paypal.com/) e inicia sesión con tu cuenta personal o comercial de PayPal.
2. **Crear App en Sandbox**:
   - Ve a **"Apps & Credentials"** y asegúrate de que el switch superior esté en **Sandbox**.
   - Haz clic en **"Create App"**.
   - Nombre de la App: `Psicoemotrading Sandbox`.
   - Selecciona el tipo: **Platform** / **Merchant**.
   - Asóciala a tu cuenta Sandbox comercial de prueba (creada por defecto).
3. **Copiar Credenciales**:
   - Copia el **Client ID** y el **Secret Key**.
   - Configura las variables en tu `.env`:
     ```env
     PAYPAL_CLIENT_ID=AT_XXXXXX
     PAYPAL_CLIENT_SECRET=EK_XXXXXX
     PAYPAL_ENV=sandbox
     NEXT_PUBLIC_PAYPAL_CLIENT_ID=AT_XXXXXX
     ```
4. **Configurar Webhook**:
   - En la página de la misma App que acabas de crear, haz clic en **"Add Webhook"** en la parte inferior.
   - Pega tu URL de webhook local expuesta con ngrok:
     `https://tu-dominio.ngrok-free.app/api/webhooks/paypal`
   - Selecciona el evento: `PAYMENT.CAPTURE.COMPLETED`.
   - Haz clic en Guardar.
   - Copia el **Webhook ID** generado por PayPal y agrégalo en tu `.env` como:
     ```env
     PAYPAL_WEBHOOK_ID=WH-XXXXXX
     ```
5. **Tarjetas de Prueba**:
   - En **"Testing" -> "Sandbox Accounts"** verás tus cuentas de prueba. Usa la cuenta de tipo `Personal` (comprador) para ingresar a PayPal al simular el flujo y pagar.

### Paso a Producción
1. En el portal de PayPal Developer, cambia el switch superior a **Live**.
2. Haz clic en **"Create App"** en el panel Live y crea la aplicación (ej. `Psicoemotrading Live`).
3. Copia el **Client ID** y el **Secret** de producción y agrégalos a tu `.env` de producción:
   - Configura `PAYPAL_ENV=live`.
4. Añade el webhook en tu aplicación Live de PayPal con la URL de producción:
   `https://psicoemotrading.com/api/webhooks/paypal`
5. Copia el nuevo **Webhook ID** de producción en tu archivo `.env`.

---

## 3. NOWPayments (USDT / Cripto)

### Configuración de Sandbox (Pruebas)
1. **Crear Cuenta**: Regístrate o inicia sesión en [NOWPayments](https://nowpayments.io/).
2. **Obtener API Key de Sandbox**:
   - En el panel de control, ve a **"Store Settings"**.
   - Desplázate hacia abajo hasta la sección de **"API Keys"**.
   - Copia la **API Key**.
   - Configura tu `.env`:
     ```env
     NOWPAYMENTS_API_KEY=XXXXXX-XXXXXX-XXXXXX
     ```
3. **Obtener IPN Secret**:
   - En **"Store Settings"**, ve a la sección **"Instant Payment Notifications (IPN)"**.
   - Genera tu **IPN Secret** y cópialo.
   - Pégalo en tu `.env` como:
     ```env
     NOWPAYMENTS_IPN_SECRET=XXXXXX
     ```
4. **Configurar Webhook**:
   - En la misma sección de IPN de NOWPayments, configura la URL de IPN:
     `https://tu-dominio.ngrok-free.app/api/webhooks/nowpayments`
5. **Prueba de Pago (IPN Sandbox)**:
   - NOWPayments ofrece una herramienta para simular notificaciones IPN. Ve a **"Tools" -> "IPN Sandbox"** en el panel lateral de NOWPayments.
   - Selecciona tu factura o ingresa los datos de prueba (`order_id` con el ID de tu compra en la base de datos y `payment_status: finished`).
   - Envía el test y verifica que el estado de la compra cambie a `approved` en la BD y se cree el `Enrollment`.

### Paso a Producción
1. Utiliza la misma cuenta de NOWPayments.
2. Para procesar cobros reales en producción, deberás ir a **"Store Settings" -> "Outcome Wallet"** y agregar la dirección de tu billetera (wallet) de criptomonedas (ej. dirección USDT TRC-20) donde recibirás los fondos.
3. Las variables `NOWPAYMENTS_API_KEY` y `NOWPAYMENTS_IPN_SECRET` ya son válidas y operativas. Solo asegúrate de actualizar la URL de IPN en NOWPayments con tu dominio web de producción:
   `https://psicoemotrading.com/api/webhooks/nowpayments`
