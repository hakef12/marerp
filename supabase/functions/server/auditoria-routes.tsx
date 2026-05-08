import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export function setupAuditoriaRoutes(app: any, authMiddleware: any) {

  // GET /auditoria/logs — Logs paginados con filtro opcional por módulo
  app.get("/server/auditoria/logs", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
      const modulo = c.req.query('modulo');
      const limite = parseInt(c.req.query('limite') || '200');

      // Consulta base sin join (auditoria.usuario_id no tiene FK formal a usuarios)
      let query = supabase
        .from('auditoria')
        .select('id, accion, modulo, tabla, registro_id, ip_address, resultado, created_at, usuario_id')
        .eq('empresa_id', auth.empresaId)
        .order('created_at', { ascending: false })
        .limit(limite);

      if (modulo && modulo !== 'todos') {
        query = query.eq('modulo', modulo);
      }

      const { data: logs, error } = await query;

      if (error) {
        console.error('Error obteniendo logs de auditoría:', error);
        return c.json({ error: 'Error al obtener logs', details: error.message }, 500);
      }

      // Obtener nombres de usuarios en una sola consulta separada
      const usuarioIds = [...new Set((logs || []).map((l: any) => l.usuario_id).filter(Boolean))];
      let usuariosMap: Record<string, any> = {};

      if (usuarioIds.length > 0) {
        const { data: usuarios } = await supabase
          .from('usuarios')
          .select('id, nombre_completo, email')
          .in('id', usuarioIds);

        if (usuarios) {
          usuariosMap = Object.fromEntries(usuarios.map((u: any) => [u.id, u]));
        }
      }

      // Combinar logs con datos de usuario y descripción generada
      const logsEnriquecidos = (logs || []).map((log: any) => ({
        ...log,
        usuarios: usuariosMap[log.usuario_id] || null,
        descripcion: generarDescripcion(log, usuariosMap[log.usuario_id])
      }));

      return c.json({ logs: logsEnriquecidos, total: logsEnriquecidos.length });
    } catch (error: any) {
      console.error('Error en auditoria/logs:', error);
      return c.json({ error: 'Error interno', details: error.message }, 500);
    }
  });

  // GET /auditoria/kpis — Métricas y detección de anomalías
  app.get("/server/auditoria/kpis", authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
      const ahora = new Date();
      const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Logs de las últimas 24 horas
      const { data: logsHoy, error: errorHoy } = await supabase
        .from('auditoria')
        .select('id, accion, modulo, resultado, usuario_id, created_at')
        .eq('empresa_id', auth.empresaId)
        .gte('created_at', hace24h);

      if (errorHoy) throw errorHoy;

      // Conteos por acción
      const totalHoy = logsHoy?.length || 0;
      const errores = (logsHoy || []).filter((l: any) => l.resultado === 'error').length;
      const eliminaciones = (logsHoy || []).filter((l: any) => l.accion === 'eliminar').length;

      // Logs de los últimos 7 días para detectar anomalías
      const { data: logs7d } = await supabase
        .from('auditoria')
        .select('id, accion, modulo, resultado, usuario_id, created_at, ip_address')
        .eq('empresa_id', auth.empresaId)
        .gte('created_at', hace7d)
        .order('created_at', { ascending: false });

      // Detectar anomalías
      const anomalias: any[] = [];

      // Anomalía: muchas eliminaciones en 24h
      if (eliminaciones >= 5) {
        anomalias.push({
          id: 'anomalia-eliminaciones',
          severidad: eliminaciones >= 10 ? 'alta' : 'media',
          modulo: 'sistema',
          descripcion: `Se detectaron ${eliminaciones} eliminaciones en las últimas 24 horas`,
          fecha_deteccion: new Date().toISOString()
        });
      }

      // Anomalía: errores repetidos
      if (errores >= 3) {
        anomalias.push({
          id: 'anomalia-errores',
          severidad: errores >= 10 ? 'alta' : 'media',
          modulo: 'sistema',
          descripcion: `Se detectaron ${errores} errores en las últimas 24 horas`,
          fecha_deteccion: new Date().toISOString()
        });
      }

      // Conteos por módulo (últimos 7 días)
      const conteoModulos: Record<string, number> = {};
      (logs7d || []).forEach((log: any) => {
        conteoModulos[log.modulo] = (conteoModulos[log.modulo] || 0) + 1;
      });

      return c.json({
        total_hoy: totalHoy,
        errores_hoy: errores,
        eliminaciones_hoy: eliminaciones,
        anomalias,
        conteo_modulos: conteoModulos,
        total_7d: logs7d?.length || 0
      });
    } catch (error: any) {
      console.error('Error en auditoria/kpis:', error);
      return c.json({ error: 'Error interno', details: error.message }, 500);
    }
  });
}

function generarDescripcion(log: any, usuario?: any): string {
  const nombre = usuario?.nombre_completo || 'Sistema';
  const tabla = log.tabla || log.modulo;
  const acciones: Record<string, string> = {
    crear: `${nombre} creó un registro en ${tabla}`,
    actualizar: `${nombre} actualizó un registro en ${tabla}`,
    eliminar: `${nombre} eliminó un registro en ${tabla}`,
    ver: `${nombre} consultó ${tabla}`,
    login: `${nombre} inició sesión`,
    logout: `${nombre} cerró sesión`,
  };
  return acciones[log.accion] || `${nombre} realizó ${log.accion} en ${tabla}`;
}
