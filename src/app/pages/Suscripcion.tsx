"use client";

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PlanSelector } from '../components/PlanSelector';
import {
  CreditCard, CheckCircle, Clock, Zap, TrendingUp, Utensils, Crown,
  Users, Package, Calculator, Shield, BarChart3, ChefHat, FileText,
  AlertCircle, RefreshCw,
} from 'lucide-react';
import { Button } from '../components/ui/button';

// Feature list per plan (display only)
const PLAN_FEATURES: Record<string, string[]> = {
  basico: ['Dashboard', 'Punto de Venta', 'Gestión de Caja', 'Facturación electrónica', 'Soporte por email'],
  profesional: ['Todo lo del plan Básico', 'Inventario avanzado', 'Contabilidad', 'Reportes de Business Intelligence', 'Talento Humano', 'Soporte prioritario'],
  restaurante: ['Todo lo del plan Profesional', 'Módulo de Cocina (KDS)', 'Plano de Mesas', 'Ingeniería de Menú', 'Órdenes de producción'],
  enterprise: ['Todo lo del plan Restaurante', 'Auditoría completa', 'Multi-empresa', 'API personalizada', 'Soporte 24/7', 'SLA garantizado'],
};

const PLAN_ICONS: Record<string, any> = {
  basico: Zap,
  profesional: TrendingUp,
  restaurante: Utensils,
  enterprise: Crown,
};

const PLAN_COLORS: Record<string, string> = {
  basico: 'from-blue-500 to-cyan-500',
  profesional: 'from-purple-500 to-pink-500',
  restaurante: 'from-orange-500 to-red-500',
  enterprise: 'from-yellow-500 to-amber-500',
};

// Module usage stats derived from active modules
function useModuleStats(modulos: Record<string, boolean>) {
  return [
    { label: 'Punto de Venta',    icon: CreditCard,  active: !!modulos.pos },
    { label: 'Inventario',        icon: Package,     active: !!modulos.inventario },
    { label: 'Contabilidad',      icon: Calculator,  active: !!modulos.contabilidad },
    { label: 'Cocina (KDS)',      icon: ChefHat,     active: !!modulos.cocina },
    { label: 'Talento Humano',    icon: Users,       active: !!modulos.rrhh },
    { label: 'Auditoría',         icon: Shield,      active: !!modulos.auditoria },
    { label: 'Business Intelligence', icon: BarChart3, active: !!modulos.bi },
    { label: 'Facturación SRI',   icon: FileText,    active: !!modulos.contabilidad },
  ];
}

export default function Suscripcion() {
  const { user } = useAuth();
  const planActual = user?.empresa?.plan ?? 'basico';
  const modulos = user?.empresa?.modulos_activos ?? {};
  const moduleStats = useModuleStats(modulos);

  const [selectedPlan, setSelectedPlan] = useState(planActual);
  const [upgrading, setUpgrading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const PlanIcon = PLAN_ICONS[planActual] || Zap;
  const planColor = PLAN_COLORS[planActual] || 'from-blue-500 to-cyan-500';
  const planFeatures = PLAN_FEATURES[planActual] ?? [];
  const activeModules = moduleStats.filter(m => m.active).length;

  const handleChangePlan = async () => {
    if (selectedPlan === planActual) return;
    setUpgrading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      // In a real implementation this would call the billing API
      await new Promise(resolve => setTimeout(resolve, 1200));
      setSuccessMsg(`Solicitud de cambio al plan "${selectedPlan}" enviada. Nuestro equipo se pondrá en contacto con usted.`);
    } catch {
      setErrorMsg('No se pudo procesar la solicitud. Por favor intente nuevamente o contáctenos.');
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 min-h-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Suscripción</h1>
        <p className="text-gray-400 text-sm mt-1">Administra tu plan y los módulos activos de tu empresa</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT — Current Plan Card */}
        <div className="xl:col-span-1 space-y-5">
          {/* Plan Card */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${planColor} flex items-center justify-center shadow-lg`}>
                <PlanIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">Plan actual</p>
                <h2 className="text-white font-bold text-xl capitalize">{planActual}</h2>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-5 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-green-300 text-sm font-medium">Plan activo</span>
            </div>

            <div className="space-y-2">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Incluye</p>
              {planFeatures.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <CheckCircle className="w-4 h-4 text-[#00E5FF] mt-0.5 flex-shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Module Usage */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Módulos activos</h3>
              <span className="text-[#00E5FF] font-bold text-lg">{activeModules}<span className="text-gray-500 text-sm font-normal">/{moduleStats.length}</span></span>
            </div>
            <div className="space-y-2.5">
              {moduleStats.map(({ label, icon: Icon, active }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${active ? 'bg-[#00E5FF]/15' : 'bg-white/5'}`}>
                    <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#00E5FF]' : 'text-gray-600'}`} />
                  </div>
                  <span className={`text-sm flex-1 ${active ? 'text-gray-200' : 'text-gray-600'}`}>{label}</span>
                  {active
                    ? <CheckCircle className="w-4 h-4 text-green-400" />
                    : <div className="w-4 h-4 rounded-full border border-gray-700" />}
                </div>
              ))}
            </div>
          </div>

          {/* Billing Note */}
          <div className="bg-[#1e64a7]/10 border border-[#1e64a7]/30 rounded-xl p-4 flex gap-3">
            <Clock className="w-5 h-5 text-[#00E5FF] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white text-sm font-medium">Facturación mensual</p>
              <p className="text-gray-400 text-xs mt-1">Para cambios de plan, cancelaciones o facturación personalizada comunícate con nuestro equipo de soporte.</p>
            </div>
          </div>
        </div>

        {/* RIGHT — Plan Selector */}
        <div className="xl:col-span-2">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-full">
            <div className="flex items-center gap-2 mb-6">
              <RefreshCw className="w-5 h-5 text-[#00E5FF]" />
              <h3 className="text-white font-semibold text-lg">Cambiar plan</h3>
            </div>

            <PlanSelector
              selectedPlan={selectedPlan}
              onSelectPlan={setSelectedPlan}
            />

            <div className="mt-6 flex flex-col gap-3">
              {successMsg && (
                <div className="flex items-start gap-2 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-green-300 text-sm">{successMsg}</p>
                </div>
              )}
              {errorMsg && (
                <div className="flex items-start gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm">{errorMsg}</p>
                </div>
              )}

              <Button
                onClick={handleChangePlan}
                disabled={upgrading || selectedPlan === planActual}
                className={`w-full py-3 font-semibold text-base transition-all duration-200 ${
                  selectedPlan === planActual
                    ? 'bg-white/10 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90 text-white shadow-lg shadow-[#00E5FF]/20'
                }`}
              >
                {upgrading ? (
                  <span className="flex items-center gap-2 justify-center">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Procesando...
                  </span>
                ) : selectedPlan === planActual ? (
                  'Plan actual seleccionado'
                ) : (
                  `Solicitar cambio al plan ${selectedPlan}`
                )}
              </Button>

              <p className="text-gray-500 text-xs text-center">
                Al solicitar el cambio, nuestro equipo se pondrá en contacto dentro de las próximas 24 horas hábiles.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
