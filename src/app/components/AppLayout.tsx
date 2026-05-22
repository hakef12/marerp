import { Outlet, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import Sidebar from './layout/Sidebar';
import OnboardingWizard from './onboarding/OnboardingWizard';
import { MARLogo } from './MARLogo';

export default function AppLayout() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);

  // Redirigir a login si no hay token
  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

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

  if (!token) return null;

  return (
    <div className="flex min-h-screen bg-[#0A1A2F]">

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
          className="md:hidden absolute top-4 right-[-44px] z-10 bg-[#0F2640] border border-white/10 rounded-r-lg p-2 text-gray-400 hover:text-white transition-colors"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>

        <Sidebar />
      </div>

      {/* ── Contenido Principal ──────────────────────────────────── */}
      <main className="flex-1 overflow-auto min-w-0 flex flex-col">

        {/* Topbar mobile — solo visible en pantallas pequeñas */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#0A1A2F]/95 border-b border-white/5 sticky top-0 z-30 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Abrir menú"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <MARLogo className="w-8 h-8" />
            <span className="text-white font-bold text-lg tracking-wider">M.A.R</span>
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
