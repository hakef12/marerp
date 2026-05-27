// Vista mejorada de Kitchen Display System con cronómetros y datos completos
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  Bell,
  Flame,
  CheckCircle,
  Clock,
  Users
} from 'lucide-react';

interface KDSViewProps {
  comandasPorEstado: any;
  stats: any;
  getEstadoBadge: (estado: string) => string;
  formatTime: (seconds: number) => string;
  getElapsedTime: (fechaCreacion: string, fechaInicio?: string) => number;
  getTimeColor: (seconds: number) => string;
  cambiarEstado: (id: string, estado: string) => void;
}

export default function CocinaKDS({
  comandasPorEstado,
  stats,
  getEstadoBadge,
  formatTime,
  getElapsedTime,
  getTimeColor,
  cambiarEstado
}: KDSViewProps) {

  // ✅ HELPER LOCAL PARA EVITAR QUE SE ROMPA SI FALLA LA FECHA
  const safeGetElapsedTime = (fechaCreacion: string, fechaInicio?: string) => {
    try {
      const time = getElapsedTime(fechaCreacion, fechaInicio);
      return isNaN(time) ? 0 : Math.max(0, time); // No permite números negativos ni NaN
    } catch {
      return 0;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* PENDIENTES */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 font-bold flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-400" />
            Pendientes
            <Badge className="bg-orange-500/20 text-orange-400">{stats.pendientes}</Badge>
          </h3>
        </div>
        <ScrollArea className="flex-1 h-[calc(100vh-400px)]">
          <div className="space-y-3 pr-4">
            {stats.pendientes === 0 ? (
              <Card className="bg-white border-[#F97316]/20">
                <CardContent className="p-6 text-center text-gray-600">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  Sin comandas pendientes
                </CardContent>
              </Card>
            ) : (
              comandasPorEstado.pendiente.map((comanda: any) => {
                // ✅ FECHA SEGURA
                const fechaBase = comanda.created_at || comanda.fecha_creacion || new Date().toISOString();
                const tiempoTranscurrido = safeGetElapsedTime(fechaBase);
                const esUrgente = tiempoTranscurrido > 900;
                
                return (
                  <Card 
                    key={comanda.id} 
                    className={`bg-white border-2 transition-all ${
                      esUrgente 
                        ? 'border-red-500/50 shadow-lg shadow-red-500/20' 
                        : 'border-orange-500/30'
                    }`}
                  >
                    <CardHeader className="pb-3 bg-gradient-to-r from-orange-500/10 to-transparent">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-gray-900 text-xl font-bold flex items-center gap-2">
                            {comanda.mesa ? `Mesa ${comanda.mesa}` : comanda.numero_orden || 'Sin Mesa'}
                            {esUrgente && (
                              <Badge className="bg-red-500 text-white">
                                URGENTE
                              </Badge>
                            )}
                          </CardTitle>
                          {comanda.cliente && (
                            <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                              <Users className="w-3 h-3" />
                              {comanda.cliente}
                            </p>
                          )}
                          <Badge className={`${getEstadoBadge(comanda.estado)} mt-2`} variant="outline">
                            Pendiente
                          </Badge>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-black ${getTimeColor(tiempoTranscurrido)}`}>
                            {formatTime(tiempoTranscurrido)}
                          </div>
                          <p className="text-xs text-gray-600">Esperando</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                      {/* Items */}
                      <div className="space-y-2">
                        {comanda.items?.map((item: any, i: number) => (
                          <div key={i} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="text-gray-900 font-bold">
                                  <span className="text-[#F97316] text-lg mr-2">{item.cantidad}x</span>
                                  {item.nombre}
                                </p>
                                {item.notas && (
                                  <p className="text-orange-400 text-xs mt-1 italic">
                                    📝 {item.notas}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Notas generales */}
                      {comanda.notas && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
                          <p className="text-yellow-400 text-sm">
                            💬 {comanda.notas}
                          </p>
                        </div>
                      )}

                      {/* Items totales */}
                      <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                        <span className="text-gray-600">Items totales:</span>
                        <span className="text-gray-900 font-bold">
                          {comanda.items?.reduce((sum: number, item: any) => sum + (item.cantidad || 0), 0) || 0}
                        </span>
                      </div>

                      {/* Botón */}
                      <Button
                        onClick={() => cambiarEstado(comanda.id, 'en_preparacion')}
                        className="w-full mt-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-gray-900 font-bold"
                      >
                        <Flame className="w-4 h-4 mr-2" />
                        Iniciar Preparación
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* EN PREPARACIÓN */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 font-bold flex items-center gap-2">
            <Flame className="w-5 h-5 text-blue-400" />
            En Preparación
            <Badge className="bg-blue-500/20 text-blue-400">{stats.enPreparacion}</Badge>
          </h3>
        </div>
        <ScrollArea className="flex-1 h-[calc(100vh-400px)]">
          <div className="space-y-3 pr-4">
            {stats.enPreparacion === 0 ? (
              <Card className="bg-white border-[#F97316]/20">
                <CardContent className="p-6 text-center text-gray-600">
                  <Flame className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  Sin comandas en preparación
                </CardContent>
              </Card>
            ) : (
              comandasPorEstado.en_preparacion.map((comanda: any) => {
                // ✅ FECHA SEGURA
                const fechaBase = comanda.created_at || comanda.fecha_creacion || new Date().toISOString();
                const tiempoTranscurrido = safeGetElapsedTime(fechaBase, comanda.fecha_inicio);
                
                return (
                  <Card 
                    key={comanda.id} 
                    className="bg-white border-blue-500/30 border-2 shadow-lg shadow-blue-500/10"
                  >
                    <CardHeader className="pb-3 bg-gradient-to-r from-blue-500/10 to-transparent">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-gray-900 text-xl font-bold">
                            {comanda.mesa ? `Mesa ${comanda.mesa}` : comanda.numero_orden || 'Sin Mesa'}
                          </CardTitle>
                          {comanda.cliente && (
                            <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                              <Users className="w-3 h-3" />
                              {comanda.cliente}
                            </p>
                          )}
                          <Badge className={`${getEstadoBadge(comanda.estado)} mt-2`} variant="outline">
                            En Preparación
                          </Badge>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-black ${getTimeColor(tiempoTranscurrido)}`}>
                            {formatTime(tiempoTranscurrido)}
                          </div>
                          <p className="text-xs text-gray-600">Cocinando</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                      {/* Items */}
                      <div className="space-y-2">
                        {comanda.items?.map((item: any, i: number) => (
                          <div key={i} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="text-gray-900 font-bold">
                                  <span className="text-[#F97316] text-lg mr-2">{item.cantidad}x</span>
                                  {item.nombre}
                                </p>
                                {item.notas && (
                                  <p className="text-blue-400 text-xs mt-1 italic">
                                    📝 {item.notas}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Notas */}
                      {comanda.notas && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2">
                          <p className="text-blue-400 text-sm">
                            💬 {comanda.notas}
                          </p>
                        </div>
                      )}

                      {/* Botón */}
                      <Button
                        onClick={() => cambiarEstado(comanda.id, 'lista')}
                        className="w-full mt-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-gray-900 font-bold"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Marcar como Lista
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* LISTAS */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 font-bold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Listas para Servir
            <Badge className="bg-green-500/20 text-green-400">{stats.listas}</Badge>
          </h3>
        </div>
        <ScrollArea className="flex-1 h-[calc(100vh-400px)]">
          <div className="space-y-3 pr-4">
            {stats.listas === 0 ? (
              <Card className="bg-white border-[#F97316]/20">
                <CardContent className="p-6 text-center text-gray-600">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  Sin comandas listas
                </CardContent>
              </Card>
            ) : (
              comandasPorEstado.lista.map((comanda: any) => {
                // ✅ FECHA SEGURA PARA COMANDAS COMPLETADAS
                const fechaInicio = comanda.created_at || comanda.fecha_creacion || new Date().toISOString();
                const fechaFin = comanda.fecha_completado || new Date().toISOString();
                
                let tiempoTotal = 0;
                try {
                  tiempoTotal = Math.max(0, Math.floor((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 1000));
                } catch {
                  tiempoTotal = 0;
                }
                
                return (
                  <Card 
                    key={comanda.id} 
                    className="bg-white border-green-500/30 border-2 shadow-lg shadow-green-500/10"
                  >
                    <CardHeader className="pb-3 bg-gradient-to-r from-green-500/10 to-transparent">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-gray-900 text-xl font-bold flex items-center gap-2">
                            {comanda.mesa ? `Mesa ${comanda.mesa}` : comanda.numero_orden || 'Sin Mesa'}
                            <Badge className="bg-green-500 text-gray-900">
                              ✓ LISTA
                            </Badge>
                          </CardTitle>
                          {comanda.cliente && (
                            <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                              <Users className="w-3 h-3" />
                              {comanda.cliente}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black text-green-400">
                            {formatTime(tiempoTotal)}
                          </div>
                          <p className="text-xs text-gray-600">Tiempo total</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                      {/* Items */}
                      <div className="space-y-2">
                        {comanda.items?.map((item: any, i: number) => (
                          <div key={i} className="bg-green-500/5 rounded-lg p-3 border border-green-500/20">
                            <p className="text-gray-900 font-bold">
                              <span className="text-green-400 text-lg mr-2">✓ {item.cantidad}x</span>
                              {item.nombre}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Botón */}
                      <Button
                        onClick={() => cambiarEstado(comanda.id, 'entregada')}
                        variant="outline"
                        className="w-full mt-3 border-green-500/30 text-green-400 hover:bg-green-500/10"
                      >
                        Marcar como Entregada
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}