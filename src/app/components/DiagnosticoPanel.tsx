import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { AlertCircle, CheckCircle2, AlertTriangle, RefreshCw, Bug } from 'lucide-react';
import { ejecutarDiagnostico } from '../utils/diagnostico';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';

interface DiagnosticoResult {
  paso: string;
  estado: 'ok' | 'error' | 'warning';
  mensaje: string;
  detalles?: any;
}

export function DiagnosticoPanel() {
  const [resultados, setResultados] = useState<DiagnosticoResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const ejecutar = async () => {
    setIsLoading(true);
    const results = await ejecutarDiagnostico();
    setResultados(results);
    setIsLoading(false);
  };

  const getIcono = (estado: 'ok' | 'error' | 'warning') => {
    switch (estado) {
      case 'ok':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    }
  };

  const getBadgeVariant = (estado: 'ok' | 'error' | 'warning'): 'default' | 'destructive' | 'secondary' => {
    switch (estado) {
      case 'ok':
        return 'default';
      case 'error':
        return 'destructive';
      case 'warning':
        return 'secondary';
    }
  };

  const errores = resultados.filter(r => r.estado === 'error').length;
  const warnings = resultados.filter(r => r.estado === 'warning').length;
  const ok = resultados.filter(r => r.estado === 'ok').length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="bg-[#0A1A2F]/60 border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10"
          onClick={ejecutar}
        >
          <Bug className="w-4 h-4 mr-2" />
          Diagnóstico
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] bg-[#0A1A2F] border-[#00E5FF]/20">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2">
            <Bug className="w-6 h-6 text-[#00E5FF]" />
            Diagnóstico del Sistema
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumen */}
          {resultados.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-green-500/10 border-green-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-green-400">OK</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-400">{ok}</div>
                </CardContent>
              </Card>
              <Card className="bg-yellow-500/10 border-yellow-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-yellow-400">Advertencias</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-yellow-400">{warnings}</div>
                </CardContent>
              </Card>
              <Card className="bg-red-500/10 border-red-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-400">Errores</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-400">{errores}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Botón de ejecutar/refrescar */}
          <Button 
            onClick={ejecutar} 
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:from-[#00E5FF] hover:to-[#7B61FF]"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Ejecutando diagnóstico...' : resultados.length > 0 ? 'Refrescar' : 'Ejecutar Diagnóstico'}
          </Button>

          {/* Resultados */}
          {resultados.length > 0 && (
            <ScrollArea className="h-[400px] rounded-lg border border-[#00E5FF]/20 p-4">
              <div className="space-y-3">
                {resultados.map((resultado, index) => (
                  <Card 
                    key={index} 
                    className="bg-[#0A1A2F]/40 border-[#00E5FF]/20"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {getIcono(resultado.estado)}
                          <CardTitle className="text-base text-white">
                            {resultado.paso}
                          </CardTitle>
                        </div>
                        <Badge variant={getBadgeVariant(resultado.estado)}>
                          {resultado.estado.toUpperCase()}
                        </Badge>
                      </div>
                      <CardDescription className="text-gray-300 mt-1">
                        {resultado.mensaje}
                      </CardDescription>
                    </CardHeader>
                    {resultado.detalles && (
                      <CardContent>
                        <pre className="text-xs bg-black/30 p-3 rounded text-[#00E5FF] overflow-auto">
                          {JSON.stringify(resultado.detalles, null, 2)}
                        </pre>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Instrucciones */}
          {resultados.length > 0 && errores > 0 && (
            <Card className="bg-red-500/10 border-red-500/30">
              <CardHeader>
                <CardTitle className="text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Se detectaron errores
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-2">
                <p>Recomendaciones:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Verifica que el servidor de Supabase esté funcionando</li>
                  <li>Revisa que tu token de sesión no haya expirado</li>
                  <li>Intenta cerrar sesión y volver a iniciar sesión</li>
                  <li>Revisa la consola del navegador (F12) para más detalles</li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
