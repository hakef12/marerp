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
      const ventas    = (await obtenerVentas(auth.empresaId)).filter((v: any) => !v.anulada);
      const productos = await obtenerProductos(auth.empresaId);
      const categorias = await obtenerCategorias(auth.empresaId);

      const hoy       = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const finMesAnterior    = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59);

      const ventasMes      = ventas.filter((v: any) => new Date(v.fecha) >= inicioMes);
      const ventasMesAnt   = ventas.filter((v: any) => {
        const f = new Date(v.fecha);
        return f >= inicioMesAnterior && f <= finMesAnterior;
      });

      // ── KPIs del mes actual ───────────────────────────────────────────────────
      const ventas_mes      = ventasMes.reduce((s: number, v: any) => s + (v.total || 0), 0);
      const ordenes_mes     = ventasMes.length;
      const ticket_promedio = ordenes_mes > 0 ? ventas_mes / ordenes_mes : 0;
      const productos_vendidos = ventasMes.reduce((s: number, v: any) =>
        s + (v.items || []).reduce((si: number, i: any) => si + (i.cantidad || 0), 0), 0);

      // ── KPIs mes anterior (para tendencias) ─────────────────────────────────
      const ventas_mes_ant   = ventasMesAnt.reduce((s: number, v: any) => s + (v.total || 0), 0);
      const ordenes_mes_ant  = ventasMesAnt.length;
      const ticket_ant       = ordenes_mes_ant > 0 ? ventas_mes_ant / ordenes_mes_ant : 0;

      const pct = (actual: number, anterior: number) =>
        anterior > 0 ? parseFloat(((actual - anterior) / anterior * 100).toFixed(1)) : 0;

      const ventas_mes_tendencia    = pct(ventas_mes, ventas_mes_ant);
      const ordenes_mes_tendencia   = pct(ordenes_mes, ordenes_mes_ant);
      const ticket_promedio_tendencia = pct(ticket_promedio, ticket_ant);

      // ── Ventas por día — últimos 30 días (con estimación de gastos/utilidad) ──
      const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const ventasRecientes = ventas.filter((v: any) => new Date(v.fecha) >= hace30);

      const porDiaMap: Record<string, { ventas: number; gastos: number }> = {};
      ventasRecientes.forEach((v: any) => {
        const dia = (v.fecha || '').split('T')[0];
        if (!dia) return;
        if (!porDiaMap[dia]) porDiaMap[dia] = { ventas: 0, gastos: 0 };
        porDiaMap[dia].ventas += v.total || 0;
        // Calcular costo de los ítems para estimar gastos
        (v.items || []).forEach((item: any) => {
          const prod = productos.find((p: any) => p.id === item.producto_id);
          const costoU = parseFloat(prod?.precio_compra) || parseFloat(prod?.costo_promedio) ||
                         parseFloat(prod?.costo_unitario) || 0;
          porDiaMap[dia].gastos += costoU * (item.cantidad || 0);
        });
      });
      const ventas_por_dia = Object.entries(porDiaMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([fecha, d]) => ({
          fecha,
          ventas:   parseFloat(d.ventas.toFixed(2)),
          gastos:   parseFloat(d.gastos.toFixed(2)),
          utilidad: parseFloat((d.ventas - d.gastos).toFixed(2)),
        }));

      // ── Distribución por categoría (% de unidades vendidas) ──────────────────
      const COLORS = ['#00E5FF','#7B61FF','#22c55e','#f59e0b','#ef4444','#06b6d4','#a855f7','#84cc16'];
      const porCatVentas: Record<string, number> = {};
      ventas.forEach((v: any) => {
        (v.items || []).forEach((item: any) => {
          const prod = productos.find((p: any) => p.id === item.producto_id);
          const cat  = prod
            ? (categorias.find((c: any) => c.id === prod.categoria_id)?.nombre || 'Sin categoría')
            : 'Sin categoría';
          porCatVentas[cat] = (porCatVentas[cat] || 0) + (item.cantidad || 0);
        });
      });
      const totalUnidades = Object.values(porCatVentas).reduce((s, n) => s + n, 0) || 1;
      const productos_por_categoria = Object.entries(porCatVentas)
        .sort(([, a], [, b]) => b - a)
        .map(([nombre, cant], i) => ({
          nombre,
          valor: parseFloat((cant / totalUnidades * 100).toFixed(1)),
          cantidad: cant,
          color: COLORS[i % COLORS.length],
        }));

      // ── Top 10 productos más vendidos ─────────────────────────────────────────
      const conteo: Record<string, { nombre: string; ventas: number; ingresos: number; costo: number }> = {};
      ventas.forEach((v: any) => {
        (v.items || []).forEach((item: any) => {
          const key    = item.producto_id || item.nombre || 'desconocido';
          const nombre = item.nombre || productos.find((p: any) => p.id === item.producto_id)?.nombre || 'Desconocido';
          const prod   = productos.find((p: any) => p.id === item.producto_id);
          const costoU = parseFloat(prod?.precio_compra) || parseFloat(prod?.costo_promedio) ||
                         parseFloat(prod?.costo_unitario) || 0;
          if (!conteo[key]) conteo[key] = { nombre, ventas: 0, ingresos: 0, costo: 0 };
          conteo[key].ventas   += item.cantidad || 0;
          conteo[key].ingresos += item.subtotal || 0;
          conteo[key].costo    += costoU * (item.cantidad || 0);
        });
      });
      const top_productos = Object.values(conteo)
        .sort((a, b) => b.ventas - a.ventas)
        .slice(0, 10)
        .map(p => ({
          nombre:   p.nombre,
          ventas:   p.ventas,
          ingresos: parseFloat(p.ingresos.toFixed(2)),
          costo:    parseFloat(p.costo.toFixed(2)),
          margen:   p.ingresos > 0 ? parseFloat(((p.ingresos - p.costo) / p.ingresos * 100).toFixed(1)) : 0,
        }));

      // ── Rentabilidad general ──────────────────────────────────────────────────
      let ingreso_total = 0, costo_total = 0;
      ventas.forEach((v: any) => {
        ingreso_total += v.total || 0;
        (v.items || []).forEach((item: any) => {
          const prod   = productos.find((p: any) => p.id === item.producto_id);
          const costoU = parseFloat(prod?.precio_compra) || parseFloat(prod?.costo_promedio) ||
                         parseFloat(prod?.costo_unitario) || 0;
          costo_total += costoU * (item.cantidad || 0);
        });
      });
      const utilidad_bruta = ingreso_total - costo_total;
      const margen_bruto   = ingreso_total > 0 ? parseFloat((utilidad_bruta / ingreso_total * 100).toFixed(1)) : 0;
      const food_cost_pct  = ingreso_total > 0 ? parseFloat((costo_total  / ingreso_total * 100).toFixed(1)) : 0;

      // Top productos por rentabilidad (utilidad $)
      const top_rentables = Object.values(conteo)
        .map(p => ({
          nombre:   p.nombre,
          ingresos: parseFloat(p.ingresos.toFixed(2)),
          costo:    parseFloat(p.costo.toFixed(2)),
          utilidad: parseFloat((p.ingresos - p.costo).toFixed(2)),
          margen:   p.ingresos > 0 ? parseFloat(((p.ingresos - p.costo) / p.ingresos * 100).toFixed(1)) : 0,
        }))
        .filter(p => p.ingresos > 0)
        .sort((a, b) => b.utilidad - a.utilidad)
        .slice(0, 8);

      // ── Tendencia mensual (últimos 6 meses) ───────────────────────────────────
      const tendencia_mensual: Array<{ mes: string; ventas: number; ordenes: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const ini = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const fin = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 0, 23, 59, 59);
        const vMes = ventas.filter((v: any) => {
          const f = new Date(v.fecha);
          return f >= ini && f <= fin;
        });
        const label = ini.toLocaleDateString('es-EC', { month: 'short', year: '2-digit' });
        tendencia_mensual.push({
          mes:     label,
          ventas:  parseFloat(vMes.reduce((s: number, v: any) => s + (v.total || 0), 0).toFixed(2)),
          ordenes: vMes.length,
        });
      }

      return c.json({
        kpis: {
          ventas_mes,
          ordenes_mes,
          ticket_promedio:              parseFloat(ticket_promedio.toFixed(2)),
          productos_vendidos,
          ventas_mes_tendencia,
          ordenes_mes_tendencia,
          ticket_promedio_tendencia,
          // totales globales
          total_productos:   productos.length,
          total_categorias:  categorias.length,
          ingreso_total:     parseFloat(ingreso_total.toFixed(2)),
          utilidad_bruta:    parseFloat(utilidad_bruta.toFixed(2)),
          margen_bruto,
          food_cost_pct,
        },
        ventas_por_dia,
        productos_por_categoria,
        top_productos,
        rentabilidad: {
          ingreso_total:  parseFloat(ingreso_total.toFixed(2)),
          costo_total:    parseFloat(costo_total.toFixed(2)),
          utilidad_bruta: parseFloat(utilidad_bruta.toFixed(2)),
          margen_bruto,
          food_cost_pct,
          top_rentables,
        },
        tendencia_mensual,
      });
    } catch (error: any) {
      console.error('❌ Error en analytics:', error);
      return c.json({ error: 'Error al obtener analytics', details: error.message }, 500);
    }
  });
}
