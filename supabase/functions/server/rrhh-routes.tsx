// =====================================================
// RUTAS: RECURSOS HUMANOS — SQL
// Vacantes, evaluaciones, capacitaciones y nóminas
// usan las tablas del módulo RRHH (migración 004).
// Empleados usan kv-helpers → tabla `empleados`.
// =====================================================

import { createClient } from "npm:@supabase/supabase-js";
import {
  inicializarDatosDemo,
  obtenerEmpleados,
  guardarEmpleado,
  eliminarEmpleado,
  registrarAsientoAutomatico
} from "./kv-helpers.tsx";
import * as kv from "./kv_store.tsx";
import { getConfig } from "./facturacion-routes.tsx";

const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export function setupRRHHRoutes(app: any, authMiddleware: any) {

  // ─── EMPLEADOS ────────────────────────────────────────────────────────────

  app.get("/server/rrhh/empleados", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      await inicializarDatosDemo(auth.empresaId);
      let empleados = await obtenerEmpleados(auth.empresaId);
      const activo = c.req.query('activo');
      if (activo !== undefined) {
        const esActivo = activo === 'true';
        empleados = empleados.filter((emp: any) => emp.activo === esActivo);
      }
      empleados.sort((a: any, b: any) =>
        `${a.nombre} ${a.apellido}`.toLowerCase().localeCompare(`${b.nombre} ${b.apellido}`.toLowerCase())
      );
      return c.json({ empleados });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener empleados', details: error.message }, 500);
    }
  });

  app.get("/server/rrhh/empleados/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const empleadoId = c.req.param('id');
    try {
      const empleados = await obtenerEmpleados(auth.empresaId);
      const empleado = empleados.find((e: any) => e.id === empleadoId);
      if (!empleado) return c.json({ error: 'Empleado no encontrado' }, 404);
      return c.json({ empleado });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener empleado', details: error.message }, 500);
    }
  });

  app.post("/server/rrhh/empleados", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const empleadoData = { ...body, empresa_id: auth.empresaId, activo: body.activo !== undefined ? body.activo : true };
      const empleado = await guardarEmpleado(auth.empresaId, empleadoData);
      return c.json({ empleado }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear empleado', details: error.message }, 500);
    }
  });

  app.put("/server/rrhh/empleados/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const empleadoId = c.req.param('id');
    try {
      // SEGURIDAD: guardarEmpleado() hace upsert por `id` sin filtrar por empresa.
      // Verificar propiedad primero — si no, otra empresa podría secuestrar/
      // sobrescribir un empleado ajeno (y reasignarle el empresa_id) vía la URL.
      const actuales = await obtenerEmpleados(auth.empresaId);
      if (!actuales.find((e: any) => e.id === empleadoId)) {
        return c.json({ error: 'Empleado no encontrado' }, 404);
      }

      const body = await c.req.json();
      const empleado = await guardarEmpleado(auth.empresaId, { ...body, id: empleadoId });
      if (!empleado) return c.json({ error: 'Empleado no encontrado' }, 404);
      return c.json({ empleado });
    } catch (error: any) {
      return c.json({ error: 'Error al actualizar empleado', details: error.message }, 500);
    }
  });

  app.delete("/server/rrhh/empleados/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const empleadoId = c.req.param('id');
    try {
      const empleados = await obtenerEmpleados(auth.empresaId);
      const empleado = empleados.find((e: any) => e.id === empleadoId);
      if (!empleado) return c.json({ error: 'Empleado no encontrado' }, 404);
      await eliminarEmpleado(auth.empresaId, empleadoId);
      return c.json({ message: 'Empleado eliminado exitosamente', empleado: `${empleado.nombre} ${empleado.apellido}` });
    } catch (error: any) {
      return c.json({ error: 'Error al eliminar empleado', details: error.message }, 500);
    }
  });

  // ─── VACANTES — SQL ────────────────────────────────────────────────────────

  app.get("/server/rrhh/vacantes", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { data, error } = await getDB().from('vacantes')
        .select('*').eq('empresa_id', auth.empresaId).order('created_at', { ascending: false });
      if (error) throw error;
      return c.json({ vacantes: data || [] });
    } catch (error: any) {
      return c.json({ vacantes: [], error: error.message });
    }
  });

  app.post("/server/rrhh/vacantes", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const { data, error } = await getDB().from('vacantes')
        .insert({ ...body, empresa_id: auth.empresaId })
        .select().single();
      if (error) throw error;
      return c.json({ vacante: data }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear vacante', details: error.message }, 500);
    }
  });

  app.put("/server/rrhh/vacantes/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    try {
      const body = await c.req.json();
      const { data, error } = await getDB().from('vacantes')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('empresa_id', auth.empresaId).eq('id', id)
        .select().single();
      if (error) throw error;
      if (!data) return c.json({ error: 'Vacante no encontrada' }, 404);
      return c.json({ vacante: data });
    } catch (error: any) {
      return c.json({ error: 'Error al actualizar vacante', details: error.message }, 500);
    }
  });

  app.delete("/server/rrhh/vacantes/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    try {
      const { error } = await getDB().from('vacantes')
        .delete().eq('empresa_id', auth.empresaId).eq('id', id);
      if (error) throw error;
      return c.json({ message: 'Vacante eliminada' });
    } catch (error: any) {
      return c.json({ error: 'Error al eliminar vacante', details: error.message }, 500);
    }
  });

  // ─── EVALUACIONES — SQL ───────────────────────────────────────────────────

  app.get("/server/rrhh/evaluaciones", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { data, error } = await getDB().from('evaluaciones')
        .select('*').eq('empresa_id', auth.empresaId).order('created_at', { ascending: false });
      if (error) throw error;
      return c.json({ evaluaciones: data || [] });
    } catch {
      return c.json({ evaluaciones: [] });
    }
  });

  app.post("/server/rrhh/evaluaciones", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const { data, error } = await getDB().from('evaluaciones')
        .insert({ ...body, empresa_id: auth.empresaId })
        .select().single();
      if (error) throw error;
      return c.json({ evaluacion: data }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear evaluación', details: error.message }, 500);
    }
  });

  // ─── CAPACITACIONES — SQL ─────────────────────────────────────────────────

  app.get("/server/rrhh/capacitaciones", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { data, error } = await getDB().from('capacitaciones')
        .select('*').eq('empresa_id', auth.empresaId).order('created_at', { ascending: false });
      if (error) throw error;
      return c.json({ capacitaciones: data || [] });
    } catch {
      return c.json({ capacitaciones: [] });
    }
  });

  app.post("/server/rrhh/capacitaciones", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const { data, error } = await getDB().from('capacitaciones')
        .insert({ ...body, empresa_id: auth.empresaId })
        .select().single();
      if (error) throw error;
      return c.json({ capacitacion: data }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear capacitación', details: error.message }, 500);
    }
  });

  // ─── MÉTRICAS ─────────────────────────────────────────────────────────────

  app.get("/server/rrhh/metricas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const db = getDB();
      const [empleados, { data: vacantes }, { data: evaluaciones }] = await Promise.all([
        obtenerEmpleados(auth.empresaId),
        db.from('vacantes').select('estado').eq('empresa_id', auth.empresaId),
        db.from('evaluaciones').select('calificacion,estado').eq('empresa_id', auth.empresaId),
      ]);

      const activos = empleados.filter((e: any) => e.activo !== false);
      const salarios = activos.map((e: any) => Number(e.salario) || 0).filter(s => s > 0);
      const salarioPromedio = salarios.length > 0 ? salarios.reduce((a, b) => a + b, 0) / salarios.length : 0;
      const vacantesAbiertas = (vacantes || []).filter((v: any) => v.estado === 'abierta' || !v.estado).length;
      const calificaciones = (evaluaciones || []).map((e: any) => Number(e.calificacion) || 0).filter(p => p > 0);
      const climaLaboral = calificaciones.length > 0
        ? calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length : 0;

      return c.json({
        empleados_activos: activos.length,
        total_empleados: empleados.length,
        salario_promedio: salarioPromedio,
        vacantes_abiertas: vacantesAbiertas,
        clima_laboral: climaLaboral,
        evaluaciones_pendientes: (evaluaciones || []).filter((e: any) => e.estado === 'pendiente').length,
      });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener métricas', details: error.message }, 500);
    }
  });

  // ─── NÓMINA — SQL ─────────────────────────────────────────────────────────

  app.post("/server/rrhh/nomina", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const { periodo, empleados_ids, observaciones } = body;

      const todosEmpleados = await obtenerEmpleados(auth.empresaId);
      const empleadosPagar = empleados_ids?.length
        ? todosEmpleados.filter((e: any) => empleados_ids.includes(e.id) && e.activo)
        : todosEmpleados.filter((e: any) => e.activo);

      if (empleadosPagar.length === 0) {
        return c.json({ error: 'No hay empleados activos para procesar' }, 400);
      }

      let totalSueldos = 0, totalIESSPersonal = 0, totalIESSPatronal = 0;
      const detalles = empleadosPagar.map((e: any) => {
        const sueldo       = Number(e.salario || 0);
        const iessPersonal = +(sueldo * 0.0945).toFixed(2);
        const iessPatronal = +(sueldo * 0.1215).toFixed(2);
        const liquidoRecibir = +(sueldo - iessPersonal).toFixed(2);
        totalSueldos      += sueldo;
        totalIESSPersonal += iessPersonal;
        totalIESSPatronal += iessPatronal;
        return { id: e.id, nombre: e.nombre_completo, sueldo, iessPersonal, iessPatronal, liquidoRecibir };
      });

      totalSueldos      = +totalSueldos.toFixed(2);
      totalIESSPersonal = +totalIESSPersonal.toFixed(2);
      totalIESSPatronal = +totalIESSPatronal.toFixed(2);
      const totalLiquido = +(totalSueldos - totalIESSPersonal).toFixed(2);
      const gastoTotal   = +(totalSueldos + totalIESSPatronal).toFixed(2);
      const fechaHoy = new Date().toISOString().split('T')[0];

      // Guardar nómina en SQL
      const { data: nomina, error: nomErr } = await getDB().from('nominas').insert({
        empresa_id: auth.empresaId,
        periodo: periodo || fechaHoy,
        fecha: fechaHoy,
        estado: 'procesada',
        total: gastoTotal,
        items: detalles,
        metadata: { totalSueldos, totalIESSPersonal, totalIESSPatronal, totalLiquido, observaciones },
      }).select().single();
      if (nomErr) throw nomErr;

      // Asiento contable
      await registrarAsientoAutomatico(auth.empresaId, {
        tipo: 'nomina',
        descripcion: `Rol de pagos ${periodo || fechaHoy}`,
        referencia: nomina.id,
        fecha: fechaHoy,
        items: [
          { codigo: '6.1.01', debito: totalSueldos,      descripcion: 'Sueldos y salarios' },
          { codigo: '6.1.06', debito: totalIESSPatronal, descripcion: 'Aporte patronal IESS 12.15%' },
          { codigo: '2.1.06', credito: totalIESSPersonal, descripcion: 'IESS personal por pagar 9.45%' },
          { codigo: '2.1.07', credito: totalIESSPatronal, descripcion: 'IESS patronal por pagar' },
          { codigo: '2.1.08', credito: totalLiquido,      descripcion: 'Sueldos por pagar (líquido)' },
        ],
      });

      return c.json({ nomina, mensaje: `Nómina procesada: ${empleadosPagar.length} empleados, total $${gastoTotal}` }, 201);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.get("/server/rrhh/nominas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { data, error } = await getDB().from('nominas')
        .select('*').eq('empresa_id', auth.empresaId).order('created_at', { ascending: false });
      if (error) throw error;
      return c.json({ nominas: data || [] });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── ESTADÍSTICAS ─────────────────────────────────────────────────────────

  app.get("/server/rrhh/estadisticas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      await inicializarDatosDemo(auth.empresaId);
      const empleados = await obtenerEmpleados(auth.empresaId);
      const totalEmpleados = empleados.length;
      const empleadosActivos = empleados.filter((e: any) => e.activo).length;

      const porPuesto = Object.values(empleados.reduce((acc: any, emp: any) => {
        const p = emp.puesto || 'Sin puesto';
        if (!acc[p]) acc[p] = { puesto: p, cantidad: 0 };
        acc[p].cantidad++;
        return acc;
      }, {}));

      const porDepartamento = Object.values(empleados.reduce((acc: any, emp: any) => {
        const d = emp.departamento_id || 'Sin departamento';
        if (!acc[d]) acc[d] = { departamento: d, cantidad: 0 };
        acc[d].cantidad++;
        return acc;
      }, {}));

      const masaSalarial = empleados
        .filter((e: any) => e.activo)
        .reduce((sum: number, e: any) => sum + (e.salario || 0), 0);

      return c.json({
        resumen: { total: totalEmpleados, activos: empleadosActivos, inactivos: totalEmpleados - empleadosActivos, masa_salarial: masaSalarial },
        por_puesto: porPuesto,
        por_departamento: porDepartamento,
      });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener estadísticas', details: error.message }, 500);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // NÓMINA ECUADOR — Cálculo, historial, rol de pagos y email
  // ══════════════════════════════════════════════════════════════════════

  // Tabla IR Ecuador 2026 (anual) — Resolución NAC-DGERCGC25-00000043, vigente desde 1/1/2026
  const TABLA_IR = [
    { desde: 0,      hasta: 12208,    base: 0,     excedente: 0,      fraccion: 0    },
    { desde: 12208,  hasta: 15549,    base: 0,     excedente: 12208,  fraccion: 0.05 },
    { desde: 15549,  hasta: 20188,    base: 167,   excedente: 15549,  fraccion: 0.10 },
    { desde: 20188,  hasta: 26700,    base: 631,   excedente: 20188,  fraccion: 0.12 },
    { desde: 26700,  hasta: 35136,    base: 1412,  excedente: 26700,  fraccion: 0.15 },
    { desde: 35136,  hasta: 46575,    base: 2678,  excedente: 35136,  fraccion: 0.20 },
    { desde: 46575,  hasta: 62005,    base: 4965,  excedente: 46575,  fraccion: 0.25 },
    { desde: 62005,  hasta: 82679,    base: 8823,  excedente: 62005,  fraccion: 0.30 },
    { desde: 82679,  hasta: 109956,   base: 15025, excedente: 82679,  fraccion: 0.35 },
    { desde: 109956, hasta: Infinity, base: 24572, excedente: 109956, fraccion: 0.37 },
  ];

  const calcularIR = (ingresoAnual: number): number => {
    const tramo = TABLA_IR.find(t => ingresoAnual >= t.desde && ingresoAnual < t.hasta);
    if (!tramo || tramo.fraccion === 0) return 0;
    return tramo.base + (ingresoAnual - tramo.excedente) * tramo.fraccion;
  };

  const SBU = 482; // SBU Ecuador 2026 (acuerdo tripartito, vigente desde 1/1/2026)
  const DIAS_ANIO_LABORAL = 360; // año comercial laboral Ecuador

  // Vacaciones anuales segun Art. 69 del Codigo de Trabajo:
  //   15 dias por año cumplido. A partir del 6to año (>5 años de servicio),
  //   1 dia adicional por cada año extra, hasta un maximo de 15 dias extras.
  const diasVacacionesAnuales = (mesesAnt: number) => {
    const aniosCompletos = Math.floor(mesesAnt / 12);
    if (aniosCompletos <= 5) return 15;
    return 15 + Math.min(aniosCompletos - 5, 15);
  };

  const computeRol = (emp: any, extras: any = {}) => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const salarioBase = Number(emp.salario_base || emp.salario || 0);
    const horasExtras = Number(extras.horas_extras || 0);
    const otrosIngresos = Number(extras.otros_ingresos || 0);
    const descuentos = Number(extras.descuentos || 0);

    // Horas extras
    const valorHoraBase = salarioBase / 160;
    const horasExtrasDiurnas = Number(extras.horas_extras_diurnas || horasExtras);
    const horasExtrasNocturnas = Number(extras.horas_extras_nocturnas || 0);
    // Validacion limite Art. 55: max 4h/dia suplementarias (sin contar
    // extraordinarias). El sistema acepta el valor pero lo flagea.
    const excedeLimiteSuplementarias = horasExtrasDiurnas > 4 * 22; // 4h x 22 dias habiles
    const montoExtras = horasExtrasDiurnas * valorHoraBase * 1.5 + horasExtrasNocturnas * valorHoraBase * 2;

    const salarioBruto = r2(salarioBase + montoExtras + otrosIngresos);

    // IESS
    const iessPersonal = r2(salarioBruto * 0.0945);
    const iessPatronal = r2(salarioBruto * 0.1115);

    // Fondos de reserva (Art. 196): a partir del 13er mes de trabajo
    const fechaIngreso = emp.fecha_ingreso ? new Date(emp.fecha_ingreso) : new Date();
    const mesesAntigüedad = Math.floor((Date.now() - fechaIngreso.getTime()) / (30.44 * 86400000));
    const tieneFondosReserva = mesesAntigüedad >= 12;
    const fondosReserva = tieneFondosReserva ? r2(salarioBruto * 0.0833) : 0;

    // Impuesto a la Renta — decimos 13 y 14 son ingresos exentos (Art. 9 LRTI)
    // por lo que NO se incluyen en la proyeccion anual.
    const ingresoAnualProyectado = salarioBruto * 12;
    const irAnual = calcularIR(ingresoAnualProyectado);
    const irMensual = r2(irAnual / 12);

    // Neto a pagar
    const netoPagar = r2(salarioBruto - iessPersonal - irMensual - descuentos);

    // Provisiones — vacaciones escaladas por antiguedad (Art. 69)
    const diasVac = diasVacacionesAnuales(mesesAntigüedad);
    const provDecimo13 = r2(salarioBruto / 12);
    const provDecimo14 = r2(SBU / 12);
    const provVacaciones = r2(salarioBruto * diasVac / DIAS_ANIO_LABORAL / 12);

    // Costo total empresa
    const costoEmpresa = r2(salarioBruto + iessPatronal + fondosReserva + provDecimo13 + provDecimo14 + provVacaciones);

    return {
      empleado_id: emp.id,
      empleado_nombre: emp.nombre_completo || emp.nombre || '',
      cargo: emp.cargo || emp.puesto || '',
      departamento: emp.departamento || '',
      email: emp.email || '',
      fecha_ingreso: emp.fecha_ingreso || '',
      meses_antiguedad: mesesAntigüedad,
      salario_base: salarioBase,
      horas_extras_diurnas: horasExtrasDiurnas,
      horas_extras_nocturnas: horasExtrasNocturnas,
      monto_extras: r2(montoExtras),
      otros_ingresos: otrosIngresos,
      descuentos,
      salario_bruto: salarioBruto,
      iess_personal: iessPersonal,
      iess_patronal: iessPatronal,
      fondos_reserva: fondosReserva,
      tiene_fondos_reserva: tieneFondosReserva,
      ir_mensual: irMensual,
      ir_anual_proyectado: r2(irAnual),
      neto_pagar: netoPagar,
      prov_decimo13: provDecimo13,
      prov_decimo14: provDecimo14,
      prov_vacaciones: provVacaciones,
      dias_vacaciones_anuales: diasVac,
      excede_limite_horas_extras_art_55: excedeLimiteSuplementarias,
      costo_empresa: costoEmpresa,
    };
  };

  // POST /rrhh/nomina/calcular — calcula y guarda una nómina mensual
  app.post("/server/rrhh/nomina/calcular", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { anio, mes, extras = {}, notas = '' } = await c.req.json();
      if (!anio || !mes) return c.json({ error: 'anio y mes requeridos' }, 400);

      const empleados = await obtenerEmpleados(auth.empresaId);
      const activos = empleados.filter((e: any) => e.activo !== false && e.estado !== 'inactivo');

      const detalle = activos.map((emp: any) => computeRol(emp, extras[emp.id] || {}));

      const totales = detalle.reduce((t: any, r: any) => ({
        bruto:   t.bruto   + r.salario_bruto,
        personal: t.personal + r.iess_personal,
        patronal: t.patronal + r.iess_patronal,
        fondos:  t.fondos  + r.fondos_reserva,
        ir:      t.ir      + r.ir_mensual,
        neto:    t.neto    + r.neto_pagar,
        costo:   t.costo   + r.costo_empresa,
      }), { bruto:0, personal:0, patronal:0, fondos:0, ir:0, neto:0, costo:0 });

      const { data, error } = await db.from('nomina_periodos')
        .upsert({
          empresa_id: auth.empresaId, anio, mes,
          estado: 'borrador',
          total_bruto:         Math.round(totales.bruto * 100) / 100,
          total_iess_personal: Math.round(totales.personal * 100) / 100,
          total_iess_patronal: Math.round(totales.patronal * 100) / 100,
          total_neto:          Math.round(totales.neto * 100) / 100,
          total_costo_empresa: Math.round(totales.costo * 100) / 100,
          detalle, notas, usuario_id: auth.userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'empresa_id,anio,mes' })
        .select().single();

      if (error) throw error;
      return c.json({ ok: true, nomina: data, totales, empleados_procesados: detalle.length });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // GET /rrhh/nomina/historial — lista nóminas guardadas
  app.get("/server/rrhh/nomina/historial", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { data } = await db.from('nomina_periodos')
        .select('id,anio,mes,estado,total_bruto,total_neto,total_costo_empresa,created_at')
        .eq('empresa_id', auth.empresaId)
        .order('anio', { ascending: false }).order('mes', { ascending: false })
        .limit(24);
      return c.json({ historial: data || [] });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // GET /rrhh/nomina/:id — detalle de una nómina
  app.get("/server/rrhh/nomina/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { data, error } = await db.from('nomina_periodos')
        .select('*').eq('id', c.req.param('id')).eq('empresa_id', auth.empresaId).maybeSingle();
      if (error) throw error;
      return c.json({ nomina: data });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /rrhh/nomina/:id/enviar-roles — envía rol de pagos por email a cada empleado
  app.post("/server/rrhh/nomina/:id/enviar-roles", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const body = await c.req.json().catch(() => ({}));
      const { data: nomina } = await db.from('nomina_periodos')
        .select('*').eq('id', c.req.param('id')).eq('empresa_id', auth.empresaId).maybeSingle();
      if (!nomina) return c.json({ error: 'Nómina no encontrada' }, 404);

      const apiKey = Deno.env.get('RESEND_API_KEY');
      const fromDomain = Deno.env.get('RESEND_FROM_DOMAIN') || 'onboarding@resend.dev';
      const from = fromDomain.includes('@') ? fromDomain : `noreply@${fromDomain}`;

      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const periodoLabel = `${meses[nomina.mes - 1]} ${nomina.anio}`;
      const detalle: any[] = typeof nomina.detalle === 'string' ? JSON.parse(nomina.detalle) : (nomina.detalle || []);

      let enviados = 0; const errores: string[] = [];

      for (const rol of detalle) {
        if (!rol.email || !rol.email.includes('@')) {
          errores.push(`${rol.empleado_nombre}: sin email`); continue;
        }
        if (body.solo_empleado_id && rol.empleado_id !== body.solo_empleado_id) continue;

        const html = generarHTMLRolPagos(rol, periodoLabel, auth);
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [rol.email],
            subject: `Rol de Pagos — ${periodoLabel}`,
            html,
          }),
        });
        if (res.ok) enviados++;
        else { const e = await res.json(); errores.push(`${rol.empleado_nombre}: ${e.message}`); }
      }

      // Marcar como cerrado si se enviaron todos
      if (enviados === detalle.filter((r: any) => r.email).length) {
        await db.from('nomina_periodos').update({ estado: 'cerrado', updated_at: new Date().toISOString() })
          .eq('id', nomina.id);
      }

      return c.json({ ok: true, enviados, errores: errores.length ? errores : undefined });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /rrhh/nomina/:id/asiento — genera asiento contable de la nómina
  app.post("/server/rrhh/nomina/:id/asiento", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const { data: nomina } = await db.from('nomina_periodos')
        .select('*').eq('id', c.req.param('id')).eq('empresa_id', auth.empresaId).maybeSingle();
      if (!nomina) return c.json({ error: 'Nómina no encontrada' }, 404);

      const mes = nomina.mes; const anio = nomina.anio;
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const fechaAsiento = `${anio}-${String(mes).padStart(2,'0')}-${String(new Date(anio, mes, 0).getDate()).padStart(2,'0')}`;

      await registrarAsientoAutomatico(auth.empresaId, {
        tipo: 'nomina',
        descripcion: `Nómina ${meses[mes-1]} ${anio}`,
        referencia: nomina.id,
        fecha: fechaAsiento,
        items: [
          { codigo: '520101', debito: Math.round(nomina.total_bruto * 100)/100,         descripcion: 'Sueldos, Salarios y Remuneraciones' },
          { codigo: '520102', debito: Math.round(nomina.total_iess_patronal * 100)/100,  descripcion: 'Aportes a la Seguridad Social (IESS Patronal)' },
          { codigo: '2010704', credito: Math.round(nomina.total_neto * 100)/100,         descripcion: 'Sueldos por Pagar a Empleados' },
          { codigo: '2010703', credito: Math.round((nomina.total_iess_personal + nomina.total_iess_patronal) * 100)/100, descripcion: 'IESS por Pagar' },
        ],
      });

      await db.from('nomina_periodos').update({ asiento_id: nomina.id, updated_at: new Date().toISOString() })
        .eq('id', nomina.id);

      return c.json({ ok: true, mensaje: 'Asiento contable de nómina generado' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /rrhh/nomina/finiquito — calcula liquidacion de un empleado
  //
  // Body:
  //   empleado_id: string (requerido)
  //   fecha_salida: 'YYYY-MM-DD' (default: hoy)
  //   motivo: 'renuncia' | 'desahucio' | 'despido_intempestivo' | 'visto_bueno' (default 'renuncia')
  //   region: 'sierra_oriente' | 'costa_galapagos' (default: emp.region o 'sierra_oriente')
  //
  // Cumple Codigo de Trabajo Ecuador:
  //   Art. 69    — Vacaciones (15 dias + escalonadas desde año 6, max 30)
  //   Art. 71    — Pago vacaciones = remuneracion / 24 base, ajustado por antiguedad
  //   Art. 97    — 15% utilidades (calculado en endpoint separado)
  //   Art. 111   — Decimo tercero (1 dic — 30 nov)
  //   Art. 113   — Decimo cuarto regionalizado:
  //                  Sierra/Oriente: 1 ago — 31 jul
  //                  Costa/Galapagos: 1 mar — 28 feb
  //   Art. 185   — Bonificacion por desahucio: 25% ultima remuneracion x años (max 25)
  //   Art. 188   — Indemnizacion despido intempestivo:
  //                  Hasta 3 años de servicio: 3 meses de remuneracion
  //                  Mas de 3 años: 3 meses + 1 mes por cada año adicional
  //                  Maximo total: 25 meses
  //   Art. 196   — Fondos de reserva 8.33% mensual desde mes 13
  app.post("/server/rrhh/nomina/finiquito", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const { empleado_id, fecha_salida, motivo = 'renuncia' } = body;
      const empleados = await obtenerEmpleados(auth.empresaId);
      const emp = empleados.find((e: any) => e.id === empleado_id);
      if (!emp) return c.json({ error: 'Empleado no encontrado' }, 404);

      const r2 = (n: number) => Math.round(n * 100) / 100;
      const region: 'sierra_oriente' | 'costa_galapagos' =
        (body.region || emp.region || 'sierra_oriente') as any;

      const fechaIngreso = new Date(emp.fecha_ingreso || Date.now());
      const fechaSalida = fecha_salida ? new Date(fecha_salida) : new Date();
      const diasTrabajados = Math.floor((fechaSalida.getTime() - fechaIngreso.getTime()) / 86400000);
      const aniosTrabajados = diasTrabajados / DIAS_ANIO_LABORAL;
      const mesesTrabajados = diasTrabajados / 30;
      const salario = Number(emp.salario_base || emp.salario || 0);

      // ── Decimo 13ro proporcional (Art. 111): periodo 1-dic año anterior a 30-nov ──
      // Si salida cae despues del 30-nov, el periodo es 1-dic año actual a fecha_salida
      const anio = fechaSalida.getFullYear();
      const inicio13 = fechaSalida >= new Date(anio, 10, 30) // 30 nov
        ? new Date(anio, 11, 1)        // 1 dic año actual
        : new Date(anio - 1, 11, 1);   // 1 dic año anterior
      const dias13 = Math.max(0, Math.floor((fechaSalida.getTime() - inicio13.getTime()) / 86400000));
      const decimo13Proporcional = r2(salario * dias13 / DIAS_ANIO_LABORAL);

      // ── Decimo 14to proporcional (Art. 113): regionalizado ──────────────
      let inicio14: Date;
      if (region === 'sierra_oriente') {
        // 1 ago — 31 jul
        inicio14 = fechaSalida >= new Date(anio, 7, 1)
          ? new Date(anio, 7, 1)
          : new Date(anio - 1, 7, 1);
      } else {
        // Costa/Galapagos: 1 mar — 28 feb
        inicio14 = fechaSalida >= new Date(anio, 2, 1)
          ? new Date(anio, 2, 1)
          : new Date(anio - 1, 2, 1);
      }
      const dias14 = Math.max(0, Math.floor((fechaSalida.getTime() - inicio14.getTime()) / 86400000));
      const decimo14Proporcional = r2(SBU * dias14 / DIAS_ANIO_LABORAL);

      // ── Vacaciones proporcionales (Art. 69-71) ──────────────────────────
      // Dias por año segun antiguedad
      const mesesAnt = Math.floor(diasTrabajados / 30);
      const diasVac = diasVacacionesAnuales(mesesAnt);
      // Proporcional al ultimo año de servicio (desde aniversario hasta salida)
      const mesesDesdeAniversario = mesesAnt % 12;
      const vacacionesProporcionales = r2(salario * diasVac * mesesDesdeAniversario / 12 / DIAS_ANIO_LABORAL);

      // ── Fondos de reserva proporcionales (Art. 196) ─────────────────────
      // 8.33% mensual desde mes 13. Aqui se acumulan los pendientes del año
      // (simplificado: meses desde 1-ene o desde mes 13 si es primer año).
      const inicioFR = fechaIngreso.getTime() + 365 * 86400000;
      const inicioFRYear = new Date(Math.max(inicioFR, new Date(anio, 0, 1).getTime()));
      const mesesFR = fechaSalida > inicioFRYear
        ? Math.floor((fechaSalida.getTime() - inicioFRYear.getTime()) / (30 * 86400000))
        : 0;
      const fondosReservaProp = mesesTrabajados > 12 ? r2(salario * 0.0833 * mesesFR) : 0;

      // ── Bonificacion por desahucio (Art. 185) ───────────────────────────
      // 25% de la ultima remuneracion x años de servicio (sin tope explicito,
      // pero por jurisprudencia se aplica el tope de 25 años de Art. 188)
      const desahucio = motivo === 'desahucio'
        ? r2(salario * 0.25 * Math.min(aniosTrabajados, 25))
        : 0;

      // ── Indemnizacion despido intempestivo (Art. 188) ───────────────────
      // Hasta 3 años: 3 meses de remuneracion
      // Mas de 3 años: 3 meses + 1 mes por año adicional, hasta 25 meses total
      let indemnizacionDespido = 0;
      if (motivo === 'despido_intempestivo') {
        const mesesIndemniz = aniosTrabajados <= 3
          ? 3
          : Math.min(25, 3 + (Math.floor(aniosTrabajados) - 3));
        indemnizacionDespido = r2(salario * mesesIndemniz);
      }

      const total = r2(
        decimo13Proporcional + decimo14Proporcional + vacacionesProporcionales +
        fondosReservaProp + desahucio + indemnizacionDespido
      );

      const notas: Record<string, string> = {
        renuncia: 'Renuncia voluntaria — sin indemnizacion ni desahucio (Art. 169).',
        desahucio: 'Desahucio por empleador (Art. 185) = 25% ultima remuneracion x años de servicio.',
        despido_intempestivo: 'Despido intempestivo (Art. 188) = 3 meses + 1 mes por cada año sobre 3, max 25 meses.',
        visto_bueno: 'Visto bueno aprobado por inspector — equivale a despido intempestivo si la causa fue del trabajador.',
      };

      return c.json({
        empleado: { nombre: emp.nombre_completo || emp.nombre, cargo: emp.cargo, email: emp.email },
        periodo: {
          fecha_ingreso: emp.fecha_ingreso,
          fecha_salida: fechaSalida.toISOString().split('T')[0],
          dias_trabajados: diasTrabajados,
          anios: r2(aniosTrabajados),
          region,
        },
        calculo: {
          salario_base: salario,
          dias_vacaciones_anuales: diasVac,
          decimo13_proporcional: decimo13Proporcional,
          decimo14_proporcional: decimo14Proporcional,
          vacaciones_proporcionales: vacacionesProporcionales,
          fondos_reserva_proporcional: fondosReservaProp,
          desahucio,
          indemnizacion_despido_intempestivo: indemnizacionDespido,
          total_liquidacion: total,
        },
        motivo,
        nota: notas[motivo] || notas.renuncia,
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /rrhh/utilidades — reparte el 15% de utilidades segun Art. 97
  //
  // Body:
  //   utilidad_ejercicio: number (utilidad contable antes de impuestos)
  //   anio: number (ejercicio fiscal)
  //   cargas_familiares: { [empleado_id]: number } (default 0 por empleado)
  //   meses_trabajados: { [empleado_id]: number } (default 12 por empleado activo)
  //
  // Reparto:
  //   - 10% en proporcion al tiempo trabajado en el ejercicio
  //   - 5% en proporcion a las cargas familiares (conyuge, hijos < 18, hijos
  //     discapacitados sin limite de edad)
  app.post("/server/rrhh/utilidades", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const utilidad = Number(body.utilidad_ejercicio || 0);
      const anio = Number(body.anio || new Date().getFullYear() - 1);
      const cargasMap = body.cargas_familiares || {};
      const mesesMap  = body.meses_trabajados || {};
      const r2 = (n: number) => Math.round(n * 100) / 100;

      if (utilidad <= 0) {
        return c.json({ anio, utilidad_ejercicio: utilidad, total_a_repartir: 0,
          mensaje: 'Sin utilidades — no aplica reparto del Art. 97.', reparto: [] });
      }

      const empleados = await obtenerEmpleados(auth.empresaId);
      const activos = empleados.filter((e: any) => e.activo !== false && e.estado !== 'inactivo');

      const totalParaRepartir = r2(utilidad * 0.15);
      const fondo10 = r2(totalParaRepartir * (10 / 15)); // 10% de la utilidad
      const fondo5  = r2(totalParaRepartir * (5 / 15));  // 5% de la utilidad

      // Totales para prorratear
      const totalMeses = activos.reduce((s: number, e: any) =>
        s + (Number(mesesMap[e.id] ?? 12)), 0);
      const totalCargas = activos.reduce((s: number, e: any) =>
        s + (Number(cargasMap[e.id] ?? 0)), 0);

      const reparto = activos.map((e: any) => {
        const meses  = Number(mesesMap[e.id] ?? 12);
        const cargas = Number(cargasMap[e.id] ?? 0);
        const porTiempo  = totalMeses  > 0 ? r2(fondo10 * meses  / totalMeses)  : 0;
        const porCargas  = totalCargas > 0 ? r2(fondo5  * cargas / totalCargas) : 0;
        const total = r2(porTiempo + porCargas);
        return {
          empleado_id: e.id,
          empleado_nombre: e.nombre_completo || e.nombre || '',
          cargo: e.cargo || '',
          meses_trabajados: meses,
          cargas_familiares: cargas,
          parte_tiempo_10pct: porTiempo,
          parte_cargas_5pct: porCargas,
          total_a_recibir: total,
        };
      });

      const totalRepartido = r2(reparto.reduce((s: number, r: any) => s + r.total_a_recibir, 0));

      return c.json({
        anio,
        utilidad_ejercicio: r2(utilidad),
        total_a_repartir: totalParaRepartir,
        fondo_10pct_tiempo: fondo10,
        fondo_5pct_cargas: fondo5,
        total_repartido: totalRepartido,
        empleados_beneficiarios: activos.length,
        reparto,
        nota: 'Art. 97 Codigo de Trabajo: 15% utilidades. 10% por tiempo trabajado + 5% por cargas familiares. ' +
              'Pago hasta 15 de abril del año siguiente. Cargas familiares = conyuge/conviviente + hijos menores de 18 ' +
              'o con discapacidad sin limite de edad. VERIFIQUE el numero de cargas con cada empleado.',
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ── ENCUESTA DE CLIMA LABORAL (anonima) ────────────────────────────────
  //
  // Las respuestas se almacenan bajo claves con prefijo
  // `clima_<empresaId>_<periodo>_<hash>` donde:
  //   periodo = 'YYYY-Q1' | 'YYYY-Q2' | 'YYYY-Q3' | 'YYYY-Q4'
  //   hash    = SHA-256(empresaId + empleadoId + periodo) — estable
  // Esto:
  //   1. Permite que un mismo empleado solo cuente una vez por periodo
  //      (idempotente: re-enviar sobrescribe su respuesta anterior).
  //   2. NO almacena el empleado_id, solo el hash, garantizando anonimato.
  //   3. Listar por prefijo agrega todas las respuestas sin identificarlas.

  const periodoActual = () => {
    const d = new Date();
    return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  };

  const hashEmpleadoPeriodo = async (empresaId: string, empleadoId: string, periodo: string) => {
    const data = new TextEncoder().encode(`${empresaId}|${empleadoId}|${periodo}`);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // POST /rrhh/clima/responder — guarda respuesta anonima del periodo actual
  app.post("/server/rrhh/clima/responder", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { respuestas } = await c.req.json();
      if (!Array.isArray(respuestas) || respuestas.length === 0) {
        return c.json({ error: 'respuestas: array no vacio requerido' }, 400);
      }
      // Validar que cada respuesta sea numero 1..5
      const r = respuestas.map((v: any) => Number(v));
      if (r.some(v => !Number.isFinite(v) || v < 1 || v > 5)) {
        return c.json({ error: 'cada respuesta debe ser un numero entre 1 y 5' }, 400);
      }
      const periodo = periodoActual();
      const hash = await hashEmpleadoPeriodo(auth.empresaId, auth.userId, periodo);
      const key  = `clima_${auth.empresaId}_${periodo}_${hash}`;
      await kv.set(key, {
        respuestas: r,
        periodo,
        created_at: new Date().toISOString(),
      });
      return c.json({ ok: true, periodo, hash_respuesta: hash.slice(0, 8) });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // GET /rrhh/clima/resultados?periodo=YYYY-Qn — agrega respuestas del periodo
  // Por privacidad solo devuelve agregados si hay >= 3 respuestas.
  app.get("/server/rrhh/clima/resultados", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const periodo = (c.req.query('periodo') as string) || periodoActual();
      const prefix  = `clima_${auth.empresaId}_${periodo}_`;
      const valores = await kv.getByPrefix(prefix);

      // Verificar si el usuario actual ya respondio (sin revelar quien mas)
      const miHash = await hashEmpleadoPeriodo(auth.empresaId, auth.userId, periodo);
      const yaRespondi = await kv.get(`${prefix}${miHash}`).then((v: any) => !!v).catch(() => false);

      if (valores.length < 3) {
        return c.json({
          periodo,
          total_respuestas: valores.length,
          ya_respondi: yaRespondi,
          umbral_minimo: 3,
          mensaje: `Se requieren al menos 3 respuestas para mostrar resultados (preservacion de anonimato). Actualmente: ${valores.length}.`,
          promedios_por_pregunta: null,
          promedio_general: null,
        });
      }

      // Agregado: promedio por indice de pregunta
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const numPreguntas = Math.max(...valores.map((v: any) => (v?.respuestas?.length || 0)));
      const promedios: number[] = [];
      for (let i = 0; i < numPreguntas; i++) {
        const items = valores.map((v: any) => Number(v?.respuestas?.[i]))
          .filter((n: number) => Number.isFinite(n));
        promedios.push(items.length > 0 ? r2(items.reduce((a: number, b: number) => a + b, 0) / items.length) : 0);
      }
      const promedioGeneral = promedios.length > 0
        ? r2(promedios.reduce((a, b) => a + b, 0) / promedios.length) : 0;

      return c.json({
        periodo,
        total_respuestas: valores.length,
        ya_respondi: yaRespondi,
        promedios_por_pregunta: promedios,
        promedio_general: promedioGeneral,
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ══════════════════════════════════════════════════════════════════════
  // 10% DE SERVICIO (Ley de Turismo)
  // ══════════════════════════════════════════════════════════════════════
  //
  // El 10% recaudado en facturas pertenece a los trabajadores y debe ser
  // distribuido mensualmente entre todos los empleados del establecimiento.
  //
  // Las distribuciones se almacenan en kv_store bajo la clave
  // `servicio_distribucion_<empresaId>_<anio>_<mes>`. Una sola distribucion
  // por periodo (re-distribuir sobrescribe).

  const sumarServicioAcumulado = async (db: any, empresaId: string, anio: number, mes: number) => {
    const fi = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anio, mes, 0).getDate();
    const ff = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}T23:59:59`;
    const config: any = await getConfig(empresaId).catch(() => null);
    const cobra = !!config?.cobra_servicio_10pct;
    const pct   = Number(config?.porcentaje_servicio ?? 10);
    if (!cobra) return { total: 0, configurado: false, porcentaje: pct };
    const { data: ventas } = await db.from('ventas')
      .select('subtotal')
      .eq('empresa_id', empresaId)
      .eq('anulada', false)
      .gte('created_at', `${fi}T00:00:00`)
      .lte('created_at', ff);
    const subtotal = (ventas || []).reduce((s: number, v: any) => s + Number(v.subtotal || 0), 0);
    const total = Math.round(subtotal * pct / 100 * 100) / 100;
    return { total, configurado: true, porcentaje: pct, subtotal_periodo: Math.round(subtotal * 100) / 100 };
  };

  // GET /rrhh/servicio/acumulado?anio=YYYY&mes=MM
  // Devuelve el total acumulado del 10% en el periodo + estado de distribucion
  app.get("/server/rrhh/servicio/acumulado", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const anio = Number(c.req.query('anio') || new Date().getFullYear());
      const mes  = Number(c.req.query('mes')  || new Date().getMonth() + 1);
      const calc = await sumarServicioAcumulado(db, auth.empresaId, anio, mes);
      const distribucion = await kv.get(`servicio_distribucion_${auth.empresaId}_${anio}_${mes}`);
      return c.json({ anio, mes, ...calc, distribucion: distribucion || null });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /rrhh/servicio/distribuir
  // body: { anio, mes, total_servicio?, criterio?: 'equitativo' | 'horas',
  //         horas_por_empleado?: { [empleadoId]: number } }
  // Distribuye el 10% acumulado en el periodo. Si no se pasa total_servicio,
  // se calcula desde ventas. Genera asiento contable opcional.
  app.post("/server/rrhh/servicio/distribuir", authMiddleware, async (c: any) => {
    const auth = c.get('auth'); const db = getDB();
    try {
      const body = await c.req.json();
      const anio = Number(body.anio);
      const mes  = Number(body.mes);
      if (!anio || !mes) return c.json({ error: 'anio y mes requeridos' }, 400);
      const criterio: 'equitativo' | 'horas' = body.criterio === 'horas' ? 'horas' : 'equitativo';
      const horasMap = body.horas_por_empleado || {};
      const r2 = (n: number) => Math.round(n * 100) / 100;

      let totalServicio = Number(body.total_servicio || 0);
      if (totalServicio <= 0) {
        const calc = await sumarServicioAcumulado(db, auth.empresaId, anio, mes);
        totalServicio = calc.total;
      }
      if (totalServicio <= 0) {
        return c.json({ error: 'No hay 10% de servicio acumulado en el periodo' }, 400);
      }

      const empleados = await obtenerEmpleados(auth.empresaId);
      const activos = empleados.filter((e: any) => e.activo !== false && e.estado !== 'inactivo');
      if (activos.length === 0) return c.json({ error: 'No hay empleados activos para distribuir' }, 400);

      let reparto: any[];
      if (criterio === 'horas') {
        const totalHoras = activos.reduce((s: number, e: any) => s + Number(horasMap[e.id] || 0), 0);
        if (totalHoras <= 0) {
          return c.json({ error: 'criterio=horas requiere horas_por_empleado con al menos un valor > 0' }, 400);
        }
        reparto = activos.map((e: any) => {
          const h = Number(horasMap[e.id] || 0);
          const monto = r2(totalServicio * h / totalHoras);
          return {
            empleado_id: e.id,
            empleado_nombre: e.nombre_completo || e.nombre || '',
            cargo: e.cargo || '',
            horas: h,
            monto,
          };
        });
      } else {
        const porEmp = r2(totalServicio / activos.length);
        // Ajuste de redondeo: el remanente se suma al ultimo empleado
        let acumulado = 0;
        reparto = activos.map((e: any, i: number) => {
          const esUltimo = i === activos.length - 1;
          const monto = esUltimo ? r2(totalServicio - acumulado) : porEmp;
          acumulado += monto;
          return {
            empleado_id: e.id,
            empleado_nombre: e.nombre_completo || e.nombre || '',
            cargo: e.cargo || '',
            monto,
          };
        });
      }

      const totalRepartido = r2(reparto.reduce((s, r) => s + r.monto, 0));

      // Asiento contable: DB 2010706 (acumulado) / CR 2010704 (sueldos por pagar)
      try {
        const fechaAsiento = `${anio}-${String(mes).padStart(2, '0')}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`;
        await registrarAsientoAutomatico(auth.empresaId, {
          tipo: 'distribucion_servicio_10',
          descripcion: `Distribucion 10% servicio ${mes}/${anio}`,
          referencia: `SERV-${anio}-${String(mes).padStart(2, '0')}`,
          fecha: fechaAsiento,
          items: [
            { codigo: '2010706', debito:  totalRepartido, descripcion: 'Liquidacion Servicio 10% por Pagar' },
            { codigo: '2010704', credito: totalRepartido, descripcion: 'A Sueldos por Pagar a Empleados' },
          ],
        });
      } catch (e) {
        console.warn('No se pudo generar asiento contable de servicio 10%:', e);
      }

      const distribucion = {
        anio, mes, criterio,
        total_servicio: r2(totalServicio),
        total_repartido: totalRepartido,
        empleados_beneficiarios: reparto.length,
        reparto,
        created_at: new Date().toISOString(),
      };
      await kv.set(`servicio_distribucion_${auth.empresaId}_${anio}_${mes}`, distribucion);

      return c.json({
        ok: true,
        ...distribucion,
        nota: 'El 10% se distribuyo entre los empleados activos. Recuerde sumar este monto al sueldo del periodo para efectos de calculo de decimo tercero y cuarto (no para IESS).',
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });
}

// ── Generador HTML del Rol de Pagos para email ─────────────────────────────
function generarHTMLRolPagos(rol: any, periodo: string, auth: any): string {
  const fmt = (n: number) => `$${Number(n || 0).toFixed(2)}`;
  const mesesAnt = rol.meses_antiguedad || 0;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:20px}
  .header{background:#1a1a1a;color:#F97316;padding:20px;border-radius:8px 8px 0 0;text-align:center}
  .header h1{margin:0;font-size:22px}
  .header p{margin:4px 0 0;color:#ccc;font-size:13px}
  .empleado{background:#f9fafb;border:1px solid #e5e7eb;padding:16px;margin:0}
  .empleado h2{margin:0 0 4px;font-size:16px}
  .empleado p{margin:2px 0;font-size:13px;color:#6b7280}
  .section{margin:16px 0}
  .section h3{font-size:13px;font-weight:bold;color:#6b7280;text-transform:uppercase;margin:0 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  .row{display:flex;justify-content:space-between;padding:6px 0;font-size:14px;border-bottom:1px solid #f3f4f6}
  .row.total{font-weight:bold;font-size:15px;border-top:2px solid #1a1a1a;margin-top:8px}
  .green{color:#16a34a} .red{color:#dc2626} .orange{color:#F97316}
  .footer{background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:12px;text-align:center;font-size:12px;color:#9ca3af;border-radius:0 0 8px 8px}
</style></head><body>
<div class="header">
  <h1>ROL DE PAGOS</h1>
  <p>${periodo}</p>
</div>
<div class="empleado">
  <h2>${rol.empleado_nombre}</h2>
  <p>${rol.cargo || '—'} · ${rol.departamento || '—'}</p>
  <p>Antigüedad: ${Math.floor(mesesAnt/12)} años ${mesesAnt%12} meses · Ingreso: ${rol.fecha_ingreso || '—'}</p>
</div>
<div style="padding:16px;border:1px solid #e5e7eb;border-top:none">

  <div class="section">
    <h3>Ingresos</h3>
    <div class="row"><span>Salario Base</span><span>${fmt(rol.salario_base)}</span></div>
    ${rol.horas_extras_diurnas > 0 ? `<div class="row"><span>Horas Extras Diurnas (${rol.horas_extras_diurnas}h × 1.5)</span><span>${fmt(rol.monto_extras)}</span></div>` : ''}
    ${rol.horas_extras_nocturnas > 0 ? `<div class="row"><span>Horas Extras Nocturnas (${rol.horas_extras_nocturnas}h × 2)</span><span class="orange">${fmt(rol.monto_extras)}</span></div>` : ''}
    ${rol.otros_ingresos > 0 ? `<div class="row"><span>Otros Ingresos</span><span>${fmt(rol.otros_ingresos)}</span></div>` : ''}
    <div class="row total"><span>Salario Bruto</span><span>${fmt(rol.salario_bruto)}</span></div>
  </div>

  <div class="section">
    <h3>Descuentos</h3>
    <div class="row"><span>IESS Personal (9.45%)</span><span class="red">-${fmt(rol.iess_personal)}</span></div>
    ${rol.ir_mensual > 0 ? `<div class="row"><span>Retención IR (proyección anual: ${fmt(rol.ir_anual_proyectado)})</span><span class="red">-${fmt(rol.ir_mensual)}</span></div>` : ''}
    ${rol.descuentos > 0 ? `<div class="row"><span>Otros Descuentos</span><span class="red">-${fmt(rol.descuentos)}</span></div>` : ''}
    <div class="row total green"><span>NETO A RECIBIR</span><span>${fmt(rol.neto_pagar)}</span></div>
  </div>

  <div class="section">
    <h3>Información adicional (a cargo de la empresa)</h3>
    <div class="row"><span>IESS Patronal (11.15%)</span><span>${fmt(rol.iess_patronal)}</span></div>
    ${rol.fondos_reserva > 0 ? `<div class="row"><span>Fondos de Reserva (8.33%)</span><span>${fmt(rol.fondos_reserva)}</span></div>` : ''}
    <div class="row"><span>Provisión Décimo 13° (mensual)</span><span>${fmt(rol.prov_decimo13)}</span></div>
    <div class="row"><span>Provisión Décimo 14° (mensual)</span><span>${fmt(rol.prov_decimo14)}</span></div>
    <div class="row"><span>Provisión Vacaciones (mensual)</span><span>${fmt(rol.prov_vacaciones)}</span></div>
    <div class="row total orange"><span>Costo Total para la Empresa</span><span>${fmt(rol.costo_empresa)}</span></div>
  </div>
</div>
<div class="footer">
  Este rol de pagos es un documento informativo. ${periodo}<br/>
  Generado automáticamente por el sistema de RRHH.
</div>
</body></html>`;
}
