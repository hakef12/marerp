// =====================================================
// RUTAS: BUSINESS INTELLIGENCE - USANDO KV STORE
// =====================================================

import { 
  inicializarDatosDemo,
  obtenerProductos,
  obtenerVentas,
  obtenerCategorias
} from "./kv-helpers.tsx";

export function setupBIRoutes(app: any, authMiddleware: any) {

  // Análisis de ventas
  app.get("/server/bi/ventas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      console.log(`📊 [GET /bi/ventas] Análisis de ventas para empresa: ${auth.empresaId}`);
      
      await inicializarDatosDemo(auth.empresaId);
      
      const fechaInicio = c.req.query('fecha_inicio');
      const fechaFin = c.req.query('fecha_fin');
      const agrupacion = c.req.query('agrupacion') || 'dia'; // dia, semana, mes

      let ventas = await obtenerVentas(auth.empresaId);

      // Filtrar por fechas
      if (fechaInicio) {
        ventas = ventas.filter((v: any) => v.fecha >= fechaInicio);
      }
      if (fechaFin) {
        ventas = ventas.filter((v: any) => v.fecha <= fechaFin);
      }

      // Calcular totales
      const totalVentas = ventas.length;
      const montoTotal = ventas.reduce((sum: number, v: any) => sum + (v.total || 0), 0);
      const montoPromedio = totalVentas > 0 ? montoTotal / totalVentas : 0;

      // Agrupar ventas
      const ventasAgrupadas: any = {};
      ventas.forEach((v: any) => {
        let clave = '';
        const fecha = new Date(v.fecha);
        
        if (agrupacion === 'dia') {
          clave = v.fecha.split('T')[0];
        } else if (agrupacion === 'semana') {
          const inicioSemana = new Date(fecha);
          inicioSemana.setDate(fecha.getDate() - fecha.getDay());
          clave = inicioSemana.toISOString().split('T')[0];
        } else if (agrupacion === 'mes') {
          clave = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
        }

        if (!ventasAgrupadas[clave]) {
          ventasAgrupadas[clave] = { fecha: clave, cantidad: 0, monto: 0, items: [] };
        }
        
        ventasAgrupadas[clave].cantidad += 1;
        ventasAgrupadas[clave].monto += v.total || 0;
        ventasAgrupadas[clave].items.push(...(v.items || []));
      });

      return c.json({
        resumen: {
          total_ventas: totalVentas,
          monto_total: montoTotal,
          monto_promedio: montoPromedio
        },
        ventas_agrupadas: Object.values(ventasAgrupadas).sort((a: any, b: any) => a.fecha.localeCompare(b.fecha))
      });
    } catch (error: any) {
      console.error('❌ Error en análisis de ventas:', error);
      return c.json({ error: 'Error al analizar ventas', details: error.message }, 500);
    }
  });

  // Análisis de productos
  app.get("/server/bi/productos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      console.log(`📊 [GET /bi/productos] Análisis de productos para empresa: ${auth.empresaId}`);
      
      await inicializarDatosDemo(auth.empresaId);
      
      const productos = await obtenerProductos(auth.empresaId);
      const ventas = await obtenerVentas(auth.empresaId);
      const categorias = await obtenerCategorias(auth.empresaId);

      // Calcular ventas por producto
      const ventasPorProducto: any = {};
      
      ventas.forEach((v: any) => {
        (v.items || []).forEach((item: any) => {
          if (!ventasPorProducto[item.producto_id]) {
            ventasPorProducto[item.producto_id] = {
              producto_id: item.producto_id,
              nombre: item.nombre,
              cantidad_vendida: 0,
              monto_total: 0,
              numero_ventas: 0
            };
          }
          
          ventasPorProducto[item.producto_id].cantidad_vendida += item.cantidad || 0;
          ventasPorProducto[item.producto_id].monto_total += item.subtotal || 0;
          ventasPorProducto[item.producto_id].numero_ventas += 1;
        });
      });

      // Enriquecer con datos de productos
      const analisisProductos = Object.values(ventasPorProducto).map((vp: any) => {
        const producto = productos.find((p: any) => p.id === vp.producto_id);
        const categoria = producto?.categoria_id ? 
          categorias.find((c: any) => c.id === producto.categoria_id) : null;

        return {
          ...vp,
          stock_actual: producto?.stock_actual || 0,
          precio: producto?.precio || 0,
          costo_unitario: producto?.costo_unitario || 0,
          margen: producto ? ((producto.precio - producto.costo_unitario) / producto.precio * 100) : 0,
          categoria: categoria?.nombre || 'Sin categoría'
        };
      });

      // Top productos por cantidad
      const topCantidad = [...analisisProductos]
        .sort((a, b) => b.cantidad_vendida - a.cantidad_vendida)
        .slice(0, 10);

      // Top productos por monto
      const topMonto = [...analisisProductos]
        .sort((a, b) => b.monto_total - a.monto_total)
        .slice(0, 10);

      return c.json({
        total_productos: productos.length,
        productos_vendidos: Object.keys(ventasPorProducto).length,
        top_cantidad: topCantidad,
        top_monto: topMonto,
        todos_productos: analisisProductos
      });
    } catch (error: any) {
      console.error('❌ Error en análisis de productos:', error);
      return c.json({ error: 'Error al analizar productos', details: error.message }, 500);
    }
  });

  // Análisis de rentabilidad
  app.get("/server/bi/rentabilidad", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      console.log(`📊 [GET /bi/rentabilidad] Análisis de rentabilidad para empresa: ${auth.empresaId}`);
      
      await inicializarDatosDemo(auth.empresaId);
      
      const productos = await obtenerProductos(auth.empresaId);
      const ventas = await obtenerVentas(auth.empresaId);

      // Calcular ingresos y costos
      let ingresoTotal = 0;
      let costoTotal = 0;

      ventas.forEach((v: any) => {
        ingresoTotal += v.total || 0;
        
        (v.items || []).forEach((item: any) => {
          const producto = productos.find((p: any) => p.id === item.producto_id);
          if (producto) {
            costoTotal += (producto.costo_unitario || 0) * (item.cantidad || 0);
          }
        });
      });

      const utilidadBruta = ingresoTotal - costoTotal;
      const margenBruto = ingresoTotal > 0 ? (utilidadBruta / ingresoTotal * 100) : 0;

      // Rentabilidad por producto
      const rentabilidadPorProducto = productos.map((p: any) => {
        const ventasProducto = ventas.flatMap((v: any) => 
          (v.items || []).filter((item: any) => item.producto_id === p.id)
        );

        const cantidadVendida = ventasProducto.reduce((sum: number, item: any) => sum + (item.cantidad || 0), 0);
        const ingresoProducto = ventasProducto.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0);
        const costoProducto = cantidadVendida * (p.costo_unitario || 0);
        const utilidadProducto = ingresoProducto - costoProducto;

        return {
          producto_id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          cantidad_vendida: cantidadVendida,
          ingreso: ingresoProducto,
          costo: costoProducto,
          utilidad: utilidadProducto,
          margen: ingresoProducto > 0 ? (utilidadProducto / ingresoProducto * 100) : 0
        };
      }).filter((r: any) => r.cantidad_vendida > 0);

      // Top productos rentables
      const topRentables = [...rentabilidadPorProducto]
        .sort((a, b) => b.utilidad - a.utilidad)
        .slice(0, 10);

      return c.json({
        resumen: {
          ingreso_total: ingresoTotal,
          costo_total: costoTotal,
          utilidad_bruta: utilidadBruta,
          margen_bruto: margenBruto
        },
        top_rentables: topRentables,
        rentabilidad_productos: rentabilidadPorProducto
      });
    } catch (error: any) {
      console.error('❌ Error en análisis de rentabilidad:', error);
      return c.json({ error: 'Error al analizar rentabilidad', details: error.message }, 500);
    }
  });

  // ─── Endpoint unificado de analytics (usado por BusinessIntelligence.tsx) ─────
  app.get("/server/bi/analytics", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      await inicializarDatosDemo(auth.empresaId);
      const ventas = await obtenerVentas(auth.empresaId);
      const productos = await obtenerProductos(auth.empresaId);
      const categorias = await obtenerCategorias(auth.empresaId);

      // KPIs generales
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const ventasMes = ventas.filter((v: any) => new Date(v.fecha) >= inicioMes);
      const totalVentasMes = ventasMes.reduce((s: number, v: any) => s + (v.total || 0), 0);
      const ticketPromedio = ventasMes.length > 0 ? totalVentasMes / ventasMes.length : 0;

      // Ventas por día (últimos 30 días)
      const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const ventasRecientes = ventas.filter((v: any) => new Date(v.fecha) >= hace30);
      const porDia: Record<string, number> = {};
      ventasRecientes.forEach((v: any) => {
        const dia = v.fecha?.split('T')[0] || '';
        if (dia) porDia[dia] = (porDia[dia] || 0) + (v.total || 0);
      });
      const ventasPorDia = Object.entries(porDia)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([fecha, total]) => ({ fecha, total }));

      // Productos por categoría
      const porCategoria: Record<string, number> = {};
      productos.forEach((p: any) => {
        const cat = categorias.find((c: any) => c.id === p.categoria_id)?.nombre || 'Sin categoría';
        porCategoria[cat] = (porCategoria[cat] || 0) + 1;
      });
      const productosPorCategoria = Object.entries(porCategoria)
        .map(([nombre, cantidad]) => ({ nombre, cantidad }));

      // Top productos vendidos
      const conteoProductos: Record<string, { nombre: string; cantidad: number; total: number }> = {};
      ventas.forEach((v: any) => {
        (v.items || []).forEach((item: any) => {
          const nombre = item.nombre || productos.find((p: any) => p.id === item.producto_id)?.nombre || 'Desconocido';
          if (!conteoProductos[item.producto_id || nombre]) {
            conteoProductos[item.producto_id || nombre] = { nombre, cantidad: 0, total: 0 };
          }
          conteoProductos[item.producto_id || nombre].cantidad += item.cantidad || 0;
          conteoProductos[item.producto_id || nombre].total += item.subtotal || 0;
        });
      });
      const topProductos = Object.values(conteoProductos)
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10);

      return c.json({
        kpis: {
          total_ventas_mes: totalVentasMes,
          num_ventas_mes: ventasMes.length,
          ticket_promedio: ticketPromedio,
          total_productos: productos.length,
          total_categorias: categorias.length,
        },
        ventas_por_dia: ventasPorDia,
        productos_por_categoria: productosPorCategoria,
        top_productos: topProductos,
      });
    } catch (error: any) {
      console.error('❌ Error en analytics:', error);
      return c.json({ error: 'Error al obtener analytics', details: error.message }, 500);
    }
  });
}
