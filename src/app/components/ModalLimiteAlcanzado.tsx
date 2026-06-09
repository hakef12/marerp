import { useNavigate } from 'react-router';
import { ArrowUpCircle, Lock, X, Zap, Utensils, TrendingUp, Crown } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  mensaje: string;
  onClose: () => void;
}

const PLANES_UPGRADE = [
  { codigo: 'restaurante', nombre: 'Restaurante', precio: 45,  color: 'from-orange-500 to-red-500',   icon: Utensils,   desc: 'Más mesas, usuarios y capacidad' },
  { codigo: 'profesional', nombre: 'Profesional', precio: 100, color: 'from-purple-500 to-pink-500',  icon: TrendingUp, desc: 'Contabilidad, RRHH y BI incluidos' },
  { codigo: 'enterprise',  nombre: 'Enterprise',  precio: 230, color: 'from-yellow-500 to-amber-500', icon: Crown,      desc: 'Todo ilimitado + soporte dedicado' },
];

export function ModalLimiteAlcanzado({ mensaje, onClose }: Props) {
  const navigate = useNavigate();

  const irASuscripcion = () => {
    onClose();
    navigate('/suscripcion');
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-5 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-xl p-2.5">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Límite del plan alcanzado</h2>
              <p className="text-white/80 text-sm">Actualiza tu plan para continuar</p>
            </div>
          </div>
        </div>

        {/* Mensaje */}
        <div className="p-5 border-b border-gray-100">
          <p className="text-gray-700 text-sm leading-relaxed">{mensaje}</p>
        </div>

        {/* Planes sugeridos */}
        <div className="p-5 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Planes disponibles</p>
          {PLANES_UPGRADE.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.codigo}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all"
              >
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{plan.nombre}</p>
                  <p className="text-xs text-gray-500 truncate">{plan.desc}</p>
                </div>
                <span className="text-sm font-bold text-gray-900 shrink-0">${plan.precio}<span className="text-xs font-normal text-gray-400">/mes</span></span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-200 text-gray-600">
            Cerrar
          </Button>
          <Button
            onClick={irASuscripcion}
            className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90 gap-2"
          >
            <ArrowUpCircle className="w-4 h-4" />
            Ver mi plan
          </Button>
        </div>
      </div>
    </div>
  );
}
