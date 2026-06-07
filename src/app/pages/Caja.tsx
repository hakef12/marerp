import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ExportButtons } from '../components/ExportButtons';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  DollarSign, TrendingUp, TrendingDown, RefreshCw, X,
  AlertCircle, CheckCircle2, Clock, ArrowUpCircle, ArrowDownCircle,
  ShoppingCart, Wallet, Receipt, BarChart3, Utensils,
} from 'lucide-react';
import { ROLES_ADMIN } from '../utils/permisos';
import { useBodega } from '../context/BodegaContext';

// ─── Types ────────────────────────────────────────────────────

interface Movimiento {
  id: string;
  tipo: 'venta' | 'ingreso_manual' | 'gasto' | 'retiro' | 'apertura' | 'cierre';
  monto: number;
  descripcion: string;
  usuario_nombre: string;
  fecha: string;
  metodo_pago?: string;
}

interface Sesion {
  id: string;
  estado: 'abierta' | 'cerrada';
  cajero_nombre: string;
  monto_apertura: number;
  fecha_apertura: string;
  fecha_cierre: string | null;
  movimientos: Movimiento[];
  monto_real?: number;
}

const TIPO_CONFIG: Record<string, { label: string; color: string; icon: any; signo: string }> = {
  venta:         { label: 'Venta',           color: 'text-green-400',  icon: ShoppingCart,    signo: '+' },
  ingreso_manual:{ label: 'Ingreso Manual',  color: 'text-blue-400',   icon: ArrowUpCircle,   signo: '+' },
  gasto:         { label: 'Gasto',           color: 'text-orange-400', icon: ArrowDownCircle, signo: '-' },
  retiro:        { label: 'Retiro',          color: 'text-red-400',    icon: ArrowDownCircle, signo: '-' },
  apertura:      { label: 'Apertura',        color: 'text-[#F97316]',  icon: CheckCircle2,    signo: '' },
  cierre:        { label: 'Cierre',          color: 'text-gray-600',   icon: Clock,           signo: '' },
};

function fmt(n: number) {
  return n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function apiH(token: string) {
  return { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token, 'Content-Type': 'application/json' };
}
const BASE = `https://${projectId}.supabase.co/functions/v1/server/caja`;

// ─── Componente principal ─────────────────────────────────────

export default function Caja() {
  const { token, user } = useAuth();
  const { bodegaActiva } = useBodega();
  const navigate = useNavigate();
  const esAdmin = ROLES_ADMIN.includes(user?.rol ?? '');

  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [loading, setLoading] = useState(true);
  const [historial, setHistorial] = useState<Sesion[]>([]);
  const [arqueo, setArqueo] = useState<any>(null);
  const [tab, setTab] = useState<'principal' | 'movimientos' | 'historial' | 'arqueo' | 'ventas'>('principal');

  // Modales
  const [modalApertura, setModalApertura] = useState(false);
  const [modalCierre, setModalCierre] = useState(false);
  const [modalMovimiento, setModalMovimiento] = useState(false);

  // Formularios
  const [fMontoApertura, setFMontoApertura] = useState('0');
  const [fObsApertura, setFObsApertura] = useState('');
  const [fMontoDeclarado, setFMontoDeclarado] = useState('');
  const [fObsCierre, setFObsCierre] = useState('');
  const [fTipoMov, setFTipoMov] = useState<'ingreso_manual' | 'gasto' | 'retiro'>('ingreso_manual');
  const [fMontoMov, setFMontoMov] = useState('');
  const [fDescMov, setFDescMov] = useState('');

  // Ventas del día + anulación
  const [ventas, setVentas] = useState<any[]>([]);
  const [ventasLoading, setVentasLoading] = useState(false);
  const [modalAnular, setModalAnular] = useState(false);
  const [ventaAnularId, setVentaAnularId] = useState('');
  const [ventaAnularTicket, setVentaAnularTicket] = useState('');
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);

  const fetchEstado = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = bodegaActiva ? `?bodega_id=${bodegaActiva.id}` : '';
      const res = await fetch(`${BASE}/estado${params}`, { headers: apiH(token) });
      const data = await res.json();
      setSesion(data.sesion);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [token, bodegaActiva]);

  const fetchHistorial = useCallback(async () => {
    if (!token) return;
    try {
      const params = bodegaActiva ? `?bodega_id=${bodegaActiva.id}` : '';
      const res = await fetch(`${BASE}/historial${params}`, { headers: apiH(token) });
      const data = await res.json();
      setHistorial(data.historial || []);
    } catch { /* */ }
  }, [token, bodegaActiva]);

  const fetchArqueo = useCallback(async () => {
    if (!token || !sesion) return;
    try {
      const params = bodegaActiva ? `?bodega_id=${bodegaActiva.id}` : '';
      const res = await fetch(`${BASE}/arqueo${params}`, { headers: apiH(token) });
      const data = await res.json();
      setArqueo(data);
    } catch { /* */ }
  }, [token, sesion, bodegaActiva]);

  const fetchVentas = useCallback(async () => {
    if (!token) return;
    setVentasLoading(true);
    try {
      const hoy = new Date().toISOString().split('T')[0];
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/pos/ventas?fecha_inicio=${hoy}&fecha_fin=${hoy}&limit=100`,
        { headers: apiH(token) }
      );
      if (res.ok) {
        const data = await res.json();
        setVentas((data.ventas || []).sort((a: any, b: any) =>
          new Date(b.created_at || b.fecha).getTime() - new Date(a.created_at || a.fecha).getTime()
        ));
      }
    } catch { /* silencioso */ }
    finally { setVentasLoading(false); }
  }, [token]);

  const handleAnularVenta = async () => {
    if (!motivoAnulacion.trim()) { toast.error('Ingresa el motivo de anulación'); return; }
    setAnulando(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/pos/ventas/${ventaAnularId}/anular`,
        { method: 'POST', headers: apiH(token), body: JSON.stringify({ motivo: motivoAnulacion }) }
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(`Venta ${ventaAnularTicket} anulada correctamente`);
        setModalAnular(false);
        setMotivoAnulacion('');
        fetchVentas();
        fetchEstado(); // actualizar totales de caja
        window.dispatchEvent(new Event('dashboard:refresh')); // sincronizar KPIs del dashboard
      } else {
        toast.error(data.error || 'Error al anular la venta');
      }
    } catch { toast.error('Error de conexión'); }
    finally { setAnulando(false); }
  };

  // Carga inicial
  useEffect(() => { fetchEstado(); }, [fetchEstado]);

  // Refrescar datos de pestañas secundarias cuando cambia la pestaña
  useEffect(() => {
    if (tab === 'historial') fetchHistorial();
    if (tab === 'arqueo') fetchArqueo();
    if (tab === 'ventas') fetchVentas();
  }, [tab, fetchHistorial, fetchArqueo, fetchVentas]);

  const post = async (url: string, body: any) => {
    const res = await fetch(url, { method: 'POST', headers: apiH(token!), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  };

  const handleAbrirCaja = async () => {
    try {
      await post(`${BASE}/apertura`, {
        monto_apertura: Number(fMontoApertura) || 0,
        observaciones: fObsApertura,
        bodega_id: bodegaActiva?.id,
        bodega_nombre: bodegaActiva?.nombre,
      });
      toast.success('Caja abierta exitosamente');
      setModalApertura(false);
      setFMontoApertura('0'); setFObsApertura('');
      fetchEstado();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleCerrarCaja = async () => {
    const monto = parseFloat(fMontoDeclarado);
    if (isNaN(monto)) return toast.error('Ingresa el monto declarado');
    try {
      const data = await post(`${BASE}/cierre`, {
        monto_declarado: monto,
        observaciones: fObsCierre,
        bodega_id: bodegaActiva?.id,
      });
      const r = data.resumen;
      toast.success(
        `Caja cerrada. Ventas: $${fmt(r.total_ventas)} | Diferencia: $${fmt(r.diferencia)}`,
        { duration: 6000 }
      );
      setModalCierre(false);
      setFMontoDeclarado(''); setFObsCierre('');
      fetchEstado();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleMovimiento = async () => {
    const monto = parseFloat(fMontoMov);
    if (isNaN(monto) || monto <= 0) return toast.error('El monto debe ser mayor a 0');
    if (!fDescMov.trim()) return toast.error('Ingresa una descripción');
    try {
      await post(`${BASE}/movimiento`, {
        tipo: fTipoMov,
        monto,
        descripcion: fDescMov,
        bodega_id: bodegaActiva?.id,
      });
      toast.success('Movimiento registrado');
      setModalMovimiento(false);
      setFMontoMov(''); setFDescMov('');
      fetchEstado();
    } catch (e: any) { toast.error(e.message); }
  };

  const movimientos = sesion?.movimientos ?? [];
  const totalVentas   = movimientos.filter(m => m.tipo === 'venta').reduce((s, m) => s + m.monto, 0);
  const totalIngresos = movimientos.filter(m => m.tipo === 'ingreso_manual').reduce((s, m) => s + m.monto, 0);
  const totalGastos   = movimientos.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);
  const totalRetiros  = movimientos.filter(m => m.tipo === 'retiro').reduce((s, m) => s + m.monto, 0);

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Gestión de Caja</h1>
          <p className="text-gray-600 text-sm">Control de apertura, cierre, movimientos y arqueo</p>
        </div>
        <div className="flex gap-2">
          <ExportButtons
            variant="compact"
            onExportExcel={() => exportToExcel(
              (sesion?.movimientos ?? []).map(m => ({
                'Tipo': TIPO_CONFIG[m.tipo]?.label ?? m.tipo,
                'Monto': m.monto,
                'Descripción': m.descripcion,
                'Método Pago': m.metodo_pago || '',
                'Usuario': m.usuario_nombre,
                'Fecha': m.fecha,
              })),
              'caja_movimientos',
              'Movimientos de Caja',
            )}
            onExportPDF={() => exportToPDF(
              sesion?.movimientos ?? [],
              [
                { header: 'Tipo', key: 'tipo' },
                { header: 'Monto ($)', key: 'monto' },
                { header: 'Descripción', key: 'descripcion' },
                { header: 'Usuario', key: 'usuario_nombre' },
                { header: 'Fecha', key: 'fecha' },
              ],
              'Reporte de Movimientos de Caja',
              'caja_movimientos',
            )}
          />
          <button onClick={fetchEstado} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-[#F97316]/20 text-gray-600 hover:text-gray-900 transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {!sesion && (
            <Button className="bg-gradient-to-r from-[#C2410C] to-[#F97316] hover:opacity-90" onClick={() => setModalApertura(true)}>
              <CheckCircle2 className="w-4 h-4 mr-2" /> Abrir Caja
            </Button>
          )}
          {sesion && (
            <>
              {/* Accesos rápidos cuando caja está abierta */}
              <Button variant="outline" className="border-[#F97316]/20 text-[#F97316] hover:bg-[#F97316]/10" onClick={() => navigate('/mesas')}>
                <Utensils className="w-4 h-4 mr-1.5" /> Mesas
              </Button>
              <Button variant="outline" className="border-[#F97316]/20 text-[#F97316] hover:bg-[#F97316]/10" onClick={() => navigate('/pos')}>
                <ShoppingCart className="w-4 h-4 mr-1.5" /> Vender
              </Button>
              <Button variant="outline" className="border-[#F97316]/30 text-[#F97316]" onClick={() => setModalMovimiento(true)}>
                <DollarSign className="w-4 h-4 mr-2" /> Movimiento
              </Button>
              {(esAdmin || sesion.cajero_nombre === user?.nombre) && (
                <Button variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => { setFMontoDeclarado(fmt(sesion.monto_real ?? 0).replace(',', '')); setModalCierre(true); }}>
                  <X className="w-4 h-4 mr-2" /> Cerrar Caja
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Estado de caja ─────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin" /></div>
      ) : !sesion ? (
        <Card className="bg-white border-gray-700/40 text-center py-12">
          <CardContent>
            <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-600 text-lg font-medium">Caja cerrada</p>
            <p className="text-gray-600 text-sm mt-1 mb-4">Abre la caja para registrar movimientos y ventas</p>
            <Button className="bg-gradient-to-r from-[#C2410C] to-[#F97316]" onClick={() => setModalApertura(true)}>
              <CheckCircle2 className="w-4 h-4 mr-2" /> Abrir Caja Ahora
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Estado banner */}
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 font-bold text-sm">CAJA ABIERTA</span>
            </div>
            {bodegaActiva && (
              <span className="text-gray-600 text-sm">Sucursal: <span className="text-yellow-400 font-medium">{bodegaActiva.nombre}</span></span>
            )}
            <span className="text-gray-600 text-sm">Cajero: <span className="text-gray-900 font-medium">{sesion.cajero_nombre}</span></span>
            <span className="text-gray-600 text-sm">Apertura: <span className="text-gray-900 font-medium">{new Date(sesion.fecha_apertura).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</span></span>
            <span className="ml-auto text-[#F97316] font-bold text-xl">${fmt(sesion.monto_real ?? 0)}</span>
            <span className="text-gray-600 text-xs">en caja</span>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Ventas', val: totalVentas,   icon: ShoppingCart,    color: 'text-green-400',  bg: 'bg-green-500/10' },
              { label: 'Ingresos', val: totalIngresos, icon: ArrowUpCircle,  color: 'text-blue-400',   bg: 'bg-blue-500/10' },
              { label: 'Gastos',  val: totalGastos,   icon: ArrowDownCircle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
              { label: 'Retiros', val: totalRetiros,  icon: ArrowDownCircle, color: 'text-red-400',    bg: 'bg-red-500/10' },
            ].map(k => (
              <Card key={k.label} className={`${k.bg} border-0`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-600 text-sm">{k.label}</p>
                    <k.icon className={`w-4 h-4 ${k.color}`} />
                  </div>
                  <p className={`text-2xl font-bold ${k.color}`}>${fmt(k.val)}</p>
                  <p className="text-gray-600 text-xs">{movimientos.filter(m => m.tipo === k.label.toLowerCase().replace(' ', '_') || (k.label === 'Ventas' && m.tipo === 'venta') || (k.label === 'Ingresos' && m.tipo === 'ingreso_manual')).length} movs.</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {[
              { id: 'principal', label: 'Resumen' },
              { id: 'movimientos', label: `Movimientos (${movimientos.length})` },
              { id: 'ventas', label: 'Ventas del día' },
              { id: 'arqueo', label: 'Arqueo' },
              { id: 'historial', label: 'Historial' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  tab === t.id
                    ? 'border-[#F97316] text-[#F97316]'
                    : 'border-transparent text-gray-600 hover:text-gray-600'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Resumen ──────────────────────────────── */}
          {tab === 'principal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-white border-[#F97316]/10">
                <CardHeader><CardTitle className="text-gray-900 text-base">Resumen de la sesión</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: 'Monto apertura', val: sesion.monto_apertura },
                    { label: 'Total ventas', val: totalVentas },
                    { label: 'Ingresos manuales', val: totalIngresos },
                    { label: 'Gastos / Egresos', val: -totalGastos },
                    { label: 'Retiros', val: -totalRetiros },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                      <span className="text-gray-600 text-sm">{row.label}</span>
                      <span className={`font-semibold ${row.val < 0 ? 'text-red-400' : 'text-gray-900'}`}>
                        {row.val < 0 ? '-' : ''}${fmt(Math.abs(row.val))}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-[#F97316]/20">
                    <span className="text-[#F97316] font-bold">Total en caja</span>
                    <span className="text-[#F97316] font-bold text-xl">${fmt(sesion.monto_real ?? 0)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-[#F97316]/10">
                <CardHeader><CardTitle className="text-gray-900 text-base">Últimos movimientos</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {movimientos.slice(-10).reverse().map(m => {
                      const cfg = TIPO_CONFIG[m.tipo] ?? TIPO_CONFIG.venta;
                      const Icon = cfg.icon;
                      return (
                        <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                          <div className={`w-8 h-8 rounded-lg ${cfg.color.replace('text-', 'bg-').replace('-400', '-500/20')} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-4 h-4 ${cfg.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-900 text-xs font-medium truncate">{m.descripcion}</p>
                            <p className="text-gray-600 text-[10px]">{new Date(m.fecha).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <span className={`font-bold text-sm ${['gasto','retiro'].includes(m.tipo) ? 'text-red-400' : cfg.color}`}>
                            {['gasto','retiro'].includes(m.tipo) ? '-' : ['venta','ingreso_manual'].includes(m.tipo) ? '+' : ''}
                            ${fmt(m.monto)}
                          </span>
                        </div>
                      );
                    })}
                    {movimientos.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Sin movimientos aún</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab: Movimientos ─────────────────────────── */}
          {tab === 'movimientos' && (
            <Card className="bg-white border-[#F97316]/10">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-gray-600 px-4 py-3 font-medium">Hora</th>
                        <th className="text-left text-gray-600 px-4 py-3 font-medium">Tipo</th>
                        <th className="text-left text-gray-600 px-4 py-3 font-medium">Descripción</th>
                        <th className="text-left text-gray-600 px-4 py-3 font-medium">Usuario</th>
                        <th className="text-right text-gray-600 px-4 py-3 font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...movimientos].reverse().map(m => {
                        const cfg = TIPO_CONFIG[m.tipo];
                        return (
                          <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-600 text-xs">{new Date(m.fecha).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-4 py-3"><span className={`${cfg.color} text-xs font-semibold`}>{cfg.label}</span></td>
                            <td className="px-4 py-3 text-gray-900 text-xs">{m.descripcion}</td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{m.usuario_nombre}</td>
                            <td className={`px-4 py-3 text-right font-bold text-sm ${['gasto','retiro'].includes(m.tipo) ? 'text-red-400' : ['venta','ingreso_manual'].includes(m.tipo) ? 'text-green-400' : 'text-gray-600'}`}>
                              {['gasto','retiro'].includes(m.tipo) ? '-' : ['venta','ingreso_manual'].includes(m.tipo) ? '+' : ''}${fmt(m.monto)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {movimientos.length === 0 && <div className="text-center py-8 text-gray-600">Sin movimientos registrados</div>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Tab: Arqueo ──────────────────────────────── */}
          {tab === 'arqueo' && arqueo && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-white border-[#F97316]/10">
                <CardHeader><CardTitle className="text-gray-900 text-base flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[#F97316]" /> Arqueo de Caja</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: 'Monto apertura', val: arqueo.monto_apertura },
                    { label: 'Ventas efectivo', val: arqueo.por_tipo?.ventas_efectivo },
                    { label: 'Ventas tarjeta', val: arqueo.por_tipo?.ventas_tarjeta },
                    { label: 'Ingresos manuales', val: arqueo.por_tipo?.ingresos_manuales },
                    { label: 'Gastos', val: -arqueo.por_tipo?.gastos },
                    { label: 'Retiros', val: -arqueo.por_tipo?.retiros },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-600 text-sm">{row.label}</span>
                      <span className={`font-medium text-sm ${(row.val ?? 0) < 0 ? 'text-red-400' : 'text-gray-900'}`}>
                        {(row.val ?? 0) < 0 ? '-' : ''}${fmt(Math.abs(row.val ?? 0))}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-[#F97316]/30">
                    <span className="text-[#F97316] font-bold">Total real en caja</span>
                    <span className="text-[#F97316] font-bold">${fmt(arqueo.monto_real ?? 0)}</span>
                  </div>
                  <p className="text-gray-600 text-xs">Duración: {Math.floor((arqueo.duracion_minutos ?? 0) / 60)}h {(arqueo.duracion_minutos ?? 0) % 60}m</p>
                </CardContent>
              </Card>
              <Card className="bg-white border-[#F97316]/10">
                <CardHeader><CardTitle className="text-gray-900 text-base">Resumen ventas</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-center py-4">
                    <p className="text-gray-600 text-sm">Total ventas</p>
                    <p className="text-4xl font-black text-gray-900">${fmt(arqueo.por_tipo?.total_ventas ?? 0)}</p>
                    <p className="text-gray-600 text-sm mt-1">{arqueo.por_tipo?.cantidad_ventas ?? 0} transacciones</p>
                  </div>
                  <div className="bg-[#F97316]/5 border border-[#F97316]/20 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Efectivo</span>
                      <span className="text-gray-900 font-medium">${fmt(arqueo.por_tipo?.ventas_efectivo ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tarjeta / Transferencia</span>
                      <span className="text-gray-900 font-medium">${fmt(arqueo.por_tipo?.ventas_tarjeta ?? 0)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab: Ventas del día ──────────────────────── */}
          {tab === 'ventas' && (
            <Card className="bg-white border-[#F97316]/10">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-gray-900 text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#F97316]" /> Ventas del día
                </CardTitle>
                <button onClick={fetchVentas} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600" title="Refrescar">
                  <RefreshCw className={`w-4 h-4 ${ventasLoading ? 'animate-spin' : ''}`} />
                </button>
              </CardHeader>
              <CardContent className="p-0">
                {ventasLoading ? (
                  <div className="text-center py-8 text-gray-600 text-sm">Cargando ventas...</div>
                ) : ventas.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 text-sm">Sin ventas registradas hoy</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left text-gray-600 px-4 py-3 font-medium">Hora</th>
                          <th className="text-left text-gray-600 px-4 py-3 font-medium">Ticket</th>
                          <th className="text-left text-gray-600 px-4 py-3 font-medium">Cliente / Mesa</th>
                          <th className="text-left text-gray-600 px-4 py-3 font-medium">Pago</th>
                          <th className="text-right text-gray-600 px-4 py-3 font-medium">Total</th>
                          <th className="text-center text-gray-600 px-4 py-3 font-medium">Estado</th>
                          {esAdmin && <th className="px-4 py-3"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {ventas.map(v => {
                          const anulada = v.anulada || v.estado === 'anulada';
                          return (
                            <tr key={v.id} className={`border-b border-gray-100 hover:bg-gray-50 ${anulada ? 'opacity-50' : ''}`}>
                              <td className="px-4 py-3 text-gray-600 text-xs">
                                {new Date(v.created_at || v.fecha).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-4 py-3 text-gray-900 font-mono text-xs">{v.numero_ticket || v.numero || '—'}</td>
                              <td className="px-4 py-3 text-gray-900 text-xs">
                                {v.mesa ? `Mesa ${v.mesa}` : v.cliente_nombre || v.tipo_servicio || '—'}
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-xs capitalize">{v.forma_pago || v.metodo_pago || '—'}</td>
                              <td className="px-4 py-3 text-right font-bold text-gray-900">${fmt(Number(v.total || 0))}</td>
                              <td className="px-4 py-3 text-center">
                                {anulada ? (
                                  <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">Anulada</span>
                                ) : (
                                  <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">Válida</span>
                                )}
                              </td>
                              {esAdmin && (
                                <td className="px-4 py-3 text-center">
                                  <div className="flex gap-1.5 justify-center">
                                    {!anulada && (
                                      <button
                                        onClick={() => { setVentaAnularId(v.id); setVentaAnularTicket(v.numero_ticket || v.numero || v.id); setModalAnular(true); }}
                                        className="px-2 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                      >
                                        Anular
                                      </button>
                                    )}
                                    {!anulada && (
                                      <button
                                        onClick={async () => {
                                          const idCliente = prompt('RUC/Cédula del cliente (dejar vacío = Consumidor Final):') || '9999999999999';
                                          const nombre = idCliente === '9999999999999' ? 'Consumidor Final' : (prompt('Razón social:') || 'Consumidor Final');
                                          const email  = prompt('Email (opcional):') || '';
                                          try {
                                            const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/facturacion/generar`, {
                                              method: 'POST',
                                              headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                venta_id: v.id,
                                                cliente: { identificacion: idCliente, tipo_identificacion: idCliente.length === 13 ? '04' : '05', razon_social: nombre, email },
                                              }),
                                            });
                                            const d = await res.json();
                                            if (res.ok) toast.success(`✅ Factura ${d.numero_factura || ''} generada`);
                                            else toast.error(d.error || 'Error generando factura');
                                          } catch (e: any) { toast.error(e.message); }
                                        }}
                                        title="Generar factura electrónica para esta venta"
                                        className="px-2 py-1 text-xs font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors"
                                      >
                                        📄 Fact.
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Tab: Historial ───────────────────────────── */}
          {tab === 'historial' && (
            <div className="space-y-3">
              {historial.length === 0 && <div className="text-center py-8 text-gray-600">Sin historial de sesiones</div>}
              {historial.map((s, i) => (
                <Card key={s.id} className="bg-white border-gray-100">
                  <CardContent className="p-4 flex flex-wrap items-center gap-4">
                    <div>
                      <p className="text-gray-900 font-semibold text-sm">{s.cajero_nombre}</p>
                      <p className="text-gray-600 text-xs">{new Date(s.fecha_apertura).toLocaleDateString('es-EC')} {new Date(s.fecha_apertura).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })} — {s.fecha_cierre ? new Date(s.fecha_cierre).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) : 'En curso'}</p>
                    </div>
                    <div className="ml-auto flex gap-6 text-sm">
                      <div className="text-center">
                        <p className="text-gray-600 text-xs">Apertura</p>
                        <p className="text-gray-900 font-medium">${fmt(s.monto_apertura)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-600 text-xs">Ventas</p>
                        <p className="text-green-400 font-medium">${fmt(s.movimientos.filter(m => m.tipo === 'venta').reduce((a, m) => a + m.monto, 0))}</p>
                      </div>
                      {(s as any).diferencia !== null && (
                        <div className="text-center">
                          <p className="text-gray-600 text-xs">Diferencia</p>
                          <p className={`font-medium ${Math.abs((s as any).diferencia ?? 0) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
                            ${fmt(Math.abs((s as any).diferencia ?? 0))}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modal: Anular Venta ────────────────────────── */}
      {modalAnular && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md bg-white border-red-400/40 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900 text-xl font-bold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" /> Anular Venta
                </h2>
                <button onClick={() => { setModalAnular(false); setMotivoAnulacion(''); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <p className="font-semibold">Ticket: {ventaAnularTicket}</p>
                <p className="mt-1 text-xs">Esta acción marcará la venta como anulada y revertirá el stock de los productos. <strong>No se puede deshacer.</strong></p>
              </div>
              <div>
                <Label className="text-gray-700 mb-1.5 block text-sm font-medium">Motivo de anulación *</Label>
                <Input
                  value={motivoAnulacion}
                  onChange={e => setMotivoAnulacion(e.target.value)}
                  placeholder="Ej: Error en el pedido, cliente canceló..."
                  className="bg-gray-50 border-red-200 text-gray-900"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-300 text-gray-700" onClick={() => { setModalAnular(false); setMotivoAnulacion(''); }}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold"
                  onClick={handleAnularVenta}
                  disabled={anulando || !motivoAnulacion.trim()}
                >
                  {anulando ? 'Anulando...' : 'Confirmar Anulación'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Modal: Apertura de Caja ─────────────────────── */}
      {modalApertura && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md bg-white border-[#F97316]/40 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900 text-xl font-bold">Apertura de Caja</h2>
                <button onClick={() => setModalApertura(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-gray-600 text-sm">
                Ingresa el monto inicial disponible en la caja
                {bodegaActiva && <span className="text-yellow-400"> · {bodegaActiva.nombre}</span>}
              </p>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Monto de apertura ($)</Label>
                <Input type="number" min="0" step="0.01" value={fMontoApertura} onChange={e => setFMontoApertura(e.target.value)} className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-xl h-12" />
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Observaciones (opcional)</Label>
                <Input value={fObsApertura} onChange={e => setFObsApertura(e.target.value)} placeholder="Ej: Apertura normal, turno mañana..." className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-600 text-gray-600" onClick={() => setModalApertura(false)}>Cancelar</Button>
                <Button className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316]" onClick={handleAbrirCaja}>Abrir Caja</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Modal: Cierre de Caja ───────────────────────── */}
      {modalCierre && sesion && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md bg-white border-red-500/40 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900 text-xl font-bold">Cierre de Caja</h2>
                <button onClick={() => setModalCierre(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Total ventas</span><span className="text-green-400 font-medium">${fmt(totalVentas)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Monto real en caja</span><span className="text-[#F97316] font-bold">${fmt(sesion.monto_real ?? 0)}</span></div>
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Monto declarado en caja ($)</Label>
                <Input type="number" min="0" step="0.01" value={fMontoDeclarado} onChange={e => setFMontoDeclarado(e.target.value)} className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-xl h-12" />
                {fMontoDeclarado && (
                  <p className={`text-xs mt-1 ${Math.abs(parseFloat(fMontoDeclarado) - (sesion.monto_real ?? 0)) < 0.01 ? 'text-green-400' : 'text-orange-400'}`}>
                    Diferencia: ${fmt(Math.abs(parseFloat(fMontoDeclarado) - (sesion.monto_real ?? 0)))}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Observaciones</Label>
                <Input value={fObsCierre} onChange={e => setFObsCierre(e.target.value)} placeholder="Observaciones del cierre..." className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-600 text-gray-600" onClick={() => setModalCierre(false)}>Cancelar</Button>
                <Button className="flex-1 bg-gradient-to-r from-red-700 to-red-500" onClick={handleCerrarCaja}>Cerrar Caja</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Modal: Movimiento ──────────────────────────── */}
      {modalMovimiento && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md bg-white border-[#F97316]/40 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900 text-xl font-bold">Registrar Movimiento</h2>
                <button onClick={() => setModalMovimiento(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Tipo</Label>
                <div className="flex rounded-lg overflow-hidden border border-gray-100">
                  {(['ingreso_manual', 'gasto', 'retiro'] as const).map(t => (
                    <button key={t} onClick={() => setFTipoMov(t)}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${fTipoMov === t ? (t === 'ingreso_manual' ? 'bg-blue-100 text-blue-700' : t === 'gasto' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-600') : 'text-gray-600 hover:bg-gray-50'}`}>
                      {t === 'ingreso_manual' ? 'Ingreso' : t === 'gasto' ? 'Gasto' : 'Retiro'}
                    </button>
                  ))}
                </div>
                {fTipoMov === 'retiro' && !esAdmin && <p className="text-orange-400 text-xs mt-1">⚠ Los retiros requieren permiso de administrador</p>}
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Monto ($)</Label>
                <Input type="number" min="0.01" step="0.01" value={fMontoMov} onChange={e => setFMontoMov(e.target.value)} placeholder="0.00" className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-lg h-11" />
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Descripción *</Label>
                <Input value={fDescMov} onChange={e => setFDescMov(e.target.value)} placeholder="Ej: Pago proveedor, fondo de caja..." className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-600 text-gray-600" onClick={() => setModalMovimiento(false)}>Cancelar</Button>
                <Button className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316]" onClick={handleMovimiento}>Registrar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
