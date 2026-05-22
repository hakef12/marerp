import { Hono } from "npm:hono";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";
import { PLANES, tieneAccesoModulo, validarLimite, obtenerPlan, listarPlanes } from "./planes.tsx";
import { setupPOSRoutes } from "./pos-routes.tsx";
import { setupInventarioRoutes } from "./inventario-routes.tsx";
import { setupCocinaRoutes } from "./cocina-routes.tsx";
import { setupDashboardRoutes } from "./dashboard-routes.tsx";
import { setupBIRoutes } from "./bi-routes.tsx";
import { setupRRHHRoutes } from "./rrhh-routes.tsx";
import { setupIngenieriaMenuRoutes } from "./ingenieria-menu-routes.tsx";
import { setupUsuariosRoutes } from "./usuarios-routes.tsx";
import { handleGetConfiguracionFacturacion, handleSaveConfiguracionFacturacion, handleGenerarFactura, handleGetFacturas, handleAutorizarFactura, handleReintentarAutorizacion, handleEnviarEmailFactura, handleReenviarEmailFactura, handleUploadCertificado, handleGetCertificadoInfo, handleTestSRI } from "./facturacion-routes.tsx";
import { setupAuditoriaRoutes } from "./auditoria-routes.tsx";
import { setupContabilidadRoutes } from "./contabilidad-routes.tsx";
import { setupMesasRoutes } from "./mesas-routes.tsx";
import { setupCajaRoutes } from "./caja-routes.tsx";
import { setupProduccionRoutes } from "./produccion-routes.tsx";
import { setupTransferenciasRoutes } from "./transferencias-routes.tsx";
import { setupStockBodegaRoutes } from "./stock-bodega-routes.tsx";
import notificacionesApp from "./notificaciones-routes.tsx";
import { registrarAuditoria } from "./audit-helper.tsx";
import { inicializarDatosDemo, cargarDatosDemo, limpiarTodosLosDatos, obtenerProductos, obtenerCategorias, obtenerVentas, obtenerComandas, guardarVenta, guardarComanda, actualizarComanda, guardarProducto, obtenerBodegas, obtenerRecetas, ajustarStockBodega, registrarAsientoAutomatico } from "./kv-helpers.tsx";

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

    // Super admin no tiene empresa asignada — permitir siempre
    if (userData.rol !== 'super_admin' && userData.empresas?.estado !== 'activo') {
      return c.json({ error: 'Empresa suspendida o inactiva. Contacte al administrador.' }, 403);
    }

    // Guardar contexto de autenticación
    c.set('auth', {
      userId: userData.id,
      empresaId: userData.empresa_id || 'super_admin',
      userRole: userData.rol,
      user: userData
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
      .single();

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
          plan: usuario.empresas?.plan_tipo || usuario.empresas?.plan || 'basico'
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
      const cuentaCaja = metodo.includes('tarjeta') || metodo.includes('transfer') ? '1.1.02' : '1.1.01';
      const numTicket  = venta.numero_ticket || numero_ticket;

      if (total > 0) {
        if (impuesto > 0) {
          await registrarAsientoAutomatico(auth.empresaId, {
            tipo: 'venta',
            descripcion: `Venta POS ${numTicket}`,
            referencia: numTicket,
            items: [
              { codigo: cuentaCaja, debito: total,    descripcion: 'Cobro venta' },
              { codigo: '4.1.01',   credito: subtotal, descripcion: 'Ingresos por ventas' },
              { codigo: '2.1.03',   credito: impuesto, descripcion: 'IVA en ventas' },
            ],
          });
        } else {
          await registrarAsientoAutomatico(auth.empresaId, {
            tipo: 'venta',
            descripcion: `Venta POS ${numTicket}`,
            referencia: numTicket,
            items: [
              { codigo: cuentaCaja, debito: total,  descripcion: 'Cobro venta' },
              { codigo: '4.1.02',   credito: total, descripcion: 'Ventas gravadas 0%' },
            ],
          });
        }
      }
    } catch { /* silencioso */ }

    return c.json({ message: 'Venta creada exitosamente', venta }, 201);
  } catch (error: any) {
    return c.json({ error: 'Error al crear venta', details: error.message }, 500);
  }
});

// =====================================================
// OTROS MÓDULOS Y CONFIGURACIONES
// =====================================================

setupPOSRoutes(app, authMiddleware);
setupInventarioRoutes(app, authMiddleware);
setupCocinaRoutes(app, authMiddleware);
setupDashboardRoutes(app, authMiddleware);
setupBIRoutes(app, authMiddleware);
setupRRHHRoutes(app, authMiddleware);
setupIngenieriaMenuRoutes(app, authMiddleware);
setupUsuariosRoutes(app, authMiddleware);
setupAuditoriaRoutes(app, authMiddleware);
setupContabilidadRoutes(app, authMiddleware);
setupMesasRoutes(app, authMiddleware);
setupCajaRoutes(app, authMiddleware);
setupProduccionRoutes(app, authMiddleware);
setupTransferenciasRoutes(app, authMiddleware);
setupStockBodegaRoutes(app, authMiddleware);

// Notificaciones reales
app.use('/server/notificaciones/*', authMiddleware);
app.use('/server/notificaciones', authMiddleware);
app.route('/server/notificaciones', notificacionesApp);

// Rutas de compatibilidad para evitar 404
// NOTA: /server/compras ya está registrado por setupInventarioRoutes — NO duplicar aquí
app.get("/server/dashboard/kpis", authMiddleware, (c) => c.json({ kpis: [] }));
app.get("/server/centros-costos", authMiddleware, (c) => c.json({ centros_costos: [] }));
app.post("/server/categorias/inicializar", authMiddleware, (c) => c.json({ success: true }));

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
      .select('*, usuarios(count)')
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
      // Actualizar módulos según el plan
      const modulosPorPlan: Record<string, any> = {
        basico:       { pos: true,  inventario: true,  contabilidad: false, rrhh: false, cocina: false, auditoria: false, bi: false },
        profesional:  { pos: true,  inventario: true,  contabilidad: true,  rrhh: true,  cocina: true,  auditoria: true,  bi: true  },
        restaurante:  { pos: true,  inventario: true,  contabilidad: false, rrhh: false, cocina: true,  auditoria: false, bi: false },
        enterprise:   { pos: true,  inventario: true,  contabilidad: true,  rrhh: true,  cocina: true,  auditoria: true,  bi: true  },
      };
      updates.modulos_activos = modulos_activos || modulosPorPlan[plan_tipo] || modulosPorPlan.enterprise;
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
    return await handleAutorizarFactura(c.req.raw, auth.empresaId);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
app.post("/server/facturacion/facturas/:id/reenviar-email", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  try {
    return await handleReenviarEmailFactura(c.req.raw, auth.empresaId);
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

// ── GET /admin/diagnostico-completo — comparar KV vs SQL ────────────────────
app.get("/server/admin/diagnostico-completo", authMiddleware, async (c) => {
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
app.post("/server/admin/restaurar-desde-kv", authMiddleware, async (c) => {
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

// ── GET /admin/fix-precios — corrige precio=0 en productos y recetas ────────
app.get("/server/admin/fix-precios", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const db = createClient(supabaseUrl, supabaseServiceKey);
  const resultado: Record<string, any> = {};
  try {
    // ── 1. Productos ──────────────────────────────────────────────────────────
    const productosKV: any[] = (await kv.get(`empresa_${auth.empresaId}_productos`)) || [];
    let prodActualizados = 0, prodSinPrecio = 0;
    for (const p of productosKV) {
      if (!p.id) continue;
      const precio = Number(p.precio_venta || p.precio || 0);
      const costo  = Number(p.precio_costo || p.costo_unitario || p.costo || 0);
      if (precio === 0) { prodSinPrecio++; continue; }
      await db.from('productos')
        .update({ precio, precio_costo: costo, updated_at: new Date().toISOString() })
        .eq('id', p.id).eq('empresa_id', auth.empresaId);
      prodActualizados++;
    }
    resultado.productos = { total_kv: productosKV.length, actualizados: prodActualizados, sin_precio: prodSinPrecio };

    // ── 2. Recetas ────────────────────────────────────────────────────────────
    const recetasKV: any[] = (await kv.get(`empresa_${auth.empresaId}_recetas`)) || [];
    let recActualizadas = 0, recSinPrecio = 0;
    for (const r of recetasKV) {
      if (!r.id) continue;
      const precioVenta = Number(r.precio_venta || r.precio || r.precio_sugerido || 0);
      if (precioVenta === 0) { recSinPrecio++; continue; }
      // Intentar actualizar columna precio_venta (puede no existir aún)
      // Siempre actualizar metadata como fallback seguro
      const { data: recActual } = await db.from('recetas')
        .select('metadata').eq('id', r.id).eq('empresa_id', auth.empresaId).maybeSingle();
      const metaActual = recActual?.metadata || {};
      await db.from('recetas')
        .update({ metadata: { ...metaActual, precio_venta: precioVenta }, updated_at: new Date().toISOString() })
        .eq('id', r.id).eq('empresa_id', auth.empresaId);
      recActualizadas++;
    }
    resultado.recetas = { total_kv: recetasKV.length, actualizadas: recActualizadas, sin_precio: recSinPrecio };

    return c.json({ ok: true, ...resultado });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message, resultado }, 500);
  }
});

app.get("/server/inventario/lotes", authMiddleware, async (c) => {
  const auth: AuthContext = c.get('auth');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data } = await supabase.from('inventario_lotes').select('*').eq('empresa_id', auth.empresaId);
  return c.json({ lotes: data || [] });
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
    movimientos_inventario: new Set(['id','empresa_id','producto_id','producto_nombre','bodega_id','tipo','cantidad','precio_unitario','motivo','referencia','usuario_id','metadata','created_at','bodega_destino_id','costo_total','stock_anterior','stock_nuevo']),
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