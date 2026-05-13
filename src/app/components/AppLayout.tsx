import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import Sidebar from './layout/Sidebar';
import OnboardingWizard from './onboarding/OnboardingWizard';

export default function AppLayout() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [forceOnboarding, setForceOnboarding] = useState(false);

  // Redirigir a login si no hay token
  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  // Escuchar evento para re-abrir el tour desde cualquier parte de la app
  useEffect(() => {
    const handler = () => setForceOnboarding(true);
    window.addEventListener('open-onboarding', handler);
    return () => window.removeEventListener('open-onboarding', handler);
  }, []);

  // Si no hay token, no renderizar nada (ya que se redirigirá)
  if (!token) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[#0A1A2F]">
      {/* Sidebar */}
      <Sidebar />

      {/* Contenido Principal */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Onboarding Wizard — se muestra automáticamente la primera vez */}
      <OnboardingWizard
        forceOpen={forceOnboarding}
        onClose={() => setForceOnboarding(false)}
      />
    </div>
  );
}
