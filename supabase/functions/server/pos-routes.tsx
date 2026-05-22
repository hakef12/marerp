// =====================================================
// RUTAS: PUNTO DE VENTA (POS)
// =====================================================

import { createClient } from "npm:@supabase/supabase-js";
import {
  obtenerProductos,
  obtenerCategorias,
  obtenerVentas,
  guardarVenta,
  guardarMovimiento,
} from "./kv-helpers.tsx";

const ROLES_ADMIN = ['gerente', 'admin', 'super_admin'];

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ── Buscar sesión de caja activa (SQL) ────────────────────────
async function getCajaAbierta(empresaId: string, bodegaId?: string): Promise<{ sesion: any } | null> {
  const db = getDB();
  let query = db.from('turnos_caja').select('*')
    .eq('empresa_id', empresaId).eq('estado', 'abierta');
  if (bodegaId) query = query.eq('bodega_id', bodegaId);
  const { data } = await query.limit(1).single();
  if (data) return { sesion: data };
  // If bodega_id filter found nothing, try any open caja
  if (bodegaId) {
    const { data: any } = await db.from('turnos_caja').select('*')
      .eq('empresa_id', empresaId).eq('estado', 'abierta').limit(1).single();
    if (any) return { sesion: any };
  }
  return null;
}

export function setupPOSRoutes(app: any, authMiddleware: any) {

  // ── GET /pos/productos ─────────────────────────────────────────
  app.get("/server/pos/productos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const productosReales = await obtenerProductos(auth.empresaId);
      const categorias = await obtenerCategorias(auth.empresaId);
      const categoriasMap = new Map(categorias.map((cat: any) => [cat.id, cat]));

      const productosParaPOS = productosReales
        .filter((p: any) => p.disponible !== false)
        .map((producto: any) => {
          // Formula products that don't manage individual inventory have no physical stock
          const esRecetaSinStock = producto.es_receta === true && producto.gestiona_inventario !== true;
          return {
            ...producto,
            precio: Number(producto.precio_venta) || Number(producto.precio) || 0,
            // Normalize stock: formula-only products get null (unlimited), others default to 0
            stock_actual: esRecetaSinStock ? null : (producto.stock_actual ?? 0),
            stock_minimo: producto.stock_minimo ?? 0,
            porcentaje_iva: producto.porcentaje_iva ?? 0,
            impuesto_incluido: producto.impuesto_incluido ?? false,
            es_receta: producto.es_receta ?? false,
            gestiona_inventario: producto.gestiona_inventario ?? false,
            categorias: producto.categoria_id ? categoriasMap.get(producto.categoria_id) : null,
          };
        })
        .sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''));

      return c.json({ productos: productosParaPOS });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener productos', details: error.message }, 500);
    }
  });

  // ── POST /pos/ventas — Crear venta ────────────────────────────
  app.post("/server/pos/ventas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();

      // ── VERIFICAR CAJA ABIERTA (obligatorio) ──────────────────
      const bodegaIdReq = body.bodega_id || auth.user?.bodega_id || '';
      const cajaResult = await getCajaAbierta(auth.empresaId, bodegaIdReq);
      if (!cajaResult) {
        return c.json({
          error: 'La caja está cerrada. Debe abrir la caja antes de registrar ventas.',
          codigo: 'CAJA_CERRADA',
        }, 409);
      }

      const ventaData = {
        ...body,
        id: `venta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fecha: new Date().toISOString(),
        empresa_id: auth.empresaId,
        usuario_id: auth.userId,
        cajero_nombre: auth.user?.nombre_completo || 'Cajero',
        estado: body.estado || 'completada',
        anulada: false,
      };

      const venta = await guardarVenta(auth.empresaId, ventaData);

      // ── Descontar stock por producto vendido ──────────────────
      if (venta.estado === 'completada' && Array.isArray(venta.items)) {
        for (const item of venta.items) {
          if (item.producto_id && item.cantidad > 0) {
            await guardarMovimiento(auth.empresaId, {
              tipo: 'salida',
              producto_id: item.producto_id,
              bodega_id: item.bodega_id || '',
              cantidad: item.cantidad,
              costo_unitario: item.precio_unitario || 0,
              referencia: `Venta ${venta.numero_ticket || venta.id}`,
              observaciones: 'Venta POS automática',
              usuario_id: auth.userId,
            });
          }
        }
      }

      // NOTA: El registro en caja lo hace el frontend directamente vía POST /caja/movimiento
      // para garantizar visibilidad y evitar problemas de KV dentro de la misma invocación.

      // ── Auto-liberar mesa si la venta era de mesa (SQL) ─────────
      if (venta.mesa && venta.tipo_servicio === 'mesa') {
        try {
          const mesaNum = String(venta.mesa);
          await getDB().from('mesas')
            .update({
              estado: 'libre', mesero_id: null, mesero_nombre: null,
              hora_ocupacion: null, consumo_acumulado: 0,
              numero_comanda: null, personas: 0, nota: null,
              updated_at: new Date().toISOString(),
            })
            .eq('empresa_id', auth.empresaId)
            .or(`codigo.eq.mesa-${mesaNum},numero.eq.${mesaNum}`);
          console.log(`✅ Mesa ${venta.mesa} liberada tras venta ${venta.numero_ticket}`);
        } catch (e) {
          console.warn('⚠ No se pudo liberar mesa automáticamente:', e);
        }
      }

      return c.json({ venta }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear venta', details: error.message }, 500);
    }
  });

  // ── POST /pos/ventas/:id/anular — Anular venta ───────────────
  app.post("/server/pos/ventas/:id/anular", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const ventaId = c.req.param('id');

    if (!ROLES_ADMIN.includes(auth.userRole)) {
      return c.json({ error: 'Solo administradores o gerentes pueden anular ventas' }, 403);
    }

    try {
      const { motivo } = await c.req.json();
      if (!motivo?.trim()) return c.json({ error: 'Se requiere un motivo de anulación' }, 400);

      const ventas: any[] = await obtenerVentas(auth.empresaId);
      const idx = ventas.findIndex(v => v.id === ventaId || v.numero_ticket === ventaId);
      if (idx === -1) return c.json({ error: 'Venta no encontrada' }, 404);
      if (ventas[idx].anulada) return c.json({ error: 'Esta venta ya fue anulada' }, 400);

      ventas[idx] = {
        ...ventas[idx],
        anulada: true,
        estado: 'anulada',
        motivo_anulacion: motivo,
        anulada_por: auth.userId,
        anulada_por_nombre: auth.user?.nombre_completo || 'Admin',
        fecha_anulacion: new Date().toISOString(),
      };

      // Guardar venta anulada en SQL (guardarVenta hace upsert por id)
      await guardarVenta(auth.empresaId, ventas[idx]);

      // Revertir stock
      const items = ventas[idx].items || [];
      for (const item of items) {
        if (item.producto_id && item.cantidad > 0) {
          await guardarMovimiento(auth.empresaId, {
            tipo: 'entrada',
            producto_id: item.producto_id,
            bodega_id: item.bodega_id || '',
            cantidad: item.cantidad,
            costo_unitario: item.precio_unitario || 0,
            referencia: `Anulación venta ${ventas[idx].numero_ticket}`,
            observaciones: `Anulación: ${motivo}`,
            usuario_id: auth.userId,
          });
        }
      }

      console.log('🚫 Venta anulada:', ventaId, 'motivo:', motivo);
      return c.json({ success: true, venta: ventas[idx] });
    } catch (error: any) {
      return c.json({ error: 'Error al anular venta', details: error.message }, 500);
    }
  });

  // ── GET /pos/ventas ────────────────────────────────────────────
  app.get("/server/pos/ventas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const fechaInicio = c.req.query('fecha_inicio');
      const fechaFin = c.req.query('fecha_fin');
      const incluirAnuladas = c.req.query('incluir_anuladas') === 'true';

      let ventas = await obtenerVentas(auth.empresaId);

      if (!incluirAnuladas) ventas = ventas.filter((v: any) => !v.anulada);
      if (fechaInicio) ventas = ventas.filter((v: any) => v.fecha >= fechaInicio);
      if (fechaFin) ventas = ventas.filter((v: any) => v.fecha <= fechaFin);

      ventas.sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      return c.json({ ventas });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener ventas', details: error.message }, 500);
    }
  });

  // ── GET /pos/ventas/:id ────────────────────────────────────────
  app.get("/server/pos/ventas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const ventaId = c.req.param('id');
    try {
      const ventas = await obtenerVentas(auth.empresaId);
      const venta = ventas.find((v: any) => v.id === ventaId || v.numero_ticket === ventaId);
      if (!venta) return c.json({ error: 'Venta no encontrada' }, 404);
      return c.json({ venta });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener venta', details: error.message }, 500);
    }
  });

  // ── GET /pos/reportes/ventas ───────────────────────────────────
  app.get("/server/pos/reportes/ventas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const fechaInicio = c.req.query('fecha_inicio') || new Date(Date.now() - 30 * 86400000).toISOString();
      const fechaFin = c.req.query('fecha_fin') || new Date().toISOString();

      const ventas = (await obtenerVentas(auth.empresaId))
        .filter((v: any) => !v.anulada && v.fecha >= fechaInicio && v.fecha <= fechaFin);

      const montoTotal = ventas.reduce((s: number, v: any) => s + (v.total || 0), 0);
      const montoPromedio = ventas.length > 0 ? montoTotal / ventas.length : 0;

      // Ventas por día
      const porDia: Record<string, any> = {};
      for (const v of ventas) {
        const d = v.fecha.split('T')[0];
        if (!porDia[d]) porDia[d] = { fecha: d, cantidad: 0, monto: 0 };
        porDia[d].cantidad++;
        porDia[d].monto += v.total || 0;
      }

      // Ventas por hora
      const porHora: Record<number, any> = {};
      for (let h = 0; h < 24; h++) porHora[h] = { hora: h, cantidad: 0, monto: 0 };
      for (const v of ventas) {
        const h = new Date(v.fecha).getHours();
        porHora[h].cantidad++;
        porHora[h].monto += v.total || 0;
      }

      // Ventas por tipo de servicio
      const porTipo: Record<string, any> = {};
      for (const v of ventas) {
        const t = v.tipo_servicio || 'desconocido';
        if (!porTipo[t]) porTipo[t] = { tipo: t, cantidad: 0, monto: 0 };
        porTipo[t].cantidad++;
        porTipo[t].monto += v.total || 0;
      }

      // Productos más vendidos
      const productosVendidos = ventas.flatMap((v: any) => v.items || []);
      const prodMap: Record<string, any> = {};
      for (const item of productosVendidos) {
        if (!item.producto_id) continue;
        if (!prodMap[item.producto_id]) prodMap[item.producto_id] = { producto_id: item.producto_id, nombre: item.nombre, cantidad: 0, monto: 0 };
        prodMap[item.producto_id].cantidad += item.cantidad || 0;
        prodMap[item.producto_id].monto += item.subtotal || 0;
      }
      const topProductos = Object.values(prodMap).sort((a: any, b: any) => b.monto - a.monto).slice(0, 10);

      // Rendimiento por cajero
      const porCajero: Record<string, any> = {};
      for (const v of ventas) {
        const c = v.cajero_nombre || v.usuario_id || 'Desconocido';
        if (!porCajero[c]) porCajero[c] = { cajero: c, cantidad: 0, monto: 0 };
        porCajero[c].cantidad++;
        porCajero[c].monto += v.total || 0;
      }

      return c.json({
        resumen: { total_ventas: ventas.length, monto_total: montoTotal, monto_promedio: montoPromedio, fecha_inicio: fechaInicio, fecha_fin: fechaFin },
        ventas_por_dia: Object.values(porDia),
        ventas_por_hora: Object.values(porHora),
        ventas_por_tipo: Object.values(porTipo),
        top_productos: topProductos,
        rendimiento_cajeros: Object.values(porCajero),
      });
    } catch (error: any) {
      return c.json({ error: 'Error al generar reporte', details: error.message }, 500);
    }
  });

  // ── GET /pos/dashboard ─────────────────────────────────────────
  app.get("/server/pos/dashboard", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const fechaHoy = hoy.toISOString();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();

      const ventas = await obtenerVentas(auth.empresaId);
      const activas = ventas.filter((v: any) => !v.anulada);
      const ventasHoy = activas.filter((v: any) => v.fecha >= fechaHoy);
      const ventasMes = activas.filter((v: any) => v.fecha >= inicioMes);

      const montoHoy = ventasHoy.reduce((s: number, v: any) => s + (v.total || 0), 0);
      const montoMes = ventasMes.reduce((s: number, v: any) => s + (v.total || 0), 0);
      const ticketPromedio = ventasHoy.length > 0 ? montoHoy / ventasHoy.length : 0;

      const productos = await obtenerProductos(auth.empresaId);
      const stockBajo = productos.filter((p: any) => p.stock_actual <= p.stock_minimo);

      return c.json({
        ventas_hoy: { cantidad: ventasHoy.length, monto: montoHoy, ticket_promedio: ticketPromedio },
        ventas_mes: { cantidad: ventasMes.length, monto: montoMes },
        stock_bajo: { cantidad: stockBajo.length, productos: stockBajo.slice(0, 5) },
      });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener dashboard', details: error.message }, 500);
    }
  });
}
