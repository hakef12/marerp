import { Outlet, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { Menu, X, AlertTriangle, AlertCircle } from 'lucide-react';
import Sidebar from './layout/Sidebar';
import OnboardingWizard from './onboarding/OnboardingWizard';

/** Banner que avisa sobre el vencimiento próximo o período de gracia. */
function BannerSuscripcion() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [cerrado, setCerrado] = useState(false);

  const suscrip = user?.empresa?.suscripcion;
  if (!suscrip || suscrip.estado === 'activa' || cerrado) return null;

  const esGracia  = suscrip.estado === 'en_gracia';
  const esPorVencer = suscrip.estado === 'por_vencer';

  const bg    = esGracia  ? 'bg-red-600'    : 'bg-amber-500';
  const texto = esGracia  ? 'text-white'    : 'text-amber-950';
  const Icon  = esGracia  ? AlertCircle     : AlertTriangle;

  return (
    <div className={`${bg} ${texto} px-4 py-2 flex items-center gap-3 text-sm font-medium`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{suscrip.mensaje}</span>
      <button
        onClick={() => navigate('/suscripcion')}
        className="underline underline-offset-2 font-bold shrink-0 hover:opacity-80"
      >
        Renovar ahora
      </button>
      {esPorVencer && (
        <button onClick={() => setCerrado(true)} className="ml-2 opacity-70 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { token, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);

  // Redirigir a login solo cuando ya terminó de cargar y no hay token
  useEffect(() => {
    if (!isLoading && !token) {
      navigate('/login');
    }
  }, [token, isLoading, navigate]);

  // Cerrar sidebar al cambiar de ruta (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Escuchar evento para re-abrir el tour desde cualquier parte de la app
  useEffect(() => {
    const handler = () => setForceOnboarding(true);
    window.addEventListener('open-onboarding', handler);
    return () => window.removeEventListener('open-onboarding', handler);
  }, []);

  // Bloquear scroll del body cuando el sidebar está abierto en mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  // Mientras se restaura la sesión desde localStorage, mostrar pantalla de carga
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-900 text-xl">Cargando…</div>
      </div>
    );
  }

  if (!token) return null;

  return (
    <div className="flex min-h-screen bg-white">

      {/* ── Overlay (mobile) ─────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      {/* Desktop: always visible, relative.  Mobile: fixed drawer slide-in */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Botón cerrar — solo visible en mobile cuando está abierto */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden absolute top-4 right-[-44px] z-10 bg-white border border-black/10 rounded-r-lg p-2 text-gray-600 hover:text-black transition-colors shadow-sm"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>

        <Sidebar />
      </div>

      {/* ── Contenido Principal ──────────────────────────────────── */}
      <main className="flex-1 overflow-auto min-w-0 flex flex-col">
        <BannerSuscripcion />

        {/* Topbar mobile — solo visible en pantallas pequeñas */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-black/10 sticky top-0 z-30 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all"
            aria-label="Abrir menú"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-1 leading-none">
            <span
              className="font-black text-lg tracking-tight"
              style={{ color: '#F97316', fontFamily: "'Arial Black', Arial, sans-serif" }}
            >COCINA</span>
            <span
              className="font-black text-lg tracking-tight"
              style={{ color: '#1a1a1a', fontFamily: "'Arial Black', Arial, sans-serif" }}
            >LOCAL</span>
          </div>
        </div>

        {/* Contenido de la página — flex-1 + overflow permite que POS use h-full */}
        <div className="flex-1 flex flex-col min-h-0 overflow-auto">
          <Outlet />
        </div>
      </main>

      {/* Onboarding Wizard */}
      <OnboardingWizard
        forceOpen={forceOnboarding}
        onClose={() => setForceOnboarding(false)}
      />
    </div>
  );
}
