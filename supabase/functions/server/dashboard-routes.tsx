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
      const ahora = new Date();

      // ── Ajuste zona horaria Ecuador (UTC-5) ───────────────────
      // El Edge Function corre en UTC. Ecuador es UTC-5.
      // "Medianoche en Ecuador" = 05:00 UTC del mismo día.
      const OFFSET_EC = 5 * 3600 * 1000; // 5 horas en ms
      const ahoraEC = new Date(ahora.getTime() - OFFSET_EC); // hora local Ecuador

      // Medianoche Ecuador expresada en UTC (para comparar con created_at)
      const hoyEC = new Date(ahoraEC);
      hoyEC.setHours(0, 0, 0, 0);
      const fechaHoy = new Date(hoyEC.getTime() + OFFSET_EC).toISOString(); // 05:00 UTC

      // Lunes de la semana actual (semana lun-dom) en Ecuador
      const diaSemana = hoyEC.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
      const diasDesdeElLunes = diaSemana === 0 ? 6 : diaSemana - 1;
      const inicioSemanaEC = new Date(hoyEC);
      inicioSemanaEC.setDate(hoyEC.getDate() - diasDesdeElLunes);
      const inicioSemana = new Date(inicioSemanaEC.getTime() + OFFSET_EC); // en UTC

      const inicioMesEC = new Date(ahoraEC.getFullYear(), ahoraEC.getMonth(), 1);
      const inicioMes = new Date(inicioMesEC.getTime() + OFFSET_EC).toISOString();
      const hace30 = new Date(Date.now() - 30 * 86400000).toISOString();

      // Alias para el resto del código que aún usa 'hoy' (medianoche Ecuador en UTC)
      const hoy = hoyEC;

      // ── Obtener caja abierta para calcular inicio de "ventas hoy" ──
      let fechaInicioHoy = fechaHoy;
      let estadoCaja = { abierta: false, cajero: null as string | null, monto_real: 0, cajas_abiertas: 0, fecha_apertura: null as string | null };
      try {
        const { data: sesionesAbiertas } = await getDB().from('turnos_caja')
          .select('cajero_nombre, monto_inicial, ventas_total, fecha_apertura')
          .eq('empresa_id', auth.empresaId).eq('estado', 'abierta')   // 'abierta' no 'abierto'
          .order('fecha_apertura', { ascending: false });
        if (sesionesAbiertas && sesionesAbiertas.length > 0) {
          let montoTotal = 0;
          for (const sesion of sesionesAbiertas) {
            montoTotal += (sesion.monto_inicial || 0) + (sesion.ventas_total || 0);
          }
          const fechaApertura = sesionesAbiertas[0].fecha_apertura;

          // Solo usar fecha_apertura como inicio de "hoy" si la caja se abrió HOY (Ecuador).
          // Si la sesión es de un día anterior (nunca cerrada), usar medianoche Ecuador de hoy.
          let aperturaEsDeHoy = false;
          if (fechaApertura) {
            const aperEC = new Date(new Date(fechaApertura).getTime() - OFFSET_EC);
            const aperFecha = aperEC.toISOString().split('T')[0];
            const hoyFecha  = hoyEC.toISOString().split('T')[0];
            aperturaEsDeHoy = aperFecha === hoyFecha;
          }
          if (fechaApertura && aperturaEsDeHoy) fechaInicioHoy = fechaApertura;
          // Si apertura es de días previos → fechaInicioHoy queda como medianoche Ecuador (correcto)

          estadoCaja = {
            abierta: true,
            cajero: sesionesAbiertas[0].cajero_nombre || null,
            monto_real: montoTotal,
            cajas_abiertas: sesionesAbiertas.length,
            fecha_apertura: fechaApertura || null,
          };
        }
      } catch { /* silencioso */ }

      const [productos, ventas, comandas] = await Promise.all([
        obtenerProductos(auth.empresaId),
        obtenerVentas(auth.empresaId),
        obtenerComandas(auth.empresaId),
      ]);

      const activas = ventas.filter((v: any) => !v.anulada);

      // ── Ventas por período ───────────────────────────────────
      // Soporte dual: campo 'fecha' (KV legacy) o 'created_at' (SQL)
      const getFecha = (v: any): string => v.fecha || v.created_at || '';
      // "Hoy" = desde apertura de caja (o medianoche si no hay caja abierta)
      const ventasHoy    = activas.filter((v: any) => getFecha(v) >= fechaInicioHoy);
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

      // ── Ventas por día (últimos 7) — fecha en hora Ecuador ──────
      // Convierte el timestamp de cada venta a fecha Ecuador (UTC-5) para agrupar correctamente
      const getFechaEC = (v: any): string => {
        const ts = v.fecha || v.created_at || '';
        if (!ts) return '';
        const d = new Date(new Date(ts).getTime() - OFFSET_EC);
        return d.toISOString().split('T')[0]; // fecha local Ecuador
      };
      const ventasPorDia: any[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(hoyEC); d.setDate(hoyEC.getDate() - i);
        const dateStr = d.toISOString().split('T')[0]; // fecha Ecuador
        const dvs = activas.filter((v: any) => getFechaEC(v) === dateStr);
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
        periodos: {
          inicio_hoy: fechaInicioHoy,
          inicio_semana: inicioSemana.toISOString(),
          fin_semana: new Date(inicioSemana.getTime() + 6 * 86400000).toISOString(),
        },
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
