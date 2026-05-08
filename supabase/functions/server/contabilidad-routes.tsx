// =====================================================
// RUTAS: CONTABILIDAD - Plan NEC Ecuador + Partida Doble
// =====================================================

import {
  obtenerCuentas, guardarCuenta, eliminarCuenta,
  obtenerAsientos, guardarAsiento,
  obtenerPresupuesto, guardarPresupuesto,
} from "./kv-helpers.tsx";
import * as kv from "./kv_store.tsx";

// ─── Plan Contable NEC Ecuador para restaurante ───────────────────────────────

const PLAN_CONTABLE_ECUADOR = [
  // ACTIVOS
  { codigo: '1', nombre: 'ACTIVOS', tipo: 'activo', nivel: 1, naturaleza: 'deudora', es_grupo: true },
  { codigo: '1.1', nombre: 'ACTIVOS CORRIENTES', tipo: 'activo', nivel: 2, naturaleza: 'deudora', es_grupo: true },
  { codigo: '1.1.01', nombre: 'Caja', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.1.02', nombre: 'Bancos', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.1.03', nombre: 'Cuentas por Cobrar Clientes', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.1.04', nombre: 'Documentos por Cobrar', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.1.05', nombre: 'Inventario de Alimentos y Bebidas', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.1.06', nombre: 'IVA en Compras', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.1.07', nombre: 'Anticipo Impuesto a la Renta', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.1.08', nombre: 'Retenciones IVA Recibidas', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.1.09', nombre: 'Retenciones Renta Recibidas', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.1.10', nombre: 'Crédito Tributario IVA', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.2', nombre: 'ACTIVOS NO CORRIENTES', tipo: 'activo', nivel: 2, naturaleza: 'deudora', es_grupo: true },
  { codigo: '1.2.01', nombre: 'Muebles y Enseres', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.2.02', nombre: 'Equipo de Cocina', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.2.03', nombre: 'Equipo de Computación', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.2.04', nombre: 'Vehículos', tipo: 'activo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '1.2.05', nombre: 'Depreciación Acumulada Muebles', tipo: 'activo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '1.2.06', nombre: 'Depreciación Acumulada Equipo Cocina', tipo: 'activo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '1.2.07', nombre: 'Depreciación Acumulada Vehículos', tipo: 'activo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  // PASIVOS
  { codigo: '2', nombre: 'PASIVOS', tipo: 'pasivo', nivel: 1, naturaleza: 'acreedora', es_grupo: true },
  { codigo: '2.1', nombre: 'PASIVOS CORRIENTES', tipo: 'pasivo', nivel: 2, naturaleza: 'acreedora', es_grupo: true },
  { codigo: '2.1.01', nombre: 'Cuentas por Pagar Proveedores', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '2.1.02', nombre: 'Documentos por Pagar', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '2.1.03', nombre: 'IVA en Ventas por Pagar', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '2.1.04', nombre: 'Retenciones IVA por Pagar', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '2.1.05', nombre: 'Retenciones Renta por Pagar', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '2.1.06', nombre: 'IESS por Pagar (Personal)', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '2.1.07', nombre: 'IESS por Pagar (Patronal)', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '2.1.08', nombre: 'Sueldos y Salarios por Pagar', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '2.1.09', nombre: '15% Trabajadores por Pagar', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '2.1.10', nombre: 'Impuesto a la Renta por Pagar', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '2.2', nombre: 'PASIVOS NO CORRIENTES', tipo: 'pasivo', nivel: 2, naturaleza: 'acreedora', es_grupo: true },
  { codigo: '2.2.01', nombre: 'Préstamos Bancarios Largo Plazo', tipo: 'pasivo', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  // PATRIMONIO
  { codigo: '3', nombre: 'PATRIMONIO', tipo: 'patrimonio', nivel: 1, naturaleza: 'acreedora', es_grupo: true },
  { codigo: '3.1', nombre: 'CAPITAL Y RESERVAS', tipo: 'patrimonio', nivel: 2, naturaleza: 'acreedora', es_grupo: true },
  { codigo: '3.1.01', nombre: 'Capital Social', tipo: 'patrimonio', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '3.1.02', nombre: 'Reserva Legal (10%)', tipo: 'patrimonio', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '3.1.03', nombre: 'Utilidades Retenidas', tipo: 'patrimonio', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '3.1.04', nombre: 'Utilidad del Ejercicio', tipo: 'patrimonio', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  // INGRESOS
  { codigo: '4', nombre: 'INGRESOS', tipo: 'ingreso', nivel: 1, naturaleza: 'acreedora', es_grupo: true },
  { codigo: '4.1', nombre: 'INGRESOS OPERACIONALES', tipo: 'ingreso', nivel: 2, naturaleza: 'acreedora', es_grupo: true },
  { codigo: '4.1.01', nombre: 'Ventas Alimentos y Bebidas (15% IVA)', tipo: 'ingreso', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '4.1.02', nombre: 'Ventas Alimentos (0% IVA)', tipo: 'ingreso', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '4.1.03', nombre: 'Servicios de Catering', tipo: 'ingreso', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '4.2', nombre: 'OTROS INGRESOS', tipo: 'ingreso', nivel: 2, naturaleza: 'acreedora', es_grupo: true },
  { codigo: '4.2.01', nombre: 'Ingresos por Intereses', tipo: 'ingreso', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  { codigo: '4.2.02', nombre: 'Otros Ingresos No Operacionales', tipo: 'ingreso', nivel: 3, naturaleza: 'acreedora', es_grupo: false },
  // COSTOS
  { codigo: '5', nombre: 'COSTOS', tipo: 'costo', nivel: 1, naturaleza: 'deudora', es_grupo: true },
  { codigo: '5.1', nombre: 'COSTO DE VENTAS', tipo: 'costo', nivel: 2, naturaleza: 'deudora', es_grupo: true },
  { codigo: '5.1.01', nombre: 'Costo de Alimentos Vendidos', tipo: 'costo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '5.1.02', nombre: 'Costo de Bebidas Vendidas', tipo: 'costo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '5.1.03', nombre: 'Mermas y Desperdicios', tipo: 'costo', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  // GASTOS
  { codigo: '6', nombre: 'GASTOS', tipo: 'gasto', nivel: 1, naturaleza: 'deudora', es_grupo: true },
  { codigo: '6.1', nombre: 'GASTOS DE PERSONAL', tipo: 'gasto', nivel: 2, naturaleza: 'deudora', es_grupo: true },
  { codigo: '6.1.01', nombre: 'Sueldos y Salarios', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.1.02', nombre: 'Horas Extras', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.1.03', nombre: 'Décimo Tercer Sueldo', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.1.04', nombre: 'Décimo Cuarto Sueldo', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.1.05', nombre: 'Vacaciones', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.1.06', nombre: 'Aporte Patronal IESS (12.15%)', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.1.07', nombre: 'Fondos de Reserva IESS', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.2', nombre: 'GASTOS OPERACIONALES', tipo: 'gasto', nivel: 2, naturaleza: 'deudora', es_grupo: true },
  { codigo: '6.2.01', nombre: 'Arriendos y Alquileres', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.2.02', nombre: 'Servicios Básicos (Agua, Luz, Gas)', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.2.03', nombre: 'Internet y Telefonía', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.2.04', nombre: 'Publicidad y Marketing', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.2.05', nombre: 'Suministros de Oficina', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.2.06', nombre: 'Suministros de Limpieza', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.2.07', nombre: 'Mantenimiento y Reparación', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.2.08', nombre: 'Combustible y Transporte', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.2.09', nombre: 'Uniformes e Implementos', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.2.10', nombre: 'Seguros', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.3', nombre: 'GASTOS FINANCIEROS', tipo: 'gasto', nivel: 2, naturaleza: 'deudora', es_grupo: true },
  { codigo: '6.3.01', nombre: 'Intereses Bancarios', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.3.02', nombre: 'Comisiones Bancarias', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.4', nombre: 'GASTOS NO DEDUCIBLES', tipo: 'gasto', nivel: 2, naturaleza: 'deudora', es_grupo: true },
  { codigo: '6.4.01', nombre: 'Depreciación Activos Fijos', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.4.02', nombre: 'Multas e Intereses SRI', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
  { codigo: '6.4.03', nombre: 'Gastos No Deducibles Varios', tipo: 'gasto', nivel: 3, naturaleza: 'deudora', es_grupo: false },
];

// ─── Helper: calcular saldos desde asientos ──────────────────────────────────

function calcularSaldosCuentas(cuentas: any[], asientos: any[], fechaInicio?: string, fechaFin?: string) {
  const saldos: Record<string, number> = {};

  const asientosFiltrados = asientos.filter((a: any) => {
    if (a.estado === 'anulado') return false;
    if (fechaInicio && a.fecha < fechaInicio) return false;
    if (fechaFin && a.fecha > fechaFin) return false;
    return true;
  });

  for (const asiento of asientosFiltrados) {
    for (const item of (asiento.items || [])) {
      const cuentaId = item.cuenta_id;
      if (!saldos[cuentaId]) saldos[cuentaId] = 0;
      const cuenta = cuentas.find((c: any) => c.id === cuentaId);
      const naturaleza = cuenta?.naturaleza || 'deudora';
      if (naturaleza === 'deudora') {
        saldos[cuentaId] += (item.debito || 0) - (item.credito || 0);
      } else {
        saldos[cuentaId] += (item.credito || 0) - (item.debito || 0);
      }
    }
  }
  return saldos;
}

// ─── Libro Mayor por cuenta ───────────────────────────────────────────────────

function calcularLibroMayor(cuentaId: string, asientos: any[], naturaleza: string) {
  const movimientos: any[] = [];
  let saldoAcumulado = 0;

  const asientosOrdenados = asientos
    .filter((a: any) => a.estado !== 'anulado')
    .sort((a: any, b: any) => a.fecha.localeCompare(b.fecha));

  for (const asiento of asientosOrdenados) {
    for (const item of (asiento.items || [])) {
      if (item.cuenta_id !== cuentaId) continue;
      const debito = item.debito || 0;
      const credito = item.credito || 0;
      if (naturaleza === 'deudora') {
        saldoAcumulado += debito - credito;
      } else {
        saldoAcumulado += credito - debito;
      }
      movimientos.push({
        fecha: asiento.fecha,
        numero: asiento.numero,
        descripcion: asiento.descripcion,
        detalle: item.descripcion,
        debito,
        credito,
        saldo: saldoAcumulado,
      });
    }
  }
  return movimientos;
}

// ─── Flujo de efectivo (método indirecto) ────────────────────────────────────

function calcularFlujoEfectivo(cuentas: any[], asientos: any[], fechaInicio: string, fechaFin: string) {
  const saldos = calcularSaldosCuentas(cuentas, asientos, fechaInicio, fechaFin);
  const getSaldo = (tipo: string) => cuentas
    .filter((c: any) => c.tipo === tipo && !c.es_grupo)
    .reduce((sum: number, c: any) => sum + (saldos[c.id] || 0), 0);

  const utilidadNeta = getSaldo('ingreso') - getSaldo('costo') - getSaldo('gasto');
  const depreciacion = cuentas
    .filter((c: any) => c.codigo?.startsWith('6.4.01'))
    .reduce((sum: number, c: any) => sum + (saldos[c.id] || 0), 0);
  const varCxC = -(cuentas.filter((c: any) => c.codigo === '1.1.03').reduce((s: number, c: any) => s + (saldos[c.id] || 0), 0));
  const varInventario = -(cuentas.filter((c: any) => c.codigo === '1.1.05').reduce((s: number, c: any) => s + (saldos[c.id] || 0), 0));
  const varCxP = cuentas.filter((c: any) => c.codigo === '2.1.01').reduce((s: number, c: any) => s + (saldos[c.id] || 0), 0);

  const flujoOperativo = utilidadNeta + depreciacion + varCxC + varInventario + varCxP;

  const activosFijos = cuentas.filter((c: any) => ['1.2.01','1.2.02','1.2.03','1.2.04'].includes(c.codigo))
    .reduce((s: number, c: any) => s + (saldos[c.id] || 0), 0);

  const flujoInversion = -activosFijos;
  const flujoPrestamos = cuentas.filter((c: any) => c.codigo === '2.2.01').reduce((s: number, c: any) => s + (saldos[c.id] || 0), 0);
  const flujoFinanciamiento = flujoPrestamos;
  const flujoNeto = flujoOperativo + flujoInversion + flujoFinanciamiento;

  return {
    operativo: {
      utilidad_neta: utilidadNeta,
      depreciacion,
      variacion_cxc: varCxC,
      variacion_inventario: varInventario,
      variacion_cxp: varCxP,
      total: flujoOperativo,
    },
    inversion: {
      compra_activos: -activosFijos,
      total: flujoInversion,
    },
    financiamiento: {
      prestamos: flujoPrestamos,
      total: flujoFinanciamiento,
    },
    flujo_neto: flujoNeto,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function setupContabilidadRoutes(app: any, authMiddleware: any) {

  // ── Catálogo de Cuentas ───────────────────────────────────────────────────

  app.get("/server/contabilidad/cuentas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const cuentas = await obtenerCuentas(auth.empresaId);
      return c.json({ cuentas });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post("/server/contabilidad/cuentas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const cuenta = await guardarCuenta(auth.empresaId, { ...body, empresa_id: auth.empresaId });
      return c.json({ cuenta }, 201);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.put("/server/contabilidad/cuentas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    try {
      const body = await c.req.json();
      const cuenta = await guardarCuenta(auth.empresaId, { ...body, id });
      return c.json({ cuenta });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.delete("/server/contabilidad/cuentas/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    try {
      // Verificar que no tenga asientos
      const asientos = await obtenerAsientos(auth.empresaId);
      const tieneMovimientos = asientos.some((a: any) =>
        a.items?.some((i: any) => i.cuenta_id === id)
      );
      if (tieneMovimientos) {
        return c.json({ error: 'No se puede eliminar una cuenta con movimientos registrados' }, 400);
      }
      await eliminarCuenta(auth.empresaId, id);
      return c.json({ message: 'Cuenta eliminada' });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Inicializar Plan Contable Ecuador
  app.post("/server/contabilidad/cuentas/inicializar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const existentes = await obtenerCuentas(auth.empresaId);
      if (existentes.length > 0) {
        return c.json({ message: 'El catálogo ya tiene cuentas', total: existentes.length });
      }
      const cuentas = PLAN_CONTABLE_ECUADOR.map((ct) => ({
        ...ct,
        id: crypto.randomUUID(),
        empresa_id: auth.empresaId,
        activa: true,
        created_at: new Date().toISOString(),
      }));
      await kv.set(`empresa_${auth.empresaId}_cuentas_contables`, cuentas);
      return c.json({ message: 'Plan Contable NEC Ecuador inicializado', total: cuentas.length });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ── Asientos Contables ────────────────────────────────────────────────────

  app.get("/server/contabilidad/asientos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { fecha_inicio, fecha_fin, estado, tipo } = c.req.query() as any;
      let asientos = await obtenerAsientos(auth.empresaId);
      if (fecha_inicio) asientos = asientos.filter((a: any) => a.fecha >= fecha_inicio);
      if (fecha_fin) asientos = asientos.filter((a: any) => a.fecha <= fecha_fin);
      if (estado) asientos = asientos.filter((a: any) => a.estado === estado);
      if (tipo) asientos = asientos.filter((a: any) => a.tipo === tipo);
      asientos.sort((a: any, b: any) => {
        const fc = b.fecha.localeCompare(a.fecha);
        return fc !== 0 ? fc : (b.numero || '').localeCompare(a.numero || '');
      });
      return c.json({ asientos });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post("/server/contabilidad/asientos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      // Validar balance
      const totalD = body.items?.reduce((s: number, i: any) => s + (i.debito || 0), 0) || 0;
      const totalC = body.items?.reduce((s: number, i: any) => s + (i.credito || 0), 0) || 0;
      if (Math.abs(totalD - totalC) > 0.01) {
        return c.json({ error: `Asiento desbalanceado: Débitos ${totalD.toFixed(2)} ≠ Créditos ${totalC.toFixed(2)}` }, 400);
      }
      const asiento = await guardarAsiento(auth.empresaId, {
        ...body,
        empresa_id: auth.empresaId,
        usuario_id: auth.userId,
        estado: 'activo',
        total_debito: totalD,
        total_credito: totalC,
      });
      return c.json({ asiento }, 201);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Anular asiento (genera asiento de reversión)
  app.post("/server/contabilidad/asientos/:id/anular", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    try {
      const body = await c.req.json();
      const asientos = await obtenerAsientos(auth.empresaId);
      const asiento = asientos.find((a: any) => a.id === id);
      if (!asiento) return c.json({ error: 'Asiento no encontrado' }, 404);
      if (asiento.estado === 'anulado') return c.json({ error: 'Asiento ya anulado' }, 400);

      // Marcar como anulado
      await guardarAsiento(auth.empresaId, { ...asiento, estado: 'anulado', motivo_anulacion: body.motivo || 'Anulado' });

      // Crear asiento de reversión
      const reversion = await guardarAsiento(auth.empresaId, {
        empresa_id: auth.empresaId,
        usuario_id: auth.userId,
        fecha: body.fecha || new Date().toISOString().split('T')[0],
        descripcion: `REVERSIÓN: ${asiento.descripcion}`,
        referencia: asiento.numero,
        tipo: 'anulacion',
        estado: 'activo',
        items: asiento.items.map((i: any) => ({
          ...i,
          debito: i.credito,
          credito: i.debito,
          descripcion: `Reversión: ${i.descripcion}`,
        })),
        total_debito: asiento.total_credito,
        total_credito: asiento.total_debito,
      });

      return c.json({ message: 'Asiento anulado', reversion });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ── Libro Mayor ───────────────────────────────────────────────────────────

  app.get("/server/contabilidad/libro-mayor/:cuentaId", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const cuentaId = c.req.param('cuentaId');
    try {
      const cuentas = await obtenerCuentas(auth.empresaId);
      const cuenta = cuentas.find((ct: any) => ct.id === cuentaId);
      if (!cuenta) return c.json({ error: 'Cuenta no encontrada' }, 404);
      const asientos = await obtenerAsientos(auth.empresaId);
      const movimientos = calcularLibroMayor(cuentaId, asientos, cuenta.naturaleza || 'deudora');
      return c.json({ cuenta, movimientos, saldo_final: movimientos.at(-1)?.saldo || 0 });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ── Reportes Financieros ──────────────────────────────────────────────────

  app.get("/server/contabilidad/reportes/balance", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { fecha_hasta } = c.req.query() as any;
      const cuentas = await obtenerCuentas(auth.empresaId);
      const asientos = await obtenerAsientos(auth.empresaId);
      const saldos = calcularSaldosCuentas(cuentas, asientos, undefined, fecha_hasta);

      const cuentasConSaldo = cuentas.map((ct: any) => ({
        ...ct,
        saldo_calculado: saldos[ct.id] || 0,
      }));

      const totalActivo = cuentas.filter((ct: any) => ct.tipo === 'activo' && !ct.es_grupo)
        .reduce((s: number, ct: any) => s + (saldos[ct.id] || 0), 0);
      const totalPasivo = cuentas.filter((ct: any) => ct.tipo === 'pasivo' && !ct.es_grupo)
        .reduce((s: number, ct: any) => s + (saldos[ct.id] || 0), 0);
      const totalPatrimonio = cuentas.filter((ct: any) => ct.tipo === 'patrimonio' && !ct.es_grupo)
        .reduce((s: number, ct: any) => s + (saldos[ct.id] || 0), 0);

      return c.json({
        cuentas: cuentasConSaldo,
        totales: { activo: totalActivo, pasivo: totalPasivo, patrimonio: totalPatrimonio },
        balanceado: Math.abs(totalActivo - (totalPasivo + totalPatrimonio)) < 1,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.get("/server/contabilidad/reportes/resultados", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { fecha_inicio, fecha_fin } = c.req.query() as any;
      const cuentas = await obtenerCuentas(auth.empresaId);
      const asientos = await obtenerAsientos(auth.empresaId);
      const saldos = calcularSaldosCuentas(cuentas, asientos, fecha_inicio, fecha_fin);

      const totalIngreso = cuentas.filter((ct: any) => ct.tipo === 'ingreso' && !ct.es_grupo)
        .reduce((s: number, ct: any) => s + (saldos[ct.id] || 0), 0);
      const totalCosto = cuentas.filter((ct: any) => ct.tipo === 'costo' && !ct.es_grupo)
        .reduce((s: number, ct: any) => s + (saldos[ct.id] || 0), 0);
      const totalGasto = cuentas.filter((ct: any) => ct.tipo === 'gasto' && !ct.es_grupo)
        .reduce((s: number, ct: any) => s + (saldos[ct.id] || 0), 0);
      const utilidadBruta = totalIngreso - totalCosto;
      const utilidadOperacional = utilidadBruta - totalGasto;
      const participacionTrabajadores = Math.max(0, utilidadOperacional * 0.15);
      const utilidadAntesIR = utilidadOperacional - participacionTrabajadores;
      const impuestoRenta = Math.max(0, utilidadAntesIR * 0.25);
      const utilidadNeta = utilidadAntesIR - impuestoRenta;

      return c.json({
        cuentas: cuentas.map((ct: any) => ({ ...ct, saldo_calculado: saldos[ct.id] || 0 })),
        resumen: {
          total_ingreso: totalIngreso,
          total_costo: totalCosto,
          utilidad_bruta: utilidadBruta,
          margen_bruto: totalIngreso > 0 ? (utilidadBruta / totalIngreso) * 100 : 0,
          total_gasto: totalGasto,
          utilidad_operacional: utilidadOperacional,
          margen_operacional: totalIngreso > 0 ? (utilidadOperacional / totalIngreso) * 100 : 0,
          participacion_trabajadores: participacionTrabajadores,
          utilidad_antes_ir: utilidadAntesIR,
          impuesto_renta: impuestoRenta,
          utilidad_neta: utilidadNeta,
          margen_neto: totalIngreso > 0 ? (utilidadNeta / totalIngreso) * 100 : 0,
        },
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.get("/server/contabilidad/reportes/flujo-efectivo", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { fecha_inicio, fecha_fin } = c.req.query() as any;
      const fi = fecha_inicio || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const ff = fecha_fin || new Date().toISOString().split('T')[0];
      const cuentas = await obtenerCuentas(auth.empresaId);
      const asientos = await obtenerAsientos(auth.empresaId);
      const flujo = calcularFlujoEfectivo(cuentas, asientos, fi, ff);
      return c.json({ flujo, periodo: { inicio: fi, fin: ff } });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ── Presupuesto ───────────────────────────────────────────────────────────

  app.get("/server/contabilidad/presupuesto/:anio", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const anio = parseInt(c.req.param('anio'));
    try {
      const items = await obtenerPresupuesto(auth.empresaId, anio);
      const cuentas = await obtenerCuentas(auth.empresaId);
      const asientos = await obtenerAsientos(auth.empresaId);
      const fi = `${anio}-01-01`;
      const ff = `${anio}-12-31`;
      const saldos = calcularSaldosCuentas(cuentas, asientos, fi, ff);
      const itemsConReal = items.map((item: any) => ({
        ...item,
        real: saldos[item.cuenta_id] || 0,
        variacion: (saldos[item.cuenta_id] || 0) - (item.presupuesto || 0),
        cumplimiento: item.presupuesto > 0 ? ((saldos[item.cuenta_id] || 0) / item.presupuesto) * 100 : 0,
      }));
      return c.json({ presupuesto: itemsConReal, anio });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post("/server/contabilidad/presupuesto/:anio", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const anio = parseInt(c.req.param('anio'));
    try {
      const body = await c.req.json();
      const items = await guardarPresupuesto(auth.empresaId, anio, body.items || []);
      return c.json({ presupuesto: items, anio });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ── Dashboard / KPIs ──────────────────────────────────────────────────────

  app.get("/server/contabilidad/dashboard", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const hoy = new Date();
      const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
      const inicioAnio = `${hoy.getFullYear()}-01-01`;
      const hoyStr = hoy.toISOString().split('T')[0];

      const cuentas = await obtenerCuentas(auth.empresaId);
      const asientos = await obtenerAsientos(auth.empresaId);

      const saldosMes = calcularSaldosCuentas(cuentas, asientos, inicioMes, hoyStr);
      const saldosAnio = calcularSaldosCuentas(cuentas, asientos, inicioAnio, hoyStr);
      const saldosTotal = calcularSaldosCuentas(cuentas, asientos);

      const ingresoMes = cuentas.filter((ct: any) => ct.tipo === 'ingreso' && !ct.es_grupo)
        .reduce((s: number, ct: any) => s + (saldosMes[ct.id] || 0), 0);
      const gastoMes = cuentas.filter((ct: any) => (ct.tipo === 'gasto' || ct.tipo === 'costo') && !ct.es_grupo)
        .reduce((s: number, ct: any) => s + (saldosMes[ct.id] || 0), 0);
      const ingresoAnio = cuentas.filter((ct: any) => ct.tipo === 'ingreso' && !ct.es_grupo)
        .reduce((s: number, ct: any) => s + (saldosAnio[ct.id] || 0), 0);

      const caja = cuentas.filter((ct: any) => ['1.1.01','1.1.02'].includes(ct.codigo))
        .reduce((s: number, ct: any) => s + (saldosTotal[ct.id] || 0), 0);
      const cxc = cuentas.filter((ct: any) => ct.codigo === '1.1.03')
        .reduce((s: number, ct: any) => s + (saldosTotal[ct.id] || 0), 0);
      const cxp = cuentas.filter((ct: any) => ct.codigo === '2.1.01')
        .reduce((s: number, ct: any) => s + (saldosTotal[ct.id] || 0), 0);

      return c.json({
        mes: { ingreso: ingresoMes, gasto: gastoMes, utilidad: ingresoMes - gastoMes },
        anio: { ingreso: ingresoAnio },
        liquidez: { caja, cxc, cxp, ratio_corriente: cxp > 0 ? (caja + cxc) / cxp : 0 },
        total_asientos: asientos.filter((a: any) => a.estado !== 'anulado').length,
        total_cuentas: cuentas.filter((ct: any) => !ct.es_grupo).length,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });
}
