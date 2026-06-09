import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';
import {
  CreditCard, CheckCircle, Clock, Zap, TrendingUp, Utensils, Crown,
  Users, Package, AlertCircle, RefreshCw, ChefHat,
  BarChart3, Shield, Calculator, ArrowUpCircle,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const BASE = `https://${projectId}.supabase.co/functions/v1/server`;

const PLAN_INFO: Record<string, { icon: any; gradient: string }> = {
  basico:       { icon: Zap,        gradient: 'from-blue-500 to-cyan-500'    },
  restaurante:  { icon: Utensils,   gradient: 'from-orange-500 to-red-500'   },
  profesional:  { icon: TrendingUp, gradient: 'from-purple-500 to-pink-500'  },
  enterprise:   { icon: Crown,      gradient: 'from-yellow-500 to-amber-500' },
};

interface MiPlanData {
  plan: {
    codigo: string; nombre: string; precio: number; descripcion: string;
    caracteristicas: string[]; modulos_incluidos: Record<string, boolean>;
  };
  suscripcion: { estado: string; dias_restantes: number; mensaje: string };
  expiracion: string | null;
  uso: {
    productos:    { actual: number; limite: number };
    usuarios:     { actual: number; limite: number };
    facturas_mes: { actual: number; limite: number };
  };
  pagos: {
    id: string; plan_codigo: string; periodo_inicio: string; periodo_fin: string;
    monto: number; estado: string; metodo_pago: string; pagado_en: string | null;
  }[];
}

function BarraUso({ actual, limite, label }: { actual: number; limite: number; label: string }) {
  if (limite === -1) return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold">{actual} / <span className="text-green-600">ilimitado</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full">
        <div className="h-2 bg-green-300 rounded-full w-1/4" />
      </div>
    </div>
  );
  const pct   = Math.min((actual / limite) * 100, 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className={`font-semibold ${pct >= 90 ? 'text-red-600' : ''}`}>{actual} / {limite}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const ESTADO_STYLE: Record<string, string> = {
  activa:     'bg-green-100 text-green-700',
  por_vencer: 'bg-amber-100 text-amber-700',
  en_gracia:  'bg-red-100 text-red-700',
  vencida:    'bg-gray-200 text-gray-600',
};
const ESTADO_LABEL: Record<string, string> = {
  activa: 'Activa', por_vencer: 'Por vencer', en_gracia: 'Período de gracia', vencida: 'Vencida',
};

const UPGRADE_LABEL: Record<string, string> = {
  restaurante: 'Restaurante — $45/mes',
  profesional: 'Profesional — $100/mes',
  enterprise:  'Enterprise — $230/mes',
};
const UPGRADE_DETALLE: Record<string, string> = {
  restaurante: 'hasta 50 mesas, 10 usuarios y más capacidad',
  profesional: 'contabilidad completa, RRHH, nómina y Business Intelligence',
  enterprise:  'sucursales y usuarios ilimitados, onboarding y soporte dedicado',
};

export default function Suscripcion() {
  const { token } = useAuth();
  const [data, setData]       = useState<MiPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/mi-plan`, {
      headers: { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token },
    })
      .then(r => r.json())
      .then(j => { setData(j); setLoading(false); })
      .catch(() => { setError('No se pudo cargar la información del plan.'); setLoading(false); });
  }, [token]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
  if (error || !data) return (
    <div className="flex items-center justify-center min-h-[60vh] text-red-500 gap-2">
      <AlertCircle className="w-5 h-5" /> {error || 'Sin datos'}
    </div>
  );

  const { plan, suscripcion, expiracion, uso, pagos } = data;
  const info      = PLAN_INFO[plan.codigo] ?? PLAN_INFO.basico;
  const PlanIcon  = info.icon;
  const nextPlan  = ({ basico: 'restaurante', restaurante: 'profesional', profesional: 'enterprise' } as any)[plan.codigo];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mi Suscripción</h1>

      {/* ── Alerta de vencimiento ─────────────────────────────────── */}
      {suscripcion.estado !== 'activa' && (
        <div className={`rounded-xl p-4 flex items-start gap-3 ${
          suscripcion.estado === 'en_gracia' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'
        }`}>
          <AlertCircle className={`w-5 h-5 mt-0.5 shrink-0 ${suscripcion.estado === 'en_gracia' ? 'text-red-500' : 'text-amber-500'}`} />
          <div>
            <p className={`font-semibold ${suscripcion.estado === 'en_gracia' ? 'text-red-700' : 'text-amber-700'}`}>
              {ESTADO_LABEL[suscripcion.estado]}
            </p>
            <p className="text-sm text-gray-600 mt-0.5">{suscripcion.mensaje}</p>
            <p className="text-sm text-gray-500 mt-2">
              Para renovar, realiza un pago y contáctanos por WhatsApp con tu comprobante.
            </p>
          </div>
        </div>
      )}

      {/* ── Plan actual ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className={`bg-gradient-to-r ${info.gradient} p-6 text-white`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-xl p-2.5">
                <PlanIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-white/80 text-sm">Plan actual</p>
                <h2 className="text-2xl font-bold">{plan.nombre}</h2>
                <p className="text-white/70 text-sm">{plan.descripcion}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black">${plan.precio}</p>
              <p className="text-white/70 text-sm">por mes</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid md:grid-cols-2 gap-6">
          {/* Vigencia */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Vigencia</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ESTADO_STYLE[suscripcion.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                {ESTADO_LABEL[suscripcion.estado] ?? suscripcion.estado}
              </span>
              {suscripcion.dias_restantes > 0 && (
                <span className="text-sm text-gray-500">{suscripcion.dias_restantes} días restantes</span>
              )}
            </div>
            {expiracion && (
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Vence el {new Date(expiracion).toLocaleDateString('es-EC', { dateStyle: 'long' })}
              </p>
            )}
          </div>

          {/* Módulos */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Módulos</h3>
            <div className="grid grid-cols-2 gap-1 text-sm">
              {[
                { key: 'pos',          label: 'POS',           icon: CreditCard  },
                { key: 'cocina',       label: 'Cocina / KDS',  icon: ChefHat     },
                { key: 'inventario',   label: 'Inventario',    icon: Package     },
                { key: 'contabilidad', label: 'Contabilidad',  icon: Calculator  },
                { key: 'rrhh',         label: 'RRHH',          icon: Users       },
                { key: 'bi',           label: 'Reportes BI',   icon: BarChart3   },
                { key: 'auditoria',    label: 'Auditoría',     icon: Shield      },
              ].map(({ key, label, icon: Icon }) => (
                <div key={key} className={`flex items-center gap-1.5 ${plan.modulos_incluidos[key] ? 'text-gray-700' : 'text-gray-300'}`}>
                  {plan.modulos_incluidos[key]
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    : <div className="w-3.5 h-3.5 rounded-full border border-gray-200 shrink-0" />}
                  <Icon className="w-3 h-3 shrink-0" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Uso ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Uso del plan</h3>
        <BarraUso actual={uso.usuarios.actual}     limite={uso.usuarios.limite}     label="Usuarios activos" />
        <BarraUso actual={uso.productos.actual}    limite={uso.productos.limite}    label="Productos activos" />
        <BarraUso actual={uso.facturas_mes.actual} limite={uso.facturas_mes.limite} label="Facturas este mes" />
      </div>

      {/* ── Upgrade ───────────────────────────────────────────────── */}
      {nextPlan && (
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-bold text-lg">¿Necesitas más?</p>
            <p className="text-gray-300 text-sm mt-1">
              Pasa al <strong>{UPGRADE_LABEL[nextPlan]}</strong> y desbloquea {UPGRADE_DETALLE[nextPlan]}.
            </p>
          </div>
          <Button
            onClick={() => window.open(`https://wa.me/593XXXXXXXXX?text=Hola%2C+quiero+cambiar+al+plan+${nextPlan}`, '_blank')}
            className="bg-white text-gray-900 hover:bg-gray-100 shrink-0"
          >
            <ArrowUpCircle className="w-4 h-4 mr-2" /> Mejorar plan
          </Button>
        </div>
      )}

      {/* ── Historial de pagos ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Historial de pagos</h3>
        {pagos.length === 0 ? (
          <p className="text-gray-400 text-sm">Aún no hay pagos registrados.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {pagos.map(p => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-100 rounded-lg p-2">
                    <CreditCard className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 capitalize">{p.plan_codigo}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(p.periodo_inicio).toLocaleDateString('es-EC')} — {new Date(p.periodo_fin).toLocaleDateString('es-EC')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">${p.monto.toFixed(2)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.estado === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {p.estado}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          Para renovar tu suscripción contacta a soporte por WhatsApp con tu comprobante de pago.
        </p>
      </div>
    </div>
  );
}
