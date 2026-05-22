import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Settings, Building2, Users, Activity, RefreshCw,
  Shield, ChevronDown, CheckCircle, XCircle, Zap,
  TrendingUp, Utensils, Crown, Calendar, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

const PLANES = [
  {
    codigo: 'basico',
    nombre: 'Básico',
    precio: 49,
    color: 'from-blue-500 to-cyan-500',
    icon: Zap,
    modulos: 'POS + Inventario',
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  {
    codigo: 'profesional',
    nombre: 'Profesional',
    precio: 129,
    color: 'from-purple-500 to-pink-500',
    icon: TrendingUp,
    modulos: 'Todos los módulos',
    badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  {
    codigo: 'restaurante',
    nombre: 'Restaurante',
    precio: 99,
    color: 'from-orange-500 to-red-500',
    icon: Utensils,
    modulos: 'POS + Cocina + Mesas',
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  {
    codigo: 'enterprise',
    nombre: 'Enterprise',
    precio: 299,
    color: 'from-yellow-500 to-amber-500',
    icon: Crown,
    modulos: 'Todo ilimitado',
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
];

function getPlanBadge(planTipo: string) {
  const plan = PLANES.find(p => p.codigo === planTipo);
  return plan ? plan.badge : 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

function getPlanNombre(planTipo: string) {
  const plan = PLANES.find(p => p.codigo === planTipo);
  return plan ? plan.nombre : planTipo;
}

interface Empresa {
  id: string;
  nombre: string;
  ruc_nit: string;
  email: string;
  plan_tipo: string;
  estado: string;
  fecha_registro: string;
  fecha_expiracion: string | null;
  modulos_activos: Record<string, boolean>;
}

interface GestionModalProps {
  empresa: Empresa;
  onClose: () => void;
  onSave: () => void;
  token: string;
  projectId: string;
}

function GestionModal({ empresa, onClose, onSave, token, projectId }: GestionModalProps) {
  const [planSeleccionado, setPlanSeleccionado] = useState(empresa.plan_tipo);
  const [fechaExpiracion, setFechaExpiracion] = useState(
    empresa.fecha_expiracion
      ? new Date(empresa.fecha_expiracion).toISOString().split('T')[0]
      : ''
  );
  const [loading, setLoading] = useState(false);

  const guardar = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/admin/empresas/${empresa.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-User-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            plan_tipo: planSeleccionado,
            fecha_expiracion: fechaExpiracion ? new Date(fechaExpiracion).toISOString() : undefined,
          }),
        }
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error al actualizar');
      }
      toast.success(`Plan de ${empresa.nombre} actualizado a ${getPlanNombre(planSeleccionado)}`);
      onSave();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#0A1A2F] border border-[#00E5FF]/30 rounded-2xl w-full max-w-lg shadow-2xl shadow-[#00E5FF]/10">
        {/* Header */}
        <div className="p-6 border-b border-[#00E5FF]/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7B61FF] to-[#00E5FF] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">{empresa.nombre}</h2>
              <p className="text-gray-400 text-sm">RUC: {empresa.ruc_nit}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Selector de plan */}
          <div>
            <Label className="text-gray-300 mb-3 block">Plan de Suscripción</Label>
            <div className="grid grid-cols-2 gap-3">
              {PLANES.map((plan) => {
                const Icon = plan.icon;
                const isSelected = planSeleccionado === plan.codigo;
                return (
                  <button
                    key={plan.codigo}
                    onClick={() => setPlanSeleccionado(plan.codigo)}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-[#00E5FF] bg-[#00E5FF]/10 scale-[1.02]'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    {isSelected && (
                      <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-[#00E5FF]" />
                    )}
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center mb-2`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <p className="text-white font-semibold text-sm">{plan.nombre}</p>
                    <p className="text-gray-400 text-xs">{plan.modulos}</p>
                    <p className="text-[#00E5FF] font-bold text-sm mt-1">${plan.precio}/mes</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fecha de expiración */}
          <div>
            <Label htmlFor="fecha-exp" className="text-gray-300 mb-2 block flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Fecha de expiración del plan
            </Label>
            <Input
              id="fecha-exp"
              type="date"
              value={fechaExpiracion}
              onChange={(e) => setFechaExpiracion(e.target.value)}
              className="bg-white/5 border-[#00E5FF]/20 text-white"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#00E5FF]/20 flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-gray-600 text-gray-400 hover:bg-white/5"
          >
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-[#7B61FF] to-[#00E5FF] text-white hover:opacity-90"
          >
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdmin() {
  const { token, user } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<Empresa | null>(null);
  const [projectId, setProjectId] = useState('');
  const [reparando, setReparando] = useState<string | null>(null);
  const [resultadoReparacion, setResultadoReparacion] = useState<any>(null);

  const callAdmin = async (pid: string, endpoint: string, method = 'GET') => {
    const { publicAnonKey } = await import('/utils/supabase/info');
    const res = await fetch(`https://${pid}.supabase.co/functions/v1/server${endpoint}`, {
      method,
      headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token! },
    });
    return res.json();
  };

  const ejecutarDiagnostico = async () => {
    setReparando('diagnostico');
    setResultadoReparacion(null);
    try {
      const data = await callAdmin(projectId, '/admin/diagnostico-completo');
      setResultadoReparacion({ tipo: 'diagnostico', data });
    } catch (e: any) {
      toast.error('Error en diagnóstico: ' + e.message);
    } finally { setReparando(null); }
  };

  const ejecutarFixPrecios = async () => {
    setReparando('precios');
    try {
      const data = await callAdmin(projectId, '/admin/fix-precios');
      setResultadoReparacion({ tipo: 'fix-precios', data });
      toast.success('✅ Precios actualizados desde KV');
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally { setReparando(null); }
  };

  const ejecutarRestaurar = async () => {
    if (!confirm('⚠️ Esto borrará los datos actuales de SQL y los restaurará desde KV (backup). ¿Continuar?')) return;
    setReparando('restaurar');
    try {
      const data = await callAdmin(projectId, '/admin/restaurar-desde-kv', 'POST');
      setResultadoReparacion({ tipo: 'restaurar', data });
      toast.success('✅ Datos restaurados desde KV');
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally { setReparando(null); }
  };

  useEffect(() => {
    if (user?.rol !== 'super_admin') return;
    import('/utils/supabase/info').then(({ projectId: pid }) => {
      setProjectId(pid);
      fetchEmpresas(pid);
      fetchStats(pid);
    });
  }, []);

  const fetchEmpresas = async (pid: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${pid}.supabase.co/functions/v1/server/admin/empresas`,
        { headers: { 'Authorization': `Bearer ${token}`, 'X-User-Token': token! } }
      );
      if (res.ok) {
        const data = await res.json();
        setEmpresas(data.empresas || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (pid: string) => {
    try {
      const res = await fetch(
        `https://${pid}.supabase.co/functions/v1/server/admin/estadisticas`,
        { headers: { 'Authorization': `Bearer ${token}`, 'X-User-Token': token! } }
      );
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const cambiarEstado = async (empresaId: string, nuevoEstado: string) => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/admin/empresas/${empresaId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-User-Token': token!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ estado: nuevoEstado }),
        }
      );
      if (res.ok) {
        toast.success(`Empresa ${nuevoEstado === 'activo' ? 'activada' : 'suspendida'}`);
        fetchEmpresas(projectId);
      }
    } catch (e) {
      toast.error('Error al actualizar estado');
    }
  };

  if (user?.rol !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-[#0A1A2F]/80 border-red-500/30 max-w-md">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-white text-2xl font-bold mb-2">Acceso Denegado</h2>
            <p className="text-gray-400">Solo Super Administradores pueden acceder a este módulo</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <Settings className="w-8 h-8 text-[#7B61FF]" />
            Panel Super Administrador
          </h1>
          <p className="text-gray-400">Gestión global de empresas y planes</p>
        </div>
        <Button
          onClick={() => fetchEmpresas(projectId)}
          variant="outline"
          className="border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10 gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-[#7B61FF]/20 to-[#00E5FF]/20 border-[#7B61FF]/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#7B61FF]" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Total Empresas</p>
              <p className="text-2xl font-bold text-white">{stats?.total_empresas ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Activas</p>
              <p className="text-2xl font-bold text-green-400">{stats?.empresas_activas ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/20 to-red-500/20 border-orange-500/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <XCircle className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Suspendidas</p>
              <p className="text-2xl font-bold text-orange-400">{stats?.empresas_suspendidas ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-[#00E5FF]/20 to-blue-500/20 border-[#00E5FF]/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#00E5FF]/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-[#00E5FF]" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Total Usuarios</p>
              <p className="text-2xl font-bold text-white">{stats?.total_usuarios ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribución por plan */}
      {stats?.por_plan && Object.keys(stats.por_plan).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PLANES.map((plan) => {
            const count = stats.por_plan[plan.codigo] || 0;
            const Icon = plan.icon;
            return (
              <Card key={plan.codigo} className="bg-[#0A1A2F]/60 border-white/10">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs">{plan.nombre}</p>
                    <p className="text-white font-bold">{count} empresa{count !== 1 ? 's' : ''}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabla de empresas */}
      <Card className="bg-[#0A1A2F]/60 border-[#00E5FF]/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#00E5FF]" />
            Gestión de Empresas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-gray-400">Cargando empresas...</div>
          ) : empresas.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No hay empresas registradas</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#00E5FF]/20 hover:bg-transparent">
                    <TableHead className="text-gray-400">Empresa</TableHead>
                    <TableHead className="text-gray-400">RUC / NIT</TableHead>
                    <TableHead className="text-gray-400">Plan</TableHead>
                    <TableHead className="text-gray-400">Estado</TableHead>
                    <TableHead className="text-gray-400">Registro</TableHead>
                    <TableHead className="text-gray-400">Expiración</TableHead>
                    <TableHead className="text-gray-400 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empresas.map((empresa) => (
                    <TableRow key={empresa.id} className="border-[#00E5FF]/10 hover:bg-white/5">
                      <TableCell>
                        <div>
                          <p className="text-white font-medium">{empresa.nombre}</p>
                          <p className="text-gray-500 text-xs">{empresa.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400 font-mono text-sm">{empresa.ruc_nit}</TableCell>
                      <TableCell>
                        <Badge className={`capitalize ${getPlanBadge(empresa.plan_tipo)}`}>
                          {getPlanNombre(empresa.plan_tipo)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            empresa.estado === 'activo'
                              ? 'bg-green-500/20 text-green-400 border-green-500/30'
                              : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                          }
                        >
                          {empresa.estado === 'activo' ? '● Activa' : '● Suspendida'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {new Date(empresa.fecha_registro).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {empresa.fecha_expiracion ? (
                          <span className={
                            new Date(empresa.fecha_expiracion) < new Date()
                              ? 'text-red-400'
                              : 'text-gray-400'
                          }>
                            {new Date(empresa.fecha_expiracion).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 justify-end">
                          {/* Cambiar plan */}
                          <Button
                            size="sm"
                            onClick={() => setEmpresaSeleccionada(empresa)}
                            className="bg-[#7B61FF]/20 text-[#7B61FF] border border-[#7B61FF]/30 hover:bg-[#7B61FF]/30 text-xs"
                          >
                            Gestionar
                          </Button>
                          {/* Suspender / Activar */}
                          {empresa.estado === 'activo' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cambiarEstado(empresa.id, 'suspendido')}
                              className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-xs"
                            >
                              Suspender
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cambiarEstado(empresa.id, 'activo')}
                              className="border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs"
                            >
                              Activar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Panel de Recuperación de Datos ─────────────────────────────── */}
      <Card className="bg-red-950/30 border-red-500/40">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            🛠️ Herramientas de Recuperación de Datos
          </CardTitle>
          <p className="text-gray-400 text-sm">
            Úsalas si hubo pérdida de datos o errores tras la migración KV→SQL.
            Los datos originales en KV están intactos y se pueden restaurar.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={ejecutarDiagnostico}
              disabled={!!reparando || !projectId}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {reparando === 'diagnostico' ? '⏳ Analizando...' : '🔍 Diagnóstico KV vs SQL'}
            </Button>
            <Button
              onClick={ejecutarFixPrecios}
              disabled={!!reparando || !projectId}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              {reparando === 'precios' ? '⏳ Actualizando...' : '💰 Restaurar Precios desde KV'}
            </Button>
            <Button
              onClick={ejecutarRestaurar}
              disabled={!!reparando || !projectId}
              className="bg-red-700 hover:bg-red-800 text-white"
            >
              {reparando === 'restaurar' ? '⏳ Restaurando...' : '♻️ Restaurar Todos los Datos desde KV'}
            </Button>
          </div>

          {resultadoReparacion && (
            <div className="bg-black/40 rounded-lg p-4 text-xs font-mono text-green-300 max-h-64 overflow-auto">
              <div className="text-gray-400 mb-2">
                Resultado — {resultadoReparacion.tipo}:
              </div>
              <pre>{JSON.stringify(resultadoReparacion.data, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal gestión de empresa */}
      {empresaSeleccionada && projectId && (
        <GestionModal
          empresa={empresaSeleccionada}
          token={token!}
          projectId={projectId}
          onClose={() => setEmpresaSeleccionada(null)}
          onSave={() => fetchEmpresas(projectId)}
        />
      )}
    </div>
  );
}
