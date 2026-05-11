import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Calculator,
  BookOpen,
  FileText,
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  DollarSign,
  Download,
  CheckCircle,
  AlertCircle,
  BarChart2,
  Layers,
  RefreshCw,
  Edit2,
  Trash2,
  ChevronRight,
  Activity,
  CreditCard,
  Wallet,
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { ExportButtons } from '../components/ExportButtons';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cuenta {
  id: string;
  codigo: string;
  nombre: string;
  tipo: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto';
  nivel: number;
  naturaleza: 'deudora' | 'acreedora';
  es_grupo: boolean;
  activa?: boolean;
  saldo_calculado?: number;
}

interface AsientoItem {
  cuenta_id: string;
  descripcion: string;
  debito: number;
  credito: number;
}

interface Asiento {
  id: string;
  numero: string;
  fecha: string;
  descripcion: string;
  referencia?: string;
  tipo?: string;
  estado: 'activo' | 'anulado';
  items: AsientoItem[];
  total_debito: number;
  total_credito: number;
  created_at: string;
}

interface Dashboard {
  mes: { ingreso: number; gasto: number; utilidad: number };
  anio: { ingreso: number };
  liquidez: { caja: number; cxc: number; cxp: number; ratio_corriente: number };
  total_asientos: number;
  total_cuentas: number;
}

interface PresupuestoItem {
  cuenta_id: string;
  cuenta_nombre: string;
  cuenta_codigo: string;
  presupuesto: number;
  real?: number;
  variacion?: number;
  cumplimiento?: number;
}

// ─── API Helper ───────────────────────────────────────────────────────────────

const BASE = `https://${projectId}.supabase.co/functions/v1/server`;

function useHeaders(token: string | null) {
  return {
    'Authorization': `Bearer ${publicAnonKey}`,
    'X-User-Token': token || '',
    'Content-Type': 'application/json',
  };
}

async function apiFetch(url: string, headers: Record<string, string>, options: RequestInit = {}) {
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers as Record<string,string> || {}) } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

/** Convierte un arreglo cabeceras+filas a Excel profesional (reemplaza CSV plano) */
const exportarCSV = (nombre: string, cabeceras: string[], filas: string[][]) => {
  // Convertir a array de objetos para reutilizar exportToExcel
  const data = filas.map(fila => {
    const obj: Record<string, any> = {};
    cabeceras.forEach((h, i) => { obj[h] = fila[i] ?? ''; });
    return obj;
  });
  // Título legible: reemplazar guiones bajos por espacios y capitalizar
  const titulo = nombre.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  exportToExcel(data, nombre, titulo, { title: titulo });
};

const TIPO_COLORS: Record<string, string> = {
  activo: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pasivo: 'bg-red-500/20 text-red-400 border-red-500/30',
  patrimonio: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  ingreso: 'bg-green-500/20 text-green-400 border-green-500/30',
  costo: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  gasto: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

const TIPO_LABELS: Record<string, string> = {
  activo: 'Activo', pasivo: 'Pasivo', patrimonio: 'Patrimonio',
  ingreso: 'Ingreso', costo: 'Costo', gasto: 'Gasto',
};

type TabType = 'dashboard' | 'asientos' | 'catalogo' | 'mayor' | 'balance' | 'resultados' | 'flujo' | 'presupuesto';

const TABS: { id: TabType; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'asientos', label: 'Asientos', icon: FileText },
  { id: 'catalogo', label: 'Catálogo', icon: BookOpen },
  { id: 'mayor', label: 'Libro Mayor', icon: Layers },
  { id: 'balance', label: 'Balance General', icon: DollarSign },
  { id: 'resultados', label: 'Estado de Resultados', icon: TrendingUp },
  { id: 'flujo', label: 'Flujo de Efectivo', icon: Wallet },
  { id: 'presupuesto', label: 'Presupuesto', icon: BarChart2 },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Contabilidad() {
  const { token } = useAuth();
  const headers = useHeaders(token);

  const [tab, setTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(false);

  // Data
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [asientos, setAsientos] = useState<Asiento[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [balanceData, setBalanceData] = useState<any>(null);
  const [resultadosData, setResultadosData] = useState<any>(null);
  const [flujoData, setFlujoData] = useState<any>(null);
  const [mayorData, setMayorData] = useState<any>(null);
  const [presupuesto, setPresupuesto] = useState<PresupuestoItem[]>([]);

  // Filters
  const hoy = new Date();
  const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;
  const [asientoFiltroFi, setAsientoFiltroFi] = useState(inicioMes);
  const [asientoFiltroFf, setAsientoFiltroFf] = useState(hoy.toISOString().split('T')[0]);
  const [asientoFiltroEstado, setAsientoFiltroEstado] = useState('');
  const [balanceFechaHasta, setBalanceFechaHasta] = useState(hoy.toISOString().split('T')[0]);
  const [resultFi, setResultFi] = useState(inicioMes);
  const [resultFf, setResultFf] = useState(hoy.toISOString().split('T')[0]);
  const [flujoFi, setFlujoFi] = useState(`${hoy.getFullYear()}-01-01`);
  const [flujoFf, setFlujoFf] = useState(hoy.toISOString().split('T')[0]);
  const [mayorCuentaId, setMayorCuentaId] = useState('');
  const [presAnio, setPresAnio] = useState(hoy.getFullYear());

  // Modals
  const [showAsientoModal, setShowAsientoModal] = useState(false);
  const [showCuentaModal, setShowCuentaModal] = useState(false);
  const [showAnularModal, setShowAnularModal] = useState(false);
  const [asientoAnularId, setAsientoAnularId] = useState('');
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [editCuenta, setEditCuenta] = useState<Partial<Cuenta> | null>(null);

  // Asiento form
  const emptyAsientoForm = () => ({
    fecha: hoy.toISOString().split('T')[0],
    descripcion: '',
    referencia: '',
    tipo: 'manual',
    items: [
      { cuenta_id: '', descripcion: '', debito: 0, credito: 0 },
      { cuenta_id: '', descripcion: '', debito: 0, credito: 0 },
    ] as AsientoItem[],
  });
  const [asientoForm, setAsientoForm] = useState(emptyAsientoForm());

  // Cuenta form
  const emptyCuentaForm = (): Partial<Cuenta> => ({
    codigo: '', nombre: '', tipo: 'activo', nivel: 3,
    naturaleza: 'deudora', es_grupo: false, activa: true,
  });
  const [cuentaForm, setCuentaForm] = useState<Partial<Cuenta>>(emptyCuentaForm());

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadCuentas = useCallback(async () => {
    try {
      const data = await apiFetch(`${BASE}/contabilidad/cuentas`, headers);
      setCuentas(data.cuentas || []);
    } catch (e: any) {
      toast.error('Error cargando cuentas: ' + e.message);
    }
  }, [token]);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await apiFetch(`${BASE}/contabilidad/dashboard`, headers);
      setDashboard(data);
    } catch (e: any) {
      toast.error('Error cargando dashboard: ' + e.message);
    }
  }, [token]);

  const loadAsientos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (asientoFiltroFi) params.set('fecha_inicio', asientoFiltroFi);
      if (asientoFiltroFf) params.set('fecha_fin', asientoFiltroFf);
      if (asientoFiltroEstado) params.set('estado', asientoFiltroEstado);
      const data = await apiFetch(`${BASE}/contabilidad/asientos?${params}`, headers);
      setAsientos(data.asientos || []);
    } catch (e: any) {
      toast.error('Error cargando asientos: ' + e.message);
    }
  }, [token, asientoFiltroFi, asientoFiltroFf, asientoFiltroEstado]);

  const loadBalance = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (balanceFechaHasta) params.set('fecha_hasta', balanceFechaHasta);
      const data = await apiFetch(`${BASE}/contabilidad/reportes/balance?${params}`, headers);
      setBalanceData(data);
    } catch (e: any) {
      toast.error('Error cargando balance: ' + e.message);
    }
  }, [token, balanceFechaHasta]);

  const loadResultados = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (resultFi) params.set('fecha_inicio', resultFi);
      if (resultFf) params.set('fecha_fin', resultFf);
      const data = await apiFetch(`${BASE}/contabilidad/reportes/resultados?${params}`, headers);
      setResultadosData(data);
    } catch (e: any) {
      toast.error('Error cargando resultados: ' + e.message);
    }
  }, [token, resultFi, resultFf]);

  const loadFlujo = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (flujoFi) params.set('fecha_inicio', flujoFi);
      if (flujoFf) params.set('fecha_fin', flujoFf);
      const data = await apiFetch(`${BASE}/contabilidad/reportes/flujo-efectivo?${params}`, headers);
      setFlujoData(data);
    } catch (e: any) {
      toast.error('Error cargando flujo de efectivo: ' + e.message);
    }
  }, [token, flujoFi, flujoFf]);

  const loadMayor = useCallback(async () => {
    if (!mayorCuentaId) return;
    try {
      const data = await apiFetch(`${BASE}/contabilidad/libro-mayor/${mayorCuentaId}`, headers);
      setMayorData(data);
    } catch (e: any) {
      toast.error('Error cargando libro mayor: ' + e.message);
    }
  }, [token, mayorCuentaId]);

  const loadPresupuesto = useCallback(async () => {
    try {
      const data = await apiFetch(`${BASE}/contabilidad/presupuesto/${presAnio}`, headers);
      setPresupuesto(data.presupuesto || []);
    } catch (e: any) {
      toast.error('Error cargando presupuesto: ' + e.message);
    }
  }, [token, presAnio]);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    loadCuentas();
    loadDashboard();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (tab === 'asientos') loadAsientos();
    if (tab === 'balance') loadBalance();
    if (tab === 'resultados') loadResultados();
    if (tab === 'flujo') loadFlujo();
    if (tab === 'presupuesto') loadPresupuesto();
    if (tab === 'mayor' && mayorCuentaId) loadMayor();
    if (tab === 'dashboard') loadDashboard();
  }, [tab]);

  useEffect(() => {
    if (tab === 'mayor' && mayorCuentaId) loadMayor();
  }, [mayorCuentaId]);

  // ── Asiento handlers ───────────────────────────────────────────────────────

  const addItemRow = () => {
    setAsientoForm(f => ({
      ...f,
      items: [...f.items, { cuenta_id: '', descripcion: '', debito: 0, credito: 0 }],
    }));
  };

  const removeItemRow = (i: number) => {
    if (asientoForm.items.length <= 2) { toast.warning('Mínimo 2 líneas'); return; }
    setAsientoForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  };

  const updateItem = (i: number, field: keyof AsientoItem, value: string | number) => {
    setAsientoForm(f => ({
      ...f,
      items: f.items.map((item, idx) => {
        if (idx !== i) return item;
        const updated = { ...item, [field]: value };
        if (field === 'debito' && Number(value) > 0) updated.credito = 0;
        if (field === 'credito' && Number(value) > 0) updated.debito = 0;
        return updated;
      }),
    }));
  };

  const totalDebito = asientoForm.items.reduce((s, i) => s + (i.debito || 0), 0);
  const totalCredito = asientoForm.items.reduce((s, i) => s + (i.credito || 0), 0);
  const isBalanced = totalDebito > 0 && Math.abs(totalDebito - totalCredito) < 0.01;

  const handleGuardarAsiento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) { toast.error('El asiento debe estar balanceado'); return; }
    if (asientoForm.items.some(i => !i.cuenta_id)) { toast.error('Seleccione cuenta en todas las líneas'); return; }
    try {
      await apiFetch(`${BASE}/contabilidad/asientos`, headers, {
        method: 'POST',
        body: JSON.stringify(asientoForm),
      });
      toast.success('Asiento registrado');
      setShowAsientoModal(false);
      setAsientoForm(emptyAsientoForm());
      loadAsientos();
      loadDashboard();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAnular = async () => {
    if (!motivoAnulacion.trim()) { toast.error('Ingrese motivo de anulación'); return; }
    try {
      await apiFetch(`${BASE}/contabilidad/asientos/${asientoAnularId}/anular`, headers, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivoAnulacion, fecha: hoy.toISOString().split('T')[0] }),
      });
      toast.success('Asiento anulado y reversión generada');
      setShowAnularModal(false);
      setMotivoAnulacion('');
      loadAsientos();
      loadDashboard();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Cuenta handlers ────────────────────────────────────────────────────────

  const handleGuardarCuenta = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editCuenta?.id ? 'PUT' : 'POST';
      const url = editCuenta?.id
        ? `${BASE}/contabilidad/cuentas/${editCuenta.id}`
        : `${BASE}/contabilidad/cuentas`;
      await apiFetch(url, headers, { method, body: JSON.stringify(cuentaForm) });
      toast.success(editCuenta?.id ? 'Cuenta actualizada' : 'Cuenta creada');
      setShowCuentaModal(false);
      setEditCuenta(null);
      setCuentaForm(emptyCuentaForm());
      loadCuentas();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEliminarCuenta = async (id: string) => {
    if (!confirm('¿Eliminar esta cuenta?')) return;
    try {
      await apiFetch(`${BASE}/contabilidad/cuentas/${id}`, headers, { method: 'DELETE' });
      toast.success('Cuenta eliminada');
      loadCuentas();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleInicializarPlan = async () => {
    if (!confirm('¿Inicializar Plan Contable NEC Ecuador? Solo funciona si no hay cuentas.')) return;
    setLoading(true);
    try {
      const data = await apiFetch(`${BASE}/contabilidad/cuentas/inicializar`, headers, { method: 'POST' });
      toast.success(data.message);
      loadCuentas();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Presupuesto handlers ───────────────────────────────────────────────────

  const handleGuardarPresupuesto = async () => {
    try {
      await apiFetch(`${BASE}/contabilidad/presupuesto/${presAnio}`, headers, {
        method: 'POST',
        body: JSON.stringify({ items: presupuesto }),
      });
      toast.success('Presupuesto guardado');
      loadPresupuesto();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const addPresItem = () => {
    const cuenta = cuentas.find(c => !c.es_grupo && (c.tipo === 'ingreso' || c.tipo === 'gasto' || c.tipo === 'costo'));
    if (!cuenta) return;
    setPresupuesto(p => [...p, {
      cuenta_id: cuenta.id,
      cuenta_nombre: cuenta.nombre,
      cuenta_codigo: cuenta.codigo,
      presupuesto: 0,
    }]);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Contabilidad</h1>
          <p className="text-gray-400 text-sm">Plan Contable NEC Ecuador · Partida Doble</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* ── DASHBOARD: resumen KPI ── */}
          {tab === 'dashboard' && dashboard && (
            <Button variant="outline"
              onClick={() => exportarCSV('dashboard_contable',
                ['Indicador', 'Valor'],
                [
                  ['Caja + Bancos', String((dashboard.liquidez.caja).toFixed(2))],
                  ['Cuentas por Cobrar (CxC)', String((dashboard.liquidez.cxc).toFixed(2))],
                  ['Cuentas por Pagar (CxP)', String((dashboard.liquidez.cxp).toFixed(2))],
                  ['Ratio Corriente', dashboard.liquidez.ratio_corriente.toFixed(2)],
                  ['Ingresos del Mes', String((dashboard.mes.ingreso).toFixed(2))],
                  ['Gastos del Mes', String((dashboard.mes.gasto).toFixed(2))],
                  ['Utilidad del Mes', String((dashboard.mes.utilidad).toFixed(2))],
                  ['Ingresos del Año', String((dashboard.anio.ingreso).toFixed(2))],
                  ['Total Asientos Activos', String(dashboard.total_asientos)],
                  ['Total Cuentas (hoja)', String(dashboard.total_cuentas)],
                ]
              )}
              className="border-green-500/30 text-green-400 hover:bg-green-500/10">
              <Download className="w-4 h-4 mr-2" /> Exportar CSV
            </Button>
          )}

          {/* ── ASIENTOS: Excel + PDF + nuevo ── */}
          {tab === 'asientos' && (
            <>
              <ExportButtons
                variant="compact"
                onExportExcel={() => exportToExcel(
                  asientos.map(a => ({
                    'Número': a.numero,
                    'Fecha': a.fecha,
                    'Descripción': a.descripcion,
                    'Referencia': a.referencia || '',
                    'Tipo': a.tipo || 'manual',
                    'Total Débito': a.total_debito,
                    'Total Crédito': a.total_credito,
                    'Estado': a.estado,
                  })),
                  'contabilidad_asientos',
                  'Asientos Contables',
                )}
                onExportPDF={() => exportToPDF(
                  asientos,
                  [
                    { header: 'N°', key: 'numero' },
                    { header: 'Fecha', key: 'fecha' },
                    { header: 'Descripción', key: 'descripcion' },
                    { header: 'Débito', key: 'total_debito' },
                    { header: 'Crédito', key: 'total_credito' },
                    { header: 'Estado', key: 'estado' },
                  ],
                  'Libro de Asientos Contables',
                  'contabilidad_asientos',
                )}
              />
              <Button onClick={() => setShowAsientoModal(true)}
                className="bg-gradient-to-r from-green-600 to-green-500">
                <Plus className="w-4 h-4 mr-2" /> Nuevo Asiento
              </Button>
            </>
          )}

          {/* ── CATÁLOGO: CSV + acciones ── */}
          {tab === 'catalogo' && (
            <>
              {cuentas.length > 0 && (
                <Button variant="outline"
                  onClick={() => exportarCSV('catalogo_cuentas',
                    ['Código', 'Nombre', 'Tipo', 'Nivel', 'Naturaleza', 'Es Grupo', 'Activa'],
                    cuentas.map(c => [
                      c.codigo, c.nombre, c.tipo, String(c.nivel),
                      c.naturaleza, c.es_grupo ? 'Sí' : 'No', c.activa !== false ? 'Sí' : 'No',
                    ])
                  )}
                  className="border-green-500/30 text-green-400 hover:bg-green-500/10">
                  <Download className="w-4 h-4 mr-2" /> Exportar CSV
                </Button>
              )}
              <Button variant="outline" onClick={handleInicializarPlan} disabled={loading}
                className="border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10">
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Inicializar Plan Ecuador
              </Button>
              <Button onClick={() => { setEditCuenta(null); setCuentaForm(emptyCuentaForm()); setShowCuentaModal(true); }}
                className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]">
                <Plus className="w-4 h-4 mr-2" /> Nueva Cuenta
              </Button>
            </>
          )}

          {/* ── LIBRO MAYOR: CSV con movimientos de la cuenta ── */}
          {tab === 'mayor' && mayorData && (
            <Button variant="outline"
              onClick={() => {
                const cuenta = mayorData.cuenta;
                exportarCSV(`libro_mayor_${cuenta?.codigo || 'cuenta'}`,
                  ['Fecha', 'Asiento', 'Descripción', 'Detalle', 'Débito', 'Crédito', 'Saldo'],
                  (mayorData.movimientos || []).map((m: any) => [
                    m.fecha,
                    m.numero,
                    m.descripcion,
                    m.detalle || '',
                    m.debito > 0 ? String(m.debito.toFixed(2)) : '',
                    m.credito > 0 ? String(m.credito.toFixed(2)) : '',
                    String(m.saldo.toFixed(2)),
                  ])
                );
              }}
              className="border-green-500/30 text-green-400 hover:bg-green-500/10">
              <Download className="w-4 h-4 mr-2" /> Exportar CSV
            </Button>
          )}

          {/* ── BALANCE GENERAL: actualizar + CSV + Excel ── */}
          {tab === 'balance' && (
            <>
              <Button variant="outline" onClick={loadBalance}
                className="border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10">
                <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
              </Button>
              {balanceData && (
                <>
                  <Button variant="outline"
                    onClick={() => {
                      const bCuentas: any[] = balanceData.cuentas || [];
                      const { totales } = balanceData;
                      const filas: string[][] = [];
                      bCuentas.filter((c: any) => !c.es_grupo && (c.saldo_calculado || 0) !== 0).forEach((c: any) => {
                        filas.push([c.tipo.toUpperCase(), c.codigo, c.nombre, String((c.saldo_calculado || 0).toFixed(2))]);
                      });
                      filas.push(['TOTAL', 'ACTIVO', 'Total Activos', String(totales.activo.toFixed(2))]);
                      filas.push(['TOTAL', 'PASIVO', 'Total Pasivos', String(totales.pasivo.toFixed(2))]);
                      filas.push(['TOTAL', 'PATRIMONIO', 'Total Patrimonio', String(totales.patrimonio.toFixed(2))]);
                      exportarCSV('balance_general', ['Tipo', 'Codigo', 'Cuenta', 'Saldo'], filas);
                    }}
                    className="border-green-500/30 text-green-400 hover:bg-green-500/10">
                    <Download className="w-4 h-4 mr-2" /> Exportar CSV
                  </Button>
                  <Button variant="outline"
                    onClick={() => {
                      const bCuentas: any[] = balanceData.cuentas || [];
                      const { totales } = balanceData;
                      const rows = bCuentas
                        .filter((c: any) => !c.es_grupo && (c.saldo_calculado || 0) !== 0)
                        .map((c: any) => ({
                          'Tipo': c.tipo.toUpperCase(),
                          'Código': c.codigo,
                          'Cuenta': c.nombre,
                          'Saldo': c.saldo_calculado || 0,
                        }));
                      rows.push({ 'Tipo': 'TOTAL', 'Código': '', 'Cuenta': 'Total Activos', 'Saldo': totales.activo });
                      rows.push({ 'Tipo': 'TOTAL', 'Código': '', 'Cuenta': 'Total Pasivos', 'Saldo': totales.pasivo });
                      rows.push({ 'Tipo': 'TOTAL', 'Código': '', 'Cuenta': 'Total Patrimonio', 'Saldo': totales.patrimonio });
                      exportToExcel(rows, 'balance_general', 'Balance General');
                    }}
                    className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                    <Download className="w-4 h-4 mr-2" /> Exportar Excel
                  </Button>
                </>
              )}
            </>
          )}

          {/* ── ESTADO DE RESULTADOS: actualizar + CSV + Excel ── */}
          {tab === 'resultados' && (
            <>
              <Button variant="outline" onClick={loadResultados}
                className="border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10">
                <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
              </Button>
              {resultadosData && (
                <>
                  <Button variant="outline"
                    onClick={() => {
                      const r = resultadosData.resumen;
                      const rCuentas: any[] = resultadosData.cuentas || [];
                      const filas: string[][] = [];
                      rCuentas.filter((c: any) => !c.es_grupo && (c.saldo_calculado || 0) > 0).forEach((c: any) => {
                        filas.push([c.tipo.toUpperCase(), c.codigo, c.nombre, String((c.saldo_calculado || 0).toFixed(2))]);
                      });
                      filas.push(['RESUMEN', '', 'Total Ingresos', String(r.total_ingreso.toFixed(2))]);
                      filas.push(['RESUMEN', '', 'Total Costo', String(r.total_costo.toFixed(2))]);
                      filas.push(['RESUMEN', '', 'Utilidad Bruta', String(r.utilidad_bruta.toFixed(2))]);
                      filas.push(['RESUMEN', '', 'Total Gastos', String(r.total_gasto.toFixed(2))]);
                      filas.push(['RESUMEN', '', 'Utilidad Operacional', String(r.utilidad_operacional.toFixed(2))]);
                      filas.push(['RESUMEN', '', 'Utilidad Neta', String(r.utilidad_neta.toFixed(2))]);
                      exportarCSV('estado_resultados', ['Tipo', 'Codigo', 'Cuenta', 'Valor'], filas);
                    }}
                    className="border-green-500/30 text-green-400 hover:bg-green-500/10">
                    <Download className="w-4 h-4 mr-2" /> Exportar CSV
                  </Button>
                  <Button variant="outline"
                    onClick={() => {
                      const r = resultadosData.resumen;
                      exportToExcel([
                        { 'Concepto': 'Total Ingresos', 'Valor': r.total_ingreso },
                        { 'Concepto': 'Total Costo de Ventas', 'Valor': r.total_costo },
                        { 'Concepto': 'Utilidad Bruta', 'Valor': r.utilidad_bruta },
                        { 'Concepto': 'Total Gastos Operacionales', 'Valor': r.total_gasto },
                        { 'Concepto': 'Utilidad Operacional', 'Valor': r.utilidad_operacional },
                        { 'Concepto': '15% Participación Trabajadores', 'Valor': -r.participacion_trabajadores },
                        { 'Concepto': 'Utilidad antes IR', 'Valor': r.utilidad_antes_ir },
                        { 'Concepto': '25% Impuesto a la Renta', 'Valor': -r.impuesto_renta },
                        { 'Concepto': 'UTILIDAD NETA', 'Valor': r.utilidad_neta },
                      ], 'estado_resultados', 'Estado de Resultados');
                    }}
                    className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                    <Download className="w-4 h-4 mr-2" /> Exportar Excel
                  </Button>
                </>
              )}
            </>
          )}

          {/* ── FLUJO DE EFECTIVO: CSV ── */}
          {tab === 'flujo' && flujoData && (
            <Button variant="outline"
              onClick={() => {
                const f = flujoData.flujo;
                exportarCSV('flujo_efectivo',
                  ['Sección', 'Concepto', 'Valor'],
                  [
                    ['OPERATIVO', 'Utilidad neta del período', f.operativo.utilidad_neta.toFixed(2)],
                    ['OPERATIVO', '(+) Depreciaciones', f.operativo.depreciacion.toFixed(2)],
                    ['OPERATIVO', '(+/-) Variación CxC', f.operativo.variacion_cxc.toFixed(2)],
                    ['OPERATIVO', '(+/-) Variación Inventario', f.operativo.variacion_inventario.toFixed(2)],
                    ['OPERATIVO', '(+/-) Variación CxP', f.operativo.variacion_cxp.toFixed(2)],
                    ['OPERATIVO', 'SUBTOTAL OPERATIVO', f.operativo.total.toFixed(2)],
                    ['INVERSIÓN', '(-) Compra de activos fijos', f.inversion.compra_activos.toFixed(2)],
                    ['INVERSIÓN', 'SUBTOTAL INVERSIÓN', f.inversion.total.toFixed(2)],
                    ['FINANCIAMIENTO', '(+) Préstamos recibidos', f.financiamiento.prestamos.toFixed(2)],
                    ['FINANCIAMIENTO', 'SUBTOTAL FINANCIAMIENTO', f.financiamiento.total.toFixed(2)],
                    ['TOTAL', 'VARIACIÓN NETA DE EFECTIVO', f.flujo_neto.toFixed(2)],
                  ]
                );
              }}
              className="border-green-500/30 text-green-400 hover:bg-green-500/10">
              <Download className="w-4 h-4 mr-2" /> Exportar CSV
            </Button>
          )}

          {/* ── PRESUPUESTO: CSV ── */}
          {tab === 'presupuesto' && presupuesto.length > 0 && (
            <Button variant="outline"
              onClick={() => exportarCSV(`presupuesto_${presAnio}`,
                ['Código', 'Cuenta', 'Presupuesto', 'Real', 'Variación', '% Cumplimiento'],
                presupuesto.map(p => [
                  p.cuenta_codigo,
                  p.cuenta_nombre,
                  p.presupuesto.toFixed(2),
                  (p.real || 0).toFixed(2),
                  (p.variacion || 0).toFixed(2),
                  `${(p.cumplimiento || 0).toFixed(1)}%`,
                ])
              )}
              className="border-green-500/30 text-green-400 hover:bg-green-500/10">
              <Download className="w-4 h-4 mr-2" /> Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-gradient-to-br from-[#0A1A2F]/80 to-[#1a3a52]/60 rounded-xl border border-[#00E5FF]/20 p-2 flex gap-1 overflow-x-auto flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
                tab === t.id
                  ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB: DASHBOARD ──────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-green-500/30 border-2 col-span-2 md:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-gray-400">Caja + Bancos</span>
                </div>
                <div className="text-2xl font-bold text-green-400">{fmt(dashboard?.liquidez.caja || 0)}</div>
                <div className="text-xs text-gray-500 mt-1">Saldo disponible</div>
              </CardContent>
            </Card>
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-blue-500/30 border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-gray-400">CxC</span>
                </div>
                <div className="text-2xl font-bold text-blue-400">{fmt(dashboard?.liquidez.cxc || 0)}</div>
                <div className="text-xs text-gray-500 mt-1">Por cobrar</div>
              </CardContent>
            </Card>
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-red-500/30 border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-gray-400">CxP</span>
                </div>
                <div className="text-2xl font-bold text-red-400">{fmt(dashboard?.liquidez.cxp || 0)}</div>
                <div className="text-xs text-gray-500 mt-1">Por pagar</div>
              </CardContent>
            </Card>
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/30 border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-[#00E5FF]" />
                  <span className="text-xs text-gray-400">Utilidad mes</span>
                </div>
                <div className={`text-2xl font-bold ${(dashboard?.mes.utilidad || 0) >= 0 ? 'text-[#00E5FF]' : 'text-red-400'}`}>
                  {fmt(dashboard?.mes.utilidad || 0)}
                </div>
                <div className="text-xs text-gray-500 mt-1">Ing: {fmt(dashboard?.mes.ingreso || 0)}</div>
              </CardContent>
            </Card>
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#7B61FF]/30 border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart2 className="w-4 h-4 text-[#7B61FF]" />
                  <span className="text-xs text-gray-400">Ingresos año</span>
                </div>
                <div className="text-2xl font-bold text-[#7B61FF]">{fmt(dashboard?.anio.ingreso || 0)}</div>
                <div className="text-xs text-gray-500 mt-1">Acumulado {hoy.getFullYear()}</div>
              </CardContent>
            </Card>
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-yellow-500/30 border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs text-gray-400">Ratio corriente</span>
                </div>
                <div className="text-2xl font-bold text-yellow-400">
                  {(dashboard?.liquidez.ratio_corriente || 0).toFixed(2)}x
                </div>
                <div className="text-xs text-gray-500 mt-1">(CxC+Caja)/CxP</div>
              </CardContent>
            </Card>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardHeader>
                <CardTitle className="text-white text-base">Resumen del mes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Ingresos</span>
                  <span className="text-green-400 font-semibold">{fmt(dashboard?.mes.ingreso || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Gastos y Costos</span>
                  <span className="text-red-400 font-semibold">{fmt(dashboard?.mes.gasto || 0)}</span>
                </div>
                <div className="border-t border-[#00E5FF]/20 pt-3 flex justify-between font-bold">
                  <span className="text-white">Utilidad neta</span>
                  <span className={`${(dashboard?.mes.utilidad || 0) >= 0 ? 'text-[#00E5FF]' : 'text-red-400'}`}>
                    {fmt(dashboard?.mes.utilidad || 0)}
                    {dashboard?.mes.ingreso ? ` (${fmtPct((dashboard.mes.utilidad / dashboard.mes.ingreso) * 100)})` : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardHeader>
                <CardTitle className="text-white text-base">Actividad contable</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total asientos activos</span>
                  <span className="text-white font-semibold">{dashboard?.total_asientos || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total cuentas (hoja)</span>
                  <span className="text-white font-semibold">{dashboard?.total_cuentas || 0}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => setTab('asientos')}
                    className="flex-1 bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-xs">
                    Ver asientos
                  </Button>
                  <Button size="sm" onClick={() => setTab('resultados')}
                    className="flex-1 bg-gradient-to-r from-[#7B61FF] to-[#00E5FF] text-xs">
                    Ver resultados
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── TAB: ASIENTOS ───────────────────────────────────────────────── */}
      {tab === 'asientos' && (
        <div className="space-y-4">
          {/* Filters */}
          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs text-gray-400">Desde</Label>
                  <Input type="date" value={asientoFiltroFi}
                    onChange={e => setAsientoFiltroFi(e.target.value)}
                    className="bg-white/5 border-[#00E5FF]/20 text-white text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Hasta</Label>
                  <Input type="date" value={asientoFiltroFf}
                    onChange={e => setAsientoFiltroFf(e.target.value)}
                    className="bg-white/5 border-[#00E5FF]/20 text-white text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Estado</Label>
                  <Select value={asientoFiltroEstado || '__all__'} onValueChange={v => setAsientoFiltroEstado(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="activo">Activos</SelectItem>
                      <SelectItem value="anulado">Anulados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={loadAsientos} className="w-full bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-sm">
                    <RefreshCw className="w-4 h-4 mr-1" /> Filtrar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* List */}
          {asientos.length === 0 ? (
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardContent className="p-12 text-center">
                <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No hay asientos en este período</p>
              </CardContent>
            </Card>
          ) : (
            asientos.map(asiento => (
              <Card key={asiento.id} className={`bg-[#0A1A2F]/60 backdrop-blur-xl border-2 transition-all ${
                asiento.estado === 'anulado' ? 'border-red-500/20 opacity-70' : 'border-[#00E5FF]/20 hover:border-[#7B61FF]/40'
              }`}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-[#00E5FF] font-mono font-bold">{asiento.numero}</span>
                        <Badge className={asiento.estado === 'anulado'
                          ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : 'bg-green-500/20 text-green-400 border-green-500/30'
                        }>
                          {asiento.estado === 'anulado' ? 'Anulado' : 'Activo'}
                        </Badge>
                        {asiento.tipo && asiento.tipo !== 'manual' && (
                          <Badge className="bg-[#7B61FF]/20 text-[#7B61FF] border-[#7B61FF]/30 text-xs">
                            {asiento.tipo}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{asiento.fecha} · {asiento.descripcion}</p>
                      {asiento.referencia && <p className="text-xs text-gray-500">Ref: {asiento.referencia}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right mr-4">
                        <div className="text-xs text-gray-400">Débito / Crédito</div>
                        <div className="font-bold text-white">{fmt(asiento.total_debito)} / {fmt(asiento.total_credito)}</div>
                      </div>
                      {asiento.estado !== 'anulado' && (
                        <Button size="sm" variant="outline"
                          onClick={() => { setAsientoAnularId(asiento.id); setShowAnularModal(true); }}
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs">
                          Anular
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#00E5FF]/10">
                          <th className="text-left py-1 text-gray-500 font-normal">Cuenta</th>
                          <th className="text-left py-1 text-gray-500 font-normal">Detalle</th>
                          <th className="text-right py-1 text-gray-500 font-normal w-24">Débito</th>
                          <th className="text-right py-1 text-gray-500 font-normal w-24">Crédito</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asiento.items?.map((item: any, idx: number) => {
                          const cuenta = cuentas.find(c => c.id === item.cuenta_id);
                          return (
                            <tr key={idx} className="border-b border-[#00E5FF]/5">
                              <td className="py-1 text-gray-300">
                                {cuenta ? `${cuenta.codigo} - ${cuenta.nombre}` : item.cuenta_id}
                              </td>
                              <td className="py-1 text-gray-500">{item.descripcion}</td>
                              <td className="text-right py-1 text-green-400">
                                {item.debito > 0 ? fmt(item.debito) : ''}
                              </td>
                              <td className="text-right py-1 text-red-400">
                                {item.credito > 0 ? fmt(item.credito) : ''}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="font-bold bg-white/5">
                          <td colSpan={2} className="py-2 text-gray-400 text-xs">TOTALES</td>
                          <td className="text-right py-2 text-green-400 text-xs">{fmt(asiento.total_debito)}</td>
                          <td className="text-right py-2 text-red-400 text-xs">{fmt(asiento.total_credito)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── TAB: CATÁLOGO ───────────────────────────────────────────────── */}
      {tab === 'catalogo' && (
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader>
            <CardTitle className="text-white">Plan de Cuentas NEC Ecuador</CardTitle>
            <p className="text-sm text-gray-400">{cuentas.length} cuentas registradas</p>
          </CardHeader>
          <CardContent>
            {cuentas.length === 0 ? (
              <div className="text-center py-16">
                <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg mb-2">No hay cuentas configuradas</p>
                <p className="text-gray-500 text-sm mb-6">Inicialice el Plan Contable NEC Ecuador o cree cuentas manualmente</p>
                <Button onClick={handleInicializarPlan} disabled={loading}
                  className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]">
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Inicializar Plan NEC Ecuador
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-[#00E5FF]/30">
                      <th className="text-left py-2 px-3 text-gray-400 text-xs">Código</th>
                      <th className="text-left py-2 px-3 text-gray-400 text-xs">Nombre</th>
                      <th className="text-left py-2 px-3 text-gray-400 text-xs">Tipo</th>
                      <th className="text-left py-2 px-3 text-gray-400 text-xs">Naturaleza</th>
                      <th className="text-center py-2 px-3 text-gray-400 text-xs">Grupo</th>
                      <th className="text-right py-2 px-3 text-gray-400 text-xs">Saldo</th>
                      <th className="text-center py-2 px-3 text-gray-400 text-xs">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map(cuenta => (
                      <tr key={cuenta.id}
                        className={`border-b border-[#00E5FF]/10 hover:bg-white/5 transition-colors ${
                          cuenta.es_grupo ? 'bg-white/[0.02]' : ''
                        }`}
                        style={{ paddingLeft: `${(cuenta.nivel - 1) * 12}px` }}
                      >
                        <td className="py-2 px-3">
                          <span className="font-mono text-xs text-gray-300"
                            style={{ paddingLeft: `${(cuenta.nivel - 1) * 12}px` }}>
                            {cuenta.codigo}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`text-sm ${cuenta.es_grupo ? 'font-bold text-white' : 'text-gray-300'}`}
                            style={{ paddingLeft: `${(cuenta.nivel - 1) * 12}px` }}>
                            {cuenta.nombre}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <Badge className={`text-xs ${TIPO_COLORS[cuenta.tipo]}`}>
                            {TIPO_LABELS[cuenta.tipo]}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-400 capitalize">{cuenta.naturaleza}</td>
                        <td className="py-2 px-3 text-center text-xs text-gray-500">
                          {cuenta.es_grupo ? 'Sí' : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-sm font-mono text-[#00E5FF]">
                          {cuenta.saldo_calculado !== undefined ? fmt(cuenta.saldo_calculado) : '—'}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => {
                              setEditCuenta(cuenta);
                              setCuentaForm({ ...cuenta });
                              setShowCuentaModal(true);
                            }} className="p-1 text-blue-400 hover:bg-blue-500/10 rounded">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            {!cuenta.es_grupo && (
                              <button onClick={() => handleEliminarCuenta(cuenta.id)}
                                className="p-1 text-red-400 hover:bg-red-500/10 rounded">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB: LIBRO MAYOR ────────────────────────────────────────────── */}
      {tab === 'mayor' && (
        <div className="space-y-4">
          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardContent className="p-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label className="text-xs text-gray-400">Seleccionar cuenta</Label>
                  <Select value={mayorCuentaId} onValueChange={setMayorCuentaId}>
                    <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white mt-1">
                      <SelectValue placeholder="Elegir cuenta..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30 max-h-64">
                      {cuentas.filter(c => !c.es_grupo).map(c => (
                        <SelectItem key={c.id} value={c.id} className="text-white hover:bg-white/10">
                          {c.codigo} — {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={loadMayor} disabled={!mayorCuentaId}
                  className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]">
                  Cargar Libro Mayor
                </Button>
              </div>
            </CardContent>
          </Card>

          {mayorData && (
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-white">{mayorData.cuenta?.codigo} — {mayorData.cuenta?.nombre}</CardTitle>
                    <p className="text-sm text-gray-400 mt-1 capitalize">
                      Tipo: {TIPO_LABELS[mayorData.cuenta?.tipo]} · Naturaleza: {mayorData.cuenta?.naturaleza}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Saldo final</div>
                    <div className="text-2xl font-bold text-[#00E5FF]">{fmt(mayorData.saldo_final || 0)}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {mayorData.movimientos?.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Sin movimientos en esta cuenta</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-[#00E5FF]/30">
                          <th className="text-left py-2 px-2 text-gray-400 text-xs">Fecha</th>
                          <th className="text-left py-2 px-2 text-gray-400 text-xs">Asiento</th>
                          <th className="text-left py-2 px-2 text-gray-400 text-xs">Descripción</th>
                          <th className="text-right py-2 px-2 text-gray-400 text-xs">Débito</th>
                          <th className="text-right py-2 px-2 text-gray-400 text-xs">Crédito</th>
                          <th className="text-right py-2 px-2 text-gray-400 text-xs">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mayorData.movimientos.map((mov: any, i: number) => (
                          <tr key={i} className="border-b border-[#00E5FF]/10 hover:bg-white/5">
                            <td className="py-2 px-2 text-gray-400 text-xs">{mov.fecha}</td>
                            <td className="py-2 px-2 text-[#00E5FF] font-mono text-xs">{mov.numero}</td>
                            <td className="py-2 px-2 text-gray-300 text-xs">
                              {mov.descripcion}
                              {mov.detalle && <span className="text-gray-500"> · {mov.detalle}</span>}
                            </td>
                            <td className="py-2 px-2 text-right text-green-400 text-xs">
                              {mov.debito > 0 ? fmt(mov.debito) : ''}
                            </td>
                            <td className="py-2 px-2 text-right text-red-400 text-xs">
                              {mov.credito > 0 ? fmt(mov.credito) : ''}
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-bold text-white text-xs">
                              {fmt(mov.saldo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!mayorData && !mayorCuentaId && (
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardContent className="p-12 text-center">
                <Layers className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">Seleccione una cuenta para ver sus movimientos</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── TAB: BALANCE GENERAL ────────────────────────────────────────── */}
      {tab === 'balance' && (
        <div className="space-y-4">
          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardContent className="p-4">
              <div className="flex gap-4 items-end">
                <div>
                  <Label className="text-xs text-gray-400">Hasta la fecha</Label>
                  <Input type="date" value={balanceFechaHasta}
                    onChange={e => setBalanceFechaHasta(e.target.value)}
                    className="bg-white/5 border-[#00E5FF]/20 text-white mt-1" />
                </div>
                <Button onClick={loadBalance} className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]">
                  <RefreshCw className="w-4 h-4 mr-2" /> Generar
                </Button>
              </div>
            </CardContent>
          </Card>

          {balanceData && (() => {
            const bCuentas: Cuenta[] = balanceData.cuentas || [];
            const activos = bCuentas.filter(c => c.tipo === 'activo' && !c.es_grupo);
            const pasivos = bCuentas.filter(c => c.tipo === 'pasivo' && !c.es_grupo);
            const patrimonio = bCuentas.filter(c => c.tipo === 'patrimonio' && !c.es_grupo);
            const { totales, balanceado } = balanceData;
            return (
              <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
                <CardHeader className="bg-gradient-to-r from-[#7B61FF]/10 to-[#00E5FF]/10 border-b border-[#00E5FF]/20">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-white">Balance General</CardTitle>
                      <p className="text-sm text-gray-400">Hasta {balanceFechaHasta}</p>
                    </div>
                    <Badge className={balanceado ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                      {balanceado ? <><CheckCircle className="w-3 h-3 mr-1 inline" />Cuadrado</> : <><AlertCircle className="w-3 h-3 mr-1 inline" />Descuadrado</>}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* ACTIVOS */}
                    <div>
                      <h3 className="font-bold text-lg text-white mb-4 pb-2 border-b-2 border-blue-500">ACTIVOS</h3>
                      <div className="space-y-1">
                        {activos.filter(c => (c.saldo_calculado || 0) !== 0).map(c => (
                          <div key={c.id} className="flex justify-between text-sm hover:bg-white/5 p-1.5 rounded">
                            <span className="text-gray-300 text-xs"><span className="font-mono text-gray-500 mr-2">{c.codigo}</span>{c.nombre}</span>
                            <span className="text-white font-medium text-xs">{fmt(c.saldo_calculado || 0)}</span>
                          </div>
                        ))}
                        {activos.filter(c => (c.saldo_calculado || 0) === 0).length === activos.length && (
                          <p className="text-gray-600 text-xs py-2">Sin movimientos</p>
                        )}
                        <div className="flex justify-between pt-3 mt-2 border-t-2 border-blue-500 font-bold">
                          <span className="text-white">TOTAL ACTIVOS</span>
                          <span className="text-blue-400">{fmt(totales.activo)}</span>
                        </div>
                      </div>
                    </div>
                    {/* PASIVOS + PATRIMONIO */}
                    <div className="space-y-6">
                      <div>
                        <h3 className="font-bold text-lg text-white mb-4 pb-2 border-b-2 border-red-500">PASIVOS</h3>
                        <div className="space-y-1">
                          {pasivos.filter(c => (c.saldo_calculado || 0) !== 0).map(c => (
                            <div key={c.id} className="flex justify-between text-sm hover:bg-white/5 p-1.5 rounded">
                              <span className="text-gray-300 text-xs"><span className="font-mono text-gray-500 mr-2">{c.codigo}</span>{c.nombre}</span>
                              <span className="text-white font-medium text-xs">{fmt(c.saldo_calculado || 0)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between pt-3 border-t border-red-500/40 font-semibold">
                            <span className="text-gray-300">Total Pasivos</span>
                            <span className="text-red-400">{fmt(totales.pasivo)}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-white mb-4 pb-2 border-b-2 border-purple-500">PATRIMONIO</h3>
                        <div className="space-y-1">
                          {patrimonio.filter(c => (c.saldo_calculado || 0) !== 0).map(c => (
                            <div key={c.id} className="flex justify-between text-sm hover:bg-white/5 p-1.5 rounded">
                              <span className="text-gray-300 text-xs"><span className="font-mono text-gray-500 mr-2">{c.codigo}</span>{c.nombre}</span>
                              <span className="text-white font-medium text-xs">{fmt(c.saldo_calculado || 0)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between pt-3 border-t border-purple-500/40 font-semibold">
                            <span className="text-gray-300">Total Patrimonio</span>
                            <span className="text-purple-400">{fmt(totales.patrimonio)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between pt-3 border-t-2 border-white font-bold text-lg">
                        <span className="text-white">PASIVO + PATRIMONIO</span>
                        <span className="text-[#7B61FF]">{fmt(totales.pasivo + totales.patrimonio)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {!balanceData && (
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardContent className="p-12 text-center">
                <DollarSign className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">Haga clic en "Generar" para ver el Balance General</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── TAB: ESTADO DE RESULTADOS ───────────────────────────────────── */}
      {tab === 'resultados' && (
        <div className="space-y-4">
          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardContent className="p-4">
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <Label className="text-xs text-gray-400">Desde</Label>
                  <Input type="date" value={resultFi}
                    onChange={e => setResultFi(e.target.value)}
                    className="bg-white/5 border-[#00E5FF]/20 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Hasta</Label>
                  <Input type="date" value={resultFf}
                    onChange={e => setResultFf(e.target.value)}
                    className="bg-white/5 border-[#00E5FF]/20 text-white mt-1" />
                </div>
                <Button onClick={loadResultados} className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]">
                  <RefreshCw className="w-4 h-4 mr-2" /> Generar
                </Button>
              </div>
            </CardContent>
          </Card>

          {resultadosData && (() => {
            const r = resultadosData.resumen;
            const rCuentas: Cuenta[] = resultadosData.cuentas || [];
            const ingresos = rCuentas.filter(c => c.tipo === 'ingreso' && !c.es_grupo);
            const costos = rCuentas.filter(c => c.tipo === 'costo' && !c.es_grupo);
            const gastos = rCuentas.filter(c => c.tipo === 'gasto' && !c.es_grupo);
            const LineRow = ({ label, value, color = 'text-white', bold = false, indent = false }: any) => (
              <div className={`flex justify-between py-1 ${indent ? 'pl-4' : ''} ${bold ? 'font-bold' : 'text-sm'}`}>
                <span className={bold ? 'text-white' : 'text-gray-300'}>{label}</span>
                <span className={color}>{fmt(value)}</span>
              </div>
            );
            return (
              <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
                <CardHeader className="bg-gradient-to-r from-green-500/10 to-[#00E5FF]/10 border-b border-[#00E5FF]/20">
                  <CardTitle className="text-white">Estado de Resultados Integral</CardTitle>
                  <p className="text-sm text-gray-400">{resultFi} al {resultFf}</p>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Ingresos */}
                  <div>
                    <h3 className="font-bold text-white border-b-2 border-green-500 pb-2 mb-3">INGRESOS</h3>
                    {ingresos.filter(c => (c.saldo_calculado || 0) > 0).map(c => (
                      <div key={c.id} className="flex justify-between py-1 pl-4 text-sm">
                        <span className="text-gray-300 text-xs">{c.codigo} — {c.nombre}</span>
                        <span className="text-green-400 text-xs">{fmt(c.saldo_calculado || 0)}</span>
                      </div>
                    ))}
                    <LineRow label="TOTAL INGRESOS" value={r.total_ingreso} color="text-green-400" bold />
                  </div>

                  {/* Costos */}
                  <div>
                    <h3 className="font-bold text-white border-b-2 border-orange-500 pb-2 mb-3">COSTO DE VENTAS</h3>
                    {costos.filter(c => (c.saldo_calculado || 0) > 0).map(c => (
                      <div key={c.id} className="flex justify-between py-1 pl-4 text-sm">
                        <span className="text-gray-300 text-xs">{c.codigo} — {c.nombre}</span>
                        <span className="text-orange-400 text-xs">({fmt(c.saldo_calculado || 0)})</span>
                      </div>
                    ))}
                    <LineRow label="TOTAL COSTO" value={r.total_costo} color="text-orange-400" bold />
                    <div className="mt-2 pt-2 border-t border-[#00E5FF]/20">
                      <LineRow label={`UTILIDAD BRUTA (${fmtPct(r.margen_bruto)})`} value={r.utilidad_bruta}
                        color={r.utilidad_bruta >= 0 ? 'text-[#00E5FF]' : 'text-red-400'} bold />
                    </div>
                  </div>

                  {/* Gastos */}
                  <div>
                    <h3 className="font-bold text-white border-b-2 border-yellow-500 pb-2 mb-3">GASTOS OPERACIONALES</h3>
                    {gastos.filter(c => (c.saldo_calculado || 0) > 0).map(c => (
                      <div key={c.id} className="flex justify-between py-1 pl-4 text-sm">
                        <span className="text-gray-300 text-xs">{c.codigo} — {c.nombre}</span>
                        <span className="text-yellow-400 text-xs">({fmt(c.saldo_calculado || 0)})</span>
                      </div>
                    ))}
                    <LineRow label="TOTAL GASTOS" value={r.total_gasto} color="text-yellow-400" bold />
                    <div className="mt-2 pt-2 border-t border-[#00E5FF]/20">
                      <LineRow label={`UTILIDAD OPERACIONAL (${fmtPct(r.margen_operacional)})`} value={r.utilidad_operacional}
                        color={r.utilidad_operacional >= 0 ? 'text-[#00E5FF]' : 'text-red-400'} bold />
                    </div>
                  </div>

                  {/* Distribución */}
                  <div className="bg-gradient-to-r from-white/5 to-white/10 p-5 rounded-xl space-y-2">
                    <h3 className="font-bold text-white mb-3">DISTRIBUCIÓN Y UTILIDAD NETA</h3>
                    <LineRow label="15% Participación Trabajadores" value={r.participacion_trabajadores} color="text-red-400" indent />
                    <LineRow label="Utilidad antes IR" value={r.utilidad_antes_ir} color="text-white" indent />
                    <LineRow label="25% Impuesto a la Renta" value={r.impuesto_renta} color="text-red-400" indent />
                    <div className="border-t-2 border-[#00E5FF]/40 mt-3 pt-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          {r.utilidad_neta >= 0 ? <TrendingUp className="w-6 h-6 text-green-400" /> : <TrendingDown className="w-6 h-6 text-red-400" />}
                          <span className="text-xl font-bold text-white">
                            {r.utilidad_neta >= 0 ? 'UTILIDAD NETA' : 'PÉRDIDA NETA'}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${r.utilidad_neta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {fmt(r.utilidad_neta)}
                          </div>
                          <div className="text-xs text-gray-400">Margen {fmtPct(r.margen_neto)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {!resultadosData && (
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardContent className="p-12 text-center">
                <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">Haga clic en "Generar" para ver el Estado de Resultados</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── TAB: FLUJO DE EFECTIVO ──────────────────────────────────────── */}
      {tab === 'flujo' && (
        <div className="space-y-4">
          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardContent className="p-4">
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <Label className="text-xs text-gray-400">Desde</Label>
                  <Input type="date" value={flujoFi}
                    onChange={e => setFlujoFi(e.target.value)}
                    className="bg-white/5 border-[#00E5FF]/20 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Hasta</Label>
                  <Input type="date" value={flujoFf}
                    onChange={e => setFlujoFf(e.target.value)}
                    className="bg-white/5 border-[#00E5FF]/20 text-white mt-1" />
                </div>
                <Button onClick={loadFlujo} className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]">
                  <RefreshCw className="w-4 h-4 mr-2" /> Generar
                </Button>
              </div>
            </CardContent>
          </Card>

          {flujoData && (() => {
            const f = flujoData.flujo;
            const Section = ({ title, color, items, total }: any) => (
              <div className="space-y-2">
                <h3 className={`font-bold text-white border-b-2 ${color} pb-2`}>{title}</h3>
                {items.map(([label, value]: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm pl-4">
                    <span className="text-gray-400">{label}</span>
                    <span className={value >= 0 ? 'text-green-400' : 'text-red-400'}>{fmt(value)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-2 border-t border-white/10">
                  <span className="text-white">Subtotal</span>
                  <span className={total >= 0 ? 'text-[#00E5FF]' : 'text-red-400'}>{fmt(total)}</span>
                </div>
              </div>
            );
            return (
              <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
                <CardHeader className="bg-gradient-to-r from-[#00E5FF]/10 to-[#7B61FF]/10 border-b border-[#00E5FF]/20">
                  <CardTitle className="text-white">Estado de Flujo de Efectivo</CardTitle>
                  <p className="text-sm text-gray-400">Método Indirecto · {flujoData.periodo?.inicio} al {flujoData.periodo?.fin}</p>
                </CardHeader>
                <CardContent className="p-6 space-y-8">
                  <Section title="ACTIVIDADES OPERATIVAS"
                    color="border-green-500"
                    items={[
                      ['Utilidad neta del período', f.operativo.utilidad_neta],
                      ['(+) Depreciaciones', f.operativo.depreciacion],
                      ['(+/-) Variación CxC', f.operativo.variacion_cxc],
                      ['(+/-) Variación Inventario', f.operativo.variacion_inventario],
                      ['(+/-) Variación CxP', f.operativo.variacion_cxp],
                    ]}
                    total={f.operativo.total}
                  />
                  <Section title="ACTIVIDADES DE INVERSIÓN"
                    color="border-yellow-500"
                    items={[['(-) Compra de activos fijos', f.inversion.compra_activos]]}
                    total={f.inversion.total}
                  />
                  <Section title="ACTIVIDADES DE FINANCIAMIENTO"
                    color="border-purple-500"
                    items={[['(+) Préstamos recibidos', f.financiamiento.prestamos]]}
                    total={f.financiamiento.total}
                  />
                  <div className={`p-5 rounded-xl border-2 ${f.flujo_neto >= 0 ? 'bg-green-500/10 border-green-500/40' : 'bg-red-500/10 border-red-500/40'}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <Wallet className={`w-8 h-8 ${f.flujo_neto >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                        <span className="text-xl font-bold text-white">VARIACIÓN NETA DE EFECTIVO</span>
                      </div>
                      <span className={`text-3xl font-bold ${f.flujo_neto >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmt(f.flujo_neto)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {!flujoData && (
            <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
              <CardContent className="p-12 text-center">
                <Wallet className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">Haga clic en "Generar" para ver el Flujo de Efectivo</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── TAB: PRESUPUESTO ────────────────────────────────────────────── */}
      {tab === 'presupuesto' && (
        <div className="space-y-4">
          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardContent className="p-4">
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <Label className="text-xs text-gray-400">Año</Label>
                  <Input type="number" value={presAnio} min={2020} max={2035}
                    onChange={e => setPresAnio(parseInt(e.target.value))}
                    className="bg-white/5 border-[#00E5FF]/20 text-white mt-1 w-28" />
                </div>
                <Button onClick={loadPresupuesto} className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]">
                  <RefreshCw className="w-4 h-4 mr-2" /> Cargar
                </Button>
                <Button onClick={addPresItem} variant="outline"
                  className="border-green-500/30 text-green-400 hover:bg-green-500/10">
                  <Plus className="w-4 h-4 mr-2" /> Agregar línea
                </Button>
                <Button onClick={handleGuardarPresupuesto}
                  className="bg-gradient-to-r from-green-600 to-green-500">
                  <Download className="w-4 h-4 mr-2" /> Guardar Presupuesto
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardHeader>
              <CardTitle className="text-white">Presupuesto {presAnio} vs Real</CardTitle>
            </CardHeader>
            <CardContent>
              {presupuesto.length === 0 ? (
                <div className="text-center py-12">
                  <BarChart2 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No hay líneas presupuestadas para {presAnio}</p>
                  <p className="text-gray-500 text-sm mt-2">Haga clic en "Agregar línea" para comenzar</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-[#00E5FF]/30">
                        <th className="text-left py-2 px-3 text-gray-400 text-xs">Cuenta</th>
                        <th className="text-right py-2 px-3 text-gray-400 text-xs">Presupuesto</th>
                        <th className="text-right py-2 px-3 text-gray-400 text-xs">Real</th>
                        <th className="text-right py-2 px-3 text-gray-400 text-xs">Variación</th>
                        <th className="text-right py-2 px-3 text-gray-400 text-xs">% Cumpl.</th>
                        <th className="text-center py-2 px-3 text-gray-400 text-xs">Acc.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presupuesto.map((item, idx) => {
                        const cumpl = item.cumplimiento || 0;
                        const variacion = item.variacion || 0;
                        return (
                          <tr key={idx} className="border-b border-[#00E5FF]/10 hover:bg-white/5">
                            <td className="py-2 px-3">
                              <Select value={item.cuenta_id}
                                onValueChange={v => {
                                  const c = cuentas.find(cu => cu.id === v);
                                  setPresupuesto(p => p.map((pi, i) => i === idx ? {
                                    ...pi, cuenta_id: v,
                                    cuenta_nombre: c?.nombre || '',
                                    cuenta_codigo: c?.codigo || '',
                                  } : pi));
                                }}
                              >
                                <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white text-xs h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                                  {cuentas.filter(c => !c.es_grupo).map(c => (
                                    <SelectItem key={c.id} value={c.id} className="text-white text-xs">
                                      {c.codigo} — {c.nombre}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-2 px-3">
                              <Input type="number" step="0.01" min="0"
                                value={item.presupuesto}
                                onChange={e => setPresupuesto(p => p.map((pi, i) => i === idx ? { ...pi, presupuesto: parseFloat(e.target.value) || 0 } : pi))}
                                className="bg-white/5 border-[#00E5FF]/20 text-white text-xs h-8 text-right"
                              />
                            </td>
                            <td className="py-2 px-3 text-right text-white text-sm font-mono">
                              {item.real !== undefined ? fmt(item.real) : '—'}
                            </td>
                            <td className={`py-2 px-3 text-right text-sm font-mono ${variacion >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {item.variacion !== undefined ? fmt(variacion) : '—'}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 bg-gray-800 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full ${cumpl >= 100 ? 'bg-green-500' : cumpl >= 75 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                    style={{ width: `${Math.min(100, cumpl)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-300">{cumpl.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button onClick={() => setPresupuesto(p => p.filter((_, i) => i !== idx))}
                                className="p-1 text-red-400 hover:bg-red-500/10 rounded">
                                <X className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#00E5FF]/30 bg-white/5">
                        <td className="py-2 px-3 font-bold text-white text-sm">TOTALES</td>
                        <td className="py-2 px-3 text-right font-bold text-white text-sm">
                          {fmt(presupuesto.reduce((s, i) => s + i.presupuesto, 0))}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-white text-sm">
                          {fmt(presupuesto.reduce((s, i) => s + (i.real || 0), 0))}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-sm">
                          <span className={presupuesto.reduce((s, i) => s + (i.variacion || 0), 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {fmt(presupuesto.reduce((s, i) => s + (i.variacion || 0), 0))}
                          </span>
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── MODAL: NUEVO ASIENTO ────────────────────────────────────────── */}
      <Dialog open={showAsientoModal} onOpenChange={open => { if (!open) { setShowAsientoModal(false); setAsientoForm(emptyAsientoForm()); } }}>
        <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/30 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Nuevo Asiento Contable — Partida Doble</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGuardarAsiento} className="space-y-5 mt-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-gray-400">Fecha *</Label>
                <Input type="date" value={asientoForm.fecha}
                  onChange={e => setAsientoForm(f => ({ ...f, fecha: e.target.value }))}
                  className="bg-white/5 border-[#00E5FF]/20 text-white mt-1" required />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Tipo</Label>
                <Select value={asientoForm.tipo}
                  onValueChange={v => setAsientoForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="venta">Venta</SelectItem>
                    <SelectItem value="compra">Compra</SelectItem>
                    <SelectItem value="nomina">Nómina</SelectItem>
                    <SelectItem value="ajuste">Ajuste</SelectItem>
                    <SelectItem value="cierre">Cierre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400">Referencia</Label>
                <Input value={asientoForm.referencia}
                  onChange={e => setAsientoForm(f => ({ ...f, referencia: e.target.value }))}
                  placeholder="Factura, Contrato..."
                  className="bg-white/5 border-[#00E5FF]/20 text-white mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-400">Descripción / Glosa *</Label>
              <Textarea value={asientoForm.descripcion}
                onChange={e => setAsientoForm(f => ({ ...f, descripcion: e.target.value }))}
                rows={2} required
                className="bg-white/5 border-[#00E5FF]/20 text-white mt-1"
                placeholder="Descripción del asiento contable..." />
            </div>

            {/* Items */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-xs text-gray-400">Líneas del Asiento</Label>
                <button type="button" onClick={addItemRow}
                  className="text-xs text-[#00E5FF] hover:text-white flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Agregar línea
                </button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 px-1">
                  <div className="col-span-5">Cuenta</div>
                  <div className="col-span-3">Detalle</div>
                  <div className="col-span-2 text-right">Débito</div>
                  <div className="col-span-2 text-right">Crédito</div>
                </div>
                {asientoForm.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 bg-white/5 rounded-lg border border-[#00E5FF]/10">
                    <div className="col-span-5">
                      <Select value={item.cuenta_id}
                        onValueChange={v => updateItem(idx, 'cuenta_id', v)}>
                        <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white text-xs h-8">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30 max-h-48">
                          {cuentas.filter(c => !c.es_grupo).map(c => (
                            <SelectItem key={c.id} value={c.id} className="text-white text-xs">
                              {c.codigo} — {c.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Input value={item.descripcion}
                        onChange={e => updateItem(idx, 'descripcion', e.target.value)}
                        placeholder="Detalle..."
                        className="bg-white/5 border-[#00E5FF]/20 text-white text-xs h-8" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" step="0.01" min="0"
                        value={item.debito || ''}
                        onChange={e => updateItem(idx, 'debito', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="bg-green-500/10 border-green-500/20 text-green-400 text-xs h-8 text-right" />
                    </div>
                    <div className="col-span-2">
                      <div className="flex gap-1">
                        <Input type="number" step="0.01" min="0"
                          value={item.credito || ''}
                          onChange={e => updateItem(idx, 'credito', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="bg-red-500/10 border-red-500/20 text-red-400 text-xs h-8 text-right flex-1" />
                        <button type="button" onClick={() => removeItemRow(idx)}
                          className="p-1 text-gray-500 hover:text-red-400">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Balance check */}
            <div className={`rounded-lg p-4 ${isBalanced ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Total Débitos</span>
                  <div className="text-lg font-bold text-green-400">{fmt(totalDebito)}</div>
                </div>
                <div>
                  <span className="text-gray-400">Total Créditos</span>
                  <div className="text-lg font-bold text-red-400">{fmt(totalCredito)}</div>
                </div>
                <div>
                  <span className="text-gray-400">Estado</span>
                  <div className={`text-lg font-bold flex items-center gap-2 ${isBalanced ? 'text-green-400' : 'text-red-400'}`}>
                    {isBalanced ? <><CheckCircle className="w-5 h-5" /> Balanceado</> : <><AlertCircle className="w-5 h-5" /> Diferencia: {fmt(Math.abs(totalDebito - totalCredito))}</>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline"
                onClick={() => { setShowAsientoModal(false); setAsientoForm(emptyAsientoForm()); }}
                className="flex-1 border-[#00E5FF]/30 text-white">
                Cancelar
              </Button>
              <Button type="submit" disabled={!isBalanced}
                className="flex-1 bg-gradient-to-r from-green-600 to-green-500 disabled:opacity-50">
                <CheckCircle className="w-4 h-4 mr-2" /> Registrar Asiento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: ANULAR ASIENTO ───────────────────────────────────────── */}
      <Dialog open={showAnularModal} onOpenChange={setShowAnularModal}>
        <DialogContent className="bg-[#0A1A2F] border-red-500/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-400">Anular Asiento Contable</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-gray-400 text-sm">
              Esta acción anulará el asiento y generará automáticamente un asiento de reversión.
            </p>
            <div>
              <Label className="text-xs text-gray-400">Motivo de anulación *</Label>
              <Textarea value={motivoAnulacion}
                onChange={e => setMotivoAnulacion(e.target.value)}
                rows={3} required
                className="bg-white/5 border-red-500/20 text-white mt-1"
                placeholder="Especifique el motivo..." />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setShowAnularModal(false); setMotivoAnulacion(''); }}
                className="flex-1 border-[#00E5FF]/30 text-white">
                Cancelar
              </Button>
              <Button onClick={handleAnular}
                className="flex-1 bg-gradient-to-r from-red-700 to-red-500">
                Confirmar Anulación
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: CUENTA ───────────────────────────────────────────────── */}
      <Dialog open={showCuentaModal} onOpenChange={setShowCuentaModal}>
        <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/30 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{editCuenta?.id ? 'Editar' : 'Nueva'} Cuenta Contable</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGuardarCuenta} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-400">Código *</Label>
                <Input value={cuentaForm.codigo}
                  onChange={e => setCuentaForm(f => ({ ...f, codigo: e.target.value }))}
                  placeholder="1.1.01" required
                  className="bg-white/5 border-[#00E5FF]/20 text-white mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Nivel</Label>
                <Select value={String(cuentaForm.nivel)}
                  onValueChange={v => setCuentaForm(f => ({ ...f, nivel: parseInt(v) }))}>
                  <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                    <SelectItem value="1">Nivel 1 (Grupo principal)</SelectItem>
                    <SelectItem value="2">Nivel 2 (Subgrupo)</SelectItem>
                    <SelectItem value="3">Nivel 3 (Cuenta detalle)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-400">Nombre *</Label>
              <Input value={cuentaForm.nombre}
                onChange={e => setCuentaForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre de la cuenta" required
                className="bg-white/5 border-[#00E5FF]/20 text-white mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-400">Tipo *</Label>
                <Select value={cuentaForm.tipo}
                  onValueChange={v => {
                    const nat = ['activo','costo','gasto'].includes(v) ? 'deudora' : 'acreedora';
                    setCuentaForm(f => ({ ...f, tipo: v as any, naturaleza: nat as any }));
                  }}>
                  <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="pasivo">Pasivo</SelectItem>
                    <SelectItem value="patrimonio">Patrimonio</SelectItem>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                    <SelectItem value="costo">Costo</SelectItem>
                    <SelectItem value="gasto">Gasto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400">Naturaleza</Label>
                <Select value={cuentaForm.naturaleza}
                  onValueChange={v => setCuentaForm(f => ({ ...f, naturaleza: v as any }))}>
                  <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                    <SelectItem value="deudora">Deudora</SelectItem>
                    <SelectItem value="acreedora">Acreedora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input type="checkbox" checked={cuentaForm.es_grupo}
                  onChange={e => setCuentaForm(f => ({ ...f, es_grupo: e.target.checked }))}
                  className="rounded" />
                Es cuenta de grupo (no acepta movimientos)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input type="checkbox" checked={cuentaForm.activa}
                  onChange={e => setCuentaForm(f => ({ ...f, activa: e.target.checked }))}
                  className="rounded" />
                Activa
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline"
                onClick={() => { setShowCuentaModal(false); setEditCuenta(null); setCuentaForm(emptyCuentaForm()); }}
                className="flex-1 border-[#00E5FF]/30 text-white">
                Cancelar
              </Button>
              <Button type="submit"
                className="flex-1 bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]">
                {editCuenta?.id ? 'Actualizar' : 'Crear'} Cuenta
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
