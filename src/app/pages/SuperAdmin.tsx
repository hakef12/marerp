import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Settings, Building2, Users, DollarSign, Activity } from 'lucide-react';
import { toast } from 'sonner';

export default function SuperAdmin() {
  const { token, user } = useAuth();
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (user?.rol !== 'super_admin') {
      toast.error('Acceso denegado');
      return;
    }
    fetchEmpresas();
    fetchStats();
  }, []);

  const fetchEmpresas = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/admin/empresas`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setEmpresas(data.empresas || []);
      }
    } catch (error) {
      console.error('Error cargando empresas:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/admin/estadisticas`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  const cambiarEstadoEmpresa = async (empresaId: string, nuevoEstado: string) => {
    try {
      const { projectId } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/admin/empresas/${empresaId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ estado: nuevoEstado })
        }
      );

      if (response.ok) {
        toast.success(`Empresa ${nuevoEstado}`);
        fetchEmpresas();
      }
    } catch (error) {
      console.error('Error actualizando empresa:', error);
      toast.error('Error al actualizar empresa');
    }
  };

  if (user?.rol !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-[#0A1A2F]/80 border-red-500/30 max-w-md">
          <CardContent className="p-12 text-center">
            <Settings className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-white text-2xl font-bold mb-2">Acceso Denegado</h2>
            <p className="text-gray-400">Solo Super Administradores pueden acceder a este módulo</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Settings className="w-8 h-8 text-[#7B61FF]" />
          Panel de Super Administrador
        </h1>
        <p className="text-gray-400">Gestión global del sistema SaaS</p>
      </div>

      {/* KPIs Globales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-[#7B61FF]/20 to-[#00E5FF]/20 backdrop-blur-xl border-[#7B61FF]/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Total Empresas</CardTitle>
            <Building2 className="w-5 h-5 text-[#7B61FF]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats?.total_empresas || 0}</div>
            <p className="text-xs text-gray-400 mt-1">Registradas en el sistema</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-[#00E5FF]/20 backdrop-blur-xl border-green-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Empresas Activas</CardTitle>
            <Activity className="w-5 h-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">{stats?.empresas_activas || 0}</div>
            <p className="text-xs text-gray-400 mt-1">Con suscripción vigente</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[#00E5FF]/20 to-[#1e64a7]/20 backdrop-blur-xl border-[#00E5FF]/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Total Usuarios</CardTitle>
            <Users className="w-5 h-5 text-[#00E5FF]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats?.total_usuarios || 0}</div>
            <p className="text-xs text-gray-400 mt-1">En todas las empresas</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 backdrop-blur-xl border-yellow-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">MRR Total</CardTitle>
            <DollarSign className="w-5 h-5 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-400">$12,450</div>
            <p className="text-xs text-gray-400 mt-1">Ingresos recurrentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de Empresas */}
      <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
        <CardHeader>
          <CardTitle className="text-white">Gestión de Empresas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-[#00E5FF]/20 hover:bg-transparent">
                <TableHead className="text-gray-400">Empresa</TableHead>
                <TableHead className="text-gray-400">RUC/NIT</TableHead>
                <TableHead className="text-gray-400">Plan</TableHead>
                <TableHead className="text-gray-400">Estado</TableHead>
                <TableHead className="text-gray-400">Fecha Registro</TableHead>
                <TableHead className="text-gray-400">Expiración</TableHead>
                <TableHead className="text-gray-400">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {empresas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                    No hay empresas registradas
                  </TableCell>
                </TableRow>
              ) : (
                empresas.map((empresa) => (
                  <TableRow key={empresa.id} className="border-[#00E5FF]/10 hover:bg-white/5">
                    <TableCell className="text-white font-medium">{empresa.nombre}</TableCell>
                    <TableCell className="text-gray-400 font-mono">{empresa.ruc_nit}</TableCell>
                    <TableCell>
                      <Badge className="bg-[#7B61FF]/20 text-[#7B61FF] border-[#7B61FF]/30 capitalize">
                        {empresa.plan_tipo}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          empresa.estado === 'activo'
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : empresa.estado === 'suspendido'
                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }
                      >
                        {empresa.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {new Date(empresa.fecha_registro).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {empresa.fecha_expiracion
                        ? new Date(empresa.fecha_expiracion).toLocaleDateString()
                        : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {empresa.estado === 'activo' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                            onClick={() => cambiarEstadoEmpresa(empresa.id, 'suspendido')}
                          >
                            Suspender
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                            onClick={() => cambiarEstadoEmpresa(empresa.id, 'activo')}
                          >
                            Activar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Planes de Suscripción */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-[#0A1A2F]/60 border-[#00E5FF]/30 hover:border-[#00E5FF]/60 transition-all">
          <CardHeader>
            <CardTitle className="text-white text-center">Plan Basic</CardTitle>
            <div className="text-center">
              <span className="text-4xl font-bold text-[#00E5FF]">$49</span>
              <span className="text-gray-400">/mes</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>✓ POS + Inventario</li>
              <li>✓ Hasta 2 usuarios</li>
              <li>✓ 1 bodega</li>
              <li>✗ Sin contabilidad</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[#7B61FF]/20 to-[#00E5FF]/20 border-[#7B61FF]/50 hover:border-[#7B61FF]/80 transition-all scale-105">
          <CardHeader>
            <Badge className="bg-[#7B61FF] text-white mb-2 w-fit">Recomendado</Badge>
            <CardTitle className="text-white text-center">Plan Profesional</CardTitle>
            <div className="text-center">
              <span className="text-4xl font-bold text-[#7B61FF]">$129</span>
              <span className="text-gray-400">/mes</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>✓ Todos los módulos</li>
              <li>✓ Hasta 10 usuarios</li>
              <li>✓ Bodegas ilimitadas</li>
              <li>✓ Soporte prioritario</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 border-yellow-500/30 hover:border-yellow-500/60 transition-all">
          <CardHeader>
            <CardTitle className="text-white text-center">Plan Enterprise</CardTitle>
            <div className="text-center">
              <span className="text-4xl font-bold text-yellow-400">$299</span>
              <span className="text-gray-400">/mes</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>✓ Todo ilimitado</li>
              <li>✓ Multiempresa</li>
              <li>✓ API personalizada</li>
              <li>✓ Soporte 24/7</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
