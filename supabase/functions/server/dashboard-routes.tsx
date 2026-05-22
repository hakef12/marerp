// =====================================================
// RUTAS: DASHBOARD OPERATIVO EN TIEMPO REAL
// KPIs: ventas, ticket promedio, food cost, cocina, inventario
// =====================================================

import { createClient } from "npm:@supabase/supabase-js";
import {
  obtenerProductos,
  obtenerVentas,
  obtenerComandas,
  obtenerRecetas,
} from "./kv-helpers.tsx";

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export function setupDashboardRoutes(app: any, authMiddleware: any) {

  // ── GET /dashboard — KPIs principales ───────────────────────
  app.get("/server/dashboard", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const fechaHoy = hoy.toISOString();
      const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - 7);
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const hace30 = new Date(Date.now() - 30 * 86400000).toISOString();

      const [productos, ventas, comandas] = await Promise.all([
        obtenerProductos(auth.empresaId),
        obtenerVentas(auth.empresaId),
        obtenerComandas(auth.empresaId),
      ]);

      const activas = ventas.filter((v: any) => !v.anulada);

      // ── Ventas por período ───────────────────────────────────
      // Soporte dual: campo 'fecha' (KV legacy) o 'created_at' (SQL)
      const getFecha = (v: any): string => v.fecha || v.created_at || '';
      const ventasHoy   = activas.filter((v: any) => getFecha(v) >= fechaHoy);
      const ventasSemana = activas.filter((v: any) => getFecha(v) >= inicioSemana.toISOString());
      const ventasMes    = activas.filter((v: any) => getFecha(v) >= inicioMes);
      const ventas30     = activas.filter((v: any) => getFecha(v) >= hace30);

      const montoHoy   = ventasHoy.reduce((s: number, v: any) => s + (v.total || 0), 0);
      const montoSemana = ventasSemana.reduce((s: number, v: any) => s + (v.total || 0), 0);
      const montoMes   = ventasMes.reduce((s: number, v: any) => s + (v.total || 0), 0);
      const ticketPromedio = ventasHoy.length > 0 ? montoHoy / ventasHoy.length : 0;

      // ── Ventas por hora (hoy) ────────────────────────────────
      const ventasPorHora: { hora: number; cantidad: number; monto: number }[] = [];
      for (let h = 0; h < 24; h++) ventasPorHora.push({ hora: h, cantidad: 0, monto: 0 });
      for (const v of ventasHoy) {
        const h = new Date(getFecha(v)).getHours();
        ventasPorHora[h].cantidad++;
        ventasPorHora[h].monto += v.total || 0;
      }

      // ── Ventas por día (últimos 7) ───────────────────────────
      const ventasPorDia: any[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(hoy); d.setDate(hoy.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dvs = activas.filter((v: any) => getFecha(v).startsWith(dateStr));
        ventasPorDia.push({ fecha: dateStr, cantidad: dvs.length, monto: dvs.reduce((s: number, v: any) => s + (v.total || 0), 0) });
      }

      // ── Inventario ───────────────────────────────────────────
      const stockBajo = productos.filter((p: any) => (p.stock_actual || 0) <= (p.stock_minimo || 0));
      const valorInventario = productos.reduce((s: number, p: any) =>
        s + ((p.stock_actual || 0) * (p.costo_unitario || 0)), 0);

      // ── COGS y Food Cost ─────────────────────────────────────
      const itemsVendidos30 = ventas30.flatMap((v: any) => v.items || []);
      const cogsEstimado = itemsVendidos30.reduce((s: number, item: any) => {
        const prod = productos.find((p: any) => p.id === item.producto_id);
        const costo = prod?.costo_unitario || 0;
        return s + costo * (item.cantidad || 1);
      }, 0);
      const ingresosBrutos30 = ventas30.reduce((s: number, v: any) => s + (v.subtotal || v.total || 0), 0);
      const foodCostPct = ingresosBrutos30 > 0 ? (cogsEstimado / ingresosBrutos30) * 100 : 0;
      const margenBruto = ingresosBrutos30 - cogsEstimado;
      const margenBrutoPct = ingresosBrutos30 > 0 ? (margenBruto / ingresosBrutos30) * 100 : 0;

      // ── Top Productos (30 días) ──────────────────────────────
      const prodMap: Record<string, any> = {};
      for (const item of itemsVendidos30) {
        if (!item.producto_id) continue;
        if (!prodMap[item.producto_id]) prodMap[item.producto_id] = { producto_id: item.producto_id, nombre: item.nombre, cantidad: 0, monto: 0 };
        prodMap[item.producto_id].cantidad += item.cantidad || 0;
        prodMap[item.producto_id].monto += item.subtotal || 0;
      }
      const topProductos = Object.values(prodMap).sort((a: any, b: any) => b.cantidad - a.cantidad).slice(0, 5);
      const bottomProductos = Object.values(prodMap).sort((a: any, b: any) => a.cantidad - b.cantidad).slice(0, 5);

      // ── Rendimiento por cajero (hoy) ─────────────────────────
      const cajeroMap: Record<string, any> = {};
      for (const v of ventasHoy) {
        const nombre = v.cajero_nombre || 'Sin nombre';
        if (!cajeroMap[nombre]) cajeroMap[nombre] = { cajero: nombre, ventas: 0, monto: 0 };
        cajeroMap[nombre].ventas++;
        cajeroMap[nombre].monto += v.total || 0;
      }

      // ── Cocina ───────────────────────────────────────────────
      const comandasPendientes    = comandas.filter((c: any) => c.estado === 'pendiente');
      const comandasEnPreparacion = comandas.filter((c: any) => c.estado === 'en_preparacion');
      const comandasListas        = comandas.filter((c: any) => c.estado === 'lista');

      // Tiempo promedio de cocina (comandas completadas hoy)
      const comandasHoy = comandas.filter((c: any) => c.created_at >= fechaHoy && c.fecha_completado);
      const tiempoPromedioMin = comandasHoy.length > 0
        ? comandasHoy.reduce((s: number, c: any) => {
            const diff = new Date(c.fecha_completado).getTime() - new Date(c.created_at).getTime();
            return s + diff / 60000;
          }, 0) / comandasHoy.length
        : 0;

      // ── Estado de caja (SQL: turnos_caja con estado='abierto') ─
      let estadoCaja = { abierta: false, cajero: null as string | null, monto_real: 0, cajas_abiertas: 0 };
      try {
        const { data: sesionesAbiertas } = await getDB().from('turnos_caja')
          .select('cajero_nombre, monto_inicial, ventas_total')
          .eq('empresa_id', auth.empresaId).eq('estado', 'abierto');
        if (sesionesAbiertas && sesionesAbiertas.length > 0) {
          let montoTotal = 0;
          for (const sesion of sesionesAbiertas) {
            montoTotal += (sesion.monto_inicial || 0) + (sesion.ventas_total || 0);
          }
          estadoCaja = {
            abierta: true,
            cajero: sesionesAbiertas[0].cajero_nombre || null,
            monto_real: montoTotal,
            cajas_abiertas: sesionesAbiertas.length,
          };
        }
      } catch { /* silencioso */ }

      return c.json({
        ventas: {
          hoy:    { cantidad: ventasHoy.length, monto: montoHoy, ticket_promedio: ticketPromedio },
          semana: { cantidad: ventasSemana.length, monto: montoSemana },
          mes:    { cantidad: ventasMes.length, monto: montoMes },
        },
        inventario: {
          total_productos: productos.length,
          stock_bajo: stockBajo.length,
          valor_total: valorInventario,
        },
        cocina: {
          comandas_pendientes:    comandasPendientes.length,
          comandas_en_preparacion: comandasEnPreparacion.length,
          comandas_listas:        comandasListas.length,
          tiempo_promedio_min:    Math.round(tiempoPromedioMin * 10) / 10,
        },
        kpis: {
          food_cost_pct:      Math.round(foodCostPct * 10) / 10,
          cogs_30d:           Math.round(cogsEstimado * 100) / 100,
          margen_bruto:       Math.round(margenBruto * 100) / 100,
          margen_bruto_pct:   Math.round(margenBrutoPct * 10) / 10,
          ticket_promedio:    Math.round(ticketPromedio * 100) / 100,
        },
        caja: estadoCaja,
        top_productos:    topProductos,
        bottom_productos: bottomProductos,
        ventas_por_dia:   ventasPorDia,
        ventas_por_hora:  ventasPorHora,
        rendimiento_cajeros: Object.values(cajeroMap),
        alertas: {
          stock_bajo: stockBajo.slice(0, 5).map((p: any) => ({
            id: p.id, nombre: p.nombre,
            stock_actual: p.stock_actual, stock_minimo: p.stock_minimo,
          })),
        },
      });
    } catch (error: any) {
      console.error('❌ Error dashboard:', error);
      return c.json({ error: 'Error al obtener métricas', details: error.message }, 500);
    }
  });

  // ── GET /dashboard/metricas/:tipo ────────────────────────────
  app.get("/server/dashboard/metricas/:tipo", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const tipo = c.req.param('tipo');
    try {
      switch (tipo) {
        case 'ventas': {
          const ventas = (await obtenerVentas(auth.empresaId)).filter((v: any) => !v.anulada);
          return c.json({ tipo: 'ventas', total: ventas.length, monto: ventas.reduce((s: number, v: any) => s + (v.total || 0), 0) });
        }
        case 'inventario': {
          const productos = await obtenerProductos(auth.empresaId);
          return c.json({ tipo: 'inventario', total_productos: productos.length, valor_total: productos.reduce((s: number, p: any) => s + ((p.stock_actual || 0) * (p.costo_unitario || 0)), 0) });
        }
        case 'comandas': {
          const comandas = await obtenerComandas(auth.empresaId);
          return c.json({ tipo: 'comandas', total: comandas.length, pendientes: comandas.filter((c: any) => c.estado === 'pendiente').length, en_preparacion: comandas.filter((c: any) => c.estado === 'en_preparacion').length });
        }
        default:
          return c.json({ error: 'Tipo de métrica no válido' }, 400);
      }
    } catch (error: any) {
      return c.json({ error: 'Error al obtener métricas', details: error.message }, 500);
    }
  });
}
