/**
 * Rutas de Gestión de Caja
 * - Apertura y cierre de caja
 * - Movimientos: gastos, retiros, ingresos manuales
 * - Arqueo y diferencias
 * - Historial por cajero
 */

import { get as kvGet, set as kvSet } from './kv_store.tsx';

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

function cajaKey(empresaId: string) { return `empresa_${empresaId}_caja_actual`; }
function cajaHistKey(empresaId: string) { return `empresa_${empresaId}_caja_historial`; }

async function getSesionActual(empresaId: string): Promise<SesionCaja | null> {
  return await kvGet(cajaKey(empresaId));
}

async function saveSesion(empresaId: string, sesion: SesionCaja) {
  await kvSet(cajaKey(empresaId), sesion);
}

async function getHistorial(empresaId: string): Promise<SesionCaja[]> {
  return (await kvGet(cajaHistKey(empresaId))) || [];
}

async function addHistorial(empresaId: string, sesion: SesionCaja) {
  const hist = await getHistorial(empresaId);
  hist.unshift(sesion);
  if (hist.length > 90) hist.splice(90); // guardar máx 90 sesiones
  await kvSet(cajaHistKey(empresaId), hist);
}

function calcularMontoReal(sesion: SesionCaja): number {
  const apertura = sesion.monto_apertura || 0;
  const ingresos = sesion.movimientos
    .filter(m => ['venta', 'ingreso_manual', 'apertura'].includes(m.tipo))
    .reduce((s, m) => s + (m.tipo === 'apertura' ? 0 : m.monto), 0);
  const egresos = sesion.movimientos
    .filter(m => ['gasto', 'retiro'].includes(m.tipo))
    .reduce((s, m) => s + m.monto, 0);
  return apertura + ingresos - egresos;
}

const ROLES_ADMIN = ['gerente', 'admin', 'super_admin'];

export function setupCajaRoutes(app: any, authMiddleware: any) {

  // ── GET /caja/estado — Estado actual de caja ─────────────────
  app.get('/server/caja/estado', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const sesion = await getSesionActual(auth.empresaId);
      if (!sesion || sesion.estado === 'cerrada') {
        return c.json({ estado: 'cerrada', sesion: null });
      }
      const monto_real = calcularMontoReal(sesion);
      return c.json({ estado: 'abierta', sesion: { ...sesion, monto_real } });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener estado de caja', detalle: err.message }, 500);
    }
  });

  // ── POST /caja/apertura — Abrir caja ─────────────────────────
  app.post('/server/caja/apertura', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const sesionActual = await getSesionActual(auth.empresaId);
      if (sesionActual && sesionActual.estado === 'abierta') {
        return c.json({ error: 'Ya hay una caja abierta. Ciérrala antes de abrir una nueva.' }, 400);
      }

      const { monto_apertura = 0, observaciones } = await c.req.json();

      const sesion: SesionCaja = {
        id: `caja-${Date.now()}`,
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
          descripcion: observaciones || 'Apertura de caja',
          usuario_id: auth.userId,
          usuario_nombre: auth.user?.nombre_completo || 'Cajero',
          fecha: new Date().toISOString(),
        }],
        monto_cierre_declarado: null,
        monto_cierre_real: null,
        diferencia: null,
        observaciones_cierre: null,
      };

      await saveSesion(auth.empresaId, sesion);
      console.log('✅ Caja abierta:', sesion.id, 'por', sesion.cajero_nombre);
      return c.json({ success: true, mensaje: 'Caja abierta exitosamente', sesion }, 201);
    } catch (err: any) {
      return c.json({ error: 'Error al abrir caja', detalle: err.message }, 500);
    }
  });

  // ── POST /caja/cierre — Cerrar caja ──────────────────────────
  app.post('/server/caja/cierre', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const sesion = await getSesionActual(auth.empresaId);
      if (!sesion || sesion.estado === 'cerrada') {
        return c.json({ error: 'No hay caja abierta para cerrar' }, 400);
      }

      // Solo admin/gerente o el mismo cajero puede cerrar
      const esMismoCajero = sesion.cajero_id === auth.userId;
      const esAdmin = ROLES_ADMIN.includes(auth.userRole);
      if (!esMismoCajero && !esAdmin) {
        return c.json({ error: 'Solo el cajero o un administrador puede cerrar esta caja' }, 403);
      }

      const { monto_declarado, observaciones } = await c.req.json();
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
            descripcion: `Cierre de caja. Declarado: $${declarado.toFixed(2)}, Real: $${monto_real.toFixed(2)}, Diferencia: $${diferencia.toFixed(2)}`,
            usuario_id: auth.userId,
            usuario_nombre: auth.user?.nombre_completo || 'Cajero',
            fecha: new Date().toISOString(),
          },
        ],
      };

      await saveSesion(auth.empresaId, sesionCerrada);
      await addHistorial(auth.empresaId, sesionCerrada);

      return c.json({
        success: true,
        mensaje: 'Caja cerrada exitosamente',
        resumen: {
          monto_apertura: sesion.monto_apertura,
          monto_real,
          monto_declarado: declarado,
          diferencia,
          total_ventas: sesion.movimientos
            .filter(m => m.tipo === 'venta')
            .reduce((s, m) => s + m.monto, 0),
          total_ingresos: sesion.movimientos
            .filter(m => m.tipo === 'ingreso_manual')
            .reduce((s, m) => s + m.monto, 0),
          total_gastos: sesion.movimientos
            .filter(m => m.tipo === 'gasto')
            .reduce((s, m) => s + m.monto, 0),
          total_retiros: sesion.movimientos
            .filter(m => m.tipo === 'retiro')
            .reduce((s, m) => s + m.monto, 0),
        },
        sesion: sesionCerrada,
      });
    } catch (err: any) {
      return c.json({ error: 'Error al cerrar caja', detalle: err.message }, 500);
    }
  });

  // ── POST /caja/movimiento — Registrar movimiento ─────────────
  app.post('/server/caja/movimiento', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const sesion = await getSesionActual(auth.empresaId);
      if (!sesion || sesion.estado === 'cerrada') {
        return c.json({ error: 'No hay caja abierta. Abre la caja primero.' }, 400);
      }

      const { tipo, monto, descripcion, metodo_pago, referencia } = await c.req.json();

      const TIPOS_VALIDOS: TipoMovimiento[] = ['venta', 'ingreso_manual', 'gasto', 'retiro'];
      if (!TIPOS_VALIDOS.includes(tipo)) {
        return c.json({ error: `Tipo inválido. Válidos: ${TIPOS_VALIDOS.join(', ')}` }, 400);
      }

      const montoNum = Number(monto);
      if (isNaN(montoNum) || montoNum <= 0) {
        return c.json({ error: 'El monto debe ser un número positivo' }, 400);
      }

      // Solo admin puede hacer retiros
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
      await saveSesion(auth.empresaId, sesion);

      const monto_real = calcularMontoReal(sesion);
      return c.json({ success: true, movimiento, monto_real });
    } catch (err: any) {
      return c.json({ error: 'Error al registrar movimiento', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/movimientos — Listar movimientos de sesión ──────
  app.get('/server/caja/movimientos', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const sesion = await getSesionActual(auth.empresaId);
      if (!sesion) return c.json({ movimientos: [], sesion: null });
      const monto_real = calcularMontoReal(sesion);
      return c.json({ movimientos: sesion.movimientos, sesion: { ...sesion, monto_real } });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener movimientos', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/historial — Historial de sesiones ───────────────
  app.get('/server/caja/historial', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const historial = await getHistorial(auth.empresaId);
      return c.json({ historial });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener historial', detalle: err.message }, 500);
    }
  });

  // ── GET /caja/arqueo — Resumen para arqueo ────────────────────
  app.get('/server/caja/arqueo', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const sesion = await getSesionActual(auth.empresaId);
      if (!sesion || sesion.estado === 'cerrada') {
        return c.json({ error: 'No hay caja abierta' }, 400);
      }

      const monto_real = calcularMontoReal(sesion);
      const movs = sesion.movimientos;

      const por_tipo = {
        ventas_efectivo: movs.filter(m => m.tipo === 'venta' && m.metodo_pago === 'efectivo').reduce((s, m) => s + m.monto, 0),
        ventas_tarjeta: movs.filter(m => m.tipo === 'venta' && m.metodo_pago !== 'efectivo').reduce((s, m) => s + m.monto, 0),
        ingresos_manuales: movs.filter(m => m.tipo === 'ingreso_manual').reduce((s, m) => s + m.monto, 0),
        gastos: movs.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0),
        retiros: movs.filter(m => m.tipo === 'retiro').reduce((s, m) => s + m.monto, 0),
        total_ventas: movs.filter(m => m.tipo === 'venta').reduce((s, m) => s + m.monto, 0),
        cantidad_ventas: movs.filter(m => m.tipo === 'venta').length,
      };

      const duracion_min = Math.floor((Date.now() - new Date(sesion.fecha_apertura).getTime()) / 60000);

      return c.json({
        sesion_id: sesion.id,
        cajero: sesion.cajero_nombre,
        fecha_apertura: sesion.fecha_apertura,
        monto_apertura: sesion.monto_apertura,
        monto_real,
        duracion_minutos: duracion_min,
        por_tipo,
        movimientos_recientes: movs.slice(-20).reverse(),
      });
    } catch (err: any) {
      return c.json({ error: 'Error al calcular arqueo', detalle: err.message }, 500);
    }
  });
}
