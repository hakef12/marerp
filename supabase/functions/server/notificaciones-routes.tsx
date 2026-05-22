import { Hono } from 'npm:hono@4';
import { createClient } from "npm:@supabase/supabase-js";
import { obtenerProductos, obtenerComandas } from './kv-helpers.tsx';

const app = new Hono();

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ─── GET /notificaciones ──────────────────────────────────────────
// Genera notificaciones reales a partir del estado actual del sistema:
//   - Stock bajo: productos con stock_actual < stock_minimo
//   - Comandas lentas: comandas activas con más de 20 min sin completar
//   - Facturas pendientes: facturas con estado PENDIENTE (SQL)
// ─────────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const empresaId: string = (c as any).get('empresaId');
  const notifs: any[] = [];

  // ── 1. Stock bajo ──────────────────────────────────────────────
  try {
    const productos = await obtenerProductos(empresaId);
    for (const p of productos) {
      const actual  = Number(p.stock_actual ?? p.stock ?? 0);
      const minimo  = Number(p.stock_minimo ?? p.stock_min ?? 0);
      if (minimo > 0 && actual <= minimo) {
        notifs.push({
          id:    `stock-${p.id ?? p.nombre}`,
          title: `Stock bajo en ${p.nombre}`,
          time:  'ahora',
          type:  'stock',
          route: '/inventario',
          meta:  { actual, minimo },
        });
      }
    }
  } catch { /* si falla no bloquea las demás */ }

  // ── 2. Comandas lentas (> 20 min activas) ─────────────────────
  try {
    const comandas = await obtenerComandas(empresaId);
    const ahora = Date.now();
    for (const com of comandas) {
      if (com.estado === 'completada' || com.estado === 'cancelada') continue;
      const creada = new Date(com.created_at ?? com.fecha ?? 0).getTime();
      const minutos = Math.floor((ahora - creada) / 60000);
      if (minutos >= 20) {
        const mesa = com.mesa ? `Mesa ${com.mesa}` : (com.tipo_servicio === 'llevar' ? 'Para llevar' : 'Comanda');
        notifs.push({
          id:    `comanda-${com.id}`,
          title: `${mesa} lleva ${minutos} min`,
          time:  `hace ${minutos} min`,
          type:  'comanda',
          route: '/cocina',
          meta:  { mesa: com.mesa, minutos },
        });
      }
    }
  } catch { /* si falla no bloquea las demás */ }

  // ── 3. Facturas pendientes de autorización (SQL) ───────────────
  try {
    const { data: facturasPendientes } = await getDB().from('facturas')
      .select('factura_key, numero_factura, estado, fecha_emision, created_at')
      .eq('empresa_id', empresaId)
      .in('estado', ['PENDIENTE', 'pendiente'])
      .order('created_at', { ascending: false })
      .limit(10);

    for (const factura of (facturasPendientes || [])) {
      const id = factura.factura_key || factura.numero_factura;
      const num = factura.numero_factura ?? id;
      const creada = new Date(factura.fecha_emision ?? factura.created_at ?? 0);
      const minutos = Math.floor((Date.now() - creada.getTime()) / 60000);
      const timeLabel = minutos < 60
        ? `hace ${minutos} min`
        : minutos < 1440
        ? `hace ${Math.floor(minutos / 60)}h`
        : `hace ${Math.floor(minutos / 1440)}d`;
      notifs.push({
        id:    `factura-${id}`,
        title: `Factura #${num} pendiente de autorización`,
        time:  timeLabel,
        type:  'factura',
        route: '/facturacion/consulta',
      });
    }
  } catch { /* si falla no bloquea las demás */ }

  return c.json({ notificaciones: notifs });
});

export default app;
