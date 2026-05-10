import { Hono } from 'npm:hono@4';
import { obtenerProductos, obtenerComandas } from './kv-helpers.tsx';
import { getByPrefixWithKeys } from './kv_store.tsx';

const app = new Hono();

// ─── GET /notificaciones ──────────────────────────────────────────
// Genera notificaciones reales a partir del estado actual del sistema:
//   - Stock bajo: productos con stock_actual < stock_minimo
//   - Comandas lentas: comandas activas con más de 20 min sin completar
//   - Facturas pendientes: facturas con estado PENDIENTE
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
    for (const c of comandas) {
      if (c.estado === 'completada' || c.estado === 'cancelada') continue;
      const creada = new Date(c.created_at ?? c.fecha ?? 0).getTime();
      const minutos = Math.floor((ahora - creada) / 60000);
      if (minutos >= 20) {
        const mesa = c.mesa ? `Mesa ${c.mesa}` : (c.tipo_servicio === 'llevar' ? 'Para llevar' : 'Comanda');
        notifs.push({
          id:    `comanda-${c.id}`,
          title: `${mesa} lleva ${minutos} min`,
          time:  `hace ${minutos} min`,
          type:  'comanda',
          route: '/cocina',
          meta:  { mesa: c.mesa, minutos },
        });
      }
    }
  } catch { /* si falla no bloquea las demás */ }

  // ── 3. Facturas pendientes de autorización ────────────────────
  try {
    const prefix  = `empresa:${empresaId}:factura:`;
    const entries = await getByPrefixWithKeys(prefix);
    for (const [key, factura] of entries) {
      const estado = factura.estado ?? factura.estado_autorizacion ?? '';
      if (estado === 'PENDIENTE' || estado === 'pendiente') {
        const id  = key.replace(prefix, '');
        const num = factura.numero_factura ?? factura.numero_autorizacion ?? id;
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
    }
  } catch { /* si falla no bloquea las demás */ }

  return c.json({ notificaciones: notifs });
});

export default app;
