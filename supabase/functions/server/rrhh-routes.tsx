// =====================================================
// RUTAS: RECURSOS HUMANOS - USANDO KV STORE
// =====================================================

import { 
  inicializarDatosDemo,
  obtenerEmpleados,
  guardarEmpleado,
  eliminarEmpleado
} from "./kv-helpers.tsx";

export function setupRRHHRoutes(app: any, authMiddleware: any) {

  // Listar empleados
  app.get("/server/rrhh/empleados", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      console.log(`👥 [GET /rrhh/empleados] Obteniendo empleados para empresa: ${auth.empresaId}`);
      
      await inicializarDatosDemo(auth.empresaId);
      
      const empleados = await obtenerEmpleados(auth.empresaId);
      const activo = c.req.query('activo');

      let empleadosFiltrados = empleados;
      
      if (activo !== undefined) {
        const esActivo = activo === 'true';
        empleadosFiltrados = empleados.filter((emp: any) => emp.activo === esActivo);
      }

      // Ordenar por nombre
      empleadosFiltrados.sort((a: any, b: any) => {
        const nombreA = `${a.nombre} ${a.apellido}`.toLowerCase();
        const nombreB = `${b.nombre} ${b.apellido}`.toLowerCase();
        return nombreA.localeCompare(nombreB);
      });

      console.log(`✅ [GET /rrhh/empleados] ${empleadosFiltrados.length} empleados obtenidos`);
      return c.json({ empleados: empleadosFiltrados });
    } catch (error: any) {
      console.error('❌ Error obteniendo empleados:', error);
      return c.json({ error: 'Error al obtener empleados', details: error.message }, 500);
    }
  });

  // Obtener empleado por ID
  app.get("/server/rrhh/empleados/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const empleadoId = c.req.param('id');

    try {
      const empleados = await obtenerEmpleados(auth.empresaId);
      const empleado = empleados.find((e: any) => e.id === empleadoId);

      if (!empleado) {
        return c.json({ error: 'Empleado no encontrado' }, 404);
      }

      return c.json({ empleado });
    } catch (error: any) {
      console.error('❌ Error obteniendo empleado:', error);
      return c.json({ error: 'Error al obtener empleado', details: error.message }, 500);
    }
  });

  // Crear empleado
  app.post("/server/rrhh/empleados", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      const body = await c.req.json();
      console.log('👤 [POST /rrhh/empleados] Creando empleado:', body);

      const empleadoData = {
        ...body,
        empresa_id: auth.empresaId,
        activo: body.activo !== undefined ? body.activo : true
      };

      const empleado = await guardarEmpleado(auth.empresaId, empleadoData);

      console.log('✅ Empleado creado exitosamente:', empleado.id);
      return c.json({ empleado }, 201);
    } catch (error: any) {
      console.error('❌ Error creando empleado:', error);
      return c.json({ error: 'Error al crear empleado', details: error.message }, 500);
    }
  });

  // Actualizar empleado
  app.put("/server/rrhh/empleados/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const empleadoId = c.req.param('id');

    try {
      const body = await c.req.json();
      const empleadoData = { ...body, id: empleadoId };

      const empleado = await guardarEmpleado(auth.empresaId, empleadoData);

      if (!empleado) {
        return c.json({ error: 'Empleado no encontrado' }, 404);
      }

      console.log('✅ Empleado actualizado exitosamente:', empleado.id);
      return c.json({ empleado });
    } catch (error: any) {
      console.error('❌ Error actualizando empleado:', error);
      return c.json({ error: 'Error al actualizar empleado', details: error.message }, 500);
    }
  });

  // Eliminar empleado
  app.delete("/server/rrhh/empleados/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const empleadoId = c.req.param('id');

    try {
      const empleados = await obtenerEmpleados(auth.empresaId);
      const empleado = empleados.find((e: any) => e.id === empleadoId);

      if (!empleado) {
        return c.json({ error: 'Empleado no encontrado' }, 404);
      }

      await eliminarEmpleado(auth.empresaId, empleadoId);

      console.log('✅ Empleado eliminado exitosamente:', empleado.id);
      return c.json({ 
        message: 'Empleado eliminado exitosamente',
        empleado: `${empleado.nombre} ${empleado.apellido}`
      });
    } catch (error: any) {
      console.error('❌ Error eliminando empleado:', error);
      return c.json({ error: 'Error al eliminar empleado', details: error.message }, 500);
    }
  });

  // ─── Vacantes ───────────────────────────────────────────────────────────────

  app.get("/server/rrhh/vacantes", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const data = await import('./kv_store.tsx');
      const vacantes = await data.get(`empresa_${auth.empresaId}_vacantes`) as any[] || [];
      return c.json({ vacantes });
    } catch (error: any) {
      return c.json({ vacantes: [] });
    }
  });

  app.post("/server/rrhh/vacantes", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const kv = await import('./kv_store.tsx');
      const vacantes = await kv.get(`empresa_${auth.empresaId}_vacantes`) as any[] || [];
      const nueva = { ...body, id: `vac_${Date.now()}`, empresa_id: auth.empresaId, created_at: new Date().toISOString() };
      vacantes.push(nueva);
      await kv.set(`empresa_${auth.empresaId}_vacantes`, vacantes);
      return c.json({ vacante: nueva }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear vacante', details: error.message }, 500);
    }
  });

  app.put("/server/rrhh/vacantes/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    try {
      const body = await c.req.json();
      const kv = await import('./kv_store.tsx');
      const vacantes = await kv.get(`empresa_${auth.empresaId}_vacantes`) as any[] || [];
      const idx = vacantes.findIndex((v: any) => v.id === id);
      if (idx < 0) return c.json({ error: 'Vacante no encontrada' }, 404);
      vacantes[idx] = { ...vacantes[idx], ...body, updated_at: new Date().toISOString() };
      await kv.set(`empresa_${auth.empresaId}_vacantes`, vacantes);
      return c.json({ vacante: vacantes[idx] });
    } catch (error: any) {
      return c.json({ error: 'Error al actualizar vacante', details: error.message }, 500);
    }
  });

  app.delete("/server/rrhh/vacantes/:id", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    try {
      const kv = await import('./kv_store.tsx');
      const vacantes = await kv.get(`empresa_${auth.empresaId}_vacantes`) as any[] || [];
      await kv.set(`empresa_${auth.empresaId}_vacantes`, vacantes.filter((v: any) => v.id !== id));
      return c.json({ message: 'Vacante eliminada' });
    } catch (error: any) {
      return c.json({ error: 'Error al eliminar vacante', details: error.message }, 500);
    }
  });

  // ─── Evaluaciones ────────────────────────────────────────────────────────────

  app.get("/server/rrhh/evaluaciones", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const kv = await import('./kv_store.tsx');
      const evaluaciones = await kv.get(`empresa_${auth.empresaId}_evaluaciones`) as any[] || [];
      return c.json({ evaluaciones });
    } catch {
      return c.json({ evaluaciones: [] });
    }
  });

  app.post("/server/rrhh/evaluaciones", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const kv = await import('./kv_store.tsx');
      const evaluaciones = await kv.get(`empresa_${auth.empresaId}_evaluaciones`) as any[] || [];
      const nueva = { ...body, id: `eval_${Date.now()}`, empresa_id: auth.empresaId, created_at: new Date().toISOString() };
      evaluaciones.push(nueva);
      await kv.set(`empresa_${auth.empresaId}_evaluaciones`, evaluaciones);
      return c.json({ evaluacion: nueva }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear evaluación', details: error.message }, 500);
    }
  });

  // ─── Capacitaciones ──────────────────────────────────────────────────────────

  app.get("/server/rrhh/capacitaciones", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const kv = await import('./kv_store.tsx');
      const capacitaciones = await kv.get(`empresa_${auth.empresaId}_capacitaciones`) as any[] || [];
      return c.json({ capacitaciones });
    } catch {
      return c.json({ capacitaciones: [] });
    }
  });

  app.post("/server/rrhh/capacitaciones", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const body = await c.req.json();
      const kv = await import('./kv_store.tsx');
      const capacitaciones = await kv.get(`empresa_${auth.empresaId}_capacitaciones`) as any[] || [];
      const nueva = { ...body, id: `cap_${Date.now()}`, empresa_id: auth.empresaId, created_at: new Date().toISOString() };
      capacitaciones.push(nueva);
      await kv.set(`empresa_${auth.empresaId}_capacitaciones`, capacitaciones);
      return c.json({ capacitacion: nueva }, 201);
    } catch (error: any) {
      return c.json({ error: 'Error al crear capacitación', details: error.message }, 500);
    }
  });

  // ─── Métricas ────────────────────────────────────────────────────────────────

  app.get("/server/rrhh/metricas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    try {
      const empleados = await obtenerEmpleados(auth.empresaId);
      const kv = await import('./kv_store.tsx');
      const vacantes = await kv.get(`empresa_${auth.empresaId}_vacantes`) as any[] || [];
      const evaluaciones = await kv.get(`empresa_${auth.empresaId}_evaluaciones`) as any[] || [];

      const activos = empleados.filter((e: any) => e.activo !== false);
      const salarios = activos.map((e: any) => Number(e.salario) || 0).filter(s => s > 0);
      const salarioPromedio = salarios.length > 0 ? salarios.reduce((a, b) => a + b, 0) / salarios.length : 0;
      const vacantesAbiertas = vacantes.filter((v: any) => v.estado === 'abierta' || !v.estado).length;

      const puntuaciones = evaluaciones.map((e: any) => Number(e.puntuacion) || 0).filter(p => p > 0);
      const climaLaboral = puntuaciones.length > 0
        ? puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length
        : 0;

      return c.json({
        empleados_activos: activos.length,
        total_empleados: empleados.length,
        salario_promedio: salarioPromedio,
        vacantes_abiertas: vacantesAbiertas,
        clima_laboral: climaLaboral,
        evaluaciones_pendientes: evaluaciones.filter((e: any) => e.estado === 'pendiente').length,
      });
    } catch (error: any) {
      return c.json({ error: 'Error al obtener métricas', details: error.message }, 500);
    }
  });

  // Estadísticas de RRHH
  app.get("/server/rrhh/estadisticas", authMiddleware, async (c: any) => {
    const auth = c.get('auth');

    try {
      await inicializarDatosDemo(auth.empresaId);
      
      const empleados = await obtenerEmpleados(auth.empresaId);

      const totalEmpleados = empleados.length;
      const empleadosActivos = empleados.filter((e: any) => e.activo).length;
      const empleadosInactivos = totalEmpleados - empleadosActivos;

      // Agrupar por puesto
      const porPuesto = empleados.reduce((acc: any, emp: any) => {
        const puesto = emp.puesto || 'Sin puesto';
        if (!acc[puesto]) {
          acc[puesto] = { puesto, cantidad: 0 };
        }
        acc[puesto].cantidad += 1;
        return acc;
      }, {});

      // Agrupar por departamento
      const porDepartamento = empleados.reduce((acc: any, emp: any) => {
        const departamento = emp.departamento_id || 'Sin departamento';
        if (!acc[departamento]) {
          acc[departamento] = { departamento, cantidad: 0 };
        }
        acc[departamento].cantidad += 1;
        return acc;
      }, {});

      // Calcular masa salarial
      const masaSalarial = empleados
        .filter((e: any) => e.activo)
        .reduce((sum: number, e: any) => sum + (e.salario || 0), 0);

      return c.json({
        resumen: {
          total: totalEmpleados,
          activos: empleadosActivos,
          inactivos: empleadosInactivos,
          masa_salarial: masaSalarial
        },
        por_puesto: Object.values(porPuesto),
        por_departamento: Object.values(porDepartamento)
      });
    } catch (error: any) {
      console.error('❌ Error obteniendo estadísticas:', error);
      return c.json({ error: 'Error al obtener estadísticas', details: error.message }, 500);
    }
  });
}
