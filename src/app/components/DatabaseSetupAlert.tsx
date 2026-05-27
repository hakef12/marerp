import { Alert, AlertDescription } from './ui/alert';
import { AlertTriangle, CheckCircle2, Database, ExternalLink, Terminal } from 'lucide-react';
import { Button } from './ui/button';
import { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export function DatabaseSetupAlert() {
  const [isDeployed, setIsDeployed] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    checkEdgeFunctionStatus();
  }, []);

  const checkEdgeFunctionStatus = async () => {
    setIsChecking(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/health`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      setIsDeployed(response.ok);
    } catch (error) {
      console.error('Error verificando Edge Function:', error);
      setIsDeployed(false);
    } finally {
      setIsChecking(false);
    }
  };

  if (isChecking) {
    return (
      <Alert className="mb-6 border-blue-200 bg-blue-50">
        <Database className="h-5 w-5 text-blue-500" />
        <AlertDescription className="ml-2 text-blue-700">
          Verificando estado de la conexión con Supabase...
        </AlertDescription>
      </Alert>
    );
  }

  if (isDeployed) {
    return (
      <Alert className="mb-6 border-green-200 bg-green-50">
        <CheckCircle2 className="h-5 w-5 text-green-500" />
        <AlertDescription className="ml-2 text-green-700">
          ✅ Edge Functions desplegadas correctamente. El sistema está operativo.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-6 border-yellow-300 bg-yellow-50">
      <AlertTriangle className="h-5 w-5 text-yellow-600" />
      <AlertDescription className="ml-2 space-y-4">
        <div className="text-yellow-800 font-semibold text-lg">
          ⚠️ Edge Functions no detectadas - Configuración requerida
        </div>

        <div className="text-yellow-700 space-y-3 pl-4">
          <p className="font-medium">
            El sistema M.A.R requiere que las Edge Functions estén desplegadas en Supabase.
            Sigue estos pasos para configurar tu proyecto:
          </p>

          <div className="bg-white p-4 rounded-lg border border-yellow-200 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-[#F97316] font-bold text-lg">1.</span>
              <div>
                <p className="font-semibold text-gray-900">Instala Supabase CLI</p>
                <code className="block mt-2 p-2 bg-gray-900 rounded text-sm text-green-400">
                  npm install -g supabase
                </code>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-[#F97316] font-bold text-lg">2.</span>
              <div>
                <p className="font-semibold text-gray-900">Autentícate con Supabase</p>
                <code className="block mt-2 p-2 bg-gray-900 rounded text-sm text-green-400">
                  supabase login
                </code>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-[#F97316] font-bold text-lg">3.</span>
              <div>
                <p className="font-semibold text-gray-900">Vincula tu proyecto</p>
                <code className="block mt-2 p-2 bg-gray-900 rounded text-sm text-green-400">
                  supabase link --project-ref {projectId}
                </code>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-[#F97316] font-bold text-lg">4.</span>
              <div>
                <p className="font-semibold text-gray-900">Ejecuta las migraciones SQL</p>
                <p className="text-gray-600 text-sm mt-1">
                  Ve al Dashboard de Supabase → SQL Editor y ejecuta:
                </p>
                <code className="block mt-2 p-2 bg-gray-900 rounded text-sm text-green-400">
                  /supabase/migrations/EJECUTAR_AHORA.sql
                </code>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-[#F97316] font-bold text-lg">5.</span>
              <div>
                <p className="font-semibold text-gray-900">Despliega las Edge Functions</p>
                <code className="block mt-2 p-2 bg-gray-900 rounded text-sm text-green-400">
                  supabase functions deploy server
                </code>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <Button
              onClick={checkEdgeFunctionStatus}
              className="bg-[#F97316] hover:bg-[#EA580C] text-white"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Verificar nuevamente
            </Button>

            <Button
              onClick={() => window.open(`https://supabase.com/dashboard/project/${projectId}`, '_blank')}
              variant="outline"
              className="border-[#F97316]/40 text-[#F97316] hover:bg-[#F97316]/10"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir Dashboard de Supabase
            </Button>

            <Button
              onClick={() => window.open('https://supabase.com/docs/guides/functions', '_blank')}
              variant="outline"
              className="border-[#F97316]/40 text-[#F97316] hover:bg-[#F97316]/10"
            >
              <Terminal className="mr-2 h-4 w-4" />
              Ver Documentación de Edge Functions
            </Button>
          </div>
        </div>

        <div className="border-t border-yellow-200 pt-3 mt-3">
          <p className="text-yellow-700 text-sm">
            💡 <strong>Nota importante:</strong> Las Edge Functions son el backend del sistema M.A.R.
            Sin ellas, no podrás acceder a funciones como inventario, POS, cocina, RRHH, etc.
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}
