/**
 * Servicio de envío de emails con XML y PDF de facturas electrónicas
 * Utiliza la API de Supabase Edge Functions para enviar emails
 */

export interface EmailFactura {
  destinatario: string;
  numero_factura: string;
  razon_social: string;
  total: number;
  xml_base64: string;
  pdf_base64?: string;
}

/**
 * Enviar factura por email con XML y PDF adjuntos
 */
export async function enviarFacturaPorEmail(
  email: EmailFactura,
  token: string,
  projectId: string,
  publicAnonKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('📧 Enviando factura por email a:', email.destinatario);
    
    if (!validarEmail(email.destinatario)) {
      throw new Error('Email inválido');
    }
    
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/server/facturacion/enviar-email`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(email),
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Email enviado exitosamente');
      return { success: true };
    } else {
      const error = await response.json();
      console.error('❌ Error enviando email:', error);
      return { 
        success: false, 
        error: error.error || 'Error enviando email' 
      };
    }
  } catch (error: any) {
    console.error('❌ Error de red enviando email:', error);
    return { 
      success: false, 
      error: error.message || 'Error de conexión' 
    };
  }
}

/**
 * Enviar email de notificación de error al procesar factura
 */
export async function enviarNotificacionError(
  destinatario: string,
  numeroFactura: string,
  error: string,
  token: string,
  projectId: string,
  publicAnonKey: string
): Promise<void> {
  try {
    await fetch(
      `https://${projectId}.supabase.co/functions/v1/server/facturacion/notificar-error`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          destinatario,
          numero_factura: numeroFactura,
          error
        }),
      }
    );
  } catch (err) {
    console.error('❌ Error enviando notificación:', err);
  }
}

/**
 * Validar formato de email
 */
function validarEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generar HTML del email con diseño profesional
 */
export function generarHTMLEmail(
  numeroFactura: string,
  razonSocial: string,
  total: number,
  emisor: string
): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura Electrónica ${numeroFactura}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f4f4f4;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #0A1A2F 0%, #1e64a7 100%);
      color: #ffffff;
      padding: 20px;
      border-radius: 8px 8px 0 0;
      margin: -30px -30px 30px -30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .header p {
      margin: 10px 0 0 0;
      opacity: 0.9;
    }
    .content {
      margin: 20px 0;
    }
    .info-box {
      background-color: #f8f9fa;
      border-left: 4px solid #00E5FF;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }
    .info-box h3 {
      margin-top: 0;
      color: #0A1A2F;
    }
    .total {
      background-color: #0A1A2F;
      color: #00E5FF;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      font-size: 28px;
      font-weight: bold;
      margin: 20px 0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #e9ecef;
      text-align: center;
      color: #6c757d;
      font-size: 12px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background: linear-gradient(135deg, #00E5FF 0%, #1e64a7 100%);
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      margin: 10px 5px;
      font-weight: bold;
    }
    .attachments {
      background-color: #e7f3ff;
      border: 1px solid #b3d9ff;
      padding: 15px;
      border-radius: 6px;
      margin: 20px 0;
    }
    .attachments ul {
      margin: 10px 0;
      padding-left: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📄 Factura Electrónica</h1>
      <p>Comprobante autorizado por el SRI</p>
    </div>
    
    <div class="content">
      <p>Estimado/a <strong>${razonSocial}</strong>,</p>
      
      <p>Se ha generado su factura electrónica con los siguientes detalles:</p>
      
      <div class="info-box">
        <h3>Información de la Factura</h3>
        <p><strong>Número:</strong> ${numeroFactura}</p>
        <p><strong>Emisor:</strong> ${emisor}</p>
        <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-EC', { 
          dateStyle: 'full', 
          timeStyle: 'short' 
        })}</p>
      </div>
      
      <div class="total">
        TOTAL: $${total.toFixed(2)}
      </div>
      
      <div class="attachments">
        <h3 style="margin-top: 0;">📎 Archivos Adjuntos</h3>
        <p>Esta factura incluye los siguientes archivos adjuntos:</p>
        <ul>
          <li><strong>factura_${numeroFactura}.xml</strong> - Comprobante electrónico firmado</li>
          <li><strong>factura_${numeroFactura}.pdf</strong> - Representación impresa (RIDE)</li>
        </ul>
        <p style="margin-bottom: 0; font-size: 12px; color: #6c757d;">
          <em>Los archivos XML y PDF tienen validez legal según la normativa del SRI.</em>
        </p>
      </div>
      
      <p style="margin-top: 30px;">
        <strong>Importante:</strong> Guarde estos archivos para sus registros contables. 
        El archivo XML es el comprobante electrónico oficial autorizado por el Servicio de Rentas Internas.
      </p>
    </div>
    
    <div class="footer">
      <p>
        <strong>M.A.R - Sistema de Facturación Electrónica</strong><br>
        Este es un mensaje automático, por favor no responder.<br>
        © ${new Date().getFullYear()} - Sistema de Gestión Empresarial
      </p>
    </div>
  </div>
</body>
</html>
  `;
}
