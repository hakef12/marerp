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
}
