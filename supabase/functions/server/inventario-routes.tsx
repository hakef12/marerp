import {
  inicializarDatosDemo,
  obtenerProductos,
  guardarProducto,
  eliminarProducto,
  obtenerCategorias,
  guardarCategoria,
  eliminarCategoria,
  obtenerBodegas,
  guardarBodega,
  eliminarBodega,
  obtenerProveedores,
  guardarProveedor,
  eliminarProveedor,
  obtenerMovimientos,
  guardarMovimiento,
  obtenerCompras,
  guardarCompra
} from "./kv-helpers.tsx";
import { registrarAuditoria, verificarPassword } from "./audit-helper.tsx";

export function setupInventarioRoutes(app: any, authMiddleware: any) {

  // =====================================================
  // PRODUCTOS
  // =====================================================

  app.get("/server/productos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const productosReales = await obtenerProductos(auth.empresaId);
      const categoriasData = await obtenerCategorias(auth.empresaId);
      // Indexar categorías tanto por id como por nombre (el modal usa el nombre como id)
      const categoriasMap = new Map([
        ...categoriasData.map((cat: any) => [cat.id, cat]),
        ...categoriasData.map((cat: any) => [cat.nombre, cat]),
      ]);
      const productosConCategorias = productosReales
        .map((p: any) => ({
          ...p,
          categorias: p.categoria_id
            ? (categoriasMap.get(p.categoria_id) || { nombre: p.categoria_id })
            : null
        }))
        .sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''));
      return c.json({ productos: productosConCategorias });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener productos', details: error.message }, 500);
    }
  });

  app.get("/server/productos/siguiente-codigo", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const categoria_id = c.req.query('categoria_id');
      const tipo = c.req.query('tipo');
      if (!categoria_id || !tipo) return c.json({ error: 'Se requieren categoria_id y tipo' }, 400);

      const categorias = await obtenerCategorias(auth.empresaId);
      const categoria = categorias.find((cat: any) => cat.id === categoria_id);
      if (!categoria) return c.json({ error: 'Categoría no encontrada' }, 404);

      const categoriaPrefijo = categoria.nombre.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '').padEnd(3, 'X');
      const tipoPrefijo = tipo.substring(0, 3).toUpperCase();
      const prefijo = `${categoriaPrefijo}-${tipoPrefijo}-`;

      const productos = await obtenerProductos(auth.empresaId);
      const conPrefijo = productos
        .filter((p: any) => p.codigo?.startsWith(prefijo))
        .sort((a: any, b: any) => b.codigo.localeCompare(a.codigo));

      let siguienteNumero = 1;
      if (conPrefijo.length > 0) {
        const match = conPrefijo[0].codigo.match(/-(\d+)$/);
        if (match) siguienteNumero = parseInt(match[1]) + 1;
      }

      const codigo = `${prefijo}${siguienteNumero.toString().padStart(3, '0')}`;
      return c.json({ codigo, prefijo, numero: siguienteNumero, categoria: categoria.nombre, tipo });
    } catch (error: any) {
      return c.json({ error: 'Error al generar código' }, 500);
    }
  });

  app.post("/server/productos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();

      if (body.codigo) {
        const existentes = await obtenerProductos(auth.empresaId);
        const duplicado = existentes.find((p: any) => p.codigo === body.codigo);
        if (duplicado) {
          return c.json({ error: `El código "${body.codigo}" ya está en uso por "${duplicado.nombre}".` }, 400);
        }
      }

      const producto = await guardarProducto(auth.empresaId, { ...body, empresa_id: auth.empresaId });

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'crear', 'inventario', 'productos',
        producto.id, null, { codigo: producto.codigo, nombre: producto.nombre },
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ producto }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear producto', details: error.message }, 500);
    }
  });

  app.put("/server/productos/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const productoId = c.req.param('id');
    try {
      const body = await c.req.json();

      const productosActuales = await obtenerProductos(auth.empresaId);
      const anterior = productosActuales.find((p: any) => p.id === productoId);

      const producto = await guardarProducto(auth.empresaId, { ...body, id: productoId, empresa_id: auth.empresaId });

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'actualizar', 'inventario', 'productos',
        productoId,
        anterior ? { codigo: anterior.codigo, nombre: anterior.nombre } : null,
        { codigo: producto.codigo, nombre: producto.nombre },
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ producto });
    } catch (error: any) {
      return c.json({ error: 'Error al actualizar producto' }, 500);
    }
  });

  app.delete("/server/productos/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const productoId = c.req.param('id');
    try {
      const body = await c.req.json().catch(() => ({}));
      const { password } = body;

      if (!password) {
        return c.json({ error: 'Se requiere contraseña para eliminar' }, 400);
      }

      const passwordValido = await verificarPassword(auth.user.email, password);
      if (!passwordValido) {
        return c.json({ error: 'Contraseña incorrecta. No se realizó ningún cambio.' }, 401);
      }

      const productos = await obtenerProductos(auth.empresaId);
      const producto = productos.find((p: any) => p.id === productoId);
      if (!producto) return c.json({ error: 'Producto no encontrado' }, 404);

      await eliminarProducto(auth.empresaId, productoId);

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'eliminar', 'inventario', 'productos',
        productoId,
        { codigo: producto.codigo, nombre: producto.nombre, precio_venta: producto.precio_venta },
        null,
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ message: 'Producto eliminado exitosamente', producto: producto.nombre });
    } catch (error: any) {
      return c.json({ error: 'Error al eliminar producto' }, 500);
    }
  });

  // =====================================================
  // CATEGORÍAS
  // =====================================================

  app.get("/server/categorias", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const categorias = await obtenerCategorias(auth.empresaId);
      return c.json({ categorias: categorias || [] });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener categorías' }, 500);
    }
  });

  app.post("/server/categorias", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const categoria = await guardarCategoria(auth.empresaId, body);

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'crear', 'inventario', 'categorias',
        categoria.id, null, { nombre: categoria.nombre },
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ categoria }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear categoría' }, 500);
    }
  });

  app.put("/server/categorias/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const categoriaId = c.req.param('id');
    try {
      const body = await c.req.json();
      const categoria = await guardarCategoria(auth.empresaId, { ...body, id: categoriaId });

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'actualizar', 'inventario', 'categorias',
        categoriaId, null, { nombre: categoria.nombre },
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ categoria });
    } catch (error: any) {
      return c.json({ error: 'Error al actualizar categoría' }, 500);
    }
  });

  app.delete("/server/categorias/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const categoriaId = c.req.param('id');
    try {
      const categorias = await obtenerCategorias(auth.empresaId);
      const categoria = categorias.find((c: any) => c.id === categoriaId);

      await eliminarCategoria(auth.empresaId, categoriaId);

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'eliminar', 'inventario', 'categorias',
        categoriaId, { nombre: categoria?.nombre }, null,
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ message: 'Categoría eliminada exitosamente' });
    } catch (error: any) {
      return c.json({ error: 'Error al eliminar categoría' }, 500);
    }
  });

  // =====================================================
  // BODEGAS
  // =====================================================

  app.get("/server/bodegas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const bodegas = await obtenerBodegas(auth.empresaId);
      return c.json({ bodegas: bodegas || [] });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener bodegas', details: error.message }, 500);
    }
  });

  app.post("/server/bodegas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const bodega = await guardarBodega(auth.empresaId, body);

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'crear', 'inventario', 'bodegas',
        bodega.id, null, { codigo: bodega.codigo, nombre: bodega.nombre },
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ bodega }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear bodega: ' + error.message }, 500);
    }
  });

  app.put("/server/bodegas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const bodegaId = c.req.param('id');
    try {
      const body = await c.req.json();
      const bodega = await guardarBodega(auth.empresaId, { ...body, id: bodegaId });

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'actualizar', 'inventario', 'bodegas',
        bodegaId, null, { nombre: bodega.nombre },
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ bodega });
    } catch (error: any) {
      return c.json({ error: 'Error al actualizar bodega' }, 500);
    }
  });

  app.delete("/server/bodegas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const bodegaId = c.req.param('id');
    try {
      const body = await c.req.json().catch(() => ({}));
      const { password } = body;

      if (!password) {
        return c.json({ error: 'Se requiere contraseña para eliminar' }, 400);
      }

      const passwordValido = await verificarPassword(auth.user.email, password);
      if (!passwordValido) {
        return c.json({ error: 'Contraseña incorrecta. No se realizó ningún cambio.' }, 401);
      }

      const bodegas = await obtenerBodegas(auth.empresaId);
      const bodega = bodegas.find((b: any) => b.id === bodegaId);
      if (!bodega) return c.json({ error: 'Bodega no encontrada' }, 404);

      await eliminarBodega(auth.empresaId, bodegaId);

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'eliminar', 'inventario', 'bodegas',
        bodegaId, { codigo: bodega.codigo, nombre: bodega.nombre }, null,
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ message: 'Bodega eliminada exitosamente', bodega: bodega.nombre });
    } catch (error: any) {
      return c.json({ error: 'Error al eliminar bodega' }, 500);
    }
  });

  // =====================================================
  // PROVEEDORES
  // =====================================================

  app.get("/server/proveedores", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const proveedores = await obtenerProveedores(auth.empresaId);
      return c.json({ proveedores: proveedores || [] });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener proveedores' }, 500);
    }
  });

  app.post("/server/proveedores", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const proveedor = await guardarProveedor(auth.empresaId, body);

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'crear', 'inventario', 'proveedores',
        proveedor.id, null, { nombre: proveedor.nombre, ruc_nit: proveedor.ruc_nit },
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ proveedor }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear proveedor' }, 500);
    }
  });

  app.put("/server/proveedores/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const proveedorId = c.req.param('id');
    try {
      const body = await c.req.json();
      const proveedor = await guardarProveedor(auth.empresaId, { ...body, id: proveedorId });

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'actualizar', 'inventario', 'proveedores',
        proveedorId, null, { nombre: proveedor.nombre },
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ proveedor });
    } catch (error: any) {
      return c.json({ error: 'Error al actualizar proveedor' }, 500);
    }
  });

  app.delete("/server/proveedores/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const proveedorId = c.req.param('id');
    try {
      const body = await c.req.json().catch(() => ({}));
      const { password } = body;

      if (!password) {
        return c.json({ error: 'Se requiere contraseña para eliminar' }, 400);
      }

      const passwordValido = await verificarPassword(auth.user.email, password);
      if (!passwordValido) {
        return c.json({ error: 'Contraseña incorrecta. No se realizó ningún cambio.' }, 401);
      }

      const proveedores = await obtenerProveedores(auth.empresaId);
      const proveedor = proveedores.find((p: any) => p.id === proveedorId);

      await eliminarProveedor(auth.empresaId, proveedorId);

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'eliminar', 'inventario', 'proveedores',
        proveedorId, { nombre: proveedor?.nombre }, null,
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ message: 'Proveedor eliminado exitosamente' });
    } catch (error: any) {
      return c.json({ error: 'Error al eliminar proveedor' }, 500);
    }
  });

  // =====================================================
  // MOVIMIENTOS DE INVENTARIO
  // =====================================================

  app.get("/server/inventario/movimientos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const movimientos = await obtenerMovimientos(auth.empresaId);
      const productos = await obtenerProductos(auth.empresaId);
      const bodegas = await obtenerBodegas(auth.empresaId);

      // Obtener nombres de usuarios desde Supabase
      const { createClient } = await import("npm:@supabase/supabase-js");
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const usuarioIds = [...new Set(movimientos.map((m: any) => m.usuario_id).filter(Boolean))];
      let usuariosMap: Record<string, any> = {};
      if (usuarioIds.length > 0) {
        const { data: usuarios } = await supabase.from('usuarios').select('id, nombre_completo').in('id', usuarioIds);
        if (usuarios) usuariosMap = Object.fromEntries(usuarios.map((u: any) => [u.id, u]));
      }

      const enriquecidos = movimientos.map((mov: any) => {
        const producto = productos.find((p: any) => p.id === mov.producto_id);
        const bodega = bodegas.find((b: any) => b.id === mov.bodega_id);
        return {
          ...mov,
          productos: producto ? { id: producto.id, codigo: producto.codigo, nombre: producto.nombre } : null,
          bodegas: bodega ? { id: bodega.id, codigo: bodega.codigo, nombre: bodega.nombre } : null,
          usuarios: usuariosMap[mov.usuario_id] || null
        };
      }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return c.json({ movimientos: enriquecidos });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener movimientos' }, 500);
    }
  });

  app.post("/server/inventario/movimientos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const movimiento = await guardarMovimiento(auth.empresaId, { ...body, usuario_id: auth.userId });

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'crear', 'inventario', 'movimientos',
        movimiento.id,
        null,
        { tipo: movimiento.tipo, producto_id: movimiento.producto_id, cantidad: movimiento.cantidad },
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ movimiento }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear movimiento' }, 500);
    }
  });

  // =====================================================
  // ANÁLISIS DE INVENTARIO
  // =====================================================

  app.get("/server/inventario/stock-bajo", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const productos = await obtenerProductos(auth.empresaId);
      const stockBajo = productos
        .filter((p: any) => p.stock_actual <= p.stock_minimo)
        .sort((a: any, b: any) => (a.stock_actual - a.stock_minimo) - (b.stock_actual - b.stock_minimo));
      return c.json({ productos: stockBajo });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener productos con stock bajo' }, 500);
    }
  });

  app.get("/server/inventario/valorizacion", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const productos = await obtenerProductos(auth.empresaId);
      const valorizacion = productos.map((p: any) => ({
        id: p.id, codigo: p.codigo, nombre: p.nombre,
        stock_actual: p.stock_actual || 0,
        costo_unitario: p.precio_compra || p.costo_unitario || 0,
        valor_total: (p.stock_actual || 0) * (p.precio_compra || p.costo_unitario || 0),
        categoria_id: p.categoria_id
      }));
      const valorTotal = valorizacion.reduce((sum: number, p: any) => sum + p.valor_total, 0);
      return c.json({ productos: valorizacion, valor_total: valorTotal });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener valorización' }, 500);
    }
  });

  // =====================================================
  // COMPRAS
  // =====================================================

  app.get("/server/compras", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const compras = await obtenerCompras(auth.empresaId);
      const productos = await obtenerProductos(auth.empresaId);
      const proveedores = await obtenerProveedores(auth.empresaId);
      const productosMap = new Map(productos.map((p: any) => [p.id, p]));
      const proveedoresMap = new Map(proveedores.map((p: any) => [p.id, p]));

      const comprasEnriquecidas = compras.map((c: any) => ({
        ...c,
        proveedor: proveedoresMap.get(c.proveedor_id) || null,
        items: (c.items || []).map((item: any) => ({
          ...item,
          producto: productosMap.get(item.producto_id) || null
        }))
      })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return c.json({ compras: comprasEnriquecidas });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener compras' }, 500);
    }
  });

  app.post("/server/compras", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const { proveedor_id, fecha, numero_factura, items, observaciones } = body;

      if (!items || items.length === 0) {
        return c.json({ error: 'Debes agregar al menos un ítem a la compra' }, 400);
      }

      // Validar y calcular costo unitario de cada ítem
      const itemsCalculados = items.map((item: any) => {
        const cantidad = Number(item.cantidad) || 0;
        const costo_total = Number(item.costo_total) || 0;
        const costo_unitario = cantidad > 0 ? costo_total / cantidad : 0;
        return { ...item, cantidad, costo_total, costo_unitario };
      });

      const total_compra = itemsCalculados.reduce((sum: number, i: any) => sum + i.costo_total, 0);

      // Crear movimiento de entrada por cada ítem y actualizar precio_compra
      for (const item of itemsCalculados) {
        await guardarMovimiento(auth.empresaId, {
          tipo: 'entrada',
          producto_id: item.producto_id,
          bodega_id: item.bodega_id || null,
          cantidad: item.cantidad,
          costo_unitario: item.costo_unitario,
          referencia: numero_factura ? `Compra ${numero_factura}` : 'Compra directa',
          observaciones: observaciones || ''
        });

        // Actualizar precio_compra del producto con el nuevo costo unitario
        if (item.costo_unitario > 0) {
          const productos = await obtenerProductos(auth.empresaId);
          const prod = productos.find((p: any) => p.id === item.producto_id);
          if (prod) {
            await guardarProducto(auth.empresaId, { ...prod, precio_compra: item.costo_unitario });
          }
        }
      }

      // Guardar la compra
      const compra = await guardarCompra(auth.empresaId, {
        proveedor_id: proveedor_id || null,
        fecha: fecha || new Date().toISOString(),
        numero_factura: numero_factura || '',
        items: itemsCalculados,
        total_compra,
        observaciones: observaciones || '',
        usuario_id: auth.userId
      });

      await registrarAuditoria(
        auth.empresaId, auth.userId, 'crear', 'inventario', 'compras',
        compra.id, null, { total_compra, items: itemsCalculados.length },
        c.req.header('x-forwarded-for') || null
      );

      return c.json({ compra }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al registrar compra', details: error.message }, 500);
    }
  });
}
