/**
 * Rutas de Gestión de Usuarios
 * - Lee/escribe en la tabla `usuarios` de Supabase (no KV store)
 * - Aplica límites de usuarios según el plan de la empresa
 * - Soporta roles: gerente, cajero, bodeguero, contador, cocinero, rrhh, auditor
 *
 * NOTA: La tabla usuarios usa la columna `cargo` para el puesto/título del empleado
 * y `ultima_sesion` para el último acceso. El API las expone como `puesto` y `ultimo_acceso`.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import * as kv from './kv_store.tsx';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// ── KV: bodega asignada por usuario ──────────────────────────────────────────
const usuariosBodegasKey = (empresaId: string) =>
  `empresa_${empresaId}_usuarios_bodegas`;

async function getUsuariosBodegas(empresaId: string): Promise<Record<string, any>> {
  return (await kv.get(usuariosBodegasKey(empresaId))) || {};
}

async function setUsuarioBodega(
  empresaId: string,
  userId: string,
  info: { bodega_id: string; bodega_nombre: string } | null
) {
  const map = await getUsuariosBodegas(empresaId);
  if (info) { map[userId] = info; } else { delete map[userId]; }
  await kv.set(usuariosBodegasKey(empresaId), map);
}

// ── Roles válidos y sus módulos ───────────────────────────────
const MODULOS_POR_ROL: Record<string, string[]> = {
  gerente:    ['dashboard','pos','inventario','cocina','ingenieria_menu','facturacion','facturacion_config','contabilidad','rrhh','bi','auditoria','proyectos','configuracion','usuarios'],
  admin:      ['dashboard','pos','inventario','cocina','ingenieria_menu','facturacion','facturacion_config','contabilidad','rrhh','bi','auditoria','proyectos','configuracion','usuarios'],
  super_admin:['dashboard','pos','inventario','cocina','ingenieria_menu','facturacion','facturacion_config','contabilidad','rrhh','bi','auditoria','proyectos','configuracion','usuarios'],
  cajero:     ['dashboard','pos','cocina','facturacion'],
  bodeguero:  ['dashboard','inventario'],
  contador:   ['dashboard','facturacion','contabilidad','bi'],
  cocinero:   ['dashboard','cocina'],
  rrhh:       ['dashboard','rrhh'],
  auditor:    ['dashboard','auditoria','bi'],
};

const ROLES_VALIDOS = Object.keys(MODULOS_POR_ROL);
const ROLES_ADMIN = ['gerente', 'admin', 'super_admin'];

// ── Límites de usuarios por plan ─────────────────────────────
function limiteUsuariosPlan(planTipo: string): number {
  if (planTipo === 'enterprise') return 9999;
  if (planTipo === 'profesional') return 10;
  return 3; // básico / default
}

/** Normaliza un usuario de DB → respuesta API (mapea cargo→puesto, ultima_sesion→ultimo_acceso) */
function normalizeUsuario(u: any, bodegaInfo?: any): any {
  return {
    id:              u.id,
    nombre_completo: u.nombre_completo,
    email:           u.email,
    rol:             u.rol ?? 'cajero',
    puesto:          u.cargo ?? null,
    activo:          u.activo,
    created_at:      u.created_at,
    ultimo_acceso:   u.ultima_sesion ?? null,
    auth_user_id:    u.auth_user_id,
    modulos_acceso:  MODULOS_POR_ROL[u.rol] ?? [],
    bodega_id:       bodegaInfo?.bodega_id ?? null,
    bodega_nombre:   bodegaInfo?.bodega_nombre ?? null,
  };
}

export function setupUsuariosRoutes(app: any, authMiddleware: any) {

  // ── GET /usuarios — Lista todos los usuarios de la empresa ──
  app.get('/server/usuarios', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
      const { data: usuarios, error } = await supabase
        .from('usuarios')
        .select('id, nombre_completo, email, rol, cargo, activo, created_at, ultima_sesion, auth_user_id')
        .eq('empresa_id', auth.empresaId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const bodegasMap = await getUsuariosBodegas(auth.empresaId);
      return c.json({ usuarios: (usuarios || []).map(u => normalizeUsuario(u, bodegasMap[u.id])) });
    } catch (err: any) {
      console.error('❌ [GET /usuarios]', err.message);
      return c.json({ error: 'Error al obtener usuarios', detalle: err.message }, 500);
    }
  });

  // ── POST /usuarios — Crear nuevo usuario ────────────────────
  app.post('/server/usuarios', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Solo gerente/admin pueden crear usuarios
    if (!ROLES_ADMIN.includes(auth.userRole)) {
      return c.json({ error: 'Solo administradores o gerentes pueden crear usuarios' }, 403);
    }

    try {
      const body = await c.req.json();
      const { nombre_completo, email, password, rol = 'cajero', puesto = '', bodega_id, bodega_nombre } = body;

      // Validar campos obligatorios
      if (!nombre_completo?.trim() || !email?.trim() || !password?.trim()) {
        return c.json({ error: 'Nombre, email y contraseña son obligatorios' }, 400);
      }

      // Validar rol
      if (!ROLES_VALIDOS.includes(rol)) {
        return c.json({ error: `Rol inválido. Roles válidos: ${ROLES_VALIDOS.join(', ')}` }, 400);
      }

      // Verificar límite del plan
      const { data: empresa } = await supabase
        .from('empresas')
        .select('plan_tipo')
        .eq('id', auth.empresaId)
        .single();

      const planTipo = empresa?.plan_tipo || 'basico';
      const limite = limiteUsuariosPlan(planTipo);

      const { count } = await supabase
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', auth.empresaId)
        .eq('activo', true);

      if ((count ?? 0) >= limite) {
        return c.json({
          error: `Tu plan ${planTipo} permite máximo ${limite} usuario${limite === 1 ? '' : 's'} activos. Actualiza tu plan para agregar más.`,
          limite_alcanzado: true,
        }, 400);
      }

      // Verificar que el email no esté ya registrado en esta empresa
      const { data: existe } = await supabase
        .from('usuarios')
        .select('id')
        .eq('empresa_id', auth.empresaId)
        .ilike('email', email.trim())
        .maybeSingle();

      if (existe) {
        return c.json({ error: 'Ya existe un usuario con ese email en esta empresa' }, 400);
      }

      // Crear usuario en Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { nombre: nombre_completo.trim() },
      });

      if (authErr) {
        return c.json({ error: `Error al crear usuario: ${authErr.message}` }, 400);
      }

      // Insertar en tabla usuarios (cargo = puesto del API)
      const { data: nuevoUsuario, error: insertErr } = await supabase
        .from('usuarios')
        .insert({
          empresa_id:     auth.empresaId,
          auth_user_id:   authData.user.id,
          nombre_completo: nombre_completo.trim(),
          email:          email.trim().toLowerCase(),
          rol,
          cargo:          puesto.trim() || null,  // 'cargo' es la columna real en DB
          activo:         true,
        })
        .select()
        .single();

      if (insertErr) {
        // Rollback auth user
        await supabase.auth.admin.deleteUser(authData.user.id);
        return c.json({ error: `Error al guardar usuario: ${insertErr.message}` }, 500);
      }

      // Guardar bodega asignada si viene en el body
      if (bodega_id) {
        await setUsuarioBodega(auth.empresaId, nuevoUsuario.id, {
          bodega_id,
          bodega_nombre: bodega_nombre || bodega_id,
        });
      }

      console.log('✅ Usuario creado:', nuevoUsuario.id, nuevoUsuario.email, nuevoUsuario.rol);
      const bodegaInfo = bodega_id ? { bodega_id, bodega_nombre: bodega_nombre || '' } : undefined;
      return c.json({
        success: true,
        mensaje: 'Usuario creado exitosamente',
        usuario: normalizeUsuario(nuevoUsuario, bodegaInfo),
      }, 201);

    } catch (err: any) {
      console.error('❌ [POST /usuarios]', err.message);
      return c.json({ error: 'Error interno al crear usuario', detalle: err.message }, 500);
    }
  });

  // ── PUT /usuarios/:id — Actualizar usuario ──────────────────
  app.put('/server/usuarios/:id', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const usuarioId = c.req.param('id');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!ROLES_ADMIN.includes(auth.userRole)) {
      return c.json({ error: 'Solo administradores o gerentes pueden actualizar usuarios' }, 403);
    }

    try {
      const body = await c.req.json();
      const { nombre_completo, rol, puesto, bodega_id, bodega_nombre } = body;

      // Verificar que el usuario pertenezca a esta empresa
      const { data: actual, error: getErr } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', usuarioId)
        .eq('empresa_id', auth.empresaId)
        .single();

      if (getErr || !actual) {
        return c.json({ error: 'Usuario no encontrado' }, 404);
      }

      // No permitir degradar al último gerente/admin activo
      if (ROLES_ADMIN.includes(actual.rol) && rol && !ROLES_ADMIN.includes(rol)) {
        const { count } = await supabase
          .from('usuarios')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', auth.empresaId)
          .in('rol', ROLES_ADMIN)
          .eq('activo', true);
        if ((count ?? 0) <= 1) {
          return c.json({ error: 'No puedes cambiar el rol del único gerente/administrador activo' }, 400);
        }
      }

      // Validar rol
      if (rol && !ROLES_VALIDOS.includes(rol)) {
        return c.json({ error: `Rol inválido: ${rol}` }, 400);
      }

      const updates: any = {};
      if (nombre_completo !== undefined) updates.nombre_completo = nombre_completo.trim();
      if (rol !== undefined) updates.rol = rol;
      if (puesto !== undefined) updates.cargo = puesto.trim() || null;  // puesto → cargo en DB

      const { data: actualizado, error: updErr } = await supabase
        .from('usuarios')
        .update(updates)
        .eq('id', usuarioId)
        .eq('empresa_id', auth.empresaId)
        .select()
        .single();

      if (updErr) throw updErr;

      // Actualizar bodega asignada si viene en el body
      if (bodega_id !== undefined) {
        await setUsuarioBodega(
          auth.empresaId,
          usuarioId,
          bodega_id ? { bodega_id, bodega_nombre: bodega_nombre || '' } : null
        );
      }

      const bodegasMap = await getUsuariosBodegas(auth.empresaId);
      return c.json({
        success: true,
        mensaje: 'Usuario actualizado exitosamente',
        usuario: normalizeUsuario(actualizado, bodegasMap[usuarioId]),
      });
    } catch (err: any) {
      console.error('❌ [PUT /usuarios/:id]', err.message);
      return c.json({ error: 'Error al actualizar usuario', detalle: err.message }, 500);
    }
  });

  // ── DELETE /usuarios/:id — Desactivar usuario (soft-delete) ─
  app.delete('/server/usuarios/:id', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const usuarioId = c.req.param('id');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!ROLES_ADMIN.includes(auth.userRole)) {
      return c.json({ error: 'Solo administradores o gerentes pueden desactivar usuarios' }, 403);
    }

    // No puede desactivarse a sí mismo
    if (usuarioId === auth.userId) {
      return c.json({ error: 'No puedes desactivar tu propia cuenta' }, 400);
    }

    try {
      const { data: actual } = await supabase
        .from('usuarios')
        .select('id, rol, activo')
        .eq('id', usuarioId)
        .eq('empresa_id', auth.empresaId)
        .single();

      if (!actual) {
        return c.json({ error: 'Usuario no encontrado' }, 404);
      }

      // No desactivar al último admin
      if (ROLES_ADMIN.includes(actual.rol)) {
        const { count } = await supabase
          .from('usuarios')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', auth.empresaId)
          .in('rol', ROLES_ADMIN)
          .eq('activo', true);
        if ((count ?? 0) <= 1) {
          return c.json({ error: 'No puedes desactivar al único gerente/administrador activo' }, 400);
        }
      }

      await supabase
        .from('usuarios')
        .update({ activo: false })
        .eq('id', usuarioId)
        .eq('empresa_id', auth.empresaId);

      return c.json({ success: true, mensaje: 'Usuario desactivado exitosamente' });
    } catch (err: any) {
      console.error('❌ [DELETE /usuarios/:id]', err.message);
      return c.json({ error: 'Error al desactivar usuario', detalle: err.message }, 500);
    }
  });

  // ── POST /usuarios/:id/reactivar — Reactivar usuario ────────
  app.post('/server/usuarios/:id/reactivar', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    const usuarioId = c.req.param('id');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!ROLES_ADMIN.includes(auth.userRole)) {
      return c.json({ error: 'Solo administradores o gerentes pueden reactivar usuarios' }, 403);
    }

    try {
      // Verificar límite antes de reactivar
      const { data: empresa } = await supabase
        .from('empresas')
        .select('plan_tipo')
        .eq('id', auth.empresaId)
        .single();

      const limite = limiteUsuariosPlan(empresa?.plan_tipo || 'basico');

      const { count } = await supabase
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', auth.empresaId)
        .eq('activo', true);

      if ((count ?? 0) >= limite) {
        return c.json({
          error: 'Límite de usuarios activos alcanzado. Desactiva otro usuario o actualiza tu plan.',
          limite_alcanzado: true,
        }, 400);
      }

      const { data: actualizado, error: updErr } = await supabase
        .from('usuarios')
        .update({ activo: true })
        .eq('id', usuarioId)
        .eq('empresa_id', auth.empresaId)
        .select()
        .single();

      if (updErr) throw updErr;

      return c.json({
        success: true,
        mensaje: 'Usuario reactivado exitosamente',
        usuario: normalizeUsuario(actualizado),
      });
    } catch (err: any) {
      console.error('❌ [POST /usuarios/:id/reactivar]', err.message);
      return c.json({ error: 'Error al reactivar usuario', detalle: err.message }, 500);
    }
  });

  // ── GET /usuarios/roles — Lista roles disponibles ────────────
  app.get('/server/usuarios/roles', authMiddleware, async (c: any) => {
    const auth = c.get('auth');
    if (!ROLES_ADMIN.includes(auth.userRole)) {
      return c.json({ error: 'Acceso denegado' }, 403);
    }

    const roles = Object.entries(MODULOS_POR_ROL)
      .filter(([r]) => r !== 'super_admin') // no exponer super_admin
      .map(([rol, modulos]) => ({ rol, modulos }));

    return c.json({ roles });
  });
}
