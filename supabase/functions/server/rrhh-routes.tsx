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

  // Tabla IR Ecuador 2025/2026 (anual)
  const TABLA_IR = [
    { desde: 0,      hasta: 11722,  base: 0,    excedente: 0,    fraccion: 0    },
    { desde: 11722,  hasta: 14930,  base: 0,    excedente: 11722, fraccion: 0.05 },
    { desde: 14930,  hasta: 19895,  base: 160,  excedente: 14930, fraccion: 0.10 },
    { desde: 19895,  hasta: 26395,  base: 657,  excedente: 19895, fraccion: 0.12 },
    { desde: 26395,  hasta: 34255,  base: 1437, excedente: 26395, fraccion: 0.15 },
    { desde: 34255,  hasta: 45605,  base: 2616, excedente: 34255, fraccion: 0.20 },
    { desde: 45605,  hasta: 60850,  base: 4886, excedente: 45605, fraccion: 0.25 },
    { desde: 60850,  hasta: 81130,  base: 8697, excedente: 60850, fraccion: 0.30 },
    { desde: 81130,  hasta: Infinity, base: 14781, excedente: 81130, fraccion: 0.35 },
  ];

  const calcularIR = (ingresoAnual: number): number => {
    const tramo = TABLA_IR.find(t => ingresoAnual >= t.desde && ingresoAnual < t.hasta);
    if (!tramo || tramo.fraccion === 0) return 0;
    return tramo.base + (ingresoAnual - tramo.excedente) * tramo.fraccion;
  };

  const SBU = 470; // SBU Ecuador 2025/2026

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
    const montoExtras = horasExtrasDiurnas * valorHoraBase * 1.5 + horasExtrasNocturnas * valorHoraBase * 2;

    const salarioBruto = r2(salarioBase + montoExtras + otrosIngresos);

    // IESS
    const iessPersonal = r2(salarioBruto * 0.0945);
    const iessPatronal = r2(salarioBruto * 0.1115);

    // Fondos de reserva (solo si > 12 meses de antigüedad)
    const fechaIngreso = emp.fecha_ingreso ? new Date(emp.fecha_ingreso) : new Date();
    const mesesAntigüedad = Math.floor((Date.now() - fechaIngreso.getTime()) / (30.44 * 86400000));
    const tieneFondosReserva = mesesAntigüedad >= 12;
    const fondosReserva = tieneFondosReserva ? r2(salarioBruto * 0.0833) : 0;

    // Impuesto a la Renta
    const ingresoAnualProyectado = salarioBruto * 12 + salarioBruto; // incluye 13ro
    const irAnual = calcularIR(ingresoAnualProyectado);
    const irMensual = r2(irAnual / 12);

    // Neto a pagar
    const netoPagar = r2(salarioBruto - iessPersonal - irMensual - descuentos);

    // Provisiones
    const provDecimo13 = r2(salarioBruto / 12);
    const provDecimo14 = r2(SBU / 12);
    const provVacaciones = r2(salarioBruto / 24);

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

  // POST /rrhh/nomina/finiquito — calcula liquidación de un empleado
  app.post("/server/rrhh/nomina/finiquito", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const { empleado_id, fecha_salida, motivo = 'renuncia' } = await c.req.json();
      const empleados = await obtenerEmpleados(auth.empresaId);
      const emp = empleados.find((e: any) => e.id === empleado_id);
      if (!emp) return c.json({ error: 'Empleado no encontrado' }, 404);

      const r2 = (n: number) => Math.round(n * 100) / 100;
      const fechaIngreso = new Date(emp.fecha_ingreso || Date.now());
      const fechaSalida = fecha_salida ? new Date(fecha_salida) : new Date();
      const diasTrabajados = Math.floor((fechaSalida.getTime() - fechaIngreso.getTime()) / 86400000);
      const aniosTrabajados = diasTrabajados / 365;
      const mesesTrabajados = diasTrabajados / 30.44;
      const salario = Number(emp.salario_base || emp.salario || 0);

      // Días del año actual (para provisiones proporcionales)
      const inicioAnio = new Date(fechaSalida.getFullYear(), 0, 1);
      const diasAnioActual = Math.floor((fechaSalida.getTime() - inicioAnio.getTime()) / 86400000);

      const decimo13Proporcional   = r2((salario / 12) * (diasAnioActual / 30.44 % 12 || 12));
      const decimo14Proporcional   = r2((SBU / 12) * Math.min(diasAnioActual / 30.44, 12));
      const vacacionesProporcionales = r2((salario / 24) * (diasAnioActual / 30.44 % 12 || 12));

      // Desahucio (si empleador termina el contrato sin justa causa)
      const desahucio = motivo === 'desahucio'
        ? r2(salario * 0.25 * Math.min(aniosTrabajados, 25))
        : 0;

      // Fondos de reserva proporcionales (si > 12 meses)
      const fondosReservaProp = mesesTrabajados > 12 ? r2(salario * 0.0833) : 0;

      const total = r2(decimo13Proporcional + decimo14Proporcional + vacacionesProporcionales + desahucio + fondosReservaProp);

      return c.json({
        empleado: { nombre: emp.nombre_completo || emp.nombre, cargo: emp.cargo, email: emp.email },
        periodo: { fecha_ingreso: emp.fecha_ingreso, fecha_salida: fechaSalida.toISOString().split('T')[0], dias_trabajados: diasTrabajados, anios: r2(aniosTrabajados) },
        calculo: {
          salario_base: salario,
          decimo13_proporcional:    decimo13Proporcional,
          decimo14_proporcional:    decimo14Proporcional,
          vacaciones_proporcionales: vacacionesProporcionales,
          fondos_reserva_proporcional: fondosReservaProp,
          desahucio,
          total_liquidacion:         total,
        },
        motivo,
        nota: motivo === 'desahucio' ? 'Desahucio = 25% salario × años (máx. 25 años)' : 'Sin desahucio en renuncia voluntaria',
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
