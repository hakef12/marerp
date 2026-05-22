/**
 * Rutas de Gestión Visual de Mesas — SQL
 * Cada mesa es una fila en la tabla `mesas` (empresa_id + codigo UNIQUE)
 */

import { createClient } from "npm:@supabase/supabase-js";

type EstadoMesa = 'libre' | 'ocupada' | 'reservada' | 'esperando_cuenta';

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function defaultMesas() {
  const zonas = ['Salón', 'Terraza', 'Barra', 'VIP'];
  return Array.from({ length: 20 }, (_, i) => ({
    codigo: `mesa-${i + 1}`,
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

async function getMesas(empresaId: string) {
  const db = getDB();
  const { data, error } = await db.from('mesas')
    .select('*').eq('empresa_id', empresaId).order('numero');
  if (error) throw error;

  // Si no hay mesas, crear las por defecto
  if (!data || data.length === 0) {
    const defaults = defaultMesas();
    const rows = defaults.map(m => ({ ...m, empresa_id: empresaId }));
    const { data: inserted } = await db.from('mesas').insert(rows).select();
    return inserted || defaults;
  }
  return data;
}

async function updateMesa(empresaId: string, codigo: string, cambios: any) {
  const db = getDB();
  const { data, error } = await db.from('mesas')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('empresa_id', empresaId).eq('codigo', codigo)
    .select().single();
  if (error) throw error;
  return data;
}

export function setupMesasRoutes(app: any, authMiddleware: any) {

  // ── GET /mesas ──────────────────────────────────────────────────────
  app.get('/server/mesas', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const mesas = await getMesas(auth.empresaId);
      const ahora = Date.now();
      const result = mesas.map((m: any) => ({
        ...m,
        id: m.codigo || m.id,
        minutos_ocupada: m.hora_ocupacion
          ? Math.floor((ahora - new Date(m.hora_ocupacion).getTime()) / 60000)
          : 0,
      }));
      return c.json({ mesas: result });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener mesas', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas — Guardar layout completo ───────────────────────────
  app.post('/server/mesas', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { mesas } = await c.req.json();
      if (!Array.isArray(mesas)) return c.json({ error: 'Se esperaba un array de mesas' }, 400);
      const db = getDB();
      const rows = mesas.map((m: any) => ({
        ...m,
        codigo: m.id || m.codigo || `mesa-${m.numero}`,
        empresa_id: auth.empresaId,
        updated_at: new Date().toISOString(),
      }));
      await db.from('mesas').upsert(rows, { onConflict: 'empresa_id,codigo' });
      return c.json({ success: true, mesas });
    } catch (err: any) {
      return c.json({ error: 'Error al guardar mesas', detalle: err.message }, 500);
    }
  });

  // ── PUT /mesas/:id ──────────────────────────────────────────────────
  app.put('/server/mesas/:id', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const body = await c.req.json();
      const mesa = await updateMesa(auth.empresaId, codigo, body);
      return c.json({ success: true, mesa: { ...mesa, id: mesa.codigo || mesa.id } });
    } catch (err: any) {
      return c.json({ error: 'Error al actualizar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/ocupar ──────────────────────────────────────────
  app.post('/server/mesas/:id/ocupar', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const { mesero_id, mesero_nombre, personas = 1, numero_comanda, nota } = await c.req.json();
      const db = getDB();
      const { data: actual } = await db.from('mesas').select('estado')
        .eq('empresa_id', auth.empresaId).eq('codigo', codigo).single();
      if (actual?.estado === 'ocupada') return c.json({ error: 'La mesa ya está ocupada' }, 400);

      const mesa = await updateMesa(auth.empresaId, codigo, {
        estado: 'ocupada',
        mesero_id: mesero_id || auth.userId,
        mesero_nombre: mesero_nombre || auth.user?.nombre_completo || 'Sin asignar',
        hora_ocupacion: new Date().toISOString(),
        consumo_acumulado: 0,
        numero_comanda: numero_comanda || null,
        personas: Number(personas) || 1,
        nota: nota || null,
      });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error al ocupar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/liberar ─────────────────────────────────────────
  app.post('/server/mesas/:id/liberar', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const mesa = await updateMesa(auth.empresaId, codigo, {
        estado: 'libre', mesero_id: null, mesero_nombre: null,
        hora_ocupacion: null, consumo_acumulado: 0,
        numero_comanda: null, personas: 0, nota: null,
      });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error al liberar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/reservar ────────────────────────────────────────
  app.post('/server/mesas/:id/reservar', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const { nota, personas } = await c.req.json();
      const mesa = await updateMesa(auth.empresaId, codigo, {
        estado: 'reservada', nota: nota || null,
        personas: Number(personas) || 0,
        hora_ocupacion: new Date().toISOString(),
      });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error al reservar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/esperando-cuenta ────────────────────────────────
  app.post('/server/mesas/:id/esperando-cuenta', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const mesa = await updateMesa(auth.empresaId, codigo, { estado: 'esperando_cuenta' });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/consumo ─────────────────────────────────────────
  app.post('/server/mesas/:id/consumo', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const { monto } = await c.req.json();
      const db = getDB();
      const { data: actual } = await db.from('mesas').select('consumo_acumulado')
        .eq('empresa_id', auth.empresaId).eq('codigo', codigo).single();
      const mesa = await updateMesa(auth.empresaId, codigo, {
        consumo_acumulado: (actual?.consumo_acumulado || 0) + Number(monto || 0),
      });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/transferir ──────────────────────────────────────
  app.post('/server/mesas/:id/transferir', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const { mesero_id, mesero_nombre } = await c.req.json();
      if (!mesero_nombre) return c.json({ error: 'Nombre del mesero requerido' }, 400);
      const mesa = await updateMesa(auth.empresaId, codigo, {
        mesero_id: mesero_id || null, mesero_nombre,
      });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error al transferir mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/reset ───────────────────────────────────────────────
  app.post('/server/mesas/reset', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const db = getDB();
      await db.from('mesas').delete().eq('empresa_id', auth.empresaId);
      const defaults = defaultMesas();
      const rows = defaults.map(m => ({ ...m, empresa_id: auth.empresaId }));
      await db.from('mesas').insert(rows);
      return c.json({ success: true, mensaje: 'Mesas reseteadas', mesas: defaults });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });
}
