import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  DollarSign, ShoppingCart, Package, AlertCircle,
  TrendingUp, BarChart3, RefreshCw, ChefHat,
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { ExportButtons } from '../components/ExportButtons';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';

interface DashboardData {
  ventas: {
    hoy:    { cantidad: number; monto: number };
    semana: { cantidad: number; monto: number };
    mes:    { cantidad: number; monto: number };
  };
  inventario: {
    total_productos: number;
    stock_bajo:      number;
    valor_total:     number;
  };
  cocina: {
    comandas_pendientes:    number;
    comandas_en_preparacion: number;
  };
  top_productos: { nombre: string; cantidad: number; monto: number }[];
  ventas_por_dia: { fecha: string; cantidad: number; monto: number }[];
  alertas: {
    stock_bajo: { id: string; nombre: string; stock_actual: number; stock_minimo: number }[];
  };
}

const DIAS_ES: Record<string, string> = {
  Mon: 'Lun', Tue: 'Mar', Wed: 'Mié', Thu: 'Jue',
  Fri: 'Vie', Sat: 'Sáb', Sun: 'Dom',
};

function fmt(n: number) {
  return n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const { token, logout } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/dashboard`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token,
          },
        }
      );

      if (res.status === 401) { logout(); return; }

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar dashboard');

      setData(json);
      setLastUpdate(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Datos para el gráfico de barras — mapeamos fecha → día abreviado
  const chartData = (data?.ventas_por_dia ?? []).map(v => {
    const d = new Date(v.fecha + 'T12:00:00'); // mediodía para evitar offset de zona horaria
    const diaEn = d.toLocaleDateString('en-US', { weekday: 'short' });
    return {
      dia:    DIAS_ES[diaEn] ?? diaEn,
      ventas: v.monto,
      ordenes: v.cantidad,
    };
  });

  const topProductos = data?.top_productos ?? [];
  const alertasStock = data?.alertas?.stock_bajo ?? [];

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-gray-400 text-sm">
            {lastUpdate
              ? `Actualizado: ${lastUpdate.toLocaleTimeString('es-EC')}`
              : 'Cargando métricas...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons
            variant="compact"
            onExportExcel={() => {
              const rows = [
                ...(data?.top_productos ?? []).map(p => ({ Sección: 'Top Productos', Nombre: p.nombre, Cantidad: p.cantidad, Monto: p.monto })),
                ...(data?.ventas_por_dia ?? []).map(v => ({ Sección: 'Ventas por Día', Nombre: v.fecha, Cantidad: v.cantidad, Monto: v.monto })),
                ...(data?.alertas?.stock_bajo ?? []).map(a => ({ Sección: 'Stock Bajo', Nombre: a.nombre, Cantidad: a.stock_actual, Monto: a.stock_minimo })),
              ];
              exportToExcel(rows, 'dashboard_reporte', 'Dashboard');
            }}
            onExportPDF={() => exportToPDF(
              data?.top_productos ?? [],
              [{ header: 'Producto', key: 'nombre' }, { header: 'Cantidad', key: 'cantidad' }, { header: 'Monto ($)', key: 'monto' }],
              'Reporte Dashboard — Top Productos',
              'dashboard_top_productos',
            )}
          />
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-[#00E5FF]/20 text-gray-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00E5FF]' : ''}`} />
            <span className="text-sm">Actualizar</span>
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-4 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">

        {/* Ventas hoy */}
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20 hover:border-[#00E5FF]/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Ventas Hoy</CardTitle>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#1e64a7] to-[#00E5FF] flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white mb-1">
              {loading ? '—' : `$${fmt(data?.ventas.hoy.monto ?? 0)}`}
            </div>
            <p className="text-xs text-gray-500">
              {loading ? '' : `${data?.ventas.hoy.cantidad ?? 0} transacciones`}
            </p>
          </CardContent>
        </Card>

        {/* Ventas semana */}
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20 hover:border-[#00E5FF]/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Ventas Semana</CardTitle>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#7B61FF] to-[#00E5FF] flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white mb-1">
              {loading ? '—' : `$${fmt(data?.ventas.semana.monto ?? 0)}`}
            </div>
            <p className="text-xs text-gray-500">
              {loading ? '' : `${data?.ventas.semana.cantidad ?? 0} transacciones`}
            </p>
          </CardContent>
        </Card>

        {/* Inventario */}
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20 hover:border-[#00E5FF]/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Productos en Stock</CardTitle>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00E5FF] to-[#1e64a7] flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white mb-1">
              {loading ? '—' : (data?.inventario.total_productos ?? 0)}
            </div>
            <p className="text-xs text-gray-500">
              {loading ? '' : `Valor: $${fmt(data?.inventario.valor_total ?? 0)}`}
            </p>
          </CardContent>
        </Card>

        {/* Alertas */}
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20 hover:border-[#00E5FF]/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Alertas Stock</CardTitle>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold mb-1 ${(data?.inventario.stock_bajo ?? 0) > 0 ? 'text-orange-400' : 'text-white'}`}>
              {loading ? '—' : (data?.inventario.stock_bajo ?? 0)}
            </div>
            <p className="text-xs text-orange-400/80">Productos con stock bajo</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Gráfica + Cocina ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Gráfica de ventas últimos 7 días */}
        <Card className="lg:col-span-2 bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#00E5FF]" />
              Ventas últimos 7 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[280px] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin" />
              </div>
            ) : chartData.length === 0 || chartData.every(d => d.ventas === 0) ? (
              <div className="h-[280px] flex flex-col items-center justify-center text-gray-500">
                <BarChart3 className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">Sin ventas registradas esta semana</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#00E5FF15" />
                  <XAxis dataKey="dia" stroke="#ffffff40" tick={{ fill: '#ffffff60', fontSize: 12 }} />
                  <YAxis
                    stroke="#ffffff40"
                    tick={{ fill: '#ffffff60', fontSize: 12 }}
                    tickFormatter={v => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0A1A2F', border: '1px solid #00E5FF30', borderRadius: '8px', color: '#fff' }}
                    formatter={(value: any) => [`$${fmt(value)}`, 'Ventas']}
                  />
                  <Bar dataKey="ventas" fill="#00E5FF" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Estado cocina */}
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-[#00E5FF]" />
              Cocina en vivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
              <p className="text-yellow-400 text-4xl font-bold">
                {loading ? '—' : (data?.cocina.comandas_pendientes ?? 0)}
              </p>
              <p className="text-gray-400 text-sm mt-1">Comandas pendientes</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
              <p className="text-blue-400 text-4xl font-bold">
                {loading ? '—' : (data?.cocina.comandas_en_preparacion ?? 0)}
              </p>
              <p className="text-gray-400 text-sm mt-1">En preparación</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs">Ventas del mes</p>
              <p className="text-white text-xl font-bold mt-0.5">
                {loading ? '—' : `$${fmt(data?.ventas.mes.monto ?? 0)}`}
              </p>
              <p className="text-gray-600 text-xs">{data?.ventas.mes.cantidad ?? 0} transacciones</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Productos más vendidos + Alertas stock ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Top Productos */}
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[#00E5FF]" />
              Top Productos (30 días)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin" />
              </div>
            ) : topProductos.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Aún no hay ventas registradas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topProductos.map((p, i) => (
                  <div key={`prod-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/8 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1e64a7] to-[#00E5FF] flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-xs">#{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{p.nombre}</p>
                      <p className="text-gray-500 text-xs">{p.cantidad} unidades</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[#00E5FF] text-sm font-semibold">${fmt(p.monto)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alertas stock bajo */}
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-400" />
              Alertas de Stock Bajo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin" />
              </div>
            ) : alertasStock.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm text-green-400">✓ Todos los productos con stock suficiente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alertasStock.map((a, i) => (
                  <div key={`alerta-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/8 border border-orange-500/20 hover:bg-orange-500/12 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{a.nombre}</p>
                      <p className="text-gray-500 text-xs">Mínimo: {a.stock_minimo}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-orange-400 text-lg font-bold">{a.stock_actual}</p>
                      <p className="text-gray-600 text-xs">en stock</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
