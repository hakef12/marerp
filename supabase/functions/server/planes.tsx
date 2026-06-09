// ═══════════════════════════════════════════════════════════════════
//  PLANES DE SUSCRIPCIÓN — MAR ERP
//  Todos los planes incluyen KDS/Cocina porque el sistema es para
//  restaurantes. La diferencia está en la escala y módulos avanzados.
// ═══════════════════════════════════════════════════════════════════

export const PLANES = {
  // ── $20 ─────────────────────────────────────────────────────────
  basico: {
    nombre: 'Plan Básico',
    precio: 20,
    descripcion: 'Para food trucks y pequeños locales',
    modulos_incluidos: {
      pos:          true,
      inventario:   true,
      cocina:       true,   // KDS incluido en todos los planes
      contabilidad: false,
      rrhh:         false,
      auditoria:    false,
      bi:           false,
    },
    limites: {
      usuarios_max:     3,
      productos_max:    300,
      facturas_mes:     150,
      mesas_max:        15,
      sucursales_max:   1,
      almacenamiento_gb: 5,
    },
    caracteristicas: [
      'Punto de Venta (POS)',
      'Cocina / KDS / Comandas',
      'Mesas (hasta 15)',
      'Facturación electrónica SRI',
      'Inventario básico',
      'Hasta 3 usuarios',
      'Soporte por email',
    ],
    soporte: 'email',
  },

  // ── $45 ─────────────────────────────────────────────────────────
  restaurante: {
    nombre: 'Plan Restaurante',
    precio: 45,
    descripcion: 'Para restaurantes con operación completa',
    modulos_incluidos: {
      pos:          true,
      inventario:   true,
      cocina:       true,
      contabilidad: false,
      rrhh:         false,
      auditoria:    false,
      bi:           false,
    },
    limites: {
      usuarios_max:     10,
      productos_max:    1500,
      facturas_mes:     800,
      mesas_max:        50,
      sucursales_max:   1,
      almacenamiento_gb: 20,
    },
    caracteristicas: [
      'Todo lo del Plan Básico',
      'Mesas ilimitadas (hasta 50)',
      'Ingeniería de menú',
      'Órdenes de producción',
      'Transferencias entre bodegas',
      'Hasta 10 usuarios',
      'Soporte por WhatsApp',
    ],
    soporte: 'whatsapp',
  },

  // ── $100 ────────────────────────────────────────────────────────
  profesional: {
    nombre: 'Plan Profesional',
    precio: 100,
    descripcion: 'Control total: contabilidad, RRHH y reportes',
    modulos_incluidos: {
      pos:          true,
      inventario:   true,
      cocina:       true,
      contabilidad: true,
      rrhh:         true,
      auditoria:    true,
      bi:           true,
    },
    limites: {
      usuarios_max:     25,
      productos_max:    5000,
      facturas_mes:     -1,   // ilimitado
      mesas_max:        -1,
      sucursales_max:   3,
      almacenamiento_gb: 50,
    },
    caracteristicas: [
      'Todo lo del Plan Restaurante',
      'Contabilidad completa (asientos, balance, P&L)',
      'RRHH y Nómina (roles de pago, IESS)',
      'Business Intelligence y dashboards',
      'Auditoría completa',
      'Retenciones SRI',
      'Hasta 3 sucursales',
      'Hasta 25 usuarios',
      'Soporte WhatsApp prioritario',
    ],
    soporte: 'whatsapp_prioritario',
  },

  // ── $230 ────────────────────────────────────────────────────────
  enterprise: {
    nombre: 'Plan Enterprise',
    precio: 230,
    descripcion: 'Para cadenas y grupos gastronómicos',
    modulos_incluidos: {
      pos:          true,
      inventario:   true,
      cocina:       true,
      contabilidad: true,
      rrhh:         true,
      auditoria:    true,
      bi:           true,
    },
    limites: {
      usuarios_max:     -1,  // ilimitado
      productos_max:    -1,
      facturas_mes:     -1,
      mesas_max:        -1,
      sucursales_max:   -1,
      almacenamiento_gb: -1,
    },
    caracteristicas: [
      'Todo lo del Plan Profesional',
      'Sucursales ilimitadas',
      'Usuarios ilimitados',
      'Productos ilimitados',
      'Onboarding y capacitación incluidos',
      'Canal WhatsApp dedicado (respuesta < 2h)',
      'Llamada mensual de seguimiento',
      'Acceso anticipado a nuevas funciones',
    ],
    soporte: 'dedicado',
  },
};

export type PlanCodigo = keyof typeof PLANES;

// ── Helpers ──────────────────────────────────────────────────────

/** Verifica si un plan tiene acceso a un módulo específico. */
export function tieneAccesoModulo(planTipo: string, modulo: string): boolean {
  const plan = PLANES[planTipo as PlanCodigo];
  if (!plan) return false;
  return !!(plan.modulos_incluidos as any)[modulo];
}

/** Valida si el valor actual supera el límite del plan (-1 = ilimitado). */
export function validarLimite(
  planTipo: string,
  limite: keyof typeof PLANES.basico.limites,
  valorActual: number
): { valido: boolean; limite_max: number; mensaje?: string } {
  const plan = PLANES[planTipo as PlanCodigo];
  if (!plan) return { valido: false, limite_max: 0, mensaje: 'Plan no válido' };

  const limiteMax = plan.limites[limite] ?? -1;
  if (limiteMax === -1) return { valido: true, limite_max: -1 };

  if (valorActual >= limiteMax) {
    const etiquetas: Record<string, string> = {
      usuarios_max:     'usuarios',
      productos_max:    'productos',
      facturas_mes:     'facturas por mes',
      mesas_max:        'mesas',
      sucursales_max:   'sucursales',
      almacenamiento_gb:'GB de almacenamiento',
    };
    return {
      valido: false,
      limite_max: limiteMax,
      mensaje: `Límite de ${etiquetas[limite] ?? limite} alcanzado (máx. ${limiteMax} en ${plan.nombre}). Actualiza tu plan para continuar.`,
    };
  }
  return { valido: true, limite_max: limiteMax };
}

/** Devuelve los datos de un plan por su código. */
export function obtenerPlan(planTipo: string) {
  return PLANES[planTipo as PlanCodigo] ?? null;
}

/** Lista todos los planes como array. */
export function listarPlanes() {
  return Object.entries(PLANES).map(([codigo, plan]) => ({ codigo, ...plan }));
}

/** Días de gracia antes de suspender la cuenta tras vencer. */
export const DIAS_GRACIA = 5;

/** Días antes del vencimiento para mostrar la advertencia. */
export const DIAS_ADVERTENCIA = 7;

/**
 * Analiza el estado de suscripción de una empresa.
 * Retorna: 'activa' | 'por_vencer' | 'en_gracia' | 'vencida'
 */
export function estadoSuscripcion(fecha_expiracion: string | null): {
  estado: 'activa' | 'por_vencer' | 'en_gracia' | 'vencida';
  dias_restantes: number;
  mensaje: string;
} {
  if (!fecha_expiracion) {
    return { estado: 'vencida', dias_restantes: 0, mensaje: 'Sin fecha de expiración — contacta al administrador.' };
  }

  const ahora  = new Date();
  const expira = new Date(fecha_expiracion);
  const diffMs = expira.getTime() - ahora.getTime();
  const dias   = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (dias > DIAS_ADVERTENCIA) {
    return { estado: 'activa', dias_restantes: dias, mensaje: '' };
  }
  if (dias > 0) {
    return {
      estado: 'por_vencer',
      dias_restantes: dias,
      mensaje: `Tu suscripción vence en ${dias} día${dias === 1 ? '' : 's'}. Renueva para no perder el acceso.`,
    };
  }
  if (dias > -DIAS_GRACIA) {
    const diasGracia = DIAS_GRACIA + dias; // días restantes de gracia
    return {
      estado: 'en_gracia',
      dias_restantes: diasGracia,
      mensaje: `Tu suscripción venció. Tienes ${diasGracia} día${diasGracia === 1 ? '' : 's'} de gracia — renueva ya para evitar la suspensión.`,
    };
  }
  return {
    estado: 'vencida',
    dias_restantes: 0,
    mensaje: 'Cuenta suspendida por falta de pago. Contacta a soporte para reactivar.',
  };
}
