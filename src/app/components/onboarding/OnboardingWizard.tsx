import { useState, useEffect } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Calculator, Users, ChefHat,
  Shield, BarChart3, Settings, Utensils, Wallet, CreditCard, TrendingUp,
  FileText, X, ChevronRight, ChevronLeft, Check, Sparkles, ArrowRight,
  BookOpen, Zap, Globe, Lock, RefreshCw, DollarSign, ClipboardList,
  UserCog, Bell, Boxes, Truck, BarChart2, Receipt, Star, Play,
} from 'lucide-react';

// ─── Clave localStorage ────────────────────────────────────────────────────
const STORAGE_KEY = 'mar_onboarding_v2_done';

// ─── Tipos ────────────────────────────────────────────────────────────────
interface Step {
  id: string;
  group: string;
  icon: any;
  iconBg: string;
  iconColor: string;
  badge: string;
  badgeColor: string;
  title: string;
  subtitle: string;
  features: { icon: any; text: string }[];
  tip?: string;
  route?: string;
}

// ─── Pasos del wizard ─────────────────────────────────────────────────────
const STEPS: Step[] = [
  {
    id: 'welcome',
    group: 'Inicio',
    icon: Sparkles,
    iconBg: 'from-[#00E5FF]/20 to-[#1e64a7]/20',
    iconColor: 'text-[#00E5FF]',
    badge: 'Bienvenida',
    badgeColor: 'bg-[#00E5FF]/15 text-[#00E5FF]',
    title: 'Bienvenido a MAR ERP',
    subtitle: 'Sistema de gestión empresarial para restaurantes y negocios de alimentos',
    features: [
      { icon: Zap, text: 'Todo integrado: ventas, inventario, cocina, contabilidad y RRHH en una sola plataforma' },
      { icon: Globe, text: 'Accede desde cualquier dispositivo con conexión a internet' },
      { icon: Lock, text: 'Cada módulo registra auditoría automática de todos los cambios' },
      { icon: RefreshCw, text: 'Contabilidad NEC Ecuador generada automáticamente en cada transacción' },
    ],
    tip: 'Este tour te guiará por los módulos principales. Puedes saltarlo y volver a verlo en cualquier momento desde el menú.',
  },
  {
    id: 'dashboard',
    group: 'Inicio',
    icon: LayoutDashboard,
    iconBg: 'from-[#00E5FF]/20 to-[#1e64a7]/20',
    iconColor: 'text-[#00E5FF]',
    badge: 'Dashboard',
    badgeColor: 'bg-[#00E5FF]/15 text-[#00E5FF]',
    title: 'Panel de Control Central',
    subtitle: 'Vista 360° de tu negocio en tiempo real',
    features: [
      { icon: BarChart2, text: 'KPIs del día: ventas, ingresos, número de transacciones y ticket promedio' },
      { icon: Bell, text: 'Alertas automáticas de stock bajo, órdenes de cocina pendientes y caja abierta' },
      { icon: TrendingUp, text: 'Gráficos de tendencia de ventas por hora y por día de la semana' },
      { icon: Star, text: 'Top productos más vendidos y comparativa con períodos anteriores' },
    ],
    tip: 'El Dashboard se actualiza automáticamente. Es el punto de partida ideal para comenzar cada jornada.',
    route: '/',
  },
  {
    id: 'pos',
    group: 'Ventas',
    icon: ShoppingCart,
    iconBg: 'from-green-500/20 to-emerald-600/20',
    iconColor: 'text-green-400',
    badge: 'Punto de Venta',
    badgeColor: 'bg-green-500/15 text-green-400',
    title: 'Punto de Venta (POS)',
    subtitle: 'Registra ventas rápido con cobro, facturación y comandas integradas',
    features: [
      { icon: ShoppingCart, text: 'Búsqueda instantánea de productos por nombre o código de barras' },
      { icon: DollarSign, text: 'Múltiples métodos de pago: efectivo, tarjeta, transferencia y combinados' },
      { icon: FileText, text: 'Generación automática de factura electrónica SRI al completar la venta' },
      { icon: ChefHat, text: 'Envío de comanda directo a cocina con un clic desde la misma pantalla' },
    ],
    tip: 'La caja debe estar abierta antes de registrar ventas. Ve a Gestión de Caja para abrirla.',
    route: '/pos',
  },
  {
    id: 'mesas',
    group: 'Ventas',
    icon: Utensils,
    iconBg: 'from-purple-500/20 to-violet-600/20',
    iconColor: 'text-purple-400',
    badge: 'Mesas & Caja',
    badgeColor: 'bg-purple-500/15 text-purple-400',
    title: 'Mesas y Gestión de Caja',
    subtitle: 'Control visual del salón y flujo de efectivo diario',
    features: [
      { icon: Utensils, text: 'Plano visual del restaurante con estado de cada mesa (libre, ocupada, con cuenta)' },
      { icon: ClipboardList, text: 'Asignar pedidos a mesa específica y transferir entre mesas fácilmente' },
      { icon: Wallet, text: 'Apertura y cierre de caja con conteo de efectivo y reporte de cuadre' },
      { icon: BarChart2, text: 'Resumen diario de ingresos, egresos y diferencias de caja al cerrar' },
    ],
    tip: 'Cada sucursal o bodega tiene su propia caja. Asegúrate de seleccionar la correcta en el selector superior.',
    route: '/mesas',
  },
  {
    id: 'inventario',
    group: 'Operaciones',
    icon: Package,
    iconBg: 'from-orange-500/20 to-amber-600/20',
    iconColor: 'text-orange-400',
    badge: 'Inventario',
    badgeColor: 'bg-orange-500/15 text-orange-400',
    title: 'Control de Inventario',
    subtitle: 'Gestión completa de productos, bodegas, compras y proveedores',
    features: [
      { icon: Boxes, text: 'Catálogo de productos con stock por bodega, mínimos configurables y alertas automáticas' },
      { icon: Truck, text: 'Registro de compras con factura, actualización automática de precios de costo' },
      { icon: CreditCard, text: 'Compras a crédito: genera cuenta por pagar con alerta 5 días antes del vencimiento' },
      { icon: RefreshCw, text: 'Movimientos de entrada/salida/merma con asiento contable automático' },
    ],
    tip: 'Al registrar una compra se actualiza el stock, el precio de costo del producto y se crea el asiento contable NEC automáticamente.',
    route: '/inventario',
  },
  {
    id: 'cocina',
    group: 'Operaciones',
    icon: ChefHat,
    iconBg: 'from-red-500/20 to-rose-600/20',
    iconColor: 'text-red-400',
    badge: 'Cocina (KDS)',
    badgeColor: 'bg-red-500/15 text-red-400',
    title: 'Sistema de Display de Cocina',
    subtitle: 'Flujo de comandas digitales desde el salón hasta la cocina',
    features: [
      { icon: ClipboardList, text: 'Las comandas llegan desde el POS o Mesas en tiempo real, ordenadas por prioridad' },
      { icon: Bell, text: 'Cambio de estado: Pendiente → En preparación → Lista → Entregada' },
      { icon: BarChart2, text: 'Tiempo promedio de preparación por platillo y por turno de trabajo' },
      { icon: RefreshCw, text: 'Órdenes de producción para preparar lotes completos y descontar insumos automáticamente' },
    ],
    tip: 'La pantalla KDS se puede abrir en una tablet en cocina desde el menú principal → /kds para vista exclusiva de cocina.',
    route: '/cocina',
  },
  {
    id: 'ingenieria',
    group: 'Operaciones',
    icon: TrendingUp,
    iconBg: 'from-violet-500/20 to-purple-600/20',
    iconColor: 'text-violet-400',
    badge: 'Ingeniería de Menú',
    badgeColor: 'bg-violet-500/15 text-violet-400',
    title: 'Ingeniería de Menú y Fichas Técnicas',
    subtitle: 'Calcula el costo real de cada platillo y optimiza tus precios',
    features: [
      { icon: ClipboardList, text: 'Ficha técnica con ingredientes, cantidades y costo unitario por insumo' },
      { icon: DollarSign, text: 'Cálculo automático: costo total → costo/porción → precio sugerido por Food Cost %' },
      { icon: TrendingUp, text: 'Indicadores: % Food Cost real, margen bruto y ganancia por porción en pantalla' },
      { icon: Package, text: 'Al guardar la ficha, actualiza el precio de compra del producto final automáticamente' },
    ],
    tip: 'El Food Cost ideal para restaurantes es entre 25% y 35%. El sistema te avisa si superas ese umbral con indicadores de color.',
    route: '/ingenieria-menu',
  },
  {
    id: 'contabilidad',
    group: 'Finanzas',
    icon: Calculator,
    iconBg: 'from-blue-500/20 to-cyan-600/20',
    iconColor: 'text-blue-400',
    badge: 'Contabilidad',
    badgeColor: 'bg-blue-500/15 text-blue-400',
    title: 'Contabilidad NEC Ecuador',
    subtitle: 'Plan de cuentas NEC con asientos dobles generados automáticamente',
    features: [
      { icon: BookOpen, text: 'Plan Contable NEC Ecuador precargado. Todos los módulos crean asientos automáticamente' },
      { icon: Receipt, text: 'Libro Mayor, Balance General y Estado de Resultados actualizados al instante' },
      { icon: BarChart2, text: 'Flujo de caja proyectado, presupuesto vs. real y análisis de variaciones' },
      { icon: FileText, text: 'Exportación a Excel profesional de cada reporte contable con un clic' },
    ],
    tip: 'Inicializa el Plan Contable desde Contabilidad → Catálogo → Inicializar. Los asientos históricos anteriores se registrarán al activarlo.',
    route: '/contabilidad',
  },
  {
    id: 'facturacion',
    group: 'Finanzas',
    icon: FileText,
    iconBg: 'from-teal-500/20 to-green-600/20',
    iconColor: 'text-teal-400',
    badge: 'Facturación Electrónica',
    badgeColor: 'bg-teal-500/15 text-teal-400',
    title: 'Facturación Electrónica SRI',
    subtitle: 'Emisión, consulta y gestión de comprobantes electrónicos Ecuador',
    features: [
      { icon: FileText, text: 'Facturas, notas de crédito y retenciones electrónicas con firma digital (SRI)' },
      { icon: Check, text: 'Validación automática con el SRI y envío al correo del cliente en tiempo real' },
      { icon: ClipboardList, text: 'Consulta de facturas con filtros por fecha, cliente, estado y número' },
      { icon: Settings, text: 'Configuración del certificado digital, establecimiento y punto de emisión' },
    ],
    tip: 'Configura primero los datos de tu empresa en Config. Facturación antes de emitir tu primera factura electrónica.',
    route: '/facturacion/consulta',
  },
  {
    id: 'rrhh',
    group: 'Gestión',
    icon: Users,
    iconBg: 'from-pink-500/20 to-rose-600/20',
    iconColor: 'text-pink-400',
    badge: 'Talento Humano',
    badgeColor: 'bg-pink-500/15 text-pink-400',
    title: 'Gestión de Talento Humano',
    subtitle: 'Empleados, nómina, asistencia y vacaciones en un solo lugar',
    features: [
      { icon: Users, text: 'Ficha completa del empleado: datos personales, cargo, salario, banco y documentos' },
      { icon: ClipboardList, text: 'Registro de asistencia diaria con entradas, salidas y cálculo automático de horas' },
      { icon: DollarSign, text: 'Rol de pagos mensual con decimotercer sueldo, fondos de reserva y aportes IESS' },
      { icon: BarChart2, text: 'Control de vacaciones, anticipos y préstamos descontados automáticamente en nómina' },
    ],
    tip: 'Los pagos de nómina generan asientos contables automáticos en el módulo de Contabilidad.',
    route: '/rrhh',
  },
  {
    id: 'bi',
    group: 'Gestión',
    icon: BarChart3,
    iconBg: 'from-indigo-500/20 to-blue-600/20',
    iconColor: 'text-indigo-400',
    badge: 'Business Intelligence',
    badgeColor: 'bg-indigo-500/15 text-indigo-400',
    title: 'Inteligencia de Negocio',
    subtitle: 'Análisis profundo de tu negocio con reportes exportables',
    features: [
      { icon: BarChart3, text: 'Análisis de ventas por período, producto, categoría, cajero y método de pago' },
      { icon: TrendingUp, text: 'Tendencias y proyecciones basadas en histórico de ventas del negocio' },
      { icon: DollarSign, text: 'Análisis de costos vs. ingresos con indicadores de rentabilidad por área' },
      { icon: FileText, text: 'Exportación a Excel con múltiples hojas por categoría y formato profesional' },
    ],
    tip: 'Para mejores análisis asegúrate de tener al menos 30 días de datos registrados en el sistema.',
    route: '/bi',
  },
  {
    id: 'auditoria',
    group: 'Gestión',
    icon: Shield,
    iconBg: 'from-slate-500/20 to-gray-600/20',
    iconColor: 'text-slate-400',
    badge: 'Auditoría & Usuarios',
    badgeColor: 'bg-slate-500/15 text-slate-400',
    title: 'Auditoría y Control de Accesos',
    subtitle: 'Trazabilidad completa de cada acción en el sistema',
    features: [
      { icon: Shield, text: 'Log de auditoría: quién hizo qué, cuándo y desde qué IP en todo el sistema' },
      { icon: UserCog, text: 'Gestión de usuarios con roles: super_admin, admin, gerente, cajero, bodeguero, cocina' },
      { icon: Lock, text: 'Cada rol tiene permisos específicos que controlan qué módulos y acciones puede realizar' },
      { icon: Bell, text: 'Alertas automáticas de anomalías: descuentos excesivos, eliminaciones y accesos inusuales' },
    ],
    tip: 'Crea usuarios con el rol mínimo necesario. Un cajero no necesita acceso a Contabilidad ni a la gestión de usuarios.',
    route: '/auditoria',
  },
  {
    id: 'finish',
    group: 'Fin',
    icon: Check,
    iconBg: 'from-green-500/20 to-emerald-600/20',
    iconColor: 'text-green-400',
    badge: '¡Listo!',
    badgeColor: 'bg-green-500/15 text-green-400',
    title: '¡Ya conoces todo el sistema!',
    subtitle: 'Estás listo para comenzar a usar MAR ERP en tu negocio',
    features: [
      { icon: Play, text: 'Empieza por configurar tu empresa en Configuración → Datos de la empresa' },
      { icon: Package, text: 'Luego carga tus productos e insumos en el módulo de Inventario' },
      { icon: Wallet, text: 'Abre tu primera caja en Gestión de Caja y registra tu primera venta en el POS' },
      { icon: BookOpen, text: 'Inicializa el Plan Contable NEC para activar los asientos automáticos' },
    ],
    tip: 'Puedes volver a ver este tour desde el menú lateral en cualquier momento. ¡Éxito con tu negocio!',
    route: '/configuracion',
  },
];

// ─── Grupos de pasos para el progreso visual ──────────────────────────────
const GROUPS = ['Inicio', 'Ventas', 'Operaciones', 'Finanzas', 'Gestión', 'Fin'];

// ─── Componente principal ─────────────────────────────────────────────────
interface OnboardingWizardProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export default function OnboardingWizard({ forceOpen = false, onClose }: OnboardingWizardProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setStep(0);
      return;
    }
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      // pequeño delay para que cargue la UI primero
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, [forceOpen]);

  const current = STEPS[step];
  const total = STEPS.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;

  const goTo = (nextStep: number, dir: 'forward' | 'back') => {
    setAnimating(true);
    setDirection(dir);
    setTimeout(() => {
      setStep(nextStep);
      setAnimating(false);
    }, 220);
  };

  const next = () => { if (!isLast) goTo(step + 1, 'forward'); };
  const prev = () => { if (!isFirst) goTo(step - 1, 'back'); };

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
    onClose?.();
    // Navegar al módulo del último paso sin depender de useNavigate (evita error #310)
    if (current.route) window.location.href = current.route;
  };

  const skip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
    onClose?.();
  };

  if (!open) return null;

  const Icon = current.icon;
  const groupIndex = GROUPS.indexOf(current.group);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={skip}
      />

      {/* Card */}
      <div className="relative w-full max-w-2xl bg-gradient-to-br from-[#0A1A2F] to-[#0d2240] border border-[#00E5FF]/20 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">

        {/* Barra de progreso superior */}
        <div className="h-1 bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          {/* Grupos de navegación */}
          <div className="flex items-center gap-1">
            {GROUPS.map((g, i) => (
              <div key={g} className="flex items-center gap-1">
                <span className={`text-xs font-medium transition-colors ${
                  i === groupIndex ? 'text-[#00E5FF]' :
                  i < groupIndex ? 'text-white/40' : 'text-white/20'
                }`}>
                  {g}
                </span>
                {i < GROUPS.length - 1 && (
                  <ChevronRight className={`w-3 h-3 ${i < groupIndex ? 'text-white/40' : 'text-white/15'}`} />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{step + 1} / {total}</span>
            <button
              onClick={skip}
              className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
              title="Saltar tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Contenido con animación */}
        <div
          className={`transition-all duration-220 ${
            animating
              ? direction === 'forward'
                ? 'opacity-0 translate-x-4'
                : 'opacity-0 -translate-x-4'
              : 'opacity-100 translate-x-0'
          }`}
          style={{ minHeight: 400 }}
        >
          <div className="p-8">
            {/* Icono + badge */}
            <div className="flex items-start gap-5 mb-6">
              <div className={`flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br ${current.iconBg} border border-white/10 flex items-center justify-center shadow-lg`}>
                <Icon className={`w-8 h-8 ${current.iconColor}`} />
              </div>
              <div className="flex-1 pt-1">
                <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mb-2 ${current.badgeColor}`}>
                  {current.badge}
                </span>
                <h2 className="text-2xl font-black text-white leading-tight">{current.title}</h2>
                <p className="text-gray-400 text-sm mt-1">{current.subtitle}</p>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-3 mb-6">
              {current.features.map((feat, i) => {
                const FIcon = feat.icon;
                return (
                  <div key={i} className="flex items-start gap-3 bg-white/3 rounded-xl px-4 py-3 border border-white/5 hover:border-white/10 transition-colors">
                    <div className={`flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br ${current.iconBg} flex items-center justify-center mt-0.5`}>
                      <FIcon className={`w-3.5 h-3.5 ${current.iconColor}`} />
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">{feat.text}</p>
                  </div>
                );
              })}
            </div>

            {/* Tip */}
            {current.tip && (
              <div className="flex items-start gap-3 bg-[#00E5FF]/5 border border-[#00E5FF]/20 rounded-xl px-4 py-3">
                <Sparkles className="w-4 h-4 text-[#00E5FF] flex-shrink-0 mt-0.5" />
                <p className="text-[#00E5FF]/80 text-xs leading-relaxed">{current.tip}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-white/5 bg-white/2">
          {/* Puntos de navegación */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > step ? 'forward' : 'back')}
                className={`rounded-full transition-all duration-300 ${
                  i === step
                    ? 'w-5 h-2 bg-[#00E5FF]'
                    : i < step
                    ? 'w-2 h-2 bg-[#00E5FF]/40'
                    : 'w-2 h-2 bg-white/15'
                }`}
                title={STEPS[i].title}
              />
            ))}
          </div>

          {/* Botones */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={prev}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
            )}

            {isFirst && (
              <button
                onClick={skip}
                className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Saltar
              </button>
            )}

            {!isLast ? (
              <button
                onClick={next}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20 hover:shadow-[#00E5FF]/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                {step === 0 ? 'Comenzar tour' : 'Siguiente'}
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={finish}
                className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-green-600 to-emerald-500 text-white shadow-lg shadow-green-500/20 hover:shadow-green-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Check className="w-4 h-4" />
                ¡Empezar ahora!
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hook para re-abrir el wizard ─────────────────────────────────────────
export function useOnboarding() {
  const resetOnboarding = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };
  const isCompleted = () => !!localStorage.getItem(STORAGE_KEY);
  return { resetOnboarding, isCompleted };
}
