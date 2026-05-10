import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBodega } from '../context/BodegaContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  Package, 
  Plus, 
  AlertCircle, 
  TrendingDown, 
  Search, 
  Warehouse,
  BarChart3,
  ArrowLeftRight,
  Calculator,
  TrendingUp,
  Download,
  ShoppingCart,
  Edit2,
  Trash2,
  Building2,
  Truck,
  Calendar,
  RefreshCw,
  DollarSign,
  Boxes
} from 'lucide-react';
import { ExportButtons } from '../components/ExportButtons';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';
import { ProductoModal } from '../components/inventario/ProductoModal';
import { ProveedorModal } from '../components/inventario/ProveedorModal';
import { BodegaModal } from '../components/inventario/BodegaModal';
import { MovimientoModal } from '../components/inventario/MovimientoModal';
import { DeleteConfirmationModal } from '../components/shared/DeleteConfirmationModal';

export default function Inventario() {
  const { token, logout } = useAuth();
  const { bodegaActiva } = useBodega();
  
  // Helper para obtener headers de autenticación correctos
  const getAuthHeaders = async () => {
    const { publicAnonKey } = await import('/utils/supabase/info');
    return {
      'Authorization': `Bearer ${publicAnonKey}`,
      'X-User-Token': token || '',
    };
  };
  
  // Estados de datos
  const [inventario, setInventario] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [centrosCostos, setCentrosCostos] = useState<any[]>([]);
  const [compras, setCompras] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  
  // Estados de UI
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'inventory' | 'products' | 'warehouses' | 'suppliers' | 'movements' | 'purchases' | 'costcenters' | 'analysis' | 'expiry'>('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [filterLevel, setFilterLevel] = useState<'all' | 'critical' | 'low' | 'normal'>('all');
  
  // Estados de modales
  const [showProductoModal, setShowProductoModal] = useState(false);
  const [showProveedorModal, setShowProveedorModal] = useState(false);
  const [showBodegaModal, setShowBodegaModal] = useState(false);
  const [showMovimientoModal, setShowMovimientoModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [deleteType, setDeleteType] = useState<'producto' | 'proveedor' | 'bodega'>('producto');

  // Estados de compras
  const [showCompraForm, setShowCompraForm] = useState(false);
  const [compraSubmitting, setCompraSubmitting] = useState(false);
  const [compraForm, setCompraForm] = useState({ proveedor_id: '', fecha: new Date().toISOString().split('T')[0], numero_factura: '', observaciones: '' });
  const [compraItems, setCompraItems] = useState<any[]>([{ producto_id: '', cantidad: '', costo_total: '' }]);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    await Promise.all([
      fetchInventario(),
      fetchProductos(),
      fetchBodegas(),
      fetchProveedores(),
      fetchCategorias(),
      fetchMovimientos(),
      fetchCentrosCostos(),
      fetchCompras(),
      fetchLotes()
    ]);
  };

  // =====================================================
  // FUNCIONES DE CARGA DE DATOS (SIN FILTROS QUE CENSURAN)
  // =====================================================

  const fetchInventario = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/inventario`,
        { headers }
      );
      
      if (response.status === 401) {
        toast.error('⚠️ Sesión expirada. Por favor inicie sesión nuevamente.');
        logout();
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        // ✅ Carga todos los datos reales sin censurar
        setInventario(data.inventario || []);
      }
    } catch (error) {
      console.error('Error cargando inventario:', error);
    }
  };

  const fetchProductos = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/productos`,
        { headers }
      );
      
      if (response.status === 401) {
        toast.error('⚠️ Sesión expirada. Por favor inicie sesión nuevamente.');
        logout();
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        // ✅ Carga todos los productos reales sin censurar
        setProductos(data.productos || []);
      } else {
        const errorData = await response.json();
        toast.error(`Error al cargar productos: ${errorData.error || 'Error desconocido'}`);
      }
    } catch (error) {
      toast.error('Error al cargar productos');
    }
  };

  const fetchBodegas = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/bodegas`,
        { headers }
      );
      
      if (response.status === 401) {
        logout();
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        setBodegas(data.bodegas || []);
      }
    } catch (error) {
      console.error('Error cargando bodegas:', error);
    }
  };

  const fetchProveedores = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/proveedores`,
        { headers }
      );
      
      if (response.ok) {
        const data = await response.json();
        setProveedores(data.proveedores || []);
      }
    } catch (error) {
      console.error('Error cargando proveedores:', error);
    }
  };

  const fetchCategorias = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/categorias`,
        { headers }
      );

      if (response.status === 401) {
        logout();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        const categoriasLimpias = data.categorias || [];
        
        // ✅ Carga todas las categorías sin censurar
        if (categoriasLimpias.length === 0) {
          await inicializarCategorias();
          return;
        }
        
        setCategorias(categoriasLimpias);
      } else {
        await inicializarCategorias();
      }
    } catch (error) {
      await inicializarCategorias();
    }
  };

  const inicializarCategorias = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/categorias/inicializar`,
        { method: 'POST', headers }
      );
      
      if (response.ok || response.status === 409 || response.status === 200) {
        const reloadResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/categorias`,
          { headers }
        );
        
        if (reloadResponse.ok) {
          const reloadData = await reloadResponse.json();
          setCategorias(reloadData.categorias || []);
        }
      }
    } catch (error) {
      console.error('Error inicializando categorías:', error);
    }
  };

  const fetchMovimientos = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/inventario/movimientos`, { headers });
      if (response.ok) {
        const data = await response.json();
        setMovimientos(data.movimientos || []);
      }
    } catch (error) {}
  };

  const fetchCentrosCostos = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/centros-costos`, { headers });
      if (response.ok) {
        const data = await response.json();
        setCentrosCostos(data.centros_costos || []);
      }
    } catch (error) {}
  };

  const fetchCompras = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/compras`, { headers });
      if (response.ok) {
        const data = await response.json();
        setCompras(data.compras || []);
      }
    } catch (error) {}
  };

  const fetchLotes = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/inventario/lotes`, { headers });
      if (response.ok) {
        const data = await response.json();
        setLotes(data.lotes || []);
      }
    } catch (error) {}
  };

  // Sync product stock_actual to active bodega after saving a product
  const sincronizarStockProductoEnBodega = async (productoNombre: string, stockActual: number) => {
    if (!bodegaActiva || !productoNombre || !stockActual) return;
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/stock/bodega/${bodegaActiva.id}/ajustar`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            producto_nombre: productoNombre,
            cantidad: stockActual,
            tipo: 'ajuste',
            motivo: 'Stock inicial desde inventario',
          }),
        }
      );
    } catch (err) {
      console.error('Error sincronizando stock en bodega:', err);
    }
  };

  // =====================================================
  // FUNCIONES DE ELIMINACIÓN
  // =====================================================

  const handleDeleteProducto = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este producto?')) return;

    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/productos/${id}`,
        { method: 'DELETE', headers }
      );

      if (response.ok) {
        toast.success('Producto eliminado');
        fetchProductos();
        fetchInventario();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error al eliminar producto');
      }
    } catch (error) {
      toast.error('Error al eliminar producto');
    }
  };

  const handleDeleteProveedor = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este proveedor?')) return;

    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/proveedores/${id}`,
        { method: 'DELETE', headers }
      );

      if (response.ok) {
        toast.success('Proveedor eliminado');
        fetchProveedores();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error al eliminar proveedor');
      }
    } catch (error) {
      toast.error('Error al eliminar proveedor');
    }
  };

  const handleDeleteBodega = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta bodega?')) return;

    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/bodegas/${id}`,
        { method: 'DELETE', headers }
      );

      if (response.ok) {
        toast.success('Bodega eliminada');
        fetchBodegas();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error al eliminar bodega');
      }
    } catch (error) {
      toast.error('Error al eliminar bodega');
    }
  };

  // =====================================================
  // FUNCIONES AUXILIARES
  // =====================================================

  const getNivelAlerta = (stockActual: number, stockMinimo: number) => {
    if (stockActual <= stockMinimo) return 'CRÍTICO';
    if (stockActual <= stockMinimo * 1.5) return 'BAJO';
    return 'NORMAL';
  };

  const getBadgeColor = (nivel: string) => {
    switch (nivel) {
      case 'CRÍTICO': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'BAJO': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-green-500/20 text-green-400 border-green-500/30';
    }
  };

  const filteredInventario = useMemo(() => {
    return inventario
      .filter(item => {
        if (selectedWarehouse !== 'all' && item.bodega_id !== selectedWarehouse) return false;
        if (filterLevel === 'all') return true;
        const nivel = getNivelAlerta(item.stock_actual, item.stock_minimo);
        return nivel === filterLevel.toUpperCase();
      })
      .filter(item => {
        if (!searchTerm) return true;
        const producto = item.productos?.nombre || '';
        return producto.toLowerCase().includes(searchTerm.toLowerCase());
      });
  }, [inventario, selectedWarehouse, filterLevel, searchTerm]);

  const inventarioMetrics = useMemo(() => {
    const stockBajo = inventario.filter(i => getNivelAlerta(i.stock_actual, i.stock_minimo) === 'BAJO').length;
    const stockCritico = inventario.filter(i => getNivelAlerta(i.stock_actual, i.stock_minimo) === 'CRÍTICO').length;
    const valorTotal = inventario.reduce((sum, i) => sum + (i.stock_actual * (i.costo_promedio || 0)), 0);
    
    return {
      totalProductos: inventario.length,
      stockBajo,
      stockCritico,
      valorTotal
    };
  }, [inventario]);

  // =====================================================
  // COMPRAS
  // =====================================================

  const addCompraItem = () => setCompraItems(prev => [...prev, { producto_id: '', cantidad: '', costo_total: '' }]);

  const removeCompraItem = (idx: number) => setCompraItems(prev => prev.filter((_, i) => i !== idx));

  const updateCompraItem = (idx: number, field: string, value: string) => {
    setCompraItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const submitCompra = async () => {
    const itemsValidos = compraItems.filter(i => i.producto_id && Number(i.cantidad) > 0 && Number(i.costo_total) > 0);
    if (itemsValidos.length === 0) return toast.error('Agrega al menos un ítem con cantidad y costo válidos');

    setCompraSubmitting(true);
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/compras`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...compraForm,
          items: itemsValidos.map(i => ({
            producto_id: i.producto_id,
            cantidad: Number(i.cantidad),
            costo_total: Number(i.costo_total),
            costo_unitario: Number(i.costo_total) / Number(i.cantidad)
          }))
        })
      });
      if (response.ok) {
        toast.success('Compra registrada y stock actualizado');
        setShowCompraForm(false);
        setCompraForm({ proveedor_id: '', fecha: new Date().toISOString().split('T')[0], numero_factura: '', observaciones: '' });
        setCompraItems([{ producto_id: '', cantidad: '', costo_total: '' }]);
        fetchCompras();
        fetchProductos();
        fetchInventario();
      } else {
        const err = await response.json();
        toast.error(err.error || 'Error al registrar compra');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setCompraSubmitting(false);
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Gestión de Inventario</h1>
          <p className="text-gray-400">Control completo de stock, bodegas y movimientos</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons
            variant="compact"
            onExportExcel={() => exportToExcel(
              productos.map(p => ({
                'Nombre': p.nombre,
                'Categoría': p.categoria || 'N/A',
                'Stock Actual': p.stock_actual ?? 0,
                'Stock Mínimo': p.stock_minimo ?? 0,
                'Unidad': p.unidad_medida || 'und',
                'Precio Compra': p.precio_compra ?? 0,
                'Precio Venta': p.precio_venta ?? 0,
                'Estado': (p.stock_actual ?? 0) <= (p.stock_minimo ?? 0) ? 'Stock Bajo' : 'Normal',
              })),
              'inventario_reporte',
              'Inventario',
            )}
            onExportPDF={() => exportToPDF(
              productos,
              [
                { header: 'Producto', key: 'nombre' },
                { header: 'Categoría', key: 'categoria' },
                { header: 'Stock', key: 'stock_actual' },
                { header: 'Mín.', key: 'stock_minimo' },
                { header: 'Unidad', key: 'unidad_medida' },
                { header: 'P. Compra', key: 'precio_compra' },
              ],
              'Reporte de Inventario',
              'inventario_reporte',
            )}
          />
          <Button
            onClick={() => setShowMovimientoModal(true)}
            className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Movimiento de Inventario
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Productos</CardTitle>
            <Package className="w-5 h-5 text-[#00E5FF]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{inventarioMetrics.totalProductos}</div>
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#7B61FF]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Bodegas</CardTitle>
            <Warehouse className="w-5 h-5 text-[#7B61FF]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{bodegas.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-orange-500/20 border-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Stock Bajo</CardTitle>
            <TrendingDown className="w-5 h-5 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-400">{inventarioMetrics.stockBajo}</div>
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-red-500/20 border-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Stock Crítico</CardTitle>
            <AlertCircle className="w-5 h-5 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">{inventarioMetrics.stockCritico}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de navegación */}
      <div className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 rounded-xl shadow-lg border border-[#00E5FF]/20 p-2 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setView('inventory')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'inventory'
              ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Package className="w-5 h-5" /> Inventario
        </button>
        <button
          onClick={() => setView('products')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'products'
              ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Boxes className="w-5 h-5" /> Productos
        </button>
        <button
          onClick={() => setView('warehouses')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'warehouses'
              ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Warehouse className="w-5 h-5" /> Bodegas
        </button>
        <button
          onClick={() => setView('suppliers')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'suppliers'
              ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Truck className="w-5 h-5" /> Proveedores
        </button>
        <button
          onClick={() => setView('movements')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'movements'
              ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <ArrowLeftRight className="w-5 h-5" /> Movimientos
        </button>
        <button
          onClick={() => setView('purchases')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'purchases'
              ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <ShoppingCart className="w-5 h-5" /> Compras
        </button>
        <button
          onClick={() => setView('analysis')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'analysis'
              ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <BarChart3 className="w-5 h-5" /> Análisis
        </button>
      </div>

      {/* Contenido principal */}
      <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-white">
              {view === 'inventory' && 'Stock por Bodega'}
              {view === 'products' && 'Catálogo de Productos'}
              {view === 'warehouses' && 'Gestión de Bodegas'}
              {view === 'suppliers' && 'Proveedores'}
              {view === 'movements' && 'Movimientos de Inventario'}
              {view === 'purchases' && 'Registro de Compras'}
              {view === 'analysis' && 'Análisis de Inventario'}
            </CardTitle>
            <div className="flex gap-2">
              <Button 
                onClick={() => loadAllData()}
                variant="outline" 
                size="sm"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Actualizar
              </Button>
              
              {view === 'products' && (
                <Button 
                  onClick={() => {
                    setEditingItem(null);
                    setShowProductoModal(true);
                  }}
                  className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Producto
                </Button>
              )}
              
              {view === 'warehouses' && (
                <Button 
                  onClick={() => {
                    setEditingItem(null);
                    setShowBodegaModal(true);
                  }}
                  className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nueva Bodega
                </Button>
              )}
              
              {view === 'suppliers' && (
                <Button 
                  onClick={() => {
                    setEditingItem(null);
                    setShowProveedorModal(true);
                  }}
                  className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Proveedor
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Vista de Inventario */}
          {view === 'inventory' && (
            <div className="space-y-4">
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar producto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-white/5 border-[#00E5FF]/20 text-white"
                  />
                </div>
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="w-48 bg-white/5 border-[#00E5FF]/20 text-white">
                    <SelectValue placeholder="Todas las bodegas" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                    <SelectItem value="all">Todas las bodegas</SelectItem>
                    {bodegas.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterLevel} onValueChange={(v: any) => setFilterLevel(v)}>
                  <SelectTrigger className="w-48 bg-white/5 border-[#00E5FF]/20 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                    <SelectItem value="all">Todos los niveles</SelectItem>
                    <SelectItem value="critical">Solo críticos</SelectItem>
                    <SelectItem value="low">Solo bajos</SelectItem>
                    <SelectItem value="normal">Solo normales</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="border-[#00E5FF]/20 hover:bg-white/5">
                    <TableHead className="text-gray-400">Producto</TableHead>
                    <TableHead className="text-gray-400">Bodega</TableHead>
                    <TableHead className="text-gray-400 text-right">Stock Actual</TableHead>
                    <TableHead className="text-gray-400 text-right">Stock Mín</TableHead>
                    <TableHead className="text-gray-400 text-right">Stock Máx</TableHead>
                    <TableHead className="text-gray-400 text-right">Costo Prom.</TableHead>
                    <TableHead className="text-gray-400 text-right">Valor Total</TableHead>
                    <TableHead className="text-gray-400">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventario.map((item) => {
                    const nivel = getNivelAlerta(item.stock_actual, item.stock_minimo);
                    const valorTotal = item.stock_actual * (item.costo_promedio || 0);
                    
                    return (
                      <TableRow key={item.id} className="border-[#00E5FF]/10 hover:bg-white/5">
                        <TableCell className="text-white">
                          <div>
                            <div className="font-medium">{item.productos?.nombre || 'N/A'}</div>
                            <div className="text-sm text-gray-400">{item.productos?.codigo || ''}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-300">{item.bodegas?.nombre || 'N/A'}</TableCell>
                        <TableCell className="text-white text-right font-bold">{item.stock_actual}</TableCell>
                        <TableCell className="text-gray-400 text-right">{item.stock_minimo}</TableCell>
                        <TableCell className="text-gray-400 text-right">{item.stock_maximo || '-'}</TableCell>
                        <TableCell className="text-white text-right">${(item.costo_promedio || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-[#00E5FF] text-right font-bold">${valorTotal.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge className={getBadgeColor(nivel)}>
                            {nivel}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredInventario.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                        No hay datos de inventario disponibles
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Vista de Productos */}
          {view === 'products' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <Input
                  placeholder="Buscar producto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white/5 border-[#00E5FF]/20 text-white flex-1 max-w-md"
                />
                <div className="text-gray-400 text-sm">
                  Total de productos: <span className="text-[#00E5FF] font-bold">{productos.length}</span>
                </div>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow className="border-[#00E5FF]/20 hover:bg-white/5">
                    <TableHead className="text-gray-400">Código</TableHead>
                    <TableHead className="text-gray-400">Nombre</TableHead>
                    <TableHead className="text-gray-400">Categoría</TableHead>
                    <TableHead className="text-gray-400 text-right">Precio Compra</TableHead>
                    <TableHead className="text-gray-400 text-right">Precio Venta</TableHead>
                    <TableHead className="text-gray-400">Estado</TableHead>
                    <TableHead className="text-gray-400 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos
                    .filter(p => p.nombre?.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((producto) => (
                      <TableRow key={producto.id} className="border-[#00E5FF]/10 hover:bg-white/5">
                        <TableCell className="text-white font-mono">{producto.codigo}</TableCell>
                        <TableCell className="text-white font-medium">{producto.nombre}</TableCell>
                        <TableCell className="text-gray-300">{producto.categorias?.nombre || '-'}</TableCell>
                        <TableCell className="text-white text-right">${producto.precio_compra?.toFixed(2) || '0.00'}</TableCell>
                        <TableCell className="text-[#00E5FF] text-right font-bold">${producto.precio_venta?.toFixed(2) || '0.00'}</TableCell>
                        <TableCell>
                          <Badge className={producto.disponible ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                            {producto.disponible ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingItem(producto);
                                setShowProductoModal(true);
                              }}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => {
                                setDeleteItem(producto);
                                setDeleteType('producto');
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  {productos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                        No hay productos registrados. Haz clic en "Nuevo Producto" para comenzar.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Vista de Bodegas */}
          {view === 'warehouses' && (
            <Table>
              <TableHeader>
                <TableRow className="border-[#00E5FF]/20 hover:bg-white/5">
                  <TableHead className="text-gray-400">Código</TableHead>
                  <TableHead className="text-gray-400">Nombre</TableHead>
                  <TableHead className="text-gray-400">Tipo</TableHead>
                  <TableHead className="text-gray-400">Dirección</TableHead>
                  <TableHead className="text-gray-400">Estado</TableHead>
                  <TableHead className="text-gray-400 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bodegas.map((bodega) => (
                  <TableRow key={bodega.id} className="border-[#00E5FF]/10 hover:bg-white/5">
                    <TableCell className="text-white font-mono">{bodega.codigo}</TableCell>
                    <TableCell className="text-white font-medium">{bodega.nombre}</TableCell>
                    <TableCell className="text-gray-300 capitalize">{bodega.tipo}</TableCell>
                    <TableCell className="text-gray-400">{bodega.direccion || '-'}</TableCell>
                    <TableCell>
                      <Badge className={bodega.activa ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                        {bodega.activa ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingItem(bodega);
                            setShowBodegaModal(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => {
                            setDeleteItem(bodega);
                            setDeleteType('bodega');
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {bodegas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                      No hay bodegas registradas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {/* Vista de Proveedores */}
          {view === 'suppliers' && (
            <Table>
              <TableHeader>
                <TableRow className="border-[#00E5FF]/20 hover:bg-white/5">
                  <TableHead className="text-gray-400">RUC/NIT</TableHead>
                  <TableHead className="text-gray-400">Nombre</TableHead>
                  <TableHead className="text-gray-400">Email</TableHead>
                  <TableHead className="text-gray-400">Teléfono</TableHead>
                  <TableHead className="text-gray-400 text-right">Días Crédito</TableHead>
                  <TableHead className="text-gray-400 text-right">Límite Crédito</TableHead>
                  <TableHead className="text-gray-400">Estado</TableHead>
                  <TableHead className="text-gray-400 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proveedores.map((proveedor) => (
                  <TableRow key={proveedor.id} className="border-[#00E5FF]/10 hover:bg-white/5">
                    <TableCell className="text-white font-mono">{proveedor.ruc_nit}</TableCell>
                    <TableCell className="text-white font-medium">{proveedor.nombre}</TableCell>
                    <TableCell className="text-gray-300">{proveedor.email || '-'}</TableCell>
                    <TableCell className="text-gray-300">{proveedor.telefono || '-'}</TableCell>
                    <TableCell className="text-white text-right">{proveedor.dias_credito || 0}</TableCell>
                    <TableCell className="text-[#00E5FF] text-right font-bold">${(proveedor.limite_credito || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={proveedor.activo ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                        {proveedor.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingItem(proveedor);
                            setShowProveedorModal(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => {
                            setDeleteItem(proveedor);
                            setDeleteType('proveedor');
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {proveedores.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                      No hay proveedores registrados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {/* Vista de Movimientos */}
          {view === 'movements' && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#00E5FF]/20 hover:bg-white/5">
                    <TableHead className="text-gray-400">Fecha</TableHead>
                    <TableHead className="text-gray-400">Tipo</TableHead>
                    <TableHead className="text-gray-400">Producto</TableHead>
                    <TableHead className="text-gray-400">Bodega</TableHead>
                    <TableHead className="text-gray-400 text-right">Cantidad</TableHead>
                    <TableHead className="text-gray-400 text-right">Costo Unit.</TableHead>
                    <TableHead className="text-gray-400">Referencia</TableHead>
                    <TableHead className="text-gray-400">Usuario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.slice(0, 50).map((mov) => (
                    <TableRow key={mov.id} className="border-[#00E5FF]/10 hover:bg-white/5">
                      <TableCell className="text-gray-300">
                        {new Date(mov.created_at || mov.fecha).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          mov.tipo === 'entrada' ? 'bg-green-500/20 text-green-400' :
                          mov.tipo === 'salida' ? 'bg-red-500/20 text-red-400' :
                          mov.tipo === 'transferencia' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-orange-500/20 text-orange-400'
                        }>
                          {mov.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white">{mov.productos?.nombre || 'N/A'}</TableCell>
                      <TableCell className="text-gray-300">{mov.bodegas?.nombre || 'N/A'}</TableCell>
                      <TableCell className="text-white text-right font-bold">{mov.cantidad}</TableCell>
                      <TableCell className="text-white text-right">${(mov.costo_unitario || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-gray-400">{mov.referencia || '-'}</TableCell>
                      <TableCell className="text-gray-300">{mov.usuarios?.nombre_completo || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {movimientos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                        No hay movimientos registrados
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Vista de Compras */}
          {view === 'purchases' && (
            <div className="space-y-4">
              {!showCompraForm ? (
                <>
                  <div className="flex justify-end">
                    <Button onClick={() => setShowCompraForm(true)} className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]">
                      <Plus className="w-4 h-4 mr-2" /> Nueva Compra
                    </Button>
                  </div>

                  {/* Lista de compras */}
                  {compras.length === 0 ? (
                    <div className="text-center text-gray-400 py-12">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
                      <p>No hay compras registradas</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[#00E5FF]/20">
                          <TableHead className="text-gray-400">Fecha</TableHead>
                          <TableHead className="text-gray-400">Factura</TableHead>
                          <TableHead className="text-gray-400">Proveedor</TableHead>
                          <TableHead className="text-gray-400">Ítems</TableHead>
                          <TableHead className="text-gray-400 text-right">Total Compra</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {compras.map((compra) => (
                          <TableRow key={compra.id} className="border-[#00E5FF]/10 hover:bg-white/5">
                            <TableCell className="text-gray-300">{new Date(compra.fecha || compra.created_at).toLocaleDateString('es-EC')}</TableCell>
                            <TableCell className="text-white font-mono">{compra.numero_factura || '—'}</TableCell>
                            <TableCell className="text-gray-300">{compra.proveedor?.nombre || '—'}</TableCell>
                            <TableCell className="text-gray-400">{(compra.items || []).length} producto(s)</TableCell>
                            <TableCell className="text-[#00E5FF] font-bold text-right">${(compra.total_compra || 0).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              ) : (
                /* Formulario de nueva compra */
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-semibold text-lg">Nueva Compra</h3>
                    <Button variant="ghost" onClick={() => setShowCompraForm(false)} className="text-gray-400 hover:text-white">Cancelar</Button>
                  </div>

                  {/* Datos generales */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm text-gray-400">Proveedor</label>
                      <Select value={compraForm.proveedor_id} onValueChange={v => setCompraForm(f => ({ ...f, proveedor_id: v }))}>
                        <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30 text-white">
                          {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-gray-400">Fecha de compra</label>
                      <Input type="date" value={compraForm.fecha} onChange={e => setCompraForm(f => ({ ...f, fecha: e.target.value }))} className="bg-white/5 border-[#00E5FF]/20 text-white" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-gray-400">N° Factura (opcional)</label>
                      <Input value={compraForm.numero_factura} onChange={e => setCompraForm(f => ({ ...f, numero_factura: e.target.value }))} className="bg-white/5 border-[#00E5FF]/20 text-white" placeholder="001-001-000001" />
                    </div>
                  </div>

                  {/* Tabla de ítems */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-[#00E5FF] font-semibold">Productos comprados</label>
                      <Button type="button" size="sm" variant="ghost" onClick={addCompraItem} className="text-[#00E5FF] hover:bg-[#00E5FF]/10">
                        <Plus className="w-4 h-4 mr-1" /> Agregar ítem
                      </Button>
                    </div>

                    <div className="rounded-lg border border-[#00E5FF]/20 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-[#00E5FF]/20 bg-white/5">
                            <TableHead className="text-gray-400">Producto</TableHead>
                            <TableHead className="text-gray-400 w-32">Cantidad</TableHead>
                            <TableHead className="text-gray-400 w-36">Costo Total ($)</TableHead>
                            <TableHead className="text-gray-400 w-36">Costo por unidad</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {compraItems.map((item, idx) => {
                            const costoUnit = Number(item.cantidad) > 0 && Number(item.costo_total) > 0
                              ? (Number(item.costo_total) / Number(item.cantidad))
                              : 0;
                            const prod = productos.find(p => p.id === item.producto_id);
                            return (
                              <TableRow key={idx} className="border-[#00E5FF]/10">
                                <TableCell>
                                  <Select value={item.producto_id} onValueChange={v => updateCompraItem(idx, 'producto_id', v)}>
                                    <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white h-8 text-sm">
                                      <SelectValue placeholder="Seleccionar producto..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30 text-white">
                                      {productos.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number" min="0" step="0.001"
                                    value={item.cantidad}
                                    onChange={e => updateCompraItem(idx, 'cantidad', e.target.value)}
                                    className="bg-white/5 border-[#00E5FF]/20 text-white h-8 text-sm"
                                    placeholder="0"
                                  />
                                  {prod?.unidad_medida && <span className="text-xs text-gray-500 mt-0.5 block">{prod.unidad_medida}</span>}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number" min="0" step="0.01"
                                    value={item.costo_total}
                                    onChange={e => updateCompraItem(idx, 'costo_total', e.target.value)}
                                    className="bg-white/5 border-[#00E5FF]/20 text-white h-8 text-sm"
                                    placeholder="0.00"
                                  />
                                </TableCell>
                                <TableCell>
                                  <span className={`text-sm font-bold ${costoUnit > 0 ? 'text-[#00E5FF]' : 'text-gray-500'}`}>
                                    {costoUnit > 0 ? `$${costoUnit.toFixed(4)}` : '—'}
                                  </span>
                                  {prod?.unidad_medida && costoUnit > 0 && (
                                    <span className="text-xs text-gray-500 block">por {prod.unidad_medida}</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Button type="button" size="sm" variant="ghost" onClick={() => removeCompraItem(idx)} className="text-red-400 hover:text-red-300 h-8 w-8 p-0" disabled={compraItems.length === 1}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Total */}
                    <div className="flex justify-end">
                      <div className="bg-[#00E5FF]/10 border border-[#00E5FF]/30 rounded-lg px-6 py-3 text-right">
                        <span className="text-gray-400 text-sm">Total de compra</span>
                        <div className="text-[#00E5FF] text-2xl font-bold">
                          ${compraItems.reduce((sum, i) => sum + (Number(i.costo_total) || 0), 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm text-gray-400">Observaciones</label>
                    <Input value={compraForm.observaciones} onChange={e => setCompraForm(f => ({ ...f, observaciones: e.target.value }))} className="bg-white/5 border-[#00E5FF]/20 text-white" placeholder="Notas adicionales..." />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => setShowCompraForm(false)} className="flex-1 border-[#00E5FF]/20 text-gray-300">Cancelar</Button>
                    <Button onClick={submitCompra} disabled={compraSubmitting} className="flex-1 bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white font-bold">
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      {compraSubmitting ? 'Registrando...' : 'Registrar Compra'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Vista de Análisis */}
          {view === 'analysis' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-white/5 border-[#00E5FF]/20">
                  <CardHeader>
                    <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Valorización Total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#00E5FF]">
                      ${inventarioMetrics.valorTotal.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-orange-500/20">
                  <CardHeader>
                    <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Productos Bajo Mínimo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-400">
                      {inventarioMetrics.stockBajo + inventarioMetrics.stockCritico}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-[#7B61FF]/20">
                  <CardHeader>
                    <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Total Movimientos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#7B61FF]">
                      {movimientos.length}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Gráficos */}
              {(() => {
                // Distribución por estado de stock
                const total = productos.length || 1;
                const criticos = productos.filter(p => (p.stock_actual ?? 0) === 0).length;
                const bajos = productos.filter(p => (p.stock_actual ?? 0) > 0 && (p.stock_actual ?? 0) <= (p.stock_minimo ?? 0)).length;
                const normales = total - criticos - bajos;

                const estadoData = [
                  { name: 'Normal', value: normales, color: '#00E5FF' },
                  { name: 'Bajo mínimo', value: bajos, color: '#F59E0B' },
                  { name: 'Sin stock', value: criticos, color: '#EF4444' },
                ];

                // Top 10 productos por valor de inventario
                const topProductos = [...productos]
                  .map(p => ({
                    nombre: (p.nombre || '').length > 20 ? p.nombre.substring(0, 18) + '…' : (p.nombre || ''),
                    valor: (p.stock_actual ?? 0) * (p.precio_compra ?? 0),
                    stock: p.stock_actual ?? 0,
                  }))
                  .filter(p => p.valor > 0)
                  .sort((a, b) => b.valor - a.valor)
                  .slice(0, 10);

                // Movimientos por tipo
                const tipoCount: Record<string, number> = {};
                movimientos.forEach((m: any) => { tipoCount[m.tipo] = (tipoCount[m.tipo] || 0) + 1; });
                const movData = Object.entries(tipoCount).map(([name, value]) => ({ name, value }));

                // Top 10 productos por stock
                const topStock = [...productos]
                  .sort((a, b) => (b.stock_actual ?? 0) - (a.stock_actual ?? 0))
                  .slice(0, 10)
                  .map(p => ({
                    nombre: (p.nombre || '').length > 18 ? p.nombre.substring(0, 16) + '…' : (p.nombre || ''),
                    stock: p.stock_actual ?? 0,
                    minimo: p.stock_minimo ?? 0,
                  }));

                const COLORS = ['#00E5FF', '#F59E0B', '#EF4444', '#7B61FF', '#10B981'];

                return (
                  <div className="space-y-6">
                    {/* Fila 1: Donut + Movimientos por tipo */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Estado del stock */}
                      <div className="bg-white/5 border border-[#00E5FF]/20 rounded-xl p-5">
                        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                          <Package className="w-4 h-4 text-[#00E5FF]" /> Estado del Stock
                        </h3>
                        <div className="flex items-center gap-6">
                          <div className="w-36 h-36">
                            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                              {(() => {
                                let offset = 0;
                                return estadoData.map((s, i) => {
                                  const pct = (s.value / total) * 100;
                                  const el = (
                                    <circle
                                      key={i}
                                      cx="50" cy="50" r="40"
                                      fill="none"
                                      stroke={s.color}
                                      strokeWidth="18"
                                      strokeDasharray={`${pct * 2.513} 251.3`}
                                      strokeDashoffset={-offset * 2.513}
                                    />
                                  );
                                  offset += pct;
                                  return el;
                                });
                              })()}
                              <circle cx="50" cy="50" r="28" fill="#0A1A2F" />
                            </svg>
                          </div>
                          <div className="space-y-2 flex-1">
                            {estadoData.map(s => (
                              <div key={s.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                                  <span className="text-sm text-gray-300">{s.name}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-white font-bold">{s.value}</span>
                                  <span className="text-gray-500 text-xs ml-1">({Math.round(s.value / total * 100)}%)</span>
                                </div>
                              </div>
                            ))}
                            <div className="border-t border-white/10 pt-2 mt-2 flex justify-between">
                              <span className="text-gray-400 text-sm">Total productos</span>
                              <span className="text-white font-bold">{total}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Movimientos por tipo */}
                      <div className="bg-white/5 border border-[#00E5FF]/20 rounded-xl p-5">
                        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                          <ArrowLeftRight className="w-4 h-4 text-[#00E5FF]" /> Movimientos por Tipo
                        </h3>
                        {movData.length === 0 ? (
                          <div className="flex items-center justify-center h-28 text-gray-500 text-sm">Sin movimientos registrados</div>
                        ) : (
                          <div className="space-y-3">
                            {movData.map((m, i) => {
                              const max = Math.max(...movData.map(x => x.value));
                              const pct = Math.round((m.value / max) * 100);
                              const colors = ['#00E5FF', '#10B981', '#F59E0B', '#7B61FF'];
                              return (
                                <div key={m.name} className="space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-300 capitalize">{m.name}</span>
                                    <span className="text-white font-bold">{m.value}</span>
                                  </div>
                                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Top 10 por valor de inventario */}
                    <div className="bg-white/5 border border-[#00E5FF]/20 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-[#00E5FF]" /> Top 10 — Mayor Valor en Inventario
                      </h3>
                      {topProductos.length === 0 ? (
                        <div className="text-center text-gray-500 text-sm py-6">
                          Sin datos — registra compras para ver la valorización
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {topProductos.map((p, i) => {
                            const max = topProductos[0].valor;
                            const pct = Math.round((p.valor / max) * 100);
                            return (
                              <div key={i} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3">
                                <span className="text-gray-500 text-sm text-right">{i + 1}</span>
                                <div className="space-y-0.5">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-200">{p.nombre}</span>
                                    <span className="text-[#00E5FF] font-bold">${p.valor.toFixed(2)}</span>
                                  </div>
                                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                                <span className="text-gray-500 text-xs text-right">{p.stock} u.</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Top 10 por nivel de stock */}
                    <div className="bg-white/5 border border-[#00E5FF]/20 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#00E5FF]" /> Top 10 — Nivel de Stock Actual
                      </h3>
                      {topStock.length === 0 ? (
                        <div className="text-center text-gray-500 text-sm py-6">Sin productos con stock</div>
                      ) : (
                        <div className="space-y-2">
                          {topStock.map((p, i) => {
                            const max = Math.max(topStock[0].stock, 1);
                            const pct = Math.round((p.stock / max) * 100);
                            const bejoPct = p.minimo > 0 ? Math.round((p.minimo / max) * 100) : 0;
                            const alerta = p.stock <= p.minimo;
                            return (
                              <div key={i} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3">
                                <span className="text-gray-500 text-sm text-right">{i + 1}</span>
                                <div className="space-y-0.5">
                                  <div className="flex justify-between text-sm">
                                    <span className={alerta ? 'text-orange-400' : 'text-gray-200'}>{p.nombre}</span>
                                    <span className={`font-bold ${alerta ? 'text-orange-400' : 'text-white'}`}>{p.stock}</span>
                                  </div>
                                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                                    <div className={`h-full rounded-full ${alerta ? 'bg-orange-400' : 'bg-[#00E5FF]'}`} style={{ width: `${pct}%` }} />
                                    {bejoPct > 0 && (
                                      <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/70" style={{ left: `${bejoPct}%` }} />
                                    )}
                                  </div>
                                </div>
                                {p.minimo > 0 && (
                                  <span className="text-gray-500 text-xs text-right">mín {p.minimo}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Productos sin stock */}
                    {criticos > 0 && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
                        <h3 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /> Productos Sin Stock ({criticos})
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {productos.filter(p => (p.stock_actual ?? 0) === 0).map(p => (
                            <div key={p.id} className="bg-red-500/10 rounded-lg px-3 py-2 text-sm">
                              <div className="text-red-300 font-medium truncate">{p.nombre}</div>
                              <div className="text-red-500/70 text-xs">{p.unidad_medida || 'unidad'}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modales */}
      <ProductoModal
        key={editingItem?.id || 'new'}
        open={showProductoModal}
        onClose={() => {
          setShowProductoModal(false);
          setEditingItem(null);
        }}
        onSuccess={async () => {
          await fetchProductos();
          await fetchInventario();
          // Sync stock_actual to active bodega for this product
          if (editingItem?.nombre && editingItem?.stock_actual) {
            await sincronizarStockProductoEnBodega(editingItem.nombre, Number(editingItem.stock_actual));
          }
        }}
        producto={editingItem}
        categorias={categorias}
        token={token}
      />

      <ProveedorModal
        open={showProveedorModal}
        onClose={() => {
          setShowProveedorModal(false);
          setEditingItem(null);
        }}
        onSuccess={fetchProveedores}
        proveedor={editingItem}
        token={token}
      />

      <BodegaModal
        open={showBodegaModal}
        onClose={() => {
          setShowBodegaModal(false);
          setEditingItem(null);
        }}
        onSuccess={fetchBodegas}
        bodega={editingItem}
        token={token}
      />

      <MovimientoModal
        open={showMovimientoModal}
        onClose={() => setShowMovimientoModal(false)}
        onSuccess={() => {
          fetchMovimientos();
          fetchInventario();
        }}
        productos={productos}
        bodegas={bodegas}
        token={token}
      />

      <DeleteConfirmationModal
        open={deleteItem !== null}
        onClose={() => setDeleteItem(null)}
        onConfirm={async (password: string) => {
          const { projectId } = await import('/utils/supabase/info');
          const headers = await getAuthHeaders();
          
          if (deleteType === 'producto') {
            const response = await fetch(
              `https://${projectId}.supabase.co/functions/v1/server/productos/${deleteItem.id}`,
              {
                method: 'DELETE',
                headers: {
                  ...headers,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Error al eliminar producto');
            }
            
            toast.success('Producto eliminado exitosamente');
            fetchProductos();
            fetchInventario();
          } else if (deleteType === 'proveedor') {
            const response = await fetch(
              `https://${projectId}.supabase.co/functions/v1/server/proveedores/${deleteItem.id}`,
              {
                method: 'DELETE',
                headers: {
                  ...headers,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Error al eliminar proveedor');
            }
            
            toast.success('Proveedor eliminado exitosamente');
            fetchProveedores();
          } else if (deleteType === 'bodega') {
            const response = await fetch(
              `https://${projectId}.supabase.co/functions/v1/server/bodegas/${deleteItem.id}`,
              {
                method: 'DELETE',
                headers: {
                  ...headers,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Error al eliminar bodega');
            }
            
            toast.success('Bodega eliminada exitosamente');
            fetchBodegas();
          }
        }}
        title={`Eliminar ${deleteType === 'producto' ? 'Producto' : deleteType === 'proveedor' ? 'Proveedor' : 'Bodega'}`}
        description={`Estás a punto de eliminar ${deleteType === 'producto' ? 'un producto' : deleteType === 'proveedor' ? 'un proveedor' : 'una bodega'} de forma permanente.`}
        itemName={deleteItem?.nombre || deleteItem?.codigo || 'N/A'}
        warningMessage={
          deleteType === 'producto'
            ? 'Esta acción eliminará el producto y todos sus registros de inventario asociados.'
            : deleteType === 'bodega'
            ? 'No puedes eliminar una bodega que tenga inventario. Transfiere o elimina el stock primero.'
            : 'Esta acción eliminará el proveedor y su historial.'
        }
      />
    </div>
  );
}