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
};

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
        setPlanes(data.planes || []);
      }
    } catch (error) {
      console.error('Error cargando planes:', error);
      // Mantener planes vacíos si falla
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <h3 className="text-xl font-bold text-white mb-2">Selecciona tu Plan</h3>
          <p className="text-gray-400 text-sm">Cargando planes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-white mb-2">Selecciona tu Plan</h3>
        <p className="text-gray-400 text-sm">30 días de prueba gratis • Sin tarjeta de crédito</p>
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
                  ? 'border-[#00E5FF] bg-[#00E5FF]/10 scale-105 shadow-lg shadow-[#00E5FF]/20'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
              }`}
            >
              {/* Badge Popular */}
              {plan.popular && (
                <div className="absolute -top-2 -right-2 bg-gradient-to-r from-[#7B61FF] to-[#00E5FF] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                  ⭐ Popular
                </div>
              )}

              {/* Check Mark */}
              {isSelected && (
                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#00E5FF] flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}

              {/* Icon */}
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-3`}>
                <Icon className="w-6 h-6 text-white" />
              </div>

              {/* Nombre y Precio */}
              <div className="mb-2">
                <h4 className="text-white font-bold text-lg">{plan.nombre}</h4>
                <p className="text-gray-400 text-xs mb-2">{plan.descripcion}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">${plan.precio_mensual}</span>
                  <span className="text-gray-400 text-sm">/mes</span>
                </div>
              </div>

              {/* Características */}
              <ul className="space-y-1 mt-3">
                {caracteristicas.slice(0, 3).map((caracteristica, index) => (
                  <li key={`${plan.codigo}-caracteristica-${index}`} className="flex items-start gap-2 text-xs text-gray-300">
                    <Check className="w-3 h-3 text-[#00E5FF] mt-0.5 flex-shrink-0" />
                    <span>{caracteristica}</span>
                  </li>
                ))}
                {caracteristicas.length > 3 && (
                  <li key={`${plan.codigo}-mas-caracteristicas`} className="text-xs text-[#00E5FF] font-medium">
                    +{caracteristicas.length - 3} más
                  </li>
                )}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="bg-[#1e64a7]/10 border border-[#1e64a7]/30 rounded-lg p-3 mt-4">
        <p className="text-xs text-gray-400 text-center">
          💡 Todos los planes incluyen 30 días de prueba gratuita. Puedes cambiar de plan en cualquier momento.
        </p>
      </div>
    </div>
  );
}