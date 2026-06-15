/**
 * Rutas de Gestión Visual de Mesas — SQL
 * Cada mesa es una fila en la tabla `mesas` (empresa_id + codigo UNIQUE)
 */

import { createClient } from "npm:@supabase/supabase-js";
import { getConfig } from "./facturacion-routes.tsx";

type EstadoMesa = 'libre' | 'ocupada' | 'reservada' | 'esperando_cuenta';

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function defaultMesas(cantidad = 10) {
  // Por defecto solo 10 mesas — el usuario puede agregar las que necesite sin límite
  const zonas = ['Salón', 'Terraza', 'Barra', 'VIP'];
  return Array.from({ length: cantidad }, (_, i) => ({
    codigo: `mesa-${i + 1}`,
    numero: i + 1,
    nombre: `Mesa ${i + 1}`,
    capacidad: 4,
    zona: zonas[Math.floor(i / Math.ceil(cantidad / zonas.length))] ?? 'Salón',
    estado: 'libre' as EstadoMesa,
    mesero_id: null,
    mesero_nombre: null,
    hora_ocupacion: null,
    consumo_acumulado: 0,
    numero_comanda: null,
    personas: 0,
    nota: null,
    posicion: { x: (i % 5) * 190 + 20, y: Math.floor(i / 5) * 190 + 20 },
  }));
}

async function getMesas(empresaId: string) {
  const db = getDB();
  const { data, error } = await db.from('mesas')
    .select('*').eq('empresa_id', empresaId).order('numero');
  if (error) throw error;

  // Si no hay mesas, crear las por defecto
  if (!data || data.length === 0) {
    const defaults = defaultMesas();
    const rows = defaults.map(m => ({ ...m, empresa_id: empresaId }));
    const { data: inserted } = await db.from('mesas').insert(rows).select();
    return inserted || defaults;
  }
  return data;
}

async function updateMesa(empresaId: string, codigo: string, cambios: any) {
  const db = getDB();
  const { data, error } = await db.from('mesas')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('empresa_id', empresaId).eq('codigo', codigo)
    .select().single();
  if (error) throw error;
  return data;
}

export function setupMesasRoutes(app: any, authMiddleware: any) {

  // ── GET /mesas ──────────────────────────────────────────────────────
  app.get('/server/mesas', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const mesas = await getMesas(auth.empresaId);
      const ahora = Date.now();
      const result = mesas.map((m: any) => ({
        ...m,
        id: m.codigo || m.id,
        minutos_ocupada: m.hora_ocupacion
          ? Math.floor((ahora - new Date(m.hora_ocupacion).getTime()) / 60000)
          : 0,
      }));
      return c.json({ mesas: result });
    } catch (err: any) {
      return c.json({ error: 'Error al obtener mesas', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas — Guardar layout completo ───────────────────────────
  app.post('/server/mesas', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { mesas } = await c.req.json();
      if (!Array.isArray(mesas)) return c.json({ error: 'Se esperaba un array de mesas' }, 400);
      const db = getDB();
      const rows = mesas.map((m: any) => ({
        ...m,
        codigo: m.id || m.codigo || `mesa-${m.numero}`,
        empresa_id: auth.empresaId,
        updated_at: new Date().toISOString(),
      }));
      await db.from('mesas').upsert(rows, { onConflict: 'empresa_id,codigo' });
      return c.json({ success: true, mesas });
    } catch (err: any) {
      return c.json({ error: 'Error al guardar mesas', detalle: err.message }, 500);
    }
  });

  // ── PUT /mesas/:id ──────────────────────────────────────────────────
  app.put('/server/mesas/:id', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const body = await c.req.json();
      const mesa = await updateMesa(auth.empresaId, codigo, body);
      return c.json({ success: true, mesa: { ...mesa, id: mesa.codigo || mesa.id } });
    } catch (err: any) {
      return c.json({ error: 'Error al actualizar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/nueva — Crear una mesa adicional sin límite ─────────
  app.post('/server/mesas/nueva', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const db = getDB();
      const body = await c.req.json().catch(() => ({}));

      // Obtener el número más alto actual
      const { data: existentes } = await db.from('mesas')
        .select('numero').eq('empresa_id', auth.empresaId)
        .order('numero', { ascending: false }).limit(1);
      const ultimoNumero = existentes?.[0]?.numero || 0;
      const nuevoNumero  = ultimoNumero + 1;

      const nuevaMesa = {
        codigo:             body.codigo || `mesa-${nuevoNumero}`,
        numero:             nuevoNumero,
        nombre:             body.nombre || `Mesa ${nuevoNumero}`,
        capacidad:          Number(body.capacidad) || 4,
        zona:               body.zona || 'Salón',
        estado:             'libre' as EstadoMesa,
        mesero_id:          null,
        mesero_nombre:      null,
        hora_ocupacion:     null,
        consumo_acumulado:  0,
        numero_comanda:     null,
        personas:           0,
        nota:               body.nota || null,
        posicion:           body.posicion || { x: 20, y: 20 },
        empresa_id:         auth.empresaId,
        updated_at:         new Date().toISOString(),
      };

      const { data, error } = await db.from('mesas').insert(nuevaMesa).select().single();
      if (error) throw error;
      return c.json({ success: true, mesa: data }, 201);
    } catch (err: any) {
      return c.json({ error: 'Error al crear mesa', detalle: err.message }, 500);
    }
  });

  // ── DELETE /mesas/:id — Eliminar una mesa libre ───────────────────────
  app.delete('/server/mesas/:id', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const db = getDB();
      // Solo se puede eliminar si está libre
      const { data: mesa } = await db.from('mesas')
        .select('estado,nombre').eq('empresa_id', auth.empresaId)
        .eq('codigo', codigo).maybeSingle();

      if (!mesa) return c.json({ error: 'Mesa no encontrada' }, 404);
      if (mesa.estado !== 'libre') return c.json({ error: `No se puede eliminar ${mesa.nombre} — está ${mesa.estado}` }, 422);

      await db.from('mesas').delete().eq('empresa_id', auth.empresaId).eq('codigo', codigo);
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: 'Error al eliminar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/ocupar ──────────────────────────────────────────
  app.post('/server/mesas/:id/ocupar', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const { mesero_id, mesero_nombre, personas = 1, numero_comanda, nota } = await c.req.json();
      const db = getDB();
      const { data: actual } = await db.from('mesas').select('estado')
        .eq('empresa_id', auth.empresaId).eq('codigo', codigo).single();
      if (actual?.estado === 'ocupada') return c.json({ error: 'La mesa ya está ocupada' }, 400);

      const mesa = await updateMesa(auth.empresaId, codigo, {
        estado: 'ocupada',
        mesero_id: mesero_id || auth.userId,
        mesero_nombre: mesero_nombre || auth.user?.nombre_completo || 'Sin asignar',
        hora_ocupacion: new Date().toISOString(),
        consumo_acumulado: 0,
        numero_comanda: numero_comanda || null,
        personas: Number(personas) || 1,
        nota: nota || null,
      });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error al ocupar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/liberar ─────────────────────────────────────────
  app.post('/server/mesas/:id/liberar', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const mesa = await updateMesa(auth.empresaId, codigo, {
        estado: 'libre', mesero_id: null, mesero_nombre: null,
        hora_ocupacion: null, consumo_acumulado: 0,
        numero_comanda: null, personas: 0, nota: null,
      });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error al liberar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/reservar ────────────────────────────────────────
  app.post('/server/mesas/:id/reservar', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const { nota, personas } = await c.req.json();
      const mesa = await updateMesa(auth.empresaId, codigo, {
        estado: 'reservada', nota: nota || null,
        personas: Number(personas) || 0,
        hora_ocupacion: new Date().toISOString(),
      });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error al reservar mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/esperando-cuenta ────────────────────────────────
  app.post('/server/mesas/:id/esperando-cuenta', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const mesa = await updateMesa(auth.empresaId, codigo, { estado: 'esperando_cuenta' });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/consumo ─────────────────────────────────────────
  app.post('/server/mesas/:id/consumo', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const { monto } = await c.req.json();
      const db = getDB();
      const { data: actual } = await db.from('mesas').select('consumo_acumulado')
        .eq('empresa_id', auth.empresaId).eq('codigo', codigo).single();
      const mesa = await updateMesa(auth.empresaId, codigo, {
        consumo_acumulado: (actual?.consumo_acumulado || 0) + Number(monto || 0),
      });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/:id/transferir ──────────────────────────────────────
  app.post('/server/mesas/:id/transferir', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const { mesero_id, mesero_nombre } = await c.req.json();
      if (!mesero_nombre) return c.json({ error: 'Nombre del mesero requerido' }, 400);
      const mesa = await updateMesa(auth.empresaId, codigo, {
        mesero_id: mesero_id || null, mesero_nombre,
      });
      return c.json({ success: true, mesa: { ...mesa, id: codigo } });
    } catch (err: any) {
      return c.json({ error: 'Error al transferir mesa', detalle: err.message }, 500);
    }
  });

  // ── POST /mesas/reset ───────────────────────────────────────────────
  app.post('/server/mesas/reset', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const db = getDB();
      await db.from('mesas').delete().eq('empresa_id', auth.empresaId);
      const defaults = defaultMesas();
      const rows = defaults.map(m => ({ ...m, empresa_id: auth.empresaId }));
      await db.from('mesas').insert(rows);
      return c.json({ success: true, mensaje: 'Mesas reseteadas', mesas: defaults });
    } catch (err: any) {
      return c.json({ error: 'Error', detalle: err.message }, 500);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // CUENTA ABIERTA — Ver items, descuentos, propina, pago mixto, división
  // ══════════════════════════════════════════════════════════════════════

  // GET /mesas/:id/cuenta — Obtiene todas las órdenes de la mesa desde que se abrió
  app.get('/server/mesas/:id/cuenta', authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    const codigo = c.req.param('id');
    try {
      const { data: mesa } = await db.from('mesas').select('*')
        .eq('empresa_id', auth.empresaId).eq('codigo', codigo).maybeSingle();
      if (!mesa) return c.json({ error: 'Mesa no encontrada' }, 404);

      // Buscar ventas de esta mesa desde que se abrió
      let q = db.from('ventas').select('id,numero_ticket,total,subtotal,impuestos,items,metodo_pago,cajero_nombre,created_at,anulada')
        .eq('empresa_id', auth.empresaId)
        .eq('anulada', false)
        .or(`mesa.eq.${mesa.numero},tipo_servicio.eq.mesa_${mesa.numero}`);

      if (mesa.hora_ocupacion) {
        q = q.gte('created_at', mesa.hora_ocupacion);
      } else {
        // Si no hay hora de ocupación, últimas 12 horas
        q = q.gte('created_at', new Date(Date.now() - 12*3600000).toISOString());
      }
      const { data: ventas } = await q.order('created_at');

      // Agregar todos los items
      const todosItems: any[] = [];
      let subtotalTotal = 0; let ivaTotal = 0; let totalTotal = 0;
      for (const v of (ventas || [])) {
        for (const item of (v.items || [])) {
          todosItems.push({
            ...item, venta_id: v.id, ticket: v.numero_ticket,
            mesero: v.cajero_nombre, hora: v.created_at,
          });
        }
        subtotalTotal += Number(v.subtotal || 0);
        ivaTotal += Number(v.impuestos || v.iva || 0);
        totalTotal += Number(v.total || 0);
      }

      // Descuento / propina guardados en mesa metadata
      const meta = typeof mesa.metadata === 'string' ? JSON.parse(mesa.metadata||'{}') : (mesa.metadata||{});
      const descuento = Number(meta.descuento || 0);
      const pagos_parciales: any[] = meta.pagos_parciales || [];
      const pagado = pagos_parciales.reduce((s: number, p: any) => s + Number(p.monto||0), 0);

      // 10% de servicio (Ley de Turismo): si la empresa lo cobra obligatorio,
      // se calcula automaticamente sobre el subtotal y NO se puede sobrescribir
      // a mano. Si no esta activo, se respeta el valor manual guardado en meta.
      const config: any = await getConfig(auth.empresaId).catch(() => null);
      const cobraServicio = !!config?.cobra_servicio_10pct;
      const pctServicio   = Number(config?.porcentaje_servicio ?? 10);
      const propina = cobraServicio
        ? Math.round(subtotalTotal * pctServicio / 100 * 100) / 100
        : Number(meta.propina || 0);
      const saldoPendiente = Math.max(0, totalTotal - descuento + propina - pagado);

      return c.json({
        mesa: { ...mesa, id: mesa.codigo || mesa.id },
        ordenes: ventas || [],
        items: todosItems,
        resumen: {
          subtotal: Math.round(subtotalTotal*100)/100,
          iva:      Math.round(ivaTotal*100)/100,
          total:    Math.round(totalTotal*100)/100,
          descuento, propina,
          servicio_10pct_automatico: cobraServicio,
          porcentaje_servicio: pctServicio,
          pagado:   Math.round(pagado*100)/100,
          saldo_pendiente: Math.round(saldoPendiente*100)/100,
          items_count: todosItems.length,
          ordenes_count: (ventas||[]).length,
        },
        pagos_parciales,
      });
    } catch (err: any) { return c.json({ error: 'Error', detalle: err.message }, 500); }
  });

  // POST /mesas/:id/descuento — Aplica descuento y/o propina
  app.post('/server/mesas/:id/descuento', authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    const codigo = c.req.param('id');
    try {
      const { descuento = 0, descuento_pct = 0, propina = 0, propina_pct = 0, total_base } = await c.req.json();
      const { data: mesa } = await db.from('mesas').select('metadata')
        .eq('empresa_id', auth.empresaId).eq('codigo', codigo).maybeSingle();
      const meta = typeof mesa?.metadata === 'string' ? JSON.parse(mesa?.metadata||'{}') : (mesa?.metadata||{});
      const desc = descuento_pct > 0 ? Math.round(Number(total_base) * descuento_pct / 100 * 100) / 100 : Number(descuento);
      const prop = propina_pct > 0 ? Math.round(Number(total_base) * propina_pct / 100 * 100) / 100 : Number(propina);
      await db.from('mesas').update({ metadata: { ...meta, descuento: desc, propina: prop }, updated_at: new Date().toISOString() })
        .eq('empresa_id', auth.empresaId).eq('codigo', codigo);
      return c.json({ ok: true, descuento: desc, propina: prop });
    } catch (err: any) { return c.json({ error: 'Error', detalle: err.message }, 500); }
  });

  // POST /mesas/:id/pago-parcial — Registra un pago parcial
  app.post('/server/mesas/:id/pago-parcial', authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    const codigo = c.req.param('id');
    try {
      const { monto, metodo = 'efectivo', nombre = '', notas = '' } = await c.req.json();
      const { data: mesa } = await db.from('mesas').select('metadata,consumo_acumulado')
        .eq('empresa_id', auth.empresaId).eq('codigo', codigo).maybeSingle();
      const meta = typeof mesa?.metadata === 'string' ? JSON.parse(mesa?.metadata||'{}') : (mesa?.metadata||{});
      const pagos = [...(meta.pagos_parciales || []), { monto: Number(monto), metodo, nombre, notas, hora: new Date().toISOString(), id: crypto.randomUUID() }];
      await db.from('mesas').update({ metadata: { ...meta, pagos_parciales: pagos }, updated_at: new Date().toISOString() })
        .eq('empresa_id', auth.empresaId).eq('codigo', codigo);
      return c.json({ ok: true, pagos_parciales: pagos, total_pagado: pagos.reduce((s: number, p: any) => s + Number(p.monto), 0) });
    } catch (err: any) { return c.json({ error: 'Error', detalle: err.message }, 500); }
  });

  // POST /mesas/:id/nota — Actualiza nota especial de la mesa
  app.post('/server/mesas/:id/nota', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const codigo = c.req.param('id');
    try {
      const { nota } = await c.req.json();
      const mesa = await updateMesa(auth.empresaId, codigo, { nota });
      return c.json({ ok: true, mesa });
    } catch (err: any) { return c.json({ error: 'Error', detalle: err.message }, 500); }
  });

  // POST /mesas/unir — Une dos mesas (transfiere consumo de origen a destino)
  app.post('/server/mesas/unir', authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { mesa_origen_id, mesa_destino_id } = await c.req.json();
      const [{ data: origen }, { data: destino }] = await Promise.all([
        db.from('mesas').select('*').eq('empresa_id', auth.empresaId).eq('codigo', mesa_origen_id).maybeSingle(),
        db.from('mesas').select('*').eq('empresa_id', auth.empresaId).eq('codigo', mesa_destino_id).maybeSingle(),
      ]);
      if (!origen || !destino) return c.json({ error: 'Mesa no encontrada' }, 404);
      const nuevoConsumo = Number(destino.consumo_acumulado||0) + Number(origen.consumo_acumulado||0);
      const metaDest = typeof destino.metadata === 'string' ? JSON.parse(destino.metadata||'{}') : (destino.metadata||{});
      const metaOrig = typeof origen.metadata === 'string' ? JSON.parse(origen.metadata||'{}') : (origen.metadata||{});
      const pagosDest = [...(metaDest.pagos_parciales||[]), ...(metaOrig.pagos_parciales||[])];
      await Promise.all([
        db.from('mesas').update({ consumo_acumulado: nuevoConsumo, metadata: { ...metaDest, pagos_parciales: pagosDest, mesas_unidas: [...(metaDest.mesas_unidas||[]), origen.numero] }, updated_at: new Date().toISOString() })
          .eq('empresa_id', auth.empresaId).eq('codigo', mesa_destino_id),
        db.from('mesas').update({ estado: 'libre', consumo_acumulado: 0, hora_ocupacion: null, personas: 0, nota: `Unida a Mesa ${destino.numero}`, metadata: {}, updated_at: new Date().toISOString() })
          .eq('empresa_id', auth.empresaId).eq('codigo', mesa_origen_id),
      ]);
      return c.json({ ok: true, mensaje: `Mesa ${origen.numero} unida a Mesa ${destino.numero}`, nuevo_consumo: nuevoConsumo });
    } catch (err: any) { return c.json({ error: 'Error', detalle: err.message }, 500); }
  });

  // GET /mesas/estadisticas — Estadísticas de rotación del día
  app.get('/server/mesas/estadisticas', authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const OFFSET_EC = 5 * 3600 * 1000;
      const hoyEC = new Date(Date.now() - OFFSET_EC).toISOString().split('T')[0];
      const { data: ventas } = await db.from('ventas')
        .select('mesa,total,created_at').eq('empresa_id', auth.empresaId)
        .eq('anulada', false).gte('created_at', `${hoyEC}T05:00:00Z`);
      const porMesa: Record<string, any> = {};
      for (const v of (ventas||[])) {
        if (!v.mesa) continue;
        const k = String(v.mesa);
        if (!porMesa[k]) porMesa[k] = { mesa: k, ventas: 0, total: 0 };
        porMesa[k].ventas++;
        porMesa[k].total += Number(v.total||0);
      }
      const ranking = Object.values(porMesa).sort((a: any, b: any) => b.total - a.total);
      return c.json({ estadisticas: ranking, total_hoy: (ventas||[]).reduce((s: any, v: any) => s + Number(v.total||0), 0) });
    } catch (err: any) { return c.json({ error: 'Error', detalle: err.message }, 500); }
  });

  // ══════════════════════════════════════════════════════════════════════
  // LISTA DE ESPERA
  // ══════════════════════════════════════════════════════════════════════

  app.get('/server/mesas/lista-espera', authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { data } = await db.from('lista_espera_mesas')
        .select('*').eq('empresa_id', auth.empresaId).eq('estado', 'esperando')
        .order('hora_entrada');
      return c.json({ lista: data || [] });
    } catch (err: any) { return c.json({ error: 'Error', detalle: err.message }, 500); }
  });

  app.post('/server/mesas/lista-espera', authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const body = await c.req.json();
      const { data, error } = await db.from('lista_espera_mesas').insert({
        empresa_id: auth.empresaId, nombre: body.nombre, personas: Number(body.personas)||1,
        telefono: body.telefono||null, nota: body.nota||null,
      }).select().single();
      if (error) throw error;
      return c.json({ ok: true, entrada: data }, 201);
    } catch (err: any) { return c.json({ error: 'Error', detalle: err.message }, 500); }
  });

  app.put('/server/mesas/lista-espera/:id', authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { estado } = await c.req.json();
      await db.from('lista_espera_mesas').update({ estado })
        .eq('id', c.req.param('id')).eq('empresa_id', auth.empresaId);
      return c.json({ ok: true });
    } catch (err: any) { return c.json({ error: 'Error', detalle: err.message }, 500); }
  });
}
