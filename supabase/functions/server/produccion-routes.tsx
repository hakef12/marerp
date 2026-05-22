// =====================================================
// RUTAS: PRODUCCIÓN (órdenes bodega→bodega) — SQL
// Tablas: produccion_ordenes, produccion_lotes
// =====================================================

import { createClient } from "npm:@supabase/supabase-js";
import {
  ajustarStockBodega,
  guardarMerma,
  sincronizarStockProductoReal,
  obtenerProductos,
} from "./kv-helpers.tsx";

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export function setupProduccionRoutes(app: any, authMiddleware: any) {

  // ─── GET /server/produccion/ordenes ────────────────────────────────────────
  app.get("/server/produccion/ordenes", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.query('bodega_id');
      let query = getDB().from('produccion_ordenes')
        .select('*').eq('empresa_id', auth.empresaId)
        .order('created_at', { ascending: false });
      if (bodegaId) {
        query = query.or(`bodega_origen_id.eq.${bodegaId},bodega_destino_id.eq.${bodegaId}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return c.json({ data: data || [] });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener órdenes', details: error.message }, 500);
    }
  });

  // ─── POST /server/produccion/ordenes ───────────────────────────────────────
  app.post("/server/produccion/ordenes", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const {
        bodega_origen_id, bodega_origen_nombre,
        bodega_destino_id, bodega_destino_nombre,
        producto_nombre, cantidad, notas, fecha_esperada,
      } = body;

      if (!bodega_origen_id || !bodega_destino_id || !producto_nombre || !cantidad) {
        return c.json({ error: 'Faltan campos requeridos' }, 400);
      }

      const { data, error } = await getDB().from('produccion_ordenes').insert({
        empresa_id: auth.empresaId,
        numero_orden: `OP-${Date.now()}`,
        bodega_origen_id,
        bodega_origen_nombre: bodega_origen_nombre || '',
        bodega_destino_id,
        bodega_destino_nombre: bodega_destino_nombre || '',
        producto_nombre,
        cantidad: Number(cantidad),
        notas: notas || '',
        estado: 'pendiente',
        fecha_esperada: fecha_esperada || new Date().toISOString().split('T')[0],
      }).select().single();
      if (error) throw error;
      return c.json({ data }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear orden', details: error.message }, 500);
    }
  });

  // ─── PUT /server/produccion/ordenes/:id/iniciar ────────────────────────────
  app.put("/server/produccion/ordenes/:id/iniciar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const db = getDB();
      const { data: orden } = await db.from('produccion_ordenes')
        .select('estado').eq('empresa_id', auth.empresaId).eq('id', id).single();
      if (!orden) return c.json({ error: 'Orden no encontrada' }, 404);
      if (orden.estado !== 'pendiente') return c.json({ error: 'Solo se pueden iniciar órdenes pendientes' }, 400);

      const { data, error } = await db.from('produccion_ordenes')
        .update({ estado: 'en_proceso', updated_at: new Date().toISOString() })
        .eq('empresa_id', auth.empresaId).eq('id', id)
        .select().single();
      if (error) throw error;
      return c.json({ data });
    } catch (error: any) {
      return c.json({ error: 'Error al iniciar orden', details: error.message }, 500);
    }
  });

  // ─── PUT /server/produccion/ordenes/:id/completar ──────────────────────────
  app.put("/server/produccion/ordenes/:id/completar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const db = getDB();
      const { data: orden } = await db.from('produccion_ordenes')
        .select('*').eq('empresa_id', auth.empresaId).eq('id', id).single();
      if (!orden) return c.json({ error: 'Orden no encontrada' }, 404);
      if (orden.estado !== 'en_proceso') return c.json({ error: 'Solo se pueden completar órdenes en proceso' }, 400);

      let bodyData: any = {};
      try { bodyData = await c.req.json(); } catch { /* no body is fine */ }

      const cantidad_real = bodyData.cantidad_real !== undefined ? Number(bodyData.cantidad_real) : orden.cantidad;
      const merma_cantidad = bodyData.merma_cantidad !== undefined ? Number(bodyData.merma_cantidad) : 0;
      const merma_motivo = bodyData.merma_motivo || '';
      const merma_porcentaje = orden.cantidad > 0 ? (merma_cantidad / orden.cantidad * 100).toFixed(1) : '0.0';
      const now = new Date().toISOString();

      // Actualizar orden en SQL
      const { data: ordenActualizada, error: updErr } = await db.from('produccion_ordenes')
        .update({
          estado: 'completada',
          fecha_completada: now,
          cantidad_real,
          merma: merma_cantidad,
          merma_porcentaje,
          updated_at: now,
        })
        .eq('empresa_id', auth.empresaId).eq('id', id)
        .select().single();
      if (updErr) throw updErr;

      // Actualizar stock
      await ajustarStockBodega(auth.empresaId, orden.bodega_destino_id, orden.producto_nombre, cantidad_real);
      await sincronizarStockProductoReal(auth.empresaId, orden.producto_nombre, cantidad_real);

      // Registrar merma si aplica
      let mermaRecord = null;
      if (merma_cantidad > 0) {
        mermaRecord = await guardarMerma(auth.empresaId, {
          empresa_id: auth.empresaId,
          bodega_id: orden.bodega_destino_id,
          bodega_nombre: orden.bodega_destino_nombre,
          producto_nombre: orden.producto_nombre,
          cantidad_perdida: merma_cantidad,
          cantidad_planificada: orden.cantidad,
          cantidad_real,
          merma_porcentaje,
          motivo: merma_motivo,
          tipo: 'produccion',
          orden_id: orden.id,
          numero_orden: orden.numero_orden,
          fecha: now,
          registrado_por: auth.user?.nombre_completo || 'Sistema',
          origen: 'produccion',
        });
      }

      // Crear lote en SQL
      const { data: lote, error: loteErr } = await db.from('produccion_lotes').insert({
        empresa_id: auth.empresaId,
        numero_lote: `LOT-${Date.now()}`,
        orden_id: orden.id,
        producto_nombre: orden.producto_nombre,
        cantidad_planificada: orden.cantidad,
        cantidad_real,
        cantidad: cantidad_real,
        merma: merma_cantidad,
        merma_porcentaje,
        merma_motivo,
        bodega_origen_id: orden.bodega_origen_id,
        bodega_origen_nombre: orden.bodega_origen_nombre,
        bodega_id: orden.bodega_destino_id,
        bodega_nombre: orden.bodega_destino_nombre,
        fecha_produccion: now,
      }).select().single();
      if (loteErr) console.warn('⚠ Error guardando lote:', loteErr.message);

      // Crear transferencia automática en SQL
      const { data: transferencia, error: transErr } = await db.from('transferencias_bodegas').insert({
        empresa_id: auth.empresaId,
        numero_transferencia: `TR-${Date.now()}`,
        bodega_origen_id: orden.bodega_origen_id,
        bodega_origen_nombre: orden.bodega_origen_nombre,
        bodega_destino_id: orden.bodega_destino_id,
        bodega_destino_nombre: orden.bodega_destino_nombre,
        producto_nombre: orden.producto_nombre,
        cantidad: cantidad_real,
        notas: `Transferencia automática desde orden ${orden.numero_orden}${merma_cantidad > 0 ? ` (merma: ${merma_cantidad})` : ''}`,
        estado: 'completada',
        solicitado_por: auth.user?.nombre_completo || 'Sistema',
        fecha_completada: now,
      }).select().single();
      if (transErr) console.warn('⚠ Error guardando transferencia automática:', transErr.message);

      return c.json({ data: ordenActualizada, lote, transferencia, merma: mermaRecord });
    } catch (error: any) {
      return c.json({ error: 'Error al completar orden', details: error.message }, 500);
    }
  });

  // ─── PUT /server/produccion/ordenes/:id/cancelar ───────────────────────────
  app.put("/server/produccion/ordenes/:id/cancelar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const db = getDB();
      const { data: orden } = await db.from('produccion_ordenes')
        .select('estado').eq('empresa_id', auth.empresaId).eq('id', id).single();
      if (!orden) return c.json({ error: 'Orden no encontrada' }, 404);
      if (!['pendiente', 'en_proceso'].includes(orden.estado)) {
        return c.json({ error: 'No se puede cancelar esta orden' }, 400);
      }
      const { data, error } = await db.from('produccion_ordenes')
        .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
        .eq('empresa_id', auth.empresaId).eq('id', id)
        .select().single();
      if (error) throw error;
      return c.json({ data });
    } catch (error: any) {
      return c.json({ error: 'Error al cancelar orden', details: error.message }, 500);
    }
  });

  // ─── GET /server/produccion/lotes ──────────────────────────────────────────
  app.get("/server/produccion/lotes", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { data, error } = await getDB().from('produccion_lotes')
        .select('*').eq('empresa_id', auth.empresaId)
        .order('fecha_produccion', { ascending: false });
      if (error) throw error;
      return c.json({ data: data || [] });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener lotes', details: error.message }, 500);
    }
  });
}
