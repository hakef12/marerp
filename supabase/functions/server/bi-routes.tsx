// =====================================================
// RUTAS: BUSINESS INTELLIGENCE - USANDO KV STORE
// =====================================================

import {
  inicializarDatosDemo,
  obtenerProductos,
  obtenerVentas,
  obtenerCategorias
} from "./kv-helpers.tsx";
import * as kv from "./kv_store.tsx";

// Mapa de zonas horarias soportadas → offset en horas vs UTC (sin DST por ahora).
// La mayoría de paises objetivo (Ecuador, Colombia, Peru) no tienen DST.
const TZ_OFFSETS: Record<string, number> = {
  'America/Guayaquil':   -5,
  'America/Bogota':      -5,
  'America/Lima':        -5,
  'America/New_York':    -5, // simplificado (en realidad -5/-4 con DST)
  'America/Mexico_City': -6,
  'America/Argentina/Buenos_Aires': -3,
  'America/Santiago':    -4,
  'America/Caracas':     -4,
  'UTC':                  0,
};

// Lee la zona horaria configurada de la empresa y devuelve el offset en ms.
// Default Ecuador (UTC-5) si no hay config.
async function obtenerOffsetEmpresa(empresaId: string): Promise<number> {
  try {
    const prefs: any = await kv.get(`empresa_${empresaId}_prefs_sistema`);
    const tz = prefs?.zona_horaria || 'America/Guayaquil';
    const hours = TZ_OFFSETS[tz] ?? -5;
    return hours * 60 * 60 * 1000;
  } catch {
    return -5 * 60 * 60 * 1000;
  }
}

// ─── Helper: extraer un costo unitario CONFIABLE de un producto ──────────────
// El campo precio_compra/costo_unitario/costo_promedio puede estar mal cargado
// (factura total en vez de unitario, unidades distintas, costo de receta erroneo).
// Regla defensiva: si el costo > 2 x precio_venta, lo descartamos para no
// envenenar reportes con valores absurdos. Esto NO arregla la data — solo
// evita que el dashboard mienta.
//
// Retorna { costo, fueDescartado } para que el caller pueda contar cuantos
// productos quedaron sin costo confiable.
function getCostoUnitarioConfiable(prod: any): { costo: number; descartado: boolean; razon?: string } {
  if (!prod) return { costo: 0, descartado: false };
  const raw = parseFloat(prod.precio_compra) || parseFloat(prod.costo_promedio) || parseFloat(prod.costo_unitario) || 0;
  if (raw <= 0) return { costo: 0, descartado: false };
  const precioVenta = parseFloat(prod.precio_venta) || parseFloat(prod.precio) || 0;
  // Si el costo supera 2x el precio de venta, asumimos data corrupta
  if (precioVenta > 0 && raw > precioVenta * 2) {
    return { costo: 0, descartado: true, razon: `costo $${raw.toFixed(2)} > 2x precio_venta $${precioVenta.toFixed(2)}` };
  }
  return { costo: raw, descartado: false };
}

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
      const todasVentas = (await obtenerVentas(auth.empresaId)).filter((v: any) => !v.anulada);
      const productos = await obtenerProductos(auth.empresaId);
      const categorias = await obtenerCategorias(auth.empresaId);

      const hoy       = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const finMesAnterior    = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59);
      const inicioAnio = new Date(hoy.getFullYear(), 0, 1);

      // BI usa por defecto el AÑO ACTUAL. Antes mostraba el ingreso historico
      // total lo que causaba que BI diera $4,325 cuando contabilidad solo
      // contaba $3,806 del año 2026 — los $519 extra eran de años previos.
      const ventas = todasVentas.filter((v: any) => new Date(v.fecha) >= inicioAnio);

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
      // El servidor Deno corre en UTC pero el usuario esta en su zona local.
      // Una venta hecha tarde se guarda como UTC del dia siguiente. Para que
      // el chart muestre el dia local correcto, convertimos al timezone de la
      // empresa (Configuracion → Sistema → Zona Horaria) antes de bucketizar.
      const offsetMs = await obtenerOffsetEmpresa(auth.empresaId);
      const fechaDiaLocal = (isoUtc: string) => {
        if (!isoUtc) return '';
        const t = new Date(isoUtc).getTime();
        if (isNaN(t)) return '';
        return new Date(t + offsetMs).toISOString().split('T')[0];
      };
      const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const ventasRecientes = ventas.filter((v: any) => new Date(v.fecha) >= hace30);

      const porDiaMap: Record<string, { ventas: number; gastos: number }> = {};
      ventasRecientes.forEach((v: any) => {
        const dia = fechaDiaLocal(v.fecha);
        if (!dia) return;
        if (!porDiaMap[dia]) porDiaMap[dia] = { ventas: 0, gastos: 0 };
        porDiaMap[dia].ventas += v.total || 0;
        // Calcular costo de los ítems para estimar gastos (con clamp anti-cost-poisoning)
        (v.items || []).forEach((item: any) => {
          const prod = productos.find((p: any) => p.id === item.producto_id);
          const { costo } = getCostoUnitarioConfiable(prod);
          porDiaMap[dia].gastos += costo * (item.cantidad || 0);
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
          const { costo: costoU } = getCostoUnitarioConfiable(prod);
          if (!conteo[key]) conteo[key] = { nombre, ventas: 0, ingresos: 0, costo: 0 };
          conteo[key].ventas   += item.cantidad || 0;
          conteo[key].ingresos += item.subtotal || 0;
          conteo[key].costo    += costoU * (item.cantidad || 0);
        });
      });
      // Top 10 por ingresos generados (no por unidades). Antes ordenaba por
      // unidades pero la UI mostraba columnas de monto/utilidad, lo que era
      // confuso. Si interesa ranking por unidades, pasar ?order=unidades.
      const top_productos = Object.values(conteo)
        .sort((a, b) => b.ingresos - a.ingresos)
        .slice(0, 10)
        .map(p => ({
          nombre:   p.nombre,
          ventas:   p.ventas,
          ingresos: parseFloat(p.ingresos.toFixed(2)),
          costo:    parseFloat(p.costo.toFixed(2)),
          margen:   p.ingresos > 0 ? parseFloat(((p.ingresos - p.costo) / p.ingresos * 100).toFixed(1)) : 0,
        }));

      // ── Rentabilidad general (con clamp defensivo de costos absurdos) ─────
      let ingreso_total = 0, costo_total = 0;
      const productosDescartados = new Set<string>();
      ventas.forEach((v: any) => {
        ingreso_total += v.total || 0;
        (v.items || []).forEach((item: any) => {
          const prod = productos.find((p: any) => p.id === item.producto_id);
          const { costo, descartado } = getCostoUnitarioConfiable(prod);
          if (descartado && prod) productosDescartados.add(prod.id);
          costo_total += costo * (item.cantidad || 0);
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
          // Diagnostico: cuantos productos quedaron sin costo confiable
          productos_con_costo_descartado: productosDescartados.size,
          aviso_costos: productosDescartados.size > 0
            ? `Se descartaron ${productosDescartados.size} productos con costo > 2x precio_venta. Use el diagnostico de costos para corregirlos.`
            : null,
        },
        tendencia_mensual,
      });
    } catch (error: any) {
      console.error('❌ Error en analytics:', error);
      return c.json({ error: 'Error al obtener analytics', details: error.message }, 500);
    }
  });

  // ─── Analisis por canal de venta (delivery apps) ────────────────────────────
  app.get("/server/bi/por-canal", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const ventas = (await obtenerVentas(auth.empresaId)).filter((v: any) => !v.anulada);
      const productos = await obtenerProductos(auth.empresaId);
      const r2 = (n: number) => Math.round(n * 100) / 100;

      // Agrupar por canal_venta
      const porCanal: Record<string, any> = {};
      for (const v of ventas) {
        const canal = v.canal_venta || 'directo';
        if (!porCanal[canal]) {
          porCanal[canal] = {
            codigo: canal,
            ventas: 0,
            ingreso_bruto: 0,
            comision_total: 0,
            ingreso_neto: 0,
            costo_mercaderia: 0,
            comision_pct_promedio_acc: 0,
            unidades_vendidas: 0,
          };
        }
        const totalBruto = Number(v.total || 0);
        const comision = Number(v.comision_monto || 0);
        const pct = Number(v.comision_pct || 0);
        porCanal[canal].ventas += 1;
        porCanal[canal].ingreso_bruto += totalBruto;
        porCanal[canal].comision_total += comision;
        porCanal[canal].ingreso_neto += (totalBruto - comision);
        porCanal[canal].comision_pct_promedio_acc += pct;

        for (const it of (v.items || [])) {
          const prod = productos.find((p: any) => p.id === it.producto_id);
          const { costo } = getCostoUnitarioConfiable(prod);
          porCanal[canal].costo_mercaderia += costo * (it.cantidad || 0);
          porCanal[canal].unidades_vendidas += (it.cantidad || 0);
        }
      }

      const canales = Object.values(porCanal).map((c: any) => {
        const utilidad_real = c.ingreso_neto - c.costo_mercaderia;
        const margen_real_pct = c.ingreso_bruto > 0 ? (utilidad_real / c.ingreso_bruto * 100) : 0;
        return {
          codigo: c.codigo,
          ventas: c.ventas,
          unidades_vendidas: c.unidades_vendidas,
          ingreso_bruto: r2(c.ingreso_bruto),
          comision_total: r2(c.comision_total),
          comision_pct_promedio: c.ventas > 0 ? r2(c.comision_pct_promedio_acc / c.ventas) : 0,
          ingreso_neto: r2(c.ingreso_neto),
          costo_mercaderia: r2(c.costo_mercaderia),
          utilidad_real: r2(utilidad_real),
          margen_real_pct: r2(margen_real_pct),
        };
      }).sort((a: any, b: any) => b.ingreso_bruto - a.ingreso_bruto);

      const totales = canales.reduce((t: any, c: any) => ({
        ventas: t.ventas + c.ventas,
        ingreso_bruto: t.ingreso_bruto + c.ingreso_bruto,
        comision_total: t.comision_total + c.comision_total,
        ingreso_neto: t.ingreso_neto + c.ingreso_neto,
        costo_mercaderia: t.costo_mercaderia + c.costo_mercaderia,
        utilidad_real: t.utilidad_real + c.utilidad_real,
      }), { ventas: 0, ingreso_bruto: 0, comision_total: 0, ingreso_neto: 0, costo_mercaderia: 0, utilidad_real: 0 });

      return c.json({
        canales,
        totales: {
          ...totales,
          ingreso_bruto: r2(totales.ingreso_bruto),
          comision_total: r2(totales.comision_total),
          ingreso_neto: r2(totales.ingreso_neto),
          costo_mercaderia: r2(totales.costo_mercaderia),
          utilidad_real: r2(totales.utilidad_real),
          margen_real_pct: totales.ingreso_bruto > 0 ? r2(totales.utilidad_real / totales.ingreso_bruto * 100) : 0,
        },
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Diagnostico de costos: identifica productos con costos absurdos ────────
  // Lista todos los productos comparando precio_compra/costo_unitario con
  // precio_venta y marca los problematicos para que el usuario los corrija.
  app.get("/server/bi/diagnostico-costos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const productos = await obtenerProductos(auth.empresaId);
      const ventas    = (await obtenerVentas(auth.empresaId)).filter((v: any) => !v.anulada);

      // Calcular unidades vendidas por producto (ultimos 90 dias)
      const limite = new Date(); limite.setDate(limite.getDate() - 90);
      const ventasPorProducto: Record<string, number> = {};
      ventas.forEach((v: any) => {
        const f = v.fecha ? new Date(v.fecha) : new Date(v.created_at || 0);
        if (f < limite) return;
        (v.items || []).forEach((it: any) => {
          if (!it.producto_id) return;
          ventasPorProducto[it.producto_id] = (ventasPorProducto[it.producto_id] || 0) + (it.cantidad || 0);
        });
      });

      const filas = productos.map((p: any) => {
        const precioVenta = parseFloat(p.precio_venta) || parseFloat(p.precio) || 0;
        const precioCompra = parseFloat(p.precio_compra) || 0;
        const costoUnitario = parseFloat(p.costo_unitario) || 0;
        const costoPromedio = parseFloat(p.costo_promedio) || 0;
        const costoUsado = precioCompra || costoPromedio || costoUnitario || 0;
        const ratio = precioVenta > 0 ? costoUsado / precioVenta : 0;
        const vendidos90d = ventasPorProducto[p.id] || 0;

        let severidad: 'ok' | 'sin_costo' | 'alto' | 'absurdo' = 'ok';
        let mensaje = '';
        if (costoUsado === 0 && precioVenta > 0) {
          severidad = 'sin_costo';
          mensaje = 'Sin costo cargado — la utilidad reportada esta inflada';
        } else if (precioVenta > 0 && ratio > 2) {
          severidad = 'absurdo';
          mensaje = `Costo es ${ratio.toFixed(1)}x el precio de venta — probablemente esta mal capturado`;
        } else if (precioVenta > 0 && ratio > 1) {
          severidad = 'alto';
          mensaje = `Costo (${(ratio*100).toFixed(0)}%) supera precio de venta — perdida en cada venta`;
        }

        return {
          producto_id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          categoria: p.categoria || '',
          precio_venta: precioVenta,
          precio_compra: precioCompra,
          costo_unitario: costoUnitario,
          costo_promedio: costoPromedio,
          costo_usado: costoUsado,
          ratio_costo_precio: parseFloat(ratio.toFixed(2)),
          unidades_vendidas_90d: vendidos90d,
          severidad,
          mensaje,
        };
      });

      const problemas = filas.filter((f: any) => f.severidad !== 'ok');
      const totalImpactoEnVentas = problemas
        .filter((f: any) => f.severidad === 'absurdo' || f.severidad === 'alto')
        .reduce((s: number, f: any) => s + f.costo_usado * f.unidades_vendidas_90d, 0);

      return c.json({
        total_productos: filas.length,
        con_problema: problemas.length,
        sin_costo: filas.filter((f: any) => f.severidad === 'sin_costo').length,
        costo_alto: filas.filter((f: any) => f.severidad === 'alto').length,
        costo_absurdo: filas.filter((f: any) => f.severidad === 'absurdo').length,
        impacto_estimado_90d: parseFloat(totalImpactoEnVentas.toFixed(2)),
        problemas: problemas.sort((a: any, b: any) => {
          // Ordenar por: severidad absurdo > alto > sin_costo, luego por unidades vendidas
          const orden = { absurdo: 3, alto: 2, sin_costo: 1, ok: 0 };
          if (orden[b.severidad] !== orden[a.severidad]) return orden[b.severidad] - orden[a.severidad];
          return b.unidades_vendidas_90d - a.unidades_vendidas_90d;
        }),
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });
}
