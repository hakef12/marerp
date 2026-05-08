// =====================================================
// RUTAS: MÓDULO DE COCINA - USANDO KV STORE
// =====================================================

import {
  inicializarDatosDemo,
  obtenerProductos,
  obtenerComandas,
  guardarComanda,
  actualizarComanda,
  obtenerRecetas,
  guardarReceta,
  eliminarReceta,
  obtenerOrdenesProduccion,
  guardarOrdenProduccion,
  guardarMovimiento
} from "./kv-helpers.tsx";

export function setupCocinaRoutes(app: any, authMiddleware: any) {

  // =====================================================
  // COMANDAS
  // =====================================================

  // Listar comandas
  app.get("/server/cocina/comandas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      console.log(`🍳 [GET /cocina/comandas] Obteniendo comandas para empresa: ${auth.empresaId}`);
      
      await inicializarDatosDemo(auth.empresaId);
      
      const comandas = await obtenerComandas(auth.empresaId);
      const estado = c.req.query('estado');

      let comandasFiltradas = comandas;
      
      if (estado) {
        comandasFiltradas = comandas.filter((cmd: any) => cmd.estado === estado);
      }

      // Ordenar por fecha (más recientes primero)
      comandasFiltradas.sort((a: any, b: any) => {
        const fechaA = new Date(a.created_at || a.fecha_creacion || 0).getTime();
        const fechaB = new Date(b.created_at || b.fecha_creacion || 0).getTime();
        return fechaB - fechaA;
      });

      return c.json({ comandas: comandasFiltradas });
    } catch (error: any) {
      console.error('❌ Error obteniendo comandas:', error);
      return c.json({ error: 'Error al obtener comandas', details: error.message }, 500);
    }
  });

  // Crear comanda
  app.post("/server/cocina/comandas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      const body = await c.req.json();
      console.log('🍳 [POST /cocina/comandas] Creando comanda:', body);

      const comandaData = {
        ...body,
        empresa_id: auth.empresaId,
        usuario_id: auth.userId,
        estado: body.estado || 'pendiente',
        fecha_creacion: new Date().toISOString(),
        fecha_recepcion: new Date().toISOString()
      };

      const comanda = await guardarComanda(auth.empresaId, comandaData);

      return c.json({ comanda }, 201);
    } catch (error: any) {
      console.error('❌ Error creando comanda:', error);
      return c.json({ error: 'Error al crear comanda', details: error.message }, 500);
    }
  });

  // Actualizar estado de comanda
  app.put("/server/cocina/comandas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const comandaId = c.req.param('id');

    try {
      const body = await c.req.json();
      const updates: any = { ...body };

      if (body.estado === 'en_preparacion' && !updates.fecha_inicio) {
        updates.fecha_inicio = new Date().toISOString();
      }
      
      if (body.estado === 'lista' && !updates.fecha_completado) {
        updates.fecha_completado = new Date().toISOString();
      }

      const comanda = await actualizarComanda(auth.empresaId, comandaId, updates);

      if (!comanda) {
        return c.json({ error: 'Comanda no encontrada' }, 404);
      }

      return c.json({ comanda });
    } catch (error: any) {
      console.error('❌ Error actualizando comanda:', error);
      return c.json({ error: 'Error al actualizar comanda', details: error.message }, 500);
    }
  });

  // =====================================================
  // RECETAS (INGENIERÍA DE MENÚ)
  // =====================================================

  // Listar recetas
  app.get("/server/cocina/recetas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      await inicializarDatosDemo(auth.empresaId);
      
      const recetas = await obtenerRecetas(auth.empresaId);
      const productos = await obtenerProductos(auth.empresaId);

      // Enriquecer recetas con información de productos
      const recetasEnriquecidas = recetas.map((receta: any) => {
        const producto = productos.find((p: any) => p.id === receta.producto_id);
        
        const ingredientes = receta.ingredientes?.map((ing: any) => {
          const ingredienteProducto = productos.find((p: any) => p.id === ing.insumo_id);
          return {
            ...ing,
            insumo: ingredienteProducto ? {
              id: ingredienteProducto.id,
              codigo: ingredienteProducto.codigo,
              nombre: ingredienteProducto.nombre,
              unidad_medida: ingredienteProducto.unidad_medida,
              costo_unitario: ingredienteProducto.costo_unitario
            } : null
          };
        }) || [];

        return {
          ...receta,
          producto: producto ? {
            id: producto.id,
            codigo: producto.codigo,
            nombre: producto.nombre,
            precio: producto.precio
          } : null,
          ingredientes
        };
      });

      return c.json({ recetas: recetasEnriquecidas });
    } catch (error: any) {
      console.error('❌ Error obteniendo recetas:', error);
      return c.json({ error: 'Error al obtener recetas', details: error.message }, 500);
    }
  });

  // Obtener receta por ID
  app.get("/server/cocina/recetas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const recetaId = c.req.param('id');

    try {
      const recetas = await obtenerRecetas(auth.empresaId);
      const receta = recetas.find((r: any) => r.id === recetaId);

      if (!receta) return c.json({ error: 'Receta no encontrada' }, 404);

      const productos = await obtenerProductos(auth.empresaId);
      const producto = productos.find((p: any) => p.id === receta.producto_id);

      return c.json({ receta: { ...receta, producto } });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener receta', details: error.message }, 500);
    }
  });

  // Crear receta
  app.post("/server/cocina/recetas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const recetaData = { ...body, empresa_id: auth.empresaId };
      const receta = await guardarReceta(auth.empresaId, recetaData);
      return c.json({ receta }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear receta', details: error.message }, 500);
    }
  });

  // Actualizar receta
  app.put("/server/cocina/recetas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const recetaId = c.req.param('id');
    try {
      const body = await c.req.json();
      const recetaData = { ...body, id: recetaId };
      const receta = await guardarReceta(auth.empresaId, recetaData);
      if (!receta) return c.json({ error: 'Receta no encontrada' }, 404);
      return c.json({ receta });
    } catch (error: any) {
      return c.json({ error: 'Error al actualizar receta', details: error.message }, 500);
    }
  });

  // Eliminar receta
  app.delete("/server/cocina/recetas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const recetaId = c.req.param('id');
    try {
      await eliminarReceta(auth.empresaId, recetaId);
      return c.json({ message: 'Receta eliminada exitosamente' });
    } catch (error: any) {
      return c.json({ error: 'Error al eliminar receta', details: error.message }, 500);
    }
  });

  // Calcular costo de receta
  app.post("/server/cocina/recetas/calcular-costo", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const { ingredientes } = body;
      if (!ingredientes || !Array.isArray(ingredientes)) return c.json({ error: 'Se requiere array de ingredientes' }, 400);

      const productos = await obtenerProductos(auth.empresaId);
      let costoTotal = 0;
      
      const detallesCosto = ingredientes.map((ing: any) => {
        const producto = productos.find((p: any) => p.id === ing.insumo_id);
        const costoIngrediente = producto ? (producto.costo_unitario || 0) * (ing.cantidad || 0) : 0;
        costoTotal += costoIngrediente;
        return {
          insumo_id: ing.insumo_id,
          nombre: producto?.nombre || 'Desconocido',
          cantidad: ing.cantidad,
          unidad: ing.unidad || producto?.unidad_medida || 'unidad',
          costo_unitario: producto?.costo_unitario || 0,
          costo_total: costoIngrediente
        };
      });

      return c.json({ costo_total: costoTotal, detalles: detallesCosto });
    } catch (error: any) {
      return c.json({ error: 'Error al calcular costo', details: error.message }, 500);
    }
  });

  // =====================================================
  // ÓRDENES DE PRODUCCIÓN Y EJECUCIÓN (NUEVO ✅)
  // =====================================================

  // Listar Órdenes de Producción
  app.get("/server/cocina/ordenes-produccion", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const ordenes = await obtenerOrdenesProduccion(auth.empresaId);
      const recetas = await obtenerRecetas(auth.empresaId);

      const ordenesEnriquecidas = ordenes.map((o: any) => ({
        ...o,
        receta: recetas.find((r: any) => r.id === o.receta_id) || { nombre: 'Receta no encontrada' }
      }));

      ordenesEnriquecidas.sort((a: any, b: any) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      return c.json({ ordenes: ordenesEnriquecidas });
    } catch (error: any) {
      console.error('❌ Error obteniendo órdenes:', error);
      return c.json({ error: 'Error al obtener órdenes de producción', details: error.message }, 500);
    }
  });

  // Crear Orden de Producción (Botón Producir)
  app.post("/server/cocina/producir", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const numeroOrden = `OP-${Math.floor(Math.random() * 9000 + 1000)}`;

      const nuevaOrden = {
        empresa_id: auth.empresaId,
        usuario_id: auth.userId,
        numero_orden: numeroOrden,
        receta_id: body.receta_id,
        bodega_origen_id: body.bodega_origen_id,
        bodega_destino_id: body.bodega_destino_id,
        cantidad_lotes: body.cantidad_lotes || 1,
        cantidad_porciones: body.cantidad_porciones || 1,
        notas: body.notas || '',
        estado: 'planificada',
        fecha_programada: new Date().toISOString()
      };

      const orden = await guardarOrdenProduccion(auth.empresaId, nuevaOrden);
      return c.json({ success: true, orden }, 201);
    } catch (error: any) {
      console.error('❌ Error al crear producción:', error);
      return c.json({ error: 'Error al crear orden de producción', details: error.message }, 500);
    }
  });

  // Actualizar estado de Orden (Iniciar, Completar, Cancelar)
  app.put("/server/cocina/ordenes-produccion/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const ordenId = c.req.param('id');

    try {
      const body = await c.req.json();
      const ordenes = await obtenerOrdenesProduccion(auth.empresaId);
      const orden = ordenes.find((o: any) => o.id === ordenId);

      if (!orden) {
        return c.json({ error: 'Orden no encontrada' }, 404);
      }

      const actualizada: any = { ...orden, ...body };

      if (body.estado === 'en_proceso' && !actualizada.fecha_inicio) {
        actualizada.fecha_inicio = new Date().toISOString();
      }

      // Al completar: descontar ingredientes y agregar producto terminado
      if (body.estado === 'completada' && orden.estado !== 'completada') {
        actualizada.fecha_fin = new Date().toISOString();

        const recetas = await obtenerRecetas(auth.empresaId);
        const receta = recetas.find((r: any) => r.id === actualizada.receta_id);

        if (receta) {
          const lotes = actualizada.cantidad_lotes || 1;

          // Descontar ingredientes de bodega origen
          if (receta.ingredientes && Array.isArray(receta.ingredientes)) {
            for (const ing of receta.ingredientes) {
              if (ing.insumo_id && ing.cantidad > 0) {
                await guardarMovimiento(auth.empresaId, {
                  tipo: 'salida',
                  producto_id: ing.insumo_id,
                  bodega_id: actualizada.bodega_origen_id || '',
                  cantidad: ing.cantidad * lotes,
                  costo_unitario: 0,
                  referencia: `Producción ${actualizada.numero_orden}`,
                  observaciones: `Ingrediente usado en producción`,
                  usuario_id: auth.userId
                });
              }
            }
          }

          // Agregar producto terminado a bodega destino
          if (receta.producto_id) {
            const porciones = actualizada.cantidad_porciones || receta.porciones || 1;
            await guardarMovimiento(auth.empresaId, {
              tipo: 'entrada',
              producto_id: receta.producto_id,
              bodega_id: actualizada.bodega_destino_id || actualizada.bodega_origen_id || '',
              cantidad: porciones * lotes,
              costo_unitario: 0,
              referencia: `Producción ${actualizada.numero_orden}`,
              observaciones: `Producto terminado de producción`,
              usuario_id: auth.userId
            });
          }
        }
      }

      const ordenActualizada = await guardarOrdenProduccion(auth.empresaId, actualizada);
      return c.json({ success: true, orden: ordenActualizada });
    } catch (error: any) {
      console.error('❌ Error al actualizar orden:', error);
      return c.json({ error: 'Error al actualizar orden de producción', details: error.message }, 500);
    }
  });

}