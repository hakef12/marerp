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
      // Intentar hacer ping a la edge function
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
      <Alert className="mb-6 border-blue-500/50 bg-blue-500/10">
        <Database className="h-5 w-5 text-blue-400" />
        <AlertDescription className="ml-2 text-blue-200">
          Verificando estado de la conexión con Supabase...
        </AlertDescription>
      </Alert>
    );
  }

  if (isDeployed) {
    return (
      <Alert className="mb-6 border-green-500/50 bg-green-500/10">
        <CheckCircle2 className="h-5 w-5 text-green-400" />
        <AlertDescription className="ml-2 text-green-200">
          ✅ Edge Functions desplegadas correctamente. El sistema está operativo.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-6 border-yellow-500/50 bg-yellow-500/10">
      <AlertTriangle className="h-5 w-5 text-yellow-400" />
      <AlertDescription className="ml-2 space-y-4">
        <div className="text-yellow-200 font-semibold text-lg">
          ⚠️ Edge Functions no detectadas - Configuración requerida
        </div>
        
        <div className="text-yellow-100 space-y-3 pl-4">
          <p className="font-medium">
            El sistema M.A.R requiere que las Edge Functions estén desplegadas en Supabase. 
            Sigue estos pasos para configurar tu proyecto:
          </p>

          <div className="bg-[#0A1A2F] p-4 rounded-lg border border-yellow-500/30 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-cyan-400 font-bold text-lg">1.</span>
              <div>
                <p className="font-semibold text-cyan-300">Instala Supabase CLI</p>
                <code className="block mt-2 p-2 bg-black/50 rounded text-sm text-green-400">
                  npm install -g supabase
                </code>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-cyan-400 font-bold text-lg">2.</span>
              <div>
                <p className="font-semibold text-cyan-300">Autentícate con Supabase</p>
                <code className="block mt-2 p-2 bg-black/50 rounded text-sm text-green-400">
                  supabase login
                </code>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-cyan-400 font-bold text-lg">3.</span>
              <div>
                <p className="font-semibold text-cyan-300">Vincula tu proyecto</p>
                <code className="block mt-2 p-2 bg-black/50 rounded text-sm text-green-400">
                  supabase link --project-ref {projectId}
                </code>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-cyan-400 font-bold text-lg">4.</span>
              <div>
                <p className="font-semibold text-cyan-300">Ejecuta las migraciones SQL</p>
                <p className="text-yellow-100 text-sm mt-1">
                  Ve al Dashboard de Supabase → SQL Editor y ejecuta:
                </p>
                <code className="block mt-2 p-2 bg-black/50 rounded text-sm text-green-400">
                  /supabase/migrations/EJECUTAR_AHORA.sql
                </code>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-cyan-400 font-bold text-lg">5.</span>
              <div>
                <p className="font-semibold text-cyan-300">Despliega las Edge Functions</p>
                <code className="block mt-2 p-2 bg-black/50 rounded text-sm text-green-400">
                  supabase functions deploy server
                </code>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <Button
              onClick={checkEdgeFunctionStatus}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Verificar nuevamente
            </Button>
            
            <Button
              onClick={() => window.open(`https://supabase.com/dashboard/project/${projectId}`, '_blank')}
              variant="outline"
              className="border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir Dashboard de Supabase
            </Button>

            <Button
              onClick={() => window.open('https://supabase.com/docs/guides/functions', '_blank')}
              variant="outline"
              className="border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
            >
              <Terminal className="mr-2 h-4 w-4" />
              Ver Documentación de Edge Functions
            </Button>
          </div>
        </div>

        <div className="border-t border-yellow-500/30 pt-3 mt-3">
          <p className="text-yellow-200 text-sm">
            💡 <strong>Nota importante:</strong> Las Edge Functions son el backend del sistema M.A.R. 
            Sin ellas, no podrás acceder a funciones como inventario, POS, cocina, RRHH, etc.
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}