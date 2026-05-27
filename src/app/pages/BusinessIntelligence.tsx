import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Area,
} from 'recharts';
import {
  BarChart3, TrendingUp, DollarSign, Package, ShoppingCart,
  TrendingDown, AlertCircle, Award, Target,
  FileText, Search, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { ExportButtons } from '../components/ExportButtons';
import { exportToPDF, exportToExcel, exportMultipleSheetsToExcel } from '../utils/exportUtils';

// ── Colores corporativos ──────────────────────────────────────────────────────
const CHART_COLORS = ['#F97316', '#FB923C', '#22c55e', '#f59e0b', '#ef4444', '#F97316', '#a855f7', '#84cc16'];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#0C0C0C',
    border: '1px solid #F9731640',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '12px',
  },
};

// ── Helpers de formato ────────────────────────────────────────────────────────
const fmt$ = (n: number) =>
  `$${(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;

// ── Componente KPI Card ───────────────────────────────────────────────────────
function KPICard({
  label, value, sub, subPositive, icon: Icon, iconColor, valueColor,
}: {
  label: string; value: string; sub?: string; subPositive?: boolean;
  icon: any; iconColor: string; valueColor?: string;
}) {
  return (
    <Card className="bg-white border-[#F97316]/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{label}</CardTitle>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${valueColor || 'text-gray-900'}`}>{value}</div>
        {sub && (
          <p className={`text-xs mt-1 ${subPositive === undefined ? 'text-gray-600' : subPositive ? 'text-green-400' : 'text-red-400'}`}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Componente métrica de rentabilidad ────────────────────────────────────────
function RentMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 text-center">
      <p className="text-gray-600 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BusinessIntelligence() {
  const { token, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [kpis,                  setKpis]                  = useState<any>(null);
  const [ventasPorDia,          setVentasPorDia]          = useState<any[]>([]);
  const [productosPorCategoria, setProductosPorCategoria] = useState<any[]>([]);
  const [topProductos,          setTopProductos]          = useState<any[]>([]);
  const [rentabilidad,          setRentabilidad]          = useState<any>(null);
  const [tendenciaMensual,      setTendenciaMensual]      = useState<any[]>([]);

  // ── Estado Reportes ───────────────────────────────────────────────────────
  const hoy = new Date().toISOString().split('T')[0];
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const [rpFechaInicio,  setRpFechaInicio]  = useState(hace30);
  const [rpFechaFin,     setRpFechaFin]     = useState(hoy);
  const [rpSeccion,      setRpSeccion]      = useState<'ventas'|'compras'>('ventas');
  const [rpVentas,       setRpVentas]       = useState<any[]>([]);
  const [rpCompras,      setRpCompras]      = useState<any[]>([]);
  const [rpCargando,     setRpCargando]     = useState(false);
  const [rpBusqueda,     setRpBusqueda]     = useState('');
  const [rpVentaAbierta, setRpVentaAbierta] = useState<string|null>(null);

  const cargarReportes = async () => {
    if (!token) return;
    setRpCargando(true);
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const headers = { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token };
      const fi = rpFechaInicio;
      const ff = rpFechaFin + 'T23:59:59';

      const [vRes, cRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/server/pos/ventas`, { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/server/compras?fecha_inicio=${fi}&fecha_fin=${ff}&limit=100`, { headers }),
      ]);

      if (vRes.ok) {
        const d = await vRes.json();
        const todas = (d.ventas || []).filter((v: any) => {
          const f = (v.fecha || v.created_at || '').split('T')[0];
          return f >= fi && f <= rpFechaFin;
        });
        setRpVentas(todas);
      }
      if (cRes.ok) {
        const d = await cRes.json();
        setRpCompras(d.compras || []);
      }
    } catch { /* */ } finally {
      setRpCargando(false);
    }
  };

  useEffect(() => {
    const fetchBIData = async () => {
      if (!token) return;
      try {
        setIsLoading(true);
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/bi/analytics`,
          { headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token } }
        );
        if (response.status === 401) { logout(); return; }
        if (!response.ok) { toast.error('Error al cargar datos de Business Intelligence'); return; }

        const data = await response.json();
        console.log('📊 BI data:', data);

        setKpis(data.kpis || {});
        setVentasPorDia(data.ventas_por_dia || []);
        setProductosPorCategoria(data.productos_por_categoria || []);
        setTopProductos(data.top_productos || []);
        setRentabilidad(data.rentabilidad || null);
        setTendenciaMensual(data.tendencia_mensual || []);
      } catch (err) {
        toast.error('Error al cargar datos');
      } finally {
        setIsLoading(false);
      }
    };
    fetchBIData();
  }, [token, logout]);

  const loading = (v: string) => isLoading ? '---' : v;

  const tendPos = (v: number) => (v >= 0 ? '+' : '') + fmtPct(v) + ' vs mes ant.';

  return (
    <div className="p-6 space-y-6">
      {/* ── Encabezado ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-[#F97316]" />
            Business Intelligence
          </h1>
          <p className="text-gray-600 text-sm">Panel ejecutivo · Datos en tiempo real</p>
        </div>
        <ExportButtons
          variant="compact"
          onExportExcel={() => exportMultipleSheetsToExcel([
            {
              name: 'Ventas por Día',
              title: 'Ventas Diarias — Últimos 30 Días',
              data: ventasPorDia.map(v => ({ Fecha: v.fecha, 'Ventas $': v.ventas, 'Gastos $': v.gastos, 'Utilidad $': v.utilidad })),
            },
            {
              name: 'Top Productos',
              title: 'Top Productos Más Vendidos',
              data: topProductos.map(p => ({ Producto: p.nombre, 'Unidades Vendidas': p.ventas, 'Ingresos $': p.ingresos, 'Costo $': p.costo, 'Margen %': p.margen })),
            },
            {
              name: 'Categorías',
              title: 'Distribución por Categoría',
              data: productosPorCategoria.map(c => ({ Categoría: c.nombre, 'Unidades Vendidas': c.cantidad, 'Participación %': c.valor })),
            },
            {
              name: 'Tendencia Mensual',
              title: 'Tendencia Mensual — Últimos 6 Meses',
              data: tendenciaMensual.map(t => ({ Mes: t.mes, 'Ventas $': t.ventas, 'Órdenes': t.ordenes })),
            },
            {
              name: 'KPIs Generales',
              title: 'KPIs Ejecutivos del Período',
              data: kpis ? [{
                'Ventas del Mes $':      kpis.ventas_mes,
                'Órdenes del Mes':       kpis.ordenes_mes,
                'Ticket Promedio $':     kpis.ticket_promedio,
                'Productos Vendidos':    kpis.productos_vendidos,
                'Ingreso Total $':       kpis.ingreso_total,
                'Utilidad Bruta $':      kpis.utilidad_bruta,
                'Margen Bruto %':        kpis.margen_bruto,
                'Food Cost %':           kpis.food_cost_pct,
              }] : [],
            },
          ], 'business_intelligence')}
          onExportPDF={() => exportToPDF(
            topProductos,
            [
              { header: 'Producto',          key: 'nombre'   },
              { header: 'Unidades Vendidas', key: 'ventas'   },
              { header: 'Ingresos ($)',       key: 'ingresos' },
              { header: 'Margen %',           key: 'margen'   },
            ],
            'Business Intelligence — Top Productos',
            'bi_top_productos',
            kpis ? [
              { label: 'Ventas del Mes',  value: fmt$(kpis.ventas_mes || 0),       color: 'green' },
              { label: 'Ticket Promedio', value: fmt$(kpis.ticket_promedio || 0),   color: 'blue'  },
              { label: 'Margen Bruto',    value: fmtPct(kpis.margen_bruto || 0),   color: (kpis.margen_bruto >= 40 ? 'green' : kpis.margen_bruto >= 20 ? 'amber' : 'red') },
              { label: 'Food Cost %',     value: fmtPct(kpis.food_cost_pct || 0),  color: (kpis.food_cost_pct <= 30 ? 'green' : 'amber') },
            ] : undefined
          )}
        />
      </div>

      {/* ── KPIs principales ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Ventas del Mes"
          value={loading(fmt$(kpis?.ventas_mes || 0))}
          sub={kpis ? tendPos(kpis.ventas_mes_tendencia) : undefined}
          subPositive={kpis ? kpis.ventas_mes_tendencia >= 0 : undefined}
          icon={DollarSign}
          iconColor="text-green-400"
          valueColor="text-green-400"
        />
        <KPICard
          label="Ticket Promedio"
          value={loading(fmt$(kpis?.ticket_promedio || 0))}
          sub={kpis ? tendPos(kpis.ticket_promedio_tendencia) : undefined}
          subPositive={kpis ? kpis.ticket_promedio_tendencia >= 0 : undefined}
          icon={TrendingUp}
          iconColor="text-[#F97316]"
        />
        <KPICard
          label="Órdenes del Mes"
          value={loading(String(kpis?.ordenes_mes || 0))}
          sub={kpis ? tendPos(kpis.ordenes_mes_tendencia) : undefined}
          subPositive={kpis ? kpis.ordenes_mes_tendencia >= 0 : undefined}
          icon={ShoppingCart}
          iconColor="text-orange-400"
        />
        <KPICard
          label="Unidades Vendidas"
          value={loading(String(kpis?.productos_vendidos || 0))}
          sub="Este mes"
          icon={Package}
          iconColor="text-[#FB923C]"
        />
      </div>

      {/* ── Segunda fila de KPIs: métricas de rentabilidad ─────────────────── */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-green-400/20 rounded-xl p-4 text-center">
            <p className="text-gray-600 text-xs mb-1">Ingreso Total</p>
            <p className="text-xl font-bold text-green-400">{fmt$(kpis.ingreso_total || 0)}</p>
          </div>
          <div className="bg-white border border-[#F97316]/20 rounded-xl p-4 text-center">
            <p className="text-gray-600 text-xs mb-1">Utilidad Bruta</p>
            <p className={`text-xl font-bold ${kpis.utilidad_bruta >= 0 ? 'text-[#F97316]' : 'text-red-400'}`}>
              {fmt$(kpis.utilidad_bruta || 0)}
            </p>
          </div>
          <div className="bg-white border border-purple-400/20 rounded-xl p-4 text-center">
            <p className="text-gray-600 text-xs mb-1">Margen Bruto</p>
            <p className={`text-xl font-bold ${kpis.margen_bruto >= 40 ? 'text-green-400' : kpis.margen_bruto >= 20 ? 'text-amber-400' : 'text-red-400'}`}>
              {fmtPct(kpis.margen_bruto || 0)}
            </p>
          </div>
          <div className="bg-white border border-amber-400/20 rounded-xl p-4 text-center">
            <p className="text-gray-600 text-xs mb-1">Food Cost %</p>
            <p className={`text-xl font-bold ${kpis.food_cost_pct <= 30 ? 'text-green-400' : kpis.food_cost_pct <= 45 ? 'text-amber-400' : 'text-red-400'}`}>
              {fmtPct(kpis.food_cost_pct || 0)}
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="ventas" className="w-full">
        <TabsList className="bg-gray-50 border border-[#F97316]/20 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="ventas">Análisis de Ventas</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="rentabilidad">Rentabilidad</TabsTrigger>
          <TabsTrigger value="tendencias">Tendencias</TabsTrigger>
          <TabsTrigger value="reportes" onClick={cargarReportes}>Reportes</TabsTrigger>
        </TabsList>

        {/* ── TAB: Ventas ──────────────────────────────────────────────────── */}
        <TabsContent value="ventas" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ventas vs Gastos */}
            <Card className="bg-white border-[#F97316]/20">
              <CardHeader>
                <CardTitle className="text-gray-900 text-base">Ventas vs Gastos — Últimos 30 días</CardTitle>
              </CardHeader>
              <CardContent>
                {ventasPorDia.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[300px] text-gray-600">
                    <AlertCircle className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-sm">Sin ventas registradas en los últimos 30 días</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={ventasPorDia}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F9731620" />
                      <XAxis dataKey="fecha" stroke="#e5e7eb" tick={{ fontSize: 10, fill: '#6b7280' }}
                        tickFormatter={(v) => v.slice(5)} />
                      <YAxis stroke="#e5e7eb" tick={{ fontSize: 10, fill: '#6b7280' }}
                        tickFormatter={(v) => `$${v}`} />
                      <Tooltip {...tooltipStyle}
                        formatter={(value: any, name: string) => [fmt$(value), name === 'ventas' ? 'Ventas' : name === 'gastos' ? 'Gastos (costo)' : 'Utilidad']} />
                      <Legend formatter={(v) => v === 'ventas' ? 'Ventas' : v === 'gastos' ? 'Gastos' : 'Utilidad'} />
                      <Bar dataKey="ventas"   fill="#F97316" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="gastos"   fill="#FB923C" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Distribución por categoría */}
            <Card className="bg-white border-[#F97316]/20">
              <CardHeader>
                <CardTitle className="text-gray-900 text-base">Distribución por Categoría</CardTitle>
              </CardHeader>
              <CardContent>
                {productosPorCategoria.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[300px] text-gray-600">
                    <AlertCircle className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-sm">Sin datos de categorías</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={productosPorCategoria}
                        cx="50%" cy="50%"
                        outerRadius={100}
                        dataKey="valor"
                        label={({ nombre, valor }) => `${nombre} ${valor}%`}
                        labelLine={true}
                      >
                        {productosPorCategoria.map((entry, i) => (
                          <Cell key={`cat-${i}`} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipStyle}
                        formatter={(value: any, _: any, props: any) => [`${value}% (${props.payload.cantidad} uds)`, props.payload.nombre]} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tendencia de utilidad */}
          <Card className="bg-white border-[#F97316]/20">
            <CardHeader>
              <CardTitle className="text-gray-900 text-base">Tendencia de Utilidad Diaria</CardTitle>
            </CardHeader>
            <CardContent>
              {ventasPorDia.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[250px] text-gray-600">
                  <AlertCircle className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm">Sin ventas registradas</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={ventasPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F9731620" />
                    <XAxis dataKey="fecha" stroke="#e5e7eb" tick={{ fontSize: 10, fill: '#6b7280' }}
                      tickFormatter={(v) => v.slice(5)} />
                    <YAxis stroke="#e5e7eb" tick={{ fontSize: 10, fill: '#6b7280' }}
                      tickFormatter={(v) => `$${v}`} />
                    <Tooltip {...tooltipStyle}
                      formatter={(value: any) => fmt$(value)} />
                    <Area type="monotone" dataKey="ventas" fill="#F9731615" stroke="#F97316" strokeWidth={2} isAnimationActive={false} name="Ventas" />
                    <Line type="monotone" dataKey="utilidad" stroke="#22c55e" strokeWidth={2}
                      dot={{ fill: '#22c55e', r: 3 }} isAnimationActive={false} name="Utilidad" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Productos ────────────────────────────────────────────────── */}
        <TabsContent value="productos" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top por unidades */}
            <Card className="bg-white border-[#F97316]/20">
              <CardHeader>
                <CardTitle className="text-gray-900 text-base">Top Productos por Unidades Vendidas</CardTitle>
              </CardHeader>
              <CardContent>
                {topProductos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[350px] text-gray-600">
                    <Package className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-sm">Sin ventas registradas</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={topProductos.slice(0, 8)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#F9731620" />
                      <XAxis type="number" stroke="#e5e7eb" tick={{ fontSize: 10, fill: '#6b7280' }} />
                      <YAxis dataKey="nombre" type="category" stroke="#e5e7eb"
                        width={130} tick={{ fontSize: 9, fill: '#6b7280' }} />
                      <Tooltip {...tooltipStyle}
                        formatter={(value: any) => [String(value), 'Unidades']} />
                      <Bar dataKey="ventas" fill="#F97316" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top por ingresos */}
            <Card className="bg-white border-[#F97316]/20">
              <CardHeader>
                <CardTitle className="text-gray-900 text-base">Top Productos por Ingresos ($)</CardTitle>
              </CardHeader>
              <CardContent>
                {topProductos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[350px] text-gray-600">
                    <Package className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-sm">Sin ventas registradas</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart
                      data={[...topProductos].sort((a, b) => b.ingresos - a.ingresos).slice(0, 8)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#F9731620" />
                      <XAxis type="number" stroke="#e5e7eb" tick={{ fontSize: 10, fill: '#6b7280' }}
                        tickFormatter={(v) => `$${v}`} />
                      <YAxis dataKey="nombre" type="category" stroke="#e5e7eb"
                        width={130} tick={{ fontSize: 9, fill: '#6b7280' }} />
                      <Tooltip {...tooltipStyle}
                        formatter={(value: any) => [fmt$(value), 'Ingresos']} />
                      <Bar dataKey="ingresos" fill="#FB923C" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabla detallada de productos */}
          {topProductos.length > 0 && (
            <Card className="bg-white border-[#F97316]/20">
              <CardHeader>
                <CardTitle className="text-gray-900 text-base">Detalle por Producto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#F97316]/20">
                        <th className="text-left py-2 px-3 text-gray-600 font-medium">#</th>
                        <th className="text-left py-2 px-3 text-gray-600 font-medium">Producto</th>
                        <th className="text-right py-2 px-3 text-gray-600 font-medium">Uds</th>
                        <th className="text-right py-2 px-3 text-gray-600 font-medium">Ingresos</th>
                        <th className="text-right py-2 px-3 text-gray-600 font-medium">Costo</th>
                        <th className="text-right py-2 px-3 text-gray-600 font-medium">Margen %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProductos.map((p, i) => (
                        <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                          <td className="py-2 px-3 text-gray-600">{i + 1}</td>
                          <td className="py-2 px-3 text-gray-900 font-medium">{p.nombre}</td>
                          <td className="py-2 px-3 text-right text-[#F97316]">{p.ventas}</td>
                          <td className="py-2 px-3 text-right text-gray-900">{fmt$(p.ingresos)}</td>
                          <td className="py-2 px-3 text-right text-gray-600">{fmt$(p.costo)}</td>
                          <td className={`py-2 px-3 text-right font-bold ${p.margen >= 40 ? 'text-green-400' : p.margen >= 20 ? 'text-amber-400' : 'text-red-400'}`}>
                            {fmtPct(p.margen)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB: Rentabilidad ─────────────────────────────────────────────── */}
        <TabsContent value="rentabilidad" className="space-y-6 mt-4">
          {!rentabilidad ? (
            <Card className="bg-white border-[#F97316]/20">
              <CardContent className="p-12 text-center">
                <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600">Sin datos de rentabilidad disponibles</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Métricas globales */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <RentMetric label="Ingreso Total"    value={fmt$(rentabilidad.ingreso_total)}   color="text-green-400" />
                <RentMetric label="Costo Total"      value={fmt$(rentabilidad.costo_total)}     color="text-red-400" />
                <RentMetric label="Utilidad Bruta"   value={fmt$(rentabilidad.utilidad_bruta)}  color="text-[#F97316]" />
                <RentMetric label="Margen Bruto %"   value={fmtPct(rentabilidad.margen_bruto)}
                  color={rentabilidad.margen_bruto >= 40 ? 'text-green-400' : rentabilidad.margen_bruto >= 20 ? 'text-amber-400' : 'text-red-400'} />
              </div>

              {/* Gráfico de rentabilidad por producto */}
              <Card className="bg-white border-[#F97316]/20">
                <CardHeader>
                  <CardTitle className="text-gray-900 text-base flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400" />
                    Top Productos por Utilidad Generada
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(rentabilidad.top_rentables || []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-gray-600">
                      <Target className="w-10 h-10 mb-2 opacity-40" />
                      <p className="text-sm">Sin datos suficientes</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={rentabilidad.top_rentables} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#F9731620" />
                        <XAxis type="number" stroke="#e5e7eb" tick={{ fontSize: 10, fill: '#6b7280' }}
                          tickFormatter={(v) => `$${v}`} />
                        <YAxis dataKey="nombre" type="category" stroke="#e5e7eb"
                          width={130} tick={{ fontSize: 9, fill: '#6b7280' }} />
                        <Tooltip {...tooltipStyle}
                          formatter={(value: any, name: string) => [
                            name === 'utilidad' ? fmt$(value) : name === 'margen' ? fmtPct(value) : fmt$(value),
                            name === 'utilidad' ? 'Utilidad' : name === 'margen' ? 'Margen %' : 'Ingresos',
                          ]} />
                        <Legend />
                        <Bar dataKey="ingresos" fill="#F9731650" radius={[0, 4, 4, 0]} isAnimationActive={false} name="Ingresos" />
                        <Bar dataKey="utilidad"  fill="#22c55e"   radius={[0, 4, 4, 0]} isAnimationActive={false} name="Utilidad" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Tabla de rentabilidad */}
              {(rentabilidad.top_rentables || []).length > 0 && (
                <Card className="bg-white border-[#F97316]/20">
                  <CardHeader>
                    <CardTitle className="text-gray-900 text-base">Análisis de Margen por Producto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#F97316]/20">
                            <th className="text-left py-2 px-3 text-gray-600 font-medium">Producto</th>
                            <th className="text-right py-2 px-3 text-gray-600 font-medium">Ingresos</th>
                            <th className="text-right py-2 px-3 text-gray-600 font-medium">Costo</th>
                            <th className="text-right py-2 px-3 text-gray-600 font-medium">Utilidad</th>
                            <th className="text-right py-2 px-3 text-gray-600 font-medium">Margen %</th>
                            <th className="text-center py-2 px-3 text-gray-600 font-medium">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rentabilidad.top_rentables.map((p: any, i: number) => (
                            <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                              <td className="py-2 px-3 text-gray-900 font-medium">{p.nombre}</td>
                              <td className="py-2 px-3 text-right text-green-400">{fmt$(p.ingresos)}</td>
                              <td className="py-2 px-3 text-right text-gray-600">{fmt$(p.costo)}</td>
                              <td className={`py-2 px-3 text-right font-bold ${p.utilidad >= 0 ? 'text-[#F97316]' : 'text-red-400'}`}>
                                {fmt$(p.utilidad)}
                              </td>
                              <td className={`py-2 px-3 text-right font-bold ${p.margen >= 40 ? 'text-green-400' : p.margen >= 20 ? 'text-amber-400' : 'text-red-400'}`}>
                                {fmtPct(p.margen)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  p.margen >= 40 ? 'bg-green-500/20 text-green-400' :
                                  p.margen >= 20 ? 'bg-amber-500/20 text-amber-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {p.margen >= 40 ? '✓ Excelente' : p.margen >= 20 ? '~ Aceptable' : '↓ Bajo'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── TAB: Tendencias ───────────────────────────────────────────────── */}
        <TabsContent value="tendencias" className="space-y-6 mt-4">
          {tendenciaMensual.length === 0 ? (
            <Card className="bg-white border-[#F97316]/20">
              <CardContent className="p-12 text-center">
                <BarChart3 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600">Sin datos históricos disponibles</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Tendencia mensual ventas */}
              <Card className="bg-white border-[#F97316]/20">
                <CardHeader>
                  <CardTitle className="text-gray-900 text-base">Evolución de Ventas — Últimos 6 Meses</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={tendenciaMensual}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F9731620" />
                      <XAxis dataKey="mes" stroke="#e5e7eb" tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <YAxis yAxisId="ventas" stroke="#e5e7eb" tick={{ fontSize: 10, fill: '#6b7280' }}
                        tickFormatter={(v) => `$${v}`} />
                      <YAxis yAxisId="ordenes" orientation="right" stroke="#FB923C60"
                        tick={{ fontSize: 10, fill: '#6b7280' }} />
                      <Tooltip {...tooltipStyle}
                        formatter={(value: any, name: string) => [
                          name === 'ventas' ? fmt$(value) : String(value),
                          name === 'ventas' ? 'Ventas $' : 'Órdenes',
                        ]} />
                      <Legend />
                      <Area yAxisId="ventas" type="monotone" dataKey="ventas"
                        fill="#F9731620" stroke="#F97316" strokeWidth={2.5}
                        isAnimationActive={false} name="ventas" />
                      <Bar yAxisId="ordenes" dataKey="ordenes"
                        fill="#FB923C60" radius={[4, 4, 0, 0]}
                        isAnimationActive={false} name="ordenes" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Tabla mensual */}
              <Card className="bg-white border-[#F97316]/20">
                <CardHeader>
                  <CardTitle className="text-gray-900 text-base">Resumen Mensual Comparativo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#F97316]/20">
                          <th className="text-left py-2 px-4 text-gray-600 font-medium">Mes</th>
                          <th className="text-right py-2 px-4 text-gray-600 font-medium">Ventas $</th>
                          <th className="text-right py-2 px-4 text-gray-600 font-medium">Órdenes</th>
                          <th className="text-right py-2 px-4 text-gray-600 font-medium">Ticket Prom.</th>
                          <th className="text-right py-2 px-4 text-gray-600 font-medium">Var. %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tendenciaMensual.map((m, i) => {
                          const prev = i > 0 ? tendenciaMensual[i - 1] : null;
                          const varPct = prev && prev.ventas > 0
                            ? ((m.ventas - prev.ventas) / prev.ventas * 100)
                            : null;
                          const ticket = m.ordenes > 0 ? m.ventas / m.ordenes : 0;
                          return (
                            <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50'} ${i === tendenciaMensual.length - 1 ? 'bg-[#F97316]/5 font-semibold' : ''}`}>
                              <td className="py-2 px-4 text-gray-900">
                                {m.mes}
                                {i === tendenciaMensual.length - 1 && (
                                  <span className="ml-2 text-xs text-[#F97316] bg-[#F97316]/10 px-1.5 py-0.5 rounded">Actual</span>
                                )}
                              </td>
                              <td className="py-2 px-4 text-right text-green-400">{fmt$(m.ventas)}</td>
                              <td className="py-2 px-4 text-right text-gray-900">{m.ordenes}</td>
                              <td className="py-2 px-4 text-right text-[#F97316]">{fmt$(ticket)}</td>
                              <td className={`py-2 px-4 text-right font-bold ${varPct === null ? 'text-gray-600' : varPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {varPct === null ? '—' : `${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}%`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── TAB: Reportes ─────────────────────────────────────────────────── */}
        <TabsContent value="reportes" className="space-y-4 mt-4">

          {/* Filtros */}
          <Card className="bg-white border-[#F97316]/20">
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-xs text-gray-600 font-medium">Desde</label>
                  <input type="date" value={rpFechaInicio} onChange={e => setRpFechaInicio(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:border-[#F97316]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600 font-medium">Hasta</label>
                  <input type="date" value={rpFechaFin} onChange={e => setRpFechaFin(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:border-[#F97316]" />
                </div>
                <button onClick={cargarReportes} disabled={rpCargando}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white text-sm font-bold rounded-lg hover:opacity-90 disabled:opacity-60">
                  <RefreshCw className={`w-4 h-4 ${rpCargando ? 'animate-spin' : ''}`} />
                  {rpCargando ? 'Cargando...' : 'Actualizar'}
                </button>
                {/* Sub-sección */}
                <div className="flex rounded-lg overflow-hidden border border-[#F97316]/20 ml-auto">
                  {(['ventas','compras'] as const).map(s => (
                    <button key={s} onClick={() => setRpSeccion(s)}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${rpSeccion === s ? 'bg-[#F97316] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                      {s === 'ventas' ? '🧾 Ventas' : '🛒 Compras'}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── SECCIÓN VENTAS ───────────────────────────────────────────────── */}
          {rpSeccion === 'ventas' && (() => {
            const busq = rpBusqueda.toLowerCase();
            const filtradas = rpVentas.filter(v =>
              !busq ||
              (v.numero || v.numero_ticket || '').toLowerCase().includes(busq) ||
              (v.cliente_nombre || '').toLowerCase().includes(busq) ||
              (v.forma_pago || v.metodo_pago || '').toLowerCase().includes(busq)
            );
            const totalMonto   = filtradas.reduce((s, v) => s + (v.total || 0), 0);
            const totalIva     = filtradas.reduce((s, v) => s + (v.iva || v.impuestos || 0), 0);
            const totalSubtotal = filtradas.reduce((s, v) => s + (v.subtotal || 0), 0);
            const ticketProm   = filtradas.length > 0 ? totalMonto / filtradas.length : 0;

            return (
              <div className="space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Ventas', val: String(filtradas.length), color: 'text-gray-900' },
                    { label: 'Monto Total',  val: fmt$(totalMonto),          color: 'text-[#F97316]' },
                    { label: 'Ticket Prom.', val: fmt$(ticketProm),          color: 'text-green-500' },
                    { label: 'IVA Total',    val: fmt$(totalIva),            color: 'text-blue-500'  },
                  ].map(k => (
                    <Card key={k.label} className="bg-white border-[#F97316]/20">
                      <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-gray-600">{k.label}</p>
                        <p className={`text-xl font-bold ${k.color}`}>{k.val}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Búsqueda */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input placeholder="Buscar por ticket, cliente o método de pago..."
                    value={rpBusqueda} onChange={e => setRpBusqueda(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-gray-50 focus:outline-none focus:border-[#F97316]" />
                </div>

                {/* Tabla */}
                <Card className="bg-white border-[#F97316]/20 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {['Fecha','Ticket','Cliente','Items','Subtotal','IVA','Total','Método','Estado'].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtradas.length === 0 ? (
                          <tr><td colSpan={9} className="text-center py-10 text-gray-400">
                            {rpCargando ? 'Cargando...' : 'Sin ventas en el período seleccionado'}
                          </td></tr>
                        ) : filtradas.map(v => {
                          const abierta = rpVentaAbierta === v.id;
                          const fecha = new Date(v.fecha || v.created_at).toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' });
                          const hora  = new Date(v.fecha || v.created_at).toLocaleTimeString('es-EC', { hour:'2-digit', minute:'2-digit' });
                          return (
                            <>
                              <tr key={v.id} onClick={() => setRpVentaAbierta(abierta ? null : v.id)}
                                className="border-b border-gray-100 hover:bg-orange-50 cursor-pointer transition-colors">
                                <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{fecha} <span className="text-gray-400 text-xs">{hora}</span></td>
                                <td className="py-2 px-3 text-gray-900 font-mono text-xs">{v.numero || v.numero_ticket || v.id?.slice(0,8) || '—'}</td>
                                <td className="py-2 px-3 text-gray-600">{v.cliente_nombre || '—'}</td>
                                <td className="py-2 px-3 text-gray-600 text-center">{(v.items || []).length}</td>
                                <td className="py-2 px-3 text-gray-900">{fmt$(v.subtotal || 0)}</td>
                                <td className="py-2 px-3 text-blue-500">{fmt$(v.iva || v.impuestos || 0)}</td>
                                <td className="py-2 px-3 text-[#F97316] font-bold">{fmt$(v.total || 0)}</td>
                                <td className="py-2 px-3">
                                  <Badge className="text-xs bg-gray-100 text-gray-600 border-0 capitalize">
                                    {v.forma_pago || v.metodo_pago || '—'}
                                  </Badge>
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-1">
                                    <Badge className={`text-xs border-0 ${v.anulada ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                      {v.anulada ? 'Anulada' : 'Completada'}
                                    </Badge>
                                    {abierta ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                                  </div>
                                </td>
                              </tr>
                              {abierta && (v.items || []).length > 0 && (
                                <tr key={`${v.id}-items`} className="bg-orange-50/60">
                                  <td colSpan={9} className="px-6 py-3">
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Detalle de ítems:</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                      {(v.items || []).map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center bg-white rounded px-3 py-1.5 border border-gray-100">
                                          <span className="text-gray-900">{item.nombre || '—'}</span>
                                          <span className="text-gray-600 ml-4 whitespace-nowrap">
                                            {item.cantidad} × {fmt$(item.precio_unitario || 0)} = <span className="font-bold text-[#F97316]">{fmt$(item.subtotal || 0)}</span>
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                      {filtradas.length > 0 && (
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                          <tr>
                            <td colSpan={4} className="py-2 px-3 text-xs font-bold text-gray-600">TOTALES ({filtradas.length} ventas)</td>
                            <td className="py-2 px-3 font-bold text-gray-900">{fmt$(totalSubtotal)}</td>
                            <td className="py-2 px-3 font-bold text-blue-500">{fmt$(totalIva)}</td>
                            <td className="py-2 px-3 font-bold text-[#F97316]">{fmt$(totalMonto)}</td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </Card>

                {/* ── Ítems vendidos en el período ───────────────────────────── */}
                {(() => {
                  // Agregar todos los ítems de todas las ventas filtradas
                  const itemMap: Record<string, { nombre: string; cantidad: number; ingresos: number; precio_unitario: number }> = {};
                  for (const v of filtradas) {
                    for (const item of (v.items || [])) {
                      const key = item.producto_id || item.nombre || 'desconocido';
                      if (!itemMap[key]) itemMap[key] = { nombre: item.nombre || '—', cantidad: 0, ingresos: 0, precio_unitario: item.precio_unitario || 0 };
                      itemMap[key].cantidad += Number(item.cantidad) || 0;
                      itemMap[key].ingresos += Number(item.subtotal) || 0;
                    }
                  }
                  const items = Object.values(itemMap).sort((a, b) => b.ingresos - a.ingresos);
                  if (items.length === 0) return null;
                  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0);
                  const totalIngresos = items.reduce((s, i) => s + i.ingresos, 0);

                  return (
                    <Card className="bg-white border-[#F97316]/20 overflow-hidden">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base text-gray-900 flex items-center gap-2">
                          <Package className="w-4 h-4 text-[#F97316]" />
                          Ítems vendidos en el período
                          <span className="text-sm font-normal text-gray-500">({items.length} productos)</span>
                        </CardTitle>
                      </CardHeader>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600">#</th>
                              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600">Producto</th>
                              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600">Unidades</th>
                              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600">Precio Unit.</th>
                              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600">Total</th>
                              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600">% Ventas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item, idx) => (
                              <tr key={idx} className="border-b border-gray-100 hover:bg-orange-50 transition-colors">
                                <td className="py-2 px-3 text-gray-400 text-xs">{idx + 1}</td>
                                <td className="py-2 px-3 text-gray-900 font-medium">{item.nombre}</td>
                                <td className="py-2 px-3 text-gray-900 text-right font-bold">{item.cantidad}</td>
                                <td className="py-2 px-3 text-gray-600 text-right">{fmt$(item.precio_unitario)}</td>
                                <td className="py-2 px-3 text-[#F97316] font-bold text-right">{fmt$(item.ingresos)}</td>
                                <td className="py-2 px-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="h-1.5 rounded-full bg-orange-100 w-16 overflow-hidden">
                                      <div className="h-full bg-[#F97316] rounded-full" style={{ width: `${totalIngresos > 0 ? (item.ingresos / totalIngresos) * 100 : 0}%` }} />
                                    </div>
                                    <span className="text-gray-600 text-xs w-10 text-right">
                                      {totalIngresos > 0 ? ((item.ingresos / totalIngresos) * 100).toFixed(1) : '0.0'}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                            <tr>
                              <td colSpan={2} className="py-2 px-3 text-xs font-bold text-gray-600">TOTALES</td>
                              <td className="py-2 px-3 font-bold text-gray-900 text-right">{totalUnidades}</td>
                              <td className="py-2 px-3"></td>
                              <td className="py-2 px-3 font-bold text-[#F97316] text-right">{fmt$(totalIngresos)}</td>
                              <td className="py-2 px-3 text-right text-xs text-gray-600">100%</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </Card>
                  );
                })()}

              </div>
            );
          })()}

          {/* ── SECCIÓN COMPRAS ──────────────────────────────────────────────── */}
          {rpSeccion === 'compras' && (() => {
            const busq = rpBusqueda.toLowerCase();
            const filtradas = rpCompras.filter(c =>
              !busq ||
              (c.proveedor?.nombre || '').toLowerCase().includes(busq) ||
              (c.numero_factura || c.numero || '').toLowerCase().includes(busq) ||
              (c.tipo_pago || '').toLowerCase().includes(busq)
            );
            const totalMonto   = filtradas.reduce((s, c) => s + (c.total || c.total_compra || 0), 0);
            const totalContado = filtradas.filter(c => c.tipo_pago !== 'credito').reduce((s, c) => s + (c.total || 0), 0);
            const totalCredito = filtradas.filter(c => c.tipo_pago === 'credito').reduce((s, c) => s + (c.total || 0), 0);

            return (
              <div className="space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Total Compras', val: String(filtradas.length), color: 'text-gray-900' },
                    { label: 'Total $',        val: fmt$(totalMonto),         color: 'text-[#F97316]' },
                    { label: 'Contado',        val: fmt$(totalContado),       color: 'text-green-500' },
                  ].map(k => (
                    <Card key={k.label} className="bg-white border-[#F97316]/20">
                      <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-gray-600">{k.label}</p>
                        <p className={`text-xl font-bold ${k.color}`}>{k.val}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Búsqueda */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input placeholder="Buscar por proveedor, factura o tipo de pago..."
                    value={rpBusqueda} onChange={e => setRpBusqueda(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-gray-50 focus:outline-none focus:border-[#F97316]" />
                </div>

                {/* Tabla */}
                <Card className="bg-white border-[#F97316]/20 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {['Fecha','Proveedor','Factura','Ítems','Total','Tipo Pago'].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtradas.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-10 text-gray-400">
                            {rpCargando ? 'Cargando...' : 'Sin compras en el período seleccionado'}
                          </td></tr>
                        ) : filtradas.map(c => {
                          const fecha = new Date(c.fecha || c.created_at).toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' });
                          return (
                            <tr key={c.id} className="border-b border-gray-100 hover:bg-orange-50 transition-colors">
                              <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{fecha}</td>
                              <td className="py-2 px-3 text-gray-900 font-medium">{c.proveedor?.nombre || '—'}</td>
                              <td className="py-2 px-3 text-gray-600 font-mono text-xs">{c.numero_factura || c.numero || '—'}</td>
                              <td className="py-2 px-3 text-gray-600 text-center">{(c.items || []).length}</td>
                              <td className="py-2 px-3 text-[#F97316] font-bold">{fmt$(c.total || c.total_compra || 0)}</td>
                              <td className="py-2 px-3">
                                <Badge className={`text-xs border-0 ${c.tipo_pago === 'credito' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                  {c.tipo_pago === 'credito' ? 'Crédito' : 'Contado'}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {filtradas.length > 0 && (
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                          <tr>
                            <td colSpan={4} className="py-2 px-3 text-xs font-bold text-gray-600">TOTALES ({filtradas.length} compras)</td>
                            <td className="py-2 px-3 font-bold text-[#F97316]">{fmt$(totalMonto)}</td>
                            <td className="py-2 px-3 text-xs text-gray-600">Crédito: {fmt$(totalCredito)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </Card>
              </div>
            );
          })()}

        </TabsContent>
      </Tabs>
    </div>
  );
}
