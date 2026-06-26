// =====================================================
// RUTAS: MÓDULO DE COCINA - USANDO KV STORE
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  inicializarDatosDemo,
  obtenerProductos,
  guardarProducto,
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

// ─── Resolución recursiva de costos de ingredientes ───────────────────────────
// Soporta ingredientes de tipo 'producto' (inventario) o 'subreceta' (preparación intermedia).
// El parámetro `visited` protege contra referencias circulares (subreceta A → subreceta A).
function resolverCostoIngrediente(
  ing: any,
  productos: any[],
  todasRecetas: any[],
  visited: Set<string> = new Set()
): number {
  const cantidad = parseFloat(ing.cantidad) || 0;
  if (cantidad <= 0) return 0;

  if (ing.tipo_insumo === 'subreceta' && ing.insumo_id) {
    if (visited.has(ing.insumo_id)) {
      console.warn(`[subreceta] ⚠️ Referencia circular detectada en sub-receta: ${ing.insumo_id}`);
      return 0;
    }
    const subreceta = todasRecetas.find((r: any) => r.id === ing.insumo_id && r.es_subreceta);
    if (!subreceta) return (parseFloat(ing.costo_unitario) || 0) * cantidad;

    // Calcular costo total de la sub-receta resolviendo sus propios ingredientes
    const visitedChild = new Set(visited);
    visitedChild.add(ing.insumo_id);
    const costoTotalSub = (subreceta.ingredientes || []).reduce((sum: number, subIng: any) =>
      sum + resolverCostoIngrediente(subIng, productos, todasRecetas, visitedChild), 0);
    const porcionesSub = parseInt(subreceta.porciones) || 1;
    const costoPorUnidad = costoTotalSub / porcionesSub;
    return costoPorUnidad * cantidad;
  }

  // Ingrediente normal: buscar en productos del inventario.
  // Prioridad NIC 2: el costo valido para valuacion es el promedio ponderado,
  // no el ultimo precio pagado. Por eso costo_promedio va PRIMERO. precio_compra
  // queda como ultimo fallback porque puede tener valores absurdos de facturas
  // mal capturadas en el pasado.
  const prod = productos.find((p: any) => p.id === ing.insumo_id);
  const costoUnit = prod
    ? (parseFloat(prod.costo_promedio) ||
       parseFloat(prod.costo_unitario) ||
       parseFloat(prod.precio_costo)   ||
       parseFloat(prod.costo_receta)   ||
       parseFloat(prod.precio_compra)  || 0)
    : (parseFloat(ing.costo_unitario) || 0);
  return costoUnit * cantidad;
}

// ─── Recalcula recetas afectadas por cambios en costos de ingredientes ───────
// productosAfectadosIds: ids de productos cuyo costo acaba de cambiar.
// Para cada receta que contenga al menos uno como ingrediente directo, recalcula
// su costo_por_unidad y actualiza el producto vinculado. Tambien procesa
// sub-recetas en cascada (si A usa B, y B cambia, A se recalcula).
//
// Retorna: { recetas_actualizadas: number, productos_actualizados: [{id, nombre, costo_anterior, costo_nuevo}] }
export async function recalcularRecetasAfectadas(
  empresaId: string,
  productosAfectadosIds: string[],
): Promise<{ recetas_actualizadas: number; productos_actualizados: any[] }> {
  if (productosAfectadosIds.length === 0) return { recetas_actualizadas: 0, productos_actualizados: [] };
  try {
    const productos = await obtenerProductos(empresaId);
    const todasRecetas = await obtenerRecetas(empresaId);
    const actualizados: any[] = [];

    // Procesar en pasadas: primero sub-recetas (sus cambios propagan), luego finales
    // Hacemos 3 pasadas como tope para que cambios en cadena se propaguen
    let afectadosAcumulados = new Set(productosAfectadosIds);
    let recetasActualizadas = 0;

    for (let pasada = 0; pasada < 3; pasada++) {
      const nuevosAfectadosEnPasada = new Set<string>();
      // Recetas a recalcular: las que tengan al menos un ingrediente afectado
      const recetasAfectadas = todasRecetas.filter((r: any) =>
        Array.isArray(r.ingredientes) &&
        r.ingredientes.some((ing: any) => afectadosAcumulados.has(ing.insumo_id))
      );
      if (recetasAfectadas.length === 0) break;

      // Sub-recetas primero (afectan a recetas finales que las usen)
      recetasAfectadas.sort((a: any, b: any) =>
        (a.es_subreceta ? 0 : 1) - (b.es_subreceta ? 0 : 1)
      );

      for (const receta of recetasAfectadas) {
        const costoTotal = (receta.ingredientes || []).reduce((sum: number, ing: any) =>
          sum + resolverCostoIngrediente(ing, productos, todasRecetas), 0);
        const costoPorUnidad = costoTotal / (parseInt(receta.porciones) || 1);
        if (costoPorUnidad <= 0) continue;

        const costoFinal = parseFloat(costoPorUnidad.toFixed(4));

        if (receta.es_subreceta) {
          // Actualizar la sub-receta en sitio (no hay producto vinculado)
          const costoAnt = parseFloat(receta.costo_por_unidad) || 0;
          if (Math.abs(costoAnt - costoFinal) < 0.0001) continue;
          await guardarReceta(empresaId, { ...receta, costo_por_unidad: costoFinal });
          // Las sub-recetas no afectan productos directamente; afectan otras recetas en la proxima pasada
          recetasActualizadas++;
        } else if (receta.producto_id) {
          const prod = productos.find((p: any) => p.id === receta.producto_id);
          if (!prod) continue;
          const costoAnt = parseFloat(prod.costo_receta) || parseFloat(prod.precio_compra) || 0;
          if (Math.abs(costoAnt - costoFinal) < 0.0001) continue;
          await guardarProducto(empresaId, {
            ...prod,
            precio_compra: costoFinal,
            costo_receta:  costoFinal,
            costo_promedio: costoFinal, // alinear con NIC 2
            costo_unitario: costoFinal,
          });
          actualizados.push({
            producto_id: prod.id,
            nombre: prod.nombre,
            costo_anterior: costoAnt,
            costo_nuevo: costoFinal,
          });
          // Si este plato es a su vez ingrediente de otras recetas, marcarlo
          nuevosAfectadosEnPasada.add(prod.id);
          recetasActualizadas++;
        }
      }

      if (nuevosAfectadosEnPasada.size === 0) break;
      afectadosAcumulados = new Set([...afectadosAcumulados, ...nuevosAfectadosEnPasada]);
    }

    return { recetas_actualizadas: recetasActualizadas, productos_actualizados: actualizados };
  } catch (e: any) {
    console.error('[recalcularRecetasAfectadas] Error:', e.message);
    return { recetas_actualizadas: 0, productos_actualizados: [] };
  }
}

// ─── Actualizar costo del producto/subreceta ligado a la receta ───────────────
// Para recetas finales: actualiza precio_compra del producto final
// Para sub-recetas: actualiza costo_por_unidad en la propia receta (no necesitan producto)
async function actualizarCostoProductoDesdeReceta(empresaId: string, recetaBody: any) {
  try {
    const { producto_id, porciones, ingredientes, es_subreceta, id: recetaId } = recetaBody;
    if (!Array.isArray(ingredientes) || ingredientes.length === 0) return;

    const productos = await obtenerProductos(empresaId);
    const todasRecetas = await obtenerRecetas(empresaId);

    const costoTotal = ingredientes.reduce((sum: number, ing: any) =>
      sum + resolverCostoIngrediente(ing, productos, todasRecetas), 0);
    const costoPorUnidad = costoTotal / (parseInt(porciones) || 1);
    if (costoPorUnidad <= 0) return;

    if (es_subreceta) {
      // Sub-receta: guardar el costo_por_unidad en la propia receta
      if (recetaId) {
        const recetaActual = todasRecetas.find((r: any) => r.id === recetaId);
        if (recetaActual) {
          await guardarReceta(empresaId, {
            ...recetaActual,
            costo_por_unidad: parseFloat(costoPorUnidad.toFixed(6)),
          });
        }
      }
    } else if (producto_id) {
      // Receta final: actualizar precio_compra del producto vinculado
      const prod = productos.find((p: any) => p.id === producto_id);
      if (prod) {
        await guardarProducto(empresaId, {
          ...prod,
          precio_compra: parseFloat(costoPorUnidad.toFixed(4)),
          costo_receta:  parseFloat(costoPorUnidad.toFixed(4)),
        });
      }
    }
  } catch (e: any) {
    console.error('[actualizarCosto] Error:', e.message);
  }
}

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
      
      const todas = await obtenerComandas(auth.empresaId);
      const estado      = c.req.query('estado');
      const incluirTodas = c.req.query('incluir_todas') === 'true';

      // Por defecto el KDS solo muestra comandas activas
      const ESTADOS_ACTIVOS = ['pendiente', 'en_preparacion', 'lista'];
      let comandasFiltradas = incluirTodas
        ? todas
        : todas.filter((cmd: any) => ESTADOS_ACTIVOS.includes(cmd.estado));

      if (estado) {
        comandasFiltradas = comandasFiltradas.filter((cmd: any) => cmd.estado === estado);
      }

      // Ordenar: pendientes primero, luego en_preparacion, luego lista; dentro de cada estado por antigüedad
      const orden: Record<string, number> = { pendiente: 0, en_preparacion: 1, lista: 2 };
      comandasFiltradas.sort((a: any, b: any) => {
        const oa = orden[a.estado] ?? 99;
        const ob = orden[b.estado] ?? 99;
        if (oa !== ob) return oa - ob;
        const fechaA = new Date(a.created_at || a.fecha_creacion || 0).getTime();
        const fechaB = new Date(b.created_at || b.fecha_creacion || 0).getTime();
        return fechaA - fechaB; // más antiguas primero dentro del mismo estado
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

      // Solo incluir columnas que existen en la tabla `comandas`
      const ahora = new Date().toISOString();
      const comandaData = {
        empresa_id: auth.empresaId,
        numero_orden: body.numero_orden,
        mesa:         body.mesa        ?? null,
        tipo_servicio: body.tipo_servicio || 'mesa',
        estado:       body.estado       || 'pendiente',
        notas:        body.notas        ?? null,
        mesero_id:    body.mesero_id    ?? null,
        cajero_id:    body.cajero_id    ?? null,
        items:        body.items        || [],
        // Guardar campos extra en metadata para no perder info
        metadata: {
          ...(body.metadata || {}),
          cliente:        body.cliente   ?? null,
          prioridad:      body.prioridad ?? null,
          usuario_id:     auth.userId,
          fecha_creacion: ahora,
          fecha_recepcion: ahora,
        },
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

      // Construir updates con columnas válidas únicamente
      const updates: any = {};
      if (body.estado        !== undefined) updates.estado        = body.estado;
      if (body.notas         !== undefined) updates.notas         = body.notas;
      if (body.items         !== undefined) updates.items         = body.items;
      if (body.mesero_id     !== undefined) updates.mesero_id     = body.mesero_id;
      if (body.cajero_id     !== undefined) updates.cajero_id     = body.cajero_id;
      if (body.mesa          !== undefined) updates.mesa          = body.mesa;
      if (body.tipo_servicio !== undefined) updates.tipo_servicio = body.tipo_servicio;

      // Timestamps de estado — solo si la columna metadata existe en la tabla.
      // Guardamos en metadata para no requerir columnas extra.
      // Si la columna no existe (tablas pre-migración 013), se omite silenciosamente.
      try {
        const ahora = new Date().toISOString();
        const metaExtra: Record<string, string> = {};
        if (body.estado === 'en_preparacion') metaExtra.fecha_inicio     = ahora;
        if (body.estado === 'lista')          metaExtra.fecha_completado = ahora;
        if (body.estado === 'entregada')      metaExtra.fecha_entrega    = ahora;
        if (Object.keys(metaExtra).length > 0) {
          updates.metadata = { ...(body.metadata || {}), ...metaExtra };
        }
      } catch { /* silencioso */ }

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

    let paso = 'inicio';
    try {
      paso = 'inicializar';
      await inicializarDatosDemo(auth.empresaId);

      paso = 'obtenerRecetas';
      const recetas = await obtenerRecetas(auth.empresaId);
      console.log(`[recetas] empresaId=${auth.empresaId} | total=${recetas?.length}`);

      paso = 'obtenerProductos';
      const productos = await obtenerProductos(auth.empresaId);

      // ── Obtener nombres de productos directamente desde SQL (bypass KV cache)
      paso = 'queryProductosSQL';
      const productosDirectoMap: Record<string, any> = {};
      try {
        const idsSet = new Set<string>();
        for (const r of recetas) {
          for (const ing of (r.ingredientes || [])) {
            if (ing.insumo_id) idsSet.add(String(ing.insumo_id));
          }
        }
        const ids = Array.from(idsSet);
        if (ids.length > 0) {
          const dbDirect = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
          const { data: prodsSQL } = await dbDirect.from('productos')
            .select('id, nombre, unidad_medida, precio_costo, precio_compra')
            .eq('empresa_id', auth.empresaId)
            .in('id', ids);
          for (const p of (prodsSQL || [])) productosDirectoMap[p.id] = p;
        }
      } catch (e: any) {
        console.warn('[recetas] No se pudo cargar productos directos:', e?.message);
        // No fatal — continuamos sin nombres directos
      }

      // Enriquecer recetas con resolución recursiva de costos (soporta sub-recetas)
      const enriquecerReceta = (receta: any) => {
        const producto = productos.find((p: any) => p.id === receta.producto_id);

        const ingredientesEnriquecidos = (receta.ingredientes || []).map((ing: any) => {
          const cantidad = parseFloat(ing.cantidad) || 0;

          if (ing.tipo_insumo === 'subreceta' && ing.insumo_id) {
            const subr = recetas.find((r: any) => r.id === ing.insumo_id && r.es_subreceta);
            if (subr) {
              const costoUnit = resolverCostoIngrediente(ing, productos, recetas);
              const costoUnitPorcion = costoUnit / (cantidad || 1);
              return {
                ...ing,
                nombre_producto: subr.nombre,
                costo_unitario: parseFloat(costoUnitPorcion.toFixed(6)),
                costo_total: parseFloat(costoUnit.toFixed(4)),
                insumo: null,
                subreceta: { id: subr.id, nombre: subr.nombre, unidad_rendimiento: subr.unidad_rendimiento || 'porcion' },
              };
            }
          }

          // Buscar en SQL directo primero, luego en cache KV
          const prod = productosDirectoMap[ing.insumo_id]
            || productos.find((p: any) => p.id === ing.insumo_id);

          const costoUnit = prod
            ? (parseFloat(prod.precio_compra) || parseFloat(prod.precio_costo) ||
               parseFloat(prod.costo_receta)  || parseFloat(prod.costo_unitario) || 0)
            : (parseFloat(ing.costo_unitario) || 0);

          const nombreProducto = prod?.nombre || ing.nombre_producto || ing.nombre || '';

          return {
            ...ing,
            nombre_producto: nombreProducto,
            costo_unitario: costoUnit,
            costo_total: costoUnit * cantidad,
            insumo: prod ? {
              id: prod.id, nombre: prod.nombre,
              unidad_medida: prod.unidad_medida || ing.unidad_medida,
              costo_unitario: costoUnit,
            } : null,
          };
        });

        const costoTotalDinamico = ingredientesEnriquecidos.reduce(
          (sum: number, ing: any) => sum + (parseFloat(ing.costo_total) || 0), 0);
        const porciones = parseInt(receta.porciones) || 1;
        const costoPorUnidad = costoTotalDinamico / porciones;

        if (receta.es_subreceta) {
          // Sub-receta: no tiene precio de venta ni margen
          return {
            ...receta,
            costo_total: parseFloat(costoTotalDinamico.toFixed(4)),
            costo_por_porcion: parseFloat(costoPorUnidad.toFixed(6)),
            costo_por_unidad: parseFloat(costoPorUnidad.toFixed(6)),
            margen_bruto: null,
            precio_sugerido: null,
            producto: null,
            ingredientes: ingredientesEnriquecidos,
          };
        }

        // Receta final: calcular margen respecto al precio de venta
        const precioPorPorcion = parseFloat(receta.precio_sugerido) || parseFloat(receta.precio_venta) || parseFloat(producto?.precio) || 0;
        const margenDinamico = precioPorPorcion > 0
          ? ((precioPorPorcion - costoPorUnidad) / precioPorPorcion) * 100 : 0;

        return {
          ...receta,
          costo_por_porcion: parseFloat(costoPorUnidad.toFixed(4)),
          costo_por_unidad: parseFloat(costoPorUnidad.toFixed(4)),
          costo_total: parseFloat(costoTotalDinamico.toFixed(4)),
          margen_bruto: parseFloat(margenDinamico.toFixed(2)),
          precio_sugerido: precioPorPorcion,
          producto: producto ? { id: producto.id, codigo: producto.codigo, nombre: producto.nombre, precio: producto.precio } : null,
          ingredientes: ingredientesEnriquecidos,
        };
      };

      paso = 'enriquecer';
      const recetasEnriquecidas = recetas.map(receta => {
        try { return enriquecerReceta(receta); }
        catch (e: any) {
          console.warn('[recetas] Error enriqueciendo receta:', receta?.nombre, e?.message);
          return receta; // devolver receta sin enriquecer si falla
        }
      });
      const soloSubrecetas = recetasEnriquecidas.filter((r: any) => r.es_subreceta);
      const soloRecetasFinales = recetasEnriquecidas.filter((r: any) => !r.es_subreceta);

      return c.json({ recetas: recetasEnriquecidas, subrecetas: soloSubrecetas, recetas_finales: soloRecetasFinales });
    } catch (error: any) {
      console.error(`❌ Error en paso "${paso}":`, error?.message, error?.code);
      // Si hay recetas pero algo falló en el enriquecimiento, intentar devolver recetas crudas
      if (paso !== 'obtenerRecetas' && paso !== 'inicializar') {
        try {
          const recetasCrudas = await obtenerRecetas(auth.empresaId);
          if (recetasCrudas?.length > 0) {
            console.log('[recetas] Devolviendo recetas sin enriquecer como fallback');
            return c.json({ recetas: recetasCrudas, subrecetas: [], recetas_finales: recetasCrudas, _fallback: true });
          }
        } catch { /* silencioso */ }
      }
      return c.json({ error: 'Error al obtener recetas', paso, details: error?.message, code: error?.code }, 500);
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

  // ── GET /server/cocina/subrecetas — solo sub-recetas (preparaciones intermedias) ──
  app.get("/server/cocina/subrecetas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const recetas = await obtenerRecetas(auth.empresaId);
      const productos = await obtenerProductos(auth.empresaId);
      const subrecetas = recetas
        .filter((r: any) => r.es_subreceta === true)
        .map((sr: any) => {
          const costoTotal = (sr.ingredientes || []).reduce((sum: number, ing: any) =>
            sum + resolverCostoIngrediente(ing, productos, recetas), 0);
          const porciones = parseInt(sr.porciones) || 1;
          const costoPorUnidad = costoTotal / porciones;
          return {
            id: sr.id,
            nombre: sr.nombre,
            descripcion: sr.descripcion || '',
            porciones: sr.porciones,
            unidad_rendimiento: sr.unidad_rendimiento || 'porcion',
            costo_total: parseFloat(costoTotal.toFixed(4)),
            costo_por_unidad: parseFloat(costoPorUnidad.toFixed(6)),
            ingredientes: sr.ingredientes || [],
          };
        });
      return c.json({ subrecetas });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener sub-recetas', details: error.message }, 500);
    }
  });

  // Crear receta (o sub-receta)
  app.post("/server/cocina/recetas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    let paso = 'init';
    try {
      paso = 'parse_body';
      const body = await c.req.json();
      console.log('[recetas POST] body keys:', Object.keys(body || {}));
      console.log('[recetas POST] nombre:', body?.nombre, '| es_subreceta:', body?.es_subreceta, '| producto_id:', body?.producto_id);

      paso = 'guardar_receta';
      const recetaData = { ...body, empresa_id: auth.empresaId };
      const receta = await guardarReceta(auth.empresaId, recetaData);
      console.log('[recetas POST] receta guardada id:', receta?.id);

      paso = 'actualizar_costo';
      await actualizarCostoProductoDesdeReceta(auth.empresaId, { ...body, id: receta.id });

      return c.json({ receta }, 201);
    } catch (error: any) {
      console.error(`[recetas POST] Error en paso "${paso}":`, error?.message, error?.code);
      return c.json({ error: 'Error al crear receta', details: error.message, paso, code: error?.code }, 500);
    }
  });

  // Actualizar receta
  app.put("/server/cocina/recetas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const recetaId = c.req.param('id');
    try {
      // SEGURIDAD: guardarReceta() hace upsert por `id` sin filtrar por empresa.
      // Verificar propiedad primero — si no, otra empresa podría secuestrar/
      // sobrescribir (y reasignarse) una receta ajena pasando su id por la URL.
      const recetasActuales = await obtenerRecetas(auth.empresaId);
      if (!recetasActuales.find((r: any) => r.id === recetaId)) {
        return c.json({ error: 'Receta no encontrada' }, 404);
      }

      const body = await c.req.json();
      const recetaData = { ...body, id: recetaId, empresa_id: auth.empresaId };
      const receta = await guardarReceta(auth.empresaId, recetaData);
      if (!receta) return c.json({ error: 'Receta no encontrada' }, 404);

      // Actualizar precio_compra/costo_por_unidad según tipo de receta
      await actualizarCostoProductoDesdeReceta(auth.empresaId, { ...body, id: recetaId });

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
        const costoUnitReal = producto
          ? (parseFloat(producto.precio_compra)  ||
             parseFloat(producto.costo_receta)   ||
             parseFloat(producto.costo_unitario) ||
             parseFloat(producto.costo_promedio) || 0)
          : 0;
        const costoIngrediente = costoUnitReal * (ing.cantidad || 0);
        costoTotal += costoIngrediente;
        return {
          insumo_id: ing.insumo_id,
          nombre: producto?.nombre || 'Desconocido',
          cantidad: ing.cantidad,
          unidad: ing.unidad || producto?.unidad_medida || 'unidad',
          costo_unitario: costoUnitReal,
          costo_total: costoIngrediente
        };
      });

      return c.json({ costo_total: costoTotal, detalles: detallesCosto });
    } catch (error: any) {
      return c.json({ error: 'Error al calcular costo', details: error.message }, 500);
    }
  });

  // ─── POST /cocina/recetas/backfill-costos ────────────────────────────────────
  // Recalcula el costo por porción de TODAS las recetas existentes y actualiza
  // el precio_compra del producto final vinculado.
  // Útil para recetas creadas antes de que existiera esta lógica automática.
  // Recalcula TODAS las recetas (manual trigger). Util para limpiar estado tras
  // cambios masivos de costos. Usa la misma logica de recalcularRecetasAfectadas
  // pero pasando TODOS los ids de ingredientes como afectados.
  app.post("/server/cocina/recetas/backfill-costos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const productos = await obtenerProductos(auth.empresaId);
      // Recalcular pasando como "afectados" todos los productos del inventario
      const todosLosIds = productos.map((p: any) => p.id);
      const result = await recalcularRecetasAfectadas(auth.empresaId, todosLosIds);
      return c.json({
        success: true,
        recetas_actualizadas: result.recetas_actualizadas,
        platos_actualizados: result.productos_actualizados,
        mensaje: `${result.recetas_actualizadas} receta(s) recalculadas. ${result.productos_actualizados.length} producto(s) actualizado(s).`,
      });
    } catch (error: any) {
      return c.json({ error: 'Error en backfill de costos', details: error.message }, 500);
    }
  });

  // Alias mas descriptivo
  app.post("/server/cocina/recetas/recalcular-todas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const productos = await obtenerProductos(auth.empresaId);
      const todosLosIds = productos.map((p: any) => p.id);
      const result = await recalcularRecetasAfectadas(auth.empresaId, todosLosIds);
      return c.json({
        success: true,
        recetas_actualizadas: result.recetas_actualizadas,
        platos_actualizados: result.productos_actualizados,
      });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
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

      // ── Cargar nombres de productos para enriquecer ingredientes ────────────
      let productosMap: Record<string, any> = {};
      try {
        const dbSvc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const { data: prods } = await dbSvc.from('productos')
          .select('id, nombre, unidad_medida, precio_compra, precio_costo')
          .eq('empresa_id', auth.empresaId);
        for (const p of (prods || [])) productosMap[p.id] = p;
      } catch (e: any) {
        console.warn('[ordenes] No se pudo cargar mapa de productos:', e?.message);
      }

      // ── Enriquecer ingredientes con nombres de productos ─────────────────────
      const enriquecerIngredientes = (ingredientes: any[]) =>
        (ingredientes || []).map((ing: any) => {
          if (ing.nombre_producto) return ing; // ya tiene nombre
          const prod = productosMap[ing.insumo_id] || productosMap[ing.producto_id];
          return prod ? { ...ing, nombre_producto: prod.nombre, insumo: { id: prod.id, nombre: prod.nombre, unidad_medida: prod.unidad_medida } } : ing;
        });

      const ordenesEnriquecidas = ordenes.map((o: any) => {
        const recetaBase = recetas.find((r: any) => r.id === o.receta_id) || { nombre: 'Receta no encontrada' };
        const recetaEnriquecida = {
          ...recetaBase,
          ingredientes: enriquecerIngredientes(recetaBase.ingredientes || recetaBase.receta_ingredientes || []),
        };
        return { ...o, receta: recetaEnriquecida };
      });

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