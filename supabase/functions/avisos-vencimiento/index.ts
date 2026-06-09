// ═══════════════════════════════════════════════════════════════════
//  FUNCIÓN: avisos-vencimiento
//  Envía emails automáticos de aviso cuando una suscripción está
//  próxima a vencer (7 días) o ya venció (período de gracia).
//
//  Se ejecuta:
//    • Automáticamente: todos los días a las 08:00 UTC (Deno.cron)
//    • Manualmente: POST a /functions/v1/avisos-vencimiento
//      con header Authorization: Bearer <SERVICE_ROLE_KEY>
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM_DOMAIN    = Deno.env.get('RESEND_FROM_DOMAIN') ?? 'onboarding@resend.dev';
const WHATSAPP_NUMERO       = Deno.env.get('WHATSAPP_SOPORTE') ?? '593XXXXXXXXX';

const DIAS_ADVERTENCIA = 7;
const DIAS_GRACIA      = 5;

// ── Email helper ─────────────────────────────────────────────────────────────

async function enviarEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY no configurada' };

  const from = RESEND_FROM_DOMAIN.includes('@')
    ? `MAR ERP <${RESEND_FROM_DOMAIN}>`
    : `MAR ERP <noreply@${RESEND_FROM_DOMAIN}>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
  });

  const data = await res.json();
  return res.ok ? { ok: true, id: data.id } : { ok: false, error: data.message ?? JSON.stringify(data) };
}

// ── Templates HTML ────────────────────────────────────────────────────────────

function htmlPorVencer(empresa: any, dias: number): string {
  const waLink = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(`Hola, quiero renovar la suscripción de ${empresa.nombre}`)}`;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#FB923C,#F97316);padding:32px 40px;text-align:center">
      <p style="margin:0;color:#fff;font-size:28px;font-weight:900;letter-spacing:-1px">
        🍳 MAR ERP
      </p>
      <p style="margin:8px 0 0;color:rgba(255,255,255,.85);font-size:14px">Sistema de gestión para restaurantes</p>
    </div>

    <!-- Body -->
    <div style="padding:36px 40px">
      <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:20px 24px;margin-bottom:24px;display:flex;align-items:center;gap:16px">
        <span style="font-size:32px">⚠️</span>
        <div>
          <p style="margin:0;font-size:18px;font-weight:700;color:#C2410C">Tu suscripción vence en ${dias} día${dias === 1 ? '' : 's'}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#9A3412">Renueva ahora para no perder el acceso al sistema</p>
        </div>
      </div>

      <p style="color:#374151;font-size:16px;line-height:1.6">
        Hola <strong>${empresa.nombre}</strong>,
      </p>
      <p style="color:#6B7280;font-size:15px;line-height:1.6">
        Tu suscripción a <strong>MAR ERP</strong> (plan <strong>${empresa.plan_tipo ?? 'actual'}</strong>)
        vencerá el <strong>${new Date(empresa.fecha_expiracion).toLocaleDateString('es-EC', { dateStyle: 'long' })}</strong>.
      </p>
      <p style="color:#6B7280;font-size:15px;line-height:1.6">
        Para renovar, realiza una transferencia y envíanos el comprobante por WhatsApp.
        Extenderemos tu acceso de inmediato.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:32px 0">
        <a href="${waLink}"
           style="display:inline-block;background:linear-gradient(135deg,#22C55E,#16A34A);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px">
          💬 Renovar por WhatsApp
        </a>
      </div>

      <div style="background:#F9FAFB;border-radius:10px;padding:16px 20px;margin-top:8px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151">Métodos de pago aceptados:</p>
        <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.7">
          💳 Transferencia bancaria &nbsp;·&nbsp; 💵 Efectivo &nbsp;·&nbsp; 📱 PayPhone &nbsp;·&nbsp; 💳 Tarjeta de crédito
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 40px;background:#F9FAFB;border-top:1px solid #E5E7EB;text-align:center">
      <p style="margin:0;font-size:12px;color:#9CA3AF">
        MAR ERP — Sistema de gestión para restaurantes del Ecuador<br>
        Si tienes preguntas, responde a este correo o escríbenos por WhatsApp.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function htmlEnGracia(empresa: any, diasGracia: number): string {
  const waLink = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(`Hola, necesito renovar urgente la suscripción de ${empresa.nombre}`)}`;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#EF4444,#DC2626);padding:32px 40px;text-align:center">
      <p style="margin:0;color:#fff;font-size:28px;font-weight:900;letter-spacing:-1px">🍳 MAR ERP</p>
      <p style="margin:8px 0 0;color:rgba(255,255,255,.85);font-size:14px">Sistema de gestión para restaurantes</p>
    </div>

    <!-- Body -->
    <div style="padding:36px 40px">
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:20px 24px;margin-bottom:24px">
        <p style="margin:0;font-size:19px;font-weight:700;color:#991B1B">🚨 Suscripción vencida — Período de gracia</p>
        <p style="margin:6px 0 0;font-size:14px;color:#B91C1C">
          Te quedan <strong>${diasGracia} día${diasGracia === 1 ? '' : 's'}</strong> de acceso antes de la suspensión
        </p>
      </div>

      <p style="color:#374151;font-size:16px;line-height:1.6">
        Hola <strong>${empresa.nombre}</strong>,
      </p>
      <p style="color:#6B7280;font-size:15px;line-height:1.6">
        Tu suscripción a <strong>MAR ERP</strong> venció. Estás en el <strong>período de gracia de ${DIAS_GRACIA} días</strong> —
        puedes seguir usando el sistema, pero en <strong>${diasGracia} día${diasGracia === 1 ? '' : 's'}</strong>
        la cuenta quedará suspendida automáticamente.
      </p>
      <p style="color:#6B7280;font-size:15px;line-height:1.6">
        Renueva ahora enviando tu comprobante de pago por WhatsApp y reactivamos tu acceso de inmediato.
      </p>

      <!-- CTA urgente -->
      <div style="text-align:center;margin:32px 0">
        <a href="${waLink}"
           style="display:inline-block;background:linear-gradient(135deg,#EF4444,#DC2626);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px">
          🚨 Renovar ahora — evitar suspensión
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 40px;background:#F9FAFB;border-top:1px solid #E5E7EB;text-align:center">
      <p style="margin:0;font-size:12px;color:#9CA3AF">
        MAR ERP — Sistema de gestión para restaurantes del Ecuador
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Lógica principal ──────────────────────────────────────────────────────────

interface ResultadoAviso {
  empresa_id: string;
  nombre: string;
  email: string;
  tipo: 'por_vencer' | 'en_gracia';
  dias: number;
  enviado: boolean;
  error?: string;
}

async function procesarAvisos(): Promise<{ procesadas: number; enviados: number; errores: number; detalle: ResultadoAviso[] }> {
  const db  = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();

  // Empresas que necesitan aviso (excluir super_admin/demo)
  const { data: empresas, error } = await db
    .from('empresas')
    .select('id, nombre, email, plan_tipo, fecha_expiracion, aviso_vencimiento_enviado, estado')
    .neq('ruc_nit', '0000000000001')  // excluir cuenta demo/superadmin
    .eq('estado', 'activo')
    .not('fecha_expiracion', 'is', null);

  if (error || !empresas) {
    console.error('❌ Error al leer empresas:', error?.message);
    return { procesadas: 0, enviados: 0, errores: 1, detalle: [] };
  }

  const detalle: ResultadoAviso[] = [];
  let enviados = 0;
  let errores  = 0;

  for (const emp of empresas) {
    const expira = new Date(emp.fecha_expiracion);
    const diffMs = expira.getTime() - now.getTime();
    const dias   = Math.ceil(diffMs / 86_400_000); // días restantes (negativo = ya venció)

    // ── Caso 1: por_vencer (entre 0 y 7 días restantes)
    if (dias > 0 && dias <= DIAS_ADVERTENCIA) {
      // Solo enviar si no se ha enviado aviso aún
      if (emp.aviso_vencimiento_enviado) continue;

      const result = await enviarEmail({
        to:      emp.email,
        subject: `⚠️ Tu suscripción MAR ERP vence en ${dias} día${dias === 1 ? '' : 's'}`,
        html:    htmlPorVencer(emp, dias),
      });

      detalle.push({ empresa_id: emp.id, nombre: emp.nombre, email: emp.email, tipo: 'por_vencer', dias, enviado: result.ok, error: result.error });

      if (result.ok) {
        enviados++;
        await db.from('empresas').update({ aviso_vencimiento_enviado: true }).eq('id', emp.id);
        console.log(`✅ Aviso por_vencer → ${emp.nombre} (${emp.email}) — vence en ${dias}d`);
      } else {
        errores++;
        console.error(`❌ Error enviando a ${emp.email}:`, result.error);
      }
    }

    // ── Caso 2: en_gracia (venció hace 0-5 días)
    else if (dias <= 0 && dias > -DIAS_GRACIA) {
      const diasGracia = DIAS_GRACIA + dias; // días restantes de gracia
      // Enviar aviso de gracia una sola vez (reutilizamos el flag, ya que se resetea con cada pago)
      if (emp.aviso_vencimiento_enviado) continue;

      const result = await enviarEmail({
        to:      emp.email,
        subject: `🚨 MAR ERP — Suscripción vencida, ${diasGracia} día${diasGracia === 1 ? '' : 's'} para suspensión`,
        html:    htmlEnGracia(emp, diasGracia),
      });

      detalle.push({ empresa_id: emp.id, nombre: emp.nombre, email: emp.email, tipo: 'en_gracia', dias: diasGracia, enviado: result.ok, error: result.error });

      if (result.ok) {
        enviados++;
        await db.from('empresas').update({ aviso_vencimiento_enviado: true }).eq('id', emp.id);
        console.log(`✅ Aviso en_gracia → ${emp.nombre} (${emp.email}) — ${diasGracia}d de gracia restantes`);
      } else {
        errores++;
        console.error(`❌ Error enviando a ${emp.email}:`, result.error);
      }
    }
    // Activa (>7 días) o vencida (>5 días) → no hacer nada
  }

  return { procesadas: empresas.length, enviados, errores, detalle };
}

// ── Cron diario — 08:00 UTC ───────────────────────────────────────────────────
Deno.cron('avisos-vencimiento-diario', '0 8 * * *', async () => {
  console.log('🕗 Cron avisos-vencimiento iniciado:', new Date().toISOString());
  const resultado = await procesarAvisos();
  console.log(`✅ Cron finalizado — enviados: ${resultado.enviados}, errores: ${resultado.errores}, empresas procesadas: ${resultado.procesadas}`);
});

// ── HTTP handler — trigger manual ────────────────────────────────────────────
Deno.serve(async (req) => {
  // Solo POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido. Usa POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verificar autorización (service role key o token de admin)
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (token !== SERVICE_ROLE_KEY) {
    // Verificar si es un super_admin via X-User-Token
    const userToken = req.headers.get('X-User-Token') ?? '';
    if (!userToken) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Verificar rol en DB
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: usuario } = await db
      .from('usuarios')
      .select('rol')
      .eq('auth_id', (await db.auth.getUser(userToken))?.data?.user?.id ?? '')
      .maybeSingle();
    if (usuario?.rol !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Solo super_admin puede ejecutar esta función' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    console.log('▶ Trigger manual avisos-vencimiento:', new Date().toISOString());
    const resultado = await procesarAvisos();
    return new Response(JSON.stringify({ ok: true, ...resultado }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('❌ Error en avisos-vencimiento:', e.message);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
