import nodemailer from 'nodemailer';

function getTransporter() {
  const host = process.env.EMAIL_SERVER_HOST;
  const port = process.env.EMAIL_SERVER_PORT;
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;

  if (!host || !port || !user || !pass) {
    throw new Error(
      'SMTP no configurado. Definí EMAIL_SERVER_HOST, EMAIL_SERVER_PORT, EMAIL_SERVER_USER y EMAIL_SERVER_PASSWORD en .env'
    );
  }

  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
}

export async function sendVerificationEmail(
  email: string,
  name: string | null,
  token: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const verifyUrl = `${appUrl}/verificar-email?token=${token}`;
  const displayName = name || 'trader';
  const fromAddress = process.env.EMAIL_FROM || 'PSICOEMOTRADING <noreply@psicoemotrading.com>';

  const transporter = getTransporter();

  await transporter.sendMail({
    from: fromAddress,
    to: email,
    subject: 'Confirmá tu cuenta en PsicoEmoTrading',
    html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmá tu cuenta</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.07);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1E40AF 0%,#0F766E 100%);padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.75);">PSICOEMOTRADING</p>
              <h1 style="margin:12px 0 0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;">Confirmá tu cuenta</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1e293b;line-height:1.6;">
                Hola, <strong>${displayName}</strong> 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
                Gracias por registrarte en <strong>PsicoEmoTrading</strong>. Para activar tu cuenta y acceder al campus, hacé clic en el botón de abajo:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${verifyUrl}"
                       style="display:inline-block;background:#1E40AF;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">
                      Confirmar mi email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.6;">
                Si el botón no funciona, copiá y pegá este link en tu navegador:
              </p>
              <p style="margin:0 0 28px;font-size:12px;color:#94a3b8;word-break:break-all;">
                ${verifyUrl}
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;" />
              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
                Este link expira en <strong>24 horas</strong>. Si no creaste una cuenta en PsicoEmoTrading, podés ignorar este email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © ${new Date().getFullYear()} PSICOEMOTRADING · Todos los derechos reservados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    text: `Hola ${displayName},\n\nConfirmá tu cuenta en PsicoEmoTrading haciendo clic en este link:\n${verifyUrl}\n\nEl link expira en 24 horas.\n\nSi no creaste una cuenta, ignorá este email.`,
  });
}
