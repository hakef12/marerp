/**
 * kv-helpers.tsx — Capa de acceso a datos
 *
 * Estrategia de migración segura (dual-read):
 *   LEER  → SQL primero; si está vacío, cae a KV (datos pre-migración)
 *   ESCRIBIR → SQL únicamente (los nuevos registros siempre van a SQL)
 *
 * Una vez ejecutado el endpoint POST /server/admin/migrar-datos,
 * todos los datos históricos están en SQL y el KV queda como backup.
 */

import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";

// ── Cliente SQL ────────────────────────────────────────────────────────────────
const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

/** Lee de SQL; si no hay datos, cae a KV (compatibilidad pre-migración) */
async function sqlConFallback<T>(
  sqlFn: () => Promise<T[]>,
  kvKey: string
): Promise<T[]> {
  try {
    const rows = await sqlFn();
    if (rows && rows.length > 0) return rows;
    // SQL vacío → intentar KV
    const kvData = await kv.get(kvKey);
    return (kvData as T[]) || [];
  } catch (e: any) {
    console.error(`[DB] Error SQL, fallback KV (${kvKey}):`, e?.message);
    return (await kv.get(kvKey) as T[]) || [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZACIÓN / LIMPIEZA
// ─────────────────────────────────────────────────────────────────────────────

export async function inicializarDatosDemo(_empresaId: string) {
  console.log('✅ Sistema sin datos demo');
}

export async function cargarDatosDemo(_empresaId: string) {
  return { success: false, message: 'Carga de datos demo deshabilitada.' };
}

export async function limpiarTodosLosDatos(empresaId: string) {
  const db = getDB();
  const tablas = [
    'ventas', 'comandas', 'movimientos_inventario', 'mermas',
    'ordenes_produccion', 'compras', 'cuentas_por_pagar',
    'asientos_contables', 'cuentas_contables', 'presupuestos',
    'recetas', 'clientes', 'proveedores', 'empleados',
    'stock_bodegas_sql', 'productos', 'categorias',
  ];
  for (const tabla of tablas) {
    await db.from(tabla).delete().eq('empresa_id', empresaId);
  }
  // También limpiar KV heredado
  const kvKeys = [
    'productos','categorias','recetas','ventas','comandas','clientes',
    'proveedores','empleados','compras','cxp','bodegas','movimientos',
    'ordenes_produccion','cuentas_contables','asientos_contables',
  ];
  for (const k of kvKeys) await kv.del(`empresa_${empresaId}_${k}`);
  await kv.del(`stock_bodegas_${empresaId}`);
  return { success: true, message: 'Todos los datos eliminados' };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTOS
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerProductos(empresaId: string) {
  const productos = await sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('productos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_productos`
  );
  // Normalizar campos de precio para compatibilidad KV ↔ SQL
  // KV usa: precio_venta, precio_compra, unidad_medida, categoria_id
  // SQL usa: precio, precio_costo, unidad, categoria
  return (productos || []).map((p: any) => ({
    ...p,
    precio_venta:   Number(p.precio_venta   || p.precio       || 0),
    precio:         Number(p.precio         || p.precio_venta || 0),
    // precio_compra es el campo KV equivalente a precio_costo/costo_unitario
    precio_costo:   Number(p.precio_costo   || p.precio_compra || p.costo_unitario || 0),
    costo_unitario: Number(p.costo_unitario || p.precio_costo  || p.precio_compra  || 0),
    precio_compra:  Number(p.precio_compra  || p.precio_costo  || p.costo_unitario || 0),
    stock_actual:   Number(p.stock_actual   ?? p.stock ?? 0),
    // Normalizar unidad
    unidad:         p.unidad || p.unidad_medida || 'und',
    unidad_medida:  p.unidad_medida || p.unidad || 'und',
    // Normalizar categoria
    categoria:      p.categoria || p.categoria_id || null,
    categoria_id:   p.categoria_id || p.categoria || null,
  }));
}

export async function guardarProducto(empresaId: string, producto: any) {
  const db = getDB();
  if (!producto.id) producto.id = crypto.randomUUID();
  const { created_at, ...rest } = producto;
  const { data, error } = await db.from('productos')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

export async function eliminarProducto(empresaId: string, productoId: string) {
  const db = getDB();
  const { error } = await db.from('productos')
    .delete().eq('id', productoId).eq('empresa_id', empresaId);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORÍAS
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerCategorias(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('categorias')
        .select('*').eq('empresa_id', empresaId).order('nombre');
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_categorias`
  );
}

export async function guardarCategoria(empresaId: string, categoria: any) {
  const db = getDB();
  if (!categoria.id) categoria.id = crypto.randomUUID();
  const { created_at, ...rest } = categoria;
  const { data, error } = await db.from('categorias')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

export async function eliminarCategoria(empresaId: string, categoriaId: string) {
  const db = getDB();
  await db.from('categorias').delete().eq('id', categoriaId).eq('empresa_id', empresaId);
}

// ─────────────────────────────────────────────────────────────────────────────
// RECETAS
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerRecetas(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('recetas')
        .select('*').eq('empresa_id', empresaId);
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_recetas`
  );
}

export async function guardarReceta(empresaId: string, receta: any) {
  const db = getDB();
  if (!receta.id) receta.id = crypto.randomUUID();
  const { created_at, ...rest } = receta;
  const { data, error } = await db.from('recetas')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

export async function eliminarReceta(empresaId: string, recetaId: string) {
  const db = getDB();
  await db.from('recetas').delete().eq('id', recetaId).eq('empresa_id', empresaId);
}

// ─────────────────────────────────────────────────────────────────────────────
// VENTAS
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerVentas(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('ventas')
        .select('*').eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_ventas`
  );
}

export async function guardarVenta(empresaId: string, venta: any) {
  const db = getDB();
  if (!venta.id) venta.id = crypto.randomUUID();
  const { data, error } = await db.from('ventas')
    .insert({ ...venta, empresa_id: empresaId, created_at: venta.created_at || new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDAS
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerComandas(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('comandas')
        .select('*').eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_comandas`
  );
}

export async function guardarComanda(empresaId: string, comanda: any) {
  const db = getDB();
  if (!comanda.id) comanda.id = crypto.randomUUID();
  const { created_at, ...rest } = comanda;
  const { data, error } = await db.from('comandas')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

export async function actualizarComanda(empresaId: string, comandaId: string, cambios: any) {
  const db = getDB();
  const { data, error } = await db.from('comandas')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', comandaId).eq('empresa_id', empresaId)
    .select().single();
  if (error) throw error;
  return data;
}

export async function eliminarComanda(empresaId: string, comandaId: string) {
  const db = getDB();
  await db.from('comandas').delete().eq('id', comandaId).eq('empresa_id', empresaId);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerClientes(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('clientes')
        .select('*').eq('empresa_id', empresaId).order('nombre');
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_clientes`
  );
}

export async function guardarCliente(empresaId: string, cliente: any) {
  const db = getDB();
  if (!cliente.id) cliente.id = crypto.randomUUID();
  const { created_at, ...rest } = cliente;
  const { data, error } = await db.from('clientes')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

export async function eliminarCliente(empresaId: string, clienteId: string) {
  const db = getDB();
  await db.from('clientes').delete().eq('id', clienteId).eq('empresa_id', empresaId);
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVEEDORES
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerProveedores(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('proveedores')
        .select('*').eq('empresa_id', empresaId).order('nombre');
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_proveedores`
  );
}

export async function guardarProveedor(empresaId: string, proveedor: any) {
  const db = getDB();
  if (!proveedor.id) proveedor.id = crypto.randomUUID();
  const { created_at, ...rest } = proveedor;
  const { data, error } = await db.from('proveedores')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

export async function eliminarProveedor(empresaId: string, proveedorId: string) {
  const db = getDB();
  await db.from('proveedores').delete().eq('id', proveedorId).eq('empresa_id', empresaId);
}

// ─────────────────────────────────────────────────────────────────────────────
// BODEGAS  (ya existe tabla SQL — no se usa KV)
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerBodegas(empresaId: string) {
  const db = getDB();
  const { data, error } = await db.from('bodegas')
    .select('*').eq('empresa_id', empresaId).order('nombre');
  if (error) throw error;
  return data || [];
}

export async function guardarBodega(empresaId: string, bodega: any) {
  const db = getDB();
  if (!bodega.id) bodega.id = crypto.randomUUID();
  const { created_at, ...rest } = bodega;
  const { data, error } = await db.from('bodegas')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

export async function eliminarBodega(empresaId: string, bodegaId: string) {
  const db = getDB();
  await db.from('bodegas').delete().eq('id', bodegaId).eq('empresa_id', empresaId);
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVIMIENTOS DE INVENTARIO
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerMovimientos(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('movimientos_inventario')
        .select('*').eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_movimientos`
  );
}

export async function guardarMovimiento(empresaId: string, movimiento: any) {
  const db = getDB();
  if (!movimiento.id) movimiento.id = crypto.randomUUID();
  const mov = { ...movimiento, empresa_id: empresaId, created_at: new Date().toISOString() };
  const { data, error } = await db.from('movimientos_inventario').insert(mov).select().single();
  if (error) throw error;

  // Actualizar stock_actual en productos
  if (movimiento.producto_id || movimiento.producto_nombre) {
    const productos = await obtenerProductos(empresaId);
    const idx = movimiento.producto_id
      ? productos.findIndex((p: any) => p.id === movimiento.producto_id)
      : productos.findIndex((p: any) =>
          (p.nombre || '').toLowerCase() === (movimiento.producto_nombre || '').toLowerCase()
        );
    if (idx >= 0) {
      const stockActual = Number(productos[idx].stock_actual) || 0;
      const cantidad = Number(movimiento.cantidad) || 0;
      let nuevoStock = stockActual;
      if (movimiento.tipo === 'entrada') nuevoStock = stockActual + cantidad;
      else if (movimiento.tipo === 'salida') nuevoStock = Math.max(0, stockActual - cantidad);
      else if (movimiento.tipo === 'ajuste') nuevoStock = cantidad;
      await db.from('productos')
        .update({ stock_actual: nuevoStock, stock: nuevoStock, updated_at: new Date().toISOString() })
        .eq('id', productos[idx].id).eq('empresa_id', empresaId);
    }
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLEADOS
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerEmpleados(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('empleados')
        .select('*').eq('empresa_id', empresaId).order('nombre');
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_empleados`
  );
}

export async function guardarEmpleado(empresaId: string, empleadoData: any) {
  const db = getDB();
  if (!empleadoData.id) empleadoData.id = crypto.randomUUID();
  const { created_at, ...rest } = empleadoData;
  const { data, error } = await db.from('empleados')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

export async function eliminarEmpleado(empresaId: string, empleadoId: string) {
  const db = getDB();
  await db.from('empleados').delete().eq('id', empleadoId).eq('empresa_id', empresaId);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CUENTAS CONTABLES
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerCuentas(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('cuentas_contables')
        .select('*').eq('empresa_id', empresaId).order('codigo');
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_cuentas_contables`
  );
}

export async function guardarCuenta(empresaId: string, cuenta: any) {
  const db = getDB();
  if (!cuenta.id) cuenta.id = crypto.randomUUID();
  const { created_at, ...rest } = cuenta;
  const { data, error } = await db.from('cuentas_contables')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

export async function eliminarCuenta(empresaId: string, cuentaId: string) {
  const db = getDB();
  await db.from('cuentas_contables').delete().eq('id', cuentaId).eq('empresa_id', empresaId);
}

// ─────────────────────────────────────────────────────────────────────────────
// ASIENTOS CONTABLES
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerAsientos(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('asientos_contables')
        .select('*').eq('empresa_id', empresaId)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_asientos_contables`
  );
}

export async function guardarAsiento(empresaId: string, asiento: any) {
  const db = getDB();
  if (!asiento.id) asiento.id = crypto.randomUUID();
  // Generar número secuencial si no tiene
  if (!asiento.numero) {
    const year = new Date().getFullYear();
    const { count } = await getDB().from('asientos_contables')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .like('numero', `ASI-${year}%`);
    asiento.numero = `ASI-${year}-${String((count || 0) + 1).padStart(4, '0')}`;
  }
  const { created_at, ...rest } = asiento;
  const { data, error } = await db.from('asientos_contables')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// ASIENTO AUTOMÁTICO (usado desde otros módulos)
// ─────────────────────────────────────────────────────────────────────────────

export async function registrarAsientoAutomatico(
  empresaId: string,
  opciones: {
    tipo: string;
    descripcion: string;
    referencia?: string;
    fecha?: string;
    items: Array<{ codigo: string; debito?: number; credito?: number; descripcion?: string }>;
  }
): Promise<void> {
  try {
    const cuentas: any[] = await obtenerCuentas(empresaId);
    if (cuentas.length === 0) return;

    const itemsResueltos = opciones.items
      .map(item => {
        const cuenta = cuentas.find((c: any) => c.codigo === item.codigo && !c.es_grupo);
        if (!cuenta) return null;
        return {
          cuenta_id: cuenta.id,
          cuenta_codigo: cuenta.codigo,
          cuenta_nombre: cuenta.nombre,
          debito: item.debito ?? 0,
          credito: item.credito ?? 0,
          descripcion: item.descripcion ?? opciones.descripcion,
        };
      })
      .filter(Boolean);

    if (itemsResueltos.length === 0) return;

    const totalD = itemsResueltos.reduce((s, i) => s + (i!.debito || 0), 0);
    const totalC = itemsResueltos.reduce((s, i) => s + (i!.credito || 0), 0);
    if (Math.abs(totalD - totalC) > 0.01) return;

    await guardarAsiento(empresaId, {
      tipo: opciones.tipo,
      descripcion: opciones.descripcion,
      referencia: opciones.referencia ?? '',
      fecha: opciones.fecha ?? new Date().toISOString().split('T')[0],
      estado: 'activo',
      origen_automatico: true,
      items: itemsResueltos,
      total_debito: totalD,
      total_credito: totalC,
    });
  } catch (err: any) {
    console.error(`[Contabilidad] Error asiento automático (${opciones.tipo}):`, err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESUPUESTOS
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerPresupuesto(empresaId: string, anio: number) {
  try {
    const db = getDB();
    const { data } = await db.from('presupuestos')
      .select('items').eq('empresa_id', empresaId).eq('anio', anio).maybeSingle();
    if (data?.items?.length > 0) return data.items;
    // fallback KV
    return (await kv.get(`empresa_${empresaId}_presupuesto_${anio}`)) || [];
  } catch {
    return (await kv.get(`empresa_${empresaId}_presupuesto_${anio}`)) || [];
  }
}

export async function guardarPresupuesto(empresaId: string, anio: number, items: any[]) {
  const db = getDB();
  await db.from('presupuestos')
    .upsert({ empresa_id: empresaId, anio, items, updated_at: new Date().toISOString() });
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPRAS
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerCompras(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('compras')
        .select('*').eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_compras`
  );
}

export async function guardarCompra(empresaId: string, compra: any) {
  const db = getDB();
  if (!compra.id) compra.id = crypto.randomUUID();
  const nuevaCompra = { ...compra, empresa_id: empresaId, created_at: new Date().toISOString() };
  const { data, error } = await db.from('compras').insert(nuevaCompra).select().single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUENTAS POR PAGAR
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerCuentasPorPagar(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('cuentas_por_pagar')
        .select('*').eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_cxp`
  );
}

export async function guardarCuentaPorPagar(empresaId: string, cxp: any) {
  const db = getDB();
  if (!cxp.id) cxp.id = crypto.randomUUID();
  const { created_at, ...rest } = cxp;
  const { data, error } = await db.from('cuentas_por_pagar')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

export async function marcarCxPPagada(empresaId: string, cxpId: string, montoPagado: number) {
  const db = getDB();
  const { data: item } = await db.from('cuentas_por_pagar')
    .select('*').eq('id', cxpId).eq('empresa_id', empresaId).single();
  if (!item) return null;
  const nuevoSaldo = Math.max(0, (item.saldo_pendiente ?? item.monto) - montoPagado);
  const { data, error } = await db.from('cuentas_por_pagar')
    .update({
      monto_pagado: (item.monto_pagado || 0) + montoPagado,
      saldo_pendiente: nuevoSaldo,
      estado: nuevoSaldo <= 0.01 ? 'pagada' : 'parcial',
      updated_at: new Date().toISOString(),
    })
    .eq('id', cxpId).eq('empresa_id', empresaId)
    .select().single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// STOCK POR BODEGA
// ─────────────────────────────────────────────────────────────────────────────

export async function getStockBodegas(empresaId: string): Promise<Record<string, Record<string, number>>> {
  try {
    const db = getDB();
    const { data } = await db.from('stock_bodegas_sql')
      .select('bodega_id, producto_nombre, cantidad')
      .eq('empresa_id', empresaId);
    if (data && data.length > 0) {
      const result: Record<string, Record<string, number>> = {};
      for (const row of data) {
        if (!result[row.bodega_id]) result[row.bodega_id] = {};
        result[row.bodega_id][row.producto_nombre] = row.cantidad;
      }
      return result;
    }
    // fallback KV
    return (await kv.get(`stock_bodegas_${empresaId}`)) || {};
  } catch {
    return (await kv.get(`stock_bodegas_${empresaId}`)) || {};
  }
}

export async function getStockBodega(empresaId: string, bodegaId: string): Promise<Record<string, number>> {
  const all = await getStockBodegas(empresaId);
  return all[bodegaId] || {};
}

export async function ajustarStockBodega(
  empresaId: string, bodegaId: string, productoNombre: string, delta: number
): Promise<void> {
  const db = getDB();
  // Leer stock actual
  const { data } = await db.from('stock_bodegas_sql')
    .select('cantidad')
    .eq('bodega_id', bodegaId)
    .eq('producto_nombre', productoNombre)
    .maybeSingle();
  const cantidadActual = data?.cantidad || 0;
  const nuevaCantidad = Math.max(0, cantidadActual + delta);
  await db.from('stock_bodegas_sql').upsert({
    empresa_id: empresaId,
    bodega_id: bodegaId,
    producto_nombre: productoNombre,
    cantidad: nuevaCantidad,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'bodega_id,producto_nombre' });
}

export async function transferirStockBodega(
  empresaId: string, bodegaOrigenId: string, bodegaDestinoId: string,
  productoNombre: string, cantidad: number
): Promise<{ ok: boolean; error?: string; stockOrigen: number }> {
  const db = getDB();
  const { data: origen } = await db.from('stock_bodegas_sql')
    .select('cantidad').eq('bodega_id', bodegaOrigenId).eq('producto_nombre', productoNombre).maybeSingle();
  const stockOrigen = origen?.cantidad || 0;
  if (stockOrigen < cantidad) {
    return { ok: false, error: `Stock insuficiente. Disponible: ${stockOrigen}`, stockOrigen };
  }
  await ajustarStockBodega(empresaId, bodegaOrigenId, productoNombre, -cantidad);
  await ajustarStockBodega(empresaId, bodegaDestinoId, productoNombre, cantidad);
  return { ok: true, stockOrigen };
}

// ─────────────────────────────────────────────────────────────────────────────
// MERMAS
// ─────────────────────────────────────────────────────────────────────────────

export async function getMermas(empresaId: string): Promise<any[]> {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('mermas')
        .select('*').eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    `mermas_${empresaId}`
  );
}

export async function guardarMerma(empresaId: string, merma: any): Promise<any> {
  const db = getDB();
  if (!merma.id) merma.id = crypto.randomUUID();
  const { data, error } = await db.from('mermas')
    .insert({ ...merma, empresa_id: empresaId, created_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// SINCRONIZAR STOCK PRODUCTO (usado desde produccion/transferencias)
// ─────────────────────────────────────────────────────────────────────────────

export async function sincronizarStockProductoReal(
  empresaId: string,
  productoNombreOId: string,
  delta: number,
  esId = false
): Promise<void> {
  const db = getDB();
  let query = db.from('productos').select('id, stock_actual').eq('empresa_id', empresaId);
  if (esId) {
    query = query.eq('id', productoNombreOId);
  } else {
    // Intentar por ID primero
    const { data: byId } = await db.from('productos').select('id, stock_actual')
      .eq('empresa_id', empresaId).eq('id', productoNombreOId).maybeSingle();
    if (byId) {
      const nuevo = Math.max(0, (byId.stock_actual || 0) + delta);
      await db.from('productos').update({ stock_actual: nuevo, stock: nuevo, updated_at: new Date().toISOString() })
        .eq('id', byId.id).eq('empresa_id', empresaId);
      return;
    }
    // Buscar por nombre
    const { data: byNombre } = await db.from('productos').select('id, stock_actual')
      .eq('empresa_id', empresaId).ilike('nombre', productoNombreOId).maybeSingle();
    if (byNombre) {
      const nuevo = Math.max(0, (byNombre.stock_actual || 0) + delta);
      await db.from('productos').update({ stock_actual: nuevo, stock: nuevo, updated_at: new Date().toISOString() })
        .eq('id', byNombre.id).eq('empresa_id', empresaId);
    }
    return;
  }
  const { data } = await query.maybeSingle();
  if (!data) return;
  const nuevo = Math.max(0, (data.stock_actual || 0) + delta);
  await db.from('productos').update({ stock_actual: nuevo, stock: nuevo, updated_at: new Date().toISOString() })
    .eq('id', data.id).eq('empresa_id', empresaId);
}

// ─────────────────────────────────────────────────────────────────────────────
// ÓRDENES DE PRODUCCIÓN
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerOrdenesProduccion(empresaId: string) {
  return sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('ordenes_produccion')
        .select('*').eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_ordenes_produccion`
  );
}

export async function guardarOrdenProduccion(empresaId: string, orden: any) {
  const db = getDB();
  if (!orden.id) orden.id = crypto.randomUUID();
  const { created_at, ...rest } = orden;
  const { data, error } = await db.from('ordenes_produccion')
    .upsert({ ...rest, empresa_id: empresaId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}
