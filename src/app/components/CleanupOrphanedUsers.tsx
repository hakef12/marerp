import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Trash2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface CleanupResult {
  message: string;
  summary: {
    total_auth_users: number;
    valid_users: number;
    orphaned_found: number;
    orphaned_deleted: number;
  };
  orphaned_users: Array<{ id: string; email: string; created_at: string }>;
  deleted_users: Array<{ id: string; email: string; created_at: string }>;
  valid_users: Array<{ id: string; email: string }>;
}

export function CleanupOrphanedUsers() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCleanup = async () => {
    if (isLoading) return; // Prevenir múltiples clicks
    
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      console.log('🧹 Iniciando limpieza de usuarios huérfanos...');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/auth/cleanup-orphaned-users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error en la limpieza');
      }

      console.log('✅ Limpieza completada:', data);
      setResult(data);
      
      if (data.summary.orphaned_deleted > 0) {
        toast.success(`✅ ${data.summary.orphaned_deleted} usuario(s) huérfano(s) eliminado(s)`);
      } else {
        toast.info('ℹ️ No se encontraron usuarios huérfanos');
      }

    } catch (err: any) {
      console.error('❌ Error en limpieza:', err);
      const errorMessage = err.message || 'Error al limpiar usuarios';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-[#0A1A2F]/60 border-orange-500/30">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-orange-400" />
          Limpieza de Usuarios Huérfanos
        </CardTitle>
        <CardDescription className="text-gray-400">
          Elimina usuarios creados en Auth pero sin registro completo en el sistema
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-orange-500/10 border-orange-500/30">
          <AlertCircle className="h-4 w-4 text-orange-400" />
          <AlertTitle className="text-orange-400">¿Qué hace esta herramienta?</AlertTitle>
          <AlertDescription className="text-gray-300 text-sm mt-2">
            Busca usuarios que fueron creados en Supabase Auth pero cuyo registro no se completó 
            en la base de datos (usuarios "huérfanos"). Esto sucede cuando el proceso de registro 
            se interrumpe después de crear el usuario en Auth.
          </AlertDescription>
        </Alert>

        <Button
          onClick={handleCleanup}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Limpiando...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4 mr-2" />
              Limpiar Usuarios Huérfanos
            </>
          )}
        </Button>

        {error && (
          <Alert className="bg-red-500/10 border-red-500/30">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-red-400">Error</AlertTitle>
            <AlertDescription className="text-gray-300 text-sm mt-2">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="space-y-4 mt-4">
            <Alert className={`${
              result.summary.orphaned_deleted > 0 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-blue-500/10 border-blue-500/30'
            }`}>
              <CheckCircle2 className={`h-4 w-4 ${
                result.summary.orphaned_deleted > 0 ? 'text-green-400' : 'text-blue-400'
              }`} />
              <AlertTitle className={`${
                result.summary.orphaned_deleted > 0 ? 'text-green-400' : 'text-blue-400'
              }`}>
                Limpieza Completada
              </AlertTitle>
              <AlertDescription className="text-gray-300 text-sm mt-2 space-y-1">
                <p>• Total usuarios en Auth: <strong>{result.summary.total_auth_users}</strong></p>
                <p>• Usuarios válidos: <strong className="text-green-400">{result.summary.valid_users}</strong></p>
                <p>• Usuarios huérfanos encontrados: <strong className="text-orange-400">{result.summary.orphaned_found}</strong></p>
                <p>• Usuarios huérfanos eliminados: <strong className="text-red-400">{result.summary.orphaned_deleted}</strong></p>
              </AlertDescription>
            </Alert>

            {result.deleted_users && result.deleted_users.length > 0 && (
              <div className="bg-black/30 rounded-lg p-4">
                <h4 className="text-white font-semibold mb-2">Usuarios Eliminados:</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  {result.deleted_users.map((user) => (
                    <li key={user.id} className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.valid_users && result.valid_users.length > 0 && (
              <div className="bg-black/30 rounded-lg p-4">
                <h4 className="text-white font-semibold mb-2">Usuarios Válidos (no eliminados):</h4>
                <ul className="space-y-1 text-sm text-gray-300 max-h-40 overflow-y-auto">
                  {result.valid_users.map((user) => (
                    <li key={user.id} className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-gray-400 text-center pt-2 border-t border-white/5">
          💡 Tip: Usa esta herramienta si ves el error "REGISTRO INCOMPLETO" al intentar iniciar sesión
        </div>
      </CardContent>
    </Card>
  );
}