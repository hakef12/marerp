/**
 * Rutas de Gestión Visual de Mesas
 * - Estado: libre | ocupada | reservada | esperando_cuenta
 * - Mesero asignado, tiempo de ocupación, consumo acumulado
 * - Transferencia de mesas entre meseros
 * - Combinar mesas
 */

import { get as kvGet, set as kvSet } from './kv_store.tsx';

type EstadoMesa = 'libre' | 'ocupada' | 'reservada' | 'esperando_cuenta';

interface Mesa {
  id: string;
  numero: number;
  nombre: string;
  capacidad: number;
  zona: string;
  estado: EstadoMesa;
  mesero_id: string | null;
  mesero_nombre: string | null;
  hora_ocupacion: string | null;
  consumo_acumulado: number;
  numero_comanda: string | null;
  personas: number;
  nota: string | null;
  posicion: { x: number; y: number };
}

function mesasKey(empresaId: string) {
  return `empresa_${empresaId}_mesas`;
}

function defaultMesas(): Mesa[] {
  const zonas = ['Salón', 'Terraza', 'Barra', 'VIP'];
  return Array.from({ length: 20 }, (_, i) => ({
    id: `mesa-${i + 1}`,
    numero: i + 1,
    nombre: `Mesa ${i + 1}`,
    capacidad: i >= 16 ? 2 : i >= 10 ? 6 : 4,
    zona: zonas[Math.floor(i / 5)] ?? 'Salón',
    estado: 'libre' as EstadoMesa,
    mesero_id: null,
    mesero_nombre: null,
    hora_ocupacion: null,
    consumo_acumulado: 0,
    numero_comanda: null,
    personas: 0,
    nota: null,
    posicion: { x: (i % 5) * 190 + 20, y: Math.floor(i / 5) * 190 + 20 },
  }));
}

async function getMesas(empresaId: string): Promise<Mesa[]> {
  const data = await kvGet(mesasKey(empresaId));
  if (!data || !Array.isArray(data) || data.length === 0) {
    const mesas = defaultMesas();
    await kvSet(mesasKey(empresaId), mesas);
    return mesas;
  }
  return data;
}

async function saveMesas(empresaId: string, mesas: Mesa[]) {
  await kvSet(mesasKey(empresaId), mesas);
}

export function setupMesasRoutes(app: any, authMiddleware: any) {

  // ── GET /mesas — Lista todas las mesas ──────────────────────
  app.get('/server/mesas', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const mesas = await getMesas(auth.empresaId);
      // Calcular tiempo de ocupación en minutos
      const ahora = Date.now();
      const result = mesas.map((m: Mesa) => ({
        ...m,
        minutos_ocupada: m.hora_ocupacion
          ? Math.floor((ahora - new Date(m.hora_ocupacion).getTime()) / 60000)
          : 0,
      }));
      return c.json({ mesas: result });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener mesas', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas — Crear o actualizar layout de mesas ────────
  app.post('/server/mesas', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { mesas } = await c.req.json();
      if (!Array.isArray(mesas)) return c.json({ error: 'Se esperaba un array de mesas' }, 400);
      await saveMesas(auth.empresaId, mesas);
      return c.json({ success: true, mesas });
    } catch (err: any) {
      return c.json({ error: 'Error al guardar mesas', detalle: err.message }, 500);
    }
  });

  // ── PUT /mesas/:id — Actualizar una mesa ────────────────────
  app.put('/server/mesas/:id', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const mesaId = c.req.param('id');
    try {
      const body = await c.req.json();
      const mesas = await getMesas(auth.empresaId);
      const idx = mesas.findIndex((m: Mesa) => m.id === mesaId);
      if (idx === -1) return c.json({ error: 'Mesa no encontrada' }, 404);
      mesas[idx] = { ...mesas[idx], ...body, id: mesaId };
      await saveMesas(auth.empresaId, mesas);
      return c.json({ success: true, mesa: mesas[idx] });
    } catch (err: any) {
      return c.json({ error: 'Error al actualizar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/ocupar — Marcar mesa como ocupada ───────
  app.post('/server/mesas/:id/ocupar', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const mesaId = c.req.param('id');
    try {
      const { mesero_id, mesero_nombre, personas = 1, numero_comanda, nota } = await c.req.json();
      const mesas = await getMesas(auth.empresaId);
      const idx = mesas.findIndex((m: Mesa) => m.id === mesaId);
      if (idx === -1) return c.json({ error: 'Mesa no encontrada' }, 404);
      if (mesas[idx].estado === 'ocupada') {
        return c.json({ error: 'La mesa ya está ocupada' }, 400);
      }
      mesas[idx] = {
        ...mesas[idx],
        estado: 'ocupada',
        mesero_id: mesero_id || auth.userId,
        mesero_nombre: mesero_nombre || auth.user?.nombre_completo || 'Sin asignar',
        hora_ocupacion: new Date().toISOString(),
        consumo_acumulado: 0,
        numero_comanda: numero_comanda || null,
        personas: Number(personas) || 1,
        nota: nota || null,
      };
      await saveMesas(auth.empresaId, mesas);
      return c.json({ success: true, mesa: mesas[idx] });
    } catch (err: any) {
      return c.json({ error: 'Error al ocupar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/liberar — Liberar mesa ──────────────────
  app.post('/server/mesas/:id/liberar', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const mesaId = c.req.param('id');
    try {
      const mesas = await getMesas(auth.empresaId);
      const idx = mesas.findIndex((m: Mesa) => m.id === mesaId);
      if (idx === -1) return c.json({ error: 'Mesa no encontrada' }, 404);
      mesas[idx] = {
        ...mesas[idx],
        estado: 'libre',
        mesero_id: null,
        mesero_nombre: null,
        hora_ocupacion: null,
        consumo_acumulado: 0,
        numero_comanda: null,
        personas: 0,
        nota: null,
      };
      await saveMesas(auth.empresaId, mesas);
      return c.json({ success: true, mesa: mesas[idx] });
    } catch (err: any) {
      return c.json({ error: 'Error al liberar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/reservar — Reservar mesa ────────────────
  app.post('/server/mesas/:id/reservar', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const mesaId = c.req.param('id');
    try {
      const { nota, personas } = await c.req.json();
      const mesas = await getMesas(auth.empresaId);
      const idx = mesas.findIndex((m: Mesa) => m.id === mesaId);
      if (idx === -1) return c.json({ error: 'Mesa no encontrada' }, 404);
      mesas[idx] = {
        ...mesas[idx],
        estado: 'reservada',
        nota: nota || null,
        personas: Number(personas) || 0,
        hora_ocupacion: new Date().toISOString(),
      };
      await saveMesas(auth.empresaId, mesas);
      return c.json({ success: true, mesa: mesas[idx] });
    } catch (err: any) {
      return c.json({ error: 'Error al reservar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/esperando-cuenta — Mesa esperando cuenta
  app.post('/server/mesas/:id/esperando-cuenta', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const mesaId = c.req.param('id');
    try {
      const mesas = await getMesas(auth.empresaId);
      const idx = mesas.findIndex((m: Mesa) => m.id === mesaId);
      if (idx === -1) return c.json({ error: 'Mesa no encontrada' }, 404);
      mesas[idx] = { ...mesas[idx], estado: 'esperando_cuenta' };
      await saveMesas(auth.empresaId, mesas);
      return c.json({ success: true, mesa: mesas[idx] });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/consumo — Sumar consumo a mesa ──────────
  app.post('/server/mesas/:id/consumo', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const mesaId = c.req.param('id');
    try {
      const { monto } = await c.req.json();
      const mesas = await getMesas(auth.empresaId);
      const idx = mesas.findIndex((m: Mesa) => m.id === mesaId);
      if (idx === -1) return c.json({ error: 'Mesa no encontrada' }, 404);
      mesas[idx] = {
        ...mesas[idx],
        consumo_acumulado: (mesas[idx].consumo_acumulado || 0) + Number(monto || 0),
      };
      await saveMesas(auth.empresaId, mesas);
      return c.json({ success: true, mesa: mesas[idx] });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/transferir — Transferir mesa a otro mesero
  app.post('/server/mesas/:id/transferir', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const mesaId = c.req.param('id');
    try {
      const { mesero_id, mesero_nombre } = await c.req.json();
      if (!mesero_nombre) return c.json({ error: 'Nombre del mesero requerido' }, 400);
      const mesas = await getMesas(auth.empresaId);
      const idx = mesas.findIndex((m: Mesa) => m.id === mesaId);
      if (idx === -1) return c.json({ error: 'Mesa no encontrada' }, 404);
      mesas[idx] = { ...mesas[idx], mesero_id: mesero_id || null, mesero_nombre };
      await saveMesas(auth.empresaId, mesas);
      return c.json({ success: true, mesa: mesas[idx] });
    } catch (err: any) {
      return c.json({ error: 'Error al transferir mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/reset — Resetear todas las mesas (admin) ────
  app.post('/server/mesas/reset', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const mesas = defaultMesas();
      await saveMesas(auth.empresaId, mesas);
      return c.json({ success: true, mensaje: 'Mesas reseteadas', mesas });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });
}
