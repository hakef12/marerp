import { createClient } from "npm:@supabase/supabase-js";
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
  guardarCompra,
  obtenerCuentasPorPagar,
  guardarCuentaPorPagar,
  marcarCxPPagada,
  registrarAsientoAutomatico,
  obtenerAsientos
} from "./kv-helpers.tsx";
import { registrarAuditoria, verificarPassword } from "./audit-helper.tsx";
import { recalcularRecetasAfectadas } from "./cocina-routes.tsx";
import { validarLimite } from "./planes.tsx";

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

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

      // ── Verificar límite de productos del plan ────────────────────
      const existentes = await obtenerProductos(auth.empresaId);

      const { data: empresa } = await getDB()
        .from('empresas').select('plan_tipo').eq('id', auth.empresaId).single();

      const chkProductos = validarLimite(empresa?.plan_tipo || 'basico', 'productos_max', existentes.length);
      if (!chkProductos.valido) {
        return c.json({ error: chkProductos.mensaje, codigo: 'LIMITE_ALCANZADO' }, 403);
      }

      if (body.codigo) {
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
      // SEGURIDAD: guardarProducto() hace upsert por `id` (sin filtrar por empresa).
      // Si el id no pertenece a esta empresa, NO continuar — de lo contrario
      // otra empresa podría sobrescribir/secuestrar un producto ajeno pasando su id.
      if (!anterior) return c.json({ error: 'Producto no encontrado' }, 404);

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

  app.post("/server/categorias/inicializar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const existentes = await obtenerCategorias(auth.empresaId);
      if (existentes && existentes.length > 0) {
        return c.json({ ok: true, mensaje: 'Ya tiene categorías', categorias: existentes }, 409);
      }
      const defaults = [
        { nombre: 'Alimentos', color: '#f97316', icono: '🍽️' },
        { nombre: 'Bebidas', color: '#3b82f6', icono: '🥤' },
        { nombre: 'Postres', color: '#ec4899', icono: '🍰' },
        { nombre: 'Entradas', color: '#22c55e', icono: '🥗' },
        { nombre: 'Insumos', color: '#8b5cf6', icono: '📦' },
        { nombre: 'Limpieza', color: '#06b6d4', icono: '🧹' },
        { nombre: 'Otros', color: '#6b7280', icono: '📋' },
      ];
      const creadas = await Promise.all(
        defaults.map(cat => guardarCategoria(auth.empresaId, cat))
      );
      return c.json({ ok: true, categorias: creadas }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al inicializar categorías', details: error.message }, 500);
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
      // SEGURIDAD: guardarCategoria() hace upsert por `id` sin filtrar por empresa.
      // Verificar que la categoría exista y sea de esta empresa antes de continuar
      // — si no, otra empresa podría secuestrar/sobrescribir una categoría ajena.
      const actuales = await obtenerCategorias(auth.empresaId);
      if (!actuales.find((cat: any) => cat.id === categoriaId)) {
        return c.json({ error: 'Categoría no encontrada' }, 404);
      }

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
      // SEGURIDAD: guardarBodega() hace upsert por `id` sin filtrar por empresa.
      // Sin esta verificación, otra empresa podría secuestrar/sobrescribir
      // (incluso reasignar el empresa_id de) una bodega ajena pasando su id.
      const actuales = await obtenerBodegas(auth.empresaId);
      if (!actuales.find((b: any) => b.id === bodegaId)) {
        return c.json({ error: 'Bodega no encontrada' }, 404);
      }

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
      return c.json({ error: 'Error al crear proveedor', details: error.message }, 500);
    }
  });

  app.put("/server/proveedores/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const proveedorId = c.req.param('id');
    try {
      // SEGURIDAD: guardarProveedor() hace upsert por `id` sin filtrar por empresa.
      // Verificar propiedad antes de continuar para evitar que otra empresa
      // secuestre/sobrescriba un proveedor ajeno pasando su id por la URL.
      const actuales = await obtenerProveedores(auth.empresaId);
      if (!actuales.find((p: any) => p.id === proveedorId)) {
        return c.json({ error: 'Proveedor no encontrado' }, 404);
      }

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
      const db = getDB();
      const {
        page = '1', limit = '50',
        fecha_inicio, fecha_fin, tipo, producto_id,
      } = c.req.query() as any;

      const pageNum  = Math.max(1, parseInt(page)  || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const from = (pageNum - 1) * limitNum;
      const to   = from + limitNum - 1;

      let q = db.from('movimientos_inventario')
        .select('*', { count: 'exact' })
        .eq('empresa_id', auth.empresaId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (fecha_inicio) q = q.gte('created_at', fecha_inicio);
      if (fecha_fin)    q = q.lte('created_at', fecha_fin + 'T23:59:59');
      if (tipo)         q = q.eq('tipo', tipo);
      if (producto_id)  q = q.eq('producto_id', producto_id);

      const { data, error, count } = await q;
      if (error) throw error;

      const [productos, bodegas] = await Promise.all([
        obtenerProductos(auth.empresaId),
        obtenerBodegas(auth.empresaId),
      ]);
      const productosMap = new Map(productos.map((p: any) => [p.id, p]));
      const bodegasMap   = new Map(bodegas.map((b: any)   => [b.id, b]));

      // Usuarios de esta página solamente
      const usuarioIds = [...new Set((data || []).map((m: any) => m.usuario_id).filter(Boolean))];
      let usuariosMap: Record<string, any> = {};
      if (usuarioIds.length > 0) {
        const { data: usuarios } = await db.from('usuarios').select('id, nombre_completo').in('id', usuarioIds);
        if (usuarios) usuariosMap = Object.fromEntries(usuarios.map((u: any) => [u.id, u]));
      }

      const enriquecidos = (data || []).map((mov: any) => {
        const producto = productosMap.get(mov.producto_id);
        const bodega   = bodegasMap.get(mov.bodega_id);
        return {
          ...mov,
          productos: producto ? { id: producto.id, codigo: producto.codigo, nombre: producto.nombre } : null,
          bodegas:   bodega   ? { id: bodega.id,   codigo: bodega.codigo,   nombre: bodega.nombre   } : null,
          usuarios:  usuariosMap[mov.usuario_id] || null,
        };
      });

      return c.json({
        movimientos: enriquecidos,
        total: count || 0,
        page:  pageNum,
        limit: limitNum,
        pages: Math.ceil((count || 0) / limitNum),
      });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener movimientos', details: error.message }, 500);
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

      // ── Asiento contable por tipo de movimiento ───────────────
      const costo = Number(body.costo_unitario || 0) * Number(body.cantidad || 0);
      const fechaMov = (body.fecha || new Date().toISOString()).split('T')[0];
      const descMov  = body.referencia || body.observaciones || `Movimiento ${body.tipo}`;
      if (costo > 0) {
        if (body.tipo === 'salida' || body.tipo === 'merma' || body.tipo === 'ajuste_negativo') {
          await registrarAsientoAutomatico(auth.empresaId, {
            tipo: 'ajuste_inventario',
            descripcion: descMov,
            referencia: movimiento.id,
            fecha: fechaMov,
            items: [
              { codigo: '5.1.03', debito: costo,  descripcion: 'Merma / baja de inventario' },
              { codigo: '1.1.05', credito: costo, descripcion: 'Inventario' },
            ],
          });
        } else if (body.tipo === 'entrada' || body.tipo === 'ajuste_positivo') {
          // Entrada manual/ajuste positivo: el crédito va a Otros Ingresos (4.2.02)
          // NO a CxP (2.1.01) — las compras reales tienen su propio asiento en POST /compras
          // Usar 2.1.01 aquí generaría un pasivo ficticio sin factura de respaldo
          await registrarAsientoAutomatico(auth.empresaId, {
            tipo: 'ajuste_inventario',
            descripcion: descMov,
            referencia: movimiento.id,
            fecha: fechaMov,
            items: [
              { codigo: '1.1.05', debito: costo,  descripcion: 'Entrada / ajuste positivo de inventario' },
              { codigo: '4.2.02', credito: costo, descripcion: 'Ajuste de inventario (ingreso no operacional)' },
            ],
          });
        }
      }

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
      const db = getDB();
      const {
        page = '1', limit = '20',
        fecha_inicio, fecha_fin, proveedor_id,
      } = c.req.query() as any;

      const pageNum  = Math.max(1, parseInt(page)  || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

      // ── Intentar SQL primero, con fallback a obtenerCompras (KV) ─────────
      let todasLasCompras: any[] = [];
      let usandoSQL = false;

      try {
        const from = (pageNum - 1) * limitNum;
        const to   = from + limitNum - 1;

        let q = db.from('compras')
          .select('*', { count: 'exact' })
          .eq('empresa_id', auth.empresaId)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (fecha_inicio) q = q.gte('fecha', fecha_inicio);
        if (fecha_fin)    q = q.lte('fecha', fecha_fin);
        if (proveedor_id) q = q.eq('proveedor_id', proveedor_id);

        const { data, error, count } = await q;
        if (error) throw error;

        if ((count || 0) > 0 || data?.length) {
          // SQL tiene datos — usarlo directamente con paginación
          usandoSQL = true;
          const [productos, proveedores] = await Promise.all([
            obtenerProductos(auth.empresaId),
            obtenerProveedores(auth.empresaId),
          ]);
          const productosMap  = new Map(productos.map((p: any)  => [p.id, p]));
          const proveedoresMap = new Map(proveedores.map((p: any) => [p.id, p]));

          const comprasEnriquecidas = (data || []).map((row: any) => ({
            ...row,
            numero_factura: row.numero || row.numero_factura,
            total_compra:   row.total  || row.total_compra,
            proveedor: proveedoresMap.get(row.proveedor_id) || null,
            items: (row.items || []).map((item: any) => ({
              ...item,
              producto: productosMap.get(item.producto_id) || null,
            })),
          }));

          return c.json({
            compras: comprasEnriquecidas,
            total:   count || 0,
            page:    pageNum,
            limit:   limitNum,
            pages:   Math.ceil((count || 0) / limitNum),
          });
        }
      } catch (_sqlErr) {
        console.warn('[compras] SQL falló, intentando KV fallback');
      }

      // ── Fallback: usar obtenerCompras (SQL + KV) y paginar en memoria ────
      if (!usandoSQL) {
        todasLasCompras = await obtenerCompras(auth.empresaId);

        // Si compras sigue vacío, intentar construir desde cuentas_por_pagar
        // (pasa cuando las compras antiguas se registraron solo como CxP)
        if (todasLasCompras.length === 0) {
          try {
            const cxpList = await obtenerCuentasPorPagar(auth.empresaId);
            if (cxpList.length > 0) {
              console.log(`[compras] Sin compras en SQL/KV — usando ${cxpList.length} registros de CxP como fallback`);
              todasLasCompras = cxpList.map((cxp: any) => {
                // numero_factura y fecha_emision se guardan en metadata.* en CxP
                const meta = cxp.metadata || {};
                const numFac  = cxp.numero_factura || meta.numero_factura || cxp.numero || null;
                const fechaDoc = cxp.fecha_emision || meta.fecha_emision || cxp.fecha || cxp.created_at;
                return {
                  id:               cxp.id,
                  empresa_id:       cxp.empresa_id,
                  proveedor_id:     cxp.proveedor_id || null,
                  proveedor_nombre: cxp.proveedor_nombre || meta.proveedor_nombre || null,
                  numero:           numFac,
                  numero_factura:   numFac,
                  fecha:            fechaDoc,
                  total:            Number(cxp.monto || 0),
                  total_compra:     Number(cxp.monto || 0),
                  subtotal:         Number(meta.total_sin_impuestos || cxp.monto || 0),
                  iva:              Number(meta.total_iva || 0),
                  estado:           cxp.estado || 'pendiente',
                  estado_pago:      cxp.estado || 'pendiente',
                  forma_pago:       cxp.tipo_pago || meta.tipo_pago || 'credito',
                  tipo_pago:        cxp.tipo_pago || meta.tipo_pago || 'credito',
                  saldo_pendiente:  Number(cxp.saldo_pendiente ?? cxp.monto ?? 0),
                  items:            [],
                  metadata:         meta,
                  created_at:       cxp.created_at,
                  _fuente:          'cxp',
                };
              });
            }
          } catch (cxpErr: any) {
            console.warn('[compras] Falló fallback CxP:', cxpErr.message);
          }
        }

        // Filtros en memoria
        if (fecha_inicio) todasLasCompras = todasLasCompras.filter((c: any) => (c.fecha || c.created_at || '') >= fecha_inicio);
        if (fecha_fin)    todasLasCompras = todasLasCompras.filter((c: any) => (c.fecha || c.created_at || '') <= fecha_fin + 'T23:59:59');
        if (proveedor_id) todasLasCompras = todasLasCompras.filter((c: any) => c.proveedor_id === proveedor_id);

        // Ordenar por fecha desc
        todasLasCompras.sort((a: any, b: any) => {
          const da = a.created_at || a.fecha || '';
          const db2 = b.created_at || b.fecha || '';
          return db2.localeCompare(da);
        });

        const [productos, proveedores] = await Promise.all([
          obtenerProductos(auth.empresaId),
          obtenerProveedores(auth.empresaId),
        ]);
        const productosMap  = new Map(productos.map((p: any)  => [p.id, p]));
        const proveedoresMap = new Map(proveedores.map((p: any) => [p.id, p]));

        const total = todasLasCompras.length;
        const slice = todasLasCompras.slice((pageNum - 1) * limitNum, pageNum * limitNum);

        const enriquecidas = slice.map((row: any) => ({
          ...row,
          proveedor: proveedoresMap.get(row.proveedor_id)
            || (row.proveedor_nombre ? { id: row.proveedor_id, nombre: row.proveedor_nombre } : null),
          items: (row.items || []).map((item: any) => ({
            ...item,
            producto: productosMap.get(item.producto_id) || null,
          })),
        }));

        return c.json({
          compras: enriquecidas,
          total,
          page:  pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        });
      }
    } catch (error: any) {
      return c.json({ error: 'Error al obtener compras', details: error.message }, 500);
    }
  });

  app.post("/server/compras", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    let paso = 'inicio';
    try {
      const body = await c.req.json();
      const {
        proveedor_id, fecha, numero_factura, items, observaciones,
        tipo_pago = 'contado',
        fecha_vencimiento,
        // Opcionales del XML SRI:
        numero_autorizacion, clave_acceso,
        total_sin_impuestos, total_iva, total_descuento, info_sri,
        xml_original,
      } = body;

      if (!items || items.length === 0) {
        return c.json({ error: 'Debes agregar al menos un ítem a la compra' }, 400);
      }

      // ── Verificar factura duplicada ────────────────────────────────────────
      if (numero_factura) {
        const db = (await import("npm:@supabase/supabase-js")).createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        const { data: existente } = await db
          .from('compras')
          .select('id, fecha, total')
          .eq('empresa_id', auth.empresaId)
          .eq('numero', numero_factura)
          .maybeSingle();
        if (existente) {
          return c.json({
            error: `La factura N° ${numero_factura} ya fue registrada anteriormente`,
            compra_existente: existente,
          }, 409);
        }
      }

      paso = 'mapear_items';
      // Cada item: cantidad = unidades a ingresar al stock
      //            a_inventario: true (default) = actualiza stock | false = solo gasto
      const itemsCalculados = items.map((item: any) => {
        const cantidad       = Number(item.cantidad)    || 0;
        const costo_total    = Number(item.costo_total) || 0;
        // Respetar tipo_contable si viene del frontend; tipo 'inventario' → afecta stock
        const tipoContable   = item.tipo_contable || (item.producto_id ? 'inventario' : 'gasto_operativo');
        const a_inventario   = item.afecta_stock !== undefined ? item.afecta_stock
          : item.a_inventario !== undefined ? item.a_inventario !== false
          : tipoContable === 'inventario';
        const costo_unitario = a_inventario && cantidad > 0 ? costo_total / cantidad : 0;
        return {
          ...item,            // mantiene todos los campos originales (fiscal, xml, etc.)
          cantidad,
          costo_total,
          costo_unitario,
          a_inventario,
        };
      });

      const total_compra = itemsCalculados.reduce((s: number, i: any) => s + i.costo_total, 0);

      paso = 'movimientos';
      // Lista de items cuyo costo NO se aplico al producto por sospecha de error.
      // Se devuelve al frontend para que muestre advertencia.
      const costosSospechosos: any[] = [];
      const costosAplicados: any[] = [];

      // DB client reutilizable (en lugar de re-importar en cada iteracion)
      const dbClient = (await import("npm:@supabase/supabase-js")).createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      for (const item of itemsCalculados) {
        // Solo items de inventario con producto asignado crean movimientos de stock
        if (!item.a_inventario || !item.producto_id) continue;

        // PASO 1: Leer estado actual del producto ANTES del movimiento
        // (necesitamos stock_anterior y costo_anterior para promedio ponderado)
        let stockAnterior = 0;
        let costoAnterior = 0;
        let precioVenta = 0;
        let nombreProducto = '';
        try {
          const { data: prodAct } = await dbClient.from('productos')
            .select('stock_actual,costo_unitario,precio_costo,precio_venta,precio,nombre')
            .eq('id', item.producto_id)
            .eq('empresa_id', auth.empresaId)
            .maybeSingle();
          if (prodAct) {
            stockAnterior = Number(prodAct.stock_actual) || 0;
            costoAnterior = Number(prodAct.costo_unitario) || Number(prodAct.precio_costo) || 0;
            precioVenta   = Number(prodAct.precio_venta) || Number(prodAct.precio) || 0;
            nombreProducto = prodAct.nombre || '';
          }
        } catch { /* si falla la lectura, seguimos con valores en 0 */ }

        // PASO 2: Registrar el movimiento (ingresa stock)
        await guardarMovimiento(auth.empresaId, {
          tipo: 'entrada',
          producto_id:    item.producto_id,
          bodega_id:      item.bodega_id || null,
          cantidad:       item.cantidad,
          costo_unitario: item.costo_unitario,
          referencia:     numero_factura ? `Compra ${numero_factura}` : 'Compra directa',
          observaciones:  observaciones || '',
          usuario_id:     auth.userId,
        });

        // PASO 3: Calcular costo promedio ponderado (NIC 2) y validar
        if (item.costo_unitario > 0) {
          const cantidadNueva = Number(item.cantidad) || 0;
          const costoFactura  = Number(item.costo_unitario) || 0;
          // Promedio ponderado: si no habia stock anterior o costo anterior, usar el de la factura
          const costoPonderado = (stockAnterior > 0 && costoAnterior > 0)
            ? (stockAnterior * costoAnterior + cantidadNueva * costoFactura) / (stockAnterior + cantidadNueva)
            : costoFactura;
          const costoFinal = Math.round(costoPonderado * 10000) / 10000;

          // Validacion defensiva: si el costo resultante supera el 80% del precio
          // de venta, probablemente la cantidad esta mal capturada (paquete vs unidad).
          // No actualizamos para no envenenar la data — pero registramos el movimiento.
          const esSospechoso = precioVenta > 0 && costoFinal > precioVenta * 0.8;

          if (esSospechoso) {
            costosSospechosos.push({
              producto_id: item.producto_id,
              nombre: nombreProducto || item.descripcion || 'Sin nombre',
              precio_venta: precioVenta,
              costo_anterior: costoAnterior,
              costo_factura: costoFactura,
              costo_propuesto: costoFinal,
              cantidad_factura: cantidadNueva,
              ratio: precioVenta > 0 ? Math.round(costoFinal / precioVenta * 100) / 100 : 0,
              motivo: `Costo propuesto $${costoFinal.toFixed(2)} es el ${(costoFinal/precioVenta*100).toFixed(0)}% del precio de venta $${precioVenta.toFixed(2)}. Posible error en cantidad/unidad. Stock no se afecta — solo el costo del producto se mantuvo en $${costoAnterior.toFixed(2)}.`,
            });
            // Importante: NO actualizamos precio_costo/costo_unitario del producto.
            // El movimiento ya quedo registrado con el costo de la factura para trazabilidad,
            // pero el master del producto conserva el costo anterior valido.
          } else {
            await dbClient.from('productos')
              .update({
                precio_costo:   costoFinal,
                costo_unitario: costoFinal,
                costo_promedio: costoFinal,
                updated_at:     new Date().toISOString(),
              })
              .eq('id', item.producto_id)
              .eq('empresa_id', auth.empresaId);
            costosAplicados.push({
              producto_id: item.producto_id,
              nombre: nombreProducto,
              costo_anterior: costoAnterior,
              costo_nuevo: costoFinal,
              metodo: stockAnterior > 0 ? 'promedio_ponderado' : 'primer_costo',
            });
          }
        }
      }

      paso = 'guardar_compra';
      // Metadata fiscal del SRI (opcional — solo cuando viene de XML)
      const metadataSRI: Record<string, any> = {};
      if (numero_autorizacion)  metadataSRI.numero_autorizacion  = numero_autorizacion;
      if (clave_acceso)         metadataSRI.clave_acceso         = clave_acceso;
      if (total_sin_impuestos != null) metadataSRI.total_sin_impuestos = Number(total_sin_impuestos);
      if (total_iva != null)    metadataSRI.total_iva            = Number(total_iva);
      if (total_descuento)      metadataSRI.total_descuento      = Number(total_descuento);
      if (info_sri)             metadataSRI.info_sri             = info_sri;
      if (xml_original)         metadataSRI.xml_original         = xml_original;

      const compra = await guardarCompra(auth.empresaId, {
        proveedor_id:      proveedor_id || null,
        fecha:             fecha || new Date().toISOString(),
        numero_factura:    numero_factura || '',
        items:             itemsCalculados,
        total_compra,
        observaciones:     observaciones || '',
        usuario_id:        auth.userId,
        tipo_pago,
        fecha_vencimiento: tipo_pago === 'credito' ? (fecha_vencimiento || null) : null,
        estado_pago:       tipo_pago === 'contado' ? 'pagada' : 'pendiente',
        saldo_pendiente:   tipo_pago === 'credito' ? total_compra : 0,
        // metadata va por separado dentro de guardarCompra (try-catch interno)
        ...(Object.keys(metadataSRI).length > 0 ? { metadata: metadataSRI } : {}),
      });

      paso = 'auditoria';
      await registrarAuditoria(
        auth.empresaId, auth.userId, 'crear', 'inventario', 'compras',
        compra.id, null, { total_compra, tipo_pago, items: itemsCalculados.length },
        c.req.header('x-forwarded-for') || null
      );

      paso = 'cxp';
      if (tipo_pago === 'credito' && total_compra > 0) {
        await guardarCuentaPorPagar(auth.empresaId, {
          proveedor_id:      proveedor_id || null,
          compra_id:         compra.id,
          numero_factura:    numero_factura || '',
          monto:             total_compra,
          saldo_pendiente:   total_compra,
          monto_pagado:      0,
          fecha_emision:     (fecha || new Date().toISOString()).split('T')[0],
          fecha_vencimiento: fecha_vencimiento || null,
          estado:            'pendiente',
        });
      }

      paso = 'asiento';
      if (total_compra > 0) {
        try {
          const db2 = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
          );

          const cuentaCredito = tipo_pago === 'contado' ? '10101' : '2010301';
          const descCredito   = tipo_pago === 'contado' ? 'Pago en efectivo/banco' : 'CxP proveedores';

          // Mapa tipo_contable → código de cuenta (Plan SRI Ecuador oficial)
          const TIPO_A_CODIGO: Record<string, string> = {
            'inventario':       '510102',  // Compras Netas Locales de Bienes
            'gasto_servicio':   '520118',  // Agua, Energía, Luz y Telecomunicaciones
            'gasto_basicos':    '520118',  // Agua, Energía, Luz y Telecomunicaciones
            'gasto_arriendo':   '520109',  // Arrendamiento Operativo
            'gasto_publicidad': '520111',  // Promoción y Publicidad
            'gasto_operativo':  '520108',  // Mantenimiento y Reparaciones
            'activo_fijo':      '1020106', // Maquinaria y Equipo
          };

          // Agrupar por tipo
          const porTipo: Record<string, number> = {};
          for (const item of (items || [])) {
            const tipo = item.tipo_contable || (item.a_inventario !== false ? 'inventario' : 'gasto_operativo');
            porTipo[tipo] = (porTipo[tipo] || 0) + Number(item.costo_total || 0);
          }
          if (Object.keys(porTipo).length === 0) porTipo['inventario'] = total_compra;

          // Buscar cuentas en la BD directamente (sin pasar por obtenerCuentas/KV)
          const codigos = [...new Set([...Object.values(TIPO_A_CODIGO), cuentaCredito])];
          const { data: cuentasDB } = await db2.from('cuentas_contables')
            .select('id, codigo, nombre').eq('empresa_id', auth.empresaId)
            .in('codigo', codigos);

          const cuentaMap: Record<string, any> = {};
          for (const c of (cuentasDB || [])) cuentaMap[c.codigo] = c;

          // Resolver cuenta con fallback por prefijo
          const resolverDirecto = (codigo: string) => {
            if (cuentaMap[codigo]) return cuentaMap[codigo];
            // Buscar por prefijo (6.2.03 → 6.2 → 6)
            const partes = codigo.split('.');
            for (let n = partes.length - 1; n >= 1; n--) {
              const prefijo = partes.slice(0, n).join('.');
              const alt = Object.values(cuentaMap).find((c: any) => c.codigo?.startsWith(prefijo + '.'));
              if (alt) return alt;
            }
            return null;
          };

          // Construir ítems del asiento con IDs reales
          const asientoItemsDirecto: any[] = [];
          for (const [tipo, monto] of Object.entries(porTipo)) {
            const codigoCuenta = TIPO_A_CODIGO[tipo] || '520108';
            const cuenta = resolverDirecto(codigoCuenta);
            if (cuenta) {
              asientoItemsDirecto.push({
                cuenta_id: cuenta.id, cuenta_codigo: cuenta.codigo, cuenta_nombre: cuenta.nombre,
                debito: parseFloat(monto.toFixed(2)), credito: 0, descripcion: tipo,
              });
            }
          }

          const ctaCredito = resolverDirecto(cuentaCredito);
          if (ctaCredito && asientoItemsDirecto.length > 0) {
            asientoItemsDirecto.push({
              cuenta_id: ctaCredito.id, cuenta_codigo: ctaCredito.codigo, cuenta_nombre: ctaCredito.nombre,
              debito: 0, credito: parseFloat(total_compra.toFixed(2)), descripcion: descCredito,
            });

            const fechaCompra = (fecha || new Date().toISOString()).split('T')[0];
            const numeroAsiento = `ASI-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;

            const { error: asientoErr } = await db2.from('asientos_contables').insert({
              id: crypto.randomUUID(),
              empresa_id: auth.empresaId,
              numero: numeroAsiento,
              fecha: fechaCompra,
              descripcion: `Compra ${numero_factura || compra.id} (${tipo_pago === 'contado' ? 'Contado' : 'Crédito'})`,
              tipo: 'compra_inventario',
              referencia: compra.id,
              estado: 'activo',
              origen_automatico: true,
              items: asientoItemsDirecto,
              total_debito: parseFloat(total_compra.toFixed(2)),
              total_credito: parseFloat(total_compra.toFixed(2)),
            });

            if (asientoErr) console.error('[compras] Asiento no guardado:', asientoErr.message);
            else console.log(`[compras] Asiento ${numeroAsiento} creado para compra ${compra.id}`);
          } else {
            console.warn('[compras] Cuentas no encontradas — asiento no generado. Cuenta crédito:', cuentaCredito, '| Items:', asientoItemsDirecto.length);
          }
        } catch (asientoErr: any) {
          // No bloquear la compra si falla el asiento
          console.error('[compras] Error generando asiento:', asientoErr?.message);
        }
      }

      // PASO FINAL: Recalcular recetas afectadas en cascada.
      // Si alguno de los productos cuyo costo cambio es un ingrediente de una
      // receta, la receta (y los platos que la usen) se recalculan automaticamente.
      const idsConCostoActualizado = costosAplicados.map((c: any) => c.producto_id);
      let recalcRecetas = { recetas_actualizadas: 0, productos_actualizados: [] as any[] };
      if (idsConCostoActualizado.length > 0) {
        try {
          recalcRecetas = await recalcularRecetasAfectadas(auth.empresaId, idsConCostoActualizado);
        } catch (e: any) {
          console.warn('[compras] Recalculo de recetas fallo:', e?.message);
        }
      }

      return c.json({
        compra,
        costos_aplicados: costosAplicados,
        costos_sospechosos: costosSospechosos,
        recetas_recalculadas: recalcRecetas.recetas_actualizadas,
        platos_actualizados: recalcRecetas.productos_actualizados,
        aviso: costosSospechosos.length > 0
          ? `${costosSospechosos.length} producto(s) NO actualizaron su costo por sospecha de error en cantidad/unidad. Revisa el detalle.`
          : null,
      }, 201);
    } catch (error: any) {
      console.error(`[compras POST] Error en paso "${paso}":`, error?.message);
      return c.json({ error: 'Error al registrar compra', details: error.message, paso }, 500);
    }
  });

  // ── GET /compras/cxp — Cuentas por pagar ──────────────────────
  app.get("/server/compras/cxp", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const cxpList = await obtenerCuentasPorPagar(auth.empresaId);
      const proveedores = await obtenerProveedores(auth.empresaId);
      const provMap = new Map(proveedores.map((p: any) => [p.id, p]));
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const enriquecidas = cxpList
        .map((cxp: any) => {
          const diasRestantes = cxp.fecha_vencimiento
            ? Math.ceil((new Date(cxp.fecha_vencimiento).getTime() - hoy.getTime()) / 86400000)
            : null;
          // numero_factura y fecha_emision se guardan en metadata (no son columnas directas)
          const numeroFactura = cxp.numero_factura ?? cxp.metadata?.numero_factura ?? null;
          const fechaEmision  = cxp.fecha_emision  ?? cxp.metadata?.fecha_emision  ?? null;
          return {
            ...cxp,
            numero_factura: numeroFactura,
            fecha_emision:  fechaEmision,
            proveedor:      provMap.get(cxp.proveedor_id) || null,
            dias_restantes: diasRestantes,
          };
        })
        .sort((a: any, b: any) => {
          if (!a.fecha_vencimiento) return 1;
          if (!b.fecha_vencimiento) return -1;
          return new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime();
        });
      return c.json({ cxp: enriquecidas });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener cuentas por pagar' }, 500);
    }
  });

  // ── POST /compras/cxp/:id/pagar — Registrar pago de CxP ───────
  app.post("/server/compras/cxp/:id/pagar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const cxpId = c.req.param('id');
    try {
      const { monto } = await c.req.json();
      if (!monto || Number(monto) <= 0) return c.json({ error: 'Monto inválido' }, 400);
      const cxp = await marcarCxPPagada(auth.empresaId, cxpId, Number(monto));
      if (!cxp) return c.json({ error: 'Cuenta por pagar no encontrada' }, 404);

      // Asiento contable: débito CxP → crédito Bancos
      await registrarAsientoAutomatico(auth.empresaId, {
        tipo: 'pago_proveedor',
        descripcion: `Pago proveedor - ${cxp.numero_factura || cxpId}`,
        referencia: cxpId,
        fecha: new Date().toISOString().split('T')[0],
        items: [
          { codigo: '2.1.01', debito: Number(monto),  descripcion: 'Cancelación CxP proveedor' },
          { codigo: '1.1.01', credito: Number(monto), descripcion: 'Pago desde caja/banco' },
        ],
      });

      return c.json({ cxp });
    } catch (error: any) {
      return c.json({ error: 'Error al registrar pago', details: error.message }, 500);
    }
  });

  // ── POST /compras/parsear-xml — Parsear XML del SRI ─────────────────────────
  app.post("/server/compras/parsear-xml", authMiddleware, async (c: any) => {
    try {
      const body = await c.req.json();
      const xmlRaw: string = body.xmlContent || '';
      if (!xmlRaw.trim()) return c.json({ error: 'xmlContent vacío' }, 400);

      // Helper: extract first tag content (strips nested tags for simple values)
      const tag = (xml: string, t: string): string => {
        const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i'));
        return m ? m[1].trim() : '';
      };

      // Helper: extract all occurrences of a block tag
      const allTags = (xml: string, t: string): string[] => {
        const re = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'gi');
        const out: string[] = [];
        let m;
        while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
        return out;
      };

      // ── Nivel 1: extraer número de autorización y CDATA del comprobante ──────
      const numeroAutorizacion = tag(xmlRaw, 'numeroAutorizacion') ||
                                  tag(xmlRaw, 'claveAcceso') || '';
      const cdataMatch = xmlRaw.match(/<comprobante><!\[CDATA\[([\s\S]*?)\]\]><\/comprobante>/i);
      const innerXml = cdataMatch ? cdataMatch[1] : xmlRaw;

      // ── Nivel 2: parsear factura interna ──────────────────────────────────────
      const infoTrib = tag(innerXml, 'infoTributaria');
      const infoFact = tag(innerXml, 'infoFactura');
      const detallesXml = tag(innerXml, 'detalles');

      const ruc            = tag(infoTrib, 'ruc');
      const razonSocial    = tag(infoTrib, 'razonSocial');
      const nombreComercial= tag(infoTrib, 'nombreComercial') || razonSocial;
      const dirMatriz      = tag(infoTrib, 'dirMatriz') || '';
      const estab          = tag(infoTrib, 'estab');
      const ptoEmi         = tag(infoTrib, 'ptoEmi');
      const secuencial     = tag(infoTrib, 'secuencial');
      const claveAcceso    = tag(infoTrib, 'claveAcceso') || numeroAutorizacion;
      const numeroFactura  = `${estab}-${ptoEmi}-${secuencial}`;

      // Fecha emisión: "DD/MM/YYYY" → "YYYY-MM-DD"
      const fechaRaw = tag(infoFact, 'fechaEmision');
      let fecha = fechaRaw;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(fechaRaw)) {
        const [d, m, y] = fechaRaw.split('/');
        fecha = `${y}-${m}-${d}`;
      }

      const totalSinImpuestos = parseFloat(tag(infoFact, 'totalSinImpuestos') || '0');
      const importeTotal      = parseFloat(tag(infoFact, 'importeTotal')       || '0');
      const totalDescuento    = parseFloat(tag(infoFact, 'totalDescuento')     || '0');
      const totalIva          = parseFloat(tag(infoFact, 'totalImpuesto')      || '0') ||
                                 (importeTotal - totalSinImpuestos);

      // Dirección / info extra
      const guiaRemision  = tag(infoFact, 'guiaRemision') || '';
      const obligadoLlevarContabilidad = tag(infoFact, 'obligadoContabilidad') || '';

      // Forma(s) de pago del XML → mapeamos a nuestra terminología
      const pagosXml = tag(infoFact, 'pagos');
      const pagoBlocks = allTags(pagosXml, 'pago');
      const formasPagoMap: Record<string, string> = {
        '01': 'efectivo', '15': 'compensacion', '16': 'tarjeta_debito',
        '17': 'transferencia', '18': 'debito', '19': 'tarjeta_credito',
        '20': 'otros', '21': 'endoso_titulo',
      };
      const pagosDetalle = pagoBlocks.map(p => ({
        codigo: tag(p, 'formaPago'),
        descripcion: formasPagoMap[tag(p, 'formaPago')] || tag(p, 'formaPago'),
        total: parseFloat(tag(p, 'total') || '0'),
        plazo: tag(p, 'plazo') || '',
        unidadTiempo: tag(p, 'unidadTiempo') || '',
      }));
      const formaPago = pagosDetalle[0]?.descripcion || 'efectivo';

      // ── Detalles (ítems de la factura) ────────────────────────────────────────
      const detalleBlocks = allTags(detallesXml, 'detalle');
      const items = detalleBlocks.map((d) => {
        const codigoPrincipal    = tag(d, 'codigoPrincipal');
        const codigoAuxiliar     = tag(d, 'codigoAuxiliar');
        const descripcion        = tag(d, 'descripcion');
        const cantidad           = parseFloat(tag(d, 'cantidad')              || '0');
        const precioUnitario     = parseFloat(tag(d, 'precioUnitario')        || '0');
        const descuento          = parseFloat(tag(d, 'descuento')             || '0');
        const precioTotalSinImp  = parseFloat(tag(d, 'precioTotalSinImpuesto')|| '0');

        // Puede haber múltiples impuestos por ítem
        const impuestosXml = tag(d, 'impuestos');
        const impuestoBlocks = allTags(impuestosXml, 'impuesto');
        let valorIvaItem = 0;
        let codigoPorcentaje = '0';
        let porcentajeIva = 0;
        for (const imp of impuestoBlocks) {
          const cod = tag(imp, 'codigo'); // 2=IVA, 3=ICE
          if (cod === '2') {
            codigoPorcentaje = tag(imp, 'codigoPorcentaje'); // 0=0%, 2=12%, 3=14%, 4=15%
            porcentajeIva = parseFloat(tag(imp, 'tarifa') || '0');
            valorIvaItem += parseFloat(tag(imp, 'valor') || '0');
          }
        }

        return {
          codigo: codigoPrincipal,
          codigo_auxiliar: codigoAuxiliar,
          descripcion,
          cantidad_xml: cantidad,          // cantidad original del XML (unidades de factura)
          precio_unitario: precioUnitario,
          descuento,
          subtotal: precioTotalSinImp,
          iva: parseFloat(valorIvaItem.toFixed(2)),
          porcentaje_iva: porcentajeIva,
          codigo_iva: codigoPorcentaje,
          total: parseFloat((precioTotalSinImp + valorIvaItem).toFixed(2)),
        };
      });

      return c.json({
        success: true,
        proveedor: { ruc, nombre: razonSocial, nombre_comercial: nombreComercial, direccion: dirMatriz },
        factura: {
          numero: numeroFactura,
          clave_acceso: claveAcceso,
          numero_autorizacion: numeroAutorizacion,
          fecha,
          total_sin_impuestos: totalSinImpuestos,
          total_descuento: totalDescuento,
          total_iva: parseFloat(totalIva.toFixed(2)),
          importe_total: importeTotal,
          forma_pago: formaPago,
          pagos: pagosDetalle,
          guia_remision: guiaRemision,
          obligado_llevar_contabilidad: obligadoLlevarContabilidad,
        },
        items,
      });
    } catch (error: any) {
      return c.json({ error: 'Error al parsear XML', details: error.message }, 500);
    }
  });

  // ── POST /compras/match-xml-items — Fuzzy-match items XML → inventario ──────
  app.post("/server/compras/match-xml-items", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { items } = await c.req.json();
      if (!Array.isArray(items)) return c.json({ error: 'items debe ser un array' }, 400);

      const productos = await obtenerProductos(auth.empresaId);

      // Normalizar texto: minúsculas, sin tildes, sin caracteres especiales
      const norm = (s: string) => s
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Similarity: Jaccard sobre bigramas + word overlap
      const similarity = (a: string, b: string): number => {
        const na = norm(a);
        const nb = norm(b);
        const wa = na.split(' ').filter(w => w.length > 1);
        const wb = nb.split(' ').filter(w => w.length > 1);
        if (!wa.length || !wb.length) return 0;

        // Word overlap con substring matching
        let matches = 0;
        for (const w of wa) {
          if (wb.some(x => x.includes(w) || w.includes(x))) matches++;
        }
        const recall = matches / wa.length;
        const precision = matches / wb.length;
        if (recall + precision === 0) return 0;
        return 2 * recall * precision / (recall + precision); // F1
      };

      const matchedItems = items.map((item: any) => {
        let bestScore = 0;
        let bestProducto: any = null;

        for (const p of productos) {
          const score = similarity(item.descripcion, p.nombre);
          if (score > bestScore) {
            bestScore = score;
            bestProducto = p;
          }
        }

        return {
          ...item,
          match: bestProducto && bestScore >= 0.25 ? {
            producto_id: bestProducto.id,
            nombre: bestProducto.nombre,
            score: Math.round(bestScore * 100),
            unidad_medida: bestProducto.unidad_medida,
            precio_compra: bestProducto.precio_compra,
          } : null,
          auto_matched: bestScore >= 0.5,
        };
      });

      return c.json({ success: true, items: matchedItems });
    } catch (error: any) {
      return c.json({ error: 'Error al hacer matching', details: error.message }, 500);
    }
  });

  // ── POST /compras/backfill-asientos — Retroactivo: crea asientos de compras sin asiento ──
  app.post("/server/compras/backfill-asientos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const compras = await obtenerCompras(auth.empresaId);
      const asientosExistentes = await obtenerAsientos(auth.empresaId);

      // Conjunto de referencias ya registradas en contabilidad
      const referenciasYaExistentes = new Set(
        asientosExistentes
          .filter((a: any) => a.tipo === 'compra_inventario')
          .map((a: any) => a.referencia)
      );

      const creados: string[] = [];
      const omitidos: string[] = [];

      for (const compra of compras) {
        if (!compra.id) continue;

        // Si ya existe un asiento con esta referencia, saltar
        if (referenciasYaExistentes.has(compra.id)) {
          omitidos.push(compra.numero_factura || compra.id);
          continue;
        }

        const total = Number(compra.total_compra) || 0;
        if (total <= 0) { omitidos.push(compra.numero_factura || compra.id); continue; }

        const tipoPago = compra.tipo_pago || 'contado'; // compras antiguas se asumen contado
        const cuentaCredito = tipoPago === 'credito' ? '2010301' : '10101';
        const descCredito   = tipoPago === 'credito' ? 'CxP Proveedores Locales' : 'Efectivo y Equivalentes';
        const fecha = (compra.fecha || compra.created_at || new Date().toISOString()).split('T')[0];

        // Usar inserción directa con cuentas reales de la BD (no 1.1.05 hardcodeado)
        const db2 = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        const { data: cuentasRetro } = await db2.from('cuentas_contables')
          .select('id,codigo,nombre').eq('empresa_id', auth.empresaId)
          .in('codigo', ['510102', cuentaCredito]);

        const mapRetro: Record<string,any> = {};
        for (const c of (cuentasRetro||[])) mapRetro[c.codigo] = c;

        // Fallback por prefijo
        const resolveRetro = (cod: string) => {
          if (mapRetro[cod]) return mapRetro[cod];
          const all = Object.values(mapRetro);
          const partes = cod.split('.');
          for (let n = partes.length-1; n>=1; n--) {
            const pfx = partes.slice(0,n).join('.');
            const alt = all.find((c:any) => c.codigo?.startsWith(pfx+'.'));
            if (alt) return alt;
          }
          return null;
        };

        const ctaCosto  = resolveRetro('510102');
        const ctaCredito = resolveRetro(cuentaCredito);
        if (!ctaCosto || !ctaCredito) { omitidos.push(`${compra.numero_factura||compra.id} (cuentas no encontradas)`); continue; }

        await db2.from('asientos_contables').insert({
          id: crypto.randomUUID(),
          empresa_id: auth.empresaId,
          numero: `ASI-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`,
          fecha,
          descripcion: `Compra ${compra.numero_factura || compra.id} (${tipoPago === 'credito' ? 'Crédito' : 'Contado'})`,
          tipo: 'compra_inventario',
          referencia: compra.id,
          estado: 'activo',
          origen_automatico: true,
          items: [
            { cuenta_id: ctaCosto.id,   cuenta_codigo: ctaCosto.codigo,   cuenta_nombre: ctaCosto.nombre,   debito: total, credito: 0,     descripcion: 'Costo de alimentos / inventario' },
            { cuenta_id: ctaCredito.id, cuenta_codigo: ctaCredito.codigo, cuenta_nombre: ctaCredito.nombre, debito: 0,     credito: total, descripcion: descCredito },
          ],
          total_debito: total,
          total_credito: total,
        });

        creados.push(compra.numero_factura || compra.id);
      }

      return c.json({
        success: true,
        creados: creados.length,
        omitidos: omitidos.length,
        detalle_creados: creados,
        detalle_omitidos: omitidos,
        mensaje: `${creados.length} asiento(s) creado(s), ${omitidos.length} ya existían o sin monto.`,
      });
    } catch (error: any) {
      return c.json({ error: 'Error en backfill de asientos', details: error.message }, 500);
    }
  });
}
