// Definición de planes del sistema
export const PLANES = {
  basico: {
    nombre: 'Plan Básico',
    precio: 20,
    descripcion: 'Ideal para pequeños negocios',
    modulos_incluidos: {
      pos: true,
      inventario: true,
      contabilidad: false,
      rrhh: false,
      cocina: false,
      auditoria: false,
      bi: false
    },
    limites: {
      usuarios_max: 3,
      productos_max: 500,
      facturas_mes: 100,
      almacenamiento_gb: 5
    },
    caracteristicas: [
      'Punto de Venta básico',
      'Gestión de inventario',
      'Hasta 3 usuarios',
      'Soporte por email'
    ]
  },
  
  profesional: {
    nombre: 'Plan Profesional',
    precio: 50,
    descripcion: 'Para empresas en crecimiento',
    modulos_incluidos: {
      pos: true,
      inventario: true,
      contabilidad: true,
      rrhh: true,
      cocina: false,
      auditoria: true,
      bi: false
    },
    limites: {
      usuarios_max: 10,
      productos_max: 2000,
      facturas_mes: 500,
      almacenamiento_gb: 20
    },
    caracteristicas: [
      'Todos los módulos básicos',
      'Contabilidad completa',
      'Gestión de talento humano',
      'Auditoría y trazabilidad',
      'Hasta 10 usuarios',
      'Soporte prioritario'
    ]
  },
  
  restaurante: {
    nombre: 'Plan Restaurante',
    precio: 80,
    descripcion: 'Especializado para restaurantes',
    modulos_incluidos: {
      pos: true,
      inventario: true,
      contabilidad: true,
      rrhh: true,
      cocina: true,
      auditoria: true,
      bi: true
    },
    limites: {
      usuarios_max: 20,
      productos_max: 5000,
      facturas_mes: 2000,
      almacenamiento_gb: 50
    },
    caracteristicas: [
      'POS para restaurantes',
      'Sistema de cocina (KDS)',
      'Gestión de comandas',
      'Control de mesas',
      'Todos los módulos incluidos',
      'Hasta 20 usuarios',
      'Soporte 24/7'
    ]
  },
  
  enterprise: {
    nombre: 'Plan Enterprise',
    precio: 150,
    descripcion: 'Solución completa sin límites',
    modulos_incluidos: {
      pos: true,
      inventario: true,
      contabilidad: true,
      rrhh: true,
      cocina: true,
      auditoria: true,
      bi: true
    },
    limites: {
      usuarios_max: -1, // Ilimitado
      productos_max: -1,
      facturas_mes: -1,
      almacenamiento_gb: -1
    },
    caracteristicas: [
      'Todos los módulos incluidos',
      'Usuarios ilimitados',
      'Productos ilimitados',
      'Business Intelligence avanzado',
      'Multi-sucursales',
      'API personalizada',
      'Soporte dedicado 24/7',
      'Capacitación incluida'
    ]
  }
};

// Validar si una empresa tiene acceso a un módulo
export function tieneAccesoModulo(planTipo: string, modulo: string): boolean {
  const plan = PLANES[planTipo as keyof typeof PLANES];
  if (!plan) return false;
  
  return plan.modulos_incluidos[modulo as keyof typeof plan.modulos_incluidos] || false;
}

// Validar límites del plan
export function validarLimite(
  planTipo: string, 
  limite: 'usuarios_max' | 'productos_max' | 'facturas_mes' | 'almacenamiento_gb',
  valorActual: number
): { valido: boolean; mensaje?: string } {
  const plan = PLANES[planTipo as keyof typeof PLANES];
  if (!plan) {
    return { valido: false, mensaje: 'Plan no válido' };
  }

  const limiteMax = plan.limites[limite];
  
  // -1 significa ilimitado
  if (limiteMax === -1) {
    return { valido: true };
  }

  if (valorActual >= limiteMax) {
    return { 
      valido: false, 
      mensaje: `Has alcanzado el límite de ${limiteMax} para ${limite} en tu plan ${plan.nombre}. Actualiza tu plan para continuar.`
    };
  }

  return { valido: true };
}

// Obtener información de un plan
export function obtenerPlan(planTipo: string) {
  return PLANES[planTipo as keyof typeof PLANES];
}

// Listar todos los planes
export function listarPlanes() {
  return Object.entries(PLANES).map(([id, plan]) => ({
    id,
    ...plan
  }));
}
