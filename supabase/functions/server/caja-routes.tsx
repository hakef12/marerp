/**
 * Rutas de Gestión de Caja — Multi-turno por sucursal/bodega
 * - Cada bodega tiene su propio turno independiente
 * - Apertura y cierre de caja por bodega
 * - Movimientos: gastos, retiros, ingresos manuales
 * - Arqueo y diferencias por turno
 * - Vista consolidada para administrador
 */

import { get as kvGet, set as kvSet } from './kv_store.tsx';
import { registrarAsientoAutomatico } from './kv-helpers.tsx';

type TipoMovimiento = 'venta' | 'ingreso_manual' | 'gasto' | 'retiro' | 'apertura' | 'cierre';

interface MovimientoCaja {
  id: string;
  tipo: TipoMovimiento;
  monto: number;
  descripcion: string;
  usuario_id: string;
  usuario_nombre: string;
  fecha: string;
  metodo_pago?: string;
  referencia?: string;
}

interface SesionCaja {
  id: string;
  bodega_id: string;
  bodega_nombre: string;
  estado: 'abierta' | 'cerrada';
  cajero_id: string;
  cajero_nombre: string;
  monto_apertura: number;
  fecha_apertura: string;
  fecha_cierre: string | null;
  movimientos: MovimientoCaja[];
  monto_cierre_declarado: number | null;
  monto_cierre_real: number | null;
  diferencia: number | null;
  observaciones_cierre: string | null;
}

// ── KV key helpers ────────────────────────────────────────────────────────────
function cajaKey(empresaId: string, bodegaId: string) {
  return `empresa_${empresaId}_caja_${bodegaId}`;
}
function cajaHistKey(empresaId: string) {
  return `empresa_${empresaId}_caja_historial`;
}
function cajasActivasKey(empresaId: string) {
  return `empresa_${empresaId}_cajas_activas`;
}

async function getSesion(empresaId: string, bodegaId: string): Promise<SesionCaja | null> {
  return await kvGet(cajaKey(empresaId, bodegaId));
}

async function saveSesion(empresaId: string, bodegaId: string, sesion: SesionCaja) {
  await kvSet(cajaKey(empresaId, bodegaId), sesion);
}

async function getCajasActivas(empresaId: string): Promise<string[]> {
  return (await kvGet(cajasActivasKey(empresaId))) || [];
}

async function addCajaActiva(empresaId: string, bodegaId: string) {
  const activas = await getCajasActivas(empresaId);
  if (!activas.includes(bodegaId)) activas.push(bodegaId);
  await kvSet(cajasActivasKey(empresaId), activas);
}

async function removeCajaActiva(empresaId: string, bodegaId: string) {
  const activas = await getCajasActivas(empresaId);
  const filtradas = activas.filter(id => id !== bodegaId);
  await kvSet(cajasActivasKey(empresaId), filtradas);
}

async function getHistorial(empresaId: string): Promise<SesionCaja[]> {
  return (await kvGet(cajaHistKey(empresaId))) || [];
}

async function addHistorial(empresaId: string, sesion: SesionCaja) {
  const hist = await getHistorial(empresaId);
  hist.unshift(sesion);
  if (hist.length > 180) hist.splice(180);
  await kvSet(cajaHistKey(empresaId), hist);
}

function calcularMontoReal(sesion: SesionCaja): number {
  const apertura = sesion.monto_apertura || 0;
  const ingresos = sesion.movimientos
    .filter(m => ['venta', 'ingreso_manual'].includes(m.tipo))
    .reduce((s, m) => s + m.monto, 0);
  const egresos = sesion.movimientos
    .filter(m => ['gasto', 'retiro'].includes(m.tipo))
    .reduce((s, m) => s + m.monto, 0);
  return apertura + ingresos - egresos;
}

const ROLES_ADMIN = ['gerente', 'admin', 'super_admin'];

export function setupCajaRoutes(app: any, authMiddleware: any) {

  // ── GET /caja/estado — Estado actual de la caja de una bodega ─────────────
  app.get('/server/caja/estado', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.query('bodega_id') || auth.user?.bodega_id || '';
      if (!bodegaId) return c.json({ estado: 'cerrada', sesion: null, sin_bodega: true });

      const sesion = await getSesion(auth.empresaId, bodegaId);
      if (!sesion || sesion.estado === 'cerrada') {
        return c.json({ estado: 'cerrada', sesion: null, bodega_id: bodegaId });
      }
      const monto_real = calcularMontoReal(sesion);
      return c.json({ estado: 'abierta', sesion: { ...sesion, monto_real }, bodega_id: bodegaId });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener estado de caja', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/todas — Todas las cajas abiertas (admin) ────────────────────
  app.get('/server/caja/todas', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    if (!ROLES_ADMIN.includes(auth.userRole)) {
      return c.json({ error: 'Solo administradores pueden ver todas las cajas' }, 403);
    }
    try {
      const activas = await getCajasActivas(auth.empresaId);
      const sesiones = await Promise.all(
        activas.map(async (bodegaId: string) => {
          const sesion = await getSesion(auth.empresaId, bodegaId);
          if (!sesion || sesion.estado === 'cerrada') return null;
          return { ...sesion, monto_real: calcularMontoReal(sesion) };
        })
      );
      return c.json({ sesiones: sesiones.filter(Boolean) });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener cajas activas', detalle: err.message }, 500);
    }
  });

  // ── POST /caja/apertura — Abrir caja en una bodega ────────────────────────
  app.post('/server/caja/apertura', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const bodegaId = body.bodega_id || auth.user?.bodega_id || '';
      const bodegaNombre = body.bodega_nombre || bodegaId;

      if (!bodegaId) {
        return c.json({ error: 'Se requiere bodega_id para abrir caja' }, 400);
      }

      const sesionActual = await getSesion(auth.empresaId, bodegaId);
      if (sesionActual && sesionActual.estado === 'abierta') {
        return c.json({
          error: `La caja de "${bodegaNombre}" ya está abierta. Ciérrala antes de abrir una nueva.`
        }, 400);
      }

      const { monto_apertura = 0, observaciones } = body;

      const sesion: SesionCaja = {
        id: `caja-${bodegaId}-${Date.now()}`,
        bodega_id: bodegaId,
        bodega_nombre: bodegaNombre,
        estado: 'abierta',
        cajero_id: auth.userId,
        cajero_nombre: auth.user?.nombre_completo || 'Cajero',
        monto_apertura: Number(monto_apertura),
        fecha_apertura: new Date().toISOString(),
        fecha_cierre: null,
        movimientos: [{
          id: `mov-${Date.now()}`,
          tipo: 'apertura',
          monto: Number(monto_apertura),
          descripcion: observaciones || `Apertura de caja — ${bodegaNombre}`,
          usuario_id: auth.userId,
          usuario_nombre: auth.user?.nombre_completo || 'Cajero',
          fecha: new Date().toISOString(),
        }],
        monto_cierre_declarado: null,
        monto_cierre_real: null,
        diferencia: null,
        observaciones_cierre: null,
      };

      await saveSesion(auth.empresaId, bodegaId, sesion);
      await addCajaActiva(auth.empresaId, bodegaId);

      return c.json({ success: true, mensaje: 'Caja abierta exitosamente', sesion }, 201);
    } catch (err: any) {
      return c.json({ error: 'Error al abrir caja', detalle: err.message }, 500);
    }
  });

  // ── POST /caja/cierre — Cerrar caja de una bodega ────────────────────────
  app.post('/server/caja/cierre', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const bodegaId = body.bodega_id || auth.user?.bodega_id || '';
      if (!bodegaId) return c.json({ error: 'Se requiere bodega_id' }, 400);

      const sesion = await getSesion(auth.empresaId, bodegaId);
      if (!sesion || sesion.estado === 'cerrada') {
        return c.json({ error: 'No hay caja abierta para cerrar en esta bodega' }, 400);
      }

      const esMismoCajero = sesion.cajero_id === auth.userId;
      const esAdmin = ROLES_ADMIN.includes(auth.userRole);
      if (!esMismoCajero && !esAdmin) {
        return c.json({ error: 'Solo el cajero que abrió esta caja o un administrador puede cerrarla' }, 403);
      }

      const { monto_declarado, observaciones } = body;
      const monto_real = calcularMontoReal(sesion);
      const declarado = Number(monto_declarado ?? monto_real);
      const diferencia = declarado - monto_real;

      const sesionCerrada: SesionCaja = {
        ...sesion,
        estado: 'cerrada',
        fecha_cierre: new Date().toISOString(),
        monto_cierre_declarado: declarado,
        monto_cierre_real: monto_real,
        diferencia,
        observaciones_cierre: observaciones || null,
        movimientos: [
          ...sesion.movimientos,
          {
            id: `mov-${Date.now()}`,
            tipo: 'cierre',
            monto: monto_real,
            descripcion: `Cierre de caja — ${sesion.bodega_nombre}. Declarado: $${declarado.toFixed(2)}, Real: $${monto_real.toFixed(2)}, Diferencia: $${diferencia.toFixed(2)}`,
            usuario_id: auth.userId,
            usuario_nombre: auth.user?.nombre_completo || 'Cajero',
            fecha: new Date().toISOString(),
          },
        ],
      };

      await saveSesion(auth.empresaId, bodegaId, sesionCerrada);
      await addHistorial(auth.empresaId, sesionCerrada);
      await removeCajaActiva(auth.empresaId, bodegaId);

      return c.json({
        success: true,
        mensaje: 'Caja cerrada exitosamente',
        resumen: {
          bodega: sesion.bodega_nombre,
          monto_apertura: sesion.monto_apertura,
          monto_real,
          monto_declarado: declarado,
          diferencia,
          total_ventas: sesion.movimientos.filter(m => m.tipo === 'venta').reduce((s, m) => s + m.monto, 0),
          total_ingresos: sesion.movimientos.filter(m => m.tipo === 'ingreso_manual').reduce((s, m) => s + m.monto, 0),
          total_gastos: sesion.movimientos.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0),
          total_retiros: sesion.movimientos.filter(m => m.tipo === 'retiro').reduce((s, m) => s + m.monto, 0),
        },
        sesion: sesionCerrada,
      });
    } catch (err: any) {
      return c.json({ error: 'Error al cerrar caja', detalle: err.message }, 500);
    }
  });

  // ── POST /caja/movimiento — Registrar movimiento ──────────────────────────
  app.post('/server/caja/movimiento', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const bodegaId = body.bodega_id || auth.user?.bodega_id || '';
      if (!bodegaId) return c.json({ error: 'Se requiere bodega_id' }, 400);

      const sesion = await getSesion(auth.empresaId, bodegaId);
      if (!sesion || sesion.estado === 'cerrada') {
        return c.json({ error: 'No hay caja abierta en esta bodega. Abre la caja primero.' }, 400);
      }

      const { tipo, monto, descripcion, metodo_pago, referencia } = body;
      const TIPOS_VALIDOS: TipoMovimiento[] = ['venta', 'ingreso_manual', 'gasto', 'retiro'];
      if (!TIPOS_VALIDOS.includes(tipo)) {
        return c.json({ error: `Tipo inválido. Válidos: ${TIPOS_VALIDOS.join(', ')}` }, 400);
      }

      const montoNum = Number(monto);
      if (isNaN(montoNum) || montoNum <= 0) {
        return c.json({ error: 'El monto debe ser un número positivo' }, 400);
      }

      if (tipo === 'retiro' && !ROLES_ADMIN.includes(auth.userRole)) {
        return c.json({ error: 'Solo administradores pueden realizar retiros de caja' }, 403);
      }

      const movimiento: MovimientoCaja = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tipo,
        monto: montoNum,
        descripcion: descripcion || tipo,
        usuario_id: auth.userId,
        usuario_nombre: auth.user?.nombre_completo || 'Cajero',
        fecha: new Date().toISOString(),
        metodo_pago: metodo_pago || undefined,
        referencia: referencia || undefined,
      };

      sesion.movimientos.push(movimiento);
      await saveSesion(auth.empresaId, bodegaId, sesion);

      // ── Asiento contable automático del movimiento ────────────
      const fechaHoy = new Date().toISOString().split('T')[0];
      if (tipo === 'gasto') {
        await registrarAsientoAutomatico(auth.empresaId, {
          tipo: 'gasto_caja',
          descripcion: descripcion || 'Gasto de caja',
          referencia: referencia || movimiento.id,
          fecha: fechaHoy,
          items: [
            { codigo: '6.2.05', debito: montoNum,  descripcion: descripcion || 'Gasto' },
            { codigo: '1.1.01', credito: montoNum, descripcion: 'Salida de caja' },
          ],
        });
      } else if (tipo === 'retiro') {
        await registrarAsientoAutomatico(auth.empresaId, {
          tipo: 'retiro_caja',
          descripcion: descripcion || 'Retiro de caja',
          referencia: referencia || movimiento.id,
          fecha: fechaHoy,
          items: [
            { codigo: '3.1.03', debito: montoNum,  descripcion: 'Retiro propietario' },
            { codigo: '1.1.01', credito: montoNum, descripcion: 'Salida de caja' },
          ],
        });
      } else if (tipo === 'ingreso_manual') {
        await registrarAsientoAutomatico(auth.empresaId, {
          tipo: 'ingreso_caja',
          descripcion: descripcion || 'Ingreso manual caja',
          referencia: referencia || movimiento.id,
          fecha: fechaHoy,
          items: [
            { codigo: '1.1.01', debito: montoNum,  descripcion: 'Entrada de caja' },
            { codigo: '4.2.02', credito: montoNum, descripcion: 'Otros ingresos' },
          ],
        });
      }

      const monto_real = calcularMontoReal(sesion);
      return c.json({ success: true, movimiento, monto_real });
    } catch (err: any) {
      return c.json({ error: 'Error al registrar movimiento', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/movimientos — Movimientos de sesión activa ──────────────────
  app.get('/server/caja/movimientos', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.query('bodega_id') || auth.user?.bodega_id || '';
      if (!bodegaId) return c.json({ movimientos: [], sesion: null });
      const sesion = await getSesion(auth.empresaId, bodegaId);
      if (!sesion) return c.json({ movimientos: [], sesion: null });
      const monto_real = calcularMontoReal(sesion);
      return c.json({ movimientos: sesion.movimientos, sesion: { ...sesion, monto_real } });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener movimientos', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/historial — Historial de sesiones (filtra por bodega si se pasa) ──
  app.get('/server/caja/historial', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.query('bodega_id');
      let historial = await getHistorial(auth.empresaId);
      if (bodegaId) {
        historial = historial.filter(s => s.bodega_id === bodegaId);
      }
      return c.json({ historial });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener historial', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/arqueo — Resumen para arqueo de una bodega ──────────────────
  app.get('/server/caja/arqueo', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.query('bodega_id') || auth.user?.bodega_id || '';
      if (!bodegaId) return c.json({ error: 'Se requiere bodega_id' }, 400);

      const sesion = await getSesion(auth.empresaId, bodegaId);
      if (!sesion || sesion.estado === 'cerrada') {
        return c.json({ error: 'No hay caja abierta en esta bodega' }, 400);
      }

      const monto_real = calcularMontoReal(sesion);
      const movs = sesion.movimientos;
      const duracion_min = Math.floor((Date.now() - new Date(sesion.fecha_apertura).getTime()) / 60000);

      return c.json({
        sesion_id: sesion.id,
        bodega: sesion.bodega_nombre,
        cajero: sesion.cajero_nombre,
        fecha_apertura: sesion.fecha_apertura,
        monto_apertura: sesion.monto_apertura,
        monto_real,
        duracion_minutos: duracion_min,
        por_tipo: {
          ventas_efectivo:   movs.filter(m => m.tipo === 'venta' && m.metodo_pago === 'efectivo').reduce((s, m) => s + m.monto, 0),
          ventas_tarjeta:    movs.filter(m => m.tipo === 'venta' && m.metodo_pago !== 'efectivo').reduce((s, m) => s + m.monto, 0),
          ingresos_manuales: movs.filter(m => m.tipo === 'ingreso_manual').reduce((s, m) => s + m.monto, 0),
          gastos:            movs.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0),
          retiros:           movs.filter(m => m.tipo === 'retiro').reduce((s, m) => s + m.monto, 0),
          total_ventas:      movs.filter(m => m.tipo === 'venta').reduce((s, m) => s + m.monto, 0),
          cantidad_ventas:   movs.filter(m => m.tipo === 'venta').length,
        },
        movimientos_recientes: movs.slice(-20).reverse(),
      });
    } catch (err: any) {
      return c.json({ error: 'Error al calcular arqueo', detalle: err.message }, 500);
    }
  });
}
