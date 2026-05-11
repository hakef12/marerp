// =====================================================
// KV STORE HELPERS - Utilidades para manejar datos
// =====================================================

import * as kv from "./kv_store.tsx";

// =====================================================
// INICIALIZACIÓN DE DATOS DEMO (DESHABILITADA)
// =====================================================

export async function inicializarDatosDemo(empresaId: string) {
  console.log(`✅ Sistema sin datos demo - empresa: ${empresaId}`);
}

export async function cargarDatosDemo(empresaId: string) {
  console.log(`🎬 Cargando datos demo manualmente para empresa: ${empresaId} (DESHABILITADO)`);
  return { success: false, message: 'La carga de datos demo está deshabilitada.' };
}

// =====================================================
// FUNCIONES PARA LIMPIAR TODOS LOS DATOS
// =====================================================

export async function limpiarTodosLosDatos(empresaId: string) {
  console.log(`🗑️ Limpiando todos los datos para empresa: ${empresaId}`);
  try {
    await kv.del(`empresa_${empresaId}_productos`);
    await kv.del(`empresa_${empresaId}_categorias`);
    await kv.del(`empresa_${empresaId}_recetas`);
    await kv.del(`empresa_${empresaId}_ventas`);
    await kv.del(`empresa_${empresaId}_comandas`);
    await kv.del(`empresa_${empresaId}_clientes`);
    await kv.del(`empresa_${empresaId}_proveedores`);
    await kv.del(`empresa_${empresaId}_empleados`);
    await kv.del(`empresa_${empresaId}_compras`);
    await kv.del(`empresa_${empresaId}_bodegas`);
    await kv.del(`empresa_${empresaId}_movimientos`);

    console.log(`✅ Todos los datos eliminados exitosamente para empresa ${empresaId}`);
    return { success: true, message: 'Todos los datos han sido eliminados' };
  } catch (error: any) {
    console.error('❌ Error limpiando datos:', error);
    throw error;
  }
}

// =====================================================
// GETTERS - SIN FILTROS, DEVUELVE TODO LO QUE HAY
// =====================================================

export async function obtenerProductos(empresaId: string) {
  const productos = await kv.get(`empresa_${empresaId}_productos`);
  if (!productos || productos.length === 0) return [];
  // Reparar productos existentes sin id
  let necesitaGuardar = false;
  const reparados = (productos as any[]).map((p: any) => {
    if (!p.id) {
      necesitaGuardar = true;
      return { ...p, id: crypto.randomUUID() };
    }
    return p;
  });
  if (necesitaGuardar) {
    await kv.set(`empresa_${empresaId}_productos`, reparados);
  }
  return reparados;
}

export async function obtenerCategorias(empresaId: string) {
  const categorias = await kv.get(`empresa_${empresaId}_categorias`);
  if (!categorias || (categorias as any[]).length === 0) return [];
  let necesitaGuardar = false;
  const reparadas = (categorias as any[]).map((c: any) => {
    if (!c.id) {
      necesitaGuardar = true;
      return { ...c, id: crypto.randomUUID() };
    }
    return c;
  });
  if (necesitaGuardar) {
    await kv.set(`empresa_${empresaId}_categorias`, reparadas);
  }
  return reparadas;
}

export async function obtenerRecetas(empresaId: string) {
  const recetas = await kv.get(`empresa_${empresaId}_recetas`);
  return recetas || [];
}

export async function obtenerVentas(empresaId: string) {
  const ventas = await kv.get(`empresa_${empresaId}_ventas`);
  return ventas || [];
}

export async function obtenerComandas(empresaId: string) {
  const comandas = await kv.get(`empresa_${empresaId}_comandas`);
  if (!comandas || (comandas as any[]).length === 0) return [];
  let necesitaGuardar = false;
  const reparadas = (comandas as any[]).map((c: any) => {
    if (!c.id) {
      necesitaGuardar = true;
      return { ...c, id: crypto.randomUUID() };
    }
    return c;
  });
  if (necesitaGuardar) {
    await kv.set(`empresa_${empresaId}_comandas`, reparadas);
  }
  return reparadas;
}

export async function obtenerClientes(empresaId: string) {
  const clientes = await kv.get(`empresa_${empresaId}_clientes`);
  return clientes || [];
}

export async function obtenerProveedores(empresaId: string) {
  const proveedores = await kv.get(`empresa_${empresaId}_proveedores`);
  return proveedores || [];
}

export async function obtenerBodegas(empresaId: string) {
  const bodegas = await kv.get(`empresa_${empresaId}_bodegas`);
  return bodegas || [];
}

export async function obtenerMovimientos(empresaId: string) {
  const movimientos = await kv.get(`empresa_${empresaId}_movimientos`);
  return movimientos || [];
}

// =====================================================
// SETTERS - Funciones para guardar datos
// =====================================================

export async function guardarProducto(empresaId: string, producto: any) {
  const productos = await obtenerProductos(empresaId);
  if (!producto.id) producto.id = crypto.randomUUID();
  const index = productos.findIndex((p: any) => p.id === producto.id);
  if (index >= 0) {
    productos[index] = { ...producto, updated_at: new Date().toISOString() };
  } else {
    productos.push({ ...producto, created_at: new Date().toISOString() });
  }
  await kv.set(`empresa_${empresaId}_productos`, productos);
  return producto;
}

export async function eliminarProducto(empresaId: string, productoId: string) {
  const productos = await obtenerProductos(empresaId);
  const productosFiltrados = productos.filter((p: any) => p.id !== productoId);
  await kv.set(`empresa_${empresaId}_productos`, productosFiltrados);
}

export async function guardarReceta(empresaId: string, receta: any) {
  const recetas = await obtenerRecetas(empresaId);
  const index = recetas.findIndex((r: any) => r.id === receta.id);
  if (index >= 0) {
    recetas[index] = { ...receta, updated_at: new Date().toISOString() };
  } else {
    recetas.push({ ...receta, created_at: new Date().toISOString() });
  }
  await kv.set(`empresa_${empresaId}_recetas`, recetas);
  return receta;
}

export async function eliminarReceta(empresaId: string, recetaId: string) {
  const recetas = await obtenerRecetas(empresaId);
  const recetasFiltradas = recetas.filter((r: any) => r.id !== recetaId);
  await kv.set(`empresa_${empresaId}_recetas`, recetasFiltradas);
}

export async function guardarVenta(empresaId: string, venta: any) {
  const ventas = await obtenerVentas(empresaId);
  ventas.push({ ...venta, created_at: new Date().toISOString() });
  await kv.set(`empresa_${empresaId}_ventas`, ventas);
  return venta;
}

export async function guardarComanda(empresaId: string, comanda: any) {
  const comandas = await obtenerComandas(empresaId);
  if (!comanda.id) comanda.id = crypto.randomUUID();
  const index = comandas.findIndex((c: any) => c.id === comanda.id);
  if (index >= 0) {
    comandas[index] = { ...comanda, updated_at: new Date().toISOString() };
  } else {
    comandas.push({ ...comanda, created_at: new Date().toISOString() });
  }
  await kv.set(`empresa_${empresaId}_comandas`, comandas);
  return comanda;
}

export async function actualizarComanda(empresaId: string, comandaId: string, cambios: any) {
  const comandas = await obtenerComandas(empresaId);
  const index = comandas.findIndex((c: any) => c.id === comandaId);
  if (index >= 0) {
    comandas[index] = { ...comandas[index], ...cambios, updated_at: new Date().toISOString() };
    await kv.set(`empresa_${empresaId}_comandas`, comandas);
    return comandas[index];
  }
  return null;
}

export async function eliminarComanda(empresaId: string, comandaId: string) {
  const comandas = await obtenerComandas(empresaId);
  const comandasFiltradas = comandas.filter((c: any) => c.id !== comandaId);
  await kv.set(`empresa_${empresaId}_comandas`, comandasFiltradas);
}

export async function guardarCategoria(empresaId: string, categoria: any) {
  const categorias = await obtenerCategorias(empresaId);
  if (!categoria.id) categoria.id = crypto.randomUUID();
  const index = categorias.findIndex((c: any) => c.id === categoria.id);
  if (index >= 0) {
    categorias[index] = { ...categoria, updated_at: new Date().toISOString() };
  } else {
    categorias.push({ ...categoria, created_at: new Date().toISOString() });
  }
  await kv.set(`empresa_${empresaId}_categorias`, categorias);
  return categoria;
}

export async function eliminarCategoria(empresaId: string, categoriaId: string) {
  const categorias = await obtenerCategorias(empresaId);
  const categoriasFiltradas = categorias.filter((c: any) => c.id !== categoriaId);
  await kv.set(`empresa_${empresaId}_categorias`, categoriasFiltradas);
}

export async function guardarBodega(empresaId: string, bodega: any) {
  const bodegas = await obtenerBodegas(empresaId);
  if (!bodega.id) bodega.id = `bodega_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const index = bodegas.findIndex((b: any) => b.id === bodega.id);
  if (index >= 0) {
    bodegas[index] = { ...bodega, updated_at: new Date().toISOString() };
  } else {
    bodegas.push({ ...bodega, created_at: new Date().toISOString() });
  }
  await kv.set(`empresa_${empresaId}_bodegas`, bodegas);
  return bodega;
}

export async function eliminarBodega(empresaId: string, bodegaId: string) {
  const bodegas = await obtenerBodegas(empresaId);
  const bodegasFiltradas = bodegas.filter((b: any) => b.id !== bodegaId);
  await kv.set(`empresa_${empresaId}_bodegas`, bodegasFiltradas);
}

export async function guardarProveedor(empresaId: string, proveedor: any) {
  const proveedores = await obtenerProveedores(empresaId);
  if (!proveedor.id) proveedor.id = `proveedor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const index = proveedores.findIndex((p: any) => p.id === proveedor.id);
  if (index >= 0) {
    proveedores[index] = { ...proveedor, updated_at: new Date().toISOString() };
  } else {
    proveedores.push({ ...proveedor, created_at: new Date().toISOString() });
  }
  await kv.set(`empresa_${empresaId}_proveedores`, proveedores);
  return proveedor;
}

export async function eliminarProveedor(empresaId: string, proveedorId: string) {
  const proveedores = await obtenerProveedores(empresaId);
  const proveedoresFiltrados = proveedores.filter((p: any) => p.id !== proveedorId);
  await kv.set(`empresa_${empresaId}_proveedores`, proveedoresFiltrados);
}

export async function guardarMovimiento(empresaId: string, movimiento: any) {
  const movimientos = await obtenerMovimientos(empresaId);
  if (!movimiento.id) movimiento.id = `movimiento_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const mov = { ...movimiento, created_at: new Date().toISOString() };
  movimientos.push(mov);
  await kv.set(`empresa_${empresaId}_movimientos`, movimientos);

  // Actualizar stock_actual del producto
  if (movimiento.producto_id) {
    const productos = await obtenerProductos(empresaId);
    const idx = productos.findIndex((p: any) => p.id === movimiento.producto_id);
    if (idx >= 0) {
      const stockActual = Number(productos[idx].stock_actual) || 0;
      const cantidad = Number(movimiento.cantidad) || 0;
      if (movimiento.tipo === 'entrada') {
        productos[idx].stock_actual = stockActual + cantidad;
      } else if (movimiento.tipo === 'salida') {
        productos[idx].stock_actual = Math.max(0, stockActual - cantidad);
      } else if (movimiento.tipo === 'ajuste') {
        productos[idx].stock_actual = cantidad;
      }
      // transferencia no cambia el stock total
      productos[idx].updated_at = new Date().toISOString();
      await kv.set(`empresa_${empresaId}_productos`, productos);
    }
  }

  return mov;
}

export async function obtenerOrdenesProduccion(empresaId: string) {
  const ordenes = await kv.get(`empresa_${empresaId}_ordenes_produccion`);
  return ordenes || [];
}

export async function guardarOrdenProduccion(empresaId: string, orden: any) {
  const ordenes = await obtenerOrdenesProduccion(empresaId);
  if (!orden.id) orden.id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const idx = ordenes.findIndex((o: any) => o.id === orden.id);
  if (idx >= 0) {
    ordenes[idx] = { ...ordenes[idx], ...orden, updated_at: new Date().toISOString() };
  } else {
    ordenes.push({ ...orden, created_at: new Date().toISOString() });
  }
  await kv.set(`empresa_${empresaId}_ordenes_produccion`, ordenes);
  return idx >= 0 ? ordenes[idx] : ordenes[ordenes.length - 1];
}

export async function obtenerCompras(empresaId: string) {
  return await kv.get(`empresa_${empresaId}_compras`) as any[] || [];
}

export async function guardarCompra(empresaId: string, compra: any) {
  const compras = await obtenerCompras(empresaId);
  if (!compra.id) compra.id = crypto.randomUUID();
  const nuevaCompra = { ...compra, created_at: new Date().toISOString() };
  compras.push(nuevaCompra);
  await kv.set(`empresa_${empresaId}_compras`, compras);
  return nuevaCompra;
}

// =====================================================
// HELPERS DE RECURSOS HUMANOS (RRHH)
// =====================================================

export async function obtenerEmpleados(empresaId: string) {
  const empleados = await kv.get(`empresa_${empresaId}_empleados`);
  return empleados || [];
}

export async function guardarEmpleado(empresaId: string, empleadoData: any) {
  const empleados = await obtenerEmpleados(empresaId);
  if (!empleadoData.id) empleadoData.id = `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const idx = empleados.findIndex((e: any) => e.id === empleadoData.id);
  const empleado = { ...empleadoData, empresa_id: empresaId };
  if (idx >= 0) {
    empleados[idx] = { ...empleado, updated_at: new Date().toISOString() };
  } else {
    empleados.push({ ...empleado, created_at: new Date().toISOString() });
  }
  await kv.set(`empresa_${empresaId}_empleados`, empleados);
  return empleado;
}

export async function eliminarEmpleado(empresaId: string, empleadoId: string) {
  const empleados = await obtenerEmpleados(empresaId);
  await kv.set(`empresa_${empresaId}_empleados`, empleados.filter((e: any) => e.id !== empleadoId));
  return { success: true };
}

// =====================================================
// CONTABILIDAD
// =====================================================

export async function obtenerCuentas(empresaId: string) {
  const cuentas = await kv.get(`empresa_${empresaId}_cuentas_contables`);
  return cuentas || [];
}

export async function guardarCuenta(empresaId: string, cuenta: any) {
  const cuentas = await obtenerCuentas(empresaId);
  if (!cuenta.id) cuenta.id = crypto.randomUUID();
  const idx = cuentas.findIndex((c: any) => c.id === cuenta.id);
  if (idx >= 0) {
    cuentas[idx] = { ...cuenta, updated_at: new Date().toISOString() };
  } else {
    cuentas.push({ ...cuenta, created_at: new Date().toISOString() });
  }
  await kv.set(`empresa_${empresaId}_cuentas_contables`, cuentas);
  return idx >= 0 ? cuentas[idx] : cuentas[cuentas.length - 1];
}

export async function eliminarCuenta(empresaId: string, cuentaId: string) {
  const cuentas = await obtenerCuentas(empresaId);
  await kv.set(`empresa_${empresaId}_cuentas_contables`, cuentas.filter((c: any) => c.id !== cuentaId));
}

export async function obtenerAsientos(empresaId: string) {
  const asientos = await kv.get(`empresa_${empresaId}_asientos_contables`);
  return asientos || [];
}

export async function guardarAsiento(empresaId: string, asiento: any) {
  const asientos = await obtenerAsientos(empresaId);
  if (!asiento.id) asiento.id = crypto.randomUUID();
  // Generar número secuencial
  if (!asiento.numero) {
    const year = new Date().getFullYear();
    const count = asientos.filter((a: any) => a.numero?.startsWith(`ASI-${year}`)).length + 1;
    asiento.numero = `ASI-${year}-${String(count).padStart(4, '0')}`;
  }
  const idx = asientos.findIndex((a: any) => a.id === asiento.id);
  if (idx >= 0) {
    asientos[idx] = { ...asiento, updated_at: new Date().toISOString() };
  } else {
    asientos.push({ ...asiento, created_at: new Date().toISOString() });
  }
  await kv.set(`empresa_${empresaId}_asientos_contables`, asientos);
  return idx >= 0 ? asientos[idx] : asientos[asientos.length - 1];
}

// ─── Asiento automático desde otros módulos ─────────────────────────────────
// Busca cada cuenta por su código NEC y crea el asiento en partida doble.
// Falla silenciosamente para no interrumpir la transacción origen.

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
    if (cuentas.length === 0) return; // Sin plan contable inicializado

    // Resolver cada ítem: buscar cuenta_id por código
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

    // Solo registrar si el asiento cuadra (diferencia < 1 centavo)
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
  } catch {
    // Silencioso: no interrumpe el flujo principal
  }
}

export async function obtenerPresupuesto(empresaId: string, anio: number) {
  const pres = await kv.get(`empresa_${empresaId}_presupuesto_${anio}`);
  return pres || [];
}

export async function guardarPresupuesto(empresaId: string, anio: number, items: any[]) {
  await kv.set(`empresa_${empresaId}_presupuesto_${anio}`, items);
  return items;
}

// =====================================================
// STOCK POR BODEGA
// Stock structure: { [bodegaId]: { [productoNombre]: cantidad } }
// =====================================================

export async function getStockBodegas(empresaId: string): Promise<Record<string, Record<string, number>>> {
  return (await kv.get(`stock_bodegas_${empresaId}`)) || {};
}

export async function getStockBodega(empresaId: string, bodegaId: string): Promise<Record<string, number>> {
  const all = await getStockBodegas(empresaId);
  return all[bodegaId] || {};
}

export async function ajustarStockBodega(
  empresaId: string,
  bodegaId: string,
  productoNombre: string,
  delta: number  // positive = add, negative = subtract
): Promise<void> {
  const all = await getStockBodegas(empresaId);
  if (!all[bodegaId]) all[bodegaId] = {};
  const current = all[bodegaId][productoNombre] || 0;
  all[bodegaId][productoNombre] = Math.max(0, current + delta);
  await kv.set(`stock_bodegas_${empresaId}`, all);
}

export async function transferirStockBodega(
  empresaId: string,
  bodegaOrigenId: string,
  bodegaDestinoId: string,
  productoNombre: string,
  cantidad: number
): Promise<{ ok: boolean; error?: string; stockOrigen: number }> {
  const all = await getStockBodegas(empresaId);
  if (!all[bodegaOrigenId]) all[bodegaOrigenId] = {};
  if (!all[bodegaDestinoId]) all[bodegaDestinoId] = {};
  const stockOrigen = all[bodegaOrigenId][productoNombre] || 0;
  if (stockOrigen < cantidad) {
    return { ok: false, error: `Stock insuficiente en bodega origen. Disponible: ${stockOrigen}`, stockOrigen };
  }
  all[bodegaOrigenId][productoNombre] = stockOrigen - cantidad;
  all[bodegaDestinoId][productoNombre] = (all[bodegaDestinoId][productoNombre] || 0) + cantidad;
  await kv.set(`stock_bodegas_${empresaId}`, all);
  return { ok: true, stockOrigen };
}

// =====================================================
// MERMAS (WASTE/LOSS)
// =====================================================

export async function getMermas(empresaId: string): Promise<any[]> {
  return (await kv.get(`mermas_${empresaId}`)) || [];
}

export async function guardarMerma(empresaId: string, merma: any): Promise<any> {
  const mermas = await getMermas(empresaId);
  if (!merma.id) merma.id = crypto.randomUUID();
  mermas.unshift(merma);
  await kv.set(`mermas_${empresaId}`, mermas);
  return merma;
}

// Sincroniza stock_actual del producto real (inventario visible) por nombre
// delta > 0 = entrada, delta < 0 = salida
export async function sincronizarStockProductoReal(
  empresaId: string,
  productoNombre: string,
  delta: number
): Promise<void> {
  const productos = await obtenerProductos(empresaId);
  const idx = productos.findIndex(
    (p: any) => (p.nombre || '').toLowerCase().trim() === productoNombre.toLowerCase().trim()
  );
  if (idx === -1) return; // producto no encontrado, no bloquear el flujo
  const stockActual = productos[idx].stock_actual ?? productos[idx].stock ?? 0;
  productos[idx].stock_actual = Math.max(0, stockActual + delta);
  productos[idx].stock = productos[idx].stock_actual;
  productos[idx].updated_at = new Date().toISOString();
  await kv.set(`empresa_${empresaId}_productos`, productos);
}