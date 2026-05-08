import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { BarChart3, TrendingUp, DollarSign, Package, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ExportButtons } from '../components/ExportButtons';
import { exportToPDF, exportToExcel, exportMultipleSheetsToExcel } from '../utils/exportUtils';

export default function BusinessIntelligence() {
  const { token, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [kpis, setKpis] = useState<any>(null);
  const [ventasPorDia, setVentasPorDia] = useState<any[]>([]);
  const [productosPorCategoria, setProductosPorCategoria] = useState<any[]>([]);
  const [topProductos, setTopProductos] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchBIData = async () => {
      if (!token) {
        console.log('⏳ No hay token, esperando...');
        return;
      }

      try {
        setIsLoading(true);
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
        
        // Obtener datos de BI
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/bi/analytics`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
              'X-User-Token': token
            }
          }
        );

        if (response.status === 401) {
          console.error('Token expirado en BI');
          logout();
          return;
        }

        if (response.ok) {
          const data = await response.json();
          console.log('📊 Datos de BI recibidos:', data);
          setKpis(data.kpis);
          
          // Agregar IDs únicos para evitar keys duplicadas en Recharts
          const ventasConId = (data.ventas_por_dia || []).map((item: any, index: number) => ({
            ...item,
            uniqueId: `venta-${Date.now()}-${index}-${item.fecha || 'dia'}`,
            fecha: item.fecha || `Día ${index + 1}`,
            ventas: item.ventas || 0,
            gastos: item.gastos || 0,
            utilidad: item.utilidad || 0
          }));
          
          const categoriasConId = (data.productos_por_categoria || []).map((item: any, index: number) => ({
            ...item,
            uniqueId: `cat-${Date.now()}-${index}-${item.nombre || 'categoria'}`,
            nombre: item.nombre || `Categoría ${index + 1}`,
            valor: item.valor || 0,
            color: item.color || '#00E5FF'
          }));
          
          const productosConId = (data.top_productos || []).map((item: any, index: number) => ({
            ...item,
            uniqueId: `prod-${Date.now()}-${index}-${item.nombre || 'producto'}`,
            nombre: item.nombre || `Producto ${index + 1}`,
            cantidad: item.cantidad || 0,
            ingresos: item.ingresos || 0
          }));
          
          setVentasPorDia(ventasConId);
          setProductosPorCategoria(categoriasConId);
          setTopProductos(productosConId);
        } else {
          const error = await response.text();
          console.error('Error cargando datos de BI:', error);
          toast.error('Error al cargar datos de Business Intelligence');
        }
      } catch (error) {
        console.error('Error cargando datos de BI:', error);
        toast.error('Error al cargar datos');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBIData();
  }, [token, logout]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-[#00E5FF]" />
            Business Intelligence
          </h1>
          <p className="text-gray-400">Análisis de datos y reportes ejecutivos</p>
        </div>
        <ExportButtons
          variant="compact"
          onExportExcel={() => exportMultipleSheetsToExcel([
            { name: 'Ventas por Día', data: ventasPorDia.map(v => ({ Fecha: v.fecha, Ventas: v.ventas, Gastos: v.gastos, Utilidad: v.utilidad })) },
            { name: 'Top Productos', data: topProductos.map(p => ({ Producto: p.nombre, Ventas: p.ventas, Ingresos: p.ingresos })) },
            { name: 'KPIs', data: kpis ? [{ 'Ventas Mes': kpis.ventas_mes, 'Ticket Promedio': kpis.ticket_promedio, 'Clientes Únicos': kpis.clientes_unicos, 'Crecimiento %': kpis.ventas_mes_tendencia }] : [] },
          ], 'business_intelligence')}
          onExportPDF={() => exportToPDF(
            topProductos,
            [
              { header: 'Producto', key: 'nombre' },
              { header: 'Ventas', key: 'ventas' },
              { header: 'Ingresos ($)', key: 'ingresos' },
            ],
            'Reporte Business Intelligence — Top Productos',
            'business_intelligence',
          )}
        />
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Ventas del Mes</CardTitle>
            <DollarSign className="w-5 h-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">
              ${isLoading ? '---' : (kpis?.ventas_mes || 0).toLocaleString()}
            </div>
            <p className="text-xs text-green-400 mt-1">
              {kpis?.ventas_mes_tendencia >= 0 ? '+' : ''}{kpis?.ventas_mes_tendencia || 0}% vs mes anterior
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Ticket Promedio</CardTitle>
            <TrendingUp className="w-5 h-5 text-[#00E5FF]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              ${isLoading ? '---' : (kpis?.ticket_promedio || 0).toFixed(2)}
            </div>
            <p className="text-xs text-[#00E5FF] mt-1">
              {kpis?.ticket_promedio_tendencia >= 0 ? '+' : ''}{kpis?.ticket_promedio_tendencia || 0}% vs mes anterior
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Productos Vendidos</CardTitle>
            <Package className="w-5 h-5 text-[#7B61FF]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {isLoading ? '---' : (kpis?.productos_vendidos || 0).toLocaleString()}
            </div>
            <p className="text-xs text-gray-400 mt-1">Este mes</p>
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Órdenes Completadas</CardTitle>
            <Users className="w-5 h-5 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {isLoading ? '---' : (kpis?.ordenes_mes || 0).toLocaleString()}
            </div>
            <p className="text-xs text-orange-400 mt-1">
              {kpis?.ordenes_mes_tendencia >= 0 ? '+' : ''}{kpis?.ordenes_mes_tendencia || 0}% nuevas
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ventas" className="w-full">
        <TabsList className="bg-white/5 border border-[#00E5FF]/20">
          <TabsTrigger value="ventas">Análisis de Ventas</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="rentabilidad">Rentabilidad</TabsTrigger>
          <TabsTrigger value="tendencias">Tendencias</TabsTrigger>
        </TabsList>

        <TabsContent value="ventas" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardHeader>
                <CardTitle className="text-white">Ventas vs Gastos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ventasPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#00E5FF20" />
                    <XAxis dataKey="fecha" stroke="#ffffff60" />
                    <YAxis stroke="#ffffff60" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#0A1A2F', 
                        border: '1px solid #00E5FF40',
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                    <Legend />
                    <Bar dataKey="ventas" fill="#00E5FF" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="gastos" fill="#7B61FF" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardHeader>
                <CardTitle className="text-white">Distribución por Categoría</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={productosPorCategoria}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ nombre, valor }) => `${nombre} ${valor}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="valor"
                    >
                      {productosPorCategoria.map((entry, index) => (
                        <Cell key={`pie-cell-${index}-${entry.nombre}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#0A1A2F', 
                        border: '1px solid #00E5FF40',
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardHeader>
              <CardTitle className="text-white">Tendencia de Utilidad</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={ventasPorDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#00E5FF20" />
                  <XAxis dataKey="fecha" stroke="#ffffff60" />
                  <YAxis stroke="#ffffff60" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0A1A2F', 
                      border: '1px solid #00E5FF40',
                      borderRadius: '8px',
                      color: '#fff'
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="utilidad" 
                    stroke="#00E5FF" 
                    strokeWidth={3}
                    dot={{ fill: '#00E5FF', r: 6 }}
                    activeDot={{ r: 8 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="productos">
          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardHeader>
              <CardTitle className="text-white">Top 5 Productos Más Vendidos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={topProductos} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#00E5FF20" />
                  <XAxis type="number" stroke="#ffffff60" />
                  <YAxis dataKey="producto" type="category" stroke="#ffffff60" width={150} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0A1A2F', 
                      border: '1px solid #00E5FF40',
                      borderRadius: '8px',
                      color: '#fff'
                    }} 
                  />
                  <Bar 
                    dataKey="ventas" 
                    fill="#00E5FF" 
                    radius={[0, 8, 8, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rentabilidad">
          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardContent className="p-12 text-center">
              <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Análisis de rentabilidad por producto y categoría</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tendencias">
          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardContent className="p-12 text-center">
              <BarChart3 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Predicción de tendencias y análisis estacional</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}