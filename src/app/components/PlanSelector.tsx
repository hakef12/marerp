import { Check, Zap, TrendingUp, Utensils, Crown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface Plan {
  id: string;
  codigo: string;
  nombre: string;
  precio_mensual: number;
  descripcion: string;
  caracteristicas: string[];
  popular?: boolean;
  color?: string;
}

// Mapeo de iconos por plan
const PLAN_ICONS: Record<string, any> = {
  basico: Zap,
  profesional: TrendingUp,
  restaurante: Utensils,
  enterprise: Crown
};

// Mapeo de colores por defecto
const PLAN_COLORS: Record<string, string> = {
  basico: 'from-blue-500 to-cyan-500',
  profesional: 'from-purple-500 to-pink-500',
  restaurante: 'from-orange-500 to-red-500',
  enterprise: 'from-yellow-500 to-amber-500'
}

// Planes de respaldo si el API no responde
const PLANES_FALLBACK: Plan[] = [
  {
    id: 'basico',
    codigo: 'basico',
    nombre: 'Básico',
    precio_mensual: 49,
    descripcion: 'Ideal para pequeños negocios',
    caracteristicas: ['POS + Inventario', 'Hasta 2 usuarios', '1 bodega', 'Soporte básico'],
    color: ''
  },
  {
    id: 'profesional',
    codigo: 'profesional',
    nombre: 'Profesional',
    precio_mensual: 129,
    descripcion: 'Para negocios en crecimiento',
    caracteristicas: ['Todos los módulos', 'Hasta 10 usuarios', 'Bodegas ilimitadas', 'Soporte prioritario'],
    popular: true,
    color: ''
  },
  {
    id: 'restaurante',
    codigo: 'restaurante',
    nombre: 'Restaurante',
    precio_mensual: 99,
    descripcion: 'Especializado en gastronomía',
    caracteristicas: ['POS + Mesas + Cocina', 'KDS integrado', 'Facturación SRI', 'Hasta 5 usuarios'],
    color: ''
  },
  {
    id: 'enterprise',
    codigo: 'enterprise',
    nombre: 'Enterprise',
    precio_mensual: 299,
    descripcion: 'Sin límites, máximo rendimiento',
    caracteristicas: ['Todo ilimitado', 'Multiempresa', 'API personalizada', 'Soporte 24/7'],
    color: ''
  }
];

interface PlanSelectorProps {
  selectedPlan: string;
  onSelectPlan: (planId: string) => void;
}

export function PlanSelector({ selectedPlan, onSelectPlan }: PlanSelectorProps) {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // DEBUG: Ver qué plan está seleccionado
  useEffect(() => {
    console.log('🎯 [PLAN_SELECTOR] Plan seleccionado:', selectedPlan);
  }, [selectedPlan]);

  useEffect(() => {
    cargarPlanes();
  }, []);

  const cargarPlanes = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/planes`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        const planesBackend = data.planes || [];
        setPlanes(planesBackend.length > 0 ? planesBackend : PLANES_FALLBACK);
      } else {
        setPlanes(PLANES_FALLBACK);
      }
    } catch (error) {
      console.error('Error cargando planes, usando fallback:', error);
      setPlanes(PLANES_FALLBACK);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2">Selecciona tu Plan</h3>
          <p className="text-gray-600 text-sm">Cargando planes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Selecciona tu Plan</h3>
        <p className="text-gray-600 text-sm">30 días de prueba gratis • Sin tarjeta de crédito</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {planes.map((plan) => {
          const Icon = PLAN_ICONS[plan.codigo] || Zap;
          const color = plan.color ? `from-[${plan.color}] to-[${plan.color}]` : PLAN_COLORS[plan.codigo] || 'from-blue-500 to-cyan-500';
          const isSelected = selectedPlan === plan.codigo;
          const caracteristicas = Array.isArray(plan.caracteristicas) ? plan.caracteristicas : [];
          
          return (
            <button
              key={plan.codigo}
              onClick={() => {
                console.log('🖱️ [PLAN_SELECTOR] Click en plan:', plan.codigo);
                onSelectPlan(plan.codigo);
              }}
              className={`relative text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                isSelected
                  ? 'border-[#F97316] bg-[#F97316]/10 scale-105 shadow-lg shadow-[#F97316]/20'
                  : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-gray-100'
              }`}
            >
              {/* Badge Popular */}
              {plan.popular && (
                <div className="absolute -top-2 -right-2 bg-gradient-to-r from-[#FB923C] to-[#F97316] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                  ⭐ Popular
                </div>
              )}

              {/* Check Mark */}
              {isSelected && (
                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#F97316] flex items-center justify-center">
                  <Check className="w-4 h-4 text-gray-900" />
                </div>
              )}

              {/* Icon */}
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-3`}>
                <Icon className="w-6 h-6 text-gray-900" />
              </div>

              {/* Nombre y Precio */}
              <div className="mb-2">
                <h4 className="text-gray-900 font-bold text-lg">{plan.nombre}</h4>
                <p className="text-gray-600 text-xs mb-2">{plan.descripcion}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-gray-900">${plan.precio_mensual}</span>
                  <span className="text-gray-600 text-sm">/mes</span>
                </div>
              </div>

              {/* Características */}
              <ul className="space-y-1 mt-3">
                {caracteristicas.slice(0, 3).map((caracteristica, index) => (
                  <li key={`${plan.codigo}-caracteristica-${index}`} className="flex items-start gap-2 text-xs text-gray-600">
                    <Check className="w-3 h-3 text-[#F97316] mt-0.5 flex-shrink-0" />
                    <span>{caracteristica}</span>
                  </li>
                ))}
                {caracteristicas.length > 3 && (
                  <li key={`${plan.codigo}-mas-caracteristicas`} className="text-xs text-[#F97316] font-medium">
                    +{caracteristicas.length - 3} más
                  </li>
                )}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="bg-[#C2410C]/10 border border-[#C2410C]/30 rounded-lg p-3 mt-4">
        <p className="text-xs text-gray-600 text-center">
          💡 Todos los planes incluyen 30 días de prueba gratuita. Puedes cambiar de plan en cualquier momento.
        </p>
      </div>
    </div>
  );
}