import { Hono } from "npm:hono";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";
import { PLANES, tieneAccesoModulo, validarLimite, obtenerPlan, listarPlanes, estadoSuscripcion, DIAS_GRACIA, DIAS_ADVERTENCIA } from "./planes.tsx";
import { setupPOSRoutes } from "./pos-routes.tsx";
import { setupInventarioRoutes } from "./inventario-routes.tsx";
import { setupCocinaRoutes } from "./cocina-routes.tsx";
import { setupDashboardRoutes } from "./dashboard-routes.tsx";
import { setupBIRoutes } from "./bi-routes.tsx";
import { setupRRHHRoutes } from "./rrhh-routes.tsx";
import { setupIngenieriaMenuRoutes } from "./ingenieria-menu-routes.tsx";
import { setupUsuariosRoutes } from "./usuarios-routes.tsx";
import { handleGetConfiguracionFacturacion, handleSaveConfiguracionFacturacion, handleGenerarFactura, handleGetFacturas, handleAutorizarFactura, handleReintentarAutorizacion, handleReenviarEmailFactura, handleTestEmail, handleUploadCertificado, handleGetCertificadoInfo, handleTestSRI, handleEmitirNotaCredito } from "./facturacion-routes.tsx";
import { handleEmitirRetencion, handleGetRetenciones, handleGetRetencion, handleAutorizarRetencion, handleGetXMLRetencion } from "./retenciones-routes.tsx";
import { setupAuditoriaRoutes } from "./auditoria-routes.tsx";
import { setupContabilidadRoutes } from "./contabilidad-routes.tsx";
import { setupMesasRoutes } from "./mesas-routes.tsx";
import { setupCajaRoutes } from "./caja-routes.tsx";
import { setupProduccionRoutes } from "./produccion-routes.tsx";
import { setupTransferenciasRoutes } from "./transferencias-routes.tsx";
import { setupStockBodegaRoutes } from "./stock-bodega-routes.tsx";
import notificacionesApp from "./notificaciones-routes.tsx";
import { registrarAuditoria } from "./audit-helper.tsx";
import { limpiarTodosLosDatos, obtenerProductos, obtenerCategorias, obtenerVentas, obtenerComandas, guardarVenta, obtenerBodegas, obtenerRecetas, ajustarStockBodega, registrarAsientoAutomatico } from "./kv-helpers.tsx";

const app = new Hono();

// Supabase clients
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

// Enable logger
app.use('*', logger(console.log));

// =====================================================
// MIDDLEWARE: Autenticación y Multi-Tenancy
// =====================================================

interface AuthContext {
  userId: string;
  empresaId: string;
  userRole: string;
  user: any;
}

async function authMiddleware(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  const userToken = c.req.header('X-User-Token');
  
  if (!userToken) {
    return c.json({ error: 'Token de usuario requerido en header X-User-Token' }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(userToken);
    
    if (error || !user) {
      return c.json({ error: 'Token de usuario inválido o expirado' }, 401);
    }

    const { data: userData, error: userError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (userError) {
      console.error('Error buscando usuario en middleware:', JSON.stringify(userError));
      return c.json({ error: 'Error al buscar usuario', details: userError.message }, 500);
    }
    if (!userData) {
      return c.json({ error: 'Usuario no encontrado en el sistema' }, 404);
    }

    // Obtener empresa por separado (evita problemas con join embebido en RLS)
    let empresaData: any = null;
    if (userData.empresa_id) {
      const { data: emp } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', userData.empresa_id)
        .maybeSingle();
      empresaData = emp;
    }
    userData.empresas = empresaData;

    // Super admin siempre pasa — no tiene empresa ni plan
    if (userData.rol !== 'super_admin') {
      // 1️⃣ Estado de la empresa (suspendida / inactiva manualmente)
      if (userData.empresas?.estado !== 'activo') {
        return c.json({
          error: 'Empresa suspendida o inactiva. Contacta al administrador.',
          codigo: 'EMPRESA_SUSPENDIDA',
        }, 403);
      }

      // 2️⃣ Verificar fecha de expiración de la suscripción
      const suscripcion = estadoSuscripcion(userData.empresas?.fecha_expiracion ?? null);
      if (suscripcion.estado === 'vencida') {
        // Marcar empresa como suspendida en la DB (best-effort, no falla el request)
        supabase.from('empresas')
          .update({ estado: 'suspendido' })
          .eq('id', userData.empresa_id)
          .then(() => {})
          .catch(() => {});
        return c.json({
          error: suscripcion.mensaje,
          codigo: 'SUSCRIPCION_VENCIDA',
          dias_restantes: 0,
        }, 403);
      }

      // 3️⃣ Adjuntar info de suscripción al contexto (para que endpoints la usen)
      userData.suscripcion = suscripcion;
    }

    // Guardar contexto de autenticación
    c.set('auth', {
      userId: userData.id,
      empresaId: userData.empresa_id || 'super_admin',
      userRole: userData.rol,
      user: userData,
    } as AuthContext);

    await next();
  } catch (error) {
    console.error('Error en autenticación:', error);
    return c.json({ error: 'Error de autenticación' }, 500);
  }
}

// Middleware para super admin
async function superAdminMiddleware(c: any, next: any) {
  const auth: AuthContext = c.get('auth');
  if (auth.userRole !== 'super_admin') {
    return c.json({ error: 'Acceso denegado. Se requiere rol de Super Admin.' }, 403);
  }
  await next();
}

// registrarAuditoria importado desde ./audit-helper.tsx

// =====================================================
// RUTAS: AUTENTICACIÓN
// =====================================================

app.get("/server/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/server/debug/test", (c) => {
  return c.json({
    status: "🟢 Servidor funcionando correctamente",
    timestamp: new Date().toISOString(),
    env: {
      hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
      hasServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      hasAnonKey: !!Deno.env.get('SUPABASE_ANON_KEY')
    }
  });
});

// ── SRI connectivity diagnostic (no auth required) ────────────────────────────
app.get("/server/debug/sri", async (c) => {
  const results: Record<string, any> = { timestamp: new Date().toISOString() };

  // Test reception WSDL
  for (const env of ['pruebas', 'produccion'] as const) {
    const base = env === 'produccion'
      ? 'https://cel.sri.gob.ec'
      : 'https://celcer.sri.gob.ec';
    const wsdlUrl = `${base}/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(wsdlUrl, {
        method: 'GET', headers: { 'Accept': 'text/xml, */*' }, signal: ctrl.signal
      });
      clearTimeout(t);
      const txt = await r.text();
      results[`${env}_recepcion`] = {
        ok: r.ok, status: r.status, bytes: txt.length,
        es_wsdl: txt.includes('wsdl') || txt.includes('definitions') || txt.includes('RecepcionComprobantes'),
        preview: txt.substring(0, 300),
      };
    } catch (e: any) {
      results[`${env}_recepcion`] = { ok: false, error: `${e.name}: ${e.message}` };
    }
  }

  // Test a minimal SOAP call to pruebas (should return DEVUELTA for invalid XML)
  try {
    const testXml = '<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="2.1.0"><infoTributaria><ambiente>1</ambiente><tipoEmision>1</tipoEmision><razonSocial>DIAG</razonSocial><ruc>9999999999999</ruc><claveAcceso>9999999999999999999999999999999999999999999999993</claveAcceso><codDoc>01</codDoc><estab>001</estab><ptoEmi>001</ptoEmi><secuencial>000000001</secuencial><dirMatriz>DIAG</dirMatriz></infoTributaria></factura>';
    const bytes = new TextEncoder().encode(testXml);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const b64 = btoa(bin);
    const soap = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion"><soapenv:Header/><soapenv:Body><ec:validarComprobante><xml>${b64}</xml></ec:validarComprobante></soapenv:Body></soapenv:Envelope>`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch('https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '""' },
      body: soap, signal: ctrl.signal,
    });
    clearTimeout(t);
    const body = await r.text();
    results.soap_test = {
      ok: r.ok, status: r.status,
      sri_respondio: body.length > 0,
      recibida: body.includes('RECIBIDA'),
      devuelta: body.includes('DEVUELTA'),
      preview: body.substring(0, 600),
    };
  } catch (e: any) {
    results.soap_test = { ok: false, error: `${e.name}: ${e.message}` };
  }

  results.diagnostico = results.soap_test?.sri_respondio
    ? '✅ SRI responde correctamente desde Supabase Edge Functions'
    : '❌ SRI no responde desde Supabase — posible bloqueo de red o timeout';

  return c.json(results);
});

app.post("/server/auth/signup", async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const body = await c.req.json();
    const { 
      empresa_nombre, empresa_ruc, empresa_email,
      usuario_nombre, usuario_email, usuario_password,
      plan_tipo = 'basico' 
    } = body;

    if (!empresa_nombre || !empresa_ruc || !usuario_nombre || !usuario_email || !usuario_password) {
      return c.json({ error: 'Faltan campos requeridos' }, 400);
    }

    const { data: plan } = await supabase
      .from('planes')
      .select('id, modulos_incluidos')
      .eq('codigo', plan_tipo)
      .eq('activo', true)
      .maybeSingle();
    if (!plan) {
      return c.json({ error: `Plan '${plan_tipo}' no encontrado o inactivo. Verifique el código de plan.` }, 400);
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: usuario_email,
      password: usuario_password,
      email_confirm: true,
      user_metadata: { nombre: usuario_nombre }
    });

    if (authError) return c.json({ error: 'Error al crear usuario en Auth: ' + authError.message }, 400);

    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .insert({
        nombre: empresa_nombre,
        ruc_nit: empresa_ruc,
        razon_social: empresa_nombre,
        email: empresa_email,
        plan_id: plan?.id,
        plan_tipo,
        estado: 'activo',
        fecha_expiracion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        modulos_activos: plan?.modulos_incluidos || { pos: true, inventario: true, contabilidad: true, rrhh: true, cocina: true, auditoria: true, bi: true }
      })
      .select()
      .single();

    if (empresaError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return c.json({ error: 'Error al crear empresa: ' + empresaError.message }, 400);
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .insert({
        empresa_id: empresa.id,
        auth_user_id: authData.user.id,
        nombre_completo: usuario_nombre,
        email: usuario_email,
        rol: 'admin',
        activo: true
      })
      .select()
      .single();

    if (usuarioError) return c.json({ error: 'Error al crear usuario en DB: ' + usuarioError.message }, 400);

    await supabase.from('bodegas').insert({
      empresa_id: empresa.id,
      codigo: 'PRINCIPAL',
      nombre: 'Bodega Principal',
      tipo: 'principal',
      activa: true
    });

    return c.json({ message: 'Empresa y usuario creados exitosamente', empresa, usuario }, 201);
  } catch (error: any) {
    return c.json({ error: 'Error interno: ' + error.message }, 500);
  }
});

app.post("/server/auth/login", async (c) => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  try {
    const { email, password } = await c.req.json();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return c.json({ error: 'Credenciales inválidas' }, 401);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();

    if (usuarioError) {
      console.error('Error buscando usuario en login:', JSON.stringify(usuarioError));
      return c.json({ error: 'Error al buscar usuario', details: usuarioError.message }, 500);
    }
    if (!usuario) {
      console.error('Usuario no encontrado en public.usuarios para auth_user_id:', data.user.id);
      return c.json({ error: 'Usuario no encontrado' }, 404);
    }

    // Obtener empresa por separado (evita problemas con join embebido)
    let empresaRow: any = null;
    if (usuario.empresa_id) {
      const { data: emp } = await supabaseAdmin
        .from('empresas')
        .select('*')
        .eq('id', usuario.empresa_id)
        .maybeSingle();
      empresaRow = emp;
    }
    usuario.empresas = empresaRow;

    // Super admin no tiene empresa — permitir igual
    if (usuario.rol !== 'super_admin' && usuario.empresas?.estado !== 'activo') {
      return c.json({ error: 'Empresa suspendida o inactiva. Contacte al administrador.' }, 403);
    }

    await supabaseAdmin.from('usuarios').update({ ultima_sesion: new Date().toISOString() }).eq('id', usuario.id);

    // Registrar login en auditoría (solo si tiene empresa)
    if (usuario.empresa_id) {
      await registrarAuditoria(
        usuario.empresa_id, usuario.id, 'login', 'sistema', 'usuarios',
        usuario.id, null, { email: usuario.email },
        c.req.header('x-forwarded-for') || null
      );
    }

    // Obtener bodega asignada al usuario (SQL — tabla usuario_bodegas)
    let bodegaId: string | null = null;
    let bodegaNombre: string | null = null;
    if (usuario.empresa_id) {
      try {
        const { data: ub } = await supabaseAdmin.from('usuario_bodegas')
          .select('bodega_id, bodega_nombre')
          .eq('empresa_id', usuario.empresa_id)
          .eq('usuario_id', usuario.id)
          .maybeSingle();
        if (ub) { bodegaId = ub.bodega_id; bodegaNombre = ub.bodega_nombre; }
      } catch { /* ignora */ }
    }

    return c.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        email: usuario.email,
        rol: usuario.rol,
        bodega_id: bodegaId,
        bodega_nombre: bodegaNombre,
        empresa: usuario.empresas ? {
          ...usuario.empresas,
          plan: usuario.empresas?.plan_tipo || usuario.empresas?.plan || 'basico',
          suscripcion: estadoSuscripcion(usuario.empresas?.fecha_expiracion ?? null),
        } : {
          id: null,
          nombre: 'Sistema MAR',
          plan: 'enterprise',
          plan_tipo: 'enterprise',
          estado: 'activo',
          modulos_activos: { pos: true, inventario: true, contabilidad: true, rrhh: true, cocina: true, auditoria: true, bi: true }
        }
      }
    });
  } catch (error) {
    return c.json({ error: 'Error en login' }, 500);
  }
});

// Verificar si ya existe un super admin
app.get("/server/auth/super-admin-exists", async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { data } = await supabase
      .from('usuarios')
      .select('id')
      .eq('rol', 'super_admin')
      .limit(1)
      .maybeSingle();
    return c.json({ exists: !!data });
  } catch {
    return c.json({ exists: false });
  }
});

// Crear Super Admin (solo si no existe ninguno)
app.post("/server/auth/create-super-admin", async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { nombre, email, password } = await c.req.json();

    if (!nombre || !email || !password) {
      return c.json({ error: 'Nombre, email y contraseña son requeridos' }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    }

    // Verificar si ya existe un super admin
    const { data: existente } = await supabase
      .from('usuarios')
      .select('id')
      .eq('rol', 'super_admin')
      .limit(1)
      .maybeSingle();

    if (existente) {
      return c.json({ error: 'Ya existe un Super Administrador en el sistema' }, 409);
    }

    // Obtener o crear la empresa "Sistema MAR" para el super admin
    let sistemaEmpresaId: string;
    const { data: empresaSistema } = await supabase
      .from('empresas')
      .select('id')
      .eq('ruc_nit', '0000000000001')
      .maybeSingle();

    if (empresaSistema) {
      sistemaEmpresaId = empresaSistema.id;
    } else {
      const { data: nuevaEmpresa, error: empresaError } = await supabase
        .from('empresas')
        .insert({
          nombre: 'Sistema MAR',
          ruc_nit: '0000000000001',
          razon_social: 'Sistema MAR - Super Admin',
          email: email,
          plan_tipo: 'enterprise',
          estado: 'activo',
          fecha_expiracion: new Date(Date.now() + 99 * 365 * 24 * 60 * 60 * 1000).toISOString(),
          modulos_activos: { pos: true, inventario: true, contabilidad: true, rrhh: true, cocina: true, auditoria: true, bi: true }
        })
        .select('id')
        .single();

      if (empresaError || !nuevaEmpresa) {
        return c.json({ error: 'Error al crear empresa del sistema: ' + (empresaError?.message || 'desconocido') }, 400);
      }
      sistemaEmpresaId = nuevaEmpresa.id;
    }

    // Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, rol: 'super_admin' }
    });

    if (authError) {
      return c.json({ error: 'Error al crear usuario: ' + authError.message }, 400);
    }

    // Crear registro en tabla usuarios con la empresa sistema
    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .insert({
        auth_user_id: authData.user.id,
        nombre_completo: nombre,
        email,
        rol: 'super_admin',
        activo: true,
        empresa_id: sistemaEmpresaId
      })
      .select()
      .single();

    if (usuarioError) {
      // Limpiar usuario de auth si falla la BD
      await supabase.auth.admin.deleteUser(authData.user.id);
      return c.json({ error: 'Error al guardar usuario: ' + usuarioError.message }, 400);
    }

    return c.json({ message: 'Super Admin creado exitosamente', usuario }, 201);
  } catch (error: any) {
    return c.json({ error: 'Error interno: ' + error.message }, 500);
  }
});

// =====================================================
// RUTAS: PUNTO DE VENTA (POS)
// (productos manejados por setupPOSRoutes usando KV Store)
// =====================================================

app.post("/server/pos/ventas", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    const body = await c.req.json();
    const numero_ticket = `T${Date.now()}`;
    const venta = await guardarVenta(auth.empresaId, {
      ...body,
      numero_ticket,
      fecha: new Date().toISOString(),
      usuario_id: auth.userId,
      estado: 'completada'
    });

    // ── Descontar ingredientes de recetas por bodega ──────────
    const bodegaId: string = body.bodega_id || '';
    const items: any[] = body.items || [];
    if (bodegaId && items.length > 0) {
      try {
        const [recetas, productos] = await Promise.all([
          obtenerRecetas(auth.empresaId),
          obtenerProductos(auth.empresaId),
        ]);
        for (const item of items) {
          const nombreProducto = (item.nombre || '').toLowerCase().trim();
          const receta = recetas.find((r: any) =>
            (r.nombre || '').toLowerCase().trim() === nombreProducto
          );
          if (receta && (receta.porciones || 0) > 0) {
            const factor = (item.cantidad || 1) / receta.porciones;
            const ingredientes = receta.ingredientes || receta.receta_ingredientes || [];
            for (const ing of ingredientes) {
              let nombreIng: string = ing.nombre_producto || '';
              if (!nombreIng) {
                const pid = String(ing.insumo_id || ing.producto_id || '');
                const prod = productos.find((p: any) => String(p.id) === pid);
                if (prod) nombreIng = prod.nombre;
              }
              if (nombreIng) {
                const delta = -((ing.cantidad || 0) * factor);
                await ajustarStockBodega(auth.empresaId, bodegaId, nombreIng, delta);
              }
            }
          }
        }
      } catch (e) {
        console.error('⚠ Error al descontar ingredientes por venta:', e);
        // No fallar la venta si el descuento de ingredientes falla
      }
    }

    // ── Asiento contable automático de la venta ───────────────
    try {
      const total    = Number(body.total)     || 0;
      const impuesto = Number(body.impuestos) || 0;
      const subtotal = total - impuesto;
      const metodo   = (body.metodo_pago || 'efectivo').toLowerCase();
      const cuentaCaja = '10101'; // Efectivo y Equivalentes al Efectivo (SRI)
      const numTicket  = venta.numero_ticket || numero_ticket;

      if (total > 0) {
        if (impuesto > 0) {
          await registrarAsientoAutomatico(auth.empresaId, {
            tipo: 'venta',
            descripcion: `Venta POS ${numTicket}`,
            referencia: numTicket,
            items: [
              { codigo: cuentaCaja, debito: total,    descripcion: 'Cobro venta' },
              { codigo: '4101',     credito: subtotal, descripcion: 'Venta de Bienes' },
              { codigo: '2010701',  credito: impuesto, descripcion: 'Adm. Tributaria (IVA)' },
            ],
          });
        } else {
          await registrarAsientoAutomatico(auth.empresaId, {
            tipo: 'venta',
            descripcion: `Venta POS ${numTicket}`,
            referencia: numTicket,
            items: [
              { codigo: cuentaCaja, debito: total,  descripcion: 'Cobro venta' },
              { codigo: '4101',     credito: total, descripcion: 'Venta de Bienes (0% IVA)' },
            ],
          });
        }
      }
    } catch (asientoErr: any) {
      // No bloquear la venta si falla el asiento contable, pero sí loguear para auditoría
      console.error('[asiento] Error registrando asiento automático:', asientoErr?.message || asientoErr);
    }

    return c.json({ message: 'Venta creada exitosamente', venta }, 201);
  } catch (error: any) {
    return c.json({ error: 'Error al crear venta', details: error.message }, 500);
  }
});

// =====================================================
// OTROS MÓDULOS Y CONFIGURACIONES
// =====================================================

// ── Middleware de acceso por módulo ───────────────────────────────────────
// Genera un middleware que verifica que el plan de la empresa incluya `modulo`.
// Super admins siempre pasan. Si el plan no incluye el módulo → 403 con info.
function moduloMiddleware(modulo: string) {
  return async (c: any, next: any) => {
    const auth: AuthContext = c.get('auth');
    if (auth.userRole === 'super_admin') return next();
    const planTipo = auth.user?.empresas?.plan_tipo || 'basico';
    if (!tieneAccesoModulo(planTipo, modulo)) {
      const plan = obtenerPlan(planTipo);
      return c.json({
        error: `El módulo "${modulo}" no está incluido en tu plan actual (${plan?.nombre ?? planTipo}).`,
        codigo: 'MODULO_NO_INCLUIDO',
        modulo,
        plan_actual: planTipo,
        upgrade_sugerido: modulo === 'contabilidad' || modulo === 'rrhh' || modulo === 'bi' || modulo === 'auditoria'
          ? 'profesional' : 'restaurante',
      }, 403);
    }
    return next();
  };
}

setupPOSRoutes(app, authMiddleware);
setupInventarioRoutes(app, authMiddleware);
setupCocinaRoutes(app, authMiddleware);          // cocina: incluido en todos los planes
setupMesasRoutes(app, authMiddleware);           // mesas: incluido en todos los planes
setupDashboardRoutes(app, authMiddleware);
setupCajaRoutes(app, authMiddleware);
setupUsuariosRoutes(app, authMiddleware);
setupStockBodegaRoutes(app, authMiddleware);
setupTransferenciasRoutes(app, authMiddleware);
setupProduccionRoutes(app, authMiddleware);
setupIngenieriaMenuRoutes(app, authMiddleware);

// Módulos con restricción de plan.
// app.use(path, auth, moduloCheck) corre ANTES de los route handlers → cuando
// el route handler llama a su propio authMiddleware el contexto ya está seteado.
app.use('/server/bi/*',            authMiddleware, moduloMiddleware('bi'));
app.use('/server/rrhh/*',          authMiddleware, moduloMiddleware('rrhh'));
app.use('/server/auditoria/*',     authMiddleware, moduloMiddleware('auditoria'));
app.use('/server/contabilidad/*',  authMiddleware, moduloMiddleware('contabilidad'));

setupBIRoutes(app, authMiddleware);
setupRRHHRoutes(app, authMiddleware);
setupAuditoriaRoutes(app, authMiddleware);
setupContabilidadRoutes(app, authMiddleware);

// Notificaciones reales
app.use('/server/notificaciones/*', authMiddleware);
app.use('/server/notificaciones', authMiddleware);
app.route('/server/notificaciones', notificacionesApp);

// Inventario: vista de stock (productos con sus datos de inventario)
app.get("/server/inventario", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    const productos = await obtenerProductos(auth.empresaId);
    const bodegas = await obtenerBodegas(auth.empresaId);
    const bodegaPrincipal = bodegas.find((b: any) => b.tipo === 'principal') || bodegas[0] || { nombre: 'Bodega Principal' };

    const inventario = productos.map((p: any) => {
      const stock = p.stock_actual ?? p.stock ?? 0;
      const costo = p.precio_compra || p.precio || 0;
      return {
        ...p,
        stock_actual: stock,
        stock_minimo: p.stock_minimo ?? 0,
        stock_maximo: p.stock_maximo ?? 0,
        costo_promedio: costo,
        // Estructura que espera el frontend
        productos: { nombre: p.nombre, codigo: p.codigo || '' },
        bodegas: { nombre: bodegaPrincipal.nombre || 'Bodega Principal' },
      };
    });
    return c.json({ inventario });
  } catch (error: any) {
    return c.json({ error: 'Error al obtener inventario', details: error.message }, 500);
  }
});

// Estado del sistema para ConfiguracionSistema
app.get("/server/datos/estado", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    const productos = await obtenerProductos(auth.empresaId);
    const categorias = await obtenerCategorias(auth.empresaId);
    const ventas = await obtenerVentas(auth.empresaId);
    const comandas = await obtenerComandas(auth.empresaId);
    const comandasActivas = comandas.filter((c: any) => c.estado !== 'entregada' && c.estado !== 'cancelada');
    return c.json({
      tiene_datos: productos.length > 0,
      estadisticas: {
        productos: productos.length,
        categorias: categorias.length,
        ventas: ventas.length,
        comandas: comandasActivas.length,
      },
      empresa_id: auth.empresaId
    });
  } catch (error: any) {
    return c.json({ error: 'Error al obtener estado', details: error.message }, 500);
  }
});

// Límites del plan de la empresa
app.get("/server/empresa/plan-limites", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const planTipo = auth.user?.empresas?.plan_tipo || 'enterprise';
    const planNombres: Record<string, string> = { basico: 'Básico', profesional: 'Profesional', enterprise: 'Enterprise' };
    const maxUsuarios = planTipo === 'basico' ? 3 : planTipo === 'profesional' ? 10 : 999;
    const maxBodegas = planTipo === 'basico' ? 2 : planTipo === 'profesional' ? 5 : 999;

    // Contar usuarios actuales de la empresa
    const { data: usuariosData } = await supabase
      .from('usuarios')
      .select('id', { count: 'exact' })
      .eq('empresa_id', auth.empresaId);
    const usuariosActuales = usuariosData?.length || 0;

    // Contar bodegas actuales
    const bodegas = await obtenerBodegas(auth.empresaId);
    const bodegasActuales = bodegas.length;

    return c.json({
      plan: {
        nombre: planNombres[planTipo] || 'Enterprise',
        tipo: planTipo,
        max_usuarios: maxUsuarios,
        max_bodegas: maxBodegas,
      },
      uso_actual: {
        usuarios: usuariosActuales,
        bodegas: bodegasActuales,
      },
      limites_alcanzados: {
        usuarios: usuariosActuales >= maxUsuarios,
        bodegas: bodegasActuales >= maxBodegas,
      },
      modulos: auth.user?.empresas?.modulos_activos || { pos: true, inventario: true, contabilidad: true, rrhh: true, cocina: true, auditoria: true, bi: true }
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// =====================================================
// RUTAS: SUPER ADMIN — Gestión global de empresas
// =====================================================

// Listar todas las empresas (excluye la empresa Sistema MAR)
app.get("/server/admin/empresas", authMiddleware, superAdminMiddleware, async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { data: empresas, error } = await supabase
      .from('empresas')
      .select('id, nombre, ruc_nit, email, plan_tipo, estado, fecha_registro, fecha_expiracion, modulos_activos')
      .neq('ruc_nit', '0000000000001')
      .order('fecha_registro', { ascending: false });

    if (error) throw error;
    return c.json({ empresas: empresas || [] });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Estadísticas globales del sistema
app.get("/server/admin/estadisticas", authMiddleware, superAdminMiddleware, async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { data: empresas } = await supabase
      .from('empresas')
      .select('estado, plan_tipo')
      .neq('ruc_nit', '0000000000001');

    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id')
      .neq('rol', 'super_admin');

    const total = empresas?.length || 0;
    const activas = empresas?.filter((e: any) => e.estado === 'activo').length || 0;
    const suspendidas = empresas?.filter((e: any) => e.estado === 'suspendido').length || 0;

    const porPlan: Record<string, number> = {};
    empresas?.forEach((e: any) => {
      porPlan[e.plan_tipo] = (porPlan[e.plan_tipo] || 0) + 1;
    });

    return c.json({
      total_empresas: total,
      empresas_activas: activas,
      empresas_suspendidas: suspendidas,
      total_usuarios: usuarios?.length || 0,
      por_plan: porPlan
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Consolidado: resumen por empresa con bodegas (super_admin)
app.get("/server/admin/consolidado", authMiddleware, superAdminMiddleware, async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { data: empresas } = await supabase
      .from('empresas')
      .select('id, nombre, plan_tipo, estado')
      .neq('ruc_nit', '0000000000001')
      .order('nombre');

    const consolidado = await Promise.all(
      (empresas || []).map(async (emp: any) => {
        const bodegas = await obtenerBodegas(emp.id);
        return {
          empresa_id: emp.id,
          empresa_nombre: emp.nombre,
          plan: emp.plan_tipo,
          estado: emp.estado,
          bodegas: bodegas.map((b: any) => ({
            id: b.id,
            nombre: b.nombre,
            tipo: b.tipo,
            activa: b.activa,
          })),
          total_bodegas: bodegas.length,
        };
      })
    );

    return c.json({ data: consolidado });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Actualizar empresa: estado, plan, fecha_expiracion
app.put("/server/admin/empresas/:id", authMiddleware, superAdminMiddleware, async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const empresaId = c.req.param('id');
    const body = await c.req.json();
    const { estado, plan_tipo, fecha_expiracion, modulos_activos } = body;

    const updates: Record<string, any> = {};
    if (estado) updates.estado = estado;
    if (plan_tipo) {
      updates.plan_tipo = plan_tipo;
      // Tomar módulos directamente de la definición canónica en planes.tsx
      const planDef = obtenerPlan(plan_tipo);
      updates.modulos_activos = modulos_activos || planDef?.modulos_incluidos || PLANES.enterprise.modulos_incluidos;
    }
    if (fecha_expiracion) updates.fecha_expiracion = fecha_expiracion;

    const { data, error } = await supabase
      .from('empresas')
      .update(updates)
      .eq('id', empresaId)
      .select()
      .single();

    if (error) throw error;
    return c.json({ message: 'Empresa actualizada', empresa: data });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ── Planes públicos ────────────────────────────────────────────────────────
app.get("/server/planes", async (c) => {
  return c.json({ planes: listarPlanes() });
});

// ── Mi Plan — info de suscripción de la empresa actual ────────────────────
app.get("/server/mi-plan", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const empresa = auth.user?.empresas;
    const planTipo = empresa?.plan_tipo || 'basico';
    const planDef  = obtenerPlan(planTipo);
    const suscripcion = estadoSuscripcion(empresa?.fecha_expiracion ?? null);

    // Uso actual
    const [productos, usuarios] = await Promise.all([
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('empresa_id', auth.empresaId).eq('activo', true),
      supabase.from('usuarios').select('id',  { count: 'exact', head: true }).eq('empresa_id', auth.empresaId).eq('activo', true),
    ]);

    // Facturas del mes actual
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
    const { count: facturasMes } = await supabase.from('facturas')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', auth.empresaId)
      .gte('created_at', inicioMes.toISOString());

    // Últimos 6 pagos
    const { data: pagos } = await supabase.from('suscripciones')
      .select('id, plan_codigo, periodo_inicio, periodo_fin, monto, estado, metodo_pago, pagado_en, notas')
      .eq('empresa_id', auth.empresaId)
      .order('periodo_fin', { ascending: false })
      .limit(6);

    return c.json({
      plan: { codigo: planTipo, ...planDef },
      suscripcion,
      expiracion: empresa?.fecha_expiracion,
      uso: {
        productos:    { actual: productos.count ?? 0, limite: planDef?.limites.productos_max ?? -1 },
        usuarios:     { actual: usuarios.count  ?? 0, limite: planDef?.limites.usuarios_max  ?? -1 },
        facturas_mes: { actual: facturasMes     ?? 0, limite: planDef?.limites.facturas_mes  ?? -1 },
      },
      pagos: pagos ?? [],
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Admin: listar empresas con estado de suscripción ─────────────────────
app.get("/server/admin/suscripciones", authMiddleware, superAdminMiddleware, async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { data: empresas, error } = await supabase
      .from('empresas')
      .select('id, nombre, email, plan_tipo, estado, fecha_expiracion, created_at')
      .neq('ruc_nit', '0000000000001')
      .order('fecha_expiracion', { ascending: true });
    if (error) throw error;

    const resultado = (empresas || []).map((e: any) => ({
      ...e,
      plan: obtenerPlan(e.plan_tipo),
      suscripcion: estadoSuscripcion(e.fecha_expiracion),
    }));

    return c.json({ empresas: resultado });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Admin: registrar pago y extender suscripción ──────────────────────────
app.post("/server/admin/suscripciones/pago", authMiddleware, superAdminMiddleware, async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth: AuthContext = c.get('auth');
  try {
    const body = await c.req.json();
    const { empresa_id, meses = 1, metodo_pago = 'transferencia', referencia_pago, notas, plan_tipo } = body;

    if (!empresa_id) return c.json({ error: 'empresa_id requerido' }, 400);

    // Obtener empresa actual
    const { data: empresa, error: empErr } = await supabase
      .from('empresas').select('*').eq('id', empresa_id).single();
    if (empErr || !empresa) return c.json({ error: 'Empresa no encontrada' }, 404);

    // Plan a aplicar (puede cambiar con el pago)
    const nuevoPlan = plan_tipo || empresa.plan_tipo || 'basico';
    const planDef   = obtenerPlan(nuevoPlan);
    if (!planDef) return c.json({ error: `Plan '${nuevoPlan}' no válido` }, 400);

    // Calcular nuevo período
    const ahora = new Date();
    const expiraActual = empresa.fecha_expiracion ? new Date(empresa.fecha_expiracion) : ahora;
    // Si ya venció, el nuevo período parte de hoy; si aún está vigente, se suma
    const inicio = expiraActual > ahora ? expiraActual : ahora;
    const fin    = new Date(inicio);
    fin.setMonth(fin.getMonth() + meses);

    const monto = planDef.precio * meses;

    // Registrar el pago en suscripciones
    const { data: suscripcion, error: sErr } = await supabase.from('suscripciones').insert({
      empresa_id,
      plan_codigo:      nuevoPlan,
      periodo_inicio:   inicio.toISOString().split('T')[0],
      periodo_fin:      fin.toISOString().split('T')[0],
      monto,
      estado:           'pagado',
      metodo_pago,
      referencia_pago:  referencia_pago || null,
      pagado_en:        ahora.toISOString(),
      registrado_por:   auth.userId,
      notas:            notas || null,
    }).select().single();
    if (sErr) throw sErr;

    // Actualizar empresa: extender fecha_expiracion + plan + estado activo
    const planDef2 = obtenerPlan(nuevoPlan);
    await supabase.from('empresas').update({
      plan_tipo:        nuevoPlan,
      modulos_activos:  planDef2?.modulos_incluidos,
      fecha_expiracion: fin.toISOString(),
      estado:           'activo',
      aviso_vencimiento_enviado: false,
    }).eq('id', empresa_id);

    return c.json({
      ok: true,
      mensaje: `Pago registrado — suscripción extendida hasta ${fin.toISOString().split('T')[0]}`,
      suscripcion,
      nueva_expiracion: fin.toISOString(),
    }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Admin: historial de pagos de una empresa ──────────────────────────────
app.get("/server/admin/suscripciones/:empresa_id", authMiddleware, superAdminMiddleware, async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const empresa_id = c.req.param('empresa_id');
    const { data, error } = await supabase.from('suscripciones')
      .select('*')
      .eq('empresa_id', empresa_id)
      .order('periodo_fin', { ascending: false });
    if (error) throw error;
    return c.json({ pagos: data ?? [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Admin: trigger manual de avisos de vencimiento ───────────────────────────
app.post("/server/admin/enviar-avisos", authMiddleware, superAdminMiddleware, async (c) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const RESEND_API_KEY     = Deno.env.get('RESEND_API_KEY') ?? '';
  const RESEND_FROM_DOMAIN = Deno.env.get('RESEND_FROM_DOMAIN') ?? 'onboarding@resend.dev';
  const WHATSAPP_SOPORTE   = Deno.env.get('WHATSAPP_SOPORTE') ?? '593XXXXXXXXX';
  const DIAS_GRACIA_AVS    = 5;
  const DIAS_ADV_AVS       = 7;

  async function enviarEmailAviso(to: string, subject: string, html: string) {
    if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY no configurada' };
    const from = RESEND_FROM_DOMAIN.includes('@')
      ? `MAR ERP <${RESEND_FROM_DOMAIN}>`
      : `MAR ERP <noreply@${RESEND_FROM_DOMAIN}>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const d = await res.json();
    return res.ok ? { ok: true, id: d.id } : { ok: false, error: d.message };
  }

  try {
    const { data: empresas, error } = await supabase
      .from('empresas')
      .select('id, nombre, email, plan_tipo, fecha_expiracion, aviso_vencimiento_enviado, estado')
      .neq('ruc_nit', '0000000000001')
      .eq('estado', 'activo')
      .not('fecha_expiracion', 'is', null);

    if (error) throw error;

    let enviados = 0, errores = 0;
    const detalle: any[] = [];
    const now = new Date();
    const waBase = `https://wa.me/${WHATSAPP_SOPORTE}?text=`;

    for (const emp of (empresas || [])) {
      const dias = Math.ceil((new Date(emp.fecha_expiracion).getTime() - now.getTime()) / 86_400_000);

      let tipo: string | null = null;
      let subject = '';
      let html    = '';

      if (dias > 0 && dias <= DIAS_ADV_AVS && !emp.aviso_vencimiento_enviado) {
        tipo    = 'por_vencer';
        subject = `⚠️ Tu suscripción MAR ERP vence en ${dias} día${dias === 1 ? '' : 's'}`;
        const wa = waBase + encodeURIComponent(`Hola, quiero renovar la suscripción de ${emp.nombre}`);
        html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
          <div style="background:linear-gradient(135deg,#FB923C,#F97316);padding:28px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:24px">🍳 MAR ERP</h1>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:16px;margin-bottom:20px">
              <strong style="color:#C2410C;font-size:16px">⚠️ Tu suscripción vence en ${dias} día${dias === 1 ? '' : 's'}</strong>
            </div>
            <p>Hola <strong>${emp.nombre}</strong>,</p>
            <p style="color:#6B7280">Tu suscripción vencerá el <strong>${new Date(emp.fecha_expiracion).toLocaleDateString('es-EC', { dateStyle: 'long' })}</strong>.
            Para renovar, envíanos el comprobante por WhatsApp.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="${wa}" style="background:linear-gradient(135deg,#22C55E,#16A34A);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">
                💬 Renovar por WhatsApp
              </a>
            </div>
          </div>
        </div>`;
      } else if (dias <= 0 && dias > -DIAS_GRACIA_AVS && !emp.aviso_vencimiento_enviado) {
        const diasGracia = DIAS_GRACIA_AVS + dias;
        tipo    = 'en_gracia';
        subject = `🚨 MAR ERP — Suscripción vencida, ${diasGracia} día${diasGracia === 1 ? '' : 's'} para suspensión`;
        const wa = waBase + encodeURIComponent(`Hola, necesito renovar urgente la suscripción de ${emp.nombre}`);
        html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
          <div style="background:linear-gradient(135deg,#EF4444,#DC2626);padding:28px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:24px">🍳 MAR ERP</h1>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin-bottom:20px">
              <strong style="color:#991B1B;font-size:16px">🚨 Suscripción vencida — ${diasGracia} día${diasGracia === 1 ? '' : 's'} de gracia restantes</strong>
            </div>
            <p>Hola <strong>${emp.nombre}</strong>,</p>
            <p style="color:#6B7280">Tu cuenta se suspenderá automáticamente en <strong>${diasGracia} día${diasGracia === 1 ? '' : 's'}</strong>. Renueva ahora.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="${wa}" style="background:linear-gradient(135deg,#EF4444,#DC2626);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">
                🚨 Renovar ahora
              </a>
            </div>
          </div>
        </div>`;
      }

      if (tipo && subject && html) {
        const result = await enviarEmailAviso(emp.email, subject, html);
        detalle.push({ empresa: emp.nombre, email: emp.email, tipo, enviado: result.ok, error: result.error });
        if (result.ok) {
          enviados++;
          await supabase.from('empresas').update({ aviso_vencimiento_enviado: true }).eq('id', emp.id);
        } else {
          errores++;
        }
      }
    }

    return c.json({
      ok: true,
      procesadas: empresas?.length ?? 0,
      enviados,
      errores,
      detalle,
      resend_configurado: RESEND_API_KEY.length > 0,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Preferencias del sistema (zona horaria, moneda, formato, etc.) ──────────
// Persistidas en kv_store con clave `empresa_<id>_prefs_sistema`. Default
// Ecuador/USD/15% IVA.
const PREFS_SISTEMA_DEFAULT = {
  zona_horaria: 'America/Guayaquil',
  moneda: 'USD',
  formato_fecha: 'DD/MM/YYYY',
  decimales: 2,
  inicio_ejercicio_fiscal: '01-01',
};
app.get("/server/configuracion", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    const [sistema, notificaciones] = await Promise.all([
      kv.get(`empresa_${auth.empresaId}_prefs_sistema`).catch(() => null),
      kv.get(`empresa_${auth.empresaId}_prefs_notificaciones`).catch(() => null),
    ]);
    return c.json({
      sistema: { ...PREFS_SISTEMA_DEFAULT, ...(sistema || {}) },
      notificaciones: notificaciones || {},
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
app.put("/server/configuracion/sistema", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    const body = await c.req.json();
    await kv.set(`empresa_${auth.empresaId}_prefs_sistema`, { ...PREFS_SISTEMA_DEFAULT, ...body });
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
app.put("/server/configuracion/notificaciones", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    const body = await c.req.json();
    await kv.set(`empresa_${auth.empresaId}_prefs_notificaciones`, body || {});
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Facturación: configuración
app.get("/server/facturacion/configuracion", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleGetConfiguracionFacturacion(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
app.post("/server/facturacion/configuracion", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleSaveConfiguracionFacturacion(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
app.get("/server/facturacion/facturas", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleGetFacturas(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ facturas: [], error: error.message });
  }
});
app.post("/server/facturacion/generar", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleGenerarFactura(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
app.post("/server/facturacion/facturas/:id/autorizar", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    const idFromUrl = c.req.param('id');
    let body: any = {};
    try { body = await c.req.json(); } catch { }
    if (!body.factura_id && idFromUrl) body.factura_id = idFromUrl;
    const newReq = new Request(c.req.url, { method: 'POST', headers: c.req.raw.headers, body: JSON.stringify(body) });
    return await handleAutorizarFactura(newReq, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
app.post("/server/facturacion/facturas/:id/reenviar-email", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    const idFromUrl = c.req.param('id');
    // Reconstruir el request inyectando el factura_id desde la URL si no viene en el body
    let body: any = {};
    try { body = await c.req.json(); } catch { /* body vacío */ }
    if (!body.factura_id && idFromUrl) body.factura_id = idFromUrl;
    const newReq = new Request(c.req.url, {
      method: 'POST',
      headers: c.req.raw.headers,
      body: JSON.stringify(body),
    });
    return await handleReenviarEmailFactura(newReq, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
// Flat routes used by ConsultaFacturas.tsx
app.post("/server/facturacion/reintentar", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleReintentarAutorizacion(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
app.post("/server/facturacion/reenviar-email", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleReenviarEmailFactura(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
// Email diagnostic — envía email de prueba y devuelve resultado completo
app.post("/server/facturacion/test-email", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleTestEmail(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
// SRI connectivity diagnostic (GET — returns full test report)
app.get("/server/facturacion/test-sri", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleTestSRI(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
// Certificate management
app.post("/server/facturacion/certificado", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleUploadCertificado(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
app.get("/server/facturacion/certificado/info", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleGetCertificadoInfo(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ── NOTAS DE CRÉDITO ─────────────────────────────────────────────────────────
app.post("/server/facturacion/notas-credito", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try { return await handleEmitirNotaCredito(c.req.raw, auth.empresaId); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── RETENCIONES ─────────────────────────────────────────────────────────────
app.post("/server/facturacion/retenciones", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try { return await handleEmitirRetencion(c.req.raw, auth.empresaId); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.get("/server/facturacion/retenciones", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try { return await handleGetRetenciones(c.req.raw, auth.empresaId); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.get("/server/facturacion/retenciones/:id", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try { return await handleGetRetencion(c.req.raw, auth.empresaId, c.req.param('id')); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.post("/server/facturacion/retenciones/:id/autorizar", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try { return await handleAutorizarRetencion(c.req.raw, auth.empresaId, c.req.param('id')); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.get("/server/facturacion/retenciones/:id/xml", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try { return await handleGetXMLRetencion(c.req.raw, auth.empresaId, c.req.param('id')); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── GET /clientes/buscar — autocomplete de clientes ─────────────────────────
app.get("/server/clientes/buscar", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  const q = (c.req.query('q') || '').trim();
  try {
    let query = db.from('clientes')
      .select('id, nombre, identificacion, tipo_identificacion, email, telefono, total_compras, ultima_compra')
      .eq('empresa_id', auth.empresaId)
      .order('ultima_compra', { ascending: false })
      .limit(10);

    if (q.length >= 2) {
      query = query.or(`nombre.ilike.%${q}%,identificacion.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return c.json({ clientes: data || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── GET /clientes — lista completa ───────────────────────────────────────────
app.get("/server/clientes", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { data, error } = await db.from('clientes')
      .select('*')
      .eq('empresa_id', auth.empresaId)
      .order('ultima_compra', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return c.json({ clientes: data || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── GET /compras/debug — diagnóstico de compras ─────────────────────────────
app.get("/server/compras/debug", authMiddleware, superAdminMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const eid = auth.empresaId;
    // Cuántas compras hay en SQL para esta empresa
    const { count: sqlCount } = await db.from('compras').select('*', { count: 'exact', head: true }).eq('empresa_id', eid);
    // Primeras 3 compras raw
    const { data: sample } = await db.from('compras').select('id,empresa_id,numero,total,fecha,created_at').eq('empresa_id', eid).limit(3);
    // CxP count
    const { count: cxpCount } = await db.from('cuentas_por_pagar').select('*', { count: 'exact', head: true }).eq('empresa_id', eid);
    // Cuántas compras hay en TOTAL en SQL (sin filtro empresa)
    const { count: totalSinFiltro } = await db.from('compras').select('*', { count: 'exact', head: true });
    // Empresa IDs distintos en compras
    const { data: empresasEnCompras } = await db.from('compras').select('empresa_id').limit(10);
    const idsUnicos = [...new Set((empresasEnCompras || []).map((r: any) => r.empresa_id))];
    // KV key
    const kvData = await kv.get(`empresa_${eid}_compras`);
    return c.json({
      empresa_id_actual: eid,
      compras_sql_esta_empresa: sqlCount || 0,
      compras_sql_total_sin_filtro: totalSinFiltro || 0,
      empresa_ids_en_compras: idsUnicos,
      cxp_esta_empresa: cxpCount || 0,
      kv_compras_count: Array.isArray(kvData) ? kvData.length : (kvData ? 1 : 0),
      sample_compras: sample || [],
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── GET /admin/diagnostico-completo — comparar KV vs SQL ────────────────────
app.get("/server/admin/diagnostico-completo", authMiddleware, superAdminMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const eid = auth.empresaId;

    // ── Todas las claves en KV store (para descubrir el ID real) ─────────────
    const { data: todasLasClaves } = await db
      .from('kv_store_9db1b392').select('key').order('key');
    const claves = (todasLasClaves || []).map((r: any) => r.key);

    // Agrupar claves por prefijo de empresa_id
    const prefijos: Record<string, number> = {};
    for (const clave of claves) {
      const match = clave.match(/^empresa_([^_]+)/);
      if (match) {
        prefijos[match[1]] = (prefijos[match[1]] || 0) + 1;
      } else {
        prefijos['(sin prefijo)'] = (prefijos['(sin prefijo)'] || 0) + 1;
      }
    }

    // ── Empresas en SQL ───────────────────────────────────────────────────────
    const { data: empresasSQL } = await db.from('empresas').select('id, nombre');

    // ── Diagnóstico por empresa_id del usuario actual ─────────────────────────
    const tablas = ['productos','recetas','ventas','compras','clientes','proveedores'];
    const porEmpresaActual: Record<string, any> = {};
    for (const t of tablas) {
      const kvKey = `empresa_${eid}_${t}`;
      const kvData: any[] = (await kv.get(kvKey)) || [];
      const { count } = await db.from(t).select('*', { count: 'exact', head: true }).eq('empresa_id', eid);
      porEmpresaActual[t] = { kv: kvData.length, sql: count || 0 };
    }

    // ── Diagnóstico para TODOS los IDs de empresa encontrados en KV ──────────
    const porEmpresaKV: Record<string, any> = {};
    for (const prefijo of Object.keys(prefijos)) {
      if (prefijo === '(sin prefijo)') continue;
      porEmpresaKV[prefijo] = {};
      for (const t of tablas) {
        const kvData: any[] = (await kv.get(`empresa_${prefijo}_${t}`)) || [];
        porEmpresaKV[prefijo][t] = kvData.length;
      }
    }

    return c.json({
      empresa_id_actual: eid,
      empresas_sql: empresasSQL || [],
      claves_kv_total: claves.length,
      prefijos_empresa_en_kv: prefijos,
      datos_empresa_actual: porEmpresaActual,
      datos_por_empresa_kv: porEmpresaKV,
      todas_las_claves_kv: claves,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /admin/restaurar-desde-kv — re-sincroniza TODO desde KV ─────────────
// Acepta ?empresa_id=UUID para restaurar una empresa específica
app.post("/server/admin/restaurar-desde-kv", authMiddleware, superAdminMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  // Permite especificar empresa_id destino (útil para super_admin restaurando otras empresas)
  const eidParam = c.req.query('empresa_id');
  const eid = eidParam || auth.empresaId;
  const res: Record<string, any> = {};
  const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  // ── Productos ──────────────────────────────────────────────────────────────
  try {
    const datos: any[] = (await kv.get(`empresa_${eid}_productos`)) || [];
    if (datos.length > 0) {
      // Primero limpiar duplicados: borrar y re-insertar
      await db.from('productos').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => ({
        id: isUUID(d.id) ? d.id : crypto.randomUUID(),
        empresa_id: eid,
        nombre: d.nombre || 'Sin nombre',
        descripcion: d.descripcion || null,
        precio: Number(d.precio_venta || d.precio || 0),
        precio_costo: Number(d.precio_costo || d.costo_unitario || d.costo || 0),
        stock_actual: Number(d.stock_actual ?? d.stock ?? 0),
        stock_minimo: Number(d.stock_minimo ?? 0),
        unidad: d.unidad || 'und',
        categoria: d.categoria || null,
        codigo: d.codigo || null,
        codigo_barras: d.codigo_barras || null,
        imagen_url: d.imagen_url || null,
        tiene_iva: d.tiene_iva ?? true,
        es_compuesto: d.es_compuesto ?? false,
        tipo: d.tipo || 'producto',
        activo: d.activo ?? true,
        metadata: d.metadata || {},
        updated_at: new Date().toISOString(),
      }));
      const { error } = await db.from('productos').insert(filas);
      res.productos = error ? `ERROR: ${error.message}` : `✅ ${filas.length} restaurados`;
    } else { res.productos = 'vacío en KV'; }
  } catch (e: any) { res.productos = `ERROR: ${e.message}`; }

  // ── Recetas ────────────────────────────────────────────────────────────────
  try {
    const datos: any[] = (await kv.get(`empresa_${eid}_recetas`)) || [];
    if (datos.length > 0) {
      await db.from('recetas').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => ({
        id: isUUID(d.id) ? d.id : crypto.randomUUID(),
        empresa_id: eid,
        nombre: d.nombre || 'Sin nombre',
        activo: d.activo ?? true,
        producto_id: isUUID(d.producto_id) ? d.producto_id : null,
        rendimiento: Number(d.rendimiento || 1),
        costo_total: Number(d.costo_total || 0),
        ingredientes: d.ingredientes || [],
        categoria: d.categoria || null,
        tiempo_preparacion: Number(d.tiempo_preparacion || 0),
        porciones: Number(d.porciones || 1),
        notas: d.notas || null,
        metadata: { ...(d.metadata || {}), precio_venta: Number(d.precio_venta || d.precio || 0) },
        updated_at: new Date().toISOString(),
      }));
      const { error } = await db.from('recetas').insert(filas);
      res.recetas = error ? `ERROR: ${error.message}` : `✅ ${filas.length} restauradas`;
    } else { res.recetas = 'vacío en KV'; }
  } catch (e: any) { res.recetas = `ERROR: ${e.message}`; }

  // ── Compras ────────────────────────────────────────────────────────────────
  try {
    const datos: any[] = (await kv.get(`empresa_${eid}_compras`)) || [];
    if (datos.length > 0) {
      await db.from('compras').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => ({
        id: isUUID(d.id) ? d.id : crypto.randomUUID(),
        empresa_id: eid,
        numero: d.numero || d.id,
        proveedor_id: isUUID(d.proveedor_id) ? d.proveedor_id : null,
        proveedor_nombre: d.proveedor_nombre || d.proveedor || null,
        subtotal: Number(d.subtotal || 0),
        iva: Number(d.iva || 0),
        total: Number(d.total || 0),
        estado: d.estado || 'pagado',
        fecha: d.fecha || d.created_at || new Date().toISOString(),
        items: d.items || [],
        metadata: d.metadata || {},
        estado_pago: d.estado_pago || 'pagado',
        forma_pago: d.forma_pago || null,
        notas: d.notas || null,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await db.from('compras').insert(filas);
      res.compras = error ? `ERROR: ${error.message}` : `✅ ${filas.length} restauradas`;
    } else { res.compras = 'vacío en KV'; }
  } catch (e: any) { res.compras = `ERROR: ${e.message}`; }

  // ── Clientes ───────────────────────────────────────────────────────────────
  try {
    const datos: any[] = (await kv.get(`empresa_${eid}_clientes`)) || [];
    if (datos.length > 0) {
      await db.from('clientes').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => ({
        id: isUUID(d.id) ? d.id : crypto.randomUUID(),
        empresa_id: eid,
        nombre: d.nombre || 'Sin nombre',
        identificacion: d.identificacion || d.ruc || d.cedula || null,
        tipo_identificacion: d.tipo_identificacion || 'cedula',
        email: d.email || null,
        telefono: d.telefono || null,
        direccion: d.direccion || null,
        activo: d.activo ?? true,
        metadata: d.metadata || {},
        updated_at: new Date().toISOString(),
      }));
      const { error } = await db.from('clientes').insert(filas);
      res.clientes = error ? `ERROR: ${error.message}` : `✅ ${filas.length} restaurados`;
    } else { res.clientes = 'vacío en KV'; }
  } catch (e: any) { res.clientes = `ERROR: ${e.message}`; }

  // ── Proveedores ────────────────────────────────────────────────────────────
  try {
    const datos: any[] = (await kv.get(`empresa_${eid}_proveedores`)) || [];
    if (datos.length > 0) {
      await db.from('proveedores').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => ({
        id: isUUID(d.id) ? d.id : crypto.randomUUID(),
        empresa_id: eid,
        nombre: d.nombre || 'Sin nombre',
        ruc: d.ruc || null,
        contacto: d.contacto || null,
        email: d.email || null,
        telefono: d.telefono || null,
        direccion: d.direccion || null,
        activo: d.activo ?? true,
        metadata: d.metadata || {},
        updated_at: new Date().toISOString(),
      }));
      const { error } = await db.from('proveedores').insert(filas);
      res.proveedores = error ? `ERROR: ${error.message}` : `✅ ${filas.length} restaurados`;
    } else { res.proveedores = 'vacío en KV'; }
  } catch (e: any) { res.proveedores = `ERROR: ${e.message}`; }

  return c.json({ ok: true, empresa_id: eid, resultado: res });
});

// ── GET /facturacion/diagnostico — ver qué hay en KV y SQL ──────────────────
app.get("/server/facturacion/diagnostico", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    const db = createClient(supabaseUrl, supabaseServiceKey);
    // Buscar en SQL
    const { data: sqlConfig } = await db.from('configuracion_facturacion').select('*').eq('empresa_id', auth.empresaId).maybeSingle();
    const { data: sqlCert } = await db.from('certificados_facturacion').select('nombre,titular,valido_hasta').eq('empresa_id', auth.empresaId).maybeSingle();
    const { data: sqlFacturas } = await db.from('facturas').select('count').eq('empresa_id', auth.empresaId);
    // Buscar todas las claves KV de esta empresa
    const { data: kvKeys } = await db.from('kv_store_9db1b392').select('key').like('key', `empresa_${auth.empresaId}%`);
    const todasLasClaves = kvKeys?.map((r: any) => r.key) || [];
    return c.json({
      empresa_id: auth.empresaId,
      sql: {
        configuracion_facturacion: sqlConfig ? { ruc: sqlConfig.ruc, razon_social: sqlConfig.razon_social, ambiente: sqlConfig.ambiente } : null,
        certificado: sqlCert || null,
        facturas_count: sqlFacturas?.length || 0,
      },
      kv_claves_empresa: todasLasClaves,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ── GET /admin/inspeccionar-kv — muestra estructura real del KV ─────────────
app.get("/server/admin/inspeccionar-kv", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  const eid = c.req.query('empresa_id') || auth.empresaId;
  const resultado: Record<string, any> = { empresa_id: eid };
  const tablas = ['productos','recetas','compras','ventas','clientes','proveedores','bodegas','configuracion','cuentas_contables','asientos_contables'];
  for (const tabla of tablas) {
    try {
      // Intentar formato underscore y colon
      let datos: any[] = (await kv.get(`empresa_${eid}_${tabla}`)) || [];
      if (datos.length === 0) {
        datos = (await kv.get(`empresa:${eid}:${tabla}`)) || [];
      }
      // Para configuracion intentar variantes
      if (tabla === 'configuracion' && datos.length === 0) {
        const raw = await kv.get(`empresa_${eid}_configuracion`);
        if (raw) datos = [raw];
      }
      if (datos.length > 0) {
        const muestra = Array.isArray(datos) ? datos.slice(0, 3) : [datos];
        resultado[tabla] = {
          total: Array.isArray(datos) ? datos.length : 1,
          campos_muestra: muestra.length > 0 ? Object.keys(muestra[0]) : [],
          muestra: muestra,
        };
      } else {
        resultado[tabla] = { total: 0, campos_muestra: [], muestra: [] };
      }
    } catch (e: any) {
      resultado[tabla] = { error: e.message };
    }
  }
  // También mostrar todas las claves KV de esta empresa
  try {
    const { data: kvRows } = await db.from('kv_store_9db1b392').select('key').or(`key.like.empresa_${eid}%,key.like.empresa:${eid}:%`);
    resultado._claves_kv = (kvRows || []).map((r: any) => r.key);
  } catch (e: any) {
    resultado._claves_kv = [];
  }
  return c.json(resultado);
});

// ── GET /admin/columnas-sql — muestra columnas reales de tablas contables en la BD ──────────
app.get("/server/admin/columnas-sql", authMiddleware, superAdminMiddleware, async (c) => {
  const db = createClient(supabaseUrl, supabaseServiceKey);
  const tablas = ['cuentas_contables', 'asientos_contables', 'categorias', 'bodegas', 'ventas', 'productos'];
  const resultado: Record<string, any> = {};
  for (const tabla of tablas) {
    try {
      const { data, error } = await db.rpc('_columnas_tabla', { tabla_nombre: tabla }).select();
      if (error) {
        // Fallback: intentar insertar un objeto vacío para ver qué columnas acepta
        const { error: e2 } = await db.from(tabla).select('*').limit(1);
        resultado[tabla] = e2 ? `ERROR: ${e2.message}` : 'OK (sin RPC)';
      } else {
        resultado[tabla] = data;
      }
    } catch (e: any) {
      resultado[tabla] = `ERROR: ${e.message}`;
    }
  }
  // Alternativa: usar information_schema vía rpc raw
  try {
    const { data: cols } = await db
      .from('information_schema.columns' as any)
      .select('table_name, column_name, data_type, column_default, is_nullable')
      .in('table_name', tablas)
      .eq('table_schema', 'public')
      .order('table_name')
      .order('ordinal_position');
    resultado._information_schema = cols || [];
  } catch (e: any) {
    resultado._information_schema = `ERROR: ${e.message}`;
  }
  return c.json(resultado);
});

// ── POST /admin/restaurar-completo — restauración completa con mapeo exacto de campos KV ──
app.post("/server/admin/restaurar-completo", authMiddleware, superAdminMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  const eidParam = c.req.query('empresa_id');
  const eid = eidParam || auth.empresaId;
  const res: Record<string, any> = { empresa_id: eid };
  const isUUID = (s: any) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const getKV = async (tabla: string) => {
    let d: any = await kv.get(`empresa_${eid}_${tabla}`);
    if (!d || (Array.isArray(d) && d.length === 0)) d = await kv.get(`empresa:${eid}:${tabla}`);
    return Array.isArray(d) ? d : (d ? [d] : []);
  };
  // Mapa para convertir IDs antiguos (no-UUID) a nuevos UUIDs
  const idMap: Record<string, string> = {};

  // ── Productos ──────────────────────────────────────────────────────────────
  // KV usa: precio_venta, precio_compra, unidad_medida, categoria_id, disponible, gestiona_inventario
  try {
    const datos = await getKV('productos');
    if (datos.length > 0) {
      await db.from('productos').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => {
        const meta = d.metadata || {};
        const newId = isUUID(d.id) ? d.id : crypto.randomUUID();
        if (d.id && !isUUID(d.id)) idMap[d.id] = newId; // guardar mapeo
        return {
          id: newId,
          empresa_id: eid,
          nombre: d.nombre || 'Sin nombre',
          descripcion: d.descripcion || meta.descripcion || null,
          // precio_venta en KV = precio de venta al público
          precio: Number(d.precio_venta ?? d.precio ?? meta.precio_venta ?? meta.precio ?? 0),
          // precio_compra en KV = costo de compra (campo distinto a precio_costo/costo_unitario)
          precio_costo: Number(d.precio_compra ?? d.precio_costo ?? d.costo_unitario ?? d.costo ?? meta.precio_compra ?? meta.precio_costo ?? 0),
          stock_actual: Number(d.stock_actual ?? d.stock ?? meta.stock_actual ?? 0),
          stock_minimo: Number(d.stock_minimo ?? d.stock_min ?? meta.stock_minimo ?? 0),
          // stock_maximo NO existe en SQL — guardar solo en metadata
          // unidad_medida en KV (no "unidad")
          unidad: d.unidad_medida || d.unidad || meta.unidad_medida || meta.unidad || 'und',
          // categoria_id en KV (no "categoria")
          categoria: d.categoria_id || d.categoria || meta.categoria_id || meta.categoria || null,
          codigo: d.codigo || meta.codigo || null,
          codigo_barras: d.codigo_barras || meta.codigo_barras || null,
          imagen_url: d.imagen_url || meta.imagen_url || null,
          tiene_iva: d.tiene_iva ?? meta.tiene_iva ?? (Number(d.porcentaje_iva || 0) > 0),
          es_compuesto: d.es_compuesto ?? d.es_receta ?? meta.es_compuesto ?? false,
          tipo: d.tipo || meta.tipo || 'producto',
          activo: d.activo ?? d.disponible ?? meta.activo ?? true,
          metadata: {
            ...meta,
            precio_compra_original: d.precio_compra,
            precio_venta_original: d.precio_venta,
            unidad_medida: d.unidad_medida,
            categoria_id: d.categoria_id,
            porcentaje_iva: d.porcentaje_iva,
            gestiona_inventario: d.gestiona_inventario,
            punto_pedido: d.punto_pedido,
            lead_time_dias: d.lead_time_dias,
            consumo_promedio_diario: d.consumo_promedio_diario,
            impuesto_incluido: d.impuesto_incluido,
          },
          updated_at: d.updated_at || new Date().toISOString(),
        };
      });
      const { error } = await db.from('productos').insert(filas);
      if (error) {
        res.productos = `ERROR: ${error.message}`;
      } else {
        const conPrecio = filas.filter(f => f.precio > 0).length;
        const conCosto  = filas.filter(f => f.precio_costo > 0).length;
        res.productos = `✅ ${filas.length} restaurados (${conPrecio} con precio_venta, ${conCosto} con precio_compra)`;
      }
    } else { res.productos = '⚠️ vacío en KV'; }
  } catch (e: any) { res.productos = `ERROR: ${e.message}`; }

  // ── Recetas ────────────────────────────────────────────────────────────────
  // KV usa: precio_sugerido (no precio_venta), dificultad, instrucciones
  try {
    const datos = await getKV('recetas');
    if (datos.length > 0) {
      await db.from('recetas').delete().eq('empresa_id', eid);
      // Mapa de productos por ID para verificar que el producto_id existe
      const { data: prodSQL } = await db.from('productos').select('id,nombre,precio').eq('empresa_id', eid);
      const prodById  = new Map((prodSQL || []).map((p: any) => [p.id, p]));
      const prodByNombre = new Map((prodSQL || []).map((p: any) => [p.nombre?.toLowerCase()?.trim(), p]));
      const filas = datos.map((d: any) => {
        const meta = d.metadata || {};
        // precio_sugerido es el campo real en KV para el precio de venta sugerido de la receta
        const precioVenta = Number(d.precio_sugerido ?? d.precio_venta ?? d.precio ?? meta.precio_venta ?? meta.precio_sugerido ?? 0);
        // Verificar/encontrar producto_id
        let productoId: string | null = isUUID(d.producto_id) ? d.producto_id : null;
        if (productoId && !prodById.has(productoId)) productoId = null; // ID no existe en SQL
        if (!productoId && d.nombre) {
          const found = prodByNombre.get(d.nombre?.toLowerCase()?.trim());
          if (found) productoId = found.id;
          // Si hay un producto y la receta no tiene precio propio, usar el precio del producto
        }
        // Calcular precio_venta efectivo: si hay producto, usar su precio
        const productoActual = productoId ? prodById.get(productoId) : null;
        const precioEfectivo = Number(productoActual?.precio || 0) || precioVenta;
        return {
          id: isUUID(d.id) ? d.id : crypto.randomUUID(),
          empresa_id: eid,
          nombre: d.nombre || 'Sin nombre',
          activo: d.activo ?? true,
          producto_id: productoId,
          rendimiento: Number(d.rendimiento || d.porciones || 1),
          costo_total: Number(d.costo_total || d.costo || 0),
          // Remap insumo_id en ingredientes: IDs no-UUID recibieron nuevo UUID al restaurar productos
          ingredientes: (d.ingredientes || []).map((ing: any) => ({
            ...ing,
            insumo_id: ing.insumo_id ? (idMap[ing.insumo_id] || ing.insumo_id) : ing.insumo_id,
            producto_id: ing.producto_id ? (idMap[ing.producto_id] || ing.producto_id) : ing.producto_id,
          })),
          categoria: d.categoria || meta.categoria || null,
          tiempo_preparacion: Number(d.tiempo_preparacion || 0),
          porciones: Number(d.porciones || 1),
          // dificultad NO existe en SQL — guardar solo en metadata
          notas: d.instrucciones || d.notas || meta.notas || null,
          metadata: {
            ...meta,
            precio_venta: precioEfectivo,
            precio_sugerido: precioVenta,
            dificultad: d.dificultad,           // guardado en metadata
            instrucciones: d.instrucciones,
          },
          updated_at: d.updated_at || new Date().toISOString(),
        };
      });
      const { error } = await db.from('recetas').insert(filas);
      if (error) {
        res.recetas = `ERROR: ${error.message}`;
      } else {
        const conProducto = filas.filter(f => f.producto_id).length;
        res.recetas = `✅ ${filas.length} restauradas (${conProducto} enlazadas a producto)`;
      }
    } else { res.recetas = '⚠️ vacío en KV'; }
  } catch (e: any) { res.recetas = `ERROR: ${e.message}`; }

  // ── Proveedores ── (antes de compras para poder mapear IDs)
  // KV usa: ruc_nit (no ruc!), activo
  const proveedorIdMap: Record<string, string> = {};
  try {
    const datos = await getKV('proveedores');
    if (datos.length > 0) {
      await db.from('proveedores').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => {
        const meta = d.metadata || {};
        const newId = isUUID(d.id) ? d.id : crypto.randomUUID();
        if (d.id) proveedorIdMap[d.id] = newId; // guardar mapeo para compras
        return {
          id: newId,
          empresa_id: eid,
          nombre: d.nombre || 'Sin nombre',
          // ruc_nit en KV (no "ruc")
          ruc: d.ruc_nit || d.ruc || d.identificacion || meta.ruc_nit || meta.ruc || null,
          contacto: d.contacto || d.contacto_nombre || meta.contacto || null,
          email: d.email || meta.email || null,
          telefono: d.telefono || meta.telefono || null,
          direccion: d.direccion || meta.direccion || null,
          activo: d.activo ?? true,
          metadata: {
            ...meta,
            id_original: d.id,
            ruc_nit: d.ruc_nit,
            dias_credito: d.dias_credito,
            limite_credito: d.limite_credito,
            migrado_desde_kv: true,
          },
          updated_at: d.updated_at || new Date().toISOString(),
        };
      });
      const { error } = await db.from('proveedores').insert(filas);
      res.proveedores = error ? `ERROR: ${error.message}` : `✅ ${filas.length} restaurados`;
    } else { res.proveedores = '⚠️ vacío en KV'; }
  } catch (e: any) { res.proveedores = `ERROR: ${e.message}`; }

  // ── Compras ────────────────────────────────────────────────────────────────
  // KV usa: total_compra (no total), numero_factura, observaciones, proveedor_id (no-UUID)
  try {
    const datos = await getKV('compras');
    if (datos.length > 0) {
      await db.from('compras').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => {
        const meta = d.metadata || {};
        // Mapear proveedor_id antiguo al nuevo UUID
        const proveedorNuevoId = d.proveedor_id ? (proveedorIdMap[d.proveedor_id] || (isUUID(d.proveedor_id) ? d.proveedor_id : null)) : null;
        return {
          id: isUUID(d.id) ? d.id : crypto.randomUUID(),
          empresa_id: eid,
          // numero_factura en KV (no numero)
          numero: d.numero_factura || d.numero || d.id,
          proveedor_id: proveedorNuevoId,
          proveedor_nombre: d.proveedor_nombre || meta.proveedor_nombre || null,
          subtotal: Number(d.subtotal || d.total_compra || d.total || 0),
          iva: Number(d.iva || 0),
          // total_compra en KV (no total)
          total: Number(d.total_compra || d.total || 0),
          estado: d.estado || 'pagado',
          fecha: d.fecha || d.created_at || new Date().toISOString(),
          items: d.items || d.productos || [],  // compras no necesitan remap de producto_id
          // observaciones en KV (no notas)
          notas: d.observaciones || d.notas || null,
          estado_pago: d.estado_pago || 'pagado',
          forma_pago: d.forma_pago || null,
          metadata: {
            ...meta,
            proveedor_id_original: d.proveedor_id,
            numero_factura: d.numero_factura,
            observaciones: d.observaciones,
            usuario_id: d.usuario_id,
            migrado_desde_kv: true,
          },
          updated_at: d.updated_at || new Date().toISOString(),
        };
      });
      const { error } = await db.from('compras').insert(filas);
      res.compras = error ? `ERROR: ${error.message}` : `✅ ${filas.length} restauradas`;
    } else { res.compras = '⚠️ vacío en KV'; }
  } catch (e: any) { res.compras = `ERROR: ${e.message}`; }

  // ── Ventas ─────────────────────────────────────────────────────────────────
  // KV usa: metodo_pago (no forma_pago), numero_ticket, impuestos (no iva), tipo_servicio
  try {
    const datos = await getKV('ventas');
    if (datos.length > 0) {
      await db.from('ventas').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => {
        const meta = d.metadata || {};
        return {
          id: isUUID(d.id) ? d.id : crypto.randomUUID(),
          empresa_id: eid,
          // numero_ticket en KV (no numero)
          numero: d.numero_ticket || d.numero || d.id || null,
          cliente_id: isUUID(d.cliente_id) ? d.cliente_id : null,
          cliente_nombre: d.cliente_nombre || d.cliente || null,
          subtotal: Number(d.subtotal || 0),
          // impuestos en KV (no iva)
          iva: Number(d.iva || d.impuestos || d.impuesto || 0),
          descuento: Number(d.descuento || d.total_descuento || 0),
          total: Number(d.total || 0),
          // metodo_pago en KV (no forma_pago)
          forma_pago: d.metodo_pago || d.forma_pago || 'efectivo',
          estado: d.estado || 'completada',
          // Remap producto_id en items: IDs no-UUID recibieron nuevo UUID al restaurar productos
          items: (d.items || d.productos || []).map((item: any) => ({
            ...item,
            producto_id: item.producto_id ? (idMap[item.producto_id] || item.producto_id) : item.producto_id,
          })),
          notas: d.notas || null,
          cajero_id: d.cajero_id || d.usuario_id || null,
          // mesa_id NO existe en ventas SQL — usa campo "mesa" TEXT
          mesa: d.mesa || null,
          // tipo_servicio, bodega_id, numero_orden, anulada sí existen (desde migración 006)
          tipo_servicio: d.tipo_servicio || null,
          // bodega_id: si no es UUID, dejar null — se remapea en segunda pasada tras restaurar bodegas
          bodega_id: isUUID(d.bodega_id) ? d.bodega_id : null,
          anulada: d.anulada ?? false,
          // fecha NO existe como columna — mapear a created_at para que el dashboard filtre bien
          created_at: d.fecha || d.created_at || new Date().toISOString(),
          metadata: {
            ...meta,
            numero_ticket: d.numero_ticket,
            tipo_servicio: d.tipo_servicio,
            bodega_id_original: d.bodega_id,
            usuario_id: d.usuario_id,
            migrado_desde_kv: true,
          },
          updated_at: d.updated_at || new Date().toISOString(),
        };
      });
      const { error } = await db.from('ventas').insert(filas);
      if (error) {
        res.ventas = `ERROR: ${error.message}`;
      } else {
        const totalVentas = filas.reduce((s, v) => s + Number(v.total || 0), 0);
        res.ventas = `✅ ${filas.length} restauradas (total: $${totalVentas.toFixed(2)})`;
      }
    } else { res.ventas = '⚠️ vacío en KV'; }
  } catch (e: any) { res.ventas = `ERROR: ${e.message}`; }

  // ── Clientes ───────────────────────────────────────────────────────────────
  try {
    const datos = await getKV('clientes');
    if (datos.length > 0) {
      await db.from('clientes').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => {
        const meta = d.metadata || {};
        return {
          id: isUUID(d.id) ? d.id : crypto.randomUUID(),
          empresa_id: eid,
          nombre: d.nombre || 'Sin nombre',
          identificacion: d.identificacion || d.ruc || d.ruc_nit || d.cedula || meta.identificacion || null,
          tipo_identificacion: d.tipo_identificacion || (d.ruc || d.ruc_nit ? 'ruc' : 'cedula'),
          email: d.email || meta.email || null,
          telefono: d.telefono || meta.telefono || null,
          direccion: d.direccion || meta.direccion || null,
          activo: d.activo ?? true,
          metadata: { ...meta, migrado_desde_kv: true },
          updated_at: d.updated_at || new Date().toISOString(),
        };
      });
      const { error } = await db.from('clientes').insert(filas);
      res.clientes = error ? `ERROR: ${error.message}` : `✅ ${filas.length} restaurados`;
    } else { res.clientes = '⚠️ vacío en KV (sin clientes registrados)'; }
  } catch (e: any) { res.clientes = `ERROR: ${e.message}`; }

  // ── Bodegas ────────────────────────────────────────────────────────────────
  // KV usa: activa (no activo), tipo, codigo, responsable. Nombre: "CDP TROIT"
  try {
    const datos = await getKV('bodegas');
    if (datos.length > 0) {
      await db.from('bodegas').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => {
        const meta = d.metadata || {};
        const newId = isUUID(d.id) ? d.id : crypto.randomUUID();
        if (d.id) idMap[d.id] = newId;
        // Solo insertar campos que existen en la tabla bodegas SQL
        // La tabla usa: id, empresa_id, nombre, tipo, codigo, activa, direccion
        return {
          id: newId,
          empresa_id: eid,
          nombre: d.nombre || 'Bodega Principal',
          // KV usa "activa" — SQL también usa "activa" (no "activo")
          activa: d.activa ?? d.activo ?? true,
          tipo: d.tipo || 'principal',
          codigo: d.codigo || '001',
          direccion: d.direccion || null,
        };
      });
      const { error } = await db.from('bodegas').insert(filas);
      res.bodegas = error ? `ERROR: ${error.message}` : `✅ ${filas.length} restauradas (${filas.map(f => f.nombre).join(', ')})`;
    } else {
      const { data: bodegaExistente } = await db.from('bodegas').select('id,nombre').eq('empresa_id', eid).maybeSingle();
      res.bodegas = bodegaExistente
        ? `ℹ️ Bodega existente: "${bodegaExistente.nombre}" (sin datos en KV)`
        : '⚠️ vacío en KV y sin bodega en SQL';
    }
  } catch (e: any) { res.bodegas = `ERROR: ${e.message}`; }

  // ── Segunda pasada: remap bodega_id en ventas ────────────────────────────────
  // Las ventas con bodega_id no-UUID quedaron con bodega_id=null durante la restauración.
  // Ahora que idMap tiene los UUIDs nuevos de bodegas, actualizamos ventas.
  try {
    const ventasKV = await getKV('ventas');
    let ventasRemapeadas = 0;
    for (const v of ventasKV) {
      const bodegaIdKV = v.bodega_id;
      if (!bodegaIdKV || isUUID(bodegaIdKV)) continue;   // ya era UUID o sin bodega
      const bodegaIdSQL = idMap[bodegaIdKV];
      if (!bodegaIdSQL) continue;
      const ventaId = isUUID(v.id) ? v.id : null;
      if (!ventaId) continue;
      await db.from('ventas').update({ bodega_id: bodegaIdSQL })
        .eq('id', ventaId).eq('empresa_id', eid);
      ventasRemapeadas++;
    }
    if (ventasRemapeadas > 0) {
      res.ventas_bodega_remap = `✅ ${ventasRemapeadas} ventas con bodega_id actualizado`;
    }
  } catch (e: any) { res.ventas_bodega_remap = `ERROR: ${e.message}`; }

  // ── Categorías ─────────────────────────────────────────────────────────────
  try {
    const datos = await getKV('categorias');
    if (datos.length > 0) {
      await db.from('categorias').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => ({
        id: isUUID(d.id) ? d.id : crypto.randomUUID(),
        empresa_id: eid,
        nombre: d.nombre || 'Sin nombre',
        color: d.color || '#6366f1',
        icono: d.icono || null,
        activo: d.activo ?? true,
        updated_at: d.updated_at || new Date().toISOString(),
      }));
      const { error } = await db.from('categorias').insert(filas);
      res.categorias = error ? `ERROR: ${error.message}` : `✅ ${filas.length} restauradas`;
    } else { res.categorias = '⚠️ vacío en KV'; }
  } catch (e: any) { res.categorias = `ERROR: ${e.message}`; }

  // ── Cuentas Contables ──────────────────────────────────────────────────────
  // KV tiene: id, tipo, nivel, activa, codigo, nombre, es_grupo, empresa_id, naturaleza
  // La tabla desplegada usa esos campos (NO padre_id, NO activo, NO metadata)
  try {
    const datos = await getKV('cuentas_contables');
    if (datos.length > 0) {
      await db.from('cuentas_contables').delete().eq('empresa_id', eid);
      const filas = datos.map((d: any) => ({
        id: isUUID(d.id) ? d.id : crypto.randomUUID(),
        empresa_id: eid,
        codigo: d.codigo || '0',
        nombre: d.nombre || 'Sin nombre',
        tipo: d.tipo || null,
        es_grupo: d.es_grupo ?? false,
        activa: d.activa ?? true,   // KV usa "activa" (no "activo")
        nivel: d.nivel ?? null,     // campo real en la tabla desplegada
        // naturaleza NO existe en la BD desplegada — omitir
        updated_at: d.updated_at || d.created_at || new Date().toISOString(),
      }));
      const filasDedup = filas.filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i);
      const { error } = await db.from('cuentas_contables').upsert(filasDedup, { onConflict: 'id' });
      res.cuentas_contables = error ? `ERROR: ${error.message}` : `✅ ${filasDedup.length} restauradas`;
    } else { res.cuentas_contables = '⚠️ vacío en KV'; }
  } catch (e: any) { res.cuentas_contables = `ERROR: ${e.message}`; }

  // ── Asientos Contables ─────────────────────────────────────────────────────
  // Los asientos fueron generados AUTOMÁTICAMENTE por el sistema y ya están en SQL.
  // Re-insertarlos dispara el trigger de auditoría que requiere usuario_id (NOT NULL).
  // → Solo validamos cuántos hay en KV vs SQL y reportamos, sin tocar los datos.
  try {
    const datos = await getKV('asientos_contables');
    const { count: countSQL } = await db.from('asientos_contables')
      .select('*', { count: 'exact', head: true }).eq('empresa_id', eid);
    const enKV = datos.length;
    const enSQL = countSQL || 0;
    if (enKV === 0) {
      res.asientos_contables = `ℹ️ Sin asientos en KV — en SQL hay ${enSQL} registros`;
    } else if (enSQL >= enKV) {
      res.asientos_contables = `✅ ${enSQL} en SQL (KV tiene ${enKV}) — ya sincronizados`;
    } else {
      // Faltan algunos — intentar insertar solo los que no existen en SQL
      const idsKV = datos.map((d: any) => d.id).filter(isUUID);
      const { data: existentes } = await db.from('asientos_contables')
        .select('id').in('id', idsKV);
      const idsExistentes = new Set((existentes || []).map((r: any) => r.id));
      const faltantes = datos.filter((d: any) => isUUID(d.id) && !idsExistentes.has(d.id));
      res.asientos_contables = `⚠️ KV=${enKV}, SQL=${enSQL} — faltan ${faltantes.length} (no se insertan para evitar el trigger de auditoría)`;
    }
  } catch (e: any) { res.asientos_contables = `ERROR: ${e.message}`; }

  // ── Stock por Bodega (stock_bodegas_sql) ────────────────────────────────────
  // KV clave especial: stock_bodegas_${eid} → { [bodegaId]: { [productoNombre]: cantidad } }
  // Si no hay datos KV, sembrar desde productos.stock_actual asignando a la bodega principal
  try {
    const kvStock: any = await kv.get(`stock_bodegas_${eid}`) || {};
    const { data: bodegasSQL } = await db.from('bodegas').select('id,nombre').eq('empresa_id', eid);
    const bodegaPrincipal = (bodegasSQL || [])[0];

    await db.from('stock_bodegas_sql').delete().eq('empresa_id', eid);

    if (Object.keys(kvStock).length > 0) {
      // Hay datos de stock por bodega en KV — restaurar respetando el layout por bodega
      const filas: any[] = [];
      for (const [bodegaIdKV, stockMap] of Object.entries(kvStock as Record<string, any>)) {
        const bodegaIdSQL = idMap[bodegaIdKV] || (isUUID(bodegaIdKV) ? bodegaIdKV : bodegaPrincipal?.id);
        if (!bodegaIdSQL) continue;
        for (const [productoNombre, cantidad] of Object.entries(stockMap as Record<string, any>)) {
          if (Number(cantidad) > 0) {
            filas.push({
              empresa_id: eid,
              bodega_id: bodegaIdSQL,
              producto_nombre: productoNombre,
              cantidad: Number(cantidad),
              updated_at: new Date().toISOString(),
            });
          }
        }
      }
      if (filas.length > 0) {
        const { error } = await db.from('stock_bodegas_sql').insert(filas);
        res.stock_bodegas = error ? `ERROR: ${error.message}` : `✅ ${filas.length} registros restaurados desde KV`;
      } else {
        res.stock_bodegas = '⚠️ KV stock sin cantidades > 0';
      }
    } else if (bodegaPrincipal) {
      // Sin datos KV → sembrar desde productos.stock_actual en la bodega principal
      const { data: prods } = await db.from('productos')
        .select('nombre,stock_actual').eq('empresa_id', eid).gt('stock_actual', 0);
      const filas = (prods || []).map((p: any) => ({
        empresa_id: eid,
        bodega_id: bodegaPrincipal.id,
        producto_nombre: p.nombre,
        cantidad: Number(p.stock_actual || 0),
        updated_at: new Date().toISOString(),
      }));
      if (filas.length > 0) {
        const { error } = await db.from('stock_bodegas_sql').insert(filas);
        res.stock_bodegas = error
          ? `ERROR: ${error.message}`
          : `✅ ${filas.length} sembrados desde stock_actual → bodega "${bodegaPrincipal.nombre}"`;
      } else {
        res.stock_bodegas = '⚠️ Sin productos con stock > 0 para sembrar';
      }
    } else {
      res.stock_bodegas = '⚠️ Sin bodega en SQL — ejecuta la restauración de bodegas primero';
    }
  } catch (e: any) { res.stock_bodegas = `ERROR: ${e.message}`; }

  return c.json({ ok: true, empresa_id: eid, resultado: res });
});

// ── GET /admin/fix-precios — corrige precio=0 en productos y recetas ────────
app.get("/server/admin/fix-precios", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  const eid = c.req.query('empresa_id') || auth.empresaId;
  const resultado: Record<string, any> = { empresa_id: eid };
  try {
    // ── 1. Productos ──────────────────────────────────────────────────────────
    const productosKV: any[] = (await kv.get(`empresa_${eid}_productos`)) || [];
    let prodActualizados = 0, prodSinPrecio = 0;
    for (const p of productosKV) {
      if (!p.id) continue;
      const precio = Number(p.precio_venta || p.precio || 0);
      const costo  = Number(p.precio_costo || p.costo_unitario || p.costo || 0);
      if (precio === 0) { prodSinPrecio++; continue; }
      await db.from('productos')
        .update({ precio, precio_costo: costo, updated_at: new Date().toISOString() })
        .eq('id', p.id).eq('empresa_id', eid);
      prodActualizados++;
    }
    resultado.productos = { total_kv: productosKV.length, actualizados: prodActualizados, sin_precio: prodSinPrecio };

    // ── 2. Recetas ────────────────────────────────────────────────────────────
    const recetasKV: any[] = (await kv.get(`empresa_${eid}_recetas`)) || [];
    let recActualizadas = 0, recSinPrecio = 0;
    for (const r of recetasKV) {
      if (!r.id) continue;
      const precioVenta = Number(r.precio_venta || r.precio || r.precio_sugerido || 0);
      if (precioVenta === 0) { recSinPrecio++; continue; }
      const { data: recActual } = await db.from('recetas')
        .select('metadata').eq('id', r.id).eq('empresa_id', eid).maybeSingle();
      const metaActual = recActual?.metadata || {};
      await db.from('recetas')
        .update({ metadata: { ...metaActual, precio_venta: precioVenta }, updated_at: new Date().toISOString() })
        .eq('id', r.id).eq('empresa_id', eid);
      recActualizadas++;
    }
    resultado.recetas = { total_kv: recetasKV.length, actualizadas: recActualizadas, sin_precio: recSinPrecio };

    return c.json({ ok: true, ...resultado });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message, resultado }, 500);
  }
});

// =====================================================
// MIGRACIÓN KV → SQL  (ejecutar UNA SOLA VEZ)
// POST /server/admin/migrar-datos
// Solo accesible para super_admin
// =====================================================

app.post("/server/admin/migrar-datos", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  if (auth.userRole !== 'super_admin') {
    return c.json({ error: 'Solo super_admin puede ejecutar la migración' }, 403);
  }

  const db = createClient(supabaseUrl, supabaseServiceKey);
  const resumen: Record<string, any> = { inicio: new Date().toISOString(), empresas: {} };

  // ── Aplicar columnas faltantes (idempotente) ──────────────────────────────
  try {
    const sqls = [
      `ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_venta   DECIMAL(12,4) DEFAULT 0`,
      `ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_unitario DECIMAL(12,4) DEFAULT 0`,
      `UPDATE productos SET precio_venta   = precio       WHERE (precio_venta   IS NULL OR precio_venta   = 0) AND precio > 0`,
      `UPDATE productos SET precio         = precio_venta WHERE (precio         IS NULL OR precio         = 0) AND precio_venta > 0`,
      `UPDATE productos SET costo_unitario = precio_costo WHERE (costo_unitario IS NULL OR costo_unitario = 0) AND precio_costo > 0`,
    ];
    for (const sql of sqls) {
      await db.rpc('exec_sql', { sql }).catch(() => {}); // ignorar si rpc no existe
    }
    resumen['schema_fix'] = '✅ columnas verificadas';
  } catch { resumen['schema_fix'] = 'skipped (sin rpc exec_sql)'; }

  // UUID validator
  const isUUID = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  // Columnas permitidas por tabla (basado en migraciones 003-006)
  const COLS: Record<string, Set<string>> = {
    categorias: new Set(['id','empresa_id','nombre','color','icono','activo','metadata','created_at','updated_at']),
    productos: new Set(['id','empresa_id','nombre','descripcion','precio','precio_costo','stock_actual','stock','stock_minimo','unidad','categoria_id','categoria','codigo','codigo_barras','imagen_url','tiene_iva','es_compuesto','tipo','activo','metadata','updated_at','created_at','proveedor_id','proveedor_nombre']),
    clientes: new Set(['id','empresa_id','nombre','identificacion','tipo_identificacion','email','telefono','direccion','activo','metadata','created_at','updated_at']),
    proveedores: new Set(['id','empresa_id','nombre','ruc','contacto','activo','metadata','created_at','updated_at','dias_credito','email','telefono','direccion','ciudad','pais','banco','cuenta_bancaria','tipo_cuenta']),
    empleados: new Set(['id','empresa_id','nombre','puesto','cedula','salario','email','telefono','fecha_ingreso','activo','metadata','created_at','updated_at']),
    recetas: new Set(['id','empresa_id','nombre','activo','producto_id','rendimiento','costo_total','ingredientes','metadata','created_at','updated_at','categoria','tiempo_preparacion','porciones','notas']),
    ordenes_produccion: new Set(['id','empresa_id','numero','receta_id','receta_nombre','cantidad','estado','fecha_inicio','fecha_fin','notas','metadata','created_at','updated_at','bodega_origen_id','bodega_origen_nombre','bodega_destino_id','bodega_destino_nombre','producto_nombre','cantidad_real','merma','merma_porcentaje','responsable']),
    comandas: new Set(['id','empresa_id','numero_orden','mesa','tipo_servicio','estado','notas','mesero_id','cajero_id','items','metadata','created_at','updated_at','fecha_completado','tiempo_preparacion','prioridad','bodega_id','cliente_nombre','subtotal','descuento','iva','total','forma_pago']),
    ventas: new Set(['id','empresa_id','numero','comanda_id','cliente_id','cliente_nombre','subtotal','descuento','iva','total','forma_pago','estado','cajero_id','notas','items','metadata','created_at','bodega_id','mesero_id','mesa','tipo_servicio','numero_orden','anulada','motivo_anulacion','updated_at']),
    compras: new Set(['id','empresa_id','numero','proveedor_id','proveedor_nombre','subtotal','iva','total','estado','fecha','items','metadata','created_at','estado_pago','forma_pago','bodega_id','notas','updated_at']),
    cuentas_por_pagar: new Set(['id','empresa_id','compra_id','proveedor_id','proveedor_nombre','monto','monto_pagado','saldo_pendiente','estado','fecha_vencimiento','metadata','created_at','updated_at']),
    movimientos_inventario: new Set(['id','empresa_id','producto_id','producto_nombre','bodega_id','tipo','cantidad','costo_total','motivo','referencia','usuario_id','metadata','created_at','bodega_destino_id','costo_total','stock_anterior','stock_nuevo']),
    cuentas_contables: new Set(['id','empresa_id','codigo','nombre','tipo','es_grupo','padre_id','activo','metadata','created_at','updated_at','nivel']),
    asientos_contables: new Set(['id','empresa_id','numero','fecha','descripcion','tipo','referencia','estado','origen_automatico','total_debito','total_credito','items','metadata','created_at','updated_at']),
    mermas: new Set(['id','empresa_id','producto_id','producto_nombre','cantidad','motivo','bodega_id','usuario_id','metadata','created_at']),
  };

  // Obtener todas las empresas
  const { data: empresas } = await db.from('empresas').select('id, nombre');

  for (const empresa of (empresas || [])) {
    const eid = empresa.id;
    resumen.empresas[empresa.nombre || eid] = {};
    const res = resumen.empresas[empresa.nombre || eid];

    // Helper para migrar — solo inserta columnas conocidas de la tabla SQL
    const migrar = async (kvKey: string, tabla: string, extras: Record<string,any> = {}) => {
      try {
        const datos: any[] = (await kv.get(kvKey)) || [];
        if (datos.length === 0) { res[tabla] = 'vacío en KV'; return; }
        const cols = COLS[tabla] || new Set<string>();
        // Campos que deben ser UUID o null (no strings de texto)
        const UUID_FIELDS = new Set(['categoria_id','proveedor_id','cliente_id','receta_id','comanda_id','producto_id','bodega_id','bodega_destino_id','padre_id','compra_id']);
        const filas = datos.map((d: any) => {
          const raw = { ...d, empresa_id: eid, ...extras };
          raw.id = isUUID(raw.id) ? raw.id : crypto.randomUUID();
          // Normalizar campos de precio para productos
          if (tabla === 'productos') {
            raw.precio_venta = raw.precio_venta || raw.precio || 0;
            raw.precio       = raw.precio       || raw.precio_venta || 0;
            raw.precio_costo = raw.precio_costo || raw.costo_unitario || raw.costo || 0;
            raw.costo_unitario = raw.costo_unitario || raw.precio_costo || raw.costo || 0;
            raw.stock_actual = raw.stock_actual ?? raw.stock ?? 0;
          }
          const fila: Record<string, any> = {};
          for (const [k, v] of Object.entries(raw)) {
            if (!cols.has(k)) continue;
            // Si es campo UUID y el valor no es UUID válido → null
            if (UUID_FIELDS.has(k) && v !== null && v !== undefined && !isUUID(String(v))) {
              fila[k] = null;
            } else {
              fila[k] = v;
            }
          }
          return fila;
        });
        const { error } = await db.from(tabla).upsert(filas, { onConflict: 'id' });
        res[tabla] = error ? `ERROR: ${error.message}` : `✅ ${datos.length} registros`;
      } catch (e: any) {
        res[tabla] = `ERROR: ${e.message}`;
      }
    };

    // Migrar en orden (respetar foreign keys)
    await migrar(`empresa_${eid}_categorias`,          'categorias');
    await migrar(`empresa_${eid}_productos`,            'productos');
    await migrar(`empresa_${eid}_clientes`,             'clientes');
    await migrar(`empresa_${eid}_proveedores`,          'proveedores');
    await migrar(`empresa_${eid}_empleados`,            'empleados');
    await migrar(`empresa_${eid}_recetas`,              'recetas');
    await migrar(`empresa_${eid}_ordenes_produccion`,   'ordenes_produccion');
    await migrar(`empresa_${eid}_comandas`,             'comandas');
    await migrar(`empresa_${eid}_ventas`,               'ventas');
    await migrar(`empresa_${eid}_compras`,              'compras');
    await migrar(`empresa_${eid}_cxp`,                  'cuentas_por_pagar');
    await migrar(`empresa_${eid}_movimientos`,          'movimientos_inventario');
    await migrar(`empresa_${eid}_cuentas_contables`,    'cuentas_contables');
    await migrar(`empresa_${eid}_asientos_contables`,   'asientos_contables');
    await migrar(`mermas_${eid}`,                       'mermas');

    // Stock por bodega (estructura anidada)
    try {
      const stockKV: Record<string, Record<string, number>> =
        (await kv.get(`stock_bodegas_${eid}`)) || {};

      // Obtener bodegas reales de la empresa para mapear IDs de KV → UUIDs
      const { data: bodegasReales } = await db.from('bodegas')
        .select('id, codigo, nombre').eq('empresa_id', eid);
      const bodegasPorCodigo: Record<string, string> = {};
      for (const b of (bodegasReales || [])) {
        if (b.codigo) bodegasPorCodigo[b.codigo] = b.id;
      }

      // Función para detectar UUID válido
      const isUUID = (s: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

      const filas: any[] = [];
      for (const [bodegaId, productos] of Object.entries(stockKV)) {
        // Resolver UUID: si ya es UUID úsalo, si no, busca por código
        let realUUID = isUUID(bodegaId) ? bodegaId : bodegasPorCodigo[bodegaId];
        if (!realUUID) continue; // no se puede mapear, saltar
        for (const [productoNombre, cantidad] of Object.entries(productos as Record<string, number>)) {
          filas.push({ empresa_id: eid, bodega_id: realUUID, producto_nombre: productoNombre, cantidad });
        }
      }
      if (filas.length > 0) {
        const { error } = await db.from('stock_bodegas_sql')
          .upsert(filas, { onConflict: 'bodega_id,producto_nombre' });
        res['stock_bodegas_sql'] = error ? `ERROR: ${error.message}` : `✅ ${filas.length} registros`;
      } else {
        res['stock_bodegas_sql'] = 'vacío en KV (IDs de bodega no mapeables a UUID)';
      }
    } catch (e: any) {
      res['stock_bodegas_sql'] = `ERROR: ${e.message}`;
    }

    // Presupuestos (una key por año)
    for (const anio of [2023, 2024, 2025, 2026]) {
      try {
        const items = await kv.get(`empresa_${eid}_presupuesto_${anio}`);
        if (items && (items as any[]).length > 0) {
          await db.from('presupuestos').upsert(
            { empresa_id: eid, anio, items },
            { onConflict: 'empresa_id,anio' }
          );
          res[`presupuesto_${anio}`] = `✅ migrado`;
        }
      } catch { /* ignorar */ }
    }

    // ── Facturación: configuración ────────────────────────────────────────
    try {
      let configKV: any = null;
      for (const kvKey of [
        `empresa_${eid}_facturacion_config`,
        `empresa_${eid}_facturacion`,
        `facturacion_config_${eid}`,
      ]) {
        configKV = await kv.get(kvKey);
        if (configKV) break;
      }
      if (configKV) {
        // Verificar si ya existe en SQL
        const { data: existe } = await db.from('configuracion_facturacion')
          .select('empresa_id').eq('empresa_id', eid).maybeSingle();
        if (!existe) {
          await db.from('configuracion_facturacion').insert({
            empresa_id: eid,
            ruc: configKV.ruc || null,
            razon_social: configKV.razon_social || null,
            nombre_comercial: configKV.nombre_comercial || null,
            direccion_matriz: configKV.direccion_matriz || null,
            direccion_establecimiento: configKV.direccion_establecimiento || null,
            telefono: configKV.telefono || null,
            email: configKV.email || null,
            obligado_contabilidad: configKV.obligado_contabilidad || false,
            regimen_rimpe: configKV.regimen_rimpe || false,
            ambiente: configKV.ambiente || 'pruebas',
            secuencial_actual: configKV.secuencial_actual || 0,
            codigo_establecimiento: configKV.codigo_establecimiento || '001',
            codigo_punto_emision: configKV.punto_emision || configKV.codigo_punto_emision || '001',
            tiene_certificado: configKV.tiene_certificado || configKV.firma_electronica_activa || false,
            metadata: configKV,
            updated_at: new Date().toISOString(),
          });
          res['configuracion_facturacion'] = '✅ migrado desde KV';
        } else {
          res['configuracion_facturacion'] = 'ya existía en SQL';
        }
      } else {
        res['configuracion_facturacion'] = 'vacío en KV';
      }
    } catch (e: any) {
      res['configuracion_facturacion'] = `ERROR: ${e.message}`;
    }

    // ── Facturación: certificado ──────────────────────────────────────────
    try {
      let certKV: any = null;
      for (const kvKey of [
        `empresa_${eid}_facturacion_cert`,
        `empresa_${eid}_cert`,
        `certificado_${eid}`,
      ]) {
        certKV = await kv.get(kvKey);
        if (certKV) break;
      }
      if (certKV) {
        const { data: existe } = await db.from('certificados_facturacion')
          .select('empresa_id').eq('empresa_id', eid).maybeSingle();
        if (!existe) {
          await db.from('certificados_facturacion').insert({
            empresa_id: eid,
            nombre: certKV.nombre || 'certificado.p12',
            p12_base64: certKV.p12_base64 || null,
            password: certKV.password || null,
            valido_desde: certKV.info?.valido_desde || certKV.valido_desde || null,
            valido_hasta: certKV.info?.valido_hasta || certKV.valido_hasta || null,
            titular: certKV.info?.titular || certKV.titular || null,
            metadata: certKV,
            updated_at: new Date().toISOString(),
          });
          res['certificados_facturacion'] = '✅ migrado desde KV';
        } else {
          res['certificados_facturacion'] = 'ya existía en SQL';
        }
      } else {
        res['certificados_facturacion'] = 'vacío en KV';
      }
    } catch (e: any) {
      res['certificados_facturacion'] = `ERROR: ${e.message}`;
    }

    // ── Facturación: facturas emitidas ────────────────────────────────────
    try {
      // Buscar facturas individuales por prefijo
      const prefixEntries = await kv.getByPrefixWithKeys(`empresa_${eid}_factura_`);
      // También probar objeto/array en clave única
      let singleObj: any[] = [];
      const singleKV = await kv.get(`empresa_${eid}_facturas`);
      if (singleKV && typeof singleKV === 'object' && !Array.isArray(singleKV)) {
        singleObj = Object.entries(singleKV).map(([k, v]: [string, any]) => [k, v] as [string, any]);
      } else if (Array.isArray(singleKV)) {
        singleObj = (singleKV as any[]).map((f: any) => [f.numero_factura || crypto.randomUUID(), f]);
      }
      const allEntries: [string, any][] = [...prefixEntries, ...singleObj];

      if (allEntries.length > 0) {
        const filas = allEntries.map(([facturaKey, factura]: [string, any]) => {
          const key = String(facturaKey).replace(`empresa_${eid}_factura_`, '');
          return {
            empresa_id: eid,
            factura_key: key,
            numero_factura: factura.numero_factura || key,
            clave_acceso: factura.clave_acceso || null,
            ambiente: factura.ambiente || 'pruebas',
            estado: factura.estado || factura.estado_autorizacion || 'PENDIENTE',
            estado_autorizacion: factura.estado_autorizacion || factura.estado || 'PENDIENTE',
            fecha_autorizacion: factura.fecha_autorizacion || null,
            numero_autorizacion: factura.numero_autorizacion || null,
            mensajes_sri: factura.mensajes_sri || [],
            razon_social: factura.razon_social || null,
            ruc: factura.ruc || null,
            cliente_identificacion: factura.cliente_identificacion || null,
            cliente_tipo_identificacion: factura.cliente_tipo_identificacion || null,
            cliente_razon_social: factura.cliente_razon_social || null,
            cliente_email: factura.cliente_email || null,
            subtotal_iva: factura.subtotal_iva ?? factura.subtotal ?? 0,
            subtotal_0: factura.subtotal_0 ?? 0,
            total_descuento: factura.total_descuento ?? factura.descuento ?? 0,
            iva: factura.iva ?? 0,
            total: factura.total ?? 0,
            items: factura.items || [],
            formas_pago: factura.formas_pago || [],
            datos_completos: factura,
            fecha_emision: factura.fecha_emision || null,
            hora_emision: factura.hora_emision || null,
            created_at: factura.created_at || factura.creado_en || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        });
        const { error } = await db.from('facturas')
          .upsert(filas, { onConflict: 'empresa_id,factura_key' });
        res['facturas'] = error ? `ERROR: ${error.message}` : `✅ ${filas.length} facturas`;
      } else {
        res['facturas'] = 'vacío en KV';
      }
    } catch (e: any) {
      res['facturas'] = `ERROR: ${e.message}`;
    }
  }

  resumen.fin = new Date().toISOString();
  return c.json({ success: true, resumen });
});

// ══════════════════════════════════════════════════════════════════════════════
// REPORTES DESCARGABLES
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /reportes/estado-cuenta-cliente/:clienteId ───────────────────────────
app.get("/server/reportes/estado-cuenta-cliente/:clienteId", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const clienteId = c.req.param('clienteId');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { desde, hasta } = c.req.query() as any;
    const [clienteRes, facturasRes] = await Promise.all([
      db.from('clientes').select('*').eq('id', clienteId).eq('empresa_id', auth.empresaId).maybeSingle(),
      db.from('facturas').select('numero_factura,fecha_emision,total,estado,estado_autorizacion,items,clave_acceso')
        .eq('empresa_id', auth.empresaId).eq('cliente_id', clienteId)
        .order('fecha_emision', { ascending: false }).limit(200),
    ]);
    let facturas = facturasRes.data || [];
    if (desde) facturas = facturas.filter((f: any) => (f.fecha_emision || '') >= desde);
    if (hasta) facturas = facturas.filter((f: any) => (f.fecha_emision || '') <= hasta);

    const totalFacturado = facturas.reduce((s: number, f: any) => s + Number(f.total || 0), 0);
    const autorizadas    = facturas.filter((f: any) => f.estado_autorizacion === 'AUTORIZADO' || f.estado === 'AUTORIZADO');
    const pendientes     = facturas.filter((f: any) => f.estado_autorizacion !== 'AUTORIZADO' && f.estado !== 'AUTORIZADO');

    return c.json({
      cliente: clienteRes.data || {},
      facturas,
      resumen: {
        total_documentos: facturas.length,
        total_facturado: Math.round(totalFacturado * 100) / 100,
        autorizadas: autorizadas.length,
        pendientes: pendientes.length,
        monto_autorizado: Math.round(autorizadas.reduce((s: number, f: any) => s + Number(f.total || 0), 0) * 100) / 100,
      },
    });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── GET /reportes/clientes — lista clientes con resumen de facturación ────────
app.get("/server/reportes/clientes-facturacion", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { data: clientes } = await db.from('clientes')
      .select('id,nombre,identificacion,email,telefono,total_compras,ultima_compra')
      .eq('empresa_id', auth.empresaId).order('total_compras', { ascending: false }).limit(200);
    return c.json({ clientes: clientes || [] });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── GET /reportes/mermas — mermas desde movimientos y producción ──────────────
app.get("/server/reportes/mermas", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { desde, hasta } = c.req.query() as any;
    // Movimientos de tipo merma / ajuste salida
    let qMov = db.from('movimientos_inventario')
      .select('id,producto_id,cantidad,costo_unitario,costo_total,observaciones,referencia,created_at')
      .eq('empresa_id', auth.empresaId)
      .in('tipo', ['merma', 'ajuste_salida', 'perdida', 'vencimiento'])
      .order('created_at', { ascending: false });
    if (desde) qMov = qMov.gte('created_at', new Date(desde + 'T00:00:00Z').toISOString());
    if (hasta) qMov = qMov.lte('created_at', new Date(hasta + 'T23:59:59Z').toISOString());
    const { data: movs } = await qMov;

    // Mermas desde órdenes de producción
    let qProd = db.from('produccion_ordenes')
      .select('numero_orden,producto_nombre,merma,merma_porcentaje,fecha_completada,notas')
      .eq('empresa_id', auth.empresaId).gt('merma', 0)
      .order('fecha_completada', { ascending: false });
    if (desde) qProd = qProd.gte('fecha_completada', desde);
    if (hasta) qProd = qProd.lte('fecha_completada', hasta);
    const { data: prodMermas } = await qProd;

    const movsMapeados = (movs || []).map((m: any) => ({
      origen: 'movimiento',
      fecha: m.created_at,
      producto: m.producto_id || '—',
      cantidad: Number(m.cantidad),
      costo_unitario: Number(m.costo_unitario || m.costo_total || 0),
      valor: Number(m.costo_total || Number(m.cantidad) * Number(m.costo_unitario || 0)),
      motivo: m.observaciones || m.referencia || '—',
    }));
    const prodMapeadas = (prodMermas || []).map((p: any) => ({
      origen: 'produccion',
      fecha: p.fecha_completada,
      producto: p.producto_nombre || '—',
      cantidad: Number(p.merma || 0),
      costo_unitario: 0,
      valor: 0,
      motivo: `Orden ${p.numero_orden}${p.notas ? ' — ' + p.notas : ''}`,
    }));

    const todas = [...movsMapeados, ...prodMapeadas]
      .sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());
    const totalValor = todas.reduce((s, m) => s + m.valor, 0);
    const totalCant  = todas.reduce((s, m) => s + m.cantidad, 0);

    // Agrupar por producto
    const porProducto: Record<string, any> = {};
    for (const m of todas) {
      if (!porProducto[m.producto]) porProducto[m.producto] = { producto: m.producto, cantidad: 0, valor: 0, eventos: 0 };
      porProducto[m.producto].cantidad += m.cantidad;
      porProducto[m.producto].valor    += m.valor;
      porProducto[m.producto].eventos  += 1;
    }

    return c.json({
      mermas: todas,
      por_producto: Object.values(porProducto).sort((a: any, b: any) => b.valor - a.valor),
      resumen: { total_eventos: todas.length, total_cantidad: Math.round(totalCant * 100) / 100, total_valor: Math.round(totalValor * 100) / 100 },
    });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── GET /reportes/flujo-caja — proyección CxP + CxC ──────────────────────────
app.get("/server/reportes/flujo-caja", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const dias = Number((c.req.query() as any).dias || 60);
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const limite = new Date(hoy.getTime() + dias * 86400000);

    // CxP pendientes
    const { data: cxp } = await db.from('cuentas_por_pagar')
      .select('numero,proveedor_nombre,monto_total,saldo_pendiente,fecha_vencimiento,estado')
      .eq('empresa_id', auth.empresaId).neq('estado', 'pagada')
      .lte('fecha_vencimiento', limite.toISOString().split('T')[0])
      .order('fecha_vencimiento');

    // Caja actual
    const { data: turno } = await db.from('turnos_caja')
      .select('monto_inicial,ventas_total,fecha_apertura')
      .eq('empresa_id', auth.empresaId).eq('estado', 'abierta')
      .order('fecha_apertura', { ascending: false }).limit(1).maybeSingle();

    // Ventas promedio últimos 30 días
    const hace30 = new Date(hoy.getTime() - 30 * 86400000);
    const ventas = await obtenerVentas(auth.empresaId);
    const ventasActivas = ventas.filter((v: any) => !v.anulada && (v.fecha || v.created_at) >= hace30.toISOString());
    const totalVentas30 = ventasActivas.reduce((s: number, v: any) => s + Number(v.total || 0), 0);
    const promDiario = totalVentas30 / 30;

    // Construir proyección por semana
    const proyeccion: any[] = [];
    for (let i = 0; i < dias; i += 7) {
      const fechaIni = new Date(hoy.getTime() + i * 86400000);
      const fechaFin = new Date(hoy.getTime() + Math.min(i + 6, dias - 1) * 86400000);
      const label = `${fechaIni.toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit' })} – ${fechaFin.toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit' })}`;
      const iniStr = fechaIni.toISOString().split('T')[0];
      const finStr = fechaFin.toISOString().split('T')[0];
      const pagosSemana = (cxp || []).filter((p: any) => p.fecha_vencimiento >= iniStr && p.fecha_vencimiento <= finStr)
        .reduce((s: number, p: any) => s + Number(p.saldo_pendiente || 0), 0);
      const ventasSemana = promDiario * Math.min(7, dias - i);
      proyeccion.push({ semana: label, ingresos_proyectados: Math.round(ventasSemana * 100)/100, egresos_cxp: Math.round(pagosSemana * 100)/100, balance: Math.round((ventasSemana - pagosSemana) * 100)/100 });
    }

    const saldoCaja = turno ? Number(turno.monto_inicial || 0) + Number(turno.ventas_total || 0) : 0;
    const totalCxP  = (cxp || []).reduce((s: number, p: any) => s + Number(p.saldo_pendiente || 0), 0);

    return c.json({
      saldo_caja_actual: Math.round(saldoCaja * 100) / 100,
      cxp_pendiente_total: Math.round(totalCxP * 100) / 100,
      venta_promedio_diaria: Math.round(promDiario * 100) / 100,
      cxp: cxp || [],
      proyeccion,
      dias_proyectados: dias,
    });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── GET /reportes/ventas-por-producto — historial de ventas por producto ──────
app.get("/server/reportes/ventas-por-producto", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  try {
    const { desde, hasta } = c.req.query() as any;
    const ventas = await obtenerVentas(auth.empresaId);
    const activas = ventas.filter((v: any) => !v.anulada);
    const ventasFiltradas = activas.filter((v: any) => {
      const f = v.fecha || v.created_at || '';
      return (!desde || f >= desde) && (!hasta || f <= hasta);
    });

    // Agrupar por producto
    const map: Record<string, any> = {};
    for (const v of ventasFiltradas) {
      for (const item of (v.items || [])) {
        const pid  = item.producto_id || item.id || item.nombre;
        const nombre = item.nombre || item.descripcion || pid;
        if (!map[pid]) map[pid] = { producto_id: pid, nombre, codigo: item.codigo || '', categoria: item.categoria || '', cantidad: 0, subtotal: 0, descuento: 0, ventas: 0 };
        map[pid].cantidad  += Number(item.cantidad || 1);
        map[pid].subtotal  += Number(item.subtotal || (item.costo_total * item.cantidad) || 0);
        map[pid].descuento += Number(item.descuento || 0);
        map[pid].ventas    += 1;
      }
    }

    const productos = Object.values(map)
      .map((p: any) => ({ ...p, subtotal: Math.round(p.subtotal * 100) / 100, ticket_promedio: p.ventas > 0 ? Math.round((p.subtotal / p.ventas) * 100) / 100 : 0 }))
      .sort((a: any, b: any) => b.subtotal - a.subtotal);

    const totalSubtotal = productos.reduce((s: number, p: any) => s + p.subtotal, 0);
    const totalCantidad = productos.reduce((s: number, p: any) => s + p.cantidad, 0);

    return c.json({
      productos,
      resumen: {
        total_productos_vendidos: productos.length,
        total_cantidad: Math.round(totalCantidad * 100) / 100,
        total_subtotal: Math.round(totalSubtotal * 100) / 100,
        total_ventas: ventasFiltradas.length,
        periodo: { desde: desde || 'todo', hasta: hasta || 'hoy' },
      },
    });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── GET /inventario/kardex-consolidado — kardex de todos los productos ─────────
app.get("/server/inventario/kardex-consolidado", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { desde, hasta, limit = '1000' } = c.req.query() as any;
    let q = db.from('movimientos_inventario')
      .select('id,tipo,cantidad,costo_unitario,costo_total,observaciones,referencia,created_at,producto_id,bodega_id')
      .eq('empresa_id', auth.empresaId)
      .order('created_at', { ascending: true })
      .limit(Number(limit));
    if (desde) q = q.gte('created_at', new Date(desde + 'T00:00:00Z').toISOString());
    if (hasta) q = q.lte('created_at', new Date(hasta + 'T23:59:59Z').toISOString());
    const { data: movs } = await q;

    // Calcular saldo acumulado por producto
    const saldos: Record<string, number> = {};
    const filas = (movs || []).map((m: any) => {
      const pid   = m.producto_id || m.producto_nombre || '';
      const delta = (m.tipo === 'entrada' || m.tipo === 'compra' || m.tipo === 'ajuste_entrada')
        ? Number(m.cantidad) : -Number(m.cantidad);
      saldos[pid] = (saldos[pid] || 0) + delta;
      return {
        fecha:           m.created_at,
        producto:        m.producto_nombre || '—',
        tipo:            m.tipo,
        referencia:      m.referencia || '',
        entrada:         delta > 0 ? Math.abs(delta) : null,
        salida:          delta < 0 ? Math.abs(delta) : null,
        saldo:           Math.round(saldos[pid] * 10000) / 10000,
        costo_unitario: Number(m.costo_unitario || m.costo_total || 0),
        valor: Number(m.costo_total || Math.abs(delta) * Number(m.costo_unitario || 0)),
      };
    });

    return c.json({ kardex: filas, total_movimientos: filas.length, saldos_finales: saldos });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── GET /inventario/kardex/:productoId — Kardex con saldo acumulado ──────────
app.get("/server/inventario/kardex/:productoId", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const productoId = c.req.param('productoId');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { desde, hasta, limit = '200' } = c.req.query() as any;

    let q = db.from('movimientos_inventario')
      .select('id,tipo,cantidad,costo_unitario,costo_total,observaciones,referencia,created_at,producto_id,bodega_id,usuario_id')
      .eq('empresa_id', auth.empresaId)
      .eq('producto_id', productoId)
      .order('created_at', { ascending: true })
      .limit(Number(limit));

    if (desde) q = q.gte('created_at', new Date(desde + 'T00:00:00Z').toISOString());
    if (hasta) q = q.lte('created_at', new Date(hasta + 'T23:59:59Z').toISOString());

    const { data: movs, error } = await q;
    if (error) throw error;

    // Producto para saldo inicial
    const { data: prod } = await db.from('productos')
      .select('nombre, stock_actual, precio_costo, unidad')
      .eq('id', productoId).eq('empresa_id', auth.empresaId).maybeSingle();

    // Calcular saldo acumulado desde primer movimiento
    let saldo = 0;
    const filas = (movs || []).map((m: any) => {
      const delta = m.tipo === 'entrada' || m.tipo === 'compra' || m.tipo === 'ajuste_entrada'
        ? Number(m.cantidad) : -Number(m.cantidad);
      saldo += delta;
      return {
        id:              m.id,
        fecha:           m.created_at,
        tipo:            m.tipo,
        referencia:      m.referencia || '',
        motivo:          m.motivo || '',
        entrada:         delta > 0 ? Math.abs(delta) : null,
        salida:          delta < 0 ? Math.abs(delta) : null,
        saldo:           Math.round(saldo * 10000) / 10000,
        costo_unitario: Number(m.costo_unitario || m.costo_total || 0),
        valor_movimiento: Number(m.costo_total || Math.abs(delta) * Number(m.costo_unitario || 0)),
      };
    });

    return c.json({
      producto: prod || { nombre: 'Producto', stock_actual: 0 },
      kardex: filas,
      saldo_final: saldo,
      total_movimientos: filas.length,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /inventario/snapshot — guarda foto del stock del mes ────────────────
app.post("/server/inventario/snapshot", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const body = await c.req.json().catch(() => ({}));
    const OFFSET_EC = 5 * 3600 * 1000;
    const ahoraEC   = new Date(Date.now() - OFFSET_EC);
    const anio  = body.anio  ?? ahoraEC.getFullYear();
    const mes   = body.mes   ?? ahoraEC.getMonth() + 1;
    const notas = body.notas ?? `Cierre ${mes}/${anio}`;

    // Leer stock actual de todos los productos
    const productos = await obtenerProductos(auth.empresaId);
    const items = productos.map((p: any) => ({
      producto_id: p.id,
      nombre:      p.nombre,
      codigo:      p.codigo || '',
      categoria:   p.categoria || '',
      unidad:      p.unidad_medida || p.unidad || 'und',
      stock:       Number(p.stock_actual ?? p.stock ?? 0),
      costo:       Number(p.precio_compra || p.costo_unitario || p.precio_costo || 0),
      valor:       Number(p.stock_actual ?? 0) * Number(p.precio_compra || p.costo_unitario || 0),
    }));

    const totalValor    = items.reduce((s: number, i: any) => s + i.valor, 0);
    const fechaCierre   = `${anio}-${String(mes).padStart(2,'0')}-${String(new Date(anio, mes, 0).getDate()).padStart(2,'0')}`;

    const { data, error } = await db.from('inventario_snapshots')
      .upsert({
        empresa_id: auth.empresaId,
        anio, mes,
        fecha_cierre:    fechaCierre,
        items,
        total_valor:     Math.round(totalValor * 100) / 100,
        total_productos: items.length,
        notas,
        usuario_id:      auth.userId,
      }, { onConflict: 'empresa_id,anio,mes' })
      .select().single();

    if (error) throw error;
    return c.json({ ok: true, snapshot: data, total_productos: items.length, total_valor: totalValor });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── GET /inventario/snapshots — lista snapshots guardados ────────────────────
app.get("/server/inventario/snapshots", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { data, error } = await db.from('inventario_snapshots')
      .select('id, anio, mes, fecha_cierre, total_valor, total_productos, notas, created_at')
      .eq('empresa_id', auth.empresaId)
      .order('anio', { ascending: false }).order('mes', { ascending: false })
      .limit(24);
    if (error) throw error;
    return c.json({ snapshots: data || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── GET /inventario/comparativo — compara dos periodos por producto ───────────
// Query params: periodo1=2025-05  periodo2=2026-05
app.get("/server/inventario/comparativo", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  const { periodo1, periodo2 } = c.req.query() as any;

  if (!periodo1 || !periodo2)
    return c.json({ error: 'Se requieren periodo1 y periodo2 (formato YYYY-MM)' }, 400);

  try {
    const parseP = (p: string) => { const [y, m] = p.split('-'); return { anio: Number(y), mes: Number(m) }; };
    const p1 = parseP(periodo1);
    const p2 = parseP(periodo2);

    // Buscar snapshots para cada periodo
    const [snapP1, snapP2] = await Promise.all([
      db.from('inventario_snapshots').select('items, total_valor')
        .eq('empresa_id', auth.empresaId).eq('anio', p1.anio).eq('mes', p1.mes).maybeSingle(),
      db.from('inventario_snapshots').select('items, total_valor')
        .eq('empresa_id', auth.empresaId).eq('anio', p2.anio).eq('mes', p2.mes).maybeSingle(),
    ]);

    // Ventas por producto en cada periodo (usando movimientos)
    const ventasPorPeriodo = async (anio: number, mes: number) => {
      const ini = new Date(anio, mes - 1, 1).toISOString();
      const fin = new Date(anio, mes, 0, 23, 59, 59).toISOString();
      const { data } = await db.from('movimientos_inventario')
        .select('producto_id, producto_nombre, cantidad, tipo')
        .eq('empresa_id', auth.empresaId)
        .in('tipo', ['salida', 'venta'])
        .gte('created_at', ini).lte('created_at', fin);
      const map: Record<string, { nombre: string; cantidad: number }> = {};
      for (const m of (data || [])) {
        if (!map[m.producto_id]) map[m.producto_id] = { nombre: m.producto_nombre || '', cantidad: 0 };
        map[m.producto_id].cantidad += Number(m.cantidad);
      }
      return map;
    };

    const [ventas1, ventas2] = await Promise.all([
      ventasPorPeriodo(p1.anio, p1.mes),
      ventasPorPeriodo(p2.anio, p2.mes),
    ]);

    // Construir tabla comparativa
    const items1: any[] = snapP1.data?.items || [];
    const items2: any[] = snapP2.data?.items || [];
    const todosIds = new Set([...items1.map((i: any) => i.producto_id), ...items2.map((i: any) => i.producto_id)]);

    const comparativa = Array.from(todosIds).map(pid => {
      const i1 = items1.find((i: any) => i.producto_id === pid);
      const i2 = items2.find((i: any) => i.producto_id === pid);
      const nombre  = i1?.nombre || i2?.nombre || '';
      const stock1  = i1?.stock  ?? null;
      const stock2  = i2?.stock  ?? null;
      const venCant1 = ventas1[pid]?.cantidad ?? null;
      const venCant2 = ventas2[pid]?.cantidad ?? null;
      const varStock = stock1 !== null && stock2 !== null ? ((stock2 - stock1) / Math.max(stock1, 0.001)) * 100 : null;
      const varVenta = venCant1 !== null && venCant2 !== null ? ((venCant2 - venCant1) / Math.max(venCant1, 0.001)) * 100 : null;
      return {
        producto_id: pid,
        nombre,
        codigo:  i1?.codigo  || i2?.codigo  || '',
        unidad:  i1?.unidad  || i2?.unidad  || 'und',
        stock_p1: stock1, stock_p2: stock2,
        ventas_p1: venCant1, ventas_p2: venCant2,
        var_stock_pct: varStock !== null ? Math.round(varStock * 10) / 10 : null,
        var_ventas_pct: varVenta !== null ? Math.round(varVenta * 10) / 10 : null,
        valor_p1: i1?.valor ?? null,
        valor_p2: i2?.valor ?? null,
      };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre));

    return c.json({
      periodo1: { ...p1, label: periodo1, tiene_snapshot: !!snapP1.data },
      periodo2: { ...p2, label: periodo2, tiene_snapshot: !!snapP2.data },
      comparativa,
      resumen: {
        valor_total_p1: snapP1.data?.total_valor ?? 0,
        valor_total_p2: snapP2.data?.total_valor ?? 0,
        var_valor_pct: snapP1.data && snapP2.data
          ? Math.round(((snapP2.data.total_valor - snapP1.data.total_valor) / Math.max(snapP1.data.total_valor, 0.01)) * 1000) / 10
          : null,
      },
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /admin/generar-asientos-ventas — genera asientos faltantes ──────────
// Recibe { fecha_inicio, fecha_fin } (YYYY-MM-DD). Sin parámetros = últimos 7 días.
app.post("/server/admin/generar-asientos-ventas", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);

  let body: any = {};
  try { body = await c.req.json(); } catch { /* sin body */ }

  const OFFSET_EC = 5 * 3600 * 1000;
  const ahoraEC   = new Date(Date.now() - OFFSET_EC);
  const desdeFecha = body.fecha_inicio ?? new Date(Date.now() - 7 * 86400000 - OFFSET_EC).toISOString().split('T')[0];
  const hastaFecha = body.fecha_fin   ?? ahoraEC.toISOString().split('T')[0];

  // Rango en UTC: desde medianoche Ecuador del primer día hasta fin del último día Ecuador
  const desdeUTC = new Date(desdeFecha + 'T00:00:00Z').getTime() + OFFSET_EC; // medianoche EC en UTC
  const hastaUTC = new Date(hastaFecha + 'T23:59:59Z').getTime() + OFFSET_EC; // fin de día EC en UTC

  try {
    // 1. Obtener TODAS las ventas del rango (tanto por created_at como por fecha)
    //    Se consulta con una ventana amplia +/- 6h para no perder nada por TZ
    const { data: ventas, error: ventasErr } = await db
      .from('ventas')
      .select('id, numero_ticket, total, impuestos, metodo_pago, created_at, fecha, anulada')
      .eq('empresa_id', auth.empresaId)
      .gte('created_at', new Date(desdeUTC - 6 * 3600000).toISOString())
      .lte('created_at', new Date(hastaUTC + 6 * 3600000).toISOString());

    if (ventasErr) throw new Error('Error obteniendo ventas: ' + ventasErr.message);

    // Filtrar por fecha Ecuador (por si created_at difiere)
    const ventasEnRango = (ventas || []).filter((v: any) => {
      const ts = v.fecha || v.created_at || '';
      if (!ts) return false;
      const fechaEC = new Date(new Date(ts).getTime() - OFFSET_EC).toISOString().split('T')[0];
      return fechaEC >= desdeFecha && fechaEC <= hastaFecha;
    });

    if (ventasEnRango.length === 0) {
      return c.json({ ok: true, mensaje: `Sin ventas entre ${desdeFecha} y ${hastaFecha}`, generados: 0 });
    }

    // 2. Obtener asientos ya existentes (por referencia = numero_ticket)
    const tickets = ventasEnRango.map((v: any) => v.numero_ticket).filter(Boolean);
    const { data: asientosExistentes } = await db
      .from('asientos_contables')
      .select('referencia')
      .eq('empresa_id', auth.empresaId)
      .in('referencia', tickets.length > 0 ? tickets : ['__ninguno__']);

    const referenciasExistentes = new Set(
      (asientosExistentes || []).map((a: any) => a.referencia)
    );

    // 3. Obtener cuentas contables de la empresa (para verificar que existen)
    const { data: cuentas } = await db
      .from('cuentas_contables')
      .select('codigo, nombre, id')
      .eq('empresa_id', auth.empresaId)
      .eq('es_grupo', false);

    // Mapear cuentas por código para lookup rápido
    const cuentaMap: Record<string, any> = {};
    for (const c of (cuentas || [])) cuentaMap[c.codigo] = c;

    // Reportar qué códigos existen (diagnóstico)
    const codigosDisponibles = Object.keys(cuentaMap);

    // 4. Generar asientos para las ventas sin asiento
    const ventasSinAsiento = ventasEnRango.filter(
      (v: any) => !v.anulada && v.numero_ticket && !referenciasExistentes.has(v.numero_ticket)
    );

    let generados = 0;
    const errores: string[] = [];

    for (const venta of ventasSinAsiento) {
      try {
        const total    = Number(venta.total)     || 0;
        const impuesto = Number(venta.impuestos) || 0;
        const subtotal = total - impuesto;
        const metodo   = (venta.metodo_pago || 'efectivo').toLowerCase();
        const numTicket  = venta.numero_ticket;

        // Calcular fecha Ecuador
        const ts = venta.fecha || venta.created_at || new Date().toISOString();
        const fechaVenta = new Date(new Date(ts).getTime() - OFFSET_EC).toISOString().split('T')[0];

        if (total <= 0) continue;

        // Resolver cuentas — buscar por código exacto primero, luego por prefijo
        const resolveCuenta = (codigo: string) =>
          cuentaMap[codigo] ||
          Object.values(cuentaMap).find((c: any) =>
            c.codigo?.startsWith(codigo.split('.').slice(0, 2).join('.'))
          );

        const ctaCaja   = resolveCuenta('10101');  // Efectivo y Equivalentes (SRI)
        const ctaVentas = resolveCuenta('4101') || resolveCuenta('41');    // Venta de Bienes (SRI)
        const ctaIva    = resolveCuenta('2010701') || resolveCuenta('20107'); // Administración Tributaria (SRI)

        if (!ctaCaja || !ctaVentas) {
          errores.push(`${numTicket}: sin cuentas (disponibles: ${codigosDisponibles.slice(0,10).join(',')})`);
          continue;
        }

        // Construir items del asiento
        const items: any[] = [];
        if (impuesto > 0 && ctaIva) {
          items.push(
            { cuenta_id: ctaCaja.id,   cuenta_codigo: ctaCaja.codigo,   cuenta_nombre: ctaCaja.nombre,   debito: total,    credito: 0,       descripcion: 'Cobro venta' },
            { cuenta_id: ctaVentas.id, cuenta_codigo: ctaVentas.codigo, cuenta_nombre: ctaVentas.nombre, debito: 0,        credito: subtotal, descripcion: 'Ingresos por ventas' },
            { cuenta_id: ctaIva.id,    cuenta_codigo: ctaIva.codigo,    cuenta_nombre: ctaIva.nombre,    debito: 0,        credito: impuesto, descripcion: 'IVA en ventas' },
          );
        } else {
          items.push(
            { cuenta_id: ctaCaja.id,   cuenta_codigo: ctaCaja.codigo,   cuenta_nombre: ctaCaja.nombre,   debito: total, credito: 0,    descripcion: 'Cobro venta' },
            { cuenta_id: ctaVentas.id, cuenta_codigo: ctaVentas.codigo, cuenta_nombre: ctaVentas.nombre, debito: 0,     credito: total, descripcion: 'Ventas gravadas 0%' },
          );
        }

        // Número único basado en timestamp — evita colisiones con secuencias corruptas
        const year = new Date().getFullYear();
        const numero = `ASI-${year}-R${Date.now().toString().slice(-7)}`;

        // Verificar si ya existe un asiento con esta referencia
        const { data: existing } = await db.from('asientos_contables')
          .select('id')
          .eq('empresa_id', auth.empresaId)
          .eq('referencia', numTicket)
          .maybeSingle();

        if (existing?.id) {
          // Ya existe — contar como existente, no crear duplicado
          referenciasExistentes.add(numTicket);
          continue;
        }

        // Insertar directamente sin pasar por registrarAsientoAutomatico
        const { error: insErr } = await db.from('asientos_contables').insert({
          id: crypto.randomUUID(),
          empresa_id: auth.empresaId,
          numero,
          fecha: fechaVenta,
          descripcion: `Venta POS ${numTicket}`,
          tipo: 'venta',
          referencia: numTicket,
          estado: 'activo',
          origen_automatico: true,
          items,
          total_debito:  parseFloat(total.toFixed(2)),
          total_credito: parseFloat(total.toFixed(2)),
        });

        if (insErr) {
          errores.push(`${numTicket}: ${insErr.message}`);
        } else {
          generados++;
        }

      } catch (e: any) {
        errores.push(`${venta.numero_ticket}: ${e.message}`);
      }
    }

    return c.json({
      ok: true,
      rango: { desde: desdeFecha, hasta: hastaFecha },
      total_ventas_en_rango: ventasEnRango.length,
      ya_tenian_asiento: referenciasExistentes.size,
      sin_asiento_procesadas: ventasSinAsiento.length,
      generados,
      errores: errores.length > 0 ? errores : undefined,
    });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// ── POST /admin/reinicializar-plan-contable — borra y recrea el plan SRI ────────
app.post("/server/admin/reinicializar-plan-contable", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Borrar de SQL
    const { error: delErr } = await db.from('cuentas_contables')
      .delete().eq('empresa_id', auth.empresaId);
    if (delErr) throw new Error('Error borrando cuentas SQL: ' + delErr.message);

    // 2. Limpiar caché KV — esto es lo que el browser sigue sirviendo
    await kv.set(`empresa_${auth.empresaId}_cuentas_contables`, []);

    // 3. Verificar
    const { count } = await db.from('cuentas_contables')
      .select('*', { count: 'exact', head: true }).eq('empresa_id', auth.empresaId);

    return c.json({
      ok: true,
      sql_restantes: count || 0,
      kv_limpiado: true,
      mensaje: 'Catálogo limpiado. Ahora haz clic en "Inicializar Plan Contable".',
    });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

// ── POST /admin/generar-asientos-compras — genera asientos faltantes de compras ──
app.post("/server/admin/generar-asientos-compras", authMiddleware, async (c: any) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);

  let body: any = {};
  try { body = await c.req.json(); } catch { /* sin body */ }

  const OFFSET_EC = 5 * 3600 * 1000;
  const ahoraEC   = new Date(Date.now() - OFFSET_EC);
  const desdeFecha = body.fecha_inicio ?? new Date(Date.now() - 30 * 86400000 - OFFSET_EC).toISOString().split('T')[0];
  const hastaFecha = body.fecha_fin   ?? ahoraEC.toISOString().split('T')[0];
  const desdeUTC   = new Date(desdeFecha + 'T00:00:00Z').getTime() + OFFSET_EC;
  const hastaUTC   = new Date(hastaFecha + 'T23:59:59Z').getTime() + OFFSET_EC;

  try {
    // Obtener TODAS las compras de la empresa (sin filtro de fecha para mayor cobertura)
    const { data: todasCompras, error: compErr } = await db.from('compras')
      .select('id,numero,fecha,total,subtotal,iva,items,proveedor_nombre,created_at,metadata,estado')
      .eq('empresa_id', auth.empresaId)
      .order('fecha', { ascending: false });

    if (compErr) return c.json({ ok: false, error: 'Error leyendo compras: ' + compErr.message }, 500);

    // Filtrar por rango de fecha en memoria (más confiable que el filtro SQL en DATE)
    const comprasFiltradas = (todasCompras || []).filter((c: any) => {
      const f = c.fecha || (c.created_at || '').split('T')[0];
      return (!desdeFecha || f >= desdeFecha) && (!hastaFecha || f <= hastaFecha);
    });

    if (!comprasFiltradas.length) return c.json({
      ok: true,
      mensaje: `Sin compras entre ${desdeFecha} y ${hastaFecha}. Total en BD: ${(todasCompras||[]).length}`,
      generados: 0, total_compras: 0,
      total_en_bd: (todasCompras||[]).length,
    });

    // Filtrar las que YA tienen asiento (por referencia = compra.id)
    const idsCompras = comprasFiltradas.map((c: any) => c.id);
    const { data: asientosExistentes } = await db.from('asientos_contables')
      .select('referencia').eq('empresa_id', auth.empresaId)
      .in('referencia', idsCompras);

    const referenciasExistentes = new Set((asientosExistentes || []).map((a: any) => a.referencia));

    // Mapa tipo_contable → código SRI oficial
    const CUENTA_POR_TIPO: Record<string, string> = {
      'inventario':       '510102',  // Compras Netas Locales de Bienes
      'gasto_servicio':   '520118',  // Agua, Energía, Luz y Telecomunicaciones
      'gasto_basicos':    '520118',  // Agua, Energía, Luz y Telecomunicaciones
      'gasto_arriendo':   '520109',  // Arrendamiento Operativo
      'gasto_publicidad': '520111',  // Promoción y Publicidad
      'gasto_operativo':  '520108',  // Mantenimiento y Reparaciones
      'activo_fijo':      '1020106', // Maquinaria y Equipo
    };

    let generados = 0;
    const errores: string[] = [];

    for (const compra of comprasFiltradas) {
      if (referenciasExistentes.has(compra.id)) continue;
      try {
        const total = Number(compra.total || compra.subtotal || 0);
        if (total <= 0) continue;

        // tipo_pago puede estar en metadata o en estado (compras a crédito tienen estado='pendiente')
        const meta = typeof compra.metadata === 'string' ? JSON.parse(compra.metadata||'{}') : (compra.metadata||{});
        const tipoPago = meta.tipo_pago || meta.forma_pago || (compra.estado === 'pendiente' ? 'credito' : 'contado');
        const cuentaCredito = tipoPago === 'credito' ? '2010301' : '10101';
        const fechaCompra   = (compra.fecha || compra.created_at || '').split('T')[0];

        // Construir ítems del asiento por tipo_contable de cada ítem
        const items = compra.items || [];
        const porTipo: Record<string, number> = {};
        for (const item of items) {
          const tipo = item.tipo_contable || (item.a_inventario !== false ? 'inventario' : 'gasto_operativo');
          porTipo[tipo] = (porTipo[tipo] || 0) + Number(item.costo_total || 0);
        }
        // Si no hay ítems con tipo, usar total como inventario genérico
        if (Object.keys(porTipo).length === 0) porTipo['inventario'] = total;

        // Buscar cuentas DIRECTAMENTE en BD (sin pasar por obtenerCuentas/KV)
        const codigos = [...new Set([
          ...Object.values(CUENTA_POR_TIPO),
          cuentaCredito,
        ])];
        const { data: cuentasDB } = await db.from('cuentas_contables')
          .select('id, codigo, nombre').eq('empresa_id', auth.empresaId)
          .in('codigo', codigos);

        const cuentaMap: Record<string, any> = {};
        for (const ct of (cuentasDB || [])) cuentaMap[ct.codigo] = ct;

        // Resolver con fallback por prefijo
        const resolver = (cod: string) => {
          if (cuentaMap[cod]) return cuentaMap[cod];
          const partes = cod.split('.');
          for (let n = partes.length - 1; n >= 1; n--) {
            const pfx = partes.slice(0, n).join('.');
            const alt = Object.values(cuentaMap).find((c: any) => c.codigo?.startsWith(pfx + '.'));
            if (alt) return alt;
          }
          return null;
        };

        const asientoItems: any[] = [];
        for (const [tipo, monto] of Object.entries(porTipo)) {
          const cod = CUENTA_POR_TIPO[tipo] || '520108';
          const ct = resolver(cod);
          if (ct) asientoItems.push({ cuenta_id: ct.id, cuenta_codigo: ct.codigo, cuenta_nombre: ct.nombre, debito: Math.round(monto*100)/100, credito: 0, descripcion: tipo });
        }
        const ctaCred = resolver(cuentaCredito);
        if (!ctaCred) { errores.push(`Compra ${compra.numero || compra.id}: cuenta ${cuentaCredito} no encontrada`); continue; }
        asientoItems.push({ cuenta_id: ctaCred.id, cuenta_codigo: ctaCred.codigo, cuenta_nombre: ctaCred.nombre, debito: 0, credito: Math.round(total*100)/100, descripcion: tipoPago === 'credito' ? 'CxP proveedores' : 'Pago contado' });

        if (asientoItems.length < 2) { errores.push(`Compra ${compra.numero || compra.id}: insuficientes cuentas`); continue; }

        const { error: insErr } = await db.from('asientos_contables').insert({
          id: crypto.randomUUID(),
          empresa_id: auth.empresaId,
          numero: `ASI-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`,
          fecha: fechaCompra,
          descripcion: `Compra ${compra.numero || compra.id} — ${compra.proveedor_nombre || ''}`,
          tipo: 'compra_inventario',
          referencia: compra.id,
          estado: 'activo',
          origen_automatico: true,
          items: asientoItems,
          total_debito: Math.round(total*100)/100,
          total_credito: Math.round(total*100)/100,
        });

        if (insErr) errores.push(`Compra ${compra.numero || compra.id}: ${insErr.message}`);
        else generados++;
      } catch (e: any) {
        errores.push(`Compra ${compra.numero || compra.id}: ${e.message}`);
      }
    }

    return c.json({
      ok: true,
      rango: { desde: desdeFecha, hasta: hastaFecha },
      total_compras: comprasFiltradas.length,
      ya_tenian_asiento: referenciasExistentes.size,
      generados,
      errores: errores.length ? errores : undefined,
    });
  } catch (e: any) { return c.json({ ok: false, error: e.message }, 500); }
});

// =====================================================
// INICIAR SERVIDOR (CORS NATIVO)
// =====================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const res = await app.fetch(req);
    const newHeaders = new Headers(res.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: newHeaders });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});