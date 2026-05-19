import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  ChefHat,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  BookOpen,
  Package,
  BarChart3,
  Plus,
  Pencil,
  Trash2,
  Play,
  CheckCheck,
  Factory,
  FileDown,
  FileSpreadsheet,
  Timer,
  Bell,
  Flame,
  Users,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import RecetaModal from '../components/cocina/RecetaModal';
import ProducirModal from '../components/cocina/ProducirModal';
import CocinaKDS from './CocinaKDS';
import {
  exportRecetasToPDF,
  exportRecetasToExcel,
  exportOrdenesProduccionToPDF,
  exportOrdenesProduccionToExcel,
  exportReporteKDSToPDF,
} from '../utils/exportUtils';

export default function Cocina() {
  const { token } = useAuth();
  const [comandas, setComandas] = useState<any[]>([]);
  const [view, setView] = useState<'kitchen' | 'recipes' | 'production' | 'reports'>('kitchen');
  const [isLoading, setIsLoading] = useState(false);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [productionOrders, setProductionOrders] = useState<any[]>([]);
  
  // ✅ NUEVO ESTADO: Para guardar el catálogo de productos localmente y traducir los ingredientes
  const [inventoryProducts, setInventoryProducts] = useState<any[]>([]);

  const [showRecetaModal, setShowRecetaModal] = useState(false);
  const [showProducirModal, setShowProducirModal] = useState(false);
  const [selectedReceta, setSelectedReceta] = useState<any | null>(null);
  const [loadingRecetaId, setLoadingRecetaId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [expandedOrders, setExpandedOrders] = useState<Set<any>>(new Set());

  // ⏱️ Actualizar tiempo actual cada segundo para cronómetros
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 📐 Función para formatear tiempo en MM:SS
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00"; // ✅ Protección contra NaN
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ⏱️ Calcular tiempo transcurrido en segundos
  const getElapsedTime = (fechaCreacion: string, fechaInicio?: string) => {
    if (!fechaCreacion && !fechaInicio) return 0; // ✅ Protección contra fechas nulas
    const startTime = fechaInicio ? new Date(fechaInicio) : new Date(fechaCreacion);
    if (isNaN(startTime.getTime())) return 0; // ✅ Protección contra fechas inválidas
    return Math.floor((currentTime - startTime.getTime()) / 1000);
  };

  // 🎨 Color del cronómetro según tiempo
  const getTimeColor = (seconds: number) => {
    if (seconds > 900) return 'text-red-400'; // >15 min
    if (seconds > 600) return 'text-orange-400'; // >10 min
    return 'text-green-400'; // <10 min
  };

  // ✅ FETCH CATÁLOGO DE PRODUCTOS (Para traducir los IDs de los ingredientes)
  const fetchInventoryProducts = useCallback(async () => {
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/productos`,
        { 
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token || ''
          } 
        }
      );
      if (response.ok) {
        const data = await response.json();
        setInventoryProducts(data.productos || []);
      }
    } catch (error) {
      console.error('Error cargando productos para traducción:', error);
    }
  }, [token]);

  // ✅ FETCH COMANDAS
  const fetchComandas = useCallback(async (showToast = false) => {
    try {
      if (showToast) setIsLoading(true);
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/comandas`,
        { 
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token || ''
          } 
        }
      );

      if (response.ok) {
        const data = await response.json();
        setComandas(data.comandas || []);
      }
    } catch (error) {
      console.error('Error cargando comandas:', error);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // ✅ FETCH RECETAS
  const fetchRecetas = useCallback(async () => {
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/recetas`,
        { 
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token || ''
          } 
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRecipes(data.recetas || []);
      }
    } catch (error) {
      console.error('Error cargando recetas:', error);
    }
  }, [token]);

  // ✅ FETCH ÓRDENES DE PRODUCCIÓN
  const fetchOrdenesProduccion = useCallback(async () => {
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/ordenes-produccion`,
        { 
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token || ''
          } 
        }
      );

      if (response.ok) {
        const data = await response.json();
        setProductionOrders(data.ordenes || []);
      }
    } catch (error) {
      console.error('❌ Error cargando órdenes de producción:', error);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchComandas(true);
      fetchRecetas();
      fetchOrdenesProduccion();
      fetchInventoryProducts();
      
      const interval = setInterval(() => fetchComandas(false), 15000);
      return () => clearInterval(interval);
    }
  }, [fetchComandas, fetchRecetas, fetchOrdenesProduccion, fetchInventoryProducts, token]);

  // ✅ ACTUALIZACIÓN OPTIMISTA
  const cambiarEstado = async (comandaId: string, nuevoEstado: string) => {
    if (!comandaId || comandaId === 'undefined') {
      toast.error('Comanda sin ID — recarga la página');
      return;
    }
    setComandas(prev => prev.map(c =>
      c.id === comandaId ? { ...c, estado: nuevoEstado } : c
    ));

    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/comandas/${comandaId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token || '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ estado: nuevoEstado })
        }
      );

      if (response.ok) {
        toast.success(`Comanda actualizada a ${nuevoEstado}`);
      } else {
        fetchComandas(false);
        toast.error('Error al actualizar comanda');
      }
    } catch (error) {
      fetchComandas(false);
      toast.error('Error de conexión');
    }
  };

  const cambiarEstadoOrden = async (ordenId: string, nuevoEstado: string) => {
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/ordenes-produccion/${ordenId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token || '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ estado: nuevoEstado })
        }
      );

      if (response.ok) {
        toast.success('Orden actualizada exitosamente');
        fetchOrdenesProduccion();
      } else {
        toast.error('Error al actualizar orden');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  // Cargar receta completa desde API antes de abrir el editor
  const abrirEditorReceta = async (recetaId: string) => {
    setLoadingRecetaId(recetaId);
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/recetas/${recetaId}`,
        { headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '' } }
      );
      if (response.ok) {
        const data = await response.json();
        setSelectedReceta(data.receta || null);
        setShowRecetaModal(true);
      } else {
        toast.error('No se pudo cargar la receta');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setLoadingRecetaId(null);
    }
  };

  // ✅ CORRECCIÓN ERROR 401: Ahora envía el Authorization y X-User-Token correctos
  const eliminarReceta = async (recetaId: string) => {
    if (!confirm('¿Está seguro de eliminar esta receta?')) return;

    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/recetas/${recetaId}`,
        { 
          method: 'DELETE', 
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token || ''
          } 
        }
      );

      if (response.ok) {
        toast.success('Receta eliminada exitosamente');
        fetchRecetas();
      } else {
        toast.error('Error al eliminar receta');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  const stats = useMemo(() => {
    const pendientes = comandas.filter(c => c.estado === 'pendiente').length;
    const enPreparacion = comandas.filter(c => c.estado === 'en_preparacion').length;
    const listas = comandas.filter(c => c.estado === 'lista').length;
    
    const urgentes = comandas.filter(c => {
      const fechaComanda = c.fecha_creacion || c.created_at || c.fecha_recepcion;
      if (!fechaComanda) return false;
      const fecha = new Date(fechaComanda);
      if (isNaN(fecha.getTime())) return false;
      const waitTime = Math.floor((Date.now() - fecha.getTime()) / 60000);
      return waitTime > 20 && c.estado !== 'lista';
    }).length;

    const tiemposEspera = comandas
      .filter(c => c.estado !== 'lista')
      .map(c => {
        const fechaComanda = c.fecha_creacion || c.created_at || c.fecha_recepcion;
        if (!fechaComanda) return 0;
        const fecha = new Date(fechaComanda);
        if (isNaN(fecha.getTime())) return 0;
        return Math.floor((Date.now() - fecha.getTime()) / 60000);
      })
      .filter(t => t > 0);
      
    const tiempoPromedio = tiemposEspera.length > 0
      ? tiemposEspera.reduce((sum, t) => sum + t, 0) / tiemposEspera.length
      : 0;

    return { pendientes, enPreparacion, listas, urgentes, tiempoPromedio };
  }, [comandas]);

  const getEstadoBadge = (estado: string) => {
    const styles = {
      pendiente: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      en_preparacion: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      lista: 'bg-green-500/20 text-green-400 border-green-500/30',
    };
    return styles[estado as keyof typeof styles] || styles.pendiente;
  };

  const comandasPorEstado = {
    pendiente: comandas.filter(c => c.estado === 'pendiente'),
    en_preparacion: comandas.filter(c => c.estado === 'en_preparacion'),
    lista: comandas.filter(c => c.estado === 'lista'),
  };

  const getDificultadBadge = (dificultad?: string) => {
    if (dificultad === 'facil') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (dificultad === 'dificil') return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  };

  const getDificultadText = (dificultad?: string) => {
    if (dificultad === 'facil') return 'Fácil';
    if (dificultad === 'dificil') return 'Difícil';
    return 'Medio';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <ChefHat className="w-8 h-8 text-[#00E5FF]" />
          Kitchen Display System (KDS)
        </h1>
        <p className="text-gray-400">Gestión de comandas, recetas y producción en tiempo real</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 rounded-xl shadow-lg border border-[#00E5FF]/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <ChefHat className="w-6 h-6 text-[#00E5FF]" />
          </div>
          <p className="text-sm text-gray-400 font-medium">Órdenes Activas</p>
          <p className="text-2xl font-black text-white">{stats.pendientes + stats.enPreparacion}</p>
        </div>

        <div className="bg-gradient-to-br from-red-900/20 to-red-800/10 rounded-xl shadow-lg border border-red-500/30 p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-sm text-red-400 font-medium">Urgentes</p>
          <p className="text-2xl font-black text-red-400">{stats.urgentes}</p>
        </div>

        <div className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 rounded-xl shadow-lg border border-orange-500/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-6 h-6 text-orange-400" />
          </div>
          <p className="text-sm text-gray-400 font-medium">Pendientes</p>
          <p className="text-2xl font-black text-orange-400">{stats.pendientes}</p>
        </div>

        <div className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 rounded-xl shadow-lg border border-blue-500/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-6 h-6 text-blue-400" />
          </div>
          <p className="text-sm text-gray-400 font-medium">En Preparación</p>
          <p className="text-2xl font-black text-blue-400">{stats.enPreparacion}</p>
        </div>

        <div className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 rounded-xl shadow-lg border border-[#7B61FF]/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-6 h-6 text-[#7B61FF]" />
          </div>
          <p className="text-sm text-gray-400 font-medium">Tiempo Prom.</p>
          <p className="text-2xl font-black text-[#7B61FF]">{stats.tiempoPromedio.toFixed(0)}m</p>
        </div>
      </div>

      <div className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 rounded-xl shadow-lg border border-[#00E5FF]/20 p-2 flex gap-2 overflow-x-auto">
        {/* Abrir KDS en pantalla de cocina */}
        <button
          onClick={() => window.open('/kds', '_blank', 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no')}
          className="flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 ml-auto"
          title="Abrir pantalla KDS en ventana separada para la cocina"
        >
          <ChefHat className="w-5 h-5" /> Pantalla Cocina ↗
        </button>
        <button
          onClick={() => setView('kitchen')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'kitchen' ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <ChefHat className="w-5 h-5" /> Cocina (KDS)
        </button>
        <button
          onClick={() => setView('recipes')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'recipes' ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <BookOpen className="w-5 h-5" /> Fichas Técnicas
        </button>
        <button
          onClick={() => setView('production')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'production' ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Package className="w-5 h-5" /> Producción
        </button>
        <button
          onClick={() => setView('reports')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'reports' ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <BarChart3 className="w-5 h-5" /> Reportes
        </button>
      </div>

      {view === 'kitchen' && (
        <CocinaKDS
          comandasPorEstado={comandasPorEstado}
          stats={stats}
          getEstadoBadge={getEstadoBadge}
          formatTime={formatTime}
          getElapsedTime={getElapsedTime}
          getTimeColor={getTimeColor}
          cambiarEstado={cambiarEstado}
        />
      )}

      {view === 'recipes' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (recipes.length === 0) return toast.error('No hay recetas para exportar');
                  exportRecetasToPDF(recipes, inventoryProducts);
                  toast.success('Recetas exportadas a PDF');
                }}
                className="border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10"
              >
                <FileDown className="w-4 h-4 mr-2" /> Exportar PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (recipes.length === 0) return toast.error('No hay recetas para exportar');
                  exportRecetasToExcel(recipes, inventoryProducts);
                  toast.success('Recetas exportadas a Excel');
                }}
                className="border-green-500/30 text-green-400 hover:bg-green-500/10"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel
              </Button>
            </div>
            <Button
              onClick={async () => {
                try {
                  const { projectId, publicAnonKey } = await import('/utils/supabase/info');
                  const res = await fetch(
                    `https://${projectId}.supabase.co/functions/v1/server/cocina/recetas/backfill-costos`,
                    { method: 'POST', headers: { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token } }
                  );
                  const data = await res.json();
                  if (res.ok) toast.success(data.mensaje || 'Costos recalculados', { duration: 5000 });
                  else toast.error(data.error || 'Error al recalcular');
                  fetchRecetas();
                } catch { toast.error('Error de conexión'); }
              }}
              variant="outline"
              className="border-[#7B61FF]/40 text-[#7B61FF] hover:bg-[#7B61FF]/10"
              title="Recalcula el costo por porción de todas las recetas y lo propaga a sus productos"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Recalcular costos
            </Button>
            <Button
              onClick={() => { setSelectedReceta(null); setShowRecetaModal(true); }}
              className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:shadow-lg hover:shadow-[#00E5FF]/30"
            >
              <Plus className="w-5 h-5 mr-2" /> Nueva Receta
            </Button>
          </div>

          {recipes.length === 0 ? (
            <Card className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 border-[#00E5FF]/20">
              <CardContent className="p-12 text-center">
                <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-400 mb-2">No hay recetas registradas</h3>
                <Button onClick={() => { setSelectedReceta(null); setShowRecetaModal(true); }} className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] mt-4">
                  <Plus className="w-5 h-5 mr-2" /> Crear Primera Receta
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recipes.map((recipe, idx) => (
                <Card key={recipe.id || idx} className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 border-[#00E5FF]/20 hover:border-[#00E5FF]/50 transition-all">
                  <CardHeader className="bg-gradient-to-br from-[#1e64a7]/20 to-[#00E5FF]/10 border-b border-[#00E5FF]/10">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl text-white mb-1">{recipe.nombre}</CardTitle>
                        <p className="text-sm font-medium text-[#00E5FF]">{recipe.categoria || 'Sin categoría'}</p>
                      </div>
                      <Badge className={getDificultadBadge(recipe.dificultad)} variant="outline">
                        {getDificultadText(recipe.dificultad)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                      <div>
                        <p className="text-xs text-gray-400 font-bold uppercase">Costo/Porción</p>
                        <p className="text-lg font-black text-white">${recipe.costo_por_porcion?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-bold uppercase">Precio Venta</p>
                        <p className="text-lg font-black text-[#00E5FF]">${recipe.precio_sugerido?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-bold uppercase">Porciones</p>
                        <p className="text-lg font-black text-white">{recipe.porciones}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-bold uppercase">Tiempo</p>
                        <p className="text-lg font-black text-white">{recipe.tiempo_preparacion || 0}m</p>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-white/5">
                      <p className="text-xs text-gray-400 font-bold uppercase mb-2">
                        Ingredientes ({(recipe.ingredientes || recipe.receta_ingredientes)?.length || 0})
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {(recipe.ingredientes || recipe.receta_ingredientes)?.map((ing: any, idx: number) => {
                          const idBuscado = String(ing.insumo_id || ing.producto_id || ing.insumo?.id || ing.productos?.id);
                          const prodCatalogo = inventoryProducts.find(p => String(p.id) === idBuscado);
                          
                          const nombreTraducido = 
                            ing.insumo?.nombre || 
                            ing.productos?.nombre || 
                            ing.nombre_producto || 
                            prodCatalogo?.nombre || 
                            'Ingrediente no encontrado';

                          return (
                            <div key={idx} className="text-sm text-gray-300 flex justify-between bg-white/5 p-1 px-2 rounded mb-1">
                              <span className="font-bold text-white">{nombreTraducido}</span>
                              <span className="text-[#00E5FF] font-medium">{ing.cantidad} {ing.unidad_medida}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-3 border-t border-white/5">
                      <Button variant="outline" size="sm" className="flex-1 border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10" onClick={() => { setSelectedReceta(recipe); setShowProducirModal(true); }}>
                        <Factory className="w-4 h-4 mr-1" /> Producir
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 border-[#7B61FF]/30 text-[#7B61FF] hover:bg-[#7B61FF]/10" onClick={() => abrirEditorReceta(recipe.id)} disabled={loadingRecetaId === recipe.id}>
                        <Pencil className="w-4 h-4 mr-1" /> {loadingRecetaId === recipe.id ? 'Cargando...' : 'Editar'}
                      </Button>
                      <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => eliminarReceta(recipe.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'production' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10" onClick={() => {
                if (productionOrders.length === 0) return toast.error('No hay órdenes para exportar');
                exportOrdenesProduccionToPDF(productionOrders);
                toast.success('Órdenes exportadas a PDF');
              }}>
                <FileDown className="w-4 h-4 mr-2" /> Exportar PDF
              </Button>
              <Button variant="outline" size="sm" className="border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => {
                if (productionOrders.length === 0) return toast.error('No hay órdenes para exportar');
                exportOrdenesProduccionToExcel(productionOrders);
                toast.success('Órdenes exportadas a Excel');
              }}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel
              </Button>
            </div>
            <Button onClick={() => { setSelectedReceta(null); setShowProducirModal(true); }} className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]">
              <Plus className="w-5 h-5 mr-2" /> Nueva Orden
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {productionOrders.map((order, idx) => {
              const receta = order.receta || order.recetas || recipes.find((r: any) => r.id === order.receta_id) || null;
              const recetaNombre = receta?.nombre || 'Receta N/A';
              const ingredientes = receta ? (receta.ingredientes || receta.receta_ingredientes || []) : [];
              const porciones = receta?.porciones || 1;
              const factor = (order.cantidad_porciones || 1) / porciones;
              const [expanded, setExpanded] = [expandedOrders.has(order.id || idx), () => setExpandedOrders(prev => {
                const next = new Set(prev);
                if (next.has(order.id || idx)) next.delete(order.id || idx); else next.add(order.id || idx);
                return next;
              })];

              return (
                <Card key={order.id || idx} className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 border-[#00E5FF]/20">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold text-white">{recetaNombre}</h3>
                          <Badge className={`${order.estado === 'planificada' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : order.estado === 'en_proceso' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : order.estado === 'completada' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`} variant="outline">
                            {order.estado === 'planificada' ? 'Planificado' : order.estado === 'en_proceso' ? 'En Progreso' : order.estado === 'completada' ? 'Completado' : 'Cancelado'}
                          </Badge>
                          <span className="text-sm text-gray-400">{order.numero_orden}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-4">
                          <div>
                            <p className="text-xs text-gray-400 font-bold uppercase">Porciones</p>
                            <p className="text-lg font-black text-white">{order.cantidad_porciones}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 font-bold uppercase">Fecha</p>
                            <p className="text-lg font-black text-white">{new Date(order.fecha_programada).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 font-bold uppercase">Responsable</p>
                            <p className="text-sm text-gray-300">{order.usuarios?.nombre_completo || 'N/A'}</p>
                          </div>
                        </div>

                        {/* Ingredient toggle */}
                        <button
                          onClick={setExpanded}
                          className="mt-4 flex items-center gap-2 text-xs text-[#7B61FF] hover:text-[#9B81FF] transition-colors"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          {expanded ? 'Ocultar ingredientes' : `Ver ingredientes (${ingredientes.length})`}
                        </button>

                        {/* Expanded ingredients */}
                        {expanded && (
                          <div className="mt-3 bg-[#0A1A2F]/60 rounded-xl border border-[#7B61FF]/20 overflow-hidden">
                            {ingredientes.length === 0 ? (
                              <p className="text-gray-500 text-sm p-4">Esta receta no tiene ingredientes registrados.</p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-[#7B61FF]/20 text-[#7B61FF] text-xs uppercase tracking-wider">
                                    <th className="text-left px-4 py-2">Ingrediente</th>
                                    <th className="text-right px-4 py-2">Base ({porciones} uds.)</th>
                                    <th className="text-right px-4 py-2 text-white font-bold">Para {order.cantidad_porciones} uds.</th>
                                    <th className="text-left px-3 py-2">Unidad</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ingredientes.map((ing: any, i: number) => {
                                    const idBuscado = String(ing.insumo_id || ing.producto_id || ing.insumo?.id || ing.productos?.id);
                                    const prodCatalogo = inventoryProducts.find((p: any) => String(p.id) === idBuscado);
                                    const nombre = ing.insumo?.nombre || ing.productos?.nombre || ing.nombre_producto || prodCatalogo?.nombre || 'Ingrediente';
                                    const cantBase = Number(ing.cantidad) || 0;
                                    const cantEscalada = (cantBase * factor).toFixed(2);
                                    return (
                                      <tr key={i} className={`border-t border-white/5 ${i % 2 === 0 ? '' : 'bg-white/5'}`}>
                                        <td className="px-4 py-2 text-white font-medium">{nombre}</td>
                                        <td className="px-4 py-2 text-gray-400 text-right font-mono">{cantBase}</td>
                                        <td className="px-4 py-2 text-[#00E5FF] text-right font-mono font-bold">{cantEscalada}</td>
                                        <td className="px-3 py-2 text-gray-400">{ing.unidad_medida || '-'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 ml-6">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10"
                          onClick={() => exportOrdenesProduccionToPDF([order])}
                          title="Descargar PDF de esta orden"
                        >
                          <FileDown className="w-4 h-4" />
                        </Button>
                        {order.estado === 'planificada' && <Button className="bg-gradient-to-r from-orange-600 to-orange-500" onClick={() => cambiarEstadoOrden(order.id, 'en_proceso')}><Play className="w-4 h-4 mr-1" /> Iniciar</Button>}
                        {order.estado === 'en_proceso' && <Button className="bg-gradient-to-r from-green-600 to-green-500" onClick={() => cambiarEstadoOrden(order.id, 'completada')}><CheckCheck className="w-4 h-4 mr-1" /> Completar</Button>}
                        {order.estado !== 'completada' && order.estado !== 'cancelada' && <Button variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => cambiarEstadoOrden(order.id, 'cancelada')}><XCircle className="w-4 h-4 mr-1" /> Cancelar</Button>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {view === 'reports' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => exportReporteKDSToPDF(stats, comandas)} className="border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10">
              <FileDown className="w-4 h-4 mr-2" /> Exportar Reporte
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 border-[#00E5FF]/20"><CardContent className="p-6"><p className="text-gray-400 text-sm mb-2">Total Comandas</p><p className="text-3xl font-black text-white">{comandas.length}</p></CardContent></Card>
            <Card className="bg-gradient-to-br from-orange-900/20 to-orange-800/10 border-orange-500/30"><CardContent className="p-6"><p className="text-orange-400 text-sm mb-2">Pendientes</p><p className="text-3xl font-black text-orange-400">{stats.pendientes}</p></CardContent></Card>
            <Card className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-blue-500/30"><CardContent className="p-6"><p className="text-blue-400 text-sm mb-2">En Preparación</p><p className="text-3xl font-black text-blue-400">{stats.enPreparacion}</p></CardContent></Card>
            <Card className="bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-500/30"><CardContent className="p-6"><p className="text-green-400 text-sm mb-2">Completadas</p><p className="text-3xl font-black text-green-400">{stats.listas}</p></CardContent></Card>
          </div>
        </div>
      )}

      {showRecetaModal && (
        <RecetaModal
          key={selectedReceta?.id ?? 'nueva-receta'}
          isOpen={showRecetaModal}
          onClose={() => { setShowRecetaModal(false); setSelectedReceta(null); }}
          onSuccess={() => { fetchRecetas(); setShowRecetaModal(false); setSelectedReceta(null); }}
          receta={selectedReceta}
        />
      )}
      {showProducirModal && (
        <ProducirModal
          isOpen={showProducirModal}
          onClose={() => { setShowProducirModal(false); setSelectedReceta(null); }}
          onSuccess={() => { fetchOrdenesProduccion(); setShowProducirModal(false); setSelectedReceta(null); }}
          recetaPreseleccionada={selectedReceta}
        />
      )}
    </div>
  );
}