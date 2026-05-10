import * as kv from "./kv_store.tsx";
import { transferirStockBodega, sincronizarStockProductoReal, getStockBodega } from "./kv-helpers.tsx";

export function setupTransferenciasRoutes(app: any, authMiddleware: any) {

  // ─── GET /server/transferencias ───────────────────────────────────────────
  app.get("/server/transferencias", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const key = `transferencias_${auth.empresaId}`;
      const transferencias: any[] = (await kv.get(key)) || [];
      transferencias.sort((a: any, b: any) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());
      return c.json({ data: transferencias });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener transferencias', details: error.message }, 500);
    }
  });

  // ─── POST /server/transferencias ──────────────────────────────────────────
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

      // Check available stock in origin warehouse before creating transfer
      const stockOrigen = await getStockBodega(auth.empresaId, bodega_origen_id);
      const stockDisponible = stockOrigen[producto_nombre] || 0;
      if (stockDisponible < Number(cantidad)) {
        return c.json({
          error: `Stock insuficiente en bodega origen. Disponible: ${stockDisponible} — solicitado: ${cantidad}`
        }, 400);
      }

      const transferencia = {
        id: crypto.randomUUID(),
        numero_transferencia: `TR-${Date.now()}`,
        empresa_id: auth.empresaId,
        bodega_origen_id,
        bodega_origen_nombre: bodega_origen_nombre || '',
        bodega_destino_id,
        bodega_destino_nombre: bodega_destino_nombre || '',
        producto_nombre,
        cantidad: Number(cantidad),
        notas: notas || '',
        estado: 'pendiente',
        solicitado_por: auth.user?.nombre_completo || '',
        fecha_creacion: new Date().toISOString(),
        stock_disponible_origen: stockDisponible,
      };

      const key = `transferencias_${auth.empresaId}`;
      const transferencias: any[] = (await kv.get(key)) || [];
      transferencias.push(transferencia);
      await kv.set(key, transferencias);

      return c.json({ data: transferencia }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear transferencia', details: error.message }, 500);
    }
  });

  // ─── PUT /server/transferencias/:id/aprobar ───────────────────────────────
  app.put("/server/transferencias/:id/aprobar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const key = `transferencias_${auth.empresaId}`;
      const transferencias: any[] = (await kv.get(key)) || [];
      const idx = transferencias.findIndex((t: any) => t.id === id);
      if (idx === -1) return c.json({ error: 'Transferencia no encontrada' }, 404);
      if (transferencias[idx].estado !== 'pendiente') {
        return c.json({ error: 'Solo se pueden aprobar transferencias pendientes' }, 400);
      }
      transferencias[idx].estado = 'aprobada';
      await kv.set(key, transferencias);
      return c.json({ data: transferencias[idx] });
    } catch (error: any) {
      return c.json({ error: 'Error al aprobar transferencia', details: error.message }, 500);
    }
  });

  // ─── PUT /server/transferencias/:id/completar ─────────────────────────────
  app.put("/server/transferencias/:id/completar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const key = `transferencias_${auth.empresaId}`;
      const transferencias: any[] = (await kv.get(key)) || [];
      const idx = transferencias.findIndex((t: any) => t.id === id);
      if (idx === -1) return c.json({ error: 'Transferencia no encontrada' }, 404);
      if (transferencias[idx].estado !== 'aprobada') {
        return c.json({ error: 'Solo se pueden completar transferencias aprobadas' }, 400);
      }
      transferencias[idx].estado = 'completada';
      transferencias[idx].fecha_completada = new Date().toISOString();
      await kv.set(key, transferencias);

      // Mover stock entre bodegas (stock_bodegas KV)
      const transferencia = transferencias[idx];
      const stockResult = await transferirStockBodega(
        auth.empresaId,
        transferencia.bodega_origen_id,
        transferencia.bodega_destino_id,
        transferencia.producto_nombre,
        transferencia.cantidad
      );
      // La transferencia no modifica stock_actual global (el stock ya está en destino,
      // solo cambia de bodega — el total de la empresa no varía)

      return c.json({ data: transferencias[idx], stockResult });
    } catch (error: any) {
      return c.json({ error: 'Error al completar transferencia', details: error.message }, 500);
    }
  });

  // ─── PUT /server/transferencias/:id/rechazar ──────────────────────────────
  app.put("/server/transferencias/:id/rechazar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const id = c.req.param('id');
      const key = `transferencias_${auth.empresaId}`;
      const transferencias: any[] = (await kv.get(key)) || [];
      const idx = transferencias.findIndex((t: any) => t.id === id);
      if (idx === -1) return c.json({ error: 'Transferencia no encontrada' }, 404);
      if (!['pendiente', 'aprobada'].includes(transferencias[idx].estado)) {
        return c.json({ error: 'No se puede rechazar esta transferencia' }, 400);
      }
      transferencias[idx].estado = 'rechazada';
      await kv.set(key, transferencias);
      return c.json({ data: transferencias[idx] });
    } catch (error: any) {
      return c.json({ error: 'Error al rechazar transferencia', details: error.message }, 500);
    }
  });
}
