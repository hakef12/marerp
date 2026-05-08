import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './context/AuthContext';
import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    // Ejecutar diagnóstico en modo desarrollo (puedes comentar esta línea en producción)
    if (import.meta.env.DEV) {
      import('./utils/diagnostico').then(({ diagnosticarSistema }) => {
        setTimeout(() => {
          console.log('🔧 Ejecutando diagnóstico automático del sistema...');
          diagnosticarSistema();
        }, 2000); // Esperar 2 segundos después de cargar la app
      });
    }
  }, []);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}