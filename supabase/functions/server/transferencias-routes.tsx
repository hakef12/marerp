// =====================================================
// RUTAS: TRANSFERENCIAS ENTRE BODEGAS — SQL
// Tabla: transferencias_bodegas (migración 005)
// =====================================================

import { createClient } from "npm:@supabase/supabase-js";
import { transferirStockBodega, getStockBodega } from "./kv-helpers.tsx";

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export function setupTransferenciasRoutes(app: any, authMiddleware: any) {

  // ─── GET /server/transferencias ────────────────────────────────────────────
  app.get("/server/transferencias", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { data, error } = await getDB().from('transferencias_bodegas')
        .select('*').eq('empresa_id', auth.empresaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return c.json({ data: data || [] });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener transferencias', details: error.message }, 500);
    }
  });

  // ─── POST /server/transferencias ───────────────────────────────────────────
  app.post("/server/transferencias", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const {
        bodega_origen_id, bodega_origen_nombre,
        bodega_destino_id, bodega_destino_nombre,
        producto_nombre, cantidad, notas,
      } = body;

      if (!bodega_origen_id || !bodega_destino_id || !producto_nombre || !cantidad) {
        return c.json({ error: 'Faltan campos requeridos' }, 400);
      }

      // Verificar stock disponible en origen
      const stockOrigen = await getStockBodega(auth.empresaId, bodega_origen_id);
      const stockDisponible = stockOrigen[producto_nombre] || 0;
      if (stockDisponible < Number(cantidad)) {
        return c.json({
          error: `Stock insuficiente en bodega origen. Disponible: ${stockDisponible} — solicitado: ${cantidad}`
        }, 400);
      }

      const { data, error } = await getDB().from('transferencias_bodegas').insert({
        empresa_id: auth.empresaId,
        numero_transferencia: `TR-${Date.now()}`,
        bodega_origen_id,
        bodega_origen_nombre: bodega_origen_nombre || '',
        bodega_destino_id,
        bodega_destino_nombre: bodega_destino_nombre || '',
        producto_nombre,
        cantidad: Number(cantidad),
        notas: notas || '',
        estado: 'pendiente',
        solicitado_por: auth.user?.nombre_completo || '',
        stock_disponible_origen: stockDisponible,
      }).select().single();
      if (error) throw error;
      return c.json({ data }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear transferencia', details: error.message }, 500);
    }
  });

  // ─── PUT /server/transferencias/:id/aprobar ────────────────────────────────
  app.put("/server/transferencias/:id/aprobar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const db = getDB();
      const { data: trans } = await db.from('transferencias_bodegas')
        .select('estado').eq('empresa_id', auth.empresaId).eq('id', id).single();
      if (!trans) return c.json({ error: 'Transferencia no encontrada' }, 404);
      if (trans.estado !== 'pendiente') return c.json({ error: 'Solo se pueden aprobar transferencias pendientes' }, 400);

      const { data, error } = await db.from('transferencias_bodegas')
        .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
        .eq('empresa_id', auth.empresaId).eq('id', id)
        .select().single();
      if (error) throw error;
      return c.json({ data });
    } catch (error: any) {
      return c.json({ error: 'Error al aprobar transferencia', details: error.message }, 500);
    }
  });

  // ─── PUT /server/transferencias/:id/completar ──────────────────────────────
  app.put("/server/transferencias/:id/completar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const db = getDB();
      const { data: trans } = await db.from('transferencias_bodegas')
        .select('*').eq('empresa_id', auth.empresaId).eq('id', id).single();
      if (!trans) return c.json({ error: 'Transferencia no encontrada' }, 404);
      if (trans.estado !== 'aprobada') return c.json({ error: 'Solo se pueden completar transferencias aprobadas' }, 400);

      const { data, error } = await db.from('transferencias_bodegas')
        .update({ estado: 'completada', fecha_completada: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('empresa_id', auth.empresaId).eq('id', id)
        .select().single();
      if (error) throw error;

      // Mover stock entre bodegas (SQL stock_bodegas)
      const stockResult = await transferirStockBodega(
        auth.empresaId,
        trans.bodega_origen_id,
        trans.bodega_destino_id,
        trans.producto_nombre,
        trans.cantidad
      );

      return c.json({ data, stockResult });
    } catch (error: any) {
      return c.json({ error: 'Error al completar transferencia', details: error.message }, 500);
    }
  });

  // ─── PUT /server/transferencias/:id/rechazar ───────────────────────────────
  app.put("/server/transferencias/:id/rechazar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const db = getDB();
      const { data: trans } = await db.from('transferencias_bodegas')
        .select('estado').eq('empresa_id', auth.empresaId).eq('id', id).single();
      if (!trans) return c.json({ error: 'Transferencia no encontrada' }, 404);
      if (!['pendiente', 'aprobada'].includes(trans.estado)) {
        return c.json({ error: 'No se puede rechazar esta transferencia' }, 400);
      }
      const { data, error } = await db.from('transferencias_bodegas')
        .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
        .eq('empresa_id', auth.empresaId).eq('id', id)
        .select().single();
      if (error) throw error;
      return c.json({ data });
    } catch (error: any) {
      return c.json({ error: 'Error al rechazar transferencia', details: error.message }, 500);
    }
  });
}
