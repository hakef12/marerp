import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  ChefHat, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Star,
  Zap,
  HelpCircle,
  XCircle,
  DollarSign,
  BarChart3,
  FileText,
  RefreshCw
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface PlatoMatriz {
  plato_id: string;
  nombre: string;
  categoria: string;
  precio: number;
  costo_unitario: number;
  cantidad_vendida: number;
  ingresos_totales: number;
  margen_contribucion: number;
  margen_contribucion_total: number;
  porcentaje_margen: number;
  categoria_boston: string;
  recomendacion: string;
  color: string;
  indice_popularidad: string;
  indice_rentabilidad: string;
}

interface Metricas {
  total_platos_analizados: number;
  periodo: { inicio: string; fin: string };
  estrellas: number;
  caballos_batalla: number;
  enigmas: number;
  perros: number;
  total_ventas: number;
  total_ingresos: number;
  total_margen: number;
  promedio_margen_porcentaje: string;
}

interface Alerta {
  tipo: string;
  severidad: string;
  plato: string;
  plato_id: string;
  precio_venta: number;
  costo_actual: number;
  porcentaje_costo: string;
  margen_actual: number;
  mensaje: string;
  recomendacion: string;
}

export default function IngenieriaMenu() {
  const { token } = useAuth();
  const [matriz, setMatriz] = useState<PlatoMatriz[]>([]);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas');
  const [periodoAnterior, setPeriodoAnterior] = useState(30); // días

  useEffect(() => {
    cargarMatriz();
    cargarAlertas();
  }, [periodoAnterior]);

  const cargarMatriz = async () => {
    setIsLoading(true);
    try {
      const fechaInicio = new Date(Date.now() - periodoAnterior * 24 * 60 * 60 * 1000).toISOString();
      const fechaFin = new Date().toISOString();

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/ingenieria-menu/matriz?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token!,
          },
        }
      );

      if (!response.ok) throw new Error('Error al cargar matriz');

      const data = await response.json();
      setMatriz(data.matriz || []);
      setMetricas(data.metricas);
      toast.success('Matriz BCG cargada');
    } catch (error: any) {
      console.error('Error cargando matriz:', error);
      toast.error('Error al cargar la matriz de ingeniería de menú');
    } finally {
      setIsLoading(false);
    }
  };

  const cargarAlertas = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/ingenieria-menu/alertas`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token!,
          },
        }
      );

      if (!response.ok) throw new Error('Error al cargar alertas');

      const data = await response.json();
      setAlertas(data.alertas || []);
    } catch (error: any) {
      console.error('Error cargando alertas:', error);
    }
  };

  const getIconoCategoria = (categoria: string) => {
    switch (categoria) {
      case 'ESTRELLA':
        return <Star className="w-5 h-5 text-green-400" fill="currentColor" />;
      case 'CABALLO DE BATALLA':
        return <Zap className="w-5 h-5 text-orange-400" />;
      case 'ENIGMA':
        return <HelpCircle className="w-5 h-5 text-blue-400" />;
      case 'PERRO':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return null;
    }
  };

  const matrizFiltrada = categoriaFiltro === 'todas' 
    ? matriz 
    : matriz.filter(p => p.categoria_boston === categoriaFiltro);

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-[#0A1A2F] via-[#0F2640] to-[#1a3a52] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <ChefHat className="w-8 h-8 text-[#00E5FF]" />
            Ingeniería de Menú
          </h1>
          <p className="text-gray-400 mt-1">
            Análisis estratégico de rentabilidad y popularidad (Matriz Boston)
          </p>
        </div>
        <div className="flex gap-3">
          <select
            value={periodoAnterior}
            onChange={(e) => setPeriodoAnterior(Number(e.target.value))}
            className="px-4 py-2 bg-[#0A1A2F] border border-[#00E5FF]/30 rounded-lg text-white"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
          <Button
            onClick={cargarMatriz}
            disabled={isLoading}
            className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Métricas Generales */}
      {metricas && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-[#0A1A2F]/80 border-green-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                <Star className="w-4 h-4 text-green-400" fill="currentColor" />
                Estrellas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-400">{metricas.estrellas}</p>
              <p className="text-xs text-gray-500 mt-1">Alta popularidad, Alta rentabilidad</p>
            </CardContent>
          </Card>

          <Card className="bg-[#0A1A2F]/80 border-orange-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-400" />
                Caballos de Batalla
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-orange-400">{metricas.caballos_batalla}</p>
              <p className="text-xs text-gray-500 mt-1">Alta popularidad, Baja rentabilidad</p>
            </CardContent>
          </Card>

          <Card className="bg-[#0A1A2F]/80 border-blue-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-400" />
                Enigmas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-400">{metricas.enigmas}</p>
              <p className="text-xs text-gray-500 mt-1">Baja popularidad, Alta rentabilidad</p>
            </CardContent>
          </Card>

          <Card className="bg-[#0A1A2F]/80 border-red-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" />
                Perros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-400">{metricas.perros}</p>
              <p className="text-xs text-gray-500 mt-1">Baja popularidad, Baja rentabilidad</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alertas de Costos */}
      {alertas.length > 0 && (
        <Card className="bg-[#0A1A2F]/80 border-red-500/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Alertas de Variación de Costos ({alertas.length})
            </CardTitle>
            <CardDescription className="text-gray-400">
              Platos con costos superiores al 40% del precio de venta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alertas.slice(0, 5).map((alerta, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    alerta.severidad === 'CRÍTICO' 
                      ? 'bg-red-500/10 border-red-500/30' 
                      : 'bg-orange-500/10 border-orange-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-white">{alerta.plato}</p>
                      <p className="text-sm text-gray-400 mt-1">{alerta.mensaje}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        💡 {alerta.recomendacion}
                      </p>
                    </div>
                    <Badge 
                      variant="outline"
                      className={alerta.severidad === 'CRÍTICO' ? 'border-red-500 text-red-400' : 'border-orange-500 text-orange-400'}
                    >
                      {alerta.porcentaje_costo}% costo
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Matriz y Análisis */}
      <Tabs defaultValue="matriz" className="w-full">
        <TabsList className="bg-[#0A1A2F]/50 border border-[#00E5FF]/20">
          <TabsTrigger value="matriz">Matriz Boston</TabsTrigger>
          <TabsTrigger value="detalles">Análisis Detallado</TabsTrigger>
        </TabsList>

        {/* Matriz Boston */}
        <TabsContent value="matriz" className="space-y-4">
          {/* Filtros */}
          <div className="flex gap-2">
            <Button
              variant={categoriaFiltro === 'todas' ? 'default' : 'outline'}
              onClick={() => setCategoriaFiltro('todas')}
              className={categoriaFiltro === 'todas' ? 'bg-[#00E5FF]' : ''}
            >
              Todos ({matriz.length})
            </Button>
            <Button
              variant={categoriaFiltro === 'ESTRELLA' ? 'default' : 'outline'}
              onClick={() => setCategoriaFiltro('ESTRELLA')}
              className={categoriaFiltro === 'ESTRELLA' ? 'bg-green-500' : ''}
            >
              <Star className="w-4 h-4 mr-1" fill="currentColor" />
              Estrellas
            </Button>
            <Button
              variant={categoriaFiltro === 'CABALLO DE BATALLA' ? 'default' : 'outline'}
              onClick={() => setCategoriaFiltro('CABALLO DE BATALLA')}
              className={categoriaFiltro === 'CABALLO DE BATALLA' ? 'bg-orange-500' : ''}
            >
              <Zap className="w-4 h-4 mr-1" />
              Caballos
            </Button>
            <Button
              variant={categoriaFiltro === 'ENIGMA' ? 'default' : 'outline'}
              onClick={() => setCategoriaFiltro('ENIGMA')}
              className={categoriaFiltro === 'ENIGMA' ? 'bg-blue-500' : ''}
            >
              <HelpCircle className="w-4 h-4 mr-1" />
              Enigmas
            </Button>
            <Button
              variant={categoriaFiltro === 'PERRO' ? 'default' : 'outline'}
              onClick={() => setCategoriaFiltro('PERRO')}
              className={categoriaFiltro === 'PERRO' ? 'bg-red-500' : ''}
            >
              <XCircle className="w-4 h-4 mr-1" />
              Perros
            </Button>
          </div>

          {/* Grid de Platos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matrizFiltrada.map((plato) => (
              <Card
                key={plato.plato_id}
                className="bg-[#0A1A2F]/80 hover:bg-[#0A1A2F] transition-all"
                style={{ borderColor: plato.color + '40' }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-white text-lg flex items-center gap-2">
                        {getIconoCategoria(plato.categoria_boston)}
                        {plato.nombre}
                      </CardTitle>
                      <Badge 
                        className="mt-2"
                        style={{ 
                          backgroundColor: plato.color + '20',
                          borderColor: plato.color,
                          color: plato.color
                        }}
                      >
                        {plato.categoria_boston}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-400">Ventas</p>
                      <p className="text-white font-semibold">{plato.cantidad_vendida} uds</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Ingresos</p>
                      <p className="text-white font-semibold">${plato.ingresos_totales.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Precio</p>
                      <p className="text-white font-semibold">${plato.precio.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Costo</p>
                      <p className="text-white font-semibold">${plato.costo_unitario.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Margen Unit.</p>
                      <p className="text-green-400 font-semibold">${plato.margen_contribucion.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Margen %</p>
                      <p className="text-green-400 font-semibold">{plato.porcentaje_margen.toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-700">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {plato.recomendacion}
                    </p>
                  </div>

                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline" className="border-gray-600">
                      Pop: {plato.indice_popularidad}
                    </Badge>
                    <Badge variant="outline" className="border-gray-600">
                      Rent: {plato.indice_rentabilidad}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {matrizFiltrada.length === 0 && (
            <Card className="bg-[#0A1A2F]/80">
              <CardContent className="py-12 text-center">
                <p className="text-gray-400">No hay platos en esta categoría</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Análisis Detallado */}
        <TabsContent value="detalles" className="space-y-4">
          <Card className="bg-[#0A1A2F]/80">
            <CardHeader>
              <CardTitle className="text-white">Resumen Financiero</CardTitle>
              <CardDescription className="text-gray-400">
                Período: {metricas?.periodo.inicio.split('T')[0]} a {metricas?.periodo.fin.split('T')[0]}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metricas && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-gray-400 mb-2">Total Ventas (unidades)</p>
                    <p className="text-3xl font-bold text-white">{metricas.total_ventas}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-2">Total Ingresos</p>
                    <p className="text-3xl font-bold text-[#00E5FF]">${metricas.total_ingresos.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-2">Margen Total</p>
                    <p className="text-3xl font-bold text-green-400">${metricas.total_margen.toFixed(2)}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {metricas.promedio_margen_porcentaje}% promedio
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Guía de Acción */}
          <Card className="bg-[#0A1A2F]/80">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#00E5FF]" />
                Guía de Acción Estratégica
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <Star className="w-5 h-5 text-green-400 flex-shrink-0 mt-1" fill="currentColor" />
                  <div>
                    <p className="font-semibold text-green-400">Estrellas (Stars)</p>
                    <p className="text-sm text-gray-300 mt-1">
                      ✅ <strong>Mantener:</strong> Ubicar en zonas destacadas del menú físico y digital<br />
                      ✅ Asegurar calidad consistente y disponibilidad de ingredientes<br />
                      ✅ Considerar aumentar precios gradualmente (tienen demanda establecida)
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                  <Zap className="w-5 h-5 text-orange-400 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-orange-400">Caballos de Batalla (Plowhorses)</p>
                    <p className="text-sm text-gray-300 mt-1">
                      🔧 <strong>Reingeniería:</strong> Revisar porciones para reducir costos<br />
                      🔧 Buscar proveedores alternativos más económicos<br />
                      🔧 Considerar ajuste de precio (+5-10%) o reformular receta
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <HelpCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-blue-400">Enigmas (Puzzles)</p>
                    <p className="text-sm text-gray-300 mt-1">
                      📣 <strong>Promocionar:</strong> Usar CRM para enviar cupones de descuento<br />
                      📣 Capacitar al personal para sugerir activamente estos platos<br />
                      📣 Colocar en posiciones estratégicas del menú (primero o último)
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-red-400">Perros (Dogs)</p>
                    <p className="text-sm text-gray-300 mt-1">
                      ❌ <strong>Evaluar Eliminación:</strong> Considerar reemplazar del menú<br />
                      ❌ Liberar espacio en inventario para productos más rentables<br />
                      ❌ Si se mantiene, promover agresivamente o discontinuar
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}