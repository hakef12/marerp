// =====================================================
// RUTAS: CONTABILIDAD - Plan NEC Ecuador + Partida Doble
// =====================================================

import { createClient } from "npm:@supabase/supabase-js";
import {
  obtenerCuentas, guardarCuenta, eliminarCuenta,
  obtenerAsientos, guardarAsiento,
  obtenerPresupuesto, guardarPresupuesto,
} from "./kv-helpers.tsx";

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ─── Plan Contable NEC Ecuador para restaurante ───────────────────────────────

// ── Plan de Cuentas Oficial SRI Ecuador (Resolución NAC-DGERCGC16-00000536)
// Adaptado para restaurante/empresa de servicios de alimentos
const PLAN_CONTABLE_ECUADOR = [
  // ════════════════════════════════════════════════════════════════════
  // ACTIVOS
  // ════════════════════════════════════════════════════════════════════
  { codigo: '1',       nombre: 'ACTIVO',                                     tipo: 'activo',     nivel: 1, es_grupo: true  },
  { codigo: '101',     nombre: 'ACTIVO CORRIENTE',                           tipo: 'activo',     nivel: 2, es_grupo: true  },
  // Efectivo (caja + bancos en una sola cuenta SRI)
  { codigo: '10101',   nombre: 'Efectivo y Equivalentes al Efectivo',        tipo: 'activo',     nivel: 3, es_grupo: false },
  // Activos Financieros (CxC)
  { codigo: '10102',   nombre: 'Activos Financieros',                        tipo: 'activo',     nivel: 3, es_grupo: true  },
  { codigo: '1010205', nombre: 'Documentos y CxC Clientes No Relacionados',  tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1010209', nombre: '(-) Provisión Cuentas Incobrables',          tipo: 'activo',     nivel: 4, es_grupo: false },
  // Inventarios
  { codigo: '10103',   nombre: 'Inventarios',                                tipo: 'activo',     nivel: 3, es_grupo: true  },
  { codigo: '1010301', nombre: 'Inventarios de Materia Prima',               tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1010306', nombre: 'Inventarios de Prod. Terminados / Mercad.',  tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1010312', nombre: 'Otros Inventarios',                          tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1010313', nombre: '(-) Provisión por Valor Neto de Realización',tipo: 'activo',     nivel: 4, es_grupo: false },
  // Servicios y Pagos Anticipados
  { codigo: '10104',   nombre: 'Servicios y Otros Pagos Anticipados',        tipo: 'activo',     nivel: 3, es_grupo: true  },
  { codigo: '1010401', nombre: 'Seguros Pagados por Anticipado',             tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1010402', nombre: 'Arriendos Pagados por Anticipado',           tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1010403', nombre: 'Anticipos a Proveedores',                    tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1010404', nombre: 'Otros Anticipos Entregados',                 tipo: 'activo',     nivel: 4, es_grupo: false },
  // Activos por Impuestos Corrientes
  { codigo: '10105',   nombre: 'Activos por Impuestos Corrientes',           tipo: 'activo',     nivel: 3, es_grupo: true  },
  { codigo: '1010501', nombre: 'Crédito Tributario a Favor (IVA)',           tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1010502', nombre: 'Crédito Tributario a Favor (I.R.)',          tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1010503', nombre: 'Anticipo de Impuesto a la Renta',            tipo: 'activo',     nivel: 4, es_grupo: false },
  // Activo No Corriente
  { codigo: '102',     nombre: 'ACTIVO NO CORRIENTE',                        tipo: 'activo',     nivel: 2, es_grupo: true  },
  { codigo: '10201',   nombre: 'Propiedades, Planta y Equipo',               tipo: 'activo',     nivel: 3, es_grupo: true  },
  { codigo: '1020104', nombre: 'Instalaciones',                              tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1020105', nombre: 'Muebles y Enseres',                          tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1020106', nombre: 'Maquinaria y Equipo (incl. Equipo Cocina)',  tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1020108', nombre: 'Equipo de Computación',                      tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1020109', nombre: 'Vehículos, Equipos de Transporte',           tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1020110', nombre: 'Otros Propiedades, Planta y Equipo',         tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1020112', nombre: '(-) Depreciación Acumulada PPE',             tipo: 'activo',     nivel: 4, es_grupo: false },
  { codigo: '1020113', nombre: '(-) Deterioro Acumulado PPE',                tipo: 'activo',     nivel: 4, es_grupo: false },

  // ════════════════════════════════════════════════════════════════════
  // PASIVOS
  // ════════════════════════════════════════════════════════════════════
  { codigo: '2',       nombre: 'PASIVO',                                     tipo: 'pasivo',     nivel: 1, es_grupo: true  },
  { codigo: '201',     nombre: 'PASIVO CORRIENTE',                           tipo: 'pasivo',     nivel: 2, es_grupo: true  },
  { codigo: '20103',   nombre: 'Cuentas y Documentos por Pagar',             tipo: 'pasivo',     nivel: 3, es_grupo: true  },
  { codigo: '2010301', nombre: 'CxP Proveedores Locales',                    tipo: 'pasivo',     nivel: 4, es_grupo: false },
  { codigo: '2010302', nombre: 'CxP Proveedores del Exterior',               tipo: 'pasivo',     nivel: 4, es_grupo: false },
  { codigo: '20104',   nombre: 'Obligaciones con Instituciones Financieras', tipo: 'pasivo',     nivel: 3, es_grupo: true  },
  { codigo: '2010401', nombre: 'Obligaciones Financieras Locales CP',        tipo: 'pasivo',     nivel: 4, es_grupo: false },
  { codigo: '20107',   nombre: 'Otras Obligaciones Corrientes',              tipo: 'pasivo',     nivel: 3, es_grupo: true  },
  { codigo: '2010701', nombre: 'Con la Administración Tributaria (IVA/Ret)', tipo: 'pasivo',     nivel: 4, es_grupo: false },
  { codigo: '2010702', nombre: 'Impuesto a la Renta por Pagar del Ejercicio',tipo: 'pasivo',     nivel: 4, es_grupo: false },
  { codigo: '2010703', nombre: 'Con el IESS',                                tipo: 'pasivo',     nivel: 4, es_grupo: false },
  { codigo: '2010704', nombre: 'Por Beneficios de Ley a Empleados',          tipo: 'pasivo',     nivel: 4, es_grupo: false },
  { codigo: '2010705', nombre: 'Participación Trabajadores por Pagar',       tipo: 'pasivo',     nivel: 4, es_grupo: false },
  { codigo: '20110',   nombre: 'Anticipos de Clientes',                      tipo: 'pasivo',     nivel: 3, es_grupo: false },
  { codigo: '202',     nombre: 'PASIVO NO CORRIENTE',                        tipo: 'pasivo',     nivel: 2, es_grupo: true  },
  { codigo: '20203',   nombre: 'Obligaciones Financieras Largo Plazo',       tipo: 'pasivo',     nivel: 3, es_grupo: false },
  { codigo: '20207',   nombre: 'Provisiones por Beneficios a Empleados',     tipo: 'pasivo',     nivel: 3, es_grupo: true  },
  { codigo: '2020701', nombre: 'Jubilación Patronal',                        tipo: 'pasivo',     nivel: 4, es_grupo: false },

  // ════════════════════════════════════════════════════════════════════
  // PATRIMONIO
  // ════════════════════════════════════════════════════════════════════
  { codigo: '3',       nombre: 'PATRIMONIO NETO',                            tipo: 'patrimonio', nivel: 1, es_grupo: true  },
  { codigo: '30',      nombre: 'Patrimonio Atribuible a Propietarios',       tipo: 'patrimonio', nivel: 2, es_grupo: true  },
  { codigo: '301',     nombre: 'Capital',                                    tipo: 'patrimonio', nivel: 3, es_grupo: true  },
  { codigo: '30101',   nombre: 'Capital Suscrito o Asignado',                tipo: 'patrimonio', nivel: 4, es_grupo: false },
  { codigo: '302',     nombre: 'Aportes para Futura Capitalización',         tipo: 'patrimonio', nivel: 3, es_grupo: false },
  { codigo: '304',     nombre: 'Reservas',                                   tipo: 'patrimonio', nivel: 3, es_grupo: true  },
  { codigo: '30401',   nombre: 'Reserva Legal',                              tipo: 'patrimonio', nivel: 4, es_grupo: false },
  { codigo: '30402',   nombre: 'Reservas Facultativa y Estatutaria',         tipo: 'patrimonio', nivel: 4, es_grupo: false },
  { codigo: '306',     nombre: 'Resultados Acumulados',                      tipo: 'patrimonio', nivel: 3, es_grupo: true  },
  { codigo: '30601',   nombre: 'Ganancias Acumuladas',                       tipo: 'patrimonio', nivel: 4, es_grupo: false },
  { codigo: '30602',   nombre: '(-) Pérdidas Acumuladas',                    tipo: 'patrimonio', nivel: 4, es_grupo: false },
  { codigo: '307',     nombre: 'Resultados del Ejercicio',                   tipo: 'patrimonio', nivel: 3, es_grupo: true  },
  { codigo: '30701',   nombre: 'Ganancia Neta del Periodo',                  tipo: 'patrimonio', nivel: 4, es_grupo: false },
  { codigo: '30702',   nombre: '(-) Pérdida Neta del Periodo',               tipo: 'patrimonio', nivel: 4, es_grupo: false },

  // ════════════════════════════════════════════════════════════════════
  // INGRESOS (Estado de Resultado Integral)
  // ════════════════════════════════════════════════════════════════════
  { codigo: '41',      nombre: 'INGRESOS DE ACTIVIDADES ORDINARIAS',         tipo: 'ingreso',    nivel: 1, es_grupo: true  },
  { codigo: '4101',    nombre: 'Venta de Bienes (Alimentos y Bebidas)',       tipo: 'ingreso',    nivel: 2, es_grupo: false },
  { codigo: '4102',    nombre: 'Prestación de Servicios (Catering/Eventos)', tipo: 'ingreso',    nivel: 2, es_grupo: false },
  { codigo: '4109',    nombre: 'Otros Ingresos de Actividades Ordinarias',   tipo: 'ingreso',    nivel: 2, es_grupo: false },
  { codigo: '4110',    nombre: '(-) Descuento en Ventas',                    tipo: 'ingreso',    nivel: 2, es_grupo: false },
  { codigo: '4111',    nombre: '(-) Devoluciones en Ventas',                 tipo: 'ingreso',    nivel: 2, es_grupo: false },
  { codigo: '43',      nombre: 'OTROS INGRESOS',                             tipo: 'ingreso',    nivel: 1, es_grupo: true  },
  { codigo: '4302',    nombre: 'Intereses Financieros',                      tipo: 'ingreso',    nivel: 2, es_grupo: false },
  { codigo: '4305',    nombre: 'Otras Rentas',                               tipo: 'ingreso',    nivel: 2, es_grupo: false },

  // ════════════════════════════════════════════════════════════════════
  // COSTO DE VENTAS Y PRODUCCIÓN
  // ════════════════════════════════════════════════════════════════════
  { codigo: '51',      nombre: 'COSTO DE VENTAS Y PRODUCCIÓN',               tipo: 'costo',      nivel: 1, es_grupo: true  },
  { codigo: '5101',    nombre: 'Materiales Utilizados / Productos Vendidos', tipo: 'costo',      nivel: 2, es_grupo: true  },
  { codigo: '510102',  nombre: 'Compras Netas Locales de Bienes (Mercad.)',  tipo: 'costo',      nivel: 3, es_grupo: false },
  { codigo: '510106',  nombre: 'Compras Netas Locales de Materia Prima',     tipo: 'costo',      nivel: 3, es_grupo: false },
  { codigo: '5102',    nombre: '(+) Mano de Obra Directa',                   tipo: 'costo',      nivel: 2, es_grupo: true  },
  { codigo: '510201',  nombre: 'Sueldos y Beneficios Sociales (Cocina)',     tipo: 'costo',      nivel: 3, es_grupo: false },
  { codigo: '5104',    nombre: '(+) Otros Costos Indirectos de Fabricación', tipo: 'costo',      nivel: 2, es_grupo: true  },
  { codigo: '510401',  nombre: 'Depreciación PPE (Producción)',              tipo: 'costo',      nivel: 3, es_grupo: false },
  { codigo: '510404',  nombre: 'Efecto Valor Neto de Realización Inventar.', tipo: 'costo',      nivel: 3, es_grupo: false },
  { codigo: '510406',  nombre: 'Mantenimiento y Reparaciones (Producción)',  tipo: 'costo',      nivel: 3, es_grupo: false },
  { codigo: '510407',  nombre: 'Suministros, Materiales y Repuestos',        tipo: 'costo',      nivel: 3, es_grupo: false },
  { codigo: '510408',  nombre: 'Otros Costos de Producción',                 tipo: 'costo',      nivel: 3, es_grupo: false },

  // ════════════════════════════════════════════════════════════════════
  // GASTOS
  // ════════════════════════════════════════════════════════════════════
  { codigo: '52',      nombre: 'GASTOS',                                     tipo: 'gasto',      nivel: 1, es_grupo: true  },
  { codigo: '5201',    nombre: 'Gastos de Administración y Ventas',          tipo: 'gasto',      nivel: 2, es_grupo: true  },
  { codigo: '520101',  nombre: 'Sueldos, Salarios y Demás Remuneraciones',  tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520102',  nombre: 'Aportes a la Seguridad Social (IESS)',      tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520103',  nombre: 'Beneficios Sociales e Indemnizaciones',     tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520104',  nombre: 'Gasto Planes de Beneficios a Empleados',    tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520105',  nombre: 'Honorarios, Comisiones y Dietas',           tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520108',  nombre: 'Mantenimiento y Reparaciones',               tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520109',  nombre: 'Arrendamiento Operativo',                   tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520111',  nombre: 'Promoción y Publicidad',                    tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520112',  nombre: 'Combustibles',                               tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520114',  nombre: 'Seguros y Reaseguros',                       tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520115',  nombre: 'Transporte',                                 tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520116',  nombre: 'Gastos de Gestión (Agasajos)',               tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520118',  nombre: 'Agua, Energía, Luz y Telecomunicaciones',   tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520119',  nombre: 'Notarios y Registradores',                  tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520121',  nombre: 'Depreciaciones',                             tipo: 'gasto',      nivel: 3, es_grupo: true  },
  { codigo: '52012101',nombre: 'Depreciaciones — Propiedades, Planta y Equipo', tipo: 'gasto', nivel: 4, es_grupo: false },
  { codigo: '520122',  nombre: 'Amortizaciones',                             tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520128',  nombre: 'Otros Gastos',                               tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '5202',    nombre: 'Gastos (Otros Operativos)',                  tipo: 'gasto',      nivel: 2, es_grupo: true  },
  { codigo: '520208',  nombre: 'Mantenimiento y Reparaciones (Adm.)',        tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520209',  nombre: 'Arrendamiento Operativo (Adm.)',             tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520218',  nombre: 'Agua, Energía, Luz y Telecom. (Adm.)',      tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520220',  nombre: 'Impuestos, Contribuciones y Otros',         tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520227',  nombre: 'Gasto Impuesto a la Renta (Diferido)',      tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520228',  nombre: 'Otros Gastos Generales',                    tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '5203',    nombre: 'Gastos Financieros',                        tipo: 'gasto',      nivel: 2, es_grupo: true  },
  { codigo: '520301',  nombre: 'Intereses Bancarios',                       tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520302',  nombre: 'Comisiones Bancarias',                      tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '520305',  nombre: 'Otros Gastos Financieros',                  tipo: 'gasto',      nivel: 3, es_grupo: false },
  { codigo: '5204',    nombre: 'Otros Gastos',                              tipo: 'gasto',      nivel: 2, es_grupo: true  },
  { codigo: '520402',  nombre: 'Otros Gastos No Operacionales',             tipo: 'gasto',      nivel: 3, es_grupo: false },
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
    .filter((c: any) => c.codigo === '52012101' || c.codigo === '510401')
    .reduce((sum: number, c: any) => sum + (saldos[c.id] || 0), 0);
  const varCxC = -(cuentas.filter((c: any) => c.codigo === '1010205').reduce((s: number, c: any) => s + (saldos[c.id] || 0), 0));
  const varInventario = -(cuentas.filter((c: any) => c.codigo?.startsWith('1010')).filter((c: any) => ['1010301','1010306','1010312'].includes(c.codigo)).reduce((s: number, c: any) => s + (saldos[c.id] || 0), 0));
  const varCxP = cuentas.filter((c: any) => c.codigo === '2010301').reduce((s: number, c: any) => s + (saldos[c.id] || 0), 0);

  const flujoOperativo = utilidadNeta + depreciacion + varCxC + varInventario + varCxP;

  const activosFijos = cuentas.filter((c: any) => ['1020104','1020105','1020106','1020108','1020109','1020110'].includes(c.codigo))
    .reduce((s: number, c: any) => s + (saldos[c.id] || 0), 0);

  const flujoInversion = -activosFijos;
  const flujoPrestamos = cuentas.filter((c: any) => c.codigo === '20203').reduce((s: number, c: any) => s + (saldos[c.id] || 0), 0);
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
      // IMPORTANTE: guardarCuenta() hace un upsert por `id` (onConflict: 'id') sin
      // filtrar por empresa_id. Si no verificamos aquí que la cuenta exista Y
      // pertenezca a esta empresa, otra empresa podría enviar el id de una cuenta
      // ajena y "secuestrarla" — el upsert la sobrescribiría completa, incluido
      // su empresa_id, robándola hacia el tenant atacante. Por eso este chequeo
      // de propiedad es obligatorio antes de delegar al helper.
      const db = getDB();
      const { data: existente } = await db
        .from('cuentas_contables')
        .select('id')
        .eq('id', id)
        .eq('empresa_id', auth.empresaId)
        .maybeSingle();
      if (!existente) return c.json({ error: 'Cuenta no encontrada' }, 404);

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

  // Inicializar / Sincronizar Plan Contable Ecuador
  app.post("/server/contabilidad/cuentas/inicializar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const db = getDB();
    try {
      // Leer directamente de SQL (sin fallback KV para evitar false-empty)
      const { data: existentesRaw, error: readErr } = await db
        .from('cuentas_contables')
        .select('codigo')
        .eq('empresa_id', auth.empresaId);
      if (readErr) throw new Error(`Error al leer plan contable: ${readErr.message} | ${readErr.details}`);

      const existentes = existentesRaw || [];

      // Mapeador seguro — columnas reales de cuentas_contables (verificadas):
      // id, empresa_id, codigo, nombre, tipo, subtipo, saldo_actual,
      // activa, created_at, updated_at, es_grupo, nivel
      // NOTA: naturaleza NO existe como columna — se deriva del tipo en runtime
      const toSafeRow = (ct: any) => ({
        id: crypto.randomUUID(),
        empresa_id: auth.empresaId,
        codigo: ct.codigo,
        nombre: ct.nombre,
        tipo: ct.tipo,
        es_grupo: ct.es_grupo ?? false,
        activa: true,
        nivel: ct.nivel ?? (ct.codigo ? ct.codigo.split('.').length : 3),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (existentes.length > 0) {
        // Sincronización: agregar solo cuentas faltantes
        const codigosExistentes = new Set(existentes.map((row: any) => row.codigo));
        const faltantes = PLAN_CONTABLE_ECUADOR.filter((ct) => !codigosExistentes.has(ct.codigo));
        if (faltantes.length === 0) {
          return c.json({ message: 'El catálogo ya está completo y actualizado', total: existentes.length });
        }
        const nuevas = faltantes.map(toSafeRow);
        const { error: syncErr } = await db.from('cuentas_contables').insert(nuevas);
        if (syncErr) throw new Error(`Error al sincronizar: ${syncErr.message} | ${syncErr.details}`);
        return c.json({
          message: `Plan Contable sincronizado: ${faltantes.length} cuenta(s) agregada(s)`,
          agregadas: faltantes.map((f) => f.codigo),
          total: existentes.length + faltantes.length,
        });
      }

      // Inicialización completa — upsert por (empresa_id, codigo) para evitar duplicados
      const cuentas = PLAN_CONTABLE_ECUADOR.map(toSafeRow);
      const { error: insErr } = await db
        .from('cuentas_contables')
        .upsert(cuentas, { onConflict: 'empresa_id,codigo' });
      if (insErr) throw new Error(`Error al inicializar: ${insErr.message} | ${insErr.details}`);
      return c.json({ message: 'Plan Contable NEC Ecuador inicializado', total: cuentas.length });
    } catch (e: any) {
      console.error('[Contabilidad] inicializar error:', e?.message);
      return c.json({ error: e.message }, 500);
    }
  });

  // ── Asientos Contables ────────────────────────────────────────────────────

  app.get("/server/contabilidad/asientos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const db = getDB();
      const { fecha_inicio, fecha_fin, estado, tipo, page = '1', limit = '50' } = c.req.query() as any;

      const pageNum  = Math.max(1, parseInt(page)  || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
      const from = (pageNum - 1) * limitNum;
      const to   = from + limitNum - 1;

      let q = db.from('asientos_contables')
        .select('*', { count: 'exact' })
        .eq('empresa_id', auth.empresaId)
        .order('fecha',  { ascending: false })
        .order('numero', { ascending: false })
        .range(from, to);

      if (fecha_inicio) q = q.gte('fecha', fecha_inicio);
      if (fecha_fin)    q = q.lte('fecha', fecha_fin);
      if (estado)       q = q.eq('estado', estado);
      if (tipo)         q = q.eq('tipo', tipo);

      const { data, error, count } = await q;
      if (error) throw error;

      return c.json({
        asientos: data || [],
        total:    count || 0,
        page:     pageNum,
        limit:    limitNum,
        pages:    Math.ceil((count || 0) / limitNum),
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post("/server/contabilidad/asientos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      // Verificar período bloqueado
      if (body.fecha) {
        const [anio, mes] = body.fecha.split('-').map(Number);
        const db2 = getDB();
        const { data: periodo } = await db2.from('periodos_contables')
          .select('estado').eq('empresa_id', auth.empresaId)
          .eq('anio', anio).eq('mes', mes).maybeSingle();
        if (periodo?.estado === 'cerrado')
          return c.json({ error: `El período ${mes}/${anio} está cerrado. No se pueden crear asientos en ese período.` }, 422);
      }
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
    const paso: string[] = [];
    try {
      paso.push('1-body');
      const body = await c.req.json().catch(() => ({}));

      paso.push('2-obtener-asientos');
      // Consulta directa a SQL (más confiable que obtenerAsientos con KV fallback)
      const db = getDB();
      const { data: asiento, error: sqlErr } = await db
        .from('asientos_contables')
        .select('*')
        .eq('id', id)
        .eq('empresa_id', auth.empresaId)
        .maybeSingle();

      if (sqlErr) return c.json({ error: 'Error SQL al buscar asiento', details: sqlErr.message, paso }, 500);
      if (!asiento) return c.json({ error: 'Asiento no encontrado', paso }, 404);
      if (asiento.estado === 'anulado') return c.json({ error: 'Asiento ya anulado', paso }, 400);

      paso.push('3-marcar-anulado');
      // Actualizar sólo campos seguros que existen en la tabla base
      // (metadata puede no estar en el schema cache de PostgREST si la columna fue agregada después)
      const updatePayload: Record<string, any> = {
        estado:     'anulado',
        updated_at: new Date().toISOString(),
      };
      // Intentar incluir metadata; si falla el UPDATE se reintenta sin ella
      updatePayload.metadata = {
        ...(asiento.metadata || {}),
        motivo_anulacion: body.motivo || 'Anulado',
      };

      let updErr: any = null;
      ({ error: updErr } = await db
        .from('asientos_contables')
        .update(updatePayload)
        .eq('id', id)
        .eq('empresa_id', auth.empresaId) as any);

      // Si falla por columna metadata inexistente, reintentar sin ella
      if (updErr && updErr.message?.includes('metadata')) {
        const { estado, updated_at } = updatePayload;
        ({ error: updErr } = await db
          .from('asientos_contables')
          .update({ estado, updated_at })
          .eq('id', id)
          .eq('empresa_id', auth.empresaId) as any);
      }
      if (updErr) return c.json({ error: 'Error al marcar como anulado', details: updErr.message, paso }, 500);

      paso.push('4-reversal-items');
      const itemsOriginales: any[] = Array.isArray(asiento.items) ? asiento.items : [];
      const itemsReversion = itemsOriginales.map((i: any) => ({
        cuenta_id:     i.cuenta_id     || null,
        cuenta_codigo: i.cuenta_codigo || '',
        cuenta_nombre: i.cuenta_nombre || '',
        debito:        Number(i.credito ?? 0),
        credito:       Number(i.debito  ?? 0),
        descripcion:   `Reversión: ${i.descripcion || ''}`,
      }));

      paso.push('5a-generar-id');
      const revId = crypto.randomUUID();
      const year  = new Date().getFullYear();

      paso.push('5b-contar-asientos');
      let numero = `ASI-${year}-REV-${Date.now()}`;   // fallback único
      try {
        const { count, error: cntErr } = await db.from('asientos_contables')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', auth.empresaId)
          .like('numero', `ASI-${year}%`);
        if (!cntErr) numero = `ASI-${year}-${String((count || 0) + 1).padStart(4, '0')}`;
      } catch (_) { /* usa el fallback */ }

      paso.push('5c-insertar-reversion');
      // Payload base — sólo columnas que existen en la tabla original (sin metadata/updated_at opcionales)
      const insertBase: Record<string, any> = {
        id:            revId,
        empresa_id:    auth.empresaId,
        numero,
        fecha:         (body.fecha || new Date().toISOString().split('T')[0]),
        descripcion:   `REVERSION: ${(asiento.descripcion || '').slice(0, 200)}`,
        referencia:    String(asiento.numero || ''),
        tipo:          'diario',
        estado:        'activo',
        items:         itemsReversion,
        total_debito:  Number(asiento.total_credito ?? 0),
        total_credito: Number(asiento.total_debito  ?? 0),
      };

      // Intentar con metadata + updated_at primero; si falla por schema, reintentar sin ellos
      let reversion: any = null;
      let revErr: any = null;

      ({ data: reversion, error: revErr } = await db
        .from('asientos_contables')
        .insert({ ...insertBase, metadata: { origen: 'anulacion', asiento_origen_id: id }, updated_at: new Date().toISOString() })
        .select().single() as any);

      if (revErr && (revErr.message?.includes('metadata') || revErr.message?.includes('updated_at'))) {
        // Reintentar sin columnas opcionales
        ({ data: reversion, error: revErr } = await db
          .from('asientos_contables')
          .insert(insertBase)
          .select().single() as any);
      }

      if (revErr) return c.json({ error: 'Error al crear revision', details: revErr.message, paso }, 500);

      return c.json({ message: 'Asiento anulado', reversion });
    } catch (e: any) {
      console.error('[anular-asiento] paso:', paso.at(-1), e);
      return c.json({ error: e.message, details: String(e), paso }, 500);
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

      const caja = cuentas.filter((ct: any) => ct.codigo === '10101')
        .reduce((s: number, ct: any) => s + (saldosTotal[ct.id] || 0), 0);
      const cxc = cuentas.filter((ct: any) => ct.codigo === '1010205')
        .reduce((s: number, ct: any) => s + (saldosTotal[ct.id] || 0), 0);
      const cxp = cuentas.filter((ct: any) => ct.codigo === '2010301')
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

  // ══════════════════════════════════════════════════════════════════════
  // PERÍODOS CONTABLES — Cierre de período
  // ══════════════════════════════════════════════════════════════════════

  // GET /contabilidad/periodos — lista períodos del año actual
  app.get("/server/contabilidad/periodos", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const db = getDB();
    try {
      const anio = Number(c.req.query('anio') || new Date().getFullYear());
      const { data } = await db.from('periodos_contables')
        .select('*').eq('empresa_id', auth.empresaId).eq('anio', anio)
        .order('mes');
      return c.json({ periodos: data || [] });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /contabilidad/periodos/cerrar — cierra un mes
  app.post("/server/contabilidad/periodos/cerrar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const db = getDB();
    try {
      const { anio, mes, notas } = await c.req.json();
      if (!anio || mes === undefined) return c.json({ error: 'anio y mes requeridos' }, 400);

      // Verificar que no hay asientos sin cuadrar en el período
      const fi = `${anio}-${String(mes).padStart(2,'0')}-01`;
      const ff = new Date(anio, mes, 0).toISOString().split('T')[0];
      const { data: asientosAbiertos } = await db.from('asientos_contables')
        .select('id, numero, total_debito, total_credito')
        .eq('empresa_id', auth.empresaId).eq('estado', 'activo')
        .gte('fecha', fi).lte('fecha', ff);

      const desbalanceados = (asientosAbiertos || []).filter(
        (a: any) => Math.abs(Number(a.total_debito) - Number(a.total_credito)) > 0.01
      );
      if (desbalanceados.length > 0)
        return c.json({ error: `${desbalanceados.length} asientos desbalanceados. Corrígelos antes de cerrar.`, asientos: desbalanceados }, 422);

      const { data, error } = await db.from('periodos_contables')
        .upsert({ empresa_id: auth.empresaId, anio, mes, estado: 'cerrado',
          fecha_cierre: new Date().toISOString(), usuario_cierre: auth.userId, notas: notas || '' },
          { onConflict: 'empresa_id,anio,mes' })
        .select().single();
      if (error) throw error;
      return c.json({ ok: true, periodo: data, asientos_cerrados: (asientosAbiertos || []).length });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /contabilidad/periodos/reabrir — reabre un mes (solo admin)
  app.post("/server/contabilidad/periodos/reabrir", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    if (auth.userRole !== 'admin' && auth.userRole !== 'super_admin' && auth.userRole !== 'contador')
      return c.json({ error: 'Solo el administrador o contador puede reabrir períodos' }, 403);
    const db = getDB();
    try {
      const { anio, mes, motivo } = await c.req.json();
      const { data, error } = await db.from('periodos_contables')
        .upsert({ empresa_id: auth.empresaId, anio, mes, estado: 'abierto',
          fecha_cierre: null, notas: `Reabierto: ${motivo || ''}` },
          { onConflict: 'empresa_id,anio,mes' })
        .select().single();
      if (error) throw error;
      return c.json({ ok: true, periodo: data });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // GET /contabilidad/periodos/verificar?fecha=YYYY-MM-DD — verifica si una fecha está bloqueada
  app.get("/server/contabilidad/periodos/verificar", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const db = getDB();
    try {
      const fecha = c.req.query('fecha') as string;
      if (!fecha) return c.json({ bloqueado: false });
      const [anio, mes] = fecha.split('-').map(Number);
      const { data } = await db.from('periodos_contables')
        .select('estado').eq('empresa_id', auth.empresaId)
        .eq('anio', anio).eq('mes', mes).maybeSingle();
      return c.json({ bloqueado: data?.estado === 'cerrado', estado: data?.estado || 'abierto' });
    } catch (e: any) { return c.json({ bloqueado: false }); }
  });

  // POST /contabilidad/cierre-anual — genera asientos de cierre del ejercicio
  app.post("/server/contabilidad/cierre-anual", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const db = getDB();
    try {
      const { anio } = await c.req.json();
      if (!anio) return c.json({ error: 'anio requerido' }, 400);

      const cuentas = await obtenerCuentas(auth.empresaId);
      const asientos = await obtenerAsientos(auth.empresaId);
      const fi = `${anio}-01-01`; const ff = `${anio}-12-31`;
      const saldos = calcularSaldosCuentas(cuentas, asientos, fi, ff);

      // Separar ingresos y gastos con saldo
      const cuentasIngreso = cuentas.filter((c: any) => c.tipo === 'ingreso' && !c.es_grupo && (saldos[c.id] || 0) !== 0);
      const cuentasGasto   = cuentas.filter((c: any) => ['gasto','costo'].includes(c.tipo) && !c.es_grupo && (saldos[c.id] || 0) !== 0);

      const totalIngresos = cuentasIngreso.reduce((s: number, c: any) => s + Math.abs(saldos[c.id] || 0), 0);
      const totalGastos   = cuentasGasto.reduce((s: number, c: any) => s + Math.abs(saldos[c.id] || 0), 0);
      const utilidad      = totalIngresos - totalGastos;

      // Cuenta 3.3.01 Resultado del ejercicio
      const ctaResultado  = cuentas.find((c: any) => c.codigo === '30701' || c.codigo === '307');
      if (!ctaResultado) return c.json({ error: 'Cuenta 30701 (Ganancia Neta del Periodo) no encontrada en el plan contable' }, 422);

      // Construir asiento de cierre: cerrar ingresos y gastos
      const items: any[] = [];
      for (const ct of cuentasIngreso) {
        const s = saldos[ct.id] || 0;
        items.push({ cuenta_id: ct.id, cuenta_codigo: ct.codigo, cuenta_nombre: ct.nombre,
          debito: Math.abs(s), credito: 0, descripcion: 'Cierre ingreso' });
      }
      for (const ct of cuentasGasto) {
        const s = saldos[ct.id] || 0;
        items.push({ cuenta_id: ct.id, cuenta_codigo: ct.codigo, cuenta_nombre: ct.nombre,
          debito: 0, credito: Math.abs(s), descripcion: 'Cierre gasto/costo' });
      }
      // Contrapartida: resultado del ejercicio
      items.push({
        cuenta_id: ctaResultado.id, cuenta_codigo: ctaResultado.codigo, cuenta_nombre: ctaResultado.nombre,
        debito: utilidad < 0 ? Math.abs(utilidad) : 0,
        credito: utilidad >= 0 ? utilidad : 0,
        descripcion: `Resultado del ejercicio ${anio}`,
      });

      const year = new Date().getFullYear();
      const { count: cnt } = await db.from('asientos_contables')
        .select('*', { count: 'exact', head: true }).eq('empresa_id', auth.empresaId)
        .like('numero', `ASI-${year}%`);
      const numero = `ASI-${year}-${String((cnt || 0) + 1).padStart(4, '0')}`;

      const asientoCierre = await guardarAsiento(auth.empresaId, {
        tipo: 'cierre', descripcion: `Asiento de cierre ejercicio ${anio}`,
        referencia: `CIERRE-${anio}`, fecha: `${anio}-12-31`,
        estado: 'activo', numero, origen_automatico: true, items,
        total_debito: totalIngresos, total_credito: totalIngresos,
      });

      return c.json({ ok: true, asiento_cierre: asientoCierre,
        resumen: { total_ingresos: totalIngresos, total_gastos: totalGastos, utilidad } });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ══════════════════════════════════════════════════════════════════════
  // ACTIVOS FIJOS
  // ══════════════════════════════════════════════════════════════════════

  app.get("/server/contabilidad/activos-fijos", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { data, error } = await db.from('activos_fijos')
        .select('*').eq('empresa_id', auth.empresaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return c.json({ activos: data || [] });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  app.post("/server/contabilidad/activos-fijos", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const body = await c.req.json();
      const { data, error } = await db.from('activos_fijos')
        .insert({ ...body, empresa_id: auth.empresaId, id: crypto.randomUUID() })
        .select().single();
      if (error) throw error;
      return c.json({ ok: true, activo: data }, 201);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  app.put("/server/contabilidad/activos-fijos/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const body = await c.req.json();
      const { data, error } = await db.from('activos_fijos')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('id', c.req.param('id')).eq('empresa_id', auth.empresaId)
        .select().single();
      if (error) throw error;
      return c.json({ ok: true, activo: data });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  app.delete("/server/contabilidad/activos-fijos/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { error } = await db.from('activos_fijos')
        .delete().eq('id', c.req.param('id')).eq('empresa_id', auth.empresaId);
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /contabilidad/activos-fijos/depreciar — genera asientos de depreciación del mes
  app.post("/server/contabilidad/activos-fijos/depreciar", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { anio, mes } = await c.req.json();
      if (!anio || !mes) return c.json({ error: 'anio y mes requeridos' }, 400);
      const fechaDep = `${anio}-${String(mes).padStart(2,'0')}-${String(new Date(anio, mes, 0).getDate()).padStart(2,'0')}`;

      const { data: activos } = await db.from('activos_fijos')
        .select('*').eq('empresa_id', auth.empresaId).eq('estado', 'activo');

      const cuentas = await obtenerCuentas(auth.empresaId);
      let generados = 0; const errores: string[] = [];

      for (const activo of (activos || [])) {
        try {
          // Verificar si ya se depreció este mes
          const mesStr = `${anio}-${String(mes).padStart(2,'0')}`;
          if (activo.ultimo_mes_dep && activo.ultimo_mes_dep.startsWith(mesStr)) {
            errores.push(`${activo.nombre}: ya depreció en ${mesStr}`);
            continue;
          }
          // Calcular depreciación mensual
          const mesesVida    = activo.vida_util_meses || 60;
          const valorDep     = Number(activo.valor_adquisicion) - Number(activo.valor_residual || 0);
          const depMensual   = Math.round((valorDep / mesesVida) * 100) / 100;
          if (depMensual <= 0) continue;

          // Verificar si ya está totalmente depreciado
          const depAcum = Number(activo.dep_acumulada || 0);
          if (depAcum >= valorDep) {
            await db.from('activos_fijos').update({ estado: 'totalmente_depreciado' })
              .eq('id', activo.id);
            continue;
          }
          const depReal = Math.min(depMensual, valorDep - depAcum);

          // Resolver cuentas
          const ctaGasto = cuentas.find((c: any) => c.codigo === activo.cuenta_gasto_codigo);
          const ctaDep   = cuentas.find((c: any) => c.codigo === activo.cuenta_dep_codigo);
          if (!ctaGasto || !ctaDep) {
            errores.push(`${activo.nombre}: cuentas ${activo.cuenta_gasto_codigo}/${activo.cuenta_dep_codigo} no encontradas`);
            continue;
          }

          const year = new Date().getFullYear();
          const { count: cnt } = await db.from('asientos_contables')
            .select('*', { count: 'exact', head: true }).eq('empresa_id', auth.empresaId)
            .like('numero', `ASI-${year}%`);
          const numero = `ASI-${year}-${String((cnt || 0) + 1).padStart(4, '0')}`;

          await guardarAsiento(auth.empresaId, {
            tipo: 'depreciacion', descripcion: `Depreciación ${activo.nombre} ${mesStr}`,
            referencia: activo.codigo || activo.id, fecha: fechaDep,
            estado: 'activo', numero, origen_automatico: true,
            items: [
              { cuenta_id: ctaGasto.id, cuenta_codigo: ctaGasto.codigo, cuenta_nombre: ctaGasto.nombre,
                debito: depReal, credito: 0, descripcion: `Dep. ${activo.nombre}` },
              { cuenta_id: ctaDep.id, cuenta_codigo: ctaDep.codigo, cuenta_nombre: ctaDep.nombre,
                debito: 0, credito: depReal, descripcion: `Dep. Acum. ${activo.nombre}` },
            ],
            total_debito: depReal, total_credito: depReal,
          });

          // Actualizar acumulado en el activo
          const nuevaDep = depAcum + depReal;
          await db.from('activos_fijos').update({
            dep_acumulada: nuevaDep, ultimo_mes_dep: fechaDep,
            estado: nuevaDep >= valorDep ? 'totalmente_depreciado' : 'activo',
            updated_at: new Date().toISOString(),
          }).eq('id', activo.id);
          generados++;
        } catch (e: any) { errores.push(`${activo.nombre}: ${e.message}`); }
      }
      return c.json({ ok: true, generados, errores: errores.length ? errores : undefined, fecha: fechaDep });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ══════════════════════════════════════════════════════════════════════
  // FORMULARIOS SRI — 104 (IVA) y 103 (Retenciones)
  // ══════════════════════════════════════════════════════════════════════

  // ── FORMULARIO 104 — IVA MENSUAL (casillas reales SRI) ──────────────────────
  app.get("/server/contabilidad/formulario-104", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { mes, anio } = c.req.query() as any;
      if (!mes || !anio) return c.json({ error: 'mes y anio requeridos' }, 400);
      const fi = `${anio}-${String(mes).padStart(2,'0')}-01`;
      const ff = new Date(Number(anio), Number(mes), 0).toISOString().split('T')[0];
      const r2 = (n: number) => Math.round(n * 100) / 100;

      // ── VENTAS: Facturas del período ────────────────────────────────────
      const { data: facturas, error: factErr } = await db.from('facturas')
        .select('total,subtotal_iva,iva,subtotal_0,total_descuento,estado_autorizacion')
        .eq('empresa_id', auth.empresaId)
        .gte('fecha_emision', fi).lte('fecha_emision', ff)
        .neq('estado_autorizacion', 'ANULADO')
        .neq('estado_autorizacion', 'NO_AUTORIZADO');

      if (factErr) console.error('[F-104] Error facturas:', factErr.message);

      // 401: Valor Bruto ventas locales gravadas tarifa≠0% (excluye activos fijos)
      // 411: Valor Neto (sin IVA) = subtotal_iva
      // 421: IVA generado = iva
      const c401 = (facturas||[]).reduce((s:number,f:any)=>s+Number(f.subtotal_iva||0)+Number(f.iva||0),0);
      const c411 = (facturas||[]).reduce((s:number,f:any)=>s+Number(f.subtotal_iva||0),0);
      const c421 = (facturas||[]).reduce((s:number,f:any)=>s+Number(f.iva||0),0);
      // 403/413: Ventas tarifa 0% sin derecho a CT
      const c403 = 0; // Depende de configuración empresa
      const c413 = (facturas||[]).reduce((s:number,f:any)=>s+Number(f.subtotal_0||0),0);
      // 405/415: Ventas tarifa 0% con derecho a CT (exportaciones locales)
      const c405 = 0; const c415 = 0;
      // 407/417: Exportaciones de bienes
      const c407 = 0; const c417 = 0;
      // 409/419: TOTAL VENTAS Y OTRAS OPERACIONES (bruto / neto)
      const c409 = c401 + c403 + c405 + c407;
      const c419 = c411 + c413 + c415 + c417;
      const c429 = c421; // IVA total generado en ventas
      // 499: Total impuesto a liquidar en este mes (si ventas a crédito diferido)
      const c499 = c429;
      // Comprobantes
      const c111 = (facturas||[]).length;

      // ── ADQUISICIONES Y PAGOS: Compras del período ──────────────────────
      const { data: compras } = await db.from('compras')
        .select('subtotal,iva,total,estado_pago').eq('empresa_id', auth.empresaId)
        .gte('fecha', fi).lte('fecha', ff);

      // 500/510/520: Adquisiciones y pagos tarifa≠0% con CT (bruto/neto/impuesto)
      const c510 = (compras||[]).reduce((s:number,c:any)=>s+Number(c.subtotal||0),0);
      const c500 = c510 + (compras||[]).reduce((s:number,c:any)=>s+Number(c.iva||0),0);
      const c520 = (compras||[]).reduce((s:number,c:any)=>s+Number(c.iva||0),0);
      // 507/517: Adquisiciones tarifa 0%
      const c507 = 0; const c517 = 0;
      // 508/518: Adquisiciones a RISE (informativo)
      const c508 = 0; const c518 = 0;
      // 509/519/529: TOTAL ADQUISICIONES Y PAGOS
      const c509 = c500 + c507 + c508;
      const c519 = c510 + c517 + c518;
      const c529 = c520;
      const c115 = (compras||[]).length;

      // ── RETENCIONES DE IVA ───────────────────────────────────────────────
      // Retenciones de IVA recibidas (las que nos hacen a nosotros): casilla 609
      const { data: retsRecib } = await db.from('retenciones')
        .select('impuestos').eq('empresa_id', auth.empresaId)
        .gte('fecha_emision', fi).lte('fecha_emision', ff)
        .not('estado', 'eq', 'ANULADO');
      let c609 = 0;
      for (const ret of (retsRecib||[])) {
        for (const imp of (ret.impuestos||[])) {
          if (imp.tipo === 'iva' || imp.codigo === '2' || String(imp.codigo_retencion||'').startsWith('7'))
            c609 += Number(imp.valor_retenido||0);
        }
      }

      // ── FACTOR DE PROPORCIONALIDAD Y CT ─────────────────────────────────
      // 563: factor proporcionalidad (simplificado: 100% si solo ventas gravadas)
      const c563 = c409 > 0 ? r2(((c401 + c405) / c409) * 100) : 100;
      // 564: Crédito tributario aplicable en este período
      const c564 = r2(c520 * (c563 / 100));

      // ── RESUMEN IMPOSITIVO: AGENTE DE PERCEPCIÓN ─────────────────────────
      // 601: Impuesto causado (IVA ventas - CT adquisiciones - CT retenciones)
      const diferencia = r2(c421 - c564 - c609);
      const c601 = Math.max(0, diferencia);    // IVA a pagar
      const c602 = Math.max(0, -diferencia);   // CT si negativo
      // 605: Saldo CT mes anterior por adquisiciones (no automatizable sin histórico)
      const c605 = 0;
      // 606: Saldo CT mes anterior por retenciones
      const c606 = 0;
      // 615: Saldo CT próximo mes por adquisiciones
      const c615 = c602 > 0 ? c602 : 0;
      // 617: Saldo CT próximo mes por retenciones
      const c617 = 0;
      // 620: Subtotal a pagar
      const c620 = c601;
      // 699: TOTAL IMPUESTO A PAGAR POR PERCEPCIÓN
      const c699 = c620;
      // 859: TOTAL CONSOLIDADO IVA (sin retenciones realizadas por simplificación)
      const c859 = c699;
      // 902/999
      const c902 = c859;

      return c.json({
        formulario: '104',
        periodo: { mes: Number(mes), anio: Number(anio), fi, ff,
          nombre: new Date(Number(anio), Number(mes)-1).toLocaleString('es-EC', {month:'long', year:'numeric'}) },
        // VENTAS Y OTRAS OPERACIONES
        ventas: {
          c401: r2(c401), c411: r2(c411), c421: r2(c421),
          c403: r2(c403), c413: r2(c413),
          c405: r2(c405), c415: r2(c415),
          c407: r2(c407), c417: r2(c417),
          c409_total_bruto: r2(c409),
          c419_total_neto: r2(c419),
          c429_iva_generado: r2(c429),
          c499_iva_liquidar: r2(c499),
          c111_comprobantes: (facturas||[]).length,
        },
        // ADQUISICIONES Y PAGOS
        adquisiciones: {
          c500: r2(c500), c510: r2(c510), c520: r2(c520),
          c507: r2(c507), c517: r2(c517),
          c509_total_bruto: r2(c509),
          c519_total_neto: r2(c519),
          c529_iva_pagado: r2(c529),
          c563_factor_proporcionalidad: c563,
          c564_ct_aplicable: r2(c564),
          c115_comprobantes: c115,
        },
        // RESUMEN LIQUIDACIÓN
        liquidacion: {
          c601_impuesto_causado: r2(c601),
          c602_credito_tributario: r2(c602),
          c605_saldo_ct_anterior_adq: r2(c605),
          c606_saldo_ct_anterior_ret: r2(c606),
          c609_retenciones_iva_recibidas: r2(c609),
          c615_saldo_ct_proximo_adq: r2(c615),
          c617_saldo_ct_proximo_ret: r2(c617),
          c620_subtotal_pagar: r2(c620),
          c699_total_percepcion: r2(c699),
          c859_total_consolidado: r2(c859),
          c902_total_pagar: r2(c902),
        },
        // Estructura oficial de casillas para visualización
        casillas: {
          // VENTAS
          '401': r2(c401), '411': r2(c411), '421': r2(c421),
          '403': r2(c403), '413': r2(c413),
          '409': r2(c409), '419': r2(c419), '429': r2(c429), '499': r2(c499),
          // ADQUISICIONES
          '500': r2(c500), '510': r2(c510), '520': r2(c520),
          '509': r2(c509), '519': r2(c519), '529': r2(c529),
          '563': c563, '564': r2(c564),
          // LIQUIDACIÓN
          '601': r2(c601), '602': r2(c602),
          '605': r2(c605), '606': r2(c606), '609': r2(c609),
          '615': r2(c615), '617': r2(c617),
          '620': r2(c620), '699': r2(c699),
          '859': r2(c859), '902': r2(c902),
        },
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ── FORMULARIO 103 — RETENCIONES EN LA FUENTE (casillas reales SRI) ─────────
  app.get("/server/contabilidad/formulario-103", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { mes, anio } = c.req.query() as any;
      if (!mes || !anio) return c.json({ error: 'mes y anio requeridos' }, 400);
      const fi = `${anio}-${String(mes).padStart(2,'0')}-01`;
      const ff = new Date(Number(anio), Number(mes), 0).toISOString().split('T')[0];
      const r2 = (n: number) => Math.round(n * 100) / 100;

      const { data: retenciones } = await db.from('retenciones')
        .select('numero_retencion,fecha_emision,sujeto_retencion_razon_social,sujeto_retencion_identificacion,impuestos,total_retenido')
        .eq('empresa_id', auth.empresaId)
        .gte('fecha_emision', fi).lte('fecha_emision', ff)
        .not('estado', 'eq', 'ANULADO');

      // Mapa oficial de códigos → casillas SRI (Formulario 103 - versión vigente 2024/2025)
      const CODIGO_A_CASILLA: Record<string, { base: string; retenido: string; descripcion: string; porcentaje: number }> = {
        '302': { base:'302', retenido:'352', descripcion:'En relación de dependencia', porcentaje: 0 },
        '303': { base:'303', retenido:'353', descripcion:'Honorarios profesionales', porcentaje: 10 },
        '3030': { base:'3030', retenido:'3530', descripcion:'Servicios profesionales — sociedades', porcentaje: 5 },
        '304': { base:'304', retenido:'354', descripcion:'Predomina el intelecto', porcentaje: 8 },
        '307': { base:'307', retenido:'357', descripcion:'Predomina la mano de obra', porcentaje: 1.75 },
        '308': { base:'308', retenido:'358', descripcion:'Utilización imagen o renombre', porcentaje: 10 },
        '309': { base:'309', retenido:'359', descripcion:'Publicidad y comunicación', porcentaje: 1.75 },
        '310': { base:'310', retenido:'360', descripcion:'Transporte privado de pasajeros o carga', porcentaje: 1 },
        '311': { base:'311', retenido:'361', descripcion:'Liquidaciones de compra', porcentaje: 1.75 },
        '312': { base:'312', retenido:'362', descripcion:'Transferencia de bienes muebles corporales', porcentaje: 1.75 },
        '3120': { base:'3120', retenido:'3620', descripcion:'Compras al PRODUCTOR agropecuario', porcentaje: 1 },
        '3121': { base:'3121', retenido:'3621', descripcion:'Compras al COMERCIALIZADOR agropecuario', porcentaje: 1.75 },
        '314': { base:'314', retenido:'364', descripcion:'Regalías, derechos de autor, marcas, patentes', porcentaje: 5 },
        '3140': { base:'3140', retenido:'3640', descripcion:'Comisiones a sociedades nacionales', porcentaje: 1.75 },
        '319': { base:'319', retenido:'369', descripcion:'Arrendamiento mercantil', porcentaje: 1 },
        '320': { base:'320', retenido:'370', descripcion:'Arrendamiento bienes inmuebles', porcentaje: 10 },
        '322': { base:'322', retenido:'372', descripcion:'Seguros y reaseguros (primas)', porcentaje: 1.75 },
        '323': { base:'323', retenido:'373', descripcion:'Rendimientos financieros', porcentaje: 2 },
        '325': { base:'325', retenido:'375', descripcion:'Anticipo dividendos', porcentaje: 22 },
        '327': { base:'327', retenido:'377', descripcion:'Dividendos distribuidos a personas naturales', porcentaje: 10 },
        '328': { base:'328', retenido:'378', descripcion:'Dividendos distribuidos a sociedades residentes', porcentaje: 22 },
        '332': { base:'332', retenido:'',    descripcion:'Pagos no sujetos a retención / 0%', porcentaje: 0 },
        '333': { base:'333', retenido:'383', descripcion:'Ganancia enajenación DRC cotizados en bolsa', porcentaje: 1 },
        '334': { base:'334', retenido:'384', descripcion:'Enajenación DRC no cotizados', porcentaje: 22 },
        '335': { base:'335', retenido:'385', descripcion:'Loterías, rifas, apuestas', porcentaje: 15 },
        '336': { base:'336', retenido:'386', descripcion:'Venta de combustibles a comercializadoras', porcentaje: 0.3 },
        '337': { base:'337', retenido:'387', descripcion:'Venta de combustibles a distribuidores', porcentaje: 0.2 },
        '343': { base:'343', retenido:'393', descripcion:'Aplicables el 1% (energía, RIMPE, tarjetas)', porcentaje: 1 },
        '344': { base:'344', retenido:'394', descripcion:'Aplicables el 2% (tarjetas, minerales, PET)', porcentaje: 2 },
        '3430': { base:'3430', retenido:'3450', descripcion:'Construcción obra material inmueble', porcentaje: 1.75 },
        '3440': { base:'3440', retenido:'3940', descripcion:'Aplicables el 2.75%', porcentaje: 2.75 },
        '346': { base:'346', retenido:'396', descripcion:'Aplicables a otros porcentajes', porcentaje: 0 },
        '350': { base:'350', retenido:'400', descripcion:'Otras autorretenciones', porcentaje: 0 },
      };

      // Acumular por código de retención
      const porCasilla: Record<string, { base: number; retenido: number; cantidad: number; info: any }> = {};

      for (const ret of (retenciones||[])) {
        for (const imp of (ret.impuestos||[])) {
          const cod = String(imp.codigo_retencion || imp.codigo || '346');
          const info = CODIGO_A_CASILLA[cod] || CODIGO_A_CASILLA['346'];
          if (!porCasilla[cod]) porCasilla[cod] = { base: 0, retenido: 0, cantidad: 0, info };
          porCasilla[cod].base     += Number(imp.base_imponible || 0);
          porCasilla[cod].retenido += Number(imp.valor_retenido || 0);
          porCasilla[cod].cantidad += 1;
        }
      }

      // Construir listado ordenado por casilla
      const detalleOrdenado = Object.entries(porCasilla)
        .map(([cod, v]) => ({
          codigo: cod,
          casilla_base:     v.info.base,
          casilla_retenido: v.info.retenido,
          descripcion:      v.info.descripcion,
          porcentaje:       v.info.porcentaje,
          base_imponible:   r2(v.base),
          valor_retenido:   r2(v.retenido),
          cantidad:         v.cantidad,
        }))
        .sort((a, b) => a.casilla_base.localeCompare(b.casilla_base, undefined, { numeric: true }));

      // Casillas totales oficiales
      const c349 = r2(detalleOrdenado.reduce((s,r)=>s+r.base_imponible, 0));  // SUBTOTAL BASE país
      const c399 = r2(detalleOrdenado.reduce((s,r)=>s+r.valor_retenido, 0));  // SUBTOTAL RETENIDO país
      const c497 = 0; // Subtotal base exterior (no aplica para restaurante local)
      const c498 = 0; // Subtotal retenido exterior
      const c499 = r2(c399 + c498); // TOTAL RETENCIÓN
      const c902 = c499;

      return c.json({
        formulario: '103',
        periodo: { mes: Number(mes), anio: Number(anio), fi, ff,
          nombre: new Date(Number(anio), Number(mes)-1).toLocaleString('es-EC', {month:'long', year:'numeric'}) },
        retenciones_documentos: retenciones || [],
        detalle_por_codigo: detalleOrdenado,
        totales: {
          c349_subtotal_base_pais:     c349,
          c399_subtotal_retenido_pais: c399,
          c497_subtotal_base_exterior: c497,
          c498_subtotal_retenido_ext:  c498,
          c499_total_retencion:        c499,
          c902_total_pagar:            c902,
        },
        resumen: {
          total_documentos:     (retenciones||[]).length,
          total_base_imponible: c349,
          total_retenido:       c399,
          codigos_usados:       detalleOrdenado.length,
        },
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ── FORMULARIO 125 — RENTA SEMESTRAL MICROEMPRESAS (RIMPE) ──────────────────
  app.get("/server/contabilidad/formulario-125", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { semestre, anio } = c.req.query() as any;
      if (!semestre || !anio) return c.json({ error: 'semestre (1 o 2) y anio requeridos' }, 400);
      const sem = Number(semestre);
      const fi  = sem === 1 ? `${anio}-01-01` : `${anio}-07-01`;
      const ff  = sem === 1 ? `${anio}-06-30` : `${anio}-12-31`;
      const r2 = (n: number) => Math.round(n * 100) / 100;

      // Ingresos del semestre (ventas activas)
      const ventas = await import('./kv-helpers.tsx').then(m => m.obtenerVentas(auth.empresaId));
      const ventasPeriodo = ventas.filter((v: any) => {
        const f = v.fecha || v.created_at || '';
        return !v.anulada && f >= fi && f <= ff;
      });
      const c301 = r2(ventasPeriodo.reduce((s: number, v: any) => s + Number(v.total || 0), 0));

      // Retenciones recibidas en el semestre
      const { data: rets } = await db.from('retenciones')
        .select('impuestos').eq('empresa_id', auth.empresaId)
        .gte('fecha_emision', fi).lte('fecha_emision', ff).not('estado', 'eq', 'ANULADO');
      let c402 = 0;
      for (const ret of (rets||[])) {
        for (const imp of (ret.impuestos||[])) {
          if (imp.tipo !== 'iva') c402 += Number(imp.valor_retenido||0);
        }
      }

      const c399 = c301; // BASE IMPONIBLE (ingresos brutos simplificado)
      const tarifa = 0.02; // 2% tarifa RIMPE microempresas
      const c401 = r2(c399 * tarifa);    // IR causado del Régimen Microempresas
      const c499 = r2(Math.max(0, c401 - c402)); // IR a pagar

      return c.json({
        formulario: '125',
        semestre: sem,
        anio: Number(anio),
        periodo: { fi, ff, label: `${sem === 1 ? 'Primer' : 'Segundo'} Semestre ${anio}` },
        casillas: {
          '301': r2(c301), // Ingresos brutos sujetos al Régimen Microempresas
          '302': 0,        // (-) Devoluciones o descuentos
          '303': 0,        // (-) Ingresos exentos
          '399': r2(c399), // BASE IMPONIBLE PARA IR RÉGIMEN MICROEMPRESAS
          '401': r2(c401), // IR causado (399 × tarifa)
          '402': r2(c402), // (-) Retenciones en la fuente del período
          '403': 0,        // (-) CT declaración anual IR anterior
          '499': r2(c499), // IR A PAGAR RÉGIMEN MICROEMPRESAS
          '902': r2(c499), // Total impuesto a pagar
        },
        tarifa_aplicada: `${(tarifa*100).toFixed(1)}%`,
        nota: 'Formulario 125 — Régimen RIMPE Microempresas. Verifique tarifa vigente en el SRI.',
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ══════════════════════════════════════════════════════════════════════
  // FORMULARIO 102 — Declaración del Impuesto a la Renta de Sociedades
  // ══════════════════════════════════════════════════════════════════════
  app.get("/server/contabilidad/formulario-102", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { anio } = c.req.query() as any;
      if (!anio) return c.json({ error: 'anio requerido' }, 400);
      const fi = `${anio}-01-01`;
      const ff = `${anio}-12-31`;
      const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

      const kvHelpers = await import('./kv-helpers.tsx');

      // ── Ingresos: ventas del ejercicio (no anuladas) ──────────────────────
      const ventas = await kvHelpers.obtenerVentas(auth.empresaId);
      const ventasPeriodo = ventas.filter((v: any) => {
        const f = v.fecha || v.created_at || '';
        return !v.anulada && f >= fi && f <= ff;
      });
      const totalIngresos = r2(ventasPeriodo.reduce((s: number, v: any) =>
        s + Number(v.subtotal_0 || 0) + Number(v.subtotal_iva || 0), 0)
        || ventasPeriodo.reduce((s: number, v: any) => s + Number(v.total || 0), 0));

      // ── Costos y gastos: asientos de gasto/costo del ejercicio ────────────
      const cuentas = await obtenerCuentas(auth.empresaId);
      const cuentasGastoIds = cuentas
        .filter((cu: any) => (String(cu.codigo || '').startsWith('5') || String(cu.codigo || '').startsWith('6')) && !cu.es_grupo)
        .map((cu: any) => cu.id);

      const asientos = await obtenerAsientos(auth.empresaId);
      const asientosPeriodo = asientos.filter((a: any) =>
        a.estado === 'activo' && a.fecha >= fi && a.fecha <= ff);

      let totalCostosGastos = 0;
      for (const a of asientosPeriodo) {
        for (const it of (a.items || [])) {
          if (cuentasGastoIds.includes(it.cuenta_id)) {
            totalCostosGastos += Number(it.debito || 0) - Number(it.credito || 0);
          }
        }
      }
      totalCostosGastos = r2(totalCostosGastos);

      // ── Utilidad contable y base imponible (conciliación simplificada) ────
      const utilidadContable = r2(totalIngresos - totalCostosGastos);
      const participacionTrabajadores = utilidadContable > 0 ? r2(utilidadContable * 0.15) : 0; // 15% trabajadores
      const baseImponible = Math.max(0, r2(utilidadContable - participacionTrabajadores));

      // Tarifa general sociedades Ecuador 2024/2025: 25% (verificar vigente en SRI;
      // 22% si reinvierte utilidades en activos productivos — no contemplado aquí)
      const tarifa = 0.25;
      const impuestoCausado = r2(baseImponible * tarifa);

      // ── Anticipo de Impuesto a la Renta (simplificado: no calculado aquí) ──
      const anticipoIR = 0;

      // ── Retenciones en la fuente que le han sido efectuadas ───────────────
      const { data: rets } = await db.from('retenciones')
        .select('impuestos').eq('empresa_id', auth.empresaId)
        .gte('fecha_emision', fi).lte('fecha_emision', ff).not('estado', 'eq', 'ANULADO');
      let retencionesRecibidas = 0;
      for (const ret of (rets || [])) {
        for (const imp of (ret.impuestos || [])) {
          if (imp.tipo !== 'iva') retencionesRecibidas += Number(imp.valor_retenido || 0);
        }
      }
      retencionesRecibidas = r2(retencionesRecibidas);

      const impuestoAPagar = Math.max(0, r2(impuestoCausado - anticipoIR - retencionesRecibidas));
      const saldoAFavor = Math.max(0, r2((anticipoIR + retencionesRecibidas) - impuestoCausado));

      return c.json({
        formulario: '102',
        anio: Number(anio),
        periodo: { fi, ff, label: `Ejercicio fiscal ${anio}` },
        casillas: {
          '829': totalIngresos,                 // Total de ingresos
          '839': totalCostosGastos,             // Total costos y gastos
          '849': utilidadContable,              // Utilidad (pérdida) del ejercicio
          '850': participacionTrabajadores,     // 15% participación trabajadores
          '859': baseImponible,                 // Base imponible gravable
          '860': r2(tarifa * 100),              // Tarifa aplicada (%)
          '861': impuestoCausado,               // Impuesto a la renta causado
          '871': anticipoIR,                    // (-) Anticipo determinado para el ejercicio
          '872': retencionesRecibidas,          // (-) Retenciones en la fuente que le han sido efectuadas
          '902': impuestoAPagar,                // Impuesto a la renta a pagar
          '903': saldoAFavor,                   // Saldo a favor contribuyente
        },
        resumen: {
          total_ingresos: totalIngresos,
          total_costos_gastos: totalCostosGastos,
          utilidad_contable: utilidadContable,
          participacion_trabajadores_15: participacionTrabajadores,
          base_imponible: baseImponible,
          tarifa_aplicada: `${(tarifa * 100).toFixed(0)}%`,
          impuesto_causado: impuestoCausado,
          retenciones_recibidas: retencionesRecibidas,
          impuesto_a_pagar: impuestoAPagar,
        },
        nota: 'Formulario 102 — Declaración Impuesto a la Renta Sociedades. Cálculo simplificado basado en ' +
              'asientos contables (ingresos por ventas, costos/gastos de cuentas 5xxxx/6xxxx). ' +
              'Verifique la conciliación tributaria completa (gastos no deducibles, ingresos exentos, ' +
              'amortizaciones, etc.) y la tarifa vigente con su contador antes de declarar ante el SRI.',
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ══════════════════════════════════════════════════════════════════════
  // CONCILIACIÓN BANCARIA
  // ══════════════════════════════════════════════════════════════════════

  // GET — lista conciliaciones
  app.get("/server/contabilidad/conciliacion", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { data } = await db.from('conciliaciones_bancarias')
        .select('id,banco,cuenta_banco,mes,anio,saldo_banco,saldo_libros,diferencia,estado,created_at')
        .eq('empresa_id', auth.empresaId).order('anio', {ascending:false}).order('mes', {ascending:false});
      return c.json({ conciliaciones: data || [] });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST — importar extracto bancario y pre-conciliar
  app.post("/server/contabilidad/conciliacion/importar", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { banco, cuenta_banco, mes, anio, movimientos_banco, saldo_banco_final } = await c.req.json();
      if (!banco || !mes || !anio || !movimientos_banco?.length)
        return c.json({ error: 'banco, mes, anio y movimientos_banco requeridos' }, 400);

      const fi = `${anio}-${String(mes).padStart(2,'0')}-01`;
      const ff = new Date(Number(anio), Number(mes), 0).toISOString().split('T')[0];

      // Obtener asientos de cuentas de caja/banco del período
      const cuentas = await obtenerCuentas(auth.empresaId);
      const ctasBanco = cuentas.filter((c: any) =>
        c.codigo?.startsWith('1.1.0') && !c.es_grupo
      );
      const idsCuentasBanco = ctasBanco.map((c: any) => c.id);

      const asientosPeriodo = await obtenerAsientos(auth.empresaId);
      const movLibros = asientosPeriodo
        .filter((a: any) => a.estado === 'activo' && a.fecha >= fi && a.fecha <= ff)
        .flatMap((a: any) => (a.items || [])
          .filter((it: any) => idsCuentasBanco.includes(it.cuenta_id))
          .map((it: any) => ({
            id: `${a.id}-${it.cuenta_id}`,
            asiento_id: a.id, numero: a.numero, fecha: a.fecha,
            descripcion: a.descripcion, referencia: a.referencia,
            debito: Number(it.debito || 0), credito: Number(it.credito || 0),
            monto: Number(it.debito || 0) - Number(it.credito || 0),
            conciliado: false,
          }))
        );

      // Auto-match: buscar movimientos banco ↔ libros por monto y fecha cercana
      const bancoProcesado = movimientos_banco.map((mb: any) => {
        const montoB = Number(mb.credito || 0) - Number(mb.debito || 0);
        const fechaB = mb.fecha;
        const match = movLibros.find((ml: any) =>
          Math.abs(ml.monto - montoB) < 0.01 &&
          Math.abs(new Date(ml.fecha).getTime() - new Date(fechaB).getTime()) <= 2 * 86400000
        );
        return { ...mb, monto: montoB, conciliado: !!match, asiento_match: match?.asiento_id || null };
      });

      const saldoLibros = movLibros.reduce((s: number, m: any) => s + m.monto, 0);
      const diferencia  = Number(saldo_banco_final || 0) - saldoLibros;

      const conciliadosBanco  = bancoProcesado.filter((m: any) => m.conciliado).length;
      const pendientesBanco   = bancoProcesado.filter((m: any) => !m.conciliado).length;

      const { data, error } = await db.from('conciliaciones_bancarias')
        .upsert({
          empresa_id: auth.empresaId, banco, cuenta_banco: cuenta_banco || '',
          mes: Number(mes), anio: Number(anio),
          saldo_banco: Number(saldo_banco_final || 0),
          saldo_libros: Math.round(saldoLibros * 100) / 100,
          diferencia: Math.round(diferencia * 100) / 100,
          estado: Math.abs(diferencia) < 0.01 ? 'conciliado' : 'en_proceso',
          movimientos: JSON.stringify({ banco: bancoProcesado, libros: movLibros }),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'empresa_id,anio,mes,banco' })
        .select().single();
      if (error) throw error;

      return c.json({
        ok: true, conciliacion: data,
        resumen: {
          total_banco: bancoProcesado.length, conciliados_banco: conciliadosBanco,
          pendientes_banco: pendientesBanco, total_libros: movLibros.length,
          saldo_banco: Number(saldo_banco_final || 0),
          saldo_libros: Math.round(saldoLibros * 100) / 100,
          diferencia: Math.round(diferencia * 100) / 100,
        },
        pendientes: bancoProcesado.filter((m: any) => !m.conciliado),
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // GET — obtener detalle de una conciliación
  app.get("/server/contabilidad/conciliacion/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { data, error } = await db.from('conciliaciones_bancarias')
        .select('*').eq('id', c.req.param('id')).eq('empresa_id', auth.empresaId).maybeSingle();
      if (error) throw error;
      if (!data) return c.json({ error: 'No encontrada' }, 404);
      const movs = typeof data.movimientos === 'string' ? JSON.parse(data.movimientos) : data.movimientos;
      return c.json({ conciliacion: { ...data, movimientos: movs } });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ══════════════════════════════════════════════════════════════════════
  // CUENTAS POR COBRAR (CxC)
  // ══════════════════════════════════════════════════════════════════════

  // GET /contabilidad/cxc — lista facturas pendientes de cobro con aging
  app.get("/server/contabilidad/cxc", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { estado = 'pendiente', cliente = '' } = c.req.query() as any;

      // Facturas autorizadas con información de cobro en metadata
      let q = db.from('facturas')
        .select('id,numero_factura,fecha_emision,cliente_razon_social,cliente_identificacion,cliente_email,total,subtotal_iva,iva,estado_autorizacion,datos_completos')
        .eq('empresa_id', auth.empresaId)
        .eq('estado_autorizacion', 'AUTORIZADO')
        .order('fecha_emision', { ascending: true });

      if (cliente) q = q.ilike('cliente_razon_social', `%${cliente}%`);
      const { data: facturas } = await q;

      const hoy = new Date();
      const r2 = (n: number) => Math.round(n * 100) / 100;

      // Enriquecer con días vencidos y estado de cobro (guardado en datos_completos)
      const enriquecidas = (facturas || []).map((f: any) => {
        const dc = typeof f.datos_completos === 'string' ? JSON.parse(f.datos_completos || '{}') : (f.datos_completos || {});

        // Determinar si está cobrada:
        // 1. Marcada explícitamente como cobrada
        // 2. Venta POS con pago inmediato (metodo_pago != crédito)
        const metodoPago = (dc.metodo_pago || dc.forma_pago || '').toLowerCase();
        const esPagoInmediato = metodoPago && !['credito','crédito','cuenta_corriente','cuenta corriente'].includes(metodoPago);
        const cobrado      = dc.cobrado ?? esPagoInmediato ?? false;
        const fecha_cobro  = dc.fecha_cobro ?? null;
        const monto_cobrado = cobrado ? Number(f.total || 0) : Number(dc.monto_cobrado ?? 0);
        const saldo        = r2(Number(f.total || 0) - monto_cobrado);
        const fechaEmision = new Date(f.fecha_emision || hoy);
        const diasPendiente = Math.floor((hoy.getTime() - fechaEmision.getTime()) / 86400000);

        let tramo: '0-30' | '31-60' | '61-90' | '+90' = '0-30';
        if (diasPendiente > 90)      tramo = '+90';
        else if (diasPendiente > 60) tramo = '61-90';
        else if (diasPendiente > 30) tramo = '31-60';

        return {
          id: f.id, numero_factura: f.numero_factura,
          fecha_emision: f.fecha_emision,
          cliente: f.cliente_razon_social || 'Consumidor Final',
          cliente_id: f.cliente_identificacion,
          cliente_email: f.cliente_email || dc.cliente_email || '',
          total: Number(f.total || 0),
          monto_cobrado, saldo,
          cobrado, fecha_cobro,
          metodo_pago: metodoPago || 'efectivo',
          origen: dc.venta_id ? 'pos' : 'manual',
          dias_pendiente: diasPendiente,
          tramo,
        };
      }).filter((f: any) => estado === 'todos' || (estado === 'pendiente' ? !f.cobrado : f.cobrado))
        .filter((f: any) => f.cliente !== 'Consumidor Final' || estado === 'todos'); // Consumidor final normalmente es cash

      // Aging summary
      const pendientes = enriquecidas.filter((f: any) => !f.cobrado);
      const aging = {
        '0-30':  { cantidad: 0, total: 0 },
        '31-60': { cantidad: 0, total: 0 },
        '61-90': { cantidad: 0, total: 0 },
        '+90':   { cantidad: 0, total: 0 },
      };
      for (const f of pendientes) {
        aging[f.tramo].cantidad++;
        aging[f.tramo].total = r2(aging[f.tramo].total + f.saldo);
      }

      const totalCartera    = r2(pendientes.reduce((s: number, f: any) => s + f.saldo, 0));
      const totalVencido    = r2(pendientes.filter((f: any) => f.dias_pendiente > 30).reduce((s: number, f: any) => s + f.saldo, 0));
      const clientesUnicos  = new Set(pendientes.map((f: any) => f.cliente_id)).size;

      return c.json({
        facturas: enriquecidas,
        aging,
        resumen: { total_cartera: totalCartera, total_vencido: totalVencido, clientes: clientesUnicos, documentos: pendientes.length },
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /contabilidad/cxc/cobrar — registra cobro de una factura
  app.post("/server/contabilidad/cxc/cobrar", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { factura_id, monto, fecha, metodo, notas } = await c.req.json();
      if (!factura_id || !monto) return c.json({ error: 'factura_id y monto requeridos' }, 400);

      const { data: factura, error: fErr } = await db.from('facturas')
        .select('*').eq('id', factura_id).eq('empresa_id', auth.empresaId).maybeSingle();
      if (fErr || !factura) return c.json({ error: 'Factura no encontrada' }, 404);

      const dc = typeof factura.datos_completos === 'string'
        ? JSON.parse(factura.datos_completos || '{}')
        : (factura.datos_completos || {});

      const totalFactura   = Number(factura.total || 0);
      const montoPrevio    = Number(dc.monto_cobrado || 0);
      const montoNuevo     = Math.min(montoPrevio + Number(monto), totalFactura);
      const cobradoTotal   = montoNuevo >= totalFactura - 0.01;
      const fechaCobro     = fecha || new Date().toISOString().split('T')[0];

      // Actualizar datos_completos de la factura
      const dcActualizado = {
        ...dc,
        cobrado: cobradoTotal,
        monto_cobrado: Math.round(montoNuevo * 100) / 100,
        fecha_cobro: fechaCobro,
        historial_cobros: [
          ...(dc.historial_cobros || []),
          { fecha: fechaCobro, monto: Number(monto), metodo: metodo || 'efectivo', notas: notas || '', usuario: auth.userId },
        ],
      };

      await db.from('facturas').update({ datos_completos: dcActualizado, updated_at: new Date().toISOString() })
        .eq('id', factura_id).eq('empresa_id', auth.empresaId);

      // Asiento contable: Banco/Caja Dr → CxC Cr
      try {
        const cuentas = await obtenerCuentas(auth.empresaId);
        const metodoPago = (metodo || 'efectivo').toLowerCase();
        const codCaja = '10101'; // Efectivo y Equivalentes (caja + bancos en SRI)
        const ctaCaja  = cuentas.find((c: any) => c.codigo === codCaja && !c.es_grupo);
        const ctaCxC   = cuentas.find((c: any) => c.codigo === '1010205' && !c.es_grupo);

        if (ctaCaja && ctaCxC) {
          const year = new Date().getFullYear();
          const { count: cnt } = await db.from('asientos_contables')
            .select('*', { count: 'exact', head: true }).eq('empresa_id', auth.empresaId)
            .like('numero', `ASI-${year}%`);
          const numero = `ASI-${year}-${String((cnt || 0) + 1).padStart(4, '0')}`;
          await guardarAsiento(auth.empresaId, {
            tipo: 'cobro', numero,
            descripcion: `Cobro factura ${factura.numero_factura} — ${factura.cliente_razon_social || ''}`,
            referencia: factura.numero_factura, fecha: fechaCobro, estado: 'activo', origen_automatico: true,
            items: [
              { cuenta_id: ctaCaja.id, cuenta_codigo: ctaCaja.codigo, cuenta_nombre: ctaCaja.nombre, debito: Number(monto), credito: 0, descripcion: 'Cobro factura' },
              { cuenta_id: ctaCxC.id,  cuenta_codigo: ctaCxC.codigo,  cuenta_nombre: ctaCxC.nombre,  debito: 0, credito: Number(monto), descripcion: `Cobro factura ${factura.numero_factura}` },
            ],
            total_debito: Number(monto), total_credito: Number(monto),
          });
        }
      } catch (asientoErr: any) {
        console.warn('[CxC] Asiento no generado:', asientoErr?.message);
      }

      return c.json({ ok: true, cobrado_total: cobradoTotal, monto_cobrado: montoNuevo, saldo: Math.max(0, totalFactura - montoNuevo) });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });
}
