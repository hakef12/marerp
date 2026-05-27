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

// ── Utilidad: validar UUID ─────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v: any): boolean => typeof v === 'string' && UUID_RE.test(v);

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
    costo_unitario: Number(p.costo_unitario || p.precio_compra || p.precio_costo   || 0),
    precio_compra:  Number(p.precio_compra  || p.precio_costo  || p.costo_unitario || 0),
    stock_actual:   Number(p.stock_actual   ?? p.stock ?? 0),
    stock_minimo:   Number(p.stock_minimo   ?? 0),
    stock_maximo:   Number(p.stock_maximo   ?? 0),
    // Normalizar unidad
    unidad:         p.unidad || p.unidad_medida || 'und',
    unidad_medida:  p.unidad_medida || p.unidad || 'und',
    // Normalizar categoria
    categoria:      p.categoria || p.categoria_id || null,
    categoria_id:   p.categoria_id || p.categoria || null,
    // Normalizar booleanos nuevos
    disponible:     p.disponible !== false,
    gestiona_inventario: p.gestiona_inventario !== false,
    es_receta:      p.es_receta  === true,
    impuesto_incluido: p.impuesto_incluido === true,
    porcentaje_iva: Number(p.porcentaje_iva ?? 15),
  }));
}

export async function guardarProducto(empresaId: string, producto: any) {
  const db = getDB();
  if (!producto.id) producto.id = crypto.randomUUID();

  // Construir objeto con solo columnas reales de la tabla productos.
  // Los campos normalizados (precio_compra, unidad_medida como alias, categoria como texto)
  // NO se pasan directamente — solo los campos UUID reales se validan con isUUID().
  const safeProducto: Record<string, any> = {
    id:              producto.id,
    empresa_id:      empresaId,
    nombre:          producto.nombre          ?? null,
    codigo:          producto.codigo          ?? null,
    codigo_barras:   producto.codigo_barras   ?? null,
    descripcion:     producto.descripcion     ?? null,
    // categoria_id y proveedor_id son UUID — solo pasar si son UUID válidos
    categoria_id:    isUUID(producto.categoria_id)  ? producto.categoria_id  : null,
    proveedor_id:    isUUID(producto.proveedor_id)  ? producto.proveedor_id  : null,
    proveedor_nombre: producto.proveedor_nombre     ?? null,
    unidad_medida:   producto.unidad_medida   ?? producto.unidad ?? null,
    unidad:          producto.unidad          ?? producto.unidad_medida ?? null,
    precio_venta:    producto.precio_venta    ?? producto.precio ?? 0,
    precio:          producto.precio          ?? producto.precio_venta ?? 0,
    // precio_compra del formulario → precio_costo en DB (alias del mismo campo)
    precio_costo:    producto.precio_costo    ?? producto.precio_compra ?? producto.costo_unitario ?? 0,
    costo_unitario:  producto.costo_unitario  ?? producto.precio_compra ?? producto.precio_costo  ?? 0,
    // precio_compra como columna directa (añadida por migración 008)
    precio_compra:   producto.precio_compra   ?? producto.precio_costo  ?? producto.costo_unitario ?? 0,
    stock_actual:    producto.stock_actual    ?? producto.stock ?? 0,
    stock:           producto.stock           ?? producto.stock_actual ?? 0,
    stock_minimo:    producto.stock_minimo    ?? 0,
    stock_maximo:    producto.stock_maximo    ?? 0,
    punto_pedido:    producto.punto_pedido    ?? 0,
    consumo_promedio_diario: producto.consumo_promedio_diario ?? 0,
    lead_time_dias:  producto.lead_time_dias  ?? 0,
    activo:          producto.activo          ?? true,
    disponible:      producto.disponible      ?? true,
    tiene_iva:       producto.tiene_iva       ?? false,
    es_compuesto:    producto.es_compuesto    ?? false,
    // Campos de migración 008
    gestiona_inventario: producto.gestiona_inventario ?? true,
    es_receta:       producto.es_receta       ?? false,
    impuesto_incluido: producto.impuesto_incluido ?? false,
    porcentaje_iva:  producto.porcentaje_iva  ?? 15,
    tipo:            producto.tipo            ?? null,
    imagen_url:      producto.imagen_url      ?? null,
    metadata:        producto.metadata        ?? {},
    updated_at:      new Date().toISOString(),
  };

  const { data, error } = await db.from('productos')
    .upsert(safeProducto)
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

  // Construir objeto seguro — mapea solo columnas conocidas de la tabla recetas.
  // Evita errores "column does not exist" por campos del formulario RecetaModal.
  const safeReceta: Record<string, any> = {
    id:          receta.id,
    empresa_id:  empresaId,
    nombre:      receta.nombre       ?? null,
    // producto_id debe ser UUID válido
    producto_id: isUUID(receta.producto_id) ? receta.producto_id : null,
    rendimiento: Number(receta.rendimiento ?? receta.porciones ?? 1),
    porciones:   Number(receta.porciones   ?? 1),              // migración 006
    unidad:      receta.unidad        ?? 'unidad',
    costo_total: Number(receta.costo_total  ?? 0),
    activo:      receta.activo         ?? true,
    ingredientes: receta.ingredientes ?? [],
    // Columnas de migración 006
    precio_venta:    Number(receta.precio_venta    ?? receta.precio_sugerido ?? 0),
    precio_sugerido: Number(receta.precio_sugerido ?? receta.precio_venta    ?? 0),
    categoria:       receta.categoria        ?? null,
    tiempo_preparacion: Number(receta.tiempo_preparacion ?? 0),
    notas:           receta.notas            ?? null,
    // Columnas de migración 008
    descripcion:     receta.descripcion      ?? null,
    dificultad:      receta.dificultad       ?? 'media',
    instrucciones:   receta.instrucciones    ?? null,
    costo_por_porcion: Number(receta.costo_por_porcion ?? 0),
    margen_bruto:    Number(receta.margen_bruto ?? 0),
    metadata:        receta.metadata         ?? {},
    updated_at:      new Date().toISOString(),
  };

  const { data, error } = await db.from('recetas')
    .upsert(safeReceta)
    .select().single();

  // Si falla por columnas de migración 008 aún no aplicadas, reintentar sin ellas
  if (error) {
    const esMissingColumn = error.message?.includes('column') && error.message?.includes('does not exist');
    if (esMissingColumn) {
      const { descripcion, dificultad, instrucciones, costo_por_porcion, margen_bruto, ...baseReceta } = safeReceta;
      // También intentar sin columnas de migración 006 si sigue fallando
      const { data: data2, error: error2 } = await db.from('recetas')
        .upsert(baseReceta)
        .select().single();
      if (error2) {
        const esMissing2 = error2.message?.includes('column') && error2.message?.includes('does not exist');
        if (esMissing2) {
          const { precio_venta, precio_sugerido, categoria, tiempo_preparacion, porciones, notas, ...baseReceta2 } = baseReceta;
          const { data: data3, error: error3 } = await db.from('recetas')
            .upsert(baseReceta2)
            .select().single();
          if (error3) throw error3;
          return data3;
        }
        throw error2;
      }
      return data2;
    }
    throw error;
  }
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
  const ahora = new Date().toISOString();

  // Construir objeto seguro — mapea campos del POS a columnas reales de la tabla.
  // Evita errores "column does not exist" cuando el body incluye campos extra.
  const safeVenta: Record<string, any> = {
    id:            venta.id,
    empresa_id:    empresaId,
    // numero_ticket (POS) → numero + numero_ticket (008) + numero_orden (006)
    numero:        venta.numero_ticket || venta.numero        || null,
    numero_ticket: venta.numero_ticket || venta.numero        || null,  // migración 008
    numero_orden:  venta.numero_ticket || venta.numero_orden  || null,  // migración 006
    // fecha (POS) → fecha (008) + created_at
    fecha:         venta.fecha         || ahora,                        // migración 008
    created_at:    venta.fecha         || venta.created_at   || ahora,
    cliente_nombre: venta.cliente      || venta.cliente_nombre || null,
    subtotal:      Number(venta.subtotal   ?? 0),
    descuento:     Number(venta.descuento  ?? 0),
    // impuestos (POS) → iva + impuestos (008)
    iva:           Number(venta.impuestos  ?? venta.iva       ?? 0),
    impuestos:     Number(venta.impuestos  ?? venta.iva       ?? 0),    // migración 008
    total:         Number(venta.total      ?? 0),
    // metodo_pago (POS) → forma_pago + metodo_pago (008)
    forma_pago:    venta.metodo_pago   || venta.forma_pago  || 'efectivo',
    metodo_pago:   venta.metodo_pago   || venta.forma_pago  || 'efectivo', // migración 008
    estado:        venta.estado        || 'completada',
    // usuario_id (POS) → cajero_id + usuario_id (008)
    cajero_id:     venta.usuario_id    || venta.cajero_id   || null,
    usuario_id:    venta.usuario_id    || null,                          // migración 008
    cajero_nombre: venta.cajero_nombre || null,                          // migración 008
    costo_envio:   Number(venta.costo_envio ?? 0),                       // migración 008
    notas:         venta.notas         || null,
    items:         venta.items         || [],
    metadata: {
      ...(venta.metadata || {}),
      cajero_nombre_snap: venta.cajero_nombre || null,
    },
    // Columnas de migración 006
    bodega_id:     venta.bodega_id     || null,
    mesa:          venta.mesa          || null,
    tipo_servicio: venta.tipo_servicio || null,
    anulada:       venta.anulada       ?? false,
  };

  const { data, error } = await db.from('ventas')
    .insert(safeVenta)
    .select().single();

  // Fallback: si fallan columnas de migración 008, reintentar sin ellas
  if (error) {
    const esMissing = error.message?.includes('column') && error.message?.includes('does not exist');
    if (esMissing) {
      const { numero_ticket, fecha, impuestos, metodo_pago, usuario_id, cajero_nombre, costo_envio, ...baseVenta } = safeVenta;
      const { data: data2, error: error2 } = await db.from('ventas').insert(baseVenta).select().single();
      if (error2) throw error2;
      return data2;
    }
    throw error;
  }
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
  const proveedores = await sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('proveedores')
        .select('*').eq('empresa_id', empresaId).order('nombre');
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_proveedores`
  );
  // Normalizar ruc/ruc_nit — SQL usa "ruc" pero la UI muestra "ruc_nit"
  return (proveedores || []).map((p: any) => ({
    ...p,
    ruc_nit: p.ruc_nit || p.ruc || p.metadata?.ruc_nit || null,
    ruc: p.ruc || p.ruc_nit || p.metadata?.ruc_nit || null,
    dias_credito: Number(p.dias_credito ?? p.metadata?.dias_credito ?? 0),
    limite_credito: Number(p.limite_credito ?? p.metadata?.limite_credito ?? 0),
  }));
}

export async function guardarProveedor(empresaId: string, proveedor: any) {
  const db = getDB();
  if (!proveedor.id) proveedor.id = crypto.randomUUID();

  // Columnas reales de proveedores (verificadas en producción):
  // id, empresa_id, nombre, ruc, telefono, email, direccion, activo,
  // created_at, updated_at, contacto, metadata, dias_credito,
  // ciudad, pais, banco, cuenta_bancaria, tipo_cuenta
  // NOTA: ruc_nit y limite_credito NO existen → se mapean/ignoran
  const safeData: Record<string, any> = {
    id:              proveedor.id,
    empresa_id:      empresaId,
    nombre:          proveedor.nombre          ?? '',
    ruc:             proveedor.ruc_nit         ?? proveedor.ruc          ?? null,
    telefono:        proveedor.telefono        ?? null,
    email:           proveedor.email           ?? null,
    direccion:       proveedor.direccion       ?? null,
    activo:          proveedor.activo          ?? true,
    contacto:        proveedor.contacto        ?? null,
    dias_credito:    proveedor.dias_credito    ?? 0,
    ciudad:          proveedor.ciudad          ?? null,
    pais:            proveedor.pais            ?? null,
    banco:           proveedor.banco           ?? null,
    cuenta_bancaria: proveedor.cuenta_bancaria ?? null,
    tipo_cuenta:     proveedor.tipo_cuenta     ?? null,
    // limite_credito no existe en la tabla → va en metadata
    metadata: {
      ...(proveedor.limite_credito != null ? { limite_credito: proveedor.limite_credito } : {}),
      ...(proveedor.metadata ?? {}),
    },
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from('proveedores')
    .upsert(safeData)
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
  // Normalizar activo/activa — SQL usa "activo" pero el frontend filtra por "activa"
  return (data || []).map((b: any) => ({
    ...b,
    activa: b.activa ?? b.activo ?? true,   // para BodegaContext.filter(b => b.activa)
    activo: b.activo ?? b.activa ?? true,   // para otros usos
  }));
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

  // Columnas reales de movimientos_inventario (verificadas en producción):
  // id, empresa_id, producto_id, bodega_id, tipo, cantidad,
  // stock_anterior, stock_nuevo, costo_unitario, costo_total,
  // observaciones, referencia, usuario_id, fecha, created_at, bodega_destino_id
  // NOTA: producto_nombre, precio_unitario y motivo NO existen en producción
  const mov = {
    id:            movimiento.id,
    empresa_id:    empresaId,
    producto_id:   movimiento.producto_id  ?? null,
    bodega_id:     movimiento.bodega_id    ?? null,
    tipo:          movimiento.tipo,
    cantidad:      movimiento.cantidad,
    costo_unitario: movimiento.costo_unitario ?? movimiento.precio_unitario ?? 0,
    costo_total:   movimiento.costo_total  ?? null,
    observaciones: movimiento.observaciones ?? movimiento.motivo ?? null,
    referencia:    movimiento.referencia   ?? null,
    // usuario_id debe ser UUID válido — si viene un nombre/string no-UUID se pasa null
    usuario_id:    isUUID(movimiento.usuario_id) ? movimiento.usuario_id : null,
    fecha:         new Date().toISOString(),
    created_at:    new Date().toISOString(),
  };

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
  const cuentas = await sqlConFallback(
    async () => {
      const db = getDB();
      const { data, error } = await db.from('cuentas_contables')
        .select('*').eq('empresa_id', empresaId).order('codigo');
      if (error) throw error;
      return data || [];
    },
    `empresa_${empresaId}_cuentas_contables`
  );
  // Agrega naturaleza derivada del tipo (no existe como columna en DB)
  return cuentas.map((c: any) => ({
    ...c,
    naturaleza: (
      c.tipo === 'pasivo' || c.tipo === 'ingreso' ? 'acreedora' :
      c.tipo === 'patrimonio' && c.codigo?.startsWith('3.2') ? 'deudora' :
      c.tipo === 'patrimonio' ? 'acreedora' : 'deudora'
    ),
    nivel: c.nivel ?? (c.codigo ? c.codigo.split('.').length : 3),
  }));
}

export async function guardarCuenta(empresaId: string, cuenta: any) {
  const db = getDB();
  if (!cuenta.id) cuenta.id = crypto.randomUUID();
  // Columnas reales verificadas de cuentas_contables:
  // id, empresa_id, codigo, nombre, tipo, subtipo, saldo_actual,
  // activa, created_at, updated_at, es_grupo, nivel
  // naturaleza NO existe como columna — se deriva del tipo en runtime
  const safeRow: Record<string, any> = {
    id: cuenta.id,
    empresa_id: empresaId,
    codigo: cuenta.codigo,
    nombre: cuenta.nombre,
    tipo: cuenta.tipo,
    es_grupo: cuenta.es_grupo ?? false,
    activa: cuenta.activa ?? cuenta.activo ?? true,
    nivel: cuenta.nivel ?? (cuenta.codigo ? cuenta.codigo.split('.').length : 3),
    updated_at: new Date().toISOString(),
  };
  if (cuenta.subtipo) safeRow.subtipo = cuenta.subtipo;
  const { data, error } = await db.from('cuentas_contables')
    .upsert(safeRow, { onConflict: 'id' }).select().single();
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
    if (cuentas.length === 0) {
      console.warn(`[Contabilidad] Sin plan contable — asiento "${opciones.tipo}" descartado`);
      return;
    }

    // Resolver cuentas y reportar las que no existan
    const itemsResueltos = opciones.items
      .map(item => {
        const cuenta = cuentas.find((c: any) => c.codigo === item.codigo && !c.es_grupo);
        if (!cuenta) {
          console.warn(`[Contabilidad] Cuenta ${item.codigo} no encontrada — asiento "${opciones.tipo}" puede quedar incompleto`);
          return null;
        }
        return {
          cuenta_id:     cuenta.id,
          cuenta_codigo: cuenta.codigo,
          cuenta_nombre: cuenta.nombre,
          debito:        item.debito  ?? 0,
          credito:       item.credito ?? 0,
          descripcion:   item.descripcion ?? opciones.descripcion,
        };
      })
      .filter(Boolean);

    if (itemsResueltos.length === 0) {
      console.warn(`[Contabilidad] Ninguna cuenta resuelta — asiento "${opciones.tipo}" descartado`);
      return;
    }

    // Validar que el asiento esté balanceado (débitos = créditos)
    const totalD = itemsResueltos.reduce((s, i) => s + (i!.debito  || 0), 0);
    const totalC = itemsResueltos.reduce((s, i) => s + (i!.credito || 0), 0);
    if (Math.abs(totalD - totalC) > 0.01) {
      console.error(`[Contabilidad] Asiento "${opciones.tipo}" DESBALANCEADO — débitos ${totalD.toFixed(2)} ≠ créditos ${totalC.toFixed(2)} — descartado`);
      return;
    }

    await guardarAsiento(empresaId, {
      tipo:              opciones.tipo,
      descripcion:       opciones.descripcion,
      referencia:        opciones.referencia ?? '',
      fecha:             opciones.fecha ?? new Date().toISOString().split('T')[0],
      estado:            'activo',
      origen_automatico: true,
      items:             itemsResueltos,
      total_debito:      parseFloat(totalD.toFixed(2)),
      total_credito:     parseFloat(totalC.toFixed(2)),
    });
  } catch (err: any) {
    console.error(`[Contabilidad] Error guardando asiento automático "${opciones.tipo}":`, err?.message);
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
  const compras = await sqlConFallback(
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
  // Normalizar campos KV ↔ SQL
  // SQL usa: total, numero, notas, forma_pago
  // KV usaba: total_compra, numero_factura, observaciones, tipo_pago
  // La UI del frontend lee: total_compra, numero_factura, observaciones, tipo_pago
  return (compras || []).map((c: any) => ({
    ...c,
    total_compra: Number(c.total_compra ?? c.total ?? c.metadata?.total_compra ?? 0),
    total: Number(c.total ?? c.total_compra ?? 0),
    numero_factura: c.numero_factura || c.numero || c.metadata?.numero_factura || null,
    numero: c.numero || c.numero_factura || null,
    observaciones: c.observaciones || c.notas || c.metadata?.observaciones || null,
    notas: c.notas || c.observaciones || null,
    tipo_pago: c.tipo_pago || c.forma_pago || c.metadata?.tipo_pago || 'contado',
    forma_pago: c.forma_pago || c.tipo_pago || 'contado',
    saldo_pendiente: Number(c.saldo_pendiente ?? c.metadata?.saldo_pendiente ?? 0),
  }));
}

export async function guardarCompra(empresaId: string, compra: any) {
  const db = getDB();
  if (!compra.id) compra.id = crypto.randomUUID();

  // Columnas reales de compras (verificadas en producción):
  // id, empresa_id, numero, proveedor_id, proveedor_nombre, subtotal, iva,
  // total, estado, fecha, items, metadata, created_at,
  // estado_pago, forma_pago, bodega_id, notas, updated_at
  const insertBase: Record<string, any> = {
    id:           compra.id,
    empresa_id:   empresaId,
    numero:       compra.numero_factura  ?? compra.numero      ?? '',
    proveedor_id: compra.proveedor_id    ?? null,
    fecha:        (compra.fecha || new Date().toISOString()).split('T')[0],
    items:        compra.items           ?? [],
    total:        compra.total_compra    ?? compra.total        ?? 0,
    estado:       compra.estado          ?? 'pagada',
    estado_pago:  compra.estado_pago     ?? 'pagada',
    forma_pago:   compra.tipo_pago       ?? compra.forma_pago   ?? 'contado',
    notas:        compra.observaciones   ?? compra.notas        ?? null,
    metadata:     compra.metadata        ?? {},
    created_at:   new Date().toISOString(),
    updated_at:   new Date().toISOString(),
  };

  const { data, error } = await db.from('compras').insert(insertBase).select().single();
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

  // Columnas reales de cuentas_por_pagar:
  // id, empresa_id, compra_id, proveedor_id, proveedor_nombre,
  // monto, monto_pagado, saldo_pendiente, estado, fecha_vencimiento,
  // metadata, created_at, updated_at
  // NOTA: numero_factura y fecha_emision no existen → se guardan en metadata
  const safeCxp = {
    id:               cxp.id,
    empresa_id:       empresaId,
    compra_id:        cxp.compra_id        ?? null,
    proveedor_id:     cxp.proveedor_id     ?? null,
    proveedor_nombre: cxp.proveedor_nombre ?? null,
    monto:            cxp.monto            ?? 0,
    monto_pagado:     cxp.monto_pagado     ?? 0,
    saldo_pendiente:  cxp.saldo_pendiente  ?? cxp.monto ?? 0,
    estado:           cxp.estado           ?? 'pendiente',
    fecha_vencimiento: cxp.fecha_vencimiento ?? null,
    // numero_factura y fecha_emision van en metadata
    metadata: {
      ...(cxp.numero_factura ? { numero_factura: cxp.numero_factura } : {}),
      ...(cxp.fecha_emision  ? { fecha_emision:  cxp.fecha_emision  } : {}),
      ...(cxp.metadata       ? cxp.metadata                           : {}),
    },
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from('cuentas_por_pagar')
    .upsert(safeCxp)
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
