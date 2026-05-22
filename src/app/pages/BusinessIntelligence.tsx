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
} from 'lucide-react';
import { toast } from 'sonner';
import { ExportButtons } from '../components/ExportButtons';
import { exportToPDF, exportToExcel, exportMultipleSheetsToExcel } from '../utils/exportUtils';

// ── Colores corporativos ──────────────────────────────────────────────────────
const CHART_COLORS = ['#00E5FF', '#7B61FF', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#84cc16'];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#0A1A2F',
    border: '1px solid #00E5FF40',
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
    <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-400">{label}</CardTitle>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${valueColor || 'text-white'}`}>{value}</div>
        {sub && (
          <p className={`text-xs mt-1 ${subPositive === undefined ? 'text-gray-400' : subPositive ? 'text-green-400' : 'text-red-400'}`}>
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
    <div className="bg-white/5 rounded-lg p-4 border border-white/10 text-center">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
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
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-[#00E5FF]" />
            Business Intelligence
          </h1>
          <p className="text-gray-400 text-sm">Panel ejecutivo · Datos en tiempo real</p>
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
          iconColor="text-[#00E5FF]"
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
          iconColor="text-[#7B61FF]"
        />
      </div>

      {/* ── Segunda fila de KPIs: métricas de rentabilidad ─────────────────── */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[#0A1A2F]/40 border border-green-400/20 rounded-xl p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Ingreso Total</p>
            <p className="text-xl font-bold text-green-400">{fmt$(kpis.ingreso_total || 0)}</p>
          </div>
          <div className="bg-[#0A1A2F]/40 border border-[#00E5FF]/20 rounded-xl p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Utilidad Bruta</p>
            <p className={`text-xl font-bold ${kpis.utilidad_bruta >= 0 ? 'text-[#00E5FF]' : 'text-red-400'}`}>
              {fmt$(kpis.utilidad_bruta || 0)}
            </p>
          </div>
          <div className="bg-[#0A1A2F]/40 border border-purple-400/20 rounded-xl p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Margen Bruto</p>
            <p className={`text-xl font-bold ${kpis.margen_bruto >= 40 ? 'text-green-400' : kpis.margen_bruto >= 20 ? 'text-amber-400' : 'text-red-400'}`}>
              {fmtPct(kpis.margen_bruto || 0)}
            </p>
          </div>
          <div className="bg-[#0A1A2F]/40 border border-amber-400/20 rounded-xl p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Food Cost %</p>
            <p className={`text-xl font-bold ${kpis.food_cost_pct <= 30 ? 'text-green-400' : kpis.food_cost_pct <= 45 ? 'text-amber-400' : 'text-red-400'}`}>
              {fmtPct(kpis.food_cost_pct || 0)}
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="ventas" className="w-full">
        <TabsList className="bg-white/5 border border-[#00E5FF]/20 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="ventas">Análisis de Ventas</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="rentabilidad">Rentabilidad</TabsTrigger>
          <TabsTrigger value="tendencias">Tendencias</TabsTrigger>
        </TabsList>

        {/* ── TAB: Ventas ──────────────────────────────────────────────────── */}
        <TabsContent value="ventas" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ventas vs Gastos */}
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardHeader>
                <CardTitle className="text-white text-base">Ventas vs Gastos — Últimos 30 días</CardTitle>
              </CardHeader>
              <CardContent>
                {ventasPorDia.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[300px] text-gray-500">
                    <AlertCircle className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-sm">Sin ventas registradas en los últimos 30 días</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={ventasPorDia}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#00E5FF20" />
                      <XAxis dataKey="fecha" stroke="#ffffff60" tick={{ fontSize: 10 }}
                        tickFormatter={(v) => v.slice(5)} />
                      <YAxis stroke="#ffffff60" tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `$${v}`} />
                      <Tooltip {...tooltipStyle}
                        formatter={(value: any, name: string) => [fmt$(value), name === 'ventas' ? 'Ventas' : name === 'gastos' ? 'Gastos (costo)' : 'Utilidad']} />
                      <Legend formatter={(v) => v === 'ventas' ? 'Ventas' : v === 'gastos' ? 'Gastos' : 'Utilidad'} />
                      <Bar dataKey="ventas"   fill="#00E5FF" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="gastos"   fill="#7B61FF" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Distribución por categoría */}
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardHeader>
                <CardTitle className="text-white text-base">Distribución por Categoría</CardTitle>
              </CardHeader>
              <CardContent>
                {productosPorCategoria.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[300px] text-gray-500">
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
          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardHeader>
              <CardTitle className="text-white text-base">Tendencia de Utilidad Diaria</CardTitle>
            </CardHeader>
            <CardContent>
              {ventasPorDia.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[250px] text-gray-500">
                  <AlertCircle className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm">Sin ventas registradas</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={ventasPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#00E5FF20" />
                    <XAxis dataKey="fecha" stroke="#ffffff60" tick={{ fontSize: 10 }}
                      tickFormatter={(v) => v.slice(5)} />
                    <YAxis stroke="#ffffff60" tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `$${v}`} />
                    <Tooltip {...tooltipStyle}
                      formatter={(value: any) => fmt$(value)} />
                    <Area type="monotone" dataKey="ventas" fill="#00E5FF15" stroke="#00E5FF" strokeWidth={2} isAnimationActive={false} name="Ventas" />
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
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardHeader>
                <CardTitle className="text-white text-base">Top Productos por Unidades Vendidas</CardTitle>
              </CardHeader>
              <CardContent>
                {topProductos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[350px] text-gray-500">
                    <Package className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-sm">Sin ventas registradas</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={topProductos.slice(0, 8)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#00E5FF20" />
                      <XAxis type="number" stroke="#ffffff60" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="nombre" type="category" stroke="#ffffff60"
                        width={130} tick={{ fontSize: 9 }} />
                      <Tooltip {...tooltipStyle}
                        formatter={(value: any) => [String(value), 'Unidades']} />
                      <Bar dataKey="ventas" fill="#00E5FF" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top por ingresos */}
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardHeader>
                <CardTitle className="text-white text-base">Top Productos por Ingresos ($)</CardTitle>
              </CardHeader>
              <CardContent>
                {topProductos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[350px] text-gray-500">
                    <Package className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-sm">Sin ventas registradas</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart
                      data={[...topProductos].sort((a, b) => b.ingresos - a.ingresos).slice(0, 8)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#00E5FF20" />
                      <XAxis type="number" stroke="#ffffff60" tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `$${v}`} />
                      <YAxis dataKey="nombre" type="category" stroke="#ffffff60"
                        width={130} tick={{ fontSize: 9 }} />
                      <Tooltip {...tooltipStyle}
                        formatter={(value: any) => [fmt$(value), 'Ingresos']} />
                      <Bar dataKey="ingresos" fill="#7B61FF" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabla detallada de productos */}
          {topProductos.length > 0 && (
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardHeader>
                <CardTitle className="text-white text-base">Detalle por Producto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#00E5FF]/20">
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">#</th>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">Producto</th>
                        <th className="text-right py-2 px-3 text-gray-400 font-medium">Uds</th>
                        <th className="text-right py-2 px-3 text-gray-400 font-medium">Ingresos</th>
                        <th className="text-right py-2 px-3 text-gray-400 font-medium">Costo</th>
                        <th className="text-right py-2 px-3 text-gray-400 font-medium">Margen %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProductos.map((p, i) => (
                        <tr key={i} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/3'}`}>
                          <td className="py-2 px-3 text-gray-500">{i + 1}</td>
                          <td className="py-2 px-3 text-white font-medium">{p.nombre}</td>
                          <td className="py-2 px-3 text-right text-[#00E5FF]">{p.ventas}</td>
                          <td className="py-2 px-3 text-right text-white">{fmt$(p.ingresos)}</td>
                          <td className="py-2 px-3 text-right text-gray-400">{fmt$(p.costo)}</td>
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
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardContent className="p-12 text-center">
                <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">Sin datos de rentabilidad disponibles</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Métricas globales */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <RentMetric label="Ingreso Total"    value={fmt$(rentabilidad.ingreso_total)}   color="text-green-400" />
                <RentMetric label="Costo Total"      value={fmt$(rentabilidad.costo_total)}     color="text-red-400" />
                <RentMetric label="Utilidad Bruta"   value={fmt$(rentabilidad.utilidad_bruta)}  color="text-[#00E5FF]" />
                <RentMetric label="Margen Bruto %"   value={fmtPct(rentabilidad.margen_bruto)}
                  color={rentabilidad.margen_bruto >= 40 ? 'text-green-400' : rentabilidad.margen_bruto >= 20 ? 'text-amber-400' : 'text-red-400'} />
              </div>

              {/* Gráfico de rentabilidad por producto */}
              <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
                <CardHeader>
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400" />
                    Top Productos por Utilidad Generada
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(rentabilidad.top_rentables || []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-gray-500">
                      <Target className="w-10 h-10 mb-2 opacity-40" />
                      <p className="text-sm">Sin datos suficientes</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={rentabilidad.top_rentables} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#00E5FF20" />
                        <XAxis type="number" stroke="#ffffff60" tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `$${v}`} />
                        <YAxis dataKey="nombre" type="category" stroke="#ffffff60"
                          width={130} tick={{ fontSize: 9 }} />
                        <Tooltip {...tooltipStyle}
                          formatter={(value: any, name: string) => [
                            name === 'utilidad' ? fmt$(value) : name === 'margen' ? fmtPct(value) : fmt$(value),
                            name === 'utilidad' ? 'Utilidad' : name === 'margen' ? 'Margen %' : 'Ingresos',
                          ]} />
                        <Legend />
                        <Bar dataKey="ingresos" fill="#00E5FF50" radius={[0, 4, 4, 0]} isAnimationActive={false} name="Ingresos" />
                        <Bar dataKey="utilidad"  fill="#22c55e"   radius={[0, 4, 4, 0]} isAnimationActive={false} name="Utilidad" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Tabla de rentabilidad */}
              {(rentabilidad.top_rentables || []).length > 0 && (
                <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
                  <CardHeader>
                    <CardTitle className="text-white text-base">Análisis de Margen por Producto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#00E5FF]/20">
                            <th className="text-left py-2 px-3 text-gray-400 font-medium">Producto</th>
                            <th className="text-right py-2 px-3 text-gray-400 font-medium">Ingresos</th>
                            <th className="text-right py-2 px-3 text-gray-400 font-medium">Costo</th>
                            <th className="text-right py-2 px-3 text-gray-400 font-medium">Utilidad</th>
                            <th className="text-right py-2 px-3 text-gray-400 font-medium">Margen %</th>
                            <th className="text-center py-2 px-3 text-gray-400 font-medium">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rentabilidad.top_rentables.map((p: any, i: number) => (
                            <tr key={i} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/3'}`}>
                              <td className="py-2 px-3 text-white font-medium">{p.nombre}</td>
                              <td className="py-2 px-3 text-right text-green-400">{fmt$(p.ingresos)}</td>
                              <td className="py-2 px-3 text-right text-gray-400">{fmt$(p.costo)}</td>
                              <td className={`py-2 px-3 text-right font-bold ${p.utilidad >= 0 ? 'text-[#00E5FF]' : 'text-red-400'}`}>
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
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardContent className="p-12 text-center">
                <BarChart3 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">Sin datos históricos disponibles</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Tendencia mensual ventas */}
              <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
                <CardHeader>
                  <CardTitle className="text-white text-base">Evolución de Ventas — Últimos 6 Meses</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={tendenciaMensual}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#00E5FF20" />
                      <XAxis dataKey="mes" stroke="#ffffff60" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="ventas" stroke="#ffffff60" tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `$${v}`} />
                      <YAxis yAxisId="ordenes" orientation="right" stroke="#7B61FF60"
                        tick={{ fontSize: 10 }} />
                      <Tooltip {...tooltipStyle}
                        formatter={(value: any, name: string) => [
                          name === 'ventas' ? fmt$(value) : String(value),
                          name === 'ventas' ? 'Ventas $' : 'Órdenes',
                        ]} />
                      <Legend />
                      <Area yAxisId="ventas" type="monotone" dataKey="ventas"
                        fill="#00E5FF20" stroke="#00E5FF" strokeWidth={2.5}
                        isAnimationActive={false} name="ventas" />
                      <Bar yAxisId="ordenes" dataKey="ordenes"
                        fill="#7B61FF60" radius={[4, 4, 0, 0]}
                        isAnimationActive={false} name="ordenes" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Tabla mensual */}
              <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
                <CardHeader>
                  <CardTitle className="text-white text-base">Resumen Mensual Comparativo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#00E5FF]/20">
                          <th className="text-left py-2 px-4 text-gray-400 font-medium">Mes</th>
                          <th className="text-right py-2 px-4 text-gray-400 font-medium">Ventas $</th>
                          <th className="text-right py-2 px-4 text-gray-400 font-medium">Órdenes</th>
                          <th className="text-right py-2 px-4 text-gray-400 font-medium">Ticket Prom.</th>
                          <th className="text-right py-2 px-4 text-gray-400 font-medium">Var. %</th>
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
                            <tr key={i} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/3'} ${i === tendenciaMensual.length - 1 ? 'bg-[#00E5FF]/5 font-semibold' : ''}`}>
                              <td className="py-2 px-4 text-white">
                                {m.mes}
                                {i === tendenciaMensual.length - 1 && (
                                  <span className="ml-2 text-xs text-[#00E5FF] bg-[#00E5FF]/10 px-1.5 py-0.5 rounded">Actual</span>
                                )}
                              </td>
                              <td className="py-2 px-4 text-right text-green-400">{fmt$(m.ventas)}</td>
                              <td className="py-2 px-4 text-right text-white">{m.ordenes}</td>
                              <td className="py-2 px-4 text-right text-[#00E5FF]">{fmt$(ticket)}</td>
                              <td className={`py-2 px-4 text-right font-bold ${varPct === null ? 'text-gray-500' : varPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
      </Tabs>
    </div>
  );
}
