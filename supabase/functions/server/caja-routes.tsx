/**
 * Rutas de Gestión de Caja — SQL (tabla turnos_caja)
 * Una fila por sesión, movimientos embebidos como JSONB.
 */

import { createClient } from "npm:@supabase/supabase-js";
import { registrarAsientoAutomatico } from './kv-helpers.tsx';

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

type TipoMovimiento = 'venta' | 'ingreso_manual' | 'gasto' | 'retiro' | 'apertura' | 'cierre';

interface MovimientoCaja {
  id: string; tipo: TipoMovimiento; monto: number;
  descripcion: string; usuario_id: string; usuario_nombre: string;
  fecha: string; metodo_pago?: string; referencia?: string;
}

function calcularMontoReal(sesion: any): number {
  const movs: MovimientoCaja[] = sesion.movimientos || [];
  const apertura = sesion.monto_apertura || 0;
  const ingresos = movs.filter(m => ['venta','ingreso_manual'].includes(m.tipo)).reduce((s,m) => s+m.monto, 0);
  const egresos  = movs.filter(m => ['gasto','retiro'].includes(m.tipo)).reduce((s,m) => s+m.monto, 0);
  return apertura + ingresos - egresos;
}

async function getSesionActiva(empresaId: string, bodegaId: string) {
  const db = getDB();
  const { data } = await db.from('turnos_caja')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('bodega_id', bodegaId)
    .eq('estado', 'abierta')
    .order('fecha_apertura', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function getSesionesActivas(empresaId: string) {
  const db = getDB();
  const { data } = await db.from('turnos_caja')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('estado', 'abierta');
  return data || [];
}

const ROLES_ADMIN = ['gerente', 'admin', 'super_admin'];

export function setupCajaRoutes(app: any, authMiddleware: any) {

  // ── GET /caja/estado ────────────────────────────────────────────────
  app.get('/server/caja/estado', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.query('bodega_id') || auth.user?.bodega_id || '';
      if (!bodegaId) return c.json({ estado: 'cerrada', sesion: null, sin_bodega: true });
      const sesion = await getSesionActiva(auth.empresaId, bodegaId);
      if (!sesion) return c.json({ estado: 'cerrada', sesion: null, bodega_id: bodegaId });
      return c.json({ estado: 'abierta', sesion: { ...sesion, monto_real: calcularMontoReal(sesion) }, bodega_id: bodegaId });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener estado de caja', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/todas ─────────────────────────────────────────────────
  app.get('/server/caja/todas', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    if (!ROLES_ADMIN.includes(auth.userRole)) return c.json({ error: 'Solo administradores' }, 403);
    try {
      const sesiones = await getSesionesActivas(auth.empresaId);
      return c.json({ sesiones: sesiones.map(s => ({ ...s, monto_real: calcularMontoReal(s) })) });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener cajas activas', detalle: err.message }, 500);
    }
  });

  // ── POST /caja/apertura ─────────────────────────────────────────────
  app.post('/server/caja/apertura', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const bodegaId = body.bodega_id || auth.user?.bodega_id || '';
      const bodegaNombre = body.bodega_nombre || bodegaId;
      if (!bodegaId) return c.json({ error: 'Se requiere bodega_id para abrir caja' }, 400);

      const sesionActual = await getSesionActiva(auth.empresaId, bodegaId);
      if (sesionActual) return c.json({ error: `La caja de "${bodegaNombre}" ya está abierta.` }, 400);

      const { monto_apertura = 0, observaciones } = body;
      const ahora = new Date().toISOString();
      const movInicial: MovimientoCaja = {
        id: `mov-${Date.now()}`, tipo: 'apertura',
        monto: Number(monto_apertura),
        descripcion: observaciones || `Apertura de caja — ${bodegaNombre}`,
        usuario_id: auth.userId,
        usuario_nombre: auth.user?.nombre_completo || 'Cajero',
        fecha: ahora,
      };

      const db = getDB();
      const { data, error } = await db.from('turnos_caja').insert({
        empresa_id: auth.empresaId,
        bodega_id: bodegaId,
        bodega_nombre: bodegaNombre,
        estado: 'abierta',
        cajero_id: auth.userId,
        cajero_nombre: auth.user?.nombre_completo || 'Cajero',
        monto_apertura: Number(monto_apertura),
        fecha_apertura: ahora,
        movimientos: [movInicial],
      }).select().single();
      if (error) throw error;

      return c.json({ success: true, mensaje: 'Caja abierta exitosamente', sesion: { ...data, id: data.id } }, 201);
    } catch (err: any) {
      return c.json({ error: 'Error al abrir caja', detalle: err.message }, 500);
    }
  });

  // ── POST /caja/cierre ───────────────────────────────────────────────
  app.post('/server/caja/cierre', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const bodegaId = body.bodega_id || auth.user?.bodega_id || '';
      if (!bodegaId) return c.json({ error: 'Se requiere bodega_id' }, 400);

      const sesion = await getSesionActiva(auth.empresaId, bodegaId);
      if (!sesion) return c.json({ error: 'No hay caja abierta para cerrar en esta bodega' }, 400);

      if (sesion.cajero_id !== auth.userId && !ROLES_ADMIN.includes(auth.userRole)) {
        return c.json({ error: 'Solo el cajero que abrió esta caja o un administrador puede cerrarla' }, 403);
      }

      const monto_real = calcularMontoReal(sesion);
      const declarado = Number(body.monto_declarado ?? monto_real);
      const diferencia = declarado - monto_real;
      const ahora = new Date().toISOString();

      const movCierre: MovimientoCaja = {
        id: `mov-${Date.now()}`, tipo: 'cierre', monto: monto_real,
        descripcion: `Cierre de caja — ${sesion.bodega_nombre}. Declarado: $${declarado.toFixed(2)}, Real: $${monto_real.toFixed(2)}, Diferencia: $${diferencia.toFixed(2)}`,
        usuario_id: auth.userId,
        usuario_nombre: auth.user?.nombre_completo || 'Cajero',
        fecha: ahora,
      };

      const db = getDB();
      const { data, error } = await db.from('turnos_caja').update({
        estado: 'cerrada',
        fecha_cierre: ahora,
        monto_cierre_declarado: declarado,
        monto_cierre_real: monto_real,
        diferencia,
        observaciones_cierre: body.observaciones || null,
        movimientos: [...(sesion.movimientos || []), movCierre],
      }).eq('id', sesion.id).select().single();
      if (error) throw error;

      const movs: MovimientoCaja[] = data.movimientos || [];
      return c.json({
        success: true, mensaje: 'Caja cerrada exitosamente',
        resumen: {
          bodega: sesion.bodega_nombre,
          monto_apertura: sesion.monto_apertura, monto_real, monto_declarado: declarado, diferencia,
          total_ventas:   movs.filter(m => m.tipo === 'venta').reduce((s,m) => s+m.monto, 0),
          total_ingresos: movs.filter(m => m.tipo === 'ingreso_manual').reduce((s,m) => s+m.monto, 0),
          total_gastos:   movs.filter(m => m.tipo === 'gasto').reduce((s,m) => s+m.monto, 0),
          total_retiros:  movs.filter(m => m.tipo === 'retiro').reduce((s,m) => s+m.monto, 0),
        },
        sesion: data,
      });
    } catch (err: any) {
      return c.json({ error: 'Error al cerrar caja', detalle: err.message }, 500);
    }
  });

  // ── POST /caja/movimiento ───────────────────────────────────────────
  app.post('/server/caja/movimiento', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const bodegaId = body.bodega_id || auth.user?.bodega_id || '';
      if (!bodegaId) return c.json({ error: 'Se requiere bodega_id' }, 400);

      const sesion = await getSesionActiva(auth.empresaId, bodegaId);
      if (!sesion) return c.json({ error: 'No hay caja abierta. Abre la caja primero.' }, 400);

      const { tipo, monto, descripcion, metodo_pago, referencia } = body;
      const TIPOS_VALIDOS: TipoMovimiento[] = ['venta','ingreso_manual','gasto','retiro'];
      if (!TIPOS_VALIDOS.includes(tipo)) return c.json({ error: `Tipo inválido. Válidos: ${TIPOS_VALIDOS.join(', ')}` }, 400);

      const montoNum = Number(monto);
      if (isNaN(montoNum) || montoNum <= 0) return c.json({ error: 'El monto debe ser un número positivo' }, 400);
      if (tipo === 'retiro' && !ROLES_ADMIN.includes(auth.userRole)) {
        return c.json({ error: 'Solo administradores pueden realizar retiros de caja' }, 403);
      }

      const movimiento: MovimientoCaja = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        tipo, monto: montoNum,
        descripcion: descripcion || tipo,
        usuario_id: auth.userId,
        usuario_nombre: auth.user?.nombre_completo || 'Cajero',
        fecha: new Date().toISOString(),
        metodo_pago: metodo_pago || undefined,
        referencia: referencia || undefined,
      };

      const movs = [...(sesion.movimientos || []), movimiento];
      const db = getDB();
      await db.from('turnos_caja').update({ movimientos: movs }).eq('id', sesion.id);

      // Asientos contables automáticos
      const fechaHoy = new Date().toISOString().split('T')[0];
      if (tipo === 'gasto') {
        await registrarAsientoAutomatico(auth.empresaId, {
          tipo: 'gasto_caja', descripcion: descripcion || 'Gasto de caja',
          referencia: referencia || movimiento.id, fecha: fechaHoy,
          items: [{ codigo: '6.2.05', debito: montoNum }, { codigo: '1.1.01', credito: montoNum }],
        });
      } else if (tipo === 'retiro') {
        // 3.2.01 = Retiros del propietario (distribución de patrimonio, no utilidades)
        // 3.1.03 era incorrecto — los retiros no son utilidades retenidas
        await registrarAsientoAutomatico(auth.empresaId, {
          tipo: 'retiro_caja', descripcion: descripcion || 'Retiro de caja',
          referencia: referencia || movimiento.id, fecha: fechaHoy,
          items: [{ codigo: '3.2.01', debito: montoNum, descripcion: 'Retiro del propietario' }, { codigo: '1.1.01', credito: montoNum, descripcion: 'Salida de caja' }],
        });
      } else if (tipo === 'ingreso_manual') {
        await registrarAsientoAutomatico(auth.empresaId, {
          tipo: 'ingreso_caja', descripcion: descripcion || 'Ingreso manual caja',
          referencia: referencia || movimiento.id, fecha: fechaHoy,
          items: [{ codigo: '1.1.01', debito: montoNum }, { codigo: '4.2.02', credito: montoNum }],
        });
      }

      const sesionActualizada = { ...sesion, movimientos: movs };
      return c.json({ success: true, movimiento, monto_real: calcularMontoReal(sesionActualizada) });
    } catch (err: any) {
      return c.json({ error: 'Error al registrar movimiento', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/movimientos ───────────────────────────────────────────
  app.get('/server/caja/movimientos', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.query('bodega_id') || auth.user?.bodega_id || '';
      if (!bodegaId) return c.json({ movimientos: [], sesion: null });
      const sesion = await getSesionActiva(auth.empresaId, bodegaId);
      if (!sesion) return c.json({ movimientos: [], sesion: null });
      return c.json({ movimientos: sesion.movimientos || [], sesion: { ...sesion, monto_real: calcularMontoReal(sesion) } });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/historial ─────────────────────────────────────────────
  app.get('/server/caja/historial', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const db = getDB();
      const bodegaId = c.req.query('bodega_id');
      let query = db.from('turnos_caja').select('*')
        .eq('empresa_id', auth.empresaId)
        .order('fecha_apertura', { ascending: false })
        .limit(365);
      if (bodegaId) query = query.eq('bodega_id', bodegaId);
      const { data } = await query;
      return c.json({ historial: data || [] });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/arqueo ────────────────────────────────────────────────
  app.get('/server/caja/arqueo', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.query('bodega_id') || auth.user?.bodega_id || '';
      if (!bodegaId) return c.json({ error: 'Se requiere bodega_id' }, 400);
      const sesion = await getSesionActiva(auth.empresaId, bodegaId);
      if (!sesion) return c.json({ error: 'No hay caja abierta en esta bodega' }, 400);

      const monto_real = calcularMontoReal(sesion);
      const movs: MovimientoCaja[] = sesion.movimientos || [];
      const duracion_min = Math.floor((Date.now() - new Date(sesion.fecha_apertura).getTime()) / 60000);

      return c.json({
        sesion_id: sesion.id, bodega: sesion.bodega_nombre,
        cajero: sesion.cajero_nombre, fecha_apertura: sesion.fecha_apertura,
        monto_apertura: sesion.monto_apertura, monto_real, duracion_minutos: duracion_min,
        por_tipo: {
          ventas_efectivo:   movs.filter(m => m.tipo==='venta' && m.metodo_pago==='efectivo').reduce((s,m) => s+m.monto, 0),
          ventas_tarjeta:    movs.filter(m => m.tipo==='venta' && m.metodo_pago!=='efectivo').reduce((s,m) => s+m.monto, 0),
          ingresos_manuales: movs.filter(m => m.tipo==='ingreso_manual').reduce((s,m) => s+m.monto, 0),
          gastos:            movs.filter(m => m.tipo==='gasto').reduce((s,m) => s+m.monto, 0),
          retiros:           movs.filter(m => m.tipo==='retiro').reduce((s,m) => s+m.monto, 0),
          total_ventas:      movs.filter(m => m.tipo==='venta').reduce((s,m) => s+m.monto, 0),
          cantidad_ventas:   movs.filter(m => m.tipo==='venta').length,
        },
        movimientos_recientes: movs.slice(-20).reverse(),
      });
    } catch (err: any) {
      return c.json({ error: 'Error al calcular arqueo', detalle: err.message }, 500);
    }
  });
}
