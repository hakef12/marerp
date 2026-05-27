/**
 * Sistema de roles y permisos del ERP M.A.R
 */

export type Rol =
  | 'gerente'
  | 'admin'
  | 'cajero'
  | 'bodeguero'
  | 'contador'
  | 'cocinero'
  | 'rrhh'
  | 'auditor'
  | 'super_admin';

export type Modulo =
  | 'dashboard'
  | 'pos'
  | 'mesas'
  | 'caja'
  | 'inventario'
  | 'cocina'
  | 'ingenieria_menu'
  | 'facturacion'
  | 'facturacion_config'
  | 'contabilidad'
  | 'rrhh'
  | 'bi'
  | 'auditoria'
  | 'proyectos'
  | 'configuracion'
  | 'usuarios'
  | 'suscripcion'
  | 'admin_panel'
  | 'produccion'
  | 'transferencias';

/** Descripción visual de cada rol */
export const ROLES_INFO: Record<string, { label: string; descripcion: string; color: string; badge: string }> = {
  gerente:    { label: 'Gerente',       descripcion: 'Acceso completo — dueño o director de la empresa',    color: 'purple', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  admin:      { label: 'Administrador', descripcion: 'Acceso completo al sistema',                            color: 'purple', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  cajero:     { label: 'Cajero',        descripcion: 'Punto de venta, mesas, caja y facturación',            color: 'green',  badge: 'bg-green-500/20 text-green-300 border-green-500/40' },
  bodeguero:  { label: 'Bodeguero',     descripcion: 'Gestión de inventario y bodegas',                      color: 'orange', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  contador:   { label: 'Contador',      descripcion: 'Facturación, contabilidad y reportes financieros',     color: 'blue',   badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  cocinero:   { label: 'Cocinero',      descripcion: 'Módulo de cocina / KDS',                               color: 'yellow', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  rrhh:       { label: 'RRHH',          descripcion: 'Gestión de talento humano y nómina',                   color: 'pink',   badge: 'bg-pink-500/20 text-pink-300 border-pink-500/40' },
  auditor:    { label: 'Auditor',       descripcion: 'Auditoría y reportes (solo lectura)',                  color: 'gray',   badge: 'bg-gray-500/20 text-gray-300 border-gray-500/40' },
  super_admin:{ label: 'Super Admin',   descripcion: 'Acceso total a todas las empresas',                    color: 'red',    badge: 'bg-red-500/20 text-red-300 border-red-500/40' },
};

/** Módulos habilitados por cada rol */
export const MODULOS_POR_ROL: Record<string, Modulo[]> = {
  gerente: [
    'dashboard','pos','mesas','caja','inventario','cocina','ingenieria_menu',
    'facturacion','facturacion_config','contabilidad','rrhh','bi',
    'auditoria','proyectos','configuracion','usuarios','suscripcion',
    'produccion','transferencias',
  ],
  admin: [
    'dashboard','pos','mesas','caja','inventario','cocina','ingenieria_menu',
    'facturacion','facturacion_config','contabilidad','rrhh','bi',
    'auditoria','proyectos','configuracion','usuarios','suscripcion',
    'produccion','transferencias',
  ],
  super_admin: [
    'dashboard','pos','mesas','caja','inventario','cocina','ingenieria_menu',
    'facturacion','facturacion_config','contabilidad','rrhh','bi',
    'auditoria','proyectos','configuracion','usuarios','suscripcion','admin_panel',
    'produccion','transferencias',
  ],
  cajero:     ['dashboard','pos','mesas','caja','cocina','facturacion'],
  bodeguero:  ['dashboard','inventario','produccion','transferencias'],
  contador:   ['dashboard','facturacion','facturacion_config','contabilidad','bi','inventario'],
  cocinero:   ['dashboard','cocina'],
  rrhh:       ['dashboard','rrhh'],
  auditor:    ['dashboard','auditoria','bi','facturacion'],
};

/** Roles que pueden gestionar usuarios y anular ventas */
export const ROLES_ADMIN = ['gerente', 'admin', 'super_admin'];

/** Verifica si un rol tiene acceso a un módulo */
export function tieneAcceso(rol: string, modulo: Modulo): boolean {
  return (MODULOS_POR_ROL[rol] ?? []).includes(modulo);
}

/** Etiqueta legible del rol */
export function labelRol(rol: string): string {
  return ROLES_INFO[rol]?.label ?? rol;
}

/** Clases CSS del badge del rol */
export function badgeRol(rol: string): string {
  return ROLES_INFO[rol]?.badge ?? 'bg-gray-500/20 text-gray-300 border-gray-500/40';
}
