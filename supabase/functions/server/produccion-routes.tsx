import * as kv from "./kv_store.tsx";

export function setupProduccionRoutes(app: any, authMiddleware: any) {

  // ─── GET /server/produccion/ordenes ───────────────────────────────────────
  app.get("/server/produccion/ordenes", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.query('bodega_id');
      const key = `produccion_ordenes_${auth.empresaId}`;
      const ordenes: any[] = (await kv.get(key)) || [];
      const filtered = bodegaId
        ? ordenes.filter((o: any) => o.bodega_origen_id === bodegaId || o.bodega_destino_id === bodegaId)
        : ordenes;
      // Más recientes primero
      filtered.sort((a: any, b: any) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());
      return c.json({ data: filtered });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener órdenes', details: error.message }, 500);
    }
  });

  // ─── POST /server/produccion/ordenes ──────────────────────────────────────
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

      const orden = {
        id: crypto.randomUUID(),
        numero_orden: `OP-${Date.now()}`,
        empresa_id: auth.empresaId,
        bodega_origen_id,
        bodega_origen_nombre: bodega_origen_nombre || '',
        bodega_destino_id,
        bodega_destino_nombre: bodega_destino_nombre || '',
        producto_nombre,
        cantidad: Number(cantidad),
        notas: notas || '',
        estado: 'pendiente',
        fecha_creacion: new Date().toISOString(),
        fecha_esperada: fecha_esperada || new Date().toISOString().split('T')[0],
      };

      const key = `produccion_ordenes_${auth.empresaId}`;
      const ordenes: any[] = (await kv.get(key)) || [];
      ordenes.push(orden);
      await kv.set(key, ordenes);

      return c.json({ data: orden }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear orden', details: error.message }, 500);
    }
  });

  // ─── PUT /server/produccion/ordenes/:id/iniciar ───────────────────────────
  app.put("/server/produccion/ordenes/:id/iniciar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const key = `produccion_ordenes_${auth.empresaId}`;
      const ordenes: any[] = (await kv.get(key)) || [];
      const idx = ordenes.findIndex((o: any) => o.id === id);
      if (idx === -1) return c.json({ error: 'Orden no encontrada' }, 404);
      if (ordenes[idx].estado !== 'pendiente') {
        return c.json({ error: 'Solo se pueden iniciar órdenes en estado pendiente' }, 400);
      }
      ordenes[idx].estado = 'en_proceso';
      await kv.set(key, ordenes);
      return c.json({ data: ordenes[idx] });
    } catch (error: any) {
      return c.json({ error: 'Error al iniciar orden', details: error.message }, 500);
    }
  });

  // ─── PUT /server/produccion/ordenes/:id/completar ─────────────────────────
  app.put("/server/produccion/ordenes/:id/completar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const key = `produccion_ordenes_${auth.empresaId}`;
      const ordenes: any[] = (await kv.get(key)) || [];
      const idx = ordenes.findIndex((o: any) => o.id === id);
      if (idx === -1) return c.json({ error: 'Orden no encontrada' }, 404);
      if (ordenes[idx].estado !== 'en_proceso') {
        return c.json({ error: 'Solo se pueden completar órdenes en proceso' }, 400);
      }

      const orden = ordenes[idx];
      const now = new Date().toISOString();
      orden.estado = 'completada';
      orden.fecha_completada = now;
      await kv.set(key, ordenes);

      // Crear lote de producción
      const lote = {
        id: crypto.randomUUID(),
        numero_lote: `LOT-${Date.now()}`,
        empresa_id: auth.empresaId,
        orden_id: orden.id,
        producto_nombre: orden.producto_nombre,
        cantidad: orden.cantidad,
        bodega_id: orden.bodega_destino_id,
        bodega_nombre: orden.bodega_destino_nombre,
        fecha_produccion: now,
      };
      const lotesKey = `produccion_lotes_${auth.empresaId}`;
      const lotes: any[] = (await kv.get(lotesKey)) || [];
      lotes.push(lote);
      await kv.set(lotesKey, lotes);

      // Crear transferencia automática
      const transferencia = {
        id: crypto.randomUUID(),
        numero_transferencia: `TR-${Date.now()}`,
        empresa_id: auth.empresaId,
        bodega_origen_id: orden.bodega_origen_id,
        bodega_origen_nombre: orden.bodega_origen_nombre,
        bodega_destino_id: orden.bodega_destino_id,
        bodega_destino_nombre: orden.bodega_destino_nombre,
        producto_nombre: orden.producto_nombre,
        cantidad: orden.cantidad,
        notas: `Transferencia automática desde orden ${orden.numero_orden}`,
        estado: 'completada',
        solicitado_por: auth.user?.nombre_completo || 'Sistema',
        fecha_creacion: now,
        fecha_completada: now,
      };
      const transKey = `transferencias_${auth.empresaId}`;
      const transferencias: any[] = (await kv.get(transKey)) || [];
      transferencias.push(transferencia);
      await kv.set(transKey, transferencias);

      return c.json({ data: orden, lote, transferencia });
    } catch (error: any) {
      return c.json({ error: 'Error al completar orden', details: error.message }, 500);
    }
  });

  // ─── PUT /server/produccion/ordenes/:id/cancelar ──────────────────────────
  app.put("/server/produccion/ordenes/:id/cancelar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const key = `produccion_ordenes_${auth.empresaId}`;
      const ordenes: any[] = (await kv.get(key)) || [];
      const idx = ordenes.findIndex((o: any) => o.id === id);
      if (idx === -1) return c.json({ error: 'Orden no encontrada' }, 404);
      if (!['pendiente', 'en_proceso'].includes(ordenes[idx].estado)) {
        return c.json({ error: 'No se puede cancelar esta orden' }, 400);
      }
      ordenes[idx].estado = 'cancelada';
      await kv.set(key, ordenes);
      return c.json({ data: ordenes[idx] });
    } catch (error: any) {
      return c.json({ error: 'Error al cancelar orden', details: error.message }, 500);
    }
  });

  // ─── GET /server/produccion/lotes ─────────────────────────────────────────
  app.get("/server/produccion/lotes", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const key = `produccion_lotes_${auth.empresaId}`;
      const lotes: any[] = (await kv.get(key)) || [];
      lotes.sort((a: any, b: any) => new Date(b.fecha_produccion).getTime() - new Date(a.fecha_produccion).getTime());
      return c.json({ data: lotes });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener lotes', details: error.message }, 500);
    }
  });
}
