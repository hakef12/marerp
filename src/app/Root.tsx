import { Outlet, useNavigate, useLocation } from 'react-router';
import { useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/layout/Sidebar';

export default function Root() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !user && location.pathname !== '/login') {
      navigate('/login');
    }
  }, [user, isLoading, navigate, location]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#0F2640] to-[#1a3a52] flex items-center justify-center">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-[#0A1A2F] via-[#0F2640] to-[#1a3a52] overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}