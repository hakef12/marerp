// =====================================================
// RUTAS: INGENIERÍA DE MENÚ - USANDO KV STORE
// =====================================================

import { 
  inicializarDatosDemo,
  obtenerProductos,
  obtenerRecetas,
  guardarReceta,
  eliminarReceta,
  obtenerVentas
} from "./kv-helpers.tsx";

export function setupIngenieriaMenuRoutes(app: any, authMiddleware: any) {

  // Listar recetas completas
  app.get("/server/ingenieria-menu/recetas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      console.log(`🍽️ [GET /ingenieria-menu/recetas] Obteniendo recetas para empresa: ${auth.empresaId}`);
      
      await inicializarDatosDemo(auth.empresaId);
      
      const recetas = await obtenerRecetas(auth.empresaId);
      const productos = await obtenerProductos(auth.empresaId);

      // Enriquecer recetas con información completa
      const recetasCompletas = recetas.map((receta: any) => {
        const producto = productos.find((p: any) => p.id === receta.producto_id);
        
        // Calcular costo total de ingredientes
        let costoTotal = 0;
        const ingredientes = (receta.ingredientes || []).map((ing: any) => {
          const insumo = productos.find((p: any) => p.id === ing.insumo_id);
          const costoIngrediente = insumo ? (insumo.costo_unitario || 0) * (ing.cantidad || 0) : 0;
          costoTotal += costoIngrediente;

          return {
            ...ing,
            insumo: insumo ? {
              id: insumo.id,
              codigo: insumo.codigo,
              nombre: insumo.nombre,
              unidad_medida: insumo.unidad_medida,
              costo_unitario: insumo.costo_unitario,
              stock_actual: insumo.stock_actual
            } : null,
            costo_total: costoIngrediente
          };
        });

        const precioVenta = producto?.precio || 0;
        const margen = precioVenta > 0 ? ((precioVenta - costoTotal) / precioVenta * 100) : 0;

        return {
          ...receta,
          producto: producto ? {
            id: producto.id,
            codigo: producto.codigo,
            nombre: producto.nombre,
            precio: producto.precio
          } : null,
          ingredientes,
          costo_total: costoTotal,
          precio_venta: precioVenta,
          margen: margen,
          utilidad: precioVenta - costoTotal
        };
      });

      console.log(`✅ ${recetasCompletas.length} recetas obtenidas`);
      return c.json({ recetas: recetasCompletas });
    } catch (error: any) {
      console.error('❌ Error obteniendo recetas:', error);
      return c.json({ error: 'Error al obtener recetas', details: error.message }, 500);
    }
  });

  // Obtener receta por ID con análisis completo
  app.get("/server/ingenieria-menu/recetas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const recetaId = c.req.param('id');

    try {
      const recetas = await obtenerRecetas(auth.empresaId);
      const receta = recetas.find((r: any) => r.id === recetaId);

      if (!receta) {
        return c.json({ error: 'Receta no encontrada' }, 404);
      }

      const productos = await obtenerProductos(auth.empresaId);
      const producto = productos.find((p: any) => p.id === receta.producto_id);

      // Calcular costos detallados
      let costoTotal = 0;
      const ingredientes = (receta.ingredientes || []).map((ing: any) => {
        const insumo = productos.find((p: any) => p.id === ing.insumo_id);
        const costoIngrediente = insumo ? (insumo.costo_unitario || 0) * (ing.cantidad || 0) : 0;
        costoTotal += costoIngrediente;

        return {
          ...ing,
          insumo,
          costo_total: costoIngrediente
        };
      });

      const precioVenta = producto?.precio || 0;
      const margen = precioVenta > 0 ? ((precioVenta - costoTotal) / precioVenta * 100) : 0;

      return c.json({ 
        receta: {
          ...receta,
          producto,
          ingredientes,
          analisis: {
            costo_total: costoTotal,
            precio_venta: precioVenta,
            utilidad: precioVenta - costoTotal,
            margen: margen
          }
        }
      });
    } catch (error: any) {
      console.error('❌ Error obteniendo receta:', error);
      return c.json({ error: 'Error al obtener receta', details: error.message }, 500);
    }
  });

  // Crear receta
  app.post("/server/ingenieria-menu/recetas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      const body = await c.req.json();
      console.log('📝 [POST /ingenieria-menu/recetas] Creando receta:', body);

      const recetaData = {
        ...body,
        empresa_id: auth.empresaId
      };

      const receta = await guardarReceta(auth.empresaId, recetaData);

      console.log('✅ Receta creada exitosamente:', receta.id);
      return c.json({ receta }, 201);
    } catch (error: any) {
      console.error('❌ Error creando receta:', error);
      return c.json({ error: 'Error al crear receta', details: error.message }, 500);
    }
  });

  // Actualizar receta
  app.put("/server/ingenieria-menu/recetas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const recetaId = c.req.param('id');

    try {
      const body = await c.req.json();
      const recetaData = { ...body, id: recetaId };

      const receta = await guardarReceta(auth.empresaId, recetaData);

      if (!receta) {
        return c.json({ error: 'Receta no encontrada' }, 404);
      }

      return c.json({ receta });
    } catch (error: any) {
      console.error('❌ Error actualizando receta:', error);
      return c.json({ error: 'Error al actualizar receta', details: error.message }, 500);
    }
  });

  // Eliminar receta
  app.delete("/server/ingenieria-menu/recetas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const recetaId = c.req.param('id');

    try {
      await eliminarReceta(auth.empresaId, recetaId);
      return c.json({ message: 'Receta eliminada exitosamente' });
    } catch (error: any) {
      console.error('❌ Error eliminando receta:', error);
      return c.json({ error: 'Error al eliminar receta', details: error.message }, 500);
    }
  });

  // Análisis de rentabilidad de productos
  app.get("/server/ingenieria-menu/analisis/rentabilidad", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      await inicializarDatosDemo(auth.empresaId);
      
      const recetas = await obtenerRecetas(auth.empresaId);
      const productos = await obtenerProductos(auth.empresaId);
      const ventas = await obtenerVentas(auth.empresaId);

      // Calcular análisis para cada receta
      const analisisRecetas = recetas.map((receta: any) => {
        const producto = productos.find((p: any) => p.id === receta.producto_id);
        
        // Calcular costo de ingredientes
        let costoTotal = 0;
        (receta.ingredientes || []).forEach((ing: any) => {
          const insumo = productos.find((p: any) => p.id === ing.insumo_id);
          costoTotal += insumo ? (insumo.costo_unitario || 0) * (ing.cantidad || 0) : 0;
        });

        const precioVenta = producto?.precio || 0;
        const margen = precioVenta > 0 ? ((precioVenta - costoTotal) / precioVenta * 100) : 0;

        // Calcular ventas del producto
        const itemsVendidos = ventas.flatMap((v: any) => 
          (v.items || []).filter((item: any) => item.producto_id === receta.producto_id)
        );
        const cantidadVendida = itemsVendidos.reduce((sum: number, item: any) => sum + (item.cantidad || 0), 0);
        const ingresoTotal = itemsVendidos.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0);
        const utilidadTotal = ingresoTotal - (costoTotal * cantidadVendida);

        return {
          receta_id: receta.id,
          producto_id: receta.producto_id,
          nombre: producto?.nombre || 'Desconocido',
          costo_produccion: costoTotal,
          precio_venta: precioVenta,
          margen: margen,
          utilidad_unitaria: precioVenta - costoTotal,
          cantidad_vendida: cantidadVendida,
          ingreso_total: ingresoTotal,
          utilidad_total: utilidadTotal
        };
      });

      // Ordenar por rentabilidad
      const porMargen = [...analisisRecetas]
        .sort((a, b) => b.margen - a.margen)
        .slice(0, 10);

      const porUtilidad = [...analisisRecetas]
        .sort((a, b) => b.utilidad_total - a.utilidad_total)
        .slice(0, 10);

      return c.json({
        analisis_completo: analisisRecetas,
        top_margen: porMargen,
        top_utilidad: porUtilidad
      });
    } catch (error: any) {
      console.error('❌ Error en análisis de rentabilidad:', error);
      return c.json({ error: 'Error al analizar rentabilidad', details: error.message }, 500);
    }
  });

  // Calcular costo de producción
  app.post("/server/ingenieria-menu/calcular-costo", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      const body = await c.req.json();
      const { ingredientes } = body;

      if (!ingredientes || !Array.isArray(ingredientes)) {
        return c.json({ error: 'Se requiere array de ingredientes' }, 400);
      }

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
          costo_total: costoIngrediente,
          stock_disponible: producto?.stock_actual || 0
        };
      });

      return c.json({
        costo_total: costoTotal,
        detalles: detallesCosto
      });
    } catch (error: any) {
      console.error('❌ Error calculando costo:', error);
      return c.json({ error: 'Error al calcular costo', details: error.message }, 500);
    }
  });

  // =====================================================
  // MATRIZ BCG - INGENIERÍA DE MENÚ
  // =====================================================

  // Obtener Matriz BCG (Boston Consulting Group)
  app.get("/server/ingenieria-menu/matriz", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      // Obtener parámetros de fechas
      const fechaInicio = c.req.query('fecha_inicio') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const fechaFin = c.req.query('fecha_fin') || new Date().toISOString();

      console.log(`📊 [GET /ingenieria-menu/matriz] Generando matriz BCG del ${fechaInicio} al ${fechaFin}`);
      
      await inicializarDatosDemo(auth.empresaId);
      
      const recetas = await obtenerRecetas(auth.empresaId);
      const productos = await obtenerProductos(auth.empresaId);
      const ventas = await obtenerVentas(auth.empresaId);

      // Filtrar ventas por rango de fechas
      const ventasFiltradas = ventas.filter((v: any) => {
        const fechaVenta = new Date(v.fecha);
        return fechaVenta >= new Date(fechaInicio) && fechaVenta <= new Date(fechaFin);
      });

      console.log(`📦 Total recetas: ${recetas.length}`);
      console.log(`💰 Total ventas en periodo: ${ventasFiltradas.length}`);

      // Analizar cada plato del menú
      const platosConAnalisis = recetas.map((receta: any) => {
        const producto = productos.find((p: any) => p.id === receta.producto_id);
        
        // 1. Calcular COSTO DE RECETA (explosión de materiales / BOM)
        let costoReceta = 0;
        (receta.ingredientes || []).forEach((ing: any) => {
          const insumo = productos.find((p: any) => p.id === ing.insumo_id);
          if (insumo) {
            costoReceta += (insumo.costo_unitario || 0) * (ing.cantidad || 0);
          }
        });

        const precioVenta = producto?.precio || 0;
        
        // 2. Calcular MARGEN DE CONTRIBUCIÓN
        const margenContribucion = precioVenta - costoReceta;
        const porcentajeMargen = precioVenta > 0 ? (margenContribucion / precioVenta * 100) : 0;

        // 3. Calcular VENTAS HISTÓRICAS
        const itemsVendidos = ventasFiltradas.flatMap((v: any) => 
          (v.items || []).filter((item: any) => item.producto_id === receta.producto_id)
        );
        const cantidadVendida = itemsVendidos.reduce((sum: number, item: any) => sum + (item.cantidad || 0), 0);
        const ingresosTotales = itemsVendidos.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0);
        const margenTotalGenerado = margenContribucion * cantidadVendida;

        return {
          plato_id: receta.producto_id,
          receta_id: receta.id,
          nombre: producto?.nombre || 'Desconocido',
          categoria: producto?.categoria || 'Sin categoría',
          precio: precioVenta,
          costo_unitario: costoReceta,
          cantidad_vendida: cantidadVendida,
          ingresos_totales: ingresosTotales,
          margen_contribucion: margenContribucion,
          margen_contribucion_total: margenTotalGenerado,
          porcentaje_margen: porcentajeMargen
        };
      });

      // Filtrar solo platos con ventas (para el análisis BCG)
      const platosConVentas = platosConAnalisis.filter((p: any) => p.cantidad_vendida > 0);

      // Calcular promedios para clasificación
      const totalVentas = platosConVentas.reduce((sum: number, p: any) => sum + p.cantidad_vendida, 0);
      const promedioMargen = platosConVentas.length > 0 
        ? platosConVentas.reduce((sum: number, p: any) => sum + p.margen_contribucion, 0) / platosConVentas.length
        : 0;
      const promedioVentas = platosConVentas.length > 0 
        ? totalVentas / platosConVentas.length
        : 0;

      console.log(`📈 Promedio margen contribución: $${promedioMargen.toFixed(2)}`);
      console.log(`📈 Promedio ventas por plato: ${promedioVentas.toFixed(0)} unidades`);

      // 4. CALCULAR ÍNDICES Y CLASIFICAR EN MATRIZ BCG
      const matrizBCG = platosConVentas.map((plato: any) => {
        // Índice de Popularidad (ventas vs promedio)
        const indicePopularidad = promedioVentas > 0 
          ? (plato.cantidad_vendida / promedioVentas) * 100 
          : 0;
        const esPopular = indicePopularidad >= 100; // Mayor o igual al promedio

        // Índice de Rentabilidad (margen vs promedio)
        const indiceRentabilidad = promedioMargen > 0 
          ? (plato.margen_contribucion / promedioMargen) * 100 
          : 0;
        const esRentable = indiceRentabilidad >= 100; // Mayor o igual al promedio

        // Clasificación BCG
        let categoriaBCG = '';
        let color = '';
        let icono = '';
        let recomendacion = '';

        if (esRentable && esPopular) {
          categoriaBCG = 'ESTRELLA';
          color = '#FFD700'; // Dorado
          icono = 'star';
          recomendacion = '⭐ MANTENER Y PROMOCIONAR - Este plato es tu producto estrella. Mantén la calidad constante, destácalo en el menú y considera crear variaciones.';
        } else if (!esRentable && esPopular) {
          categoriaBCG = 'CABALLO DE BATALLA';
          color = '#4CAF50'; // Verde
          icono = 'trending-up';
          recomendacion = '💪 OPTIMIZAR COSTOS - Popular pero poco rentable. Considera subir precio levemente, reducir porciones o buscar insumos más económicos sin perder calidad.';
        } else if (esRentable && !esPopular) {
          categoriaBCG = 'ENIGMA';
          color = '#2196F3'; // Azul
          icono = 'help-circle';
          recomendacion = '❓ IMPULSAR VENTAS - Rentable pero poco conocido. Capacita al personal para sugerirlo, mejora presentación, ofrece promociones o colócalo en lugar destacado del menú.';
        } else {
          categoriaBCG = 'PERRO';
          color = '#F44336'; // Rojo
          icono = 'x-circle';
          recomendacion = '⚠️ EVALUAR ELIMINACIÓN - Ni rentable ni popular. Analiza si eliminarlo del menú. Si tiene valor estratégico (fidelidad, complemento), mejora receta y costos urgentemente.';
        }

        return {
          ...plato,
          categoria_boston: categoriaBCG,
          indice_popularidad: indicePopularidad.toFixed(1) + '%',
          indice_rentabilidad: indiceRentabilidad.toFixed(1) + '%',
          color,
          icono,
          recomendacion
        };
      });

      // Estadísticas generales
      const estrellas = matrizBCG.filter((p: any) => p.categoria_boston === 'ESTRELLA');
      const caballos = matrizBCG.filter((p: any) => p.categoria_boston === 'CABALLO DE BATALLA');
      const enigmas = matrizBCG.filter((p: any) => p.categoria_boston === 'ENIGMA');
      const perros = matrizBCG.filter((p: any) => p.categoria_boston === 'PERRO');

      const totalIngresos = matrizBCG.reduce((sum: number, p: any) => sum + p.ingresos_totales, 0);
      const totalMargen = matrizBCG.reduce((sum: number, p: any) => sum + p.margen_contribucion_total, 0);
      const promedioMargenPorcentaje = matrizBCG.length > 0
        ? matrizBCG.reduce((sum: number, p: any) => sum + p.porcentaje_margen, 0) / matrizBCG.length
        : 0;

      console.log(`✅ Matriz generada: ${estrellas.length} Estrellas, ${caballos.length} Caballos, ${enigmas.length} Enigmas, ${perros.length} Perros`);

      return c.json({
        matriz: matrizBCG,
        metricas: {
          total_platos_analizados: matrizBCG.length,
          periodo: {
            inicio: fechaInicio,
            fin: fechaFin
          },
          estrellas: estrellas.length,
          caballos_batalla: caballos.length,
          enigmas: enigmas.length,
          perros: perros.length,
          total_ventas: totalVentas,
          total_ingresos: totalIngresos,
          total_margen: totalMargen,
          promedio_margen_porcentaje: promedioMargenPorcentaje.toFixed(1) + '%'
        }
      });
    } catch (error: any) {
      console.error('❌ Error generando matriz BCG:', error);
      return c.json({ error: 'Error al generar matriz BCG', details: error.message }, 500);
    }
  });

  // Obtener alertas de costos
  app.get("/server/ingenieria-menu/alertas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      console.log(`🚨 [GET /ingenieria-menu/alertas] Generando alertas para empresa: ${auth.empresaId}`);
      
      await inicializarDatosDemo(auth.empresaId);
      
      const recetas = await obtenerRecetas(auth.empresaId);
      const productos = await obtenerProductos(auth.empresaId);

      const alertas: any[] = [];

      // Analizar cada receta
      recetas.forEach((receta: any) => {
        const producto = productos.find((p: any) => p.id === receta.producto_id);
        
        if (!producto) return;

        // Calcular costo actual
        let costoActual = 0;
        (receta.ingredientes || []).forEach((ing: any) => {
          const insumo = productos.find((p: any) => p.id === ing.insumo_id);
          if (insumo) {
            costoActual += (insumo.costo_unitario || 0) * (ing.cantidad || 0);
          }
        });

        const precioVenta = producto.precio || 0;
        const margenActual = precioVenta - costoActual;
        const porcentajeCosto = precioVenta > 0 ? (costoActual / precioVenta * 100) : 0;

        // ALERTA 1: Margen negativo (vendiendo a pérdida)
        if (margenActual < 0) {
          alertas.push({
            tipo: 'MARGEN_NEGATIVO',
            severidad: 'CRÍTICA',
            plato: producto.nombre,
            plato_id: receta.producto_id,
            precio_venta: precioVenta,
            costo_actual: costoActual,
            porcentaje_costo: porcentajeCosto.toFixed(1) + '%',
            margen_actual: margenActual,
            mensaje: `⛔ PÉRDIDA CRÍTICA: El plato "${producto.nombre}" se está vendiendo a PÉRDIDA`,
            recomendacion: `Aumenta el precio a mínimo $${(costoActual * 1.3).toFixed(2)} o reduce costos inmediatamente`
          });
        }
        // ALERTA 2: Costo superior al 70% del precio (margen muy bajo)
        else if (porcentajeCosto > 70) {
          alertas.push({
            tipo: 'MARGEN_BAJO',
            severidad: 'ALTA',
            plato: producto.nombre,
            plato_id: receta.producto_id,
            precio_venta: precioVenta,
            costo_actual: costoActual,
            porcentaje_costo: porcentajeCosto.toFixed(1) + '%',
            margen_actual: margenActual,
            mensaje: `⚠️ MARGEN PELIGROSO: "${producto.nombre}" tiene margen de solo ${(100 - porcentajeCosto).toFixed(1)}%`,
            recomendacion: `El costo representa ${porcentajeCosto.toFixed(1)}% del precio. Ideal es máximo 35%. Revisa proveedores o ajusta precio.`
          });
        }
        // ALERTA 3: Costo entre 50-70% (zona de alerta)
        else if (porcentajeCosto > 50) {
          alertas.push({
            tipo: 'MARGEN_AJUSTADO',
            severidad: 'MEDIA',
            plato: producto.nombre,
            plato_id: receta.producto_id,
            precio_venta: precioVenta,
            costo_actual: costoActual,
            porcentaje_costo: porcentajeCosto.toFixed(1) + '%',
            margen_actual: margenActual,
            mensaje: `⚡ ATENCIÓN: "${producto.nombre}" tiene margen ajustado`,
            recomendacion: `Monitorea costos de insumos. Cualquier aumento podría afectar rentabilidad.`
          });
        }

        // ALERTA 4: Insumos con bajo stock
        (receta.ingredientes || []).forEach((ing: any) => {
          const insumo = productos.find((p: any) => p.id === ing.insumo_id);
          if (insumo && insumo.stock_actual < ing.cantidad * 5) {
            alertas.push({
              tipo: 'STOCK_BAJO',
              severidad: 'MEDIA',
              plato: producto.nombre,
              plato_id: receta.producto_id,
              insumo: insumo.nombre,
              stock_actual: insumo.stock_actual,
              unidad: insumo.unidad_medida,
              mensaje: `📦 STOCK CRÍTICO: Insumo "${insumo.nombre}" para "${producto.nombre}"`,
              recomendacion: `Solo quedan ${insumo.stock_actual} ${insumo.unidad_medida}. Reabastecer urgente.`
            });
          }
        });
      });

      // Ordenar por severidad
      const ordenSeveridad: any = { 'CRÍTICA': 1, 'ALTA': 2, 'MEDIA': 3, 'BAJA': 4 };
      alertas.sort((a, b) => ordenSeveridad[a.severidad] - ordenSeveridad[b.severidad]);

      console.log(`✅ ${alertas.length} alertas generadas`);

      return c.json({ alertas });
    } catch (error: any) {
      console.error('❌ Error generando alertas:', error);
      return c.json({ error: 'Error al generar alertas', details: error.message }, 500);
    }
  });
}