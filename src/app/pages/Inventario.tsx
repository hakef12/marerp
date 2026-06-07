import { useState, useEffect, useMemo } from 'react';
import { printHtml } from '../utils/printThermal';
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
  Boxes,
  Eye,
  CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  Bell,
  X,
  FileText,
  FileCode,
  FileCheck,
} from 'lucide-react';
import { ExportButtons } from '../components/ExportButtons';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext, PaginationLink } from '../components/ui/pagination';
import { ProductoModal } from '../components/inventario/ProductoModal';
import { ProveedorModal } from '../components/inventario/ProveedorModal';
import { BodegaModal } from '../components/inventario/BodegaModal';
import { MovimientoModal } from '../components/inventario/MovimientoModal';
import { DeleteConfirmationModal } from '../components/shared/DeleteConfirmationModal';
import { ImportarXMLModal } from '../components/inventario/ImportarXMLModal';
import { RetenciónDialog } from '../components/facturacion/RetenciónDialog';

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
  const [compras, setCompras] = useState<any[]>([]);
  
  // Estados de UI
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'inventory' | 'products' | 'warehouses' | 'suppliers' | 'movements' | 'purchases' | 'cuentaspagar' | 'analysis' | 'conteo' | 'kardex' | 'comparativo' | 'reportes'>('inventory');
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
  const [compraForm, setCompraForm] = useState({
    proveedor_id: '', fecha: new Date().toISOString().split('T')[0],
    numero_factura: '', observaciones: '',
    tipo_pago: 'contado' as 'contado' | 'credito',
    fecha_vencimiento: '',
  });
  const [compraItems, setCompraItems] = useState<any[]>([{ producto_id: '', cantidad: '', costo_total: '' }]);
  const [viewingCompra, setViewingCompra] = useState<any>(null);
  const [retenciónCompra, setRetenciónCompra] = useState<any>(null);
  const [cxp, setCxp] = useState<any[]>([]);
  const [cxpPagandoId, setCxpPagandoId] = useState<string | null>(null);
  const [cxpMontoPago, setCxpMontoPago] = useState('');
  const [showImportarXML, setShowImportarXML] = useState(false);

  // Paginación y filtros — Compras
  const [comprasPage, setComprasPage]       = useState(1);
  const [comprasPages, setComprasPages]     = useState(1);
  const [comprasTotal, setComprasTotal]     = useState(0);
  const [comprasFi, setComprasFi]           = useState('');
  const [comprasFf, setComprasFf]           = useState('');

  // Paginación y filtros — Movimientos
  const [movsPage, setMovsPage]             = useState(1);
  const [movsPages, setMovsPages]           = useState(1);
  const [movsTotal, setMovsTotal]           = useState(0);
  const [movsFi, setMovsFi]                 = useState('');
  const [movsFf, setMovsFf]                 = useState('');

  // ── Kardex ───────────────────────────────────────────────────────────────
  const [kardexProductoId, setKardexProductoId] = useState('');
  const [kardexDesde, setKardexDesde]           = useState('');
  const [kardexHasta, setKardexHasta]           = useState('');
  const [kardexData, setKardexData]             = useState<any>(null);
  const [kardexLoading, setKardexLoading]       = useState(false);

  // ── Snapshot mensual ─────────────────────────────────────────────────────
  const [snapshots, setSnapshots]               = useState<any[]>([]);
  const [snapshotGuardando, setSnapshotGuardando] = useState(false);

  // ── Comparativo ──────────────────────────────────────────────────────────
  const [compPeriodo1, setCompPeriodo1]         = useState('');
  const [compPeriodo2, setCompPeriodo2]         = useState('');
  const [compData, setCompData]                 = useState<any>(null);
  const [compLoading, setCompLoading]           = useState(false);
  const [compFiltro, setCompFiltro]             = useState('');

  // ── Reportes Especiales ───────────────────────────────────────────────────
  const [rptLoading, setRptLoading]             = useState(false);
  const [rptTipo, setRptTipo]                   = useState<'mermas'|'ventas-producto'|'flujo-caja'|'estado-cliente'|'kardex-consolidado'>('mermas');
  const [rptDesde, setRptDesde]                 = useState('');
  const [rptHasta, setRptHasta]                 = useState('');
  const [rptDias, setRptDias]                   = useState('60');
  const [rptClienteId, setRptClienteId]         = useState('');
  const [rptData, setRptData]                   = useState<any>(null);
  const [clientes, setClientes]                 = useState<any[]>([]);

  // ── Conteo Físico ────────────────────────────────────────────────────────
  const [conteoFisico, setConteoFisico]         = useState<Record<string, string>>({});
  const [conteoFecha, setConteoFecha]           = useState(new Date().toISOString().split('T')[0]);
  const [conteoNota, setConteoNota]             = useState('');
  const [conteoFiltro, setConteoFiltro]         = useState('');
  const [conteoCategoria, setConteoCategoria]   = useState('todas');
  const [conteoSoloVarianza, setConteoSoloVarianza] = useState(false);
  const [conteoAplicando, setConteoAplicando]   = useState(false);

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
      fetchCompras(),
      fetchCxP()
    ]);
  };

  // ── API helper centralizado ───────────────────────────────────────────────
  const apiGet = async (path: string) => {
    const { projectId } = await import('/utils/supabase/info');
    const headers = await getAuthHeaders();
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server${path}`, { headers });
    if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || `HTTP ${res.status}`);
    return res.json();
  };
  const apiPost = async (path: string, body: any) => {
    const { projectId } = await import('/utils/supabase/info');
    const headers = await getAuthHeaders();
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server${path}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || `HTTP ${res.status}`);
    return res.json();
  };

  // ── Cargar Kardex ─────────────────────────────────────────────────────────
  const fetchKardex = async (productoId?: string) => {
    const pid = productoId || kardexProductoId;
    if (!pid) return;
    setKardexLoading(true);
    try {
      const params = new URLSearchParams();
      if (kardexDesde) params.set('desde', kardexDesde);
      if (kardexHasta) params.set('hasta', kardexHasta);
      params.set('limit', '500');
      const data = await apiGet(`/inventario/kardex/${pid}?${params}`);
      setKardexData(data);
    } catch (e: any) { toast.error('Error kardex: ' + e.message); }
    finally { setKardexLoading(false); }
  };

  // ── Cargar Snapshots ─────────────────────────────────────────────────────
  const fetchSnapshots = async () => {
    try {
      const data = await apiGet('/inventario/snapshots');
      setSnapshots(data.snapshots || []);
    } catch { /* silencioso */ }
  };

  // ── Guardar Snapshot del mes actual ──────────────────────────────────────
  const guardarSnapshot = async () => {
    const hoyEC = new Date(Date.now() - 5*3600*1000);
    const anio  = hoyEC.getFullYear();
    const mes   = hoyEC.getMonth() + 1;
    if (!confirm(`¿Cerrar el mes ${mes}/${anio}? Esto guardará una foto del inventario actual.`)) return;
    setSnapshotGuardando(true);
    try {
      const data = await apiPost('/inventario/snapshot', { anio, mes });
      toast.success(`✅ Snapshot ${mes}/${anio} guardado — ${data.total_productos} productos · $${Number(data.total_valor||0).toFixed(2)}`);
      await fetchSnapshots();
    } catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setSnapshotGuardando(false); }
  };

  // ── Cargar lista de clientes para estado de cuenta ───────────────────────
  const fetchClientes = async () => {
    try {
      const data = await apiGet('/clientes');
      setClientes(data.clientes || []);
    } catch { /* silencioso */ }
  };

  // ── Generar Reporte Especial ──────────────────────────────────────────────
  const fetchReporte = async () => {
    setRptLoading(true); setRptData(null);
    try {
      let data: any;
      const params = new URLSearchParams();
      if (rptDesde) params.set('desde', rptDesde);
      if (rptHasta) params.set('hasta', rptHasta);
      if (rptTipo === 'mermas')            data = await apiGet(`/reportes/mermas?${params}`);
      else if (rptTipo === 'ventas-producto') data = await apiGet(`/reportes/ventas-por-producto?${params}`);
      else if (rptTipo === 'flujo-caja')   data = await apiGet(`/reportes/flujo-caja?dias=${rptDias}`);
      else if (rptTipo === 'estado-cliente' && rptClienteId)
        data = await apiGet(`/reportes/estado-cuenta-cliente/${rptClienteId}?${params}`);
      else if (rptTipo === 'kardex-consolidado')
        data = await apiGet(`/inventario/kardex-consolidado?${params}&limit=2000`);
      if (data) setRptData(data);
    } catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setRptLoading(false); }
  };

  // ── Cargar Comparativo ────────────────────────────────────────────────────
  const fetchComparativo = async () => {
    if (!compPeriodo1 || !compPeriodo2) { toast.error('Selecciona ambos períodos'); return; }
    setCompLoading(true);
    try {
      const data = await apiGet(`/inventario/comparativo?periodo1=${compPeriodo1}&periodo2=${compPeriodo2}`);
      setCompData(data);
    } catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setCompLoading(false); }
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

  const fetchMovimientos = async (page = movsPage, fi = movsFi, ff = movsFf) => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (fi) params.set('fecha_inicio', fi);
      if (ff) params.set('fecha_fin', ff);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/inventario/movimientos?${params}`, { headers }
      );
      if (response.ok) {
        const data = await response.json();
        setMovimientos(data.movimientos || []);
        setMovsTotal(data.total || 0);
        setMovsPages(data.pages || 1);
        setMovsPage(page);
      }
    } catch (error) {}
  };

  // ── Descarga XML original guardado en metadata ───────────────────────────────
  const descargarXML = (compra: any) => {
    const xml = compra.metadata?.xml_original;
    if (!xml) { toast.error('Esta compra no tiene XML guardado'); return; }
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `factura_${compra.numero_factura || compra.id}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Genera PDF de factura de compra (estilo SRI) ──────────────────────────
  const descargarPDFCompra = (compra: any) => {
    const meta = compra.metadata || {};
    const info = meta.info_sri || {};
    const items: any[] = compra.items || [];
    const subtotal = meta.total_sin_impuestos ?? items.reduce((s: number, i: any) => s + (i.costo_total || 0), 0);
    const iva = meta.total_iva ?? 0;
    const total = compra.total_compra ?? (subtotal + iva);

    const html = `
      <html><head><meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 20px; }
        h1 { font-size: 15px; margin: 0 0 2px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #C2410C; padding-bottom: 10px; margin-bottom: 12px; }
        .badge { background: #C2410C; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .box { background: #f5f8ff; border-radius: 6px; padding: 8px 12px; }
        .label { color: #555; font-size: 9px; text-transform: uppercase; margin-bottom: 2px; }
        .val { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th { background: #C2410C; color: white; padding: 5px 8px; text-align: left; font-size: 10px; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) td { background: #f9fafb; }
        .totals { margin-left: auto; width: 260px; }
        .totals td { padding: 3px 8px; }
        .totals .total-row td { font-weight: bold; font-size: 13px; border-top: 2px solid #C2410C; }
        .clave { font-size: 8px; color: #555; word-break: break-all; margin-top: 12px; padding-top: 8px; border-top: 1px solid #ddd; }
        .footer { text-align: center; color: #888; font-size: 9px; margin-top: 16px; }
      </style></head><body>
      <div class="header">
        <div>
          <h1>FACTURA DE COMPRA</h1>
          <div style="color:#555;font-size:10px;">Documento interno — ${new Date().toLocaleDateString('es-EC')}</div>
        </div>
        <div style="text-align:right">
          <div class="badge">N° ${compra.numero_factura || '—'}</div>
          <div style="margin-top:6px;font-size:10px;">Fecha: <b>${new Date(compra.fecha || compra.created_at).toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' })}</b></div>
          <div style="font-size:10px;">Pago: <b>${compra.tipo_pago === 'credito' ? 'Crédito' : 'Contado'}</b></div>
        </div>
      </div>
      <div class="grid2">
        <div class="box">
          <div class="label">Proveedor</div>
          <div class="val">${compra.proveedor?.nombre || info.proveedor_nombre || '—'}</div>
          <div style="color:#555">RUC: ${info.proveedor_ruc || compra.proveedor?.ruc || '—'}</div>
        </div>
        <div class="box">
          <div class="label">Autorización SRI</div>
          <div style="font-size:9px;word-break:break-all">${meta.numero_autorizacion || '—'}</div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th>#</th><th>Descripción</th><th style="text-align:right">Cant.</th>
          <th style="text-align:right">Subtotal</th><th style="text-align:right">IVA</th><th style="text-align:right">Total</th>
        </tr></thead>
        <tbody>
          ${items.map((it: any, idx: number) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${it.descripcion_xml || it.nombre || '—'}</td>
              <td style="text-align:right">${Number(it.cantidad_xml || it.cantidad || 0).toFixed(2)}</td>
              <td style="text-align:right">$${Number(it.costo_total || 0).toFixed(2)}</td>
              <td style="text-align:right">$${Number(it.iva || 0).toFixed(2)}</td>
              <td style="text-align:right">$${(Number(it.costo_total || 0) + Number(it.iva || 0)).toFixed(2)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal sin IVA</td><td style="text-align:right">$${Number(subtotal).toFixed(2)}</td></tr>
        <tr><td>IVA</td><td style="text-align:right">$${Number(iva).toFixed(2)}</td></tr>
        <tr class="total-row"><td>TOTAL</td><td style="text-align:right">$${Number(total).toFixed(2)}</td></tr>
      </table>
      ${meta.clave_acceso ? `<div class="clave"><b>Clave de acceso:</b> ${meta.clave_acceso}</div>` : ''}
      <div class="footer">Generado por M.A.R Cocina Local — ${new Date().toLocaleString('es-EC')}</div>
      </body></html>`;

    printHtml(html, `Compra ${compra.numero_factura || compra.id}`, 80);
  };

  const fetchCompras = async (page = comprasPage, fi = comprasFi, ff = comprasFf) => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (fi) params.set('fecha_inicio', fi);
      if (ff) params.set('fecha_fin', ff);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/compras?${params}`, { headers }
      );
      const data = await response.json();
      if (response.ok) {
        setCompras(data.compras || []);
        setComprasTotal(data.total || 0);
        setComprasPages(data.pages || 1);
        setComprasPage(page);
      } else {
        console.error('[compras] Error API:', response.status, data);
      }
    } catch (error) {
      console.error('[compras] Error fetch:', error);
    }
  };

  const fetchCxP = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/compras/cxp`, { headers });
      if (response.ok) {
        const data = await response.json();
        setCxp(data.cxp || []);
      }
    } catch (error) {}
  };

  const pagarCxP = async (cxpId: string, monto: number) => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/compras/cxp/${cxpId}/pagar`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto })
      });
      if (res.ok) {
        toast.success('Pago registrado correctamente');
        setCxpPagandoId(null);
        setCxpMontoPago('');
        fetchCxP();
        fetchCompras();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al registrar pago');
      }
    } catch { toast.error('Error de conexión'); }
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

  // ── Clasificación inteligente de compras ────────────────────────────────
  // Tipos de compra — códigos SRI Ecuador oficiales
  const TIPOS_COMPRA = [
    { id: 'inventario',        label: '📦 Inventario',          cuenta: '510102',  color: 'green',  afecta_stock: true  },
    { id: 'gasto_servicio',    label: '🌐 Telecom/Internet',    cuenta: '520118',  color: 'blue',   afecta_stock: false },
    { id: 'gasto_basicos',     label: '💡 Agua/Luz/Gas',        cuenta: '520118',  color: 'blue',   afecta_stock: false },
    { id: 'gasto_arriendo',    label: '🏠 Arriendo',            cuenta: '520109',  color: 'purple', afecta_stock: false },
    { id: 'gasto_publicidad',  label: '📢 Publicidad',          cuenta: '520111',  color: 'pink',   afecta_stock: false },
    { id: 'gasto_operativo',   label: '⚙️ Mantenimiento',      cuenta: '520108',  color: 'gray',   afecta_stock: false },
    { id: 'activo_fijo',       label: '🏗️ Activo Fijo',        cuenta: '1020106', color: 'orange', afecta_stock: false },
  ] as const;

  const KEYWORDS_TIPO: Record<string, string> = {
    internet: 'gasto_servicio', 'datos móviles': 'gasto_servicio', 'plan datos': 'gasto_servicio',
    teléfono: 'gasto_servicio', telefono: 'gasto_servicio', celular: 'gasto_servicio',
    claro: 'gasto_servicio', movistar: 'gasto_servicio', cnt: 'gasto_servicio', netlife: 'gasto_servicio',
    luz: 'gasto_basicos', eléctrico: 'gasto_basicos', electrico: 'gasto_basicos', energía: 'gasto_basicos',
    agua: 'gasto_basicos', 'servicio básico': 'gasto_basicos',
    arriendo: 'gasto_arriendo', alquiler: 'gasto_arriendo', renta: 'gasto_arriendo', local: 'gasto_arriendo',
    publicidad: 'gasto_publicidad', propaganda: 'gasto_publicidad', marketing: 'gasto_publicidad', redes: 'gasto_publicidad',
    seguro: 'gasto_operativo', mantenimiento: 'gasto_operativo', limpieza: 'gasto_operativo',
    cuchillo: 'activo_fijo', sartén: 'activo_fijo', horno: 'activo_fijo', refrigerador: 'activo_fijo',
    computador: 'activo_fijo', laptop: 'activo_fijo', tablet: 'activo_fijo', impresora: 'activo_fijo',
    mueble: 'activo_fijo', mesa: 'activo_fijo', silla: 'activo_fijo',
  };

  const UMBRAL_ACTIVO_FIJO = 100; // USD — configurable

  const autodetectarTipo = (productoId: string, descripcion: string, costoTotal: number): { tipo: string; confianza: 'auto'|'sugerido' } => {
    // Regla 1: Si existe en catálogo de productos → inventario (alta confianza)
    if (productoId && productos.find(p => p.id === productoId)) {
      return { tipo: 'inventario', confianza: 'auto' };
    }
    // Regla 2: Keywords en descripción
    const desc = (descripcion || '').toLowerCase();
    for (const [keyword, tipo] of Object.entries(KEYWORDS_TIPO)) {
      if (desc.includes(keyword)) return { tipo, confianza: 'auto' };
    }
    // Regla 3: Umbral activo fijo
    if (costoTotal >= UMBRAL_ACTIVO_FIJO && !productoId) {
      return { tipo: 'activo_fijo', confianza: 'sugerido' };
    }
    // Default: gasto operativo si no es del catálogo
    if (!productoId) return { tipo: 'gasto_operativo', confianza: 'sugerido' };
    return { tipo: 'inventario', confianza: 'sugerido' };
  };

  const addCompraItem = () => setCompraItems(prev => [...prev, {
    producto_id: '', descripcion_libre: '', cantidad: '1', costo_total: '',
    tipo_contable: '', confianza: 'sugerido' as 'auto'|'sugerido',
  }]);

  const removeCompraItem = (idx: number) => setCompraItems(prev => prev.filter((_, i) => i !== idx));

  const updateCompraItem = (idx: number, field: string, value: string) => {
    setCompraItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      // Autodetectar tipo cuando cambia producto, descripción o costo
      if (['producto_id', 'descripcion_libre', 'costo_total'].includes(field)) {
        const descFinal = field === 'descripcion_libre' ? value : (updated.descripcion_libre || '');
        const costoFinal = Number(field === 'costo_total' ? value : updated.costo_total) || 0;
        const pidFinal   = field === 'producto_id' ? value : updated.producto_id;
        // Solo autodetectar si el usuario no eligió manualmente (confianza !== 'manual')
        if (updated.confianza !== 'manual') {
          const { tipo, confianza } = autodetectarTipo(pidFinal, descFinal, costoFinal);
          updated.tipo_contable = tipo;
          updated.confianza = confianza;
        }
        // Si seleccionó producto del catálogo, rellenar descripción automáticamente
        if (field === 'producto_id' && value) {
          const prod = productos.find(p => p.id === value);
          if (prod) updated.descripcion_libre = prod.nombre;
        }
      }
      return updated;
    }));
  };

  const submitCompra = async () => {
    // Permitir ítems sin producto_id si tienen descripcion_libre (gastos/servicios)
    const itemsValidos = compraItems.filter(i =>
      (i.producto_id || i.descripcion_libre?.trim()) &&
      Number(i.cantidad) > 0 && Number(i.costo_total) > 0
    );
    if (itemsValidos.length === 0) return toast.error('Agrega al menos un ítem con cantidad y costo válidos');

    setCompraSubmitting(true);
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/compras`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor_id: compraForm.proveedor_id,
          fecha: compraForm.fecha,
          numero_factura: compraForm.numero_factura,
          observaciones: compraForm.observaciones,
          tipo_pago: compraForm.tipo_pago,
          fecha_vencimiento: compraForm.tipo_pago === 'credito' ? compraForm.fecha_vencimiento : undefined,
          items: itemsValidos.map(i => ({
            producto_id: i.producto_id || null,
            descripcion: i.descripcion_libre || (productos.find((p: any) => p.id === i.producto_id)?.nombre || ''),
            cantidad: Number(i.cantidad),
            costo_total: Number(i.costo_total),
            costo_unitario: Number(i.costo_total) / Number(i.cantidad),
            tipo_contable: i.tipo_contable || 'inventario',
            afecta_stock: i.tipo_contable === 'inventario' || !i.tipo_contable,
          }))
        })
      });
      if (response.ok) {
        toast.success(compraForm.tipo_pago === 'credito' ? 'Compra a crédito registrada — se creó cuenta por pagar' : 'Compra registrada y stock actualizado');
        setShowCompraForm(false);
        setCompraForm({ proveedor_id: '', fecha: new Date().toISOString().split('T')[0], numero_factura: '', observaciones: '', tipo_pago: 'contado', fecha_vencimiento: '' });
        setCompraItems([{ producto_id: '', descripcion_libre: '', cantidad: '1', costo_total: '', tipo_contable: '', confianza: 'sugerido' }]);
        fetchCxP();
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
  // BACKFILL ASIENTOS CONTABLES DE COMPRAS ANTIGUAS
  // =====================================================

  const [backfilling, setBackfilling] = useState(false);

  const backfillAsientos = async () => {
    if (!confirm('¿Crear asientos contables retroactivos para todas las compras que aún no tienen asiento? Esto no duplica si ya existen.')) return;
    setBackfilling(true);
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/compras/backfill-asientos`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`✅ ${data.mensaje}`, { duration: 6000 });
        if (data.detalle_creados?.length > 0) {
          console.log('Asientos creados para:', data.detalle_creados);
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error en backfill');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setBackfilling(false);
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestión de Inventario</h1>
          <p className="text-gray-600">Control completo de stock, bodegas y movimientos</p>
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
            className="bg-gradient-to-r from-[#C2410C] to-[#F97316]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Movimiento de Inventario
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Productos</CardTitle>
            <Package className="w-5 h-5 text-[#F97316]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{inventarioMetrics.totalProductos}</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#FB923C]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Bodegas</CardTitle>
            <Warehouse className="w-5 h-5 text-[#FB923C]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{bodegas.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-orange-500/20 border-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Stock Bajo</CardTitle>
            <TrendingDown className="w-5 h-5 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-400">{inventarioMetrics.stockBajo}</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-red-500/20 border-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Stock Crítico</CardTitle>
            <AlertCircle className="w-5 h-5 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">{inventarioMetrics.stockCritico}</div>
          </CardContent>
        </Card>
      </div>

      {/* Banner de alertas de pago — visible en todas las vistas */}
      {cxp.filter(c => c.estado !== 'pagada' && c.dias_restantes !== null && c.dias_restantes <= 5).length > 0 && view !== 'cuentaspagar' && view !== 'purchases' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-red-500/15 transition-colors" onClick={() => setView('cuentaspagar')}>
          <Bell className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm flex-1">
            <span className="font-bold text-red-400">Atención:</span>{' '}
            {cxp.filter(c => c.estado !== 'pagada' && c.dias_restantes !== null && c.dias_restantes <= 5).length} factura(s) de proveedor próximas a vencer o vencidas.
          </p>
          <span className="text-red-400 text-xs underline whitespace-nowrap">Ver Cuentas x Pagar</span>
        </div>
      )}

      {/* Tabs de navegación */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl shadow-lg border border-[#F97316]/20 p-2 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setView('inventory')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'inventory'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Package className="w-5 h-5" /> Inventario
        </button>
        <button
          onClick={() => setView('products')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'products'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Boxes className="w-5 h-5" /> Productos
        </button>
        <button
          onClick={() => setView('warehouses')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'warehouses'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Warehouse className="w-5 h-5" /> Bodegas
        </button>
        <button
          onClick={() => setView('suppliers')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'suppliers'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Truck className="w-5 h-5" /> Proveedores
        </button>
        <button
          onClick={() => setView('movements')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'movements'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <ArrowLeftRight className="w-5 h-5" /> Movimientos
        </button>
        <button
          onClick={() => setView('purchases')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'purchases'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <ShoppingCart className="w-5 h-5" /> Compras
        </button>
        <button
          onClick={() => setView('cuentaspagar')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'cuentaspagar'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <CreditCard className="w-5 h-5" />
          Cuentas x Pagar
          {cxp.filter(c => c.estado !== 'pagada' && c.dias_restantes !== null && c.dias_restantes <= 5).length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cxp.filter(c => c.estado !== 'pagada' && c.dias_restantes !== null && c.dias_restantes <= 5).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setView('analysis')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'analysis'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <BarChart3 className="w-5 h-5" /> Análisis
        </button>
        <button
          onClick={() => setView('conteo')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'conteo'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Calculator className="w-5 h-5" /> Conteo Físico
        </button>
        <button
          onClick={() => { setView('kardex'); }}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'kardex'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <FileText className="w-5 h-5" /> Kardex
        </button>
        <button
          onClick={() => { setView('comparativo'); fetchSnapshots(); }}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'comparativo'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <TrendingUp className="w-5 h-5" /> Comparativo
        </button>
        <button
          onClick={() => { setView('reportes'); fetchClientes(); }}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'reportes'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <FileCode className="w-5 h-5" /> Reportes
        </button>
      </div>

      {/* Contenido principal */}
      <Card className="bg-white border-[#F97316]/20">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-gray-900">
              {view === 'inventory' && 'Stock por Bodega'}
              {view === 'products' && 'Catálogo de Productos'}
              {view === 'warehouses' && 'Gestión de Bodegas'}
              {view === 'suppliers' && 'Proveedores'}
              {view === 'movements' && 'Movimientos de Inventario'}
              {view === 'purchases' && 'Registro de Compras'}
              {view === 'cuentaspagar' && 'Cuentas por Pagar'}
              {view === 'analysis'     && 'Análisis de Inventario'}
              {view === 'conteo'       && 'Conteo Físico de Inventario'}
              {view === 'kardex'       && 'Kardex de Movimientos'}
              {view === 'comparativo'  && 'Reporte Comparativo por Períodos'}
              {view === 'reportes'    && 'Reportes Especiales'}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={guardarSnapshot}
                disabled={snapshotGuardando}
                variant="outline"
                size="sm"
                className="border-purple-300 text-purple-600 hover:bg-purple-50"
                title="Guarda una foto del stock actual para comparativas históricas"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                {snapshotGuardando ? 'Guardando…' : 'Cerrar Mes'}
              </Button>
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
                  className="bg-gradient-to-r from-[#C2410C] to-[#F97316]"
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
                  className="bg-gradient-to-r from-[#C2410C] to-[#F97316]"
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
                  className="bg-gradient-to-r from-[#C2410C] to-[#F97316]"
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
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="w-48 bg-gray-50 border-[#F97316]/20 text-gray-900">
                    <SelectValue placeholder="Todas las bodegas" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#F97316]/30">
                    <SelectItem value="all">Todas las bodegas</SelectItem>
                    {bodegas.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterLevel} onValueChange={(v: any) => setFilterLevel(v)}>
                  <SelectTrigger className="w-48 bg-gray-50 border-[#F97316]/20 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#F97316]/30">
                    <SelectItem value="all">Todos los niveles</SelectItem>
                    <SelectItem value="critical">Solo críticos</SelectItem>
                    <SelectItem value="low">Solo bajos</SelectItem>
                    <SelectItem value="normal">Solo normales</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="border-[#F97316]/20 hover:bg-gray-50">
                    <TableHead className="text-gray-600">Producto</TableHead>
                    <TableHead className="text-gray-600">Bodega</TableHead>
                    <TableHead className="text-gray-600 text-right">Stock Actual</TableHead>
                    <TableHead className="text-gray-600 text-right">Stock Mín</TableHead>
                    <TableHead className="text-gray-600 text-right">Stock Máx</TableHead>
                    <TableHead className="text-gray-600 text-right">Costo Prom.</TableHead>
                    <TableHead className="text-gray-600 text-right">Valor Total</TableHead>
                    <TableHead className="text-gray-600">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventario.map((item) => {
                    const nivel = getNivelAlerta(item.stock_actual, item.stock_minimo);
                    const valorTotal = item.stock_actual * (item.costo_promedio || 0);
                    
                    return (
                      <TableRow key={item.id} className="border-[#F97316]/10 hover:bg-gray-50">
                        <TableCell className="text-gray-900">
                          <div>
                            <div className="font-medium">{item.productos?.nombre || 'N/A'}</div>
                            <div className="text-sm text-gray-600">{item.productos?.codigo || ''}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600">{item.bodegas?.nombre || 'N/A'}</TableCell>
                        <TableCell className="text-gray-900 text-right font-bold">{item.stock_actual}</TableCell>
                        <TableCell className="text-gray-600 text-right">{item.stock_minimo}</TableCell>
                        <TableCell className="text-gray-600 text-right">{item.stock_maximo || '-'}</TableCell>
                        <TableCell className="text-gray-900 text-right">${(item.costo_promedio || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-[#F97316] text-right font-bold">${valorTotal.toFixed(2)}</TableCell>
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
                      <TableCell colSpan={8} className="text-center text-gray-600 py-8">
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
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900 flex-1 max-w-md"
                />
                <div className="text-gray-600 text-sm">
                  Total de productos: <span className="text-[#F97316] font-bold">{productos.length}</span>
                </div>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow className="border-[#F97316]/20 hover:bg-gray-50">
                    <TableHead className="text-gray-600">Código</TableHead>
                    <TableHead className="text-gray-600">Nombre</TableHead>
                    <TableHead className="text-gray-600">Categoría</TableHead>
                    <TableHead className="text-gray-600 text-right">Precio Compra</TableHead>
                    <TableHead className="text-gray-600 text-right">Precio Venta</TableHead>
                    <TableHead className="text-gray-600">Estado</TableHead>
                    <TableHead className="text-gray-600 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos
                    .filter(p => p.nombre?.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((producto) => (
                      <TableRow key={producto.id} className="border-[#F97316]/10 hover:bg-gray-50">
                        <TableCell className="text-gray-900 font-mono">{producto.codigo}</TableCell>
                        <TableCell className="text-gray-900 font-medium">{producto.nombre}</TableCell>
                        <TableCell className="text-gray-600">{producto.categorias?.nombre || '-'}</TableCell>
                        <TableCell className="text-gray-900 text-right">${producto.precio_compra?.toFixed(2) || '0.00'}</TableCell>
                        <TableCell className="text-[#F97316] text-right font-bold">${producto.precio_venta?.toFixed(2) || '0.00'}</TableCell>
                        <TableCell>
                          <Badge className={producto.disponible ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-600'}>
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
                      <TableCell colSpan={7} className="text-center text-gray-600 py-8">
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
                <TableRow className="border-[#F97316]/20 hover:bg-gray-50">
                  <TableHead className="text-gray-600">Código</TableHead>
                  <TableHead className="text-gray-600">Nombre</TableHead>
                  <TableHead className="text-gray-600">Tipo</TableHead>
                  <TableHead className="text-gray-600">Dirección</TableHead>
                  <TableHead className="text-gray-600">Estado</TableHead>
                  <TableHead className="text-gray-600 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bodegas.map((bodega) => (
                  <TableRow key={bodega.id} className="border-[#F97316]/10 hover:bg-gray-50">
                    <TableCell className="text-gray-900 font-mono">{bodega.codigo}</TableCell>
                    <TableCell className="text-gray-900 font-medium">{bodega.nombre}</TableCell>
                    <TableCell className="text-gray-600 capitalize">{bodega.tipo}</TableCell>
                    <TableCell className="text-gray-600">{bodega.direccion || '-'}</TableCell>
                    <TableCell>
                      <Badge className={bodega.activa ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-600'}>
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
                    <TableCell colSpan={6} className="text-center text-gray-600 py-8">
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
                <TableRow className="border-[#F97316]/20 hover:bg-gray-50">
                  <TableHead className="text-gray-600">RUC/NIT</TableHead>
                  <TableHead className="text-gray-600">Nombre</TableHead>
                  <TableHead className="text-gray-600">Email</TableHead>
                  <TableHead className="text-gray-600">Teléfono</TableHead>
                  <TableHead className="text-gray-600 text-right">Días Crédito</TableHead>
                  <TableHead className="text-gray-600 text-right">Límite Crédito</TableHead>
                  <TableHead className="text-gray-600">Estado</TableHead>
                  <TableHead className="text-gray-600 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proveedores.map((proveedor) => (
                  <TableRow key={proveedor.id} className="border-[#F97316]/10 hover:bg-gray-50">
                    <TableCell className="text-gray-900 font-mono">{proveedor.ruc_nit}</TableCell>
                    <TableCell className="text-gray-900 font-medium">{proveedor.nombre}</TableCell>
                    <TableCell className="text-gray-600">{proveedor.email || '-'}</TableCell>
                    <TableCell className="text-gray-600">{proveedor.telefono || '-'}</TableCell>
                    <TableCell className="text-gray-900 text-right">{proveedor.dias_credito || 0}</TableCell>
                    <TableCell className="text-[#F97316] text-right font-bold">${(proveedor.limite_credito || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={proveedor.activo ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-600'}>
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
                    <TableCell colSpan={8} className="text-center text-gray-600 py-8">
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
              {/* Filtros de movimientos */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>Desde</span>
                  <Input type="date" value={movsFi} onChange={e => setMovsFi(e.target.value)}
                    className="h-8 w-36 bg-gray-50 border-gray-100 text-gray-900 text-xs" />
                  <span>Hasta</span>
                  <Input type="date" value={movsFf} onChange={e => setMovsFf(e.target.value)}
                    className="h-8 w-36 bg-gray-50 border-gray-100 text-gray-900 text-xs" />
                  <Button size="sm" onClick={() => fetchMovimientos(1, movsFi, movsFf)}
                    className="h-8 bg-[#F97316]/20 text-[#F97316] hover:bg-[#F97316]/30 text-xs">
                    Filtrar
                  </Button>
                  {(movsFi || movsFf) && (
                    <Button size="sm" variant="ghost" onClick={() => { setMovsFi(''); setMovsFf(''); fetchMovimientos(1, '', ''); }}
                      className="h-8 text-gray-600 text-xs">
                      Limpiar
                    </Button>
                  )}
                </div>
                <span className="ml-auto text-xs text-gray-600">{movsTotal} movimiento(s) total</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#F97316]/20 hover:bg-gray-50">
                    <TableHead className="text-gray-600">Fecha</TableHead>
                    <TableHead className="text-gray-600">Tipo</TableHead>
                    <TableHead className="text-gray-600">Producto</TableHead>
                    <TableHead className="text-gray-600">Bodega</TableHead>
                    <TableHead className="text-gray-600 text-right">Cantidad</TableHead>
                    <TableHead className="text-gray-600 text-right">Costo Unit.</TableHead>
                    <TableHead className="text-gray-600">Referencia</TableHead>
                    <TableHead className="text-gray-600">Usuario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.map((mov) => (
                    <TableRow key={mov.id} className="border-[#F97316]/10 hover:bg-gray-50">
                      <TableCell className="text-gray-600">
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
                      <TableCell className="text-gray-900">{mov.productos?.nombre || 'N/A'}</TableCell>
                      <TableCell className="text-gray-600">{mov.bodegas?.nombre || 'N/A'}</TableCell>
                      <TableCell className="text-gray-900 text-right font-bold">{mov.cantidad}</TableCell>
                      <TableCell className="text-gray-900 text-right">${(mov.costo_unitario || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-gray-600">{mov.referencia || '-'}</TableCell>
                      <TableCell className="text-gray-600">{mov.usuarios?.nombre_completo || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {movimientos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-600 py-8">
                        No hay movimientos registrados
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Paginación movimientos */}
              {movsPages > 1 && (
                <Pagination className="mt-2">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => movsPage > 1 && fetchMovimientos(movsPage - 1)}
                        className={movsPage <= 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer text-gray-900'}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, movsPages) }, (_, i) => {
                      const p = movsPage <= 3 ? i + 1 : movsPage - 2 + i;
                      if (p < 1 || p > movsPages) return null;
                      return (
                        <PaginationItem key={p}>
                          <PaginationLink isActive={p === movsPage} onClick={() => fetchMovimientos(p)}
                            className="cursor-pointer text-gray-900">
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => movsPage < movsPages && fetchMovimientos(movsPage + 1)}
                        className={movsPage >= movsPages ? 'pointer-events-none opacity-40' : 'cursor-pointer text-gray-900'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}

          {/* Vista de Compras */}
          {view === 'purchases' && (
            <div className="space-y-4">
              {/* Alerta pagos próximos */}
              {(() => {
                const proximos = cxp.filter(c => c.estado !== 'pagada' && c.dias_restantes !== null && c.dias_restantes <= 5);
                if (proximos.length === 0) return null;
                return (
                  <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 flex items-start gap-3">
                    <Bell className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-red-400 font-semibold text-sm mb-1">Pagos próximos a vencer</p>
                      <div className="space-y-1">
                        {proximos.map(c => (
                          <p key={c.id} className="text-red-300 text-xs">
                            {c.proveedor?.nombre || 'Proveedor'} — Fact. {c.numero_factura || c.id.slice(0,8)} —{' '}
                            <span className="font-bold">${(c.saldo_pendiente || 0).toFixed(2)}</span> —{' '}
                            {c.dias_restantes <= 0
                              ? <span className="text-red-500 font-bold">VENCIDA</span>
                              : <span>vence en {c.dias_restantes} día(s)</span>}
                          </p>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setView('cuentaspagar')} className="text-xs text-red-400 underline whitespace-nowrap">Ver CxP</button>
                  </div>
                );
              })()}

              {!showCompraForm ? (
                <>
                  <div className="flex justify-between items-center">
                    {/* Botón retroactivo: crea asientos de compras antiguas sin asiento */}
                    <Button
                      onClick={backfillAsientos}
                      disabled={backfilling || compras.length === 0}
                      variant="outline"
                      className="border-[#FB923C]/40 text-[#FB923C] hover:bg-[#FB923C]/10 text-sm"
                    >
                      <Calculator className="w-4 h-4 mr-2" />
                      {backfilling ? 'Procesando...' : 'Generar asientos faltantes'}
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowImportarXML(true)}
                        className="border-green-500/40 text-green-400 hover:bg-green-500/10"
                      >
                        <Download className="w-4 h-4 mr-2" /> Importar XML SRI
                      </Button>
                      <Button onClick={() => setShowCompraForm(true)} className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                        <Plus className="w-4 h-4 mr-2" /> Nueva Compra
                      </Button>
                    </div>
                  </div>

                  {/* Filtros fecha + totalizador */}
                  <div className="flex flex-wrap items-center gap-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>Desde</span>
                      <Input type="date" value={comprasFi} onChange={e => setComprasFi(e.target.value)}
                        className="h-8 w-36 bg-gray-50 border-gray-100 text-gray-900 text-xs" />
                      <span>Hasta</span>
                      <Input type="date" value={comprasFf} onChange={e => setComprasFf(e.target.value)}
                        className="h-8 w-36 bg-gray-50 border-gray-100 text-gray-900 text-xs" />
                      <Button size="sm" onClick={() => fetchCompras(1, comprasFi, comprasFf)}
                        className="h-8 bg-[#F97316]/20 text-[#F97316] hover:bg-[#F97316]/30 text-xs">
                        Filtrar
                      </Button>
                      {(comprasFi || comprasFf) && (
                        <Button size="sm" variant="ghost" onClick={() => { setComprasFi(''); setComprasFf(''); fetchCompras(1, '', ''); }}
                          className="h-8 text-gray-600 text-xs">
                          Limpiar
                        </Button>
                      )}
                    </div>
                    <span className="ml-auto text-xs text-gray-600">{comprasTotal} compra(s) total</span>
                  </div>

                  {/* Lista de compras */}
                  {compras.length === 0 ? (
                    <div className="text-center text-gray-600 py-12">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
                      <p>No hay compras registradas</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[#F97316]/20">
                          <TableHead className="text-gray-600">Fecha</TableHead>
                          <TableHead className="text-gray-600">Factura</TableHead>
                          <TableHead className="text-gray-600">Proveedor</TableHead>
                          <TableHead className="text-gray-600">Pago</TableHead>
                          <TableHead className="text-gray-600">Ítems</TableHead>
                          <TableHead className="text-gray-600 text-right">Total Compra</TableHead>
                          <TableHead className="text-gray-600 text-right">Ver</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {compras.map((compra) => (
                          <TableRow key={compra.id} className="border-[#F97316]/10 hover:bg-gray-50">
                            <TableCell className="text-gray-600">{new Date(compra.fecha || compra.created_at).toLocaleDateString('es-EC')}</TableCell>
                            <TableCell className="text-gray-900 font-mono text-xs">{compra.numero_factura || '—'}</TableCell>
                            <TableCell className="text-gray-600">{compra.proveedor?.nombre || '—'}</TableCell>
                            <TableCell>
                              <Badge className={compra.tipo_pago === 'credito'
                                ? (compra.estado_pago === 'pagada' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400')
                                : 'bg-blue-500/20 text-blue-400'}>
                                {compra.tipo_pago === 'credito' ? (compra.estado_pago === 'pagada' ? 'Crédito pagado' : 'Crédito pend.') : 'Contado'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-gray-600">{(compra.items || []).length} producto(s)</TableCell>
                            <TableCell className="text-[#F97316] font-bold text-right">${(compra.total_compra || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/* Ver detalle */}
                                <Button size="sm" variant="ghost" onClick={() => setViewingCompra(compra)}
                                  className="text-gray-600 hover:text-gray-900" title="Ver detalle">
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {/* Descargar PDF */}
                                <Button size="sm" variant="ghost" onClick={() => descargarPDFCompra(compra)}
                                  className="text-red-400 hover:text-red-300" title="Descargar PDF">
                                  <FileText className="w-4 h-4" />
                                </Button>
                                {/* Descargar XML (solo si fue importado) */}
                                {compra.metadata?.xml_original && (
                                  <Button size="sm" variant="ghost" onClick={() => descargarXML(compra)}
                                    className="text-green-400 hover:text-green-300" title="Descargar XML original">
                                    <FileCode className="w-4 h-4" />
                                  </Button>
                                )}
                                {/* Emitir Retención */}
                                <Button size="sm" variant="ghost" onClick={() => setRetenciónCompra(compra)}
                                  className="text-blue-500 hover:text-blue-700" title="Emitir comprobante de retención">
                                  <FileCheck className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {/* Paginación compras */}
                  {comprasPages > 1 && (
                    <Pagination className="mt-2">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => comprasPage > 1 && fetchCompras(comprasPage - 1)}
                            className={comprasPage <= 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer text-gray-900'}
                          />
                        </PaginationItem>
                        {Array.from({ length: Math.min(5, comprasPages) }, (_, i) => {
                          const p = comprasPage <= 3 ? i + 1 : comprasPage - 2 + i;
                          if (p < 1 || p > comprasPages) return null;
                          return (
                            <PaginationItem key={p}>
                              <PaginationLink isActive={p === comprasPage} onClick={() => fetchCompras(p)}
                                className="cursor-pointer text-gray-900">
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => comprasPage < comprasPages && fetchCompras(comprasPage + 1)}
                            className={comprasPage >= comprasPages ? 'pointer-events-none opacity-40' : 'cursor-pointer text-gray-900'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </>
              ) : (
                /* Formulario de nueva compra */
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-gray-900 font-semibold text-lg">Nueva Compra</h3>
                    <Button variant="ghost" onClick={() => setShowCompraForm(false)} className="text-gray-600 hover:text-gray-900">Cancelar</Button>
                  </div>

                  {/* Datos generales */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm text-gray-600">Proveedor</label>
                      <Select value={compraForm.proveedor_id} onValueChange={v => setCompraForm(f => ({ ...f, proveedor_id: v }))}>
                        <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-[#F97316]/30 text-gray-900">
                          {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-gray-600">Fecha de compra</label>
                      <Input type="date" value={compraForm.fecha} onChange={e => setCompraForm(f => ({ ...f, fecha: e.target.value }))} className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-gray-600">N° Factura (opcional)</label>
                      <Input value={compraForm.numero_factura} onChange={e => setCompraForm(f => ({ ...f, numero_factura: e.target.value }))} className="bg-gray-50 border-[#F97316]/20 text-gray-900" placeholder="001-001-000001" />
                    </div>
                  </div>

                  {/* Tipo de pago */}
                  <div className="bg-gray-50 border border-[#F97316]/20 rounded-lg p-4 space-y-3">
                    <label className="text-sm text-[#F97316] font-semibold">Tipo de Pago</label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setCompraForm(f => ({ ...f, tipo_pago: 'contado' }))}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                          compraForm.tipo_pago === 'contado'
                            ? 'bg-[#F97316]/15 border-[#F97316] text-[#F97316]'
                            : 'border-gray-100 text-gray-600 hover:border-white/30'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" /> Pago al Contado
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompraForm(f => ({ ...f, tipo_pago: 'credito' }))}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                          compraForm.tipo_pago === 'credito'
                            ? 'bg-orange-500/15 border-orange-500 text-orange-400'
                            : 'border-gray-100 text-gray-600 hover:border-white/30'
                        }`}
                      >
                        <CreditCard className="w-4 h-4" /> Crédito (CxP)
                      </button>
                    </div>
                    {compraForm.tipo_pago === 'credito' && (
                      <div className="space-y-1 pt-1">
                        <label className="text-sm text-gray-600">Fecha de vencimiento del pago *</label>
                        <Input
                          type="date"
                          value={compraForm.fecha_vencimiento}
                          onChange={e => setCompraForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                          className="bg-gray-50 border-orange-500/40 text-gray-900 max-w-xs"
                          required
                        />
                        <p className="text-xs text-orange-400/70">Se enviará una alerta 5 días antes del vencimiento</p>
                      </div>
                    )}
                  </div>

                  {/* Tabla de ítems */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-[#F97316] font-semibold">Productos comprados</label>
                      <Button type="button" size="sm" variant="ghost" onClick={addCompraItem} className="text-[#F97316] hover:bg-[#F97316]/10">
                        <Plus className="w-4 h-4 mr-1" /> Agregar ítem
                      </Button>
                    </div>

                    <div className="rounded-lg border border-[#F97316]/20 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-[#F97316]/20">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-48">Producto/Descripción</th>
                            <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-24">Cant.</th>
                            <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-28">Total ($)</th>
                            <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Tipo contable</th>
                            <th className="px-2 py-2 text-left text-xs font-bold text-gray-600 w-16">C/unit.</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {compraItems.map((item, idx) => {
                            const costoUnit = Number(item.cantidad) > 0 && Number(item.costo_total) > 0
                              ? (Number(item.costo_total) / Number(item.cantidad)) : 0;
                            const prod = productos.find((p: any) => p.id === item.producto_id);
                            const tipoInfo = TIPOS_COMPRA.find(t => t.id === item.tipo_contable);
                            const badgeColor = item.confianza === 'auto' ? 'bg-green-100 text-green-700 border-green-200'
                              : item.confianza === 'manual' ? 'bg-blue-100 text-blue-700 border-blue-200'
                              : 'bg-yellow-100 text-yellow-700 border-yellow-200';
                            const badgeLabel = item.confianza === 'auto' ? '✓ Auto' : item.confianza === 'manual' ? '✎ Manual' : '? Sugerido';

                            return (
                              <tr key={idx} className="border-b border-[#F97316]/10">
                                {/* Producto o descripción libre */}
                                <td className="px-2 py-1.5">
                                  <Select value={item.producto_id || '__libre__'}
                                    onValueChange={v => updateCompraItem(idx, 'producto_id', v === '__libre__' ? '' : v)}>
                                    <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900 h-7 text-xs mb-1">
                                      <SelectValue placeholder="Del catálogo..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white border-[#F97316]/30 text-gray-900">
                                      <SelectItem value="__libre__">✏️ Descripción libre</SelectItem>
                                      {productos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                  {(!item.producto_id || item.producto_id === '__libre__') && (
                                    <Input placeholder="Ej: Internet, Arriendo, Cuchillo..."
                                      value={item.descripcion_libre || ''}
                                      onChange={e => updateCompraItem(idx, 'descripcion_libre', e.target.value)}
                                      className="bg-gray-50 border-[#F97316]/20 text-gray-900 h-7 text-xs"/>
                                  )}
                                </td>
                                {/* Cantidad */}
                                <td className="px-2 py-1.5">
                                  <Input type="number" min="0" step="0.001" value={item.cantidad}
                                    onChange={e => updateCompraItem(idx, 'cantidad', e.target.value)}
                                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 h-7 text-xs" placeholder="1"/>
                                  {prod?.unidad_medida && <span className="text-xs text-gray-400">{prod.unidad_medida}</span>}
                                </td>
                                {/* Costo total */}
                                <td className="px-2 py-1.5">
                                  <Input type="number" min="0" step="0.01" value={item.costo_total}
                                    onChange={e => updateCompraItem(idx, 'costo_total', e.target.value)}
                                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 h-7 text-xs" placeholder="0.00"/>
                                </td>
                                {/* Tipo contable — selector con badge de confianza */}
                                <td className="px-2 py-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={item.tipo_contable || ''}
                                      onChange={e => {
                                        setCompraItems(prev => prev.map((it, i) =>
                                          i === idx ? { ...it, tipo_contable: e.target.value, confianza: 'manual' } : it
                                        ));
                                      }}
                                      className="flex-1 border border-orange-200 rounded px-1.5 py-1 text-xs bg-white text-gray-900 h-7">
                                      <option value="">— Clasificar —</option>
                                      {TIPOS_COMPRA.map(t => (
                                        <option key={t.id} value={t.id}>{t.label} ({t.cuenta})</option>
                                      ))}
                                    </select>
                                    {item.tipo_contable && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium whitespace-nowrap ${badgeColor}`}>
                                        {badgeLabel}
                                      </span>
                                    )}
                                  </div>
                                  {item.tipo_contable === 'activo_fijo' && Number(item.costo_total) >= UMBRAL_ACTIVO_FIJO && (
                                    <div className="text-xs text-blue-600 mt-0.5">💡 Se sugerirá crear activo fijo</div>
                                  )}
                                </td>
                                {/* Costo unitario */}
                                <td className="px-2 py-1.5 text-right">
                                  <span className={`text-xs font-bold ${costoUnit > 0 ? 'text-[#F97316]' : 'text-gray-400'}`}>
                                    {costoUnit > 0 ? `$${costoUnit.toFixed(2)}` : '—'}
                                  </span>
                                </td>
                                {/* Eliminar */}
                                <td className="px-1 py-1.5">
                                  <button type="button" onClick={() => removeCompraItem(idx)}
                                    disabled={compraItems.length === 1}
                                    className="text-red-400 hover:text-red-600 disabled:opacity-30 p-1">
                                    <Trash2 className="w-3.5 h-3.5"/>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Total */}
                    <div className="flex justify-end">
                      <div className="bg-[#F97316]/10 border border-[#F97316]/30 rounded-lg px-6 py-3 text-right">
                        <span className="text-gray-600 text-sm">Total de compra</span>
                        <div className="text-[#F97316] text-2xl font-bold">
                          ${compraItems.reduce((sum, i) => sum + (Number(i.costo_total) || 0), 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm text-gray-600">Observaciones</label>
                    <Input value={compraForm.observaciones} onChange={e => setCompraForm(f => ({ ...f, observaciones: e.target.value }))} className="bg-gray-50 border-[#F97316]/20 text-gray-900" placeholder="Notas adicionales..." />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => setShowCompraForm(false)} className="flex-1 border-[#F97316]/20 text-gray-600">Cancelar</Button>
                    <Button onClick={submitCompra} disabled={compraSubmitting} className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white font-bold">
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      {compraSubmitting ? 'Registrando...' : 'Registrar Compra'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Vista de Cuentas por Pagar */}
          {view === 'cuentaspagar' && (
            <div className="space-y-4">
              {/* Resumen */}
              {(() => {
                const pendientes = cxp.filter(c => c.estado !== 'pagada');
                const totalPendiente = pendientes.reduce((s, c) => s + (c.saldo_pendiente || 0), 0);
                const vencidas = pendientes.filter(c => c.dias_restantes !== null && c.dias_restantes < 0);
                const proximas = pendientes.filter(c => c.dias_restantes !== null && c.dias_restantes >= 0 && c.dias_restantes <= 5);
                return (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 border border-[#F97316]/20 rounded-xl p-4 text-center">
                      <p className="text-gray-600 text-sm">Total por pagar</p>
                      <p className="text-2xl font-black text-[#F97316]">${totalPendiente.toFixed(2)}</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                      <p className="text-gray-600 text-sm">Facturas vencidas</p>
                      <p className="text-2xl font-black text-red-400">{vencidas.length}</p>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 text-center">
                      <p className="text-gray-600 text-sm">Vencen en 5 días</p>
                      <p className="text-2xl font-black text-orange-400">{proximas.length}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Tabla CxP */}
              {cxp.length === 0 ? (
                <div className="text-center text-gray-600 py-12">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>No hay cuentas por pagar — solo aparecen compras a crédito</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#F97316]/20">
                      <TableHead className="text-gray-600">Proveedor</TableHead>
                      <TableHead className="text-gray-600">Factura</TableHead>
                      <TableHead className="text-gray-600">Emisión</TableHead>
                      <TableHead className="text-gray-600">Vencimiento</TableHead>
                      <TableHead className="text-gray-600 text-right">Monto</TableHead>
                      <TableHead className="text-gray-600 text-right">Saldo</TableHead>
                      <TableHead className="text-gray-600">Estado</TableHead>
                      <TableHead className="text-gray-600 text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cxp.map((item) => {
                      const vencida = item.dias_restantes !== null && item.dias_restantes < 0;
                      const proxima = item.dias_restantes !== null && item.dias_restantes >= 0 && item.dias_restantes <= 5;
                      return (
                        <TableRow key={item.id} className={`border-[#F97316]/10 hover:bg-gray-50 ${vencida ? 'bg-red-500/5' : proxima ? 'bg-orange-500/5' : ''}`}>
                          <TableCell className="text-gray-900 font-medium">{item.proveedor?.nombre || '—'}</TableCell>
                          <TableCell className="text-gray-900 font-mono">{item.numero_factura || '—'}</TableCell>
                          <TableCell className="text-gray-600">{item.fecha_emision ? new Date(item.fecha_emision).toLocaleDateString('es-EC') : '—'}</TableCell>
                          <TableCell>
                            {item.fecha_vencimiento ? (
                              <span className={`text-sm font-medium ${vencida ? 'text-red-400' : proxima ? 'text-orange-400' : 'text-gray-600'}`}>
                                {new Date(item.fecha_vencimiento).toLocaleDateString('es-EC')}
                                {item.dias_restantes !== null && (
                                  <span className="block text-xs">
                                    {vencida ? `Venció hace ${Math.abs(item.dias_restantes)} día(s)` : `${item.dias_restantes} día(s) restantes`}
                                  </span>
                                )}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-gray-900 text-right">${(item.monto || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`font-bold ${item.estado === 'pagada' ? 'text-green-400' : 'text-orange-400'}`}>
                              ${(item.saldo_pendiente || 0).toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              item.estado === 'pagada' ? 'bg-green-500/20 text-green-400' :
                              vencida ? 'bg-red-500/20 text-red-400' :
                              proxima ? 'bg-orange-500/20 text-orange-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }>
                              {item.estado === 'pagada' ? 'Pagada' : vencida ? 'Vencida' : proxima ? 'Por vencer' : 'Pendiente'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {item.estado !== 'pagada' && (
                              cxpPagandoId === item.id ? (
                                <div className="flex items-center gap-2 justify-end">
                                  <Input
                                    type="number" step="0.01" min="0.01"
                                    placeholder="Monto"
                                    value={cxpMontoPago}
                                    onChange={e => setCxpMontoPago(e.target.value)}
                                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 h-8 w-28 text-sm"
                                    autoFocus
                                  />
                                  <Button size="sm" onClick={() => pagarCxP(item.id, Number(cxpMontoPago))}
                                    disabled={!cxpMontoPago || Number(cxpMontoPago) <= 0}
                                    className="h-8 bg-green-600 hover:bg-green-500 text-gray-900 text-xs px-2">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setCxpPagandoId(null); setCxpMontoPago(''); }}
                                    className="h-8 text-gray-600 px-2">
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <Button size="sm" variant="ghost"
                                  onClick={() => { setCxpPagandoId(item.id); setCxpMontoPago(String(item.saldo_pendiente || item.monto)); }}
                                  className="text-green-400 hover:text-green-300 hover:bg-green-500/10">
                                  <DollarSign className="w-4 h-4 mr-1" /> Pagar
                                </Button>
                              )
                            )}
                            {item.estado === 'pagada' && <CheckCircle className="w-4 h-4 text-green-400 ml-auto" />}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {/* Vista de Análisis */}
          {view === 'analysis' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-gray-50 border-[#F97316]/20">
                  <CardHeader>
                    <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Valorización Total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#F97316]">
                      ${inventarioMetrics.valorTotal.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-50 border-orange-500/20">
                  <CardHeader>
                    <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
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

                <Card className="bg-gray-50 border-[#FB923C]/20">
                  <CardHeader>
                    <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Total Movimientos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#FB923C]">
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
                  { name: 'Normal', value: normales, color: '#F97316' },
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

                const COLORS = ['#F97316', '#F59E0B', '#EF4444', '#FB923C', '#10B981'];

                return (
                  <div className="space-y-6">
                    {/* Fila 1: Donut + Movimientos por tipo */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Estado del stock */}
                      <div className="bg-gray-50 border border-[#F97316]/20 rounded-xl p-5">
                        <h3 className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
                          <Package className="w-4 h-4 text-[#F97316]" /> Estado del Stock
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
                              <circle cx="50" cy="50" r="28" fill="#0C0C0C" />
                            </svg>
                          </div>
                          <div className="space-y-2 flex-1">
                            {estadoData.map(s => (
                              <div key={s.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                                  <span className="text-sm text-gray-600">{s.name}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-gray-900 font-bold">{s.value}</span>
                                  <span className="text-gray-600 text-xs ml-1">({Math.round(s.value / total * 100)}%)</span>
                                </div>
                              </div>
                            ))}
                            <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between">
                              <span className="text-gray-600 text-sm">Total productos</span>
                              <span className="text-gray-900 font-bold">{total}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Movimientos por tipo */}
                      <div className="bg-gray-50 border border-[#F97316]/20 rounded-xl p-5">
                        <h3 className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
                          <ArrowLeftRight className="w-4 h-4 text-[#F97316]" /> Movimientos por Tipo
                        </h3>
                        {movData.length === 0 ? (
                          <div className="flex items-center justify-center h-28 text-gray-600 text-sm">Sin movimientos registrados</div>
                        ) : (
                          <div className="space-y-3">
                            {movData.map((m, i) => {
                              const max = Math.max(...movData.map(x => x.value));
                              const pct = Math.round((m.value / max) * 100);
                              const colors = ['#F97316', '#10B981', '#F59E0B', '#FB923C'];
                              return (
                                <div key={m.name} className="space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 capitalize">{m.name}</span>
                                    <span className="text-gray-900 font-bold">{m.value}</span>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
                    <div className="bg-gray-50 border border-[#F97316]/20 rounded-xl p-5">
                      <h3 className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-[#F97316]" /> Top 10 — Mayor Valor en Inventario
                      </h3>
                      {topProductos.length === 0 ? (
                        <div className="text-center text-gray-600 text-sm py-6">
                          Sin datos — registra compras para ver la valorización
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {topProductos.map((p, i) => {
                            const max = topProductos[0].valor;
                            const pct = Math.round((p.valor / max) * 100);
                            return (
                              <div key={i} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3">
                                <span className="text-gray-600 text-sm text-right">{i + 1}</span>
                                <div className="space-y-0.5">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-200">{p.nombre}</span>
                                    <span className="text-[#F97316] font-bold">${p.valor.toFixed(2)}</span>
                                  </div>
                                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-gradient-to-r from-[#C2410C] to-[#F97316]" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                                <span className="text-gray-600 text-xs text-right">{p.stock} u.</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Top 10 por nivel de stock */}
                    <div className="bg-gray-50 border border-[#F97316]/20 rounded-xl p-5">
                      <h3 className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#F97316]" /> Top 10 — Nivel de Stock Actual
                      </h3>
                      {topStock.length === 0 ? (
                        <div className="text-center text-gray-600 text-sm py-6">Sin productos con stock</div>
                      ) : (
                        <div className="space-y-2">
                          {topStock.map((p, i) => {
                            const max = Math.max(topStock[0].stock, 1);
                            const pct = Math.round((p.stock / max) * 100);
                            const bejoPct = p.minimo > 0 ? Math.round((p.minimo / max) * 100) : 0;
                            const alerta = p.stock <= p.minimo;
                            return (
                              <div key={i} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3">
                                <span className="text-gray-600 text-sm text-right">{i + 1}</span>
                                <div className="space-y-0.5">
                                  <div className="flex justify-between text-sm">
                                    <span className={alerta ? 'text-orange-400' : 'text-gray-200'}>{p.nombre}</span>
                                    <span className={`font-bold ${alerta ? 'text-orange-400' : 'text-gray-900'}`}>{p.stock}</span>
                                  </div>
                                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
                                    <div className={`h-full rounded-full ${alerta ? 'bg-orange-400' : 'bg-[#F97316]'}`} style={{ width: `${pct}%` }} />
                                    {bejoPct > 0 && (
                                      <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/70" style={{ left: `${bejoPct}%` }} />
                                    )}
                                  </div>
                                </div>
                                {p.minimo > 0 && (
                                  <span className="text-gray-600 text-xs text-right">mín {p.minimo}</span>
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
          {/* ── VISTA: REPORTES ESPECIALES ──────────────────────── */}
          {view === 'reportes' && (() => {
            const TIPOS = [
              { id: 'mermas',           label: '📦 Reporte de Mermas',              desc: 'Pérdidas, vencimientos y ajustes negativos de stock' },
              { id: 'ventas-producto',  label: '🛒 Historial Ventas por Producto',  desc: 'Qué productos se vendieron, cuánto y a qué precio' },
              { id: 'flujo-caja',       label: '💰 Flujo de Caja Proyectado',       desc: 'CxP vencimientos vs. ventas proyectadas (30/60 días)' },
              { id: 'estado-cliente',   label: '👤 Estado de Cuenta por Cliente',    desc: 'Historial de facturas y saldo de un cliente específico' },
              { id: 'kardex-consolidado', label: '📋 Kardex Consolidado',            desc: 'Todos los movimientos de inventario de todos los productos' },
            ] as const;

            const exportarReporte = () => {
              if (!rptData) return;
              const fecha = new Date().toISOString().split('T')[0];
              if (rptTipo === 'mermas') {
                exportToExcel(
                  (rptData.mermas || []).map((m: any) => ({
                    'Fecha': m.fecha ? new Date(m.fecha).toLocaleString('es-EC') : '—',
                    'Producto': m.producto,
                    'Origen': m.origen,
                    'Cantidad': m.cantidad,
                    'Costo Unit.': m.costo_unitario,
                    'Valor Pérdida': m.valor.toFixed(2),
                    'Motivo': m.motivo,
                  })),
                  `mermas_${fecha}`, 'Reporte de Mermas'
                );
              } else if (rptTipo === 'ventas-producto') {
                exportToExcel(
                  (rptData.productos || []).map((p: any) => ({
                    'Producto': p.nombre,
                    'Código': p.codigo || '',
                    'Categoría': p.categoria || '',
                    'Cantidad Vendida': p.cantidad,
                    'N° Ventas': p.ventas,
                    'Subtotal $': p.subtotal,
                    'Ticket Promedio $': p.ticket_promedio,
                  })),
                  `ventas_producto_${fecha}`, 'Historial Ventas por Producto'
                );
              } else if (rptTipo === 'flujo-caja') {
                exportToExcel(
                  (rptData.proyeccion || []).map((p: any) => ({
                    'Semana': p.semana,
                    'Ingresos Proyectados $': p.ingresos_proyectados,
                    'Pagos CxP $': p.egresos_cxp,
                    'Balance $': p.balance,
                  })),
                  `flujo_caja_${fecha}`, 'Flujo de Caja Proyectado'
                );
              } else if (rptTipo === 'estado-cliente') {
                exportToExcel(
                  (rptData.facturas || []).map((f: any) => ({
                    'N° Factura': f.numero_factura || '—',
                    'Fecha Emisión': f.fecha_emision || '—',
                    'Total $': Number(f.total || 0).toFixed(2),
                    'Estado': f.estado_autorizacion || f.estado || '—',
                    'N° Autorización': f.numero_autorizacion || '—',
                  })),
                  `estado_cuenta_${rptData.cliente?.nombre || 'cliente'}_${fecha}`,
                  `Estado de Cuenta — ${rptData.cliente?.nombre || 'Cliente'}`
                );
              } else if (rptTipo === 'kardex-consolidado') {
                exportToExcel(
                  (rptData.kardex || []).map((f: any) => ({
                    'Fecha': new Date(f.fecha).toLocaleString('es-EC'),
                    'Producto': f.producto,
                    'Tipo': f.tipo,
                    'Referencia': f.referencia,
                    'Entrada': f.entrada ?? '',
                    'Salida': f.salida ?? '',
                    'Saldo': f.saldo,
                    'Costo Unit.': f.costo_unitario,
                    'Valor Mov. $': f.valor.toFixed(2),
                  })),
                  `kardex_consolidado_${fecha}`, 'Kardex Consolidado'
                );
              }
            };

            return (
              <div className="space-y-5 p-2">
                {/* Selector tipo de reporte */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {TIPOS.map(t => (
                    <button key={t.id} onClick={() => { setRptTipo(t.id); setRptData(null); }}
                      className={`rounded-xl border-2 p-4 text-left transition-all ${rptTipo === t.id
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 bg-white hover:border-orange-300'}`}>
                      <div className="font-bold text-sm text-gray-900">{t.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{t.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Parámetros del reporte */}
                <div className="bg-gray-50 rounded-xl p-4 flex flex-wrap gap-3 items-end">
                  {(rptTipo === 'mermas' || rptTipo === 'ventas-producto' || rptTipo === 'kardex-consolidado') && (<>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Desde</label>
                      <input type="date" value={rptDesde} onChange={e => setRptDesde(e.target.value)}
                        className="border border-orange-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Hasta</label>
                      <input type="date" value={rptHasta} onChange={e => setRptHasta(e.target.value)}
                        className="border border-orange-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900" />
                    </div>
                  </>)}
                  {rptTipo === 'flujo-caja' && (
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Proyección (días)</label>
                      <select value={rptDias} onChange={e => setRptDias(e.target.value)}
                        className="border border-orange-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900">
                        <option value="30">30 días</option>
                        <option value="60">60 días</option>
                        <option value="90">90 días</option>
                      </select>
                    </div>
                  )}
                  {rptTipo === 'estado-cliente' && (
                    <div className="flex-1 min-w-[220px]">
                      <label className="text-xs text-gray-600 block mb-1">Cliente</label>
                      <select value={rptClienteId} onChange={e => setRptClienteId(e.target.value)}
                        className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900">
                        <option value="">— Seleccionar cliente —</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.identificacion || '—'})</option>)}
                      </select>
                    </div>
                  )}
                  <Button onClick={fetchReporte} disabled={rptLoading}
                    className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                    {rptLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                    Generar Reporte
                  </Button>
                  {rptData && (
                    <Button variant="outline" onClick={exportarReporte}
                      className="border-green-300 text-green-600 hover:bg-green-50">
                      <Download className="w-4 h-4 mr-2" /> Exportar Excel
                    </Button>
                  )}
                </div>

                {/* Resultados */}
                {rptLoading && <div className="text-center py-12"><RefreshCw className="w-8 h-8 mx-auto animate-spin text-orange-500 mb-2" /><p className="text-gray-500">Generando reporte…</p></div>}

                {/* MERMAS */}
                {rptData && rptTipo === 'mermas' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">{rptData.resumen?.total_eventos || 0}</div>
                        <div className="text-xs text-red-500 mt-1">Total eventos de merma</div>
                      </div>
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-orange-600">{Number(rptData.resumen?.total_cantidad || 0).toFixed(2)}</div>
                        <div className="text-xs text-orange-500 mt-1">Unidades perdidas</div>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-700">${Number(rptData.resumen?.total_valor || 0).toFixed(2)}</div>
                        <div className="text-xs text-red-500 mt-1">Valor total pérdida</div>
                      </div>
                    </div>
                    {(rptData.por_producto || []).length > 0 && (
                      <div className="rounded-xl border border-orange-100 overflow-hidden">
                        <Table>
                          <TableHeader><TableRow className="bg-gray-50">
                            <TableHead className="text-xs font-bold uppercase text-gray-600">Producto</TableHead>
                            <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Eventos</TableHead>
                            <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Cantidad</TableHead>
                            <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Valor Pérdida</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {(rptData.por_producto || []).map((p: any, i: number) => (
                              <TableRow key={i} className={i % 2 === 0 ? '' : 'bg-gray-50/40'}>
                                <TableCell className="font-medium text-gray-900">{p.producto}</TableCell>
                                <TableCell className="text-right text-gray-600">{p.eventos}</TableCell>
                                <TableCell className="text-right font-mono text-orange-600">{p.cantidad.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-mono font-bold text-red-600">${p.valor.toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {(rptData.mermas || []).length === 0 && <div className="text-center py-8 text-gray-400">Sin mermas registradas en el período</div>}
                  </div>
                )}

                {/* VENTAS POR PRODUCTO */}
                {rptData && rptTipo === 'ventas-producto' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600">{rptData.resumen?.total_productos_vendidos || 0}</div>
                        <div className="text-xs text-blue-500 mt-1">Productos distintos vendidos</div>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">{Number(rptData.resumen?.total_cantidad || 0).toFixed(0)}</div>
                        <div className="text-xs text-green-500 mt-1">Unidades totales</div>
                      </div>
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-orange-600">${Number(rptData.resumen?.total_subtotal || 0).toFixed(2)}</div>
                        <div className="text-xs text-orange-500 mt-1">Ingresos totales</div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-orange-100 overflow-hidden">
                      <Table>
                        <TableHeader><TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-bold uppercase text-gray-600">#</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600">Producto</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600">Categoría</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Cantidad</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">N° Ventas</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Subtotal $</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Ticket Prom.</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {(rptData.productos || []).map((p: any, i: number) => (
                            <TableRow key={p.producto_id || i} className={i % 2 === 0 ? '' : 'bg-gray-50/40'}>
                              <TableCell className="text-gray-400 text-sm">{i+1}</TableCell>
                              <TableCell className="font-medium text-gray-900">{p.nombre}</TableCell>
                              <TableCell className="text-gray-500 text-sm">{p.categoria || '—'}</TableCell>
                              <TableCell className="text-right font-mono text-gray-700">{Number(p.cantidad).toFixed(2)}</TableCell>
                              <TableCell className="text-right text-gray-500">{p.ventas}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-orange-600">${p.subtotal.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-mono text-gray-600">${p.ticket_promedio.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* FLUJO DE CAJA */}
                {rptData && rptTipo === 'flujo-caja' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">${Number(rptData.saldo_caja_actual||0).toFixed(2)}</div>
                        <div className="text-xs text-green-500 mt-1">Saldo caja actual</div>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">${Number(rptData.cxp_pendiente_total||0).toFixed(2)}</div>
                        <div className="text-xs text-red-500 mt-1">CxP pendiente en {rptDias} días</div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600">${Number(rptData.venta_promedio_diaria||0).toFixed(2)}</div>
                        <div className="text-xs text-blue-500 mt-1">Venta promedio diaria (30d)</div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-orange-100 overflow-hidden">
                      <Table>
                        <TableHeader><TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-bold uppercase text-gray-600">Semana</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-green-600 text-right">Ingresos Proyectados</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-red-600 text-right">Pagos CxP</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Balance</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {(rptData.proyeccion || []).map((p: any, i: number) => (
                            <TableRow key={i} className={i % 2 === 0 ? '' : 'bg-gray-50/40'}>
                              <TableCell className="text-gray-700 font-medium">{p.semana}</TableCell>
                              <TableCell className="text-right font-mono text-green-600">${p.ingresos_proyectados.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-mono text-red-600">${p.egresos_cxp.toFixed(2)}</TableCell>
                              <TableCell className={`text-right font-mono font-bold ${p.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {p.balance >= 0 ? '+' : ''}${p.balance.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {(rptData.cxp || []).length > 0 && (
                      <div>
                        <h3 className="text-sm font-bold text-gray-700 mb-2">Pagos CxP pendientes en el período</h3>
                        <div className="rounded-xl border border-red-100 overflow-hidden">
                          <Table>
                            <TableHeader><TableRow className="bg-red-50">
                              <TableHead className="text-xs font-bold uppercase text-gray-600">Proveedor</TableHead>
                              <TableHead className="text-xs font-bold uppercase text-gray-600">Vencimiento</TableHead>
                              <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Saldo Pendiente</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {(rptData.cxp || []).map((p: any, i: number) => (
                                <TableRow key={i}>
                                  <TableCell className="text-gray-900">{p.proveedor_nombre || '—'}</TableCell>
                                  <TableCell className="text-gray-600">{p.fecha_vencimiento || '—'}</TableCell>
                                  <TableCell className="text-right font-mono font-bold text-red-600">${Number(p.saldo_pendiente||0).toFixed(2)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ESTADO DE CUENTA CLIENTE */}
                {rptData && rptTipo === 'estado-cliente' && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <div className="font-bold text-lg text-gray-900">{rptData.cliente?.nombre || '—'}</div>
                      <div className="text-gray-600 text-sm">{rptData.cliente?.identificacion} · {rptData.cliente?.email || ''} · {rptData.cliente?.telefono || ''}</div>
                      <div className="grid grid-cols-3 gap-4 mt-3">
                        <div><div className="text-2xl font-bold text-blue-600">{rptData.resumen?.total_documentos || 0}</div><div className="text-xs text-blue-500">Facturas</div></div>
                        <div><div className="text-2xl font-bold text-green-600">{rptData.resumen?.autorizadas || 0}</div><div className="text-xs text-green-500">Autorizadas</div></div>
                        <div><div className="text-2xl font-bold text-orange-600">${Number(rptData.resumen?.total_facturado||0).toFixed(2)}</div><div className="text-xs text-orange-500">Total Facturado</div></div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-blue-100 overflow-hidden">
                      <Table>
                        <TableHeader><TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-bold uppercase text-gray-600">N° Factura</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600">Fecha</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Total $</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600 text-center">Estado</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {(rptData.facturas || []).map((f: any, i: number) => (
                            <TableRow key={i} className={i % 2 === 0 ? '' : 'bg-gray-50/40'}>
                              <TableCell className="font-mono text-sm text-gray-900">{f.numero_factura || '—'}</TableCell>
                              <TableCell className="text-gray-600 text-sm">{f.fecha_emision || '—'}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-gray-900">${Number(f.total||0).toFixed(2)}</TableCell>
                              <TableCell className="text-center">
                                <Badge className={`text-xs ${(f.estado_autorizacion || f.estado) === 'AUTORIZADO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {f.estado_autorizacion || f.estado || '—'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* KARDEX CONSOLIDADO */}
                {rptData && rptTipo === 'kardex-consolidado' && (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
                      {rptData.total_movimientos} movimientos · Exporta a Excel para ver el detalle completo
                    </div>
                    <div className="rounded-xl border border-orange-100 overflow-hidden max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader><TableRow className="bg-gray-50 sticky top-0">
                          <TableHead className="text-xs font-bold uppercase text-gray-600">Fecha</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600">Producto</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600">Tipo</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-green-600 text-right">Entrada</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-red-600 text-right">Salida</TableHead>
                          <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Saldo</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {(rptData.kardex || []).slice(0, 200).map((f: any, i: number) => (
                            <TableRow key={i} className={i % 2 === 0 ? '' : 'bg-gray-50/40'}>
                              <TableCell className="text-xs text-gray-500 whitespace-nowrap">{new Date(f.fecha).toLocaleString('es-EC', {day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'})}</TableCell>
                              <TableCell className="text-sm text-gray-900 max-w-[160px] truncate">{f.producto}</TableCell>
                              <TableCell><Badge className="text-xs bg-gray-100 text-gray-600">{f.tipo}</Badge></TableCell>
                              <TableCell className="text-right font-mono text-green-600 text-sm">{f.entrada != null ? `+${Number(f.entrada).toFixed(2)}` : ''}</TableCell>
                              <TableCell className="text-right font-mono text-red-600 text-sm">{f.salida != null ? `-${Number(f.salida).toFixed(2)}` : ''}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-gray-900 text-sm">{Number(f.saldo).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {(rptData.kardex || []).length > 200 && <p className="text-xs text-gray-400 text-center">Mostrando primeros 200 de {rptData.total_movimientos} — exporta Excel para el listado completo</p>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── VISTA: KARDEX ───────────────────────────────────────── */}
          {view === 'kardex' && (
            <div className="space-y-4 p-2">
              {/* Selector de producto y fechas */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs text-gray-600 block mb-1">Producto</label>
                  <select
                    value={kardexProductoId}
                    onChange={e => setKardexProductoId(e.target.value)}
                    className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                  >
                    <option value="">— Seleccionar producto —</option>
                    {productos.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` (${p.codigo})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Desde</label>
                  <input type="date" value={kardexDesde} onChange={e => setKardexDesde(e.target.value)}
                    className="border border-orange-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Hasta</label>
                  <input type="date" value={kardexHasta} onChange={e => setKardexHasta(e.target.value)}
                    className="border border-orange-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white" />
                </div>
                <Button onClick={() => fetchKardex()} disabled={!kardexProductoId || kardexLoading}
                  className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                  {kardexLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  Consultar
                </Button>
                {kardexData && (
                  <Button variant="outline" size="sm" onClick={() => exportToExcel(
                    (kardexData.kardex || []).map((f: any) => ({
                      'Fecha': new Date(f.fecha).toLocaleString('es-EC'),
                      'Tipo': f.tipo,
                      'Referencia': f.referencia,
                      'Motivo': f.motivo,
                      'Entrada': f.entrada ?? '',
                      'Salida': f.salida ?? '',
                      'Saldo': f.saldo,
                      'Costo Unit.': f.costo_unitario,
                      'Valor Mov.': f.valor_movimiento.toFixed(2),
                    })),
                    `kardex_${kardexData.producto?.nombre}_${new Date().toISOString().split('T')[0]}`,
                    `Kardex ${kardexData.producto?.nombre}`
                  )} className="border-green-300 text-green-600 hover:bg-green-50">
                    <Download className="w-4 h-4 mr-1" /> Excel
                  </Button>
                )}
              </div>

              {/* Resumen rápido */}
              {kardexData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold text-blue-600">{kardexData.total_movimientos}</div>
                    <div className="text-xs text-blue-500 mt-1">Total movimientos</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold text-green-600">
                      {(kardexData.kardex || []).filter((f: any) => f.entrada).reduce((s: number, f: any) => s + (f.entrada || 0), 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-green-500 mt-1">Total entradas</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold text-red-600">
                      {(kardexData.kardex || []).filter((f: any) => f.salida).reduce((s: number, f: any) => s + (f.salida || 0), 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-red-500 mt-1">Total salidas</div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold text-orange-600">{Number(kardexData.saldo_final || 0).toFixed(2)}</div>
                    <div className="text-xs text-orange-500 mt-1">Saldo final</div>
                  </div>
                </div>
              )}

              {/* Tabla Kardex */}
              {!kardexData && !kardexLoading && (
                <div className="text-center py-16 text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>Selecciona un producto y haz clic en Consultar</p>
                </div>
              )}
              {kardexLoading && (
                <div className="text-center py-16 text-gray-500">
                  <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-orange-500" />
                  <p>Cargando movimientos…</p>
                </div>
              )}
              {kardexData && !kardexLoading && (
                <div className="overflow-x-auto rounded-xl border border-orange-100">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 border-orange-100">
                        <TableHead className="text-xs font-bold uppercase text-gray-600">Fecha</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-gray-600">Tipo</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-gray-600">Referencia / Motivo</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-gray-600 text-right text-green-700">Entrada</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-gray-600 text-right text-red-700">Salida</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Saldo</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Costo Unit.</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(kardexData.kardex || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                            Sin movimientos en el período seleccionado
                          </TableCell>
                        </TableRow>
                      ) : (kardexData.kardex || []).map((fila: any, idx: number) => (
                        <TableRow key={fila.id || idx} className={`border-orange-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                          <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                            {new Date(fila.fecha).toLocaleString('es-EC', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${
                              fila.entrada
                                ? 'bg-green-100 text-green-700 border-green-200'
                                : 'bg-red-100 text-red-700 border-red-200'
                            }`}>
                              {fila.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-gray-600 max-w-[200px]">
                            <div className="font-medium">{fila.referencia || '—'}</div>
                            {fila.motivo && <div className="text-gray-400">{fila.motivo}</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-700 font-bold text-sm">
                            {fila.entrada != null ? `+${Number(fila.entrada).toFixed(2)}` : ''}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-600 font-bold text-sm">
                            {fila.salida != null ? `-${Number(fila.salida).toFixed(2)}` : ''}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-gray-900 text-sm">
                            {Number(fila.saldo).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-gray-500 text-xs">
                            ${Number(fila.costo_unitario).toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-gray-700 text-xs">
                            ${Number(fila.valor_movimiento).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* ── VISTA: COMPARATIVO ──────────────────────────────────── */}
          {view === 'comparativo' && (
            <div className="space-y-4 p-2">
              {/* Selector de períodos */}
              <div className="flex flex-wrap gap-3 items-end bg-gray-50 rounded-xl p-4">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Período 1 (base)</label>
                  <input type="month" value={compPeriodo1} onChange={e => setCompPeriodo1(e.target.value)}
                    className="border border-orange-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white" />
                </div>
                <div className="text-gray-400 font-bold text-xl pb-2">vs</div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Período 2 (comparar)</label>
                  <input type="month" value={compPeriodo2} onChange={e => setCompPeriodo2(e.target.value)}
                    className="border border-orange-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white" />
                </div>
                <Button onClick={fetchComparativo} disabled={compLoading || !compPeriodo1 || !compPeriodo2}
                  className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                  {compLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <BarChart3 className="w-4 h-4 mr-2" />}
                  Comparar
                </Button>
                {!compData?.periodo1?.tiene_snapshot || !compData?.periodo2?.tiene_snapshot ? (
                  <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠️ Usa <strong>Cerrar Mes</strong> al final de cada mes para habilitar comparativas históricas
                  </div>
                ) : null}
              </div>

              {/* Snapshots disponibles */}
              {snapshots.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-gray-500 self-center">Snapshots disponibles:</span>
                  {snapshots.slice(0, 12).map(s => (
                    <button key={s.id}
                      onClick={() => {
                        const p = `${s.anio}-${String(s.mes).padStart(2,'0')}`;
                        if (!compPeriodo1) setCompPeriodo1(p);
                        else setCompPeriodo2(p);
                      }}
                      className="text-xs bg-purple-100 text-purple-700 border border-purple-200 rounded-full px-3 py-1 hover:bg-purple-200 transition-colors">
                      {String(s.mes).padStart(2,'0')}/{s.anio}
                    </button>
                  ))}
                </div>
              )}

              {/* Resumen */}
              {compData?.resumen && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <div className="text-xs text-blue-500 mb-1">{compPeriodo1}</div>
                    <div className="text-2xl font-bold text-blue-700">${Number(compData.resumen.valor_total_p1||0).toFixed(2)}</div>
                    <div className="text-xs text-blue-400 mt-1">Valor inventario</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <div className="text-xs text-green-500 mb-1">{compPeriodo2}</div>
                    <div className="text-2xl font-bold text-green-700">${Number(compData.resumen.valor_total_p2||0).toFixed(2)}</div>
                    <div className="text-xs text-green-400 mt-1">Valor inventario</div>
                  </div>
                  <div className={`border rounded-xl p-4 text-center ${(compData.resumen.var_valor_pct||0) >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="text-xs text-gray-500 mb-1">Variación</div>
                    <div className={`text-2xl font-bold ${(compData.resumen.var_valor_pct||0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {(compData.resumen.var_valor_pct||0) > 0 ? '+' : ''}{compData.resumen.var_valor_pct ?? '—'}%
                    </div>
                    <div className="text-xs text-gray-400 mt-1">en valor de inventario</div>
                  </div>
                </div>
              )}

              {/* Buscador + Exportar */}
              {compData && (
                <div className="flex gap-3 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input placeholder="Buscar producto…" value={compFiltro}
                      onChange={e => setCompFiltro(e.target.value)}
                      className="pl-9 bg-white border-orange-200" />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => exportToExcel(
                    (compData.comparativa || []).map((r: any) => ({
                      'Producto':              r.nombre,
                      'Unidad':                r.unidad,
                      [`Stock ${compPeriodo1}`]:   r.stock_p1 ?? '—',
                      [`Stock ${compPeriodo2}`]:   r.stock_p2 ?? '—',
                      [`Salidas ${compPeriodo1}`]: r.ventas_p1?.toFixed(2) ?? '—',
                      [`Salidas ${compPeriodo2}`]: r.ventas_p2?.toFixed(2) ?? '—',
                      'Var. Stock %':   r.var_stock_pct ?? '—',
                      'Var. Salidas %': r.var_ventas_pct ?? '—',
                    })),
                    `comparativo_${compPeriodo1}_vs_${compPeriodo2}`,
                    `Comparativo ${compPeriodo1} vs ${compPeriodo2}`
                  )} className="border-green-300 text-green-600 hover:bg-green-50 whitespace-nowrap">
                    <Download className="w-4 h-4 mr-1" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportToPDF(
                    (compData.comparativa || []).map((r: any) => ({
                      nombre:     r.nombre,
                      stock_p1:   String(r.stock_p1 ?? '—'),
                      stock_p2:   String(r.stock_p2 ?? '—'),
                      var_stock:  r.var_stock_pct != null ? `${r.var_stock_pct}%` : '—',
                      ventas_p1:  r.ventas_p1?.toFixed(2) ?? '—',
                      ventas_p2:  r.ventas_p2?.toFixed(2) ?? '—',
                      var_ventas: r.var_ventas_pct != null ? `${r.var_ventas_pct}%` : '—',
                    })),
                    [
                      { header: 'Producto',          key: 'nombre' },
                      { header: `Stock ${compPeriodo1}`,   key: 'stock_p1' },
                      { header: `Stock ${compPeriodo2}`,   key: 'stock_p2' },
                      { header: 'Var. Stock',          key: 'var_stock' },
                      { header: `Salidas ${compPeriodo1}`, key: 'ventas_p1' },
                      { header: `Salidas ${compPeriodo2}`, key: 'ventas_p2' },
                      { header: 'Var. Salidas',        key: 'var_ventas' },
                    ],
                    `Comparativo ${compPeriodo1} vs ${compPeriodo2}`,
                    `comparativo_${compPeriodo1}_vs_${compPeriodo2}`
                  )} className="border-red-300 text-red-600 hover:bg-red-50 whitespace-nowrap">
                    <Download className="w-4 h-4 mr-1" /> PDF
                  </Button>
                </div>
              )}

              {/* Tabla comparativa */}
              {!compData && !compLoading && (
                <div className="text-center py-16 text-gray-500">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>Selecciona dos períodos y haz clic en Comparar</p>
                  <p className="text-xs mt-2">Necesitas haber hecho "Cerrar Mes" en ambos períodos</p>
                </div>
              )}
              {compLoading && (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 mx-auto animate-spin text-orange-500 mb-2" />
                  <p className="text-gray-500">Calculando comparativa…</p>
                </div>
              )}
              {compData && !compLoading && (
                <div className="overflow-x-auto rounded-xl border border-orange-100">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs font-bold uppercase text-gray-600">Producto</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-blue-600 text-right">Stock {compPeriodo1}</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-green-600 text-right">Stock {compPeriodo2}</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-blue-600 text-right">Salidas {compPeriodo1}</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-green-600 text-right">Salidas {compPeriodo2}</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Var. Stock</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-gray-600 text-right">Var. Salidas</TableHead>
                        <TableHead className="text-xs font-bold uppercase text-gray-600 text-center">Tendencia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(compData.comparativa || [])
                        .filter((r: any) => !compFiltro || r.nombre.toLowerCase().includes(compFiltro.toLowerCase()))
                        .map((r: any) => {
                          const vsColor = r.var_ventas_pct === null ? '' : r.var_ventas_pct >= 0 ? 'text-green-600' : 'text-red-600';
                          const vsIcon  = r.var_ventas_pct === null ? '—' : r.var_ventas_pct >= 20 ? '📈 Alto' : r.var_ventas_pct <= -20 ? '📉 Alerta' : r.var_ventas_pct >= 0 ? '↗ Sube' : '↘ Baja';
                          return (
                            <TableRow key={r.producto_id} className="border-orange-50 hover:bg-orange-50/30">
                              <TableCell className="font-medium text-gray-900 text-sm">{r.nombre}</TableCell>
                              <TableCell className="text-right font-mono text-gray-600 text-sm">{r.stock_p1 ?? '—'}</TableCell>
                              <TableCell className="text-right font-mono text-gray-600 text-sm">{r.stock_p2 ?? '—'}</TableCell>
                              <TableCell className="text-right font-mono text-blue-600 text-sm">{r.ventas_p1?.toFixed(2) ?? '—'}</TableCell>
                              <TableCell className="text-right font-mono text-green-600 text-sm">{r.ventas_p2?.toFixed(2) ?? '—'}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {r.var_stock_pct !== null ? (
                                  <span className={r.var_stock_pct >= 0 ? 'text-green-600' : 'text-red-600'}>
                                    {r.var_stock_pct > 0 ? '+' : ''}{r.var_stock_pct}%
                                  </span>
                                ) : '—'}
                              </TableCell>
                              <TableCell className={`text-right font-mono text-sm font-bold ${vsColor}`}>
                                {r.var_ventas_pct !== null ? `${r.var_ventas_pct > 0 ? '+' : ''}${r.var_ventas_pct}%` : '—'}
                              </TableCell>
                              <TableCell className="text-center text-sm">{vsIcon}</TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* ── VISTA: CONTEO FÍSICO ─────────────────────────────────── */}
          {view === 'conteo' && (() => {
            const prodFiltrados = productos.filter(p => {
              const matchSearch = !conteoFiltro ||
                p.nombre?.toLowerCase().includes(conteoFiltro.toLowerCase()) ||
                p.codigo?.toLowerCase().includes(conteoFiltro.toLowerCase());
              const matchCat = conteoCategoria === 'todas' || p.categoria === conteoCategoria;
              return matchSearch && matchCat;
            });

            // Calcular filas con diferencia
            const filas = prodFiltrados.map(p => {
              const stockSistema = Number(p.stock_actual ?? p.stock ?? 0);
              const fisico       = conteoFisico[p.id] !== undefined ? Number(conteoFisico[p.id]) : null;
              const diferencia   = fisico !== null ? fisico - stockSistema : null;
              const costo        = Number(p.precio_compra || p.costo_unitario || p.precio_costo || 0);
              const valorDif     = diferencia !== null ? diferencia * costo : null;
              return { ...p, stockSistema, fisico, diferencia, costo, valorDif };
            }).filter(f => !conteoSoloVarianza || (f.diferencia !== null && f.diferencia !== 0));

            // Resumen
            const contados  = filas.filter(f => f.fisico !== null).length;
            const faltante  = filas.filter(f => f.diferencia !== null && f.diferencia < 0);
            const sobrante  = filas.filter(f => f.diferencia !== null && f.diferencia > 0);
            const valFalt   = faltante.reduce((s, f) => s + Math.abs(f.valorDif ?? 0), 0);
            const valSobr   = sobrante.reduce((s, f) => s + (f.valorDif ?? 0), 0);

            const aplicarAjuste = async () => {
              const conDif = filas.filter(f => f.diferencia !== null && f.diferencia !== 0);
              if (conDif.length === 0) { toast.error('No hay diferencias para ajustar'); return; }
              if (!confirm(`¿Aplicar ajuste para ${conDif.length} productos? Esto actualizará el stock al conteo físico.`)) return;
              setConteoAplicando(true);
              const headers = await getAuthHeaders();
              const { projectId } = await import('/utils/supabase/info');
              const BASE_URL = `https://${projectId}.supabase.co/functions/v1/server`;

              // Procesar en bloques de 50 (batch processing)
              const BATCH = 50;
              let ok = 0; const errores: string[] = [];

              for (let i = 0; i < conDif.length; i += BATCH) {
                const bloque = conDif.slice(i, i + BATCH);
                await Promise.all(bloque.map(async f => {
                  try {
                    const tipo = f.diferencia! > 0 ? 'entrada' : 'salida';
                    const res = await fetch(`${BASE_URL}/inventario/movimientos`, {
                      method: 'POST',
                      headers: { ...headers, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tipo,
                        producto_id: f.id,
                        producto_nombre: f.nombre,
                        cantidad: Math.abs(f.diferencia!),
                        costo_unitario: f.costo,
                        motivo: 'ajuste_inventario',
                        referencia: `Conteo ${conteoFecha}`,
                        observaciones: conteoNota || `Ajuste conteo físico ${conteoFecha}`,
                      }),
                    });
                    if (res.ok) ok++;
                    else {
                      const errData = await res.json().catch(() => ({}));
                      errores.push(`${f.nombre}: ${errData.error || res.status}`);
                    }
                  } catch (e: any) {
                    errores.push(`${f.nombre}: ${e.message}`);
                  }
                }));
              }

              setConteoAplicando(false);
              if (ok > 0) {
                toast.success(`✅ ${ok} ajustes aplicados en bloques de ${BATCH}${errores.length > 0 ? ` · ${errores.length} errores` : ''}`);
                if (errores.length > 0) toast.error('Errores: ' + errores.slice(0,3).join(' | '));
                await fetchInventario();
                await fetchProductos();
                setConteoFisico({});
              } else {
                toast.error('No se pudieron aplicar los ajustes. Errores: ' + errores.slice(0,2).join(' | '));
              }
            };

            const exportarConteo = () => {
              exportToExcel(
                filas.map(f => ({
                  'Código':         f.codigo || '',
                  'Producto':       f.nombre,
                  'Categoría':      f.categoria || '',
                  'Unidad':         f.unidad_medida || 'und',
                  'Stock Sistema':  f.stockSistema,
                  'Stock Físico':   f.fisico ?? '',
                  'Diferencia':     f.diferencia ?? '',
                  'Costo Unit.':    f.costo,
                  'Valor Diferencia': f.valorDif !== null ? Number(f.valorDif.toFixed(2)) : '',
                  'Estado':         f.diferencia === null ? 'Sin contar' : f.diferencia < 0 ? 'FALTANTE' : f.diferencia > 0 ? 'SOBRANTE' : 'OK',
                })),
                `conteo_fisico_${conteoFecha}`,
                `Conteo Físico ${conteoFecha}`
              );
            };

            const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const text = ev.target?.result as string;
                if (!text) { toast.error('No se pudo leer el archivo'); return; }

                // Detectar separador: coma o punto y coma (Excel español usa ;)
                const firstLine = text.split('\n')[0] || '';
                const sep = firstLine.includes(';') ? ';' : ',';

                // Columnas del template exportado:
                // 0:Código | 1:Producto | 2:Categoría | 3:Unidad | 4:Stock Sistema | 5:Stock Físico | 6:Diferencia...
                const lines = text.split('\n').slice(1); // saltar encabezado
                const nuevos: Record<string, string> = {};
                let importados = 0;

                // Encontrar índice de "Stock Físico" en el encabezado
                const header = firstLine.split(sep).map(c => c.replace(/^"|"$/g, '').trim().toLowerCase());
                const idxStockFisico = header.findIndex(h =>
                  h.includes('físico') || h.includes('fisico') || h.includes('stock f') || h.includes('conteo')
                );
                // Si no se encuentra en encabezado, usar columna 5 por defecto
                const colStockFisico = idxStockFisico >= 0 ? idxStockFisico : 5;

                for (const line of lines) {
                  if (!line.trim()) continue;
                  const cols = line.split(sep).map(c => c.replace(/^"|"$/g, '').trim());
                  if (cols.length < 2) continue;

                  const codigo  = cols[0] || '';
                  const nombre  = cols[1] || '';
                  // Normalizar número: reemplazar coma decimal europea por punto
                  const cantRaw = cols[colStockFisico] || '';
                  const cantStr = cantRaw.replace(/[^0-9.,]/g, '').replace(',', '.');

                  if (!cantStr || cantStr === '' || isNaN(Number(cantStr))) continue;
                  if (Number(cantStr) < 0) continue;

                  const prod = productos.find((p: any) =>
                    (codigo && (p.codigo === codigo || p.id === codigo)) ||
                    (nombre && p.nombre?.toLowerCase().trim() === nombre.toLowerCase().trim())
                  );

                  if (prod) {
                    nuevos[prod.id] = cantStr;
                    importados++;
                  }
                }

                if (importados > 0) {
                  setConteoFisico(prev => ({ ...prev, ...nuevos }));
                  toast.success(`✅ ${importados} productos importados — columna "${header[colStockFisico] || 'Stock Físico'}" (índice ${colStockFisico})`);
                } else {
                  toast.error(
                    `No se importó nada. Encabezados detectados: [${header.slice(0,6).join(' | ')}]. ` +
                    `Separador: "${sep}". ` +
                    `Asegúrate de llenar la columna "Stock Físico" y guardar como CSV UTF-8.`
                  );
                }
              };
              reader.readAsText(file, 'UTF-8');
              e.target.value = '';
            };

            return (
              <div className="space-y-4 p-2">
                {/* Barra de herramientas */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Fecha del conteo</label>
                    <input type="date" value={conteoFecha} onChange={e => setConteoFecha(e.target.value)}
                      className="border border-orange-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white" />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-gray-600 block mb-1">Buscar producto</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input placeholder="Nombre o código…" value={conteoFiltro}
                        onChange={e => setConteoFiltro(e.target.value)}
                        className="pl-9 bg-white border-orange-200 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Categoría</label>
                    <select value={conteoCategoria} onChange={e => setConteoCategoria(e.target.value)}
                      className="border border-orange-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white">
                      <option value="todas">Todas</option>
                      {categorias.map(c => <option key={c.id || c} value={c.nombre || c}>{c.nombre || c}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-4">
                    <input type="checkbox" checked={conteoSoloVarianza}
                      onChange={e => setConteoSoloVarianza(e.target.checked)}
                      className="accent-orange-500" />
                    Solo con diferencia
                  </label>
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" onClick={exportarConteo}
                      className="border-orange-300 text-orange-600 hover:bg-orange-50">
                      <Download className="w-4 h-4 mr-1" /> Exportar
                    </Button>
                    <label className="cursor-pointer">
                      <Button variant="outline" size="sm" asChild
                        className="border-blue-300 text-blue-600 hover:bg-blue-50">
                        <span><FileText className="w-4 h-4 mr-1" /> Importar CSV</span>
                      </Button>
                      <input type="file" accept=".csv,.txt,.xls,.xlsx" className="hidden" onChange={importarExcel} />
                    </label>
                    <Button size="sm" onClick={aplicarAjuste} disabled={conteoAplicando}
                      className="bg-gradient-to-r from-green-600 to-green-500 text-white">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      {conteoAplicando ? 'Aplicando…' : 'Aplicar Ajuste'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setConteoFisico({})}
                      className="border-gray-300 text-gray-500">
                      <X className="w-4 h-4 mr-1" /> Limpiar
                    </Button>
                  </div>
                </div>

                {/* Notas del conteo */}
                <Input placeholder="Notas del conteo (opcional)…" value={conteoNota}
                  onChange={e => setConteoNota(e.target.value)}
                  className="bg-white border-orange-200 text-sm" />

                {/* Tarjetas resumen */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-blue-600">{productos.length}</div>
                    <div className="text-xs text-blue-500 mt-1">Total productos</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-green-600">{contados}</div>
                    <div className="text-xs text-green-500 mt-1">Contados</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-red-600">{faltante.length}</div>
                    <div className="text-xs text-red-500 mt-1">Con faltante</div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-orange-600">{sobrante.length}</div>
                    <div className="text-xs text-orange-500 mt-1">Con sobrante</div>
                  </div>
                  <div className={`rounded-xl p-3 text-center border ${valFalt > valSobr ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                    <div className={`text-xl font-bold ${valFalt > valSobr ? 'text-red-600' : 'text-green-600'}`}>
                      ${Math.abs(valSobr - valFalt).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {valFalt > valSobr ? `Pérdida neta` : `Ganancia neta`}
                    </div>
                  </div>
                </div>

                {/* Tabla principal */}
                <div className="overflow-x-auto rounded-xl border border-orange-100">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 border-orange-100">
                        <TableHead className="text-gray-600 text-xs font-bold uppercase">Producto</TableHead>
                        <TableHead className="text-gray-600 text-xs font-bold uppercase">Código</TableHead>
                        <TableHead className="text-gray-600 text-xs font-bold uppercase">Unidad</TableHead>
                        <TableHead className="text-gray-600 text-xs font-bold uppercase text-right">Sistema</TableHead>
                        <TableHead className="text-gray-600 text-xs font-bold uppercase text-center w-36">Físico (contar)</TableHead>
                        <TableHead className="text-gray-600 text-xs font-bold uppercase text-right">Diferencia</TableHead>
                        <TableHead className="text-gray-600 text-xs font-bold uppercase text-right">Costo Unit.</TableHead>
                        <TableHead className="text-gray-600 text-xs font-bold uppercase text-right">Valor Dif.</TableHead>
                        <TableHead className="text-gray-600 text-xs font-bold uppercase text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-gray-500 py-12">
                            <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            No hay productos para mostrar
                          </TableCell>
                        </TableRow>
                      ) : filas.map((f, idx) => {
                        const rowBg = f.diferencia === null ? ''
                          : f.diferencia < 0 ? 'bg-red-50'
                          : f.diferencia > 0 ? 'bg-orange-50'
                          : 'bg-green-50';
                        return (
                          <TableRow key={f.id} className={`border-orange-100/50 hover:brightness-95 transition-all ${rowBg}`}>
                            <TableCell className="font-medium text-gray-900 text-sm">{f.nombre}</TableCell>
                            <TableCell className="text-gray-500 text-xs font-mono">{f.codigo || '—'}</TableCell>
                            <TableCell className="text-gray-500 text-xs">{f.unidad_medida || 'und'}</TableCell>
                            <TableCell className="text-right font-mono text-gray-700 text-sm">{f.stockSistema.toFixed(2)}</TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0"
                                value={conteoFisico[f.id] ?? ''}
                                onChange={e => setConteoFisico(prev => ({
                                  ...prev,
                                  [f.id]: e.target.value,
                                }))}
                                className="w-24 mx-auto text-center text-sm font-mono bg-white border-orange-200 focus:border-orange-400 h-8"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-sm">
                              {f.diferencia !== null ? (
                                <span className={f.diferencia < 0 ? 'text-red-600' : f.diferencia > 0 ? 'text-orange-600' : 'text-green-600'}>
                                  {f.diferencia > 0 ? '+' : ''}{f.diferencia.toFixed(2)}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </TableCell>
                            <TableCell className="text-right text-gray-500 text-xs font-mono">${f.costo.toFixed(4)}</TableCell>
                            <TableCell className="text-right font-mono font-bold text-sm">
                              {f.valorDif !== null ? (
                                <span className={f.valorDif < 0 ? 'text-red-600' : f.valorDif > 0 ? 'text-orange-600' : 'text-green-600'}>
                                  {f.valorDif > 0 ? '+' : ''}${Math.abs(f.valorDif).toFixed(2)}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </TableCell>
                            <TableCell className="text-center">
                              {f.diferencia === null ? (
                                <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">Sin contar</Badge>
                              ) : f.diferencia < 0 ? (
                                <Badge className="text-xs bg-red-100 text-red-700 border-red-200">
                                  ▼ Faltante
                                </Badge>
                              ) : f.diferencia > 0 ? (
                                <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">
                                  ▲ Sobrante
                                </Badge>
                              ) : (
                                <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                                  ✓ OK
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Resumen de valores al final */}
                {contados > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="text-sm text-red-600 font-semibold mb-2 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4" /> Total Faltante
                      </div>
                      <div className="text-2xl font-bold text-red-700">${valFalt.toFixed(2)}</div>
                      <div className="text-xs text-red-500 mt-1">{faltante.length} productos · {faltante.reduce((s,f)=>s+Math.abs(f.diferencia??0),0).toFixed(2)} unidades</div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                      <div className="text-sm text-orange-600 font-semibold mb-2 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Total Sobrante
                      </div>
                      <div className="text-2xl font-bold text-orange-700">${valSobr.toFixed(2)}</div>
                      <div className="text-xs text-orange-500 mt-1">{sobrante.length} productos · {sobrante.reduce((s,f)=>s+(f.diferencia??0),0).toFixed(2)} unidades</div>
                    </div>
                    <div className={`border rounded-xl p-4 ${valFalt > valSobr ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <div className={`text-sm font-semibold mb-2 flex items-center gap-2 ${valFalt > valSobr ? 'text-red-600' : 'text-green-600'}`}>
                        <DollarSign className="w-4 h-4" /> Balance Neto
                      </div>
                      <div className={`text-2xl font-bold ${valFalt > valSobr ? 'text-red-700' : 'text-green-700'}`}>
                        {valFalt > valSobr ? '-' : '+'}${Math.abs(valSobr - valFalt).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{contados} de {productos.length} productos contados</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

        </CardContent>
      </Card>

      {/* Modal de vista detalle de compra (solo lectura) */}
      {viewingCompra && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[#F97316]/30 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#F97316]/20 p-5 flex justify-between items-center z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-[#F97316]" />
                  Factura de Compra
                  <span className="font-mono text-[#F97316] text-base">{viewingCompra.numero_factura || '—'}</span>
                </h2>
                <p className="text-gray-600 text-sm mt-0.5">Solo lectura — no se puede editar</p>
              </div>
              <button onClick={() => setViewingCompra(null)} className="text-gray-600 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Encabezado */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-gray-600">Proveedor</p><p className="text-gray-900 font-medium">{viewingCompra.proveedor?.nombre || '—'}</p></div>
                <div><p className="text-gray-600">Fecha</p><p className="text-gray-900">{new Date(viewingCompra.fecha || viewingCompra.created_at).toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' })}</p></div>
                <div><p className="text-gray-600">Tipo de Pago</p>
                  <Badge className={viewingCompra.tipo_pago === 'credito' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}>
                    {viewingCompra.tipo_pago === 'credito' ? 'Crédito' : 'Contado'}
                  </Badge>
                </div>
                {viewingCompra.tipo_pago === 'credito' && viewingCompra.fecha_vencimiento && (
                  <div><p className="text-gray-600">Vencimiento</p><p className="text-orange-400 font-medium">{new Date(viewingCompra.fecha_vencimiento).toLocaleDateString('es-EC')}</p></div>
                )}
              </div>
              {viewingCompra.observaciones && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                  <span className="text-gray-600">Obs.: </span>{viewingCompra.observaciones}
                </div>
              )}
              {/* Tabla de ítems */}
              <Table>
                <TableHeader>
                  <TableRow className="border-[#F97316]/20 bg-gray-50">
                    <TableHead className="text-gray-600">Producto</TableHead>
                    <TableHead className="text-gray-600 text-right">Cantidad</TableHead>
                    <TableHead className="text-gray-600 text-right">Costo Unit.</TableHead>
                    <TableHead className="text-gray-600 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(viewingCompra.items || []).map((item: any, idx: number) => (
                    <TableRow key={idx} className="border-[#F97316]/10">
                      <TableCell className="text-gray-900">{item.producto?.nombre || `Producto ${item.producto_id?.slice(0,8)}`}</TableCell>
                      <TableCell className="text-gray-600 text-right">{item.cantidad} {item.producto?.unidad_medida || ''}</TableCell>
                      <TableCell className="text-gray-600 text-right">${(item.costo_unitario || 0).toFixed(4)}</TableCell>
                      <TableCell className="text-[#F97316] font-bold text-right">${(item.costo_total || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Total */}
              <div className="flex justify-end">
                <div className="bg-[#F97316]/10 border border-[#F97316]/30 rounded-lg px-6 py-3 text-right">
                  <span className="text-gray-600 text-sm">Total de compra</span>
                  <div className="text-[#F97316] text-2xl font-black">${(viewingCompra.total_compra || 0).toFixed(2)}</div>
                  {viewingCompra.tipo_pago === 'credito' && viewingCompra.saldo_pendiente > 0 && (
                    <div className="text-orange-400 text-sm mt-1">Saldo pendiente: ${(viewingCompra.saldo_pendiente || 0).toFixed(2)}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Modal: Importar XML SRI */}
      <ImportarXMLModal
        open={showImportarXML}
        onClose={() => setShowImportarXML(false)}
        onCompraRegistrada={() => {
          fetchCompras();
          fetchInventario();
          fetchCxP();
        }}
        proveedores={proveedores}
        productos={productos}
        getAuthHeaders={getAuthHeaders}
      />

      {/* Diálogo de retención */}
      {retenciónCompra && (
        <RetenciónDialog
          open={!!retenciónCompra}
          onOpenChange={(v) => { if (!v) setRetenciónCompra(null); }}
          compra={retenciónCompra}
          onSuccess={() => setRetenciónCompra(null)}
        />
      )}
    </div>
  );
}