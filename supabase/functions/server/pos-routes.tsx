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
  registrarAsientoAutomatico,
} from "./kv-helpers.tsx";

const ROLES_ADMIN = ['gerente', 'admin', 'super_admin'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v: any): boolean => typeof v === 'string' && UUID_RE.test(v);

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
  const { data } = await query.limit(1).maybeSingle();
  if (data) return { sesion: data };
  // If bodega_id filter found nothing, try any open caja
  if (bodegaId) {
    const { data: any } = await db.from('turnos_caja').select('*')
      .eq('empresa_id', empresaId).eq('estado', 'abierta').limit(1).maybeSingle();
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

      // ── Asiento contable de la venta ─────────────────────────────
      try {
        const totalVenta    = Number(venta.total || venta.monto_total || 0);
        const ivaVenta      = Number(venta.iva   || venta.total_iva   || 0);
        const subtotalVenta = parseFloat((totalVenta - ivaVenta).toFixed(2));
        const fechaVenta    = (venta.fecha || new Date().toISOString()).split('T')[0];
        const refVenta      = venta.numero_ticket || venta.id;

        if (totalVenta > 0) {
          // Cuenta de ingreso según método de pago
          // 1.1.01 = Caja (efectivo / tarjeta registrada en caja)
          const cuentaDebito = '1.1.01';

          const asientoItems: any[] = [];
          asientoItems.push({ codigo: cuentaDebito, debito: parseFloat(totalVenta.toFixed(2)), descripcion: `Cobro venta ${refVenta}` });

          if (ivaVenta > 0 && subtotalVenta > 0) {
            // Venta con IVA: separar ingreso e impuesto
            asientoItems.push({ codigo: '4.1.01', credito: parseFloat(subtotalVenta.toFixed(2)), descripcion: 'Ingreso por ventas' });
            asientoItems.push({ codigo: '2.1.03', credito: parseFloat(ivaVenta.toFixed(2)),      descripcion: 'IVA en ventas por pagar' });
          } else {
            // Venta sin IVA o 0%
            asientoItems.push({ codigo: '4.1.02', credito: parseFloat(totalVenta.toFixed(2)), descripcion: 'Ingreso por ventas (tarifa 0%)' });
          }

          await registrarAsientoAutomatico(auth.empresaId, {
            tipo:        'venta_pos',
            descripcion: `Venta ${refVenta}`,
            referencia:  String(venta.id),
            fecha:       fechaVenta,
            items:       asientoItems,
          });
        }
      } catch (asientoErr: any) {
        // El asiento falla silenciosamente para no bloquear la venta
        console.error('[POS] Error asiento venta:', asientoErr?.message);
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

      // Guardar venta anulada en SQL (guardarVenta hace upsert por id) — esto
      // es lo que realmente importa; lo demás (revertir stock) es best-effort
      // y NO debe hacer fallar la anulación si algo sale mal.
      await guardarVenta(auth.empresaId, ventas[idx]);

      // ── (a) Asiento de reversión contable (best-effort) ───────────
      // Mismo esquema de cuentas que la venta original, con débito/crédito
      // invertidos, para que balance general y estado de resultados queden
      // correctos tras la anulación.
      try {
        const totalVenta    = Number(ventas[idx].total || ventas[idx].monto_total || 0);
        const ivaVenta      = Number(ventas[idx].iva   || ventas[idx].total_iva   || 0);
        const subtotalVenta = parseFloat((totalVenta - ivaVenta).toFixed(2));
        const refVenta      = ventas[idx].numero_ticket || ventas[idx].id;

        if (totalVenta > 0) {
          const asientoItems: any[] = [];
          // Lo que era débito (Caja) ahora es crédito, y viceversa con los ingresos/IVA
          asientoItems.push({ codigo: '1.1.01', credito: parseFloat(totalVenta.toFixed(2)), descripcion: `Reversión cobro venta ${refVenta} (anulada)` });

          if (ivaVenta > 0 && subtotalVenta > 0) {
            asientoItems.push({ codigo: '4.1.01', debito: parseFloat(subtotalVenta.toFixed(2)), descripcion: 'Reversión ingreso por ventas' });
            asientoItems.push({ codigo: '2.1.03', debito: parseFloat(ivaVenta.toFixed(2)),      descripcion: 'Reversión IVA en ventas por pagar' });
          } else {
            asientoItems.push({ codigo: '4.1.02', debito: parseFloat(totalVenta.toFixed(2)), descripcion: 'Reversión ingreso por ventas (tarifa 0%)' });
          }

          await registrarAsientoAutomatico(auth.empresaId, {
            tipo:        'anulacion_venta_pos',
            descripcion: `Anulación venta ${refVenta} — ${motivo}`,
            referencia:  String(ventas[idx].id),
            fecha:       new Date().toISOString().split('T')[0],
            items:       asientoItems,
          });
        }
      } catch (asientoErr: any) {
        console.warn('[anular-venta] No se pudo generar asiento de reversión (la anulación sí se aplicó):', asientoErr?.message);
      }

      // ── (b) Reversar el movimiento de caja (best-effort) ──────────
      // Busca el movimiento 'venta' original en la sesión de caja abierta
      // (por número de ticket) y agrega un movimiento de reversión para
      // que el monto esperado en caja deje de contar ese efectivo/cobro.
      try {
        const numeroTicket  = ventas[idx].numero_ticket;
        const bodegaIdVenta = ventas[idx].bodega_id || auth.user?.bodega_id || '';
        const cajaResult    = await getCajaAbierta(auth.empresaId, bodegaIdVenta);
        if (cajaResult?.sesion && numeroTicket) {
          const sesion = cajaResult.sesion;
          const movs: any[] = sesion.movimientos || [];
          const movVenta    = movs.find((m: any) => m.tipo === 'venta' && m.referencia === numeroTicket);
          const yaRevertido = movs.some((m: any) => m.tipo === 'anulacion_venta' && m.referencia === numeroTicket);
          if (movVenta && !yaRevertido) {
            const reversion = {
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              tipo: 'anulacion_venta',
              monto: Number(movVenta.monto) || 0,
              descripcion: `Reversión venta anulada ${numeroTicket} — ${motivo}`,
              usuario_id: auth.userId,
              usuario_nombre: auth.user?.nombre_completo || 'Admin',
              fecha: new Date().toISOString(),
              metodo_pago: movVenta.metodo_pago || undefined,
              referencia: numeroTicket,
            };
            const movsActualizados = [...movs, reversion];
            await getDB().from('turnos_caja')
              .update({ movimientos: movsActualizados })
              .eq('id', sesion.id)
              .eq('empresa_id', auth.empresaId);
          }
        }
      } catch (cajaErr: any) {
        console.warn('[anular-venta] No se pudo revertir movimiento de caja (la anulación sí se aplicó):', cajaErr?.message);
      }

      // ── (c) Detectar factura electrónica emitida (SOLO advertencia) ──
      // No bloquea la anulación ni genera Nota de Crédito automáticamente:
      // legalmente, anular una factura ya autorizada ante el SRI requiere
      // emitir una Nota de Crédito por separado — solo avisamos al usuario.
      let facturaAlerta: string | null = null;
      try {
        const numeroTicket = ventas[idx].numero_ticket;
        if (numeroTicket) {
          const { data: facturasRel } = await getDB().from('facturas')
            .select('id, numero_factura, estado_autorizacion')
            .eq('empresa_id', auth.empresaId)
            .eq('datos_completos->>venta_id', numeroTicket)
            .limit(5);

          const facturaAutorizada = (facturasRel || []).find((f: any) =>
            String(f.estado_autorizacion || '').toUpperCase() === 'AUTORIZADO'
          );

          if (facturaAutorizada) {
            facturaAlerta =
              `⚠ Esta venta ya tiene una factura electrónica AUTORIZADA por el SRI (N° ${facturaAutorizada.numero_factura}). ` +
              `La anulación interna NO la invalida ante el SRI: para revertirla legalmente debes emitir una Nota de Crédito desde Facturación.`;
          } else if ((facturasRel || []).length > 0) {
            const f = facturasRel![0];
            facturaAlerta =
              `⚠ Esta venta tiene una factura electrónica asociada (N° ${f.numero_factura}, estado: ${f.estado_autorizacion}). ` +
              `Verifica su estado ante el SRI antes de continuar.`;
          }
        }
      } catch (facturaErr: any) {
        console.warn('[anular-venta] No se pudo verificar factura asociada:', facturaErr?.message);
      }

      // Revertir stock (best-effort — no debe bloquear ni revertir la anulación)
      try {
        const items = ventas[idx].items || [];
        for (const item of items) {
          // producto_id debe ser un UUID válido (columna UUID en movimientos_inventario);
          // bodega_id vacío ('') también revienta el insert por ser columna UUID — usar null.
          if (isUUID(item.producto_id) && Number(item.cantidad) > 0) {
            await guardarMovimiento(auth.empresaId, {
              tipo: 'entrada',
              producto_id: item.producto_id,
              bodega_id: isUUID(item.bodega_id) ? item.bodega_id : null,
              cantidad: item.cantidad,
              costo_unitario: item.precio_unitario || 0,
              referencia: `Anulación venta ${ventas[idx].numero_ticket}`,
              observaciones: `Anulación: ${motivo}`,
              usuario_id: auth.userId,
            });
          }
        }
      } catch (stockErr: any) {
        console.warn('[anular-venta] No se pudo revertir stock (la anulación sí se aplicó):', stockErr?.message);
      }

      console.log('🚫 Venta anulada:', ventaId, 'motivo:', motivo, facturaAlerta ? '(con alerta de factura)' : '');
      return c.json({ success: true, venta: ventas[idx], factura_alerta: facturaAlerta });
    } catch (error: any) {
      return c.json({ error: 'Error al anular venta', details: error.message }, 500);
    }
  });

  // ── GET /pos/ventas ────────────────────────────────────────────
  app.get("/server/pos/ventas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const db = getDB();
      const {
        fecha_inicio, fecha_fin,
        incluir_anuladas,
        page = '1', limit = '50',
      } = c.req.query() as any;

      const pageNum  = Math.max(1, parseInt(page)  || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
      const from = (pageNum - 1) * limitNum;
      const to   = from + limitNum - 1;

      let q = db.from('ventas')
        .select('*', { count: 'exact' })
        .eq('empresa_id', auth.empresaId)
        .order('created_at', { ascending: false })
        .range(from, to);

      // anulada puede ser NULL en ventas antiguas → tratar NULL como false
      if (incluir_anuladas !== 'true') q = q.or('anulada.is.null,anulada.eq.false');

      // Filtrar por fecha usando created_at (siempre existe) con soporte de zona horaria Ecuador (UTC-5)
      if (fecha_inicio) {
        // inicio del día en Ecuador = fecha_inicio 05:00 UTC
        const inicioUtc = new Date(`${fecha_inicio}T05:00:00.000Z`).toISOString();
        q = q.gte('created_at', inicioUtc);
      }
      if (fecha_fin) {
        // fin del día en Ecuador = fecha_fin+1 05:00 UTC (= medianoche Ecuador)
        const finDate = new Date(`${fecha_fin}T05:00:00.000Z`);
        finDate.setDate(finDate.getDate() + 1);
        q = q.lt('created_at', finDate.toISOString());
      }

      const { data, error, count } = await q;
      if (error) throw error;

      return c.json({
        ventas: data || [],
        total:  count || 0,
        page:   pageNum,
        limit:  limitNum,
        pages:  Math.ceil((count || 0) / limitNum),
      });
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
