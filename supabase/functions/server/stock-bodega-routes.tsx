import {
  getStockBodega,
  getStockBodegas,
  ajustarStockBodega,
  getMermas,
  guardarMerma,
  obtenerBodegas,
} from "./kv-helpers.tsx";

export function setupStockBodegaRoutes(app: any, authMiddleware: any) {

  // ─── GET /server/stock/bodega/:bodegaId ───────────────────────────────────
  // Returns stock for one bodega as array [{ producto_nombre, cantidad }] sorted by nombre
  app.get("/server/stock/bodega/:bodegaId", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.param('bodegaId');
      const stockMap = await getStockBodega(auth.empresaId, bodegaId);
      const items = Object.entries(stockMap)
        .map(([producto_nombre, cantidad]) => ({ producto_nombre, cantidad }))
        .sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre));
      return c.json({ data: items });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener stock de bodega', details: error.message }, 500);
    }
  });

  // ─── GET /server/stock/consolidado ────────────────────────────────────────
  // Returns all bodegas with their stock: [{ bodega_id, bodega_nombre, productos: [{nombre, cantidad}] }]
  app.get("/server/stock/consolidado", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const [bodegas, allStock] = await Promise.all([
        obtenerBodegas(auth.empresaId),
        getStockBodegas(auth.empresaId),
      ]);

      const consolidado = (bodegas as any[]).map((bodega: any) => {
        const stockMap = allStock[bodega.id] || {};
        const productos = Object.entries(stockMap)
          .map(([nombre, cantidad]) => ({ nombre, cantidad }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
        return {
          bodega_id: bodega.id,
          bodega_nombre: bodega.nombre,
          productos,
        };
      });

      return c.json({ data: consolidado });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener stock consolidado', details: error.message }, 500);
    }
  });

  // ─── POST /server/stock/bodega/:bodegaId/ajustar ──────────────────────────
  // body: { producto_nombre, cantidad, tipo: 'entrada'|'salida'|'ajuste', motivo }
  app.post("/server/stock/bodega/:bodegaId/ajustar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegaId = c.req.param('bodegaId');
      const body = await c.req.json();
      const { producto_nombre, cantidad, tipo, motivo } = body;

      if (!producto_nombre || cantidad === undefined || !tipo) {
        return c.json({ error: 'Faltan campos requeridos: producto_nombre, cantidad, tipo' }, 400);
      }

      const cantidadNum = Number(cantidad);
      let delta = 0;

      if (tipo === 'entrada') {
        delta = cantidadNum;
      } else if (tipo === 'salida') {
        delta = -cantidadNum;
      } else if (tipo === 'ajuste') {
        // For 'ajuste', set absolute value: compute delta from current
        const currentStock = await getStockBodega(auth.empresaId, bodegaId);
        const current = currentStock[producto_nombre] || 0;
        delta = cantidadNum - current;
      } else {
        return c.json({ error: 'tipo debe ser: entrada, salida o ajuste' }, 400);
      }

      await ajustarStockBodega(auth.empresaId, bodegaId, producto_nombre, delta);

      const updatedStock = await getStockBodega(auth.empresaId, bodegaId);
      const nuevaCantidad = updatedStock[producto_nombre] || 0;

      return c.json({
        data: {
          bodega_id: bodegaId,
          producto_nombre,
          cantidad_anterior: nuevaCantidad - delta,
          cantidad_nueva: nuevaCantidad,
          delta,
          tipo,
          motivo: motivo || '',
          fecha: new Date().toISOString(),
        }
      });
    } catch (error: any) {
      return c.json({ error: 'Error al ajustar stock', details: error.message }, 500);
    }
  });

  // ─── GET /server/produccion/mermas ────────────────────────────────────────
  app.get("/server/produccion/mermas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const mermas = await getMermas(auth.empresaId);
      return c.json({ data: mermas });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener mermas', details: error.message }, 500);
    }
  });

  // ─── POST /server/produccion/mermas ───────────────────────────────────────
  // Create manual merma: { bodega_id, bodega_nombre, producto_nombre, cantidad_perdida, motivo, tipo }
  app.post("/server/produccion/mermas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const { bodega_id, bodega_nombre, producto_nombre, cantidad_perdida, motivo, tipo } = body;

      if (!bodega_id || !producto_nombre || !cantidad_perdida) {
        return c.json({ error: 'Faltan campos requeridos: bodega_id, producto_nombre, cantidad_perdida' }, 400);
      }

      const cantidadNum = Number(cantidad_perdida);

      // Subtract from bodega stock
      await ajustarStockBodega(auth.empresaId, bodega_id, producto_nombre, -cantidadNum);

      const merma = await guardarMerma(auth.empresaId, {
        empresa_id: auth.empresaId,
        bodega_id,
        bodega_nombre: bodega_nombre || '',
        producto_nombre,
        cantidad_perdida: cantidadNum,
        motivo: motivo || '',
        tipo: tipo || 'otro',
        fecha: new Date().toISOString(),
        registrado_por: auth.user?.nombre_completo || '',
        origen: 'manual',
      });

      return c.json({ data: merma }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al registrar merma', details: error.message }, 500);
    }
  });
}
