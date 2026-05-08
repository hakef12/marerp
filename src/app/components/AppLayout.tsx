import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';
import Sidebar from './layout/Sidebar';

export default function AppLayout() {
  const { token } = useAuth();
  const navigate = useNavigate();

  // Redirigir a login si no hay token
  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

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
    </div>
  );
}
