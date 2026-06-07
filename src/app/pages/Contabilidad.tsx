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
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext, PaginationLink } from '../components/ui/pagination';

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

type TabType = 'dashboard' | 'asientos' | 'catalogo' | 'mayor' | 'balance' | 'resultados' | 'flujo' | 'presupuesto' | 'activos' | 'formularios' | 'conciliacion' | 'cierres' | 'cxc';

const TABS: { id: TabType; label: string; icon: any }[] = [
  { id: 'dashboard',    label: 'Dashboard',           icon: Activity },
  { id: 'asientos',     label: 'Asientos',             icon: FileText },
  { id: 'catalogo',     label: 'Catálogo',             icon: BookOpen },
  { id: 'mayor',        label: 'Libro Mayor',          icon: Layers },
  { id: 'balance',      label: 'Balance General',      icon: DollarSign },
  { id: 'resultados',   label: 'Estado Resultados',    icon: TrendingUp },
  { id: 'flujo',        label: 'Flujo Efectivo',       icon: Wallet },
  { id: 'presupuesto',  label: 'Presupuesto',          icon: BarChart2 },
  { id: 'activos',      label: 'Activos Fijos',        icon: Calculator },
  { id: 'formularios',  label: 'Form. 104 / 103',      icon: CreditCard },
  { id: 'conciliacion', label: 'Conciliación Bancaria', icon: CheckCircle },
  { id: 'cierres',      label: 'Cierres de Período',   icon: AlertCircle },
  { id: 'cxc',          label: 'Cuentas x Cobrar',     icon: TrendingUp },
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
  const [asientoPage, setAsientoPage]   = useState(1);
  const [asientoPages, setAsientoPages] = useState(1);
  const [asientoTotal, setAsientoTotal] = useState(0);
  const [balanceFechaHasta, setBalanceFechaHasta] = useState(hoy.toISOString().split('T')[0]);
  const [resultFi, setResultFi] = useState(inicioMes);
  const [resultFf, setResultFf] = useState(hoy.toISOString().split('T')[0]);
  const [flujoFi, setFlujoFi] = useState(`${hoy.getFullYear()}-01-01`);
  const [flujoFf, setFlujoFf] = useState(hoy.toISOString().split('T')[0]);
  const [mayorCuentaId, setMayorCuentaId] = useState('');
  const [presAnio, setPresAnio] = useState(hoy.getFullYear());

  // ── Activos Fijos ────────────────────────────────────────────────────────
  const [activos, setActivos]                   = useState<any[]>([]);
  const [showActivoModal, setShowActivoModal]   = useState(false);
  const [editActivo, setEditActivo]             = useState<any>(null);
  const [depAnio, setDepAnio]                   = useState(hoy.getFullYear());
  const [depMes, setDepMes]                     = useState(hoy.getMonth() + 1);
  const [depLoading, setDepLoading]             = useState(false);
  const emptyActivo = () => ({
    nombre: '', codigo: '', categoria: 'equipo', descripcion: '',
    fecha_adquisicion: hoy.toISOString().split('T')[0],
    valor_adquisicion: '', vida_util_meses: 60, metodo_depreciacion: 'lineal',
    valor_residual: 0, cuenta_activo_codigo: '1.2.02',
    cuenta_dep_codigo: '1.2.03', cuenta_gasto_codigo: '6.1.05',
    proveedor: '', factura_compra: '', notas: '',
  });
  const [activoForm, setActivoForm]             = useState<any>(emptyActivo());

  // ── Formularios 104 / 103 ────────────────────────────────────────────────
  const [formTipo, setFormTipo]                 = useState<'104'|'103'|'125'|'102'>('104');
  const [formSemestre, setFormSemestre]         = useState(1);
  const [formMes, setFormMes]                   = useState(hoy.getMonth() + 1);
  const [formAnio, setFormAnio]                 = useState(hoy.getFullYear());
  const [formData, setFormData]                 = useState<any>(null);
  const [formLoading, setFormLoading]           = useState(false);

  // ── Cuentas por Cobrar ───────────────────────────────────────────────────
  const [cxcData, setCxcData]               = useState<any>(null);
  const [cxcLoading, setCxcLoading]         = useState(false);
  const [cxcFiltroCliente, setCxcFiltroCliente] = useState('');
  const [cxcEstado, setCxcEstado]           = useState<'pendiente'|'cobrado'|'todos'>('pendiente');
  const [cxcCobrando, setCxcCobrando]       = useState<string|null>(null);
  const [cxcMontoModal, setCxcMontoModal]   = useState('');
  const [cxcMetodo, setCxcMetodo]           = useState('efectivo');
  const [cxcFechaCobro, setCxcFechaCobro]   = useState(new Date().toISOString().split('T')[0]);
  const [cxcNotas, setCxcNotas]             = useState('');
  const [cxcPagando, setCxcPagando]         = useState(false);

  // ── Conciliación Bancaria ────────────────────────────────────────────────
  const [conciliaciones, setConciliaciones]     = useState<any[]>([]);
  const [concSeleccionada, setConcSeleccionada] = useState<any>(null);
  const [concBanco, setConcBanco]               = useState('');
  const [concCuenta, setConcCuenta]             = useState('');
  const [concMes, setConcMes]                   = useState(hoy.getMonth() + 1);
  const [concAnio, setConcAnio]                 = useState(hoy.getFullYear());
  const [concSaldoBanco, setConcSaldoBanco]     = useState('');
  const [concMovimientosTxt, setConcMovimientosTxt] = useState('');
  const [concLoading, setConcLoading]           = useState(false);
  const [concResultado, setConcResultado]       = useState<any>(null);

  // ── Cierres de Período ───────────────────────────────────────────────────
  const [periodos, setPeriodos]                 = useState<any[]>([]);
  const [cierreAnio, setCierreAnio]             = useState(hoy.getFullYear());
  const [cierreLoading, setCierreLoading]       = useState(false);
  const [cierreAnualAnio, setCierreAnualAnio]   = useState(hoy.getFullYear());

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

  // ── Activos Fijos ─────────────────────────────────────────────────────────
  const loadActivos = useCallback(async () => {
    try { const d = await apiFetch(`${BASE}/contabilidad/activos-fijos`, headers); setActivos(d.activos||[]); }
    catch (e: any) { toast.error('Error activos: ' + e.message); }
  }, [token]);

  const saveActivo = async () => {
    try {
      const method = editActivo?.id ? 'PUT' : 'POST';
      const url = editActivo?.id ? `${BASE}/contabilidad/activos-fijos/${editActivo.id}` : `${BASE}/contabilidad/activos-fijos`;
      await apiFetch(url, headers, { method, body: JSON.stringify({ ...activoForm, valor_adquisicion: Number(activoForm.valor_adquisicion) }) });
      toast.success(editActivo?.id ? 'Activo actualizado' : 'Activo registrado');
      setShowActivoModal(false); setEditActivo(null); setActivoForm(emptyActivo());
      loadActivos();
    } catch (e: any) { toast.error(e.message); }
  };

  const depreciarMes = async () => {
    if (!confirm(`¿Generar asientos de depreciación para ${depMes}/${depAnio}? Se procesarán todos los activos activos.`)) return;
    setDepLoading(true);
    try {
      const d = await apiFetch(`${BASE}/contabilidad/activos-fijos/depreciar`, headers, {
        method: 'POST', body: JSON.stringify({ anio: depAnio, mes: depMes }),
      });
      toast.success(`✅ ${d.generados} asientos de depreciación generados${d.errores?.length ? ` · ${d.errores.length} errores` : ''}`);
      if (d.errores?.length) toast.error('Errores: ' + d.errores.slice(0,3).join(' | '));
      loadActivos(); loadAsientos();
    } catch (e: any) { toast.error(e.message); }
    finally { setDepLoading(false); }
  };

  // ── Formularios ──────────────────────────────────────────────────────────
  const loadFormulario = async () => {
    setFormLoading(true);
    try {
      const url = formTipo === '125'
        ? `${BASE}/contabilidad/formulario-125?semestre=${formSemestre}&anio=${formAnio}`
        : formTipo === '102'
        ? `${BASE}/contabilidad/formulario-102?anio=${formAnio}`
        : `${BASE}/contabilidad/formulario-${formTipo}?mes=${formMes}&anio=${formAnio}`;
      const d = await apiFetch(url, headers);
      setFormData(d);
    } catch (e: any) { toast.error(e.message); }
    finally { setFormLoading(false); }
  };

  // ── Conciliación ─────────────────────────────────────────────────────────
  const loadConciliaciones = useCallback(async () => {
    try { const d = await apiFetch(`${BASE}/contabilidad/conciliacion`, headers); setConciliaciones(d.conciliaciones||[]); }
    catch (e: any) { /* silencioso */ }
  }, [token]);

  const importarExtracto = async () => {
    if (!concBanco || !concMovimientosTxt || !concSaldoBanco) {
      toast.error('Completa banco, saldo final y pega el extracto'); return;
    }
    setConcLoading(true);
    try {
      // Parsear CSV del extracto (formato: fecha,descripcion,debito,credito)
      const lineas = concMovimientosTxt.trim().split('\n').slice(1); // skip header
      const movimientos = lineas.map((l, i) => {
        const cols = l.split(',').map(c => c.replace(/"/g,'').trim());
        return { linea: i+2, fecha: cols[0]||'', descripcion: cols[1]||'', debito: Number(cols[2]||0), credito: Number(cols[3]||0), saldo: Number(cols[4]||0) };
      }).filter(m => m.fecha);

      const d = await apiFetch(`${BASE}/contabilidad/conciliacion/importar`, headers, {
        method: 'POST',
        body: JSON.stringify({ banco: concBanco, cuenta_banco: concCuenta, mes: concMes, anio: concAnio,
          saldo_banco_final: Number(concSaldoBanco), movimientos_banco: movimientos }),
      });
      setConcResultado(d);
      toast.success(`Conciliación procesada: ${d.resumen?.conciliados_banco} de ${d.resumen?.total_banco} movimientos conciliados`);
      loadConciliaciones();
    } catch (e: any) { toast.error(e.message); }
    finally { setConcLoading(false); }
  };

  // ── Cierres de Período ───────────────────────────────────────────────────
  const loadPeriodos = useCallback(async () => {
    try { const d = await apiFetch(`${BASE}/contabilidad/periodos?anio=${cierreAnio}`, headers); setPeriodos(d.periodos||[]); }
    catch (e: any) { /* silencioso */ }
  }, [token, cierreAnio]);

  const cerrarPeriodo = async (mes: number) => {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    if (!confirm(`¿Cerrar ${meses[mes-1]} ${cierreAnio}? No se podrán crear ni modificar asientos en ese período.`)) return;
    setCierreLoading(true);
    try {
      const d = await apiFetch(`${BASE}/contabilidad/periodos/cerrar`, headers, {
        method: 'POST', body: JSON.stringify({ anio: cierreAnio, mes }),
      });
      toast.success(`✅ Período ${meses[mes-1]} ${cierreAnio} cerrado — ${d.asientos_cerrados} asientos bloqueados`);
      loadPeriodos();
    } catch (e: any) { toast.error(e.message); }
    finally { setCierreLoading(false); }
  };

  const reabrirPeriodo = async (mes: number) => {
    const motivo = prompt('Motivo de reapertura (requerido):');
    if (!motivo) return;
    try {
      await apiFetch(`${BASE}/contabilidad/periodos/reabrir`, headers, {
        method: 'POST', body: JSON.stringify({ anio: cierreAnio, mes, motivo }),
      });
      toast.success('Período reabierto');
      loadPeriodos();
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Cuentas por Cobrar ────────────────────────────────────────────────────
  const loadCxC = useCallback(async () => {
    setCxcLoading(true);
    try {
      const params = new URLSearchParams({ estado: cxcEstado });
      if (cxcFiltroCliente) params.set('cliente', cxcFiltroCliente);
      const d = await apiFetch(`${BASE}/contabilidad/cxc?${params}`, headers);
      setCxcData(d);
    } catch (e: any) { toast.error('Error CxC: ' + e.message); }
    finally { setCxcLoading(false); }
  }, [token, cxcEstado, cxcFiltroCliente]);

  const registrarCobro = async () => {
    if (!cxcCobrando || !cxcMontoModal) return;
    setCxcPagando(true);
    try {
      const factura = cxcData?.facturas?.find((f: any) => f.id === cxcCobrando);
      await apiFetch(`${BASE}/contabilidad/cxc/cobrar`, headers, {
        method: 'POST',
        body: JSON.stringify({ factura_id: cxcCobrando, monto: Number(cxcMontoModal), fecha: cxcFechaCobro, metodo: cxcMetodo, notas: cxcNotas }),
      });
      toast.success(`✅ Cobro de $${Number(cxcMontoModal).toFixed(2)} registrado — asiento contable generado`);
      setCxcCobrando(null); setCxcMontoModal(''); setCxcNotas('');
      loadCxC(); loadAsientos();
    } catch (e: any) { toast.error(e.message); }
    finally { setCxcPagando(false); }
  };

  const generarCierreAnual = async () => {
    if (!confirm(`¿Generar asiento de cierre del ejercicio ${cierreAnualAnio}? Esto cerrará cuentas de ingresos y gastos.`)) return;
    try {
      const d = await apiFetch(`${BASE}/contabilidad/cierre-anual`, headers, {
        method: 'POST', body: JSON.stringify({ anio: cierreAnualAnio }),
      });
      toast.success(`✅ Cierre generado — Utilidad: $${Number(d.resumen?.utilidad||0).toFixed(2)}`);
      loadAsientos();
    } catch (e: any) { toast.error(e.message); }
  };

  const loadAsientos = useCallback(async (page = 1) => {
    try {
      const params = new URLSearchParams();
      if (asientoFiltroFi) params.set('fecha_inicio', asientoFiltroFi);
      if (asientoFiltroFf) params.set('fecha_fin', asientoFiltroFf);
      if (asientoFiltroEstado) params.set('estado', asientoFiltroEstado);
      params.set('page', String(page));
      params.set('limit', '50');
      const data = await apiFetch(`${BASE}/contabilidad/asientos?${params}`, headers);
      setAsientos(data.asientos || []);
      setAsientoPage(data.page || page);
      setAsientoPages(data.pages || 1);
      setAsientoTotal(data.total || 0);
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
    if (tab === 'asientos')     loadAsientos();
    if (tab === 'balance')      loadBalance();
    if (tab === 'resultados')   loadResultados();
    if (tab === 'flujo')        loadFlujo();
    if (tab === 'presupuesto')  loadPresupuesto();
    if (tab === 'mayor' && mayorCuentaId) loadMayor();
    if (tab === 'dashboard')    loadDashboard();
    if (tab === 'activos')      loadActivos();
    if (tab === 'conciliacion') loadConciliaciones();
    if (tab === 'cierres')      loadPeriodos();
    if (tab === 'cxc')          loadCxC();
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
      const res = await fetch(`${BASE}/contabilidad/asientos/${asientoAnularId}/anular`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ motivo: motivoAnulacion, fecha: hoy.toISOString().split('T')[0] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[anular-asiento] error:', data);
        const paso = data.paso ? ` (paso: ${data.paso.join(' → ')})` : '';
        const details = data.details ? ` | ${data.details}` : '';
        toast.error((data.error || `Error ${res.status}`) + paso + details);
        return;
      }
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
    if (!confirm('¿Inicializar / Sincronizar Plan Contable NEC Ecuador? Agrega cuentas faltantes sin eliminar las existentes.')) return;
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

  // ── Reparar asientos faltantes de ventas ─────────────────────────────────
  const [repararLoading, setRepararLoading] = useState(false);

  const handleRepararAsientos = async () => {
    const hoyEC = new Date(Date.now() - 5*3600*1000).toISOString().split('T')[0];
    const fechaInicio = prompt('Fecha inicio (YYYY-MM-DD):', hoyEC);
    if (!fechaInicio) return;
    const fechaFin = prompt('Fecha fin (YYYY-MM-DD):', hoyEC);
    if (!fechaFin) return;

    setRepararLoading(true);
    try {
      const res = await fetch(`${BASE}/admin/generar-asientos-ventas`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fecha_inicio: fechaInicio, fecha_fin: fechaFin }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Error'); return; }

      const generados = data.generados ?? 0;
      const yaExistian = data.ya_tenian_asiento ?? 0;
      const total = data.total_ventas_en_rango ?? 0;
      const duplicados = (data.errores || []).filter((e: string) => e.includes('duplicate')).length;

      toast.success(
        `✅ ${generados} generados · ${yaExistian + duplicados} ya existían · ${total} ventas en rango`,
        { duration: 8000 }
      );

      const otrosErrores = (data.errores || []).filter((e: string) => !e.includes('duplicate'));
      if (otrosErrores.length) toast.error('Errores: ' + otrosErrores.join(', '), { duration: 10000 });

      // Limpiar filtros de fecha para que aparezcan sin importar el offset UTC/Ecuador
      setAsientoFiltroFi('');
      setAsientoFiltroFf('');
      setTimeout(() => loadAsientos(1), 150);
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setRepararLoading(false);
    }
  };

  // ── Reparar asientos de COMPRAS ──────────────────────────────────────────────
  const [repararComprasLoading, setRepararComprasLoading] = useState(false);

  const handleRepararAsientosCompras = async () => {
    const hoyEC = new Date(Date.now() - 5*3600*1000).toISOString().split('T')[0];
    const fechaInicio = prompt('Fecha inicio (YYYY-MM-DD):', '2026-05-01');
    if (!fechaInicio) return;
    const fechaFin = prompt('Fecha fin (YYYY-MM-DD):', hoyEC);
    if (!fechaFin) return;

    setRepararComprasLoading(true);
    try {
      const res = await fetch(`${BASE}/admin/generar-asientos-compras`, {
        method: 'POST', headers,
        body: JSON.stringify({ fecha_inicio: fechaInicio, fecha_fin: fechaFin }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Error'); return; }

      const generados   = data.generados ?? 0;
      const yaExistian  = data.ya_tenian_asiento ?? 0;
      const total       = data.total_compras ?? 0;
      toast.success(`✅ ${generados} asientos de compras generados · ${yaExistian} ya existían · ${total} compras en rango`, { duration: 8000 });
      if (data.errores?.length) toast.error('Errores: ' + data.errores.slice(0,3).join(' | '));
      setAsientoFiltroFi(''); setAsientoFiltroFf('');
      setTimeout(() => loadAsientos(1), 150);
    } catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setRepararComprasLoading(false); }
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
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Contabilidad</h1>
          <p className="text-gray-600 text-sm">Plan Contable NEC Ecuador · Partida Doble</p>
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
              <Button
                onClick={handleRepararAsientos}
                disabled={repararLoading}
                variant="outline"
                className="border-orange-400 text-orange-600 hover:bg-orange-50"
                title="Genera asientos faltantes de ventas POS"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${repararLoading ? 'animate-spin' : ''}`} />
                {repararLoading ? 'Generando…' : 'Reparar Ventas'}
              </Button>
              <Button
                onClick={handleRepararAsientosCompras}
                disabled={repararComprasLoading}
                variant="outline"
                className="border-blue-400 text-blue-600 hover:bg-blue-50"
                title="Genera asientos faltantes de compras"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${repararComprasLoading ? 'animate-spin' : ''}`} />
                {repararComprasLoading ? 'Generando…' : 'Reparar Compras'}
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
                className="border-[#F97316]/30 text-[#F97316] hover:bg-[#F97316]/10">
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Sincronizar Plan Ecuador
              </Button>
              <Button onClick={() => { setEditCuenta(null); setCuentaForm(emptyCuentaForm()); setShowCuentaModal(true); }}
                className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
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
                className="border-[#F97316]/30 text-[#F97316] hover:bg-[#F97316]/10">
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
                className="border-[#F97316]/30 text-[#F97316] hover:bg-[#F97316]/10">
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
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-[#F97316]/20 p-2 flex gap-1 overflow-x-auto flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
                tab === t.id
                  ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
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
            <Card className="bg-white border-green-500/30 border-2 col-span-2 md:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-gray-600">Caja + Bancos</span>
                </div>
                <div className="text-2xl font-bold text-green-400">{fmt(dashboard?.liquidez.caja || 0)}</div>
                <div className="text-xs text-gray-600 mt-1">Saldo disponible</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-blue-500/30 border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-gray-600">CxC</span>
                </div>
                <div className="text-2xl font-bold text-blue-400">{fmt(dashboard?.liquidez.cxc || 0)}</div>
                <div className="text-xs text-gray-600 mt-1">Por cobrar</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-red-500/30 border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-gray-600">CxP</span>
                </div>
                <div className="text-2xl font-bold text-red-400">{fmt(dashboard?.liquidez.cxp || 0)}</div>
                <div className="text-xs text-gray-600 mt-1">Por pagar</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-[#F97316]/30 border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-[#F97316]" />
                  <span className="text-xs text-gray-600">Utilidad mes</span>
                </div>
                <div className={`text-2xl font-bold ${(dashboard?.mes.utilidad || 0) >= 0 ? 'text-[#F97316]' : 'text-red-400'}`}>
                  {fmt(dashboard?.mes.utilidad || 0)}
                </div>
                <div className="text-xs text-gray-600 mt-1">Ing: {fmt(dashboard?.mes.ingreso || 0)}</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-[#FB923C]/30 border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart2 className="w-4 h-4 text-[#FB923C]" />
                  <span className="text-xs text-gray-600">Ingresos año</span>
                </div>
                <div className="text-2xl font-bold text-[#FB923C]">{fmt(dashboard?.anio.ingreso || 0)}</div>
                <div className="text-xs text-gray-600 mt-1">Acumulado {hoy.getFullYear()}</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-yellow-500/30 border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs text-gray-600">Ratio corriente</span>
                </div>
                <div className="text-2xl font-bold text-yellow-400">
                  {(dashboard?.liquidez.ratio_corriente || 0).toFixed(2)}x
                </div>
                <div className="text-xs text-gray-600 mt-1">(CxC+Caja)/CxP</div>
              </CardContent>
            </Card>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-white border-[#F97316]/20">
              <CardHeader>
                <CardTitle className="text-gray-900 text-base">Resumen del mes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Ingresos</span>
                  <span className="text-green-400 font-semibold">{fmt(dashboard?.mes.ingreso || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Gastos y Costos</span>
                  <span className="text-red-400 font-semibold">{fmt(dashboard?.mes.gasto || 0)}</span>
                </div>
                <div className="border-t border-[#F97316]/20 pt-3 flex justify-between font-bold">
                  <span className="text-gray-900">Utilidad neta</span>
                  <span className={`${(dashboard?.mes.utilidad || 0) >= 0 ? 'text-[#F97316]' : 'text-red-400'}`}>
                    {fmt(dashboard?.mes.utilidad || 0)}
                    {dashboard?.mes.ingreso ? ` (${fmtPct((dashboard.mes.utilidad / dashboard.mes.ingreso) * 100)})` : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-[#F97316]/20">
              <CardHeader>
                <CardTitle className="text-gray-900 text-base">Actividad contable</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total asientos activos</span>
                  <span className="text-gray-900 font-semibold">{dashboard?.total_asientos || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total cuentas (hoja)</span>
                  <span className="text-gray-900 font-semibold">{dashboard?.total_cuentas || 0}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => setTab('asientos')}
                    className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316] text-xs">
                    Ver asientos
                  </Button>
                  <Button size="sm" onClick={() => setTab('resultados')}
                    className="flex-1 bg-gradient-to-r from-[#FB923C] to-[#F97316] text-xs">
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
          <Card className="bg-white border-[#F97316]/20">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs text-gray-600">Desde</Label>
                  <Input type="date" value={asientoFiltroFi}
                    onChange={e => setAsientoFiltroFi(e.target.value)}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Hasta</Label>
                  <Input type="date" value={asientoFiltroFf}
                    onChange={e => setAsientoFiltroFf(e.target.value)}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Estado</Label>
                  <Select value={asientoFiltroEstado || '__all__'} onValueChange={v => setAsientoFiltroEstado(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#F97316]/30">
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="activo">Activos</SelectItem>
                      <SelectItem value="anulado">Anulados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={() => { setAsientoPage(1); loadAsientos(1); }} className="w-full bg-gradient-to-r from-[#C2410C] to-[#F97316] text-sm">
                    <RefreshCw className="w-4 h-4 mr-1" /> Filtrar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* List header: total count */}
          {asientoTotal > 0 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-gray-600">{asientoTotal} asiento{asientoTotal !== 1 ? 's' : ''} encontrado{asientoTotal !== 1 ? 's' : ''}</p>
              <p className="text-xs text-gray-600">Página {asientoPage} de {asientoPages}</p>
            </div>
          )}

          {/* List */}
          {asientos.length === 0 ? (
            <Card className="bg-white border-[#F97316]/20">
              <CardContent className="p-12 text-center">
                <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600">No hay asientos en este período</p>
              </CardContent>
            </Card>
          ) : (
            <>
            {asientos.map(asiento => (
              <Card key={asiento.id} className={`bg-white border-2 transition-all ${
                asiento.estado === 'anulado' ? 'border-red-500/20 opacity-70' : 'border-[#F97316]/20 hover:border-[#FB923C]/40'
              }`}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-[#F97316] font-mono font-bold">{asiento.numero}</span>
                        <Badge className={asiento.estado === 'anulado'
                          ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : 'bg-green-500/20 text-green-400 border-green-500/30'
                        }>
                          {asiento.estado === 'anulado' ? 'Anulado' : 'Activo'}
                        </Badge>
                        {asiento.tipo && asiento.tipo !== 'manual' && (
                          <Badge className="bg-[#FB923C]/20 text-[#FB923C] border-[#FB923C]/30 text-xs">
                            {asiento.tipo}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{asiento.fecha} · {asiento.descripcion}</p>
                      {asiento.referencia && <p className="text-xs text-gray-600">Ref: {asiento.referencia}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right mr-4">
                        <div className="text-xs text-gray-600">Débito / Crédito</div>
                        <div className="font-bold text-gray-900">{fmt(asiento.total_debito)} / {fmt(asiento.total_credito)}</div>
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
                        <tr className="border-b border-[#F97316]/10">
                          <th className="text-left py-1 text-gray-600 font-normal">Cuenta</th>
                          <th className="text-left py-1 text-gray-600 font-normal">Detalle</th>
                          <th className="text-right py-1 text-gray-600 font-normal w-24">Débito</th>
                          <th className="text-right py-1 text-gray-600 font-normal w-24">Crédito</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asiento.items?.map((item: any, idx: number) => {
                          const cuenta = cuentas.find(c => c.id === item.cuenta_id);
                          return (
                            <tr key={idx} className="border-b border-[#F97316]/5">
                              <td className="py-1 text-gray-600">
                                {cuenta ? `${cuenta.codigo} - ${cuenta.nombre}` : item.cuenta_id}
                              </td>
                              <td className="py-1 text-gray-600">{item.descripcion}</td>
                              <td className="text-right py-1 text-green-400">
                                {item.debito > 0 ? fmt(item.debito) : ''}
                              </td>
                              <td className="text-right py-1 text-red-400">
                                {item.credito > 0 ? fmt(item.credito) : ''}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="font-bold bg-gray-50">
                          <td colSpan={2} className="py-2 text-gray-600 text-xs">TOTALES</td>
                          <td className="text-right py-2 text-green-400 text-xs">{fmt(asiento.total_debito)}</td>
                          <td className="text-right py-2 text-red-400 text-xs">{fmt(asiento.total_credito)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
            {/* Pagination */}
            {asientoPages > 1 && (
              <div className="flex justify-center mt-2">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => { if (asientoPage > 1) loadAsientos(asientoPage - 1); }}
                        className={asientoPage <= 1 ? 'pointer-events-none opacity-40 text-gray-600' : 'cursor-pointer text-[#F97316] hover:text-[#F97316]'}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, asientoPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(asientoPage - 2, asientoPages - 4));
                      const p = start + i;
                      if (p > asientoPages) return null;
                      return (
                        <PaginationItem key={p}>
                          <PaginationLink
                            isActive={p === asientoPage}
                            onClick={() => loadAsientos(p)}
                            className={`cursor-pointer ${p === asientoPage ? 'bg-[#F97316]/20 text-[#F97316] border-[#F97316]/40' : 'text-gray-600 hover:text-gray-900'}`}
                          >{p}</PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => { if (asientoPage < asientoPages) loadAsientos(asientoPage + 1); }}
                        className={asientoPage >= asientoPages ? 'pointer-events-none opacity-40 text-gray-600' : 'cursor-pointer text-[#F97316] hover:text-[#F97316]'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* ── TAB: CATÁLOGO ───────────────────────────────────────────────── */}
      {tab === 'catalogo' && (
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <CardTitle className="text-gray-900">Plan de Cuentas NEC Ecuador</CardTitle>
            <p className="text-sm text-gray-600">{cuentas.length} cuentas registradas</p>
          </CardHeader>
          <CardContent>
            {cuentas.length === 0 ? (
              <div className="text-center py-16">
                <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600 text-lg mb-2">No hay cuentas configuradas</p>
                <p className="text-gray-600 text-sm mb-6">Inicialice el Plan Contable NEC Ecuador o cree cuentas manualmente</p>
                <Button onClick={handleInicializarPlan} disabled={loading}
                  className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Inicializar Plan NEC Ecuador
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-[#F97316]/30">
                      <th className="text-left py-2 px-3 text-gray-600 text-xs">Código</th>
                      <th className="text-left py-2 px-3 text-gray-600 text-xs">Nombre</th>
                      <th className="text-left py-2 px-3 text-gray-600 text-xs">Tipo</th>
                      <th className="text-left py-2 px-3 text-gray-600 text-xs">Naturaleza</th>
                      <th className="text-center py-2 px-3 text-gray-600 text-xs">Grupo</th>
                      <th className="text-right py-2 px-3 text-gray-600 text-xs">Saldo</th>
                      <th className="text-center py-2 px-3 text-gray-600 text-xs">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map(cuenta => (
                      <tr key={cuenta.id}
                        className={`border-b border-[#F97316]/10 hover:bg-gray-50 transition-colors ${
                          cuenta.es_grupo ? 'bg-white/[0.02]' : ''
                        }`}
                        style={{ paddingLeft: `${(cuenta.nivel - 1) * 12}px` }}
                      >
                        <td className="py-2 px-3">
                          <span className="font-mono text-xs text-gray-600"
                            style={{ paddingLeft: `${(cuenta.nivel - 1) * 12}px` }}>
                            {cuenta.codigo}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`text-sm ${cuenta.es_grupo ? 'font-bold text-gray-900' : 'text-gray-600'}`}
                            style={{ paddingLeft: `${(cuenta.nivel - 1) * 12}px` }}>
                            {cuenta.nombre}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <Badge className={`text-xs ${TIPO_COLORS[cuenta.tipo]}`}>
                            {TIPO_LABELS[cuenta.tipo]}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600 capitalize">{cuenta.naturaleza}</td>
                        <td className="py-2 px-3 text-center text-xs text-gray-600">
                          {cuenta.es_grupo ? 'Sí' : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-sm font-mono text-[#F97316]">
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
          <Card className="bg-white border-[#F97316]/20">
            <CardContent className="p-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label className="text-xs text-gray-600">Seleccionar cuenta</Label>
                  <Select value={mayorCuentaId} onValueChange={setMayorCuentaId}>
                    <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1">
                      <SelectValue placeholder="Elegir cuenta..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#F97316]/30 max-h-64">
                      {cuentas.filter(c => !c.es_grupo).map(c => (
                        <SelectItem key={c.id} value={c.id} className="text-gray-900 hover:bg-gray-100">
                          {c.codigo} — {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={loadMayor} disabled={!mayorCuentaId}
                  className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                  Cargar Libro Mayor
                </Button>
              </div>
            </CardContent>
          </Card>

          {mayorData && (
            <Card className="bg-white border-[#F97316]/20">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-gray-900">{mayorData.cuenta?.codigo} — {mayorData.cuenta?.nombre}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1 capitalize">
                      Tipo: {TIPO_LABELS[mayorData.cuenta?.tipo]} · Naturaleza: {mayorData.cuenta?.naturaleza}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-600">Saldo final</div>
                    <div className="text-2xl font-bold text-[#F97316]">{fmt(mayorData.saldo_final || 0)}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {mayorData.movimientos?.length === 0 ? (
                  <p className="text-center text-gray-600 py-8">Sin movimientos en esta cuenta</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-[#F97316]/30">
                          <th className="text-left py-2 px-2 text-gray-600 text-xs">Fecha</th>
                          <th className="text-left py-2 px-2 text-gray-600 text-xs">Asiento</th>
                          <th className="text-left py-2 px-2 text-gray-600 text-xs">Descripción</th>
                          <th className="text-right py-2 px-2 text-gray-600 text-xs">Débito</th>
                          <th className="text-right py-2 px-2 text-gray-600 text-xs">Crédito</th>
                          <th className="text-right py-2 px-2 text-gray-600 text-xs">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mayorData.movimientos.map((mov: any, i: number) => (
                          <tr key={i} className="border-b border-[#F97316]/10 hover:bg-gray-50">
                            <td className="py-2 px-2 text-gray-600 text-xs">{mov.fecha}</td>
                            <td className="py-2 px-2 text-[#F97316] font-mono text-xs">{mov.numero}</td>
                            <td className="py-2 px-2 text-gray-600 text-xs">
                              {mov.descripcion}
                              {mov.detalle && <span className="text-gray-600"> · {mov.detalle}</span>}
                            </td>
                            <td className="py-2 px-2 text-right text-green-400 text-xs">
                              {mov.debito > 0 ? fmt(mov.debito) : ''}
                            </td>
                            <td className="py-2 px-2 text-right text-red-400 text-xs">
                              {mov.credito > 0 ? fmt(mov.credito) : ''}
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-bold text-gray-900 text-xs">
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
            <Card className="bg-white border-[#F97316]/20">
              <CardContent className="p-12 text-center">
                <Layers className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600">Seleccione una cuenta para ver sus movimientos</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── TAB: BALANCE GENERAL ────────────────────────────────────────── */}
      {tab === 'balance' && (
        <div className="space-y-4">
          <Card className="bg-white border-[#F97316]/20">
            <CardContent className="p-4">
              <div className="flex gap-4 items-end">
                <div>
                  <Label className="text-xs text-gray-600">Hasta la fecha</Label>
                  <Input type="date" value={balanceFechaHasta}
                    onChange={e => setBalanceFechaHasta(e.target.value)}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1" />
                </div>
                <Button onClick={loadBalance} className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
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
              <Card className="bg-white border-[#F97316]/20">
                <CardHeader className="bg-gradient-to-r from-[#FB923C]/10 to-[#F97316]/10 border-b border-[#F97316]/20">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-gray-900">Balance General</CardTitle>
                      <p className="text-sm text-gray-600">Hasta {balanceFechaHasta}</p>
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
                      <h3 className="font-bold text-lg text-gray-900 mb-4 pb-2 border-b-2 border-blue-500">ACTIVOS</h3>
                      <div className="space-y-1">
                        {activos.filter(c => (c.saldo_calculado || 0) !== 0).map(c => (
                          <div key={c.id} className="flex justify-between text-sm hover:bg-gray-50 p-1.5 rounded">
                            <span className="text-gray-600 text-xs"><span className="font-mono text-gray-600 mr-2">{c.codigo}</span>{c.nombre}</span>
                            <span className="text-gray-900 font-medium text-xs">{fmt(c.saldo_calculado || 0)}</span>
                          </div>
                        ))}
                        {activos.filter(c => (c.saldo_calculado || 0) === 0).length === activos.length && (
                          <p className="text-gray-600 text-xs py-2">Sin movimientos</p>
                        )}
                        <div className="flex justify-between pt-3 mt-2 border-t-2 border-blue-500 font-bold">
                          <span className="text-gray-900">TOTAL ACTIVOS</span>
                          <span className="text-blue-400">{fmt(totales.activo)}</span>
                        </div>
                      </div>
                    </div>
                    {/* PASIVOS + PATRIMONIO */}
                    <div className="space-y-6">
                      <div>
                        <h3 className="font-bold text-lg text-gray-900 mb-4 pb-2 border-b-2 border-red-500">PASIVOS</h3>
                        <div className="space-y-1">
                          {pasivos.filter(c => (c.saldo_calculado || 0) !== 0).map(c => (
                            <div key={c.id} className="flex justify-between text-sm hover:bg-gray-50 p-1.5 rounded">
                              <span className="text-gray-600 text-xs"><span className="font-mono text-gray-600 mr-2">{c.codigo}</span>{c.nombre}</span>
                              <span className="text-gray-900 font-medium text-xs">{fmt(c.saldo_calculado || 0)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between pt-3 border-t border-red-500/40 font-semibold">
                            <span className="text-gray-600">Total Pasivos</span>
                            <span className="text-red-400">{fmt(totales.pasivo)}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-gray-900 mb-4 pb-2 border-b-2 border-purple-500">PATRIMONIO</h3>
                        <div className="space-y-1">
                          {patrimonio.filter(c => (c.saldo_calculado || 0) !== 0).map(c => (
                            <div key={c.id} className="flex justify-between text-sm hover:bg-gray-50 p-1.5 rounded">
                              <span className="text-gray-600 text-xs"><span className="font-mono text-gray-600 mr-2">{c.codigo}</span>{c.nombre}</span>
                              <span className="text-gray-900 font-medium text-xs">{fmt(c.saldo_calculado || 0)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between pt-3 border-t border-purple-500/40 font-semibold">
                            <span className="text-gray-600">Total Patrimonio</span>
                            <span className="text-purple-400">{fmt(totales.patrimonio)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between pt-3 border-t-2 border-white font-bold text-lg">
                        <span className="text-gray-900">PASIVO + PATRIMONIO</span>
                        <span className="text-[#FB923C]">{fmt(totales.pasivo + totales.patrimonio)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {!balanceData && (
            <Card className="bg-white border-[#F97316]/20">
              <CardContent className="p-12 text-center">
                <DollarSign className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600">Haga clic en "Generar" para ver el Balance General</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── TAB: ESTADO DE RESULTADOS ───────────────────────────────────── */}
      {tab === 'resultados' && (
        <div className="space-y-4">
          <Card className="bg-white border-[#F97316]/20">
            <CardContent className="p-4">
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <Label className="text-xs text-gray-600">Desde</Label>
                  <Input type="date" value={resultFi}
                    onChange={e => setResultFi(e.target.value)}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Hasta</Label>
                  <Input type="date" value={resultFf}
                    onChange={e => setResultFf(e.target.value)}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1" />
                </div>
                <Button onClick={loadResultados} className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
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
            const LineRow = ({ label, value, color = 'text-gray-900', bold = false, indent = false }: any) => (
              <div className={`flex justify-between py-1 ${indent ? 'pl-4' : ''} ${bold ? 'font-bold' : 'text-sm'}`}>
                <span className={bold ? 'text-gray-900' : 'text-gray-600'}>{label}</span>
                <span className={color}>{fmt(value)}</span>
              </div>
            );
            return (
              <Card className="bg-white border-[#F97316]/20">
                <CardHeader className="bg-gradient-to-r from-green-500/10 to-[#F97316]/10 border-b border-[#F97316]/20">
                  <CardTitle className="text-gray-900">Estado de Resultados Integral</CardTitle>
                  <p className="text-sm text-gray-600">{resultFi} al {resultFf}</p>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Ingresos */}
                  <div>
                    <h3 className="font-bold text-gray-900 border-b-2 border-green-500 pb-2 mb-3">INGRESOS</h3>
                    {ingresos.filter(c => (c.saldo_calculado || 0) > 0).map(c => (
                      <div key={c.id} className="flex justify-between py-1 pl-4 text-sm">
                        <span className="text-gray-600 text-xs">{c.codigo} — {c.nombre}</span>
                        <span className="text-green-400 text-xs">{fmt(c.saldo_calculado || 0)}</span>
                      </div>
                    ))}
                    <LineRow label="TOTAL INGRESOS" value={r.total_ingreso} color="text-green-400" bold />
                  </div>

                  {/* Costos */}
                  <div>
                    <h3 className="font-bold text-gray-900 border-b-2 border-orange-500 pb-2 mb-3">COSTO DE VENTAS</h3>
                    {costos.filter(c => (c.saldo_calculado || 0) > 0).map(c => (
                      <div key={c.id} className="flex justify-between py-1 pl-4 text-sm">
                        <span className="text-gray-600 text-xs">{c.codigo} — {c.nombre}</span>
                        <span className="text-orange-400 text-xs">({fmt(c.saldo_calculado || 0)})</span>
                      </div>
                    ))}
                    <LineRow label="TOTAL COSTO" value={r.total_costo} color="text-orange-400" bold />
                    <div className="mt-2 pt-2 border-t border-[#F97316]/20">
                      <LineRow label={`UTILIDAD BRUTA (${fmtPct(r.margen_bruto)})`} value={r.utilidad_bruta}
                        color={r.utilidad_bruta >= 0 ? 'text-[#F97316]' : 'text-red-400'} bold />
                    </div>
                  </div>

                  {/* Gastos */}
                  <div>
                    <h3 className="font-bold text-gray-900 border-b-2 border-yellow-500 pb-2 mb-3">GASTOS OPERACIONALES</h3>
                    {gastos.filter(c => (c.saldo_calculado || 0) > 0).map(c => (
                      <div key={c.id} className="flex justify-between py-1 pl-4 text-sm">
                        <span className="text-gray-600 text-xs">{c.codigo} — {c.nombre}</span>
                        <span className="text-yellow-400 text-xs">({fmt(c.saldo_calculado || 0)})</span>
                      </div>
                    ))}
                    <LineRow label="TOTAL GASTOS" value={r.total_gasto} color="text-yellow-400" bold />
                    <div className="mt-2 pt-2 border-t border-[#F97316]/20">
                      <LineRow label={`UTILIDAD OPERACIONAL (${fmtPct(r.margen_operacional)})`} value={r.utilidad_operacional}
                        color={r.utilidad_operacional >= 0 ? 'text-[#F97316]' : 'text-red-400'} bold />
                    </div>
                  </div>

                  {/* Distribución */}
                  <div className="bg-gradient-to-r from-white/5 to-white/10 p-5 rounded-xl space-y-2">
                    <h3 className="font-bold text-gray-900 mb-3">DISTRIBUCIÓN Y UTILIDAD NETA</h3>
                    <LineRow label="15% Participación Trabajadores" value={r.participacion_trabajadores} color="text-red-400" indent />
                    <LineRow label="Utilidad antes IR" value={r.utilidad_antes_ir} color="text-gray-900" indent />
                    <LineRow label="25% Impuesto a la Renta" value={r.impuesto_renta} color="text-red-400" indent />
                    <div className="border-t-2 border-[#F97316]/40 mt-3 pt-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          {r.utilidad_neta >= 0 ? <TrendingUp className="w-6 h-6 text-green-400" /> : <TrendingDown className="w-6 h-6 text-red-400" />}
                          <span className="text-xl font-bold text-gray-900">
                            {r.utilidad_neta >= 0 ? 'UTILIDAD NETA' : 'PÉRDIDA NETA'}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${r.utilidad_neta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {fmt(r.utilidad_neta)}
                          </div>
                          <div className="text-xs text-gray-600">Margen {fmtPct(r.margen_neto)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {!resultadosData && (
            <Card className="bg-white border-[#F97316]/20">
              <CardContent className="p-12 text-center">
                <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600">Haga clic en "Generar" para ver el Estado de Resultados</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── TAB: FLUJO DE EFECTIVO ──────────────────────────────────────── */}
      {tab === 'flujo' && (
        <div className="space-y-4">
          <Card className="bg-white border-[#F97316]/20">
            <CardContent className="p-4">
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <Label className="text-xs text-gray-600">Desde</Label>
                  <Input type="date" value={flujoFi}
                    onChange={e => setFlujoFi(e.target.value)}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Hasta</Label>
                  <Input type="date" value={flujoFf}
                    onChange={e => setFlujoFf(e.target.value)}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1" />
                </div>
                <Button onClick={loadFlujo} className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                  <RefreshCw className="w-4 h-4 mr-2" /> Generar
                </Button>
              </div>
            </CardContent>
          </Card>

          {flujoData && (() => {
            const f = flujoData.flujo;
            const Section = ({ title, color, items, total }: any) => (
              <div className="space-y-2">
                <h3 className={`font-bold text-gray-900 border-b-2 ${color} pb-2`}>{title}</h3>
                {items.map(([label, value]: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm pl-4">
                    <span className="text-gray-600">{label}</span>
                    <span className={value >= 0 ? 'text-green-400' : 'text-red-400'}>{fmt(value)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-2 border-t border-gray-100">
                  <span className="text-gray-900">Subtotal</span>
                  <span className={total >= 0 ? 'text-[#F97316]' : 'text-red-400'}>{fmt(total)}</span>
                </div>
              </div>
            );
            return (
              <Card className="bg-white border-[#F97316]/20">
                <CardHeader className="bg-gradient-to-r from-[#F97316]/10 to-[#FB923C]/10 border-b border-[#F97316]/20">
                  <CardTitle className="text-gray-900">Estado de Flujo de Efectivo</CardTitle>
                  <p className="text-sm text-gray-600">Método Indirecto · {flujoData.periodo?.inicio} al {flujoData.periodo?.fin}</p>
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
                        <span className="text-xl font-bold text-gray-900">VARIACIÓN NETA DE EFECTIVO</span>
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
            <Card className="bg-white border-[#F97316]/20">
              <CardContent className="p-12 text-center">
                <Wallet className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600">Haga clic en "Generar" para ver el Flujo de Efectivo</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── TAB: PRESUPUESTO ────────────────────────────────────────────── */}
      {tab === 'presupuesto' && (
        <div className="space-y-4">
          <Card className="bg-white border-[#F97316]/20">
            <CardContent className="p-4">
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <Label className="text-xs text-gray-600">Año</Label>
                  <Input type="number" value={presAnio} min={2020} max={2035}
                    onChange={e => setPresAnio(parseInt(e.target.value))}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1 w-28" />
                </div>
                <Button onClick={loadPresupuesto} className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
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

          <Card className="bg-white border-[#F97316]/20">
            <CardHeader>
              <CardTitle className="text-gray-900">Presupuesto {presAnio} vs Real</CardTitle>
            </CardHeader>
            <CardContent>
              {presupuesto.length === 0 ? (
                <div className="text-center py-12">
                  <BarChart2 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-600">No hay líneas presupuestadas para {presAnio}</p>
                  <p className="text-gray-600 text-sm mt-2">Haga clic en "Agregar línea" para comenzar</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-[#F97316]/30">
                        <th className="text-left py-2 px-3 text-gray-600 text-xs">Cuenta</th>
                        <th className="text-right py-2 px-3 text-gray-600 text-xs">Presupuesto</th>
                        <th className="text-right py-2 px-3 text-gray-600 text-xs">Real</th>
                        <th className="text-right py-2 px-3 text-gray-600 text-xs">Variación</th>
                        <th className="text-right py-2 px-3 text-gray-600 text-xs">% Cumpl.</th>
                        <th className="text-center py-2 px-3 text-gray-600 text-xs">Acc.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presupuesto.map((item, idx) => {
                        const cumpl = item.cumplimiento || 0;
                        const variacion = item.variacion || 0;
                        return (
                          <tr key={idx} className="border-b border-[#F97316]/10 hover:bg-gray-50">
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
                                <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-xs h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-[#F97316]/30">
                                  {cuentas.filter(c => !c.es_grupo).map(c => (
                                    <SelectItem key={c.id} value={c.id} className="text-gray-900 text-xs">
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
                                className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-xs h-8 text-right"
                              />
                            </td>
                            <td className="py-2 px-3 text-right text-gray-900 text-sm font-mono">
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
                                <span className="text-xs text-gray-600">{cumpl.toFixed(1)}%</span>
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
                      <tr className="border-t-2 border-[#F97316]/30 bg-gray-50">
                        <td className="py-2 px-3 font-bold text-gray-900 text-sm">TOTALES</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900 text-sm">
                          {fmt(presupuesto.reduce((s, i) => s + i.presupuesto, 0))}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900 text-sm">
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

      {/* ══════════════════════════════════════════════════════════════════
          TAB: CUENTAS POR COBRAR (CxC)
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'cxc' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-end p-4 bg-gray-50 rounded-xl border border-[#F97316]/20">
            <div className="flex gap-2">
              {(['pendiente','cobrado','todos'] as const).map(e => (
                <button key={e} onClick={() => { setCxcEstado(e); }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${cxcEstado === e
                    ? e === 'pendiente' ? 'bg-red-500 text-white'
                      : e === 'cobrado' ? 'bg-green-500 text-white'
                      : 'bg-gray-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {e === 'pendiente' ? '⏳ Pendientes' : e === 'cobrado' ? '✅ Cobradas' : '📋 Todas'}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <input placeholder="Buscar cliente…" value={cxcFiltroCliente}
                onChange={e => setCxcFiltroCliente(e.target.value)}
                className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"/>
            </div>
            <Button onClick={loadCxC} disabled={cxcLoading}
              className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
              {cxcLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2"/> : <RefreshCw className="w-4 h-4 mr-2"/>}
              Actualizar
            </Button>
            {cxcData && (
              <Button variant="outline" size="sm" onClick={() => exportToExcel(
                (cxcData.facturas || []).map((f: any) => ({
                  'N° Factura': f.numero_factura,
                  'Cliente': f.cliente,
                  'RUC/CI': f.cliente_id,
                  'Fecha Emisión': f.fecha_emision,
                  'Días Pendiente': f.dias_pendiente,
                  'Tramo': f.tramo,
                  'Total $': f.total.toFixed(2),
                  'Cobrado $': f.monto_cobrado.toFixed(2),
                  'Saldo $': f.saldo.toFixed(2),
                  'Estado': f.cobrado ? 'Cobrado' : 'Pendiente',
                })),
                `cxc_${new Date().toISOString().split('T')[0]}`,
                'Cuentas por Cobrar'
              )} className="border-green-300 text-green-600 hover:bg-green-50">
                <Download className="w-4 h-4 mr-1"/> Excel
              </Button>
            )}
          </div>

          {/* Aging cards */}
          {cxcData && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-blue-600">${Number(cxcData.resumen?.total_cartera||0).toFixed(2)}</div>
                <div className="text-xs text-blue-500 mt-0.5">Total cartera</div>
                <div className="text-xs text-blue-400">{cxcData.resumen?.documentos} facturas · {cxcData.resumen?.clientes} clientes</div>
              </div>
              {([['0-30','green','Al día'],['31-60','yellow','30-60 días'],['61-90','orange','60-90 días'],['+90','red','+90 días']] as [string,string,string][]).map(([tramo,col,lbl]) => (
                <div key={tramo} className={`bg-${col}-50 border border-${col}-200 rounded-xl p-3 text-center`}>
                  <div className={`text-xl font-bold text-${col}-600`}>${Number(cxcData.aging?.[tramo]?.total||0).toFixed(2)}</div>
                  <div className={`text-xs text-${col}-500 mt-0.5`}>{lbl}</div>
                  <div className={`text-xs text-${col}-400`}>{cxcData.aging?.[tramo]?.cantidad||0} docs</div>
                </div>
              ))}
            </div>
          )}

          {/* Lista de facturas */}
          {cxcLoading && (
            <div className="text-center py-12"><RefreshCw className="w-8 h-8 mx-auto animate-spin text-orange-500 mb-2"/><p className="text-gray-500">Cargando…</p></div>
          )}
          {!cxcLoading && cxcData && (
            <div className="overflow-x-auto rounded-xl border border-orange-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['N° Factura','Cliente','Fecha Emisión','Días','Total','Cobrado','Saldo','Estado','Acción'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(cxcData.facturas || []).length === 0 ? (
                    <tr><td colSpan={9} className="text-center text-gray-400 py-10">
                      {cxcEstado === 'pendiente' ? 'No hay facturas pendientes de cobro' : 'Sin resultados'}
                    </td></tr>
                  ) : (cxcData.facturas || []).map((f: any, i: number) => {
                    const tramoColor = f.tramo === '+90' ? 'red' : f.tramo === '61-90' ? 'orange' : f.tramo === '31-60' ? 'yellow' : 'green';
                    return (
                      <tr key={f.id} className={`border-t border-gray-100 ${i%2===0?'':'bg-gray-50/40'} ${f.cobrado ? 'opacity-60' : ''}`}>
                        <td className="px-3 py-2 font-mono text-xs text-gray-900">{f.numero_factura}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900 text-sm">{f.cliente}</div>
                          <div className="text-xs text-gray-400">{f.cliente_id}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{f.fecha_emision}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold bg-${tramoColor}-100 text-${tramoColor}-700`}>
                            {f.dias_pendiente}d
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">${f.total.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono text-green-600">${f.monto_cobrado.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-red-600">${f.saldo.toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          {f.cobrado
                            ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✅ Cobrado</span>
                            : <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">⏳ Pendiente</span>
                          }
                        </td>
                        <td className="px-3 py-2">
                          {!f.cobrado && f.saldo > 0 && (
                            <button onClick={() => { setCxcCobrando(f.id); setCxcMontoModal(f.saldo.toFixed(2)); }}
                              className="text-xs bg-[#F97316] text-white px-3 py-1 rounded-lg hover:bg-[#C2410C] transition-colors font-bold">
                              Registrar Cobro
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ MODAL: REGISTRAR COBRO ══════════════════════════════════════════ */}
      {cxcCobrando && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[#F97316]/30 w-full max-w-md">
            <div className="p-5 border-b border-orange-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">Registrar Cobro</h2>
              <button onClick={() => { setCxcCobrando(null); setCxcMontoModal(''); }} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {(() => {
                const f = cxcData?.facturas?.find((x: any) => x.id === cxcCobrando);
                return f ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm">
                    <div className="font-bold text-gray-900">{f.numero_factura} — {f.cliente}</div>
                    <div className="text-gray-600 mt-1">Total: <strong>${f.total.toFixed(2)}</strong> · Saldo pendiente: <strong className="text-red-600">${f.saldo.toFixed(2)}</strong></div>
                  </div>
                ) : null;
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-600">Monto a cobrar *</Label>
                  <input type="number" value={cxcMontoModal} onChange={e => setCxcMontoModal(e.target.value)}
                    className="w-full mt-1 border border-orange-200 rounded px-3 py-2 text-sm bg-white text-gray-900 font-mono"/>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Fecha de cobro</Label>
                  <input type="date" value={cxcFechaCobro} onChange={e => setCxcFechaCobro(e.target.value)}
                    className="w-full mt-1 border border-orange-200 rounded px-3 py-2 text-sm bg-white text-gray-900"/>
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-600">Método de pago</Label>
                <select value={cxcMetodo} onChange={e => setCxcMetodo(e.target.value)}
                  className="w-full mt-1 border border-orange-200 rounded px-3 py-2 text-sm bg-white text-gray-900">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia bancaria</option>
                  <option value="tarjeta">Tarjeta de crédito/débito</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-gray-600">Notas (opcional)</Label>
                <textarea value={cxcNotas} onChange={e => setCxcNotas(e.target.value)} rows={2}
                  className="w-full mt-1 border border-orange-200 rounded px-3 py-1.5 text-sm bg-white text-gray-900 resize-none"/>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700">
                Se generará automáticamente el asiento contable: Banco/Caja (Dr) → Cuentas por Cobrar (Cr)
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={() => { setCxcCobrando(null); setCxcMontoModal(''); }} variant="outline" className="flex-1">Cancelar</Button>
                <Button onClick={registrarCobro} disabled={cxcPagando || !cxcMontoModal}
                  className="flex-1 bg-gradient-to-r from-green-600 to-green-500 text-white">
                  {cxcPagando ? <RefreshCw className="w-4 h-4 animate-spin mr-2"/> : <CheckCircle className="w-4 h-4 mr-2"/>}
                  Confirmar Cobro
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: ACTIVOS FIJOS
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'activos' && (
        <div className="space-y-4">
          {/* Barra de herramientas */}
          <div className="flex flex-wrap gap-3 items-end p-4 bg-gray-50 rounded-xl border border-[#F97316]/20">
            <div className="flex gap-2 items-center">
              <label className="text-sm text-gray-600 font-medium">Depreciar mes:</label>
              <select value={depMes} onChange={e=>setDepMes(Number(e.target.value))}
                className="border border-orange-200 rounded px-2 py-1.5 text-sm bg-white text-gray-900">
                {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i)=>(
                  <option key={i} value={i+1}>{m}</option>
                ))}
              </select>
              <input type="number" value={depAnio} onChange={e=>setDepAnio(Number(e.target.value))}
                className="border border-orange-200 rounded px-2 py-1.5 text-sm bg-white text-gray-900 w-20" />
              <Button onClick={depreciarMes} disabled={depLoading} size="sm"
                className="bg-gradient-to-r from-purple-600 to-purple-500 text-white">
                {depLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-1"/> : <Calculator className="w-4 h-4 mr-1"/>}
                Generar Depreciación
              </Button>
            </div>
            <Button onClick={()=>{setEditActivo(null); setActivoForm(emptyActivo()); setShowActivoModal(true);}}
              className="bg-gradient-to-r from-[#C2410C] to-[#F97316] ml-auto">
              <Plus className="w-4 h-4 mr-2"/> Nuevo Activo
            </Button>
          </div>

          {/* Resumen */}
          {activos.length > 0 && (() => {
            const totalValor = activos.reduce((s,a)=>s+Number(a.valor_adquisicion||0),0);
            const totalDep   = activos.reduce((s,a)=>s+Number(a.dep_acumulada||0),0);
            const totalLibro = activos.reduce((s,a)=>s+Number(a.valor_en_libros||a.valor_adquisicion-a.dep_acumulada||0),0);
            return (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <div className="text-xl font-bold text-blue-600">${totalValor.toFixed(2)}</div>
                  <div className="text-xs text-blue-500 mt-1">Valor adquisición total</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <div className="text-xl font-bold text-red-600">${totalDep.toFixed(2)}</div>
                  <div className="text-xs text-red-500 mt-1">Depreciación acumulada</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <div className="text-xl font-bold text-green-600">${totalLibro.toFixed(2)}</div>
                  <div className="text-xs text-green-500 mt-1">Valor en libros</div>
                </div>
              </div>
            );
          })()}

          {/* Tabla */}
          <div className="overflow-x-auto rounded-xl border border-[#F97316]/20">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b border-[#F97316]/20">
                  {['Código','Nombre','Categoría','Fecha Adq.','Valor Adq.','Dep. Acum.','Valor Libros','Vida Útil','Estado','Acciones'].map(h=>(
                    <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activos.length === 0 ? (
                  <tr><td colSpan={10} className="text-center text-gray-400 py-10">
                    Sin activos registrados. Haz clic en "Nuevo Activo" para comenzar.
                  </td></tr>
                ) : activos.map((a,i)=>{
                  const vidaUsada = a.vida_util_meses > 0 ? Math.round((a.dep_acumulada / (a.valor_adquisicion - (a.valor_residual||0))) * 100) : 0;
                  return (
                    <tr key={a.id} className={`border-b border-[#F97316]/10 ${i%2===0?'':'bg-gray-50/40'}`}>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{a.codigo||'—'}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{a.nombre}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{a.categoria}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{a.fecha_adquisicion}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700">${Number(a.valor_adquisicion).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-500">${Number(a.dep_acumulada||0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-green-600">
                        ${(Number(a.valor_adquisicion) - Number(a.dep_acumulada||0)).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-gray-500">{a.vida_util_meses} meses</div>
                        <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                          <div className="h-1.5 rounded-full bg-orange-400" style={{width:`${Math.min(100,vidaUsada)}%`}}/>
                        </div>
                        <div className="text-xs text-gray-400">{vidaUsada}% usado</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          a.estado==='activo'?'bg-green-100 text-green-700':
                          a.estado==='totalmente_depreciado'?'bg-gray-100 text-gray-600':
                          'bg-red-100 text-red-600'
                        }`}>{a.estado}</span>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={()=>{setEditActivo(a); setActivoForm({...a}); setShowActivoModal(true);}}
                          className="p-1 text-orange-500 hover:bg-orange-50 rounded mr-1">
                          <Edit2 className="w-3.5 h-3.5"/>
                        </button>
                        <button onClick={async()=>{
                          if(!confirm('¿Eliminar este activo?'))return;
                          await apiFetch(`${BASE}/contabilidad/activos-fijos/${a.id}`,headers,{method:'DELETE'});
                          toast.success('Activo eliminado'); loadActivos();
                        }} className="p-1 text-red-400 hover:bg-red-50 rounded">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: FORMULARIOS 104 / 103
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'formularios' && (
        <div className="space-y-4">
          {/* Selector */}
          <div className="flex flex-wrap gap-3 items-end p-4 bg-gray-50 rounded-xl border border-[#F97316]/20">
            <div className="flex gap-2 flex-wrap">
              {[
                {id:'104', label:'F-104 IVA Mensual', color:'blue'},
                {id:'103', label:'F-103 Retenciones', color:'purple'},
                {id:'125', label:'F-125 Renta Microempresas', color:'green'},
                {id:'102', label:'F-102 Renta Sociedades', color:'red'},
              ].map(f=>(
                <button key={f.id} onClick={()=>{setFormTipo(f.id as any); setFormData(null);}}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                    formTipo===f.id
                      ? `bg-${f.color}-600 text-white`
                      : `bg-white border border-${f.color}-200 text-${f.color}-600 hover:bg-${f.color}-50`
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
            {formTipo === '125' ? (
              <>
                <select value={formSemestre} onChange={e=>setFormSemestre(Number(e.target.value))}
                  className="border border-orange-200 rounded px-3 py-2 text-sm bg-white text-gray-900">
                  <option value={1}>1er Semestre (Ene–Jun)</option>
                  <option value={2}>2do Semestre (Jul–Dic)</option>
                </select>
              </>
            ) : formTipo === '102' ? (
              <span className="text-xs text-gray-500 italic px-2">Declaración anual — solo requiere el año</span>
            ) : (
              <select value={formMes} onChange={e=>setFormMes(Number(e.target.value))}
                className="border border-orange-200 rounded px-3 py-2 text-sm bg-white text-gray-900">
                {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i)=>(
                  <option key={i} value={i+1}>{m}</option>
                ))}
              </select>
            )}
            <input type="number" value={formAnio} onChange={e=>setFormAnio(Number(e.target.value))}
              className="border border-orange-200 rounded px-3 py-2 text-sm bg-white text-gray-900 w-20"/>
            <Button onClick={loadFormulario} disabled={formLoading}
              className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
              {formLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2"/> : <FileText className="w-4 h-4 mr-2"/>}
              Calcular
            </Button>
            {formData && (
              <Button variant="outline" size="sm" onClick={()=>exportToExcel(
                formTipo==='104'
                  ? Object.entries(formData.casillas||{}).map(([cas,val])=>({'Casilla':cas,'Valor':val}))
                  : formTipo==='103'
                    ? (formData.detalle_por_codigo||[]).map((r:any)=>({'Casilla Base':r.casilla_base,'Casilla Ret.':r.casilla_retenido,'Descripción':r.descripcion,'%':r.porcentaje,'Base Imponible':r.base_imponible,'Valor Retenido':r.valor_retenido}))
                    : formTipo==='102'
                      ? Object.entries(formData.casillas||{}).map(([cas,val])=>({'Casilla':cas,'Valor':val}))
                    : Object.entries(formData.casillas||{}).map(([cas,val])=>({'Casilla':cas,'Valor':val})),
                `formulario_${formTipo}_${formAnio}`,
                `Formulario ${formTipo} — ${formAnio}`
              )} className="border-green-300 text-green-600 hover:bg-green-50">
                <Download className="w-4 h-4 mr-1"/> Excel
              </Button>
            )}
          </div>

          {/* FORMULARIO 104 — IVA */}
          {formData && formTipo==='104' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* VENTAS */}
                <Card className="bg-white border-blue-200">
                  <CardHeader className="pb-2"><CardTitle className="text-blue-700 text-sm font-bold">VENTAS Y OTRAS OPERACIONES</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    {([
                      ['401','411','421','Ventas locales gravadas ≠0%'],
                      ['403','413','','Ventas locales tarifa 0% sin CT'],
                      ['405','415','','Ventas locales tarifa 0% con CT'],
                      ['407','417','','Exportaciones bienes'],
                      ['409','419','429','TOTAL VENTAS'],
                    ] as [string,string,string,string][]).map(([br,ne,iv,lbl])=>(
                      <div key={br} className={`flex justify-between items-start py-1 border-b border-gray-100 ${br==='409'?'font-bold':'text-xs'}`}>
                        <div>
                          <span className="font-mono text-xs bg-blue-100 text-blue-700 px-1 rounded mr-1">{br}</span>
                          {ne && <span className="font-mono text-xs bg-blue-50 text-blue-500 px-1 rounded mr-1">{ne}</span>}
                          {iv && <span className="font-mono text-xs bg-blue-50 text-blue-500 px-1 rounded mr-1">{iv}</span>}
                          <span className="text-gray-600 text-xs">{lbl}</span>
                        </div>
                        <span className="font-mono text-gray-900 ml-2">${Number(formData.casillas?.[br]||0).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="pt-1 text-xs text-gray-500">IVA generado (421): <strong>${Number(formData.casillas?.['421']||0).toFixed(2)}</strong></div>
                  </CardContent>
                </Card>
                {/* ADQUISICIONES */}
                <Card className="bg-white border-orange-200">
                  <CardHeader className="pb-2"><CardTitle className="text-orange-700 text-sm font-bold">ADQUISICIONES Y PAGOS</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    {([
                      ['500','510','520','Adquisiciones gravadas ≠0% (con CT)'],
                      ['507','517','','Adquisiciones tarifa 0%'],
                      ['509','519','529','TOTAL ADQUISICIONES'],
                      ['563','','','Factor de proporcionalidad (%)'],
                      ['564','','','CT aplicable en este período'],
                    ] as [string,string,string,string][]).map(([br,ne,iv,lbl])=>(
                      <div key={br} className={`flex justify-between items-start py-1 border-b border-gray-100 ${br==='509'||br==='564'?'font-bold':''}`}>
                        <div>
                          <span className="font-mono text-xs bg-orange-100 text-orange-700 px-1 rounded mr-1">{br}</span>
                          <span className="text-gray-600 text-xs">{lbl}</span>
                        </div>
                        <span className="font-mono text-gray-900 ml-2">
                          {br==='563' ? `${Number(formData.casillas?.[br]||0).toFixed(1)}%` : `$${Number(formData.casillas?.[br]||0).toFixed(2)}`}
                        </span>
                      </div>
                    ))}
                    <div className="pt-1 text-xs text-gray-500">IVA pagado (520): <strong>${Number(formData.casillas?.['520']||0).toFixed(2)}</strong></div>
                  </CardContent>
                </Card>
                {/* LIQUIDACIÓN */}
                <Card className={`border-2 ${Number(formData.casillas?.['699']||0)>0?'border-red-400 bg-red-50':'border-green-400 bg-green-50'}`}>
                  <CardHeader className="pb-2"><CardTitle className={`text-sm font-bold ${Number(formData.casillas?.['699']||0)>0?'text-red-700':'text-green-700'}`}>RESUMEN IMPOSITIVO</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    {([
                      ['601','Impuesto causado','text-gray-700'],
                      ['602','Crédito tributario','text-green-700'],
                      ['605','(-) Saldo CT anterior adq.','text-gray-600'],
                      ['606','(-) Saldo CT anterior ret.','text-gray-600'],
                      ['609','(-) Ret. IVA recibidas','text-gray-600'],
                      ['615','Saldo CT próx. mes adq.','text-blue-600'],
                      ['620','SUBTOTAL A PAGAR','text-gray-800 font-bold'],
                      ['699','TOTAL PERCEPCIÓN','text-red-700 font-black text-base'],
                      ['859','TOTAL CONSOLIDADO IVA','text-red-800 font-black'],
                      ['902','TOTAL A PAGAR','text-red-900 font-black text-lg'],
                    ] as [string,string,string][]).map(([cas,lbl,cls])=>(
                      <div key={cas} className="flex justify-between items-center py-1 border-b border-gray-200/50">
                        <span className="text-xs">
                          <span className={`font-mono text-xs px-1 rounded mr-1 ${Number(formData.casillas?.[cas]||0)>0?'bg-red-100 text-red-700':'bg-gray-100 text-gray-600'}`}>{cas}</span>
                          <span className={cls.split(' ').filter(c=>!c.includes('text-')).join(' ')}>{lbl}</span>
                        </span>
                        <span className={`font-mono ${cls}`}>${Number(formData.casillas?.[cas]||0).toFixed(2)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <strong>ℹ️ Período:</strong> {formData.periodo?.nombre} ·
                <strong> Facturas:</strong> {formData.ventas?.c111_comprobantes} emitidas ·
                <strong> Compras:</strong> {formData.adquisiciones?.c115_comprobantes} recibidas ·
                Los saldos de CT del mes anterior (605/606) deben ingresarse manualmente si los tienes.
              </div>
            </div>
          )}

          {/* FORMULARIO 103 — RETENCIONES */}
          {formData && formTipo==='103' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">{formData.resumen?.total_documentos||0}</div>
                  <div className="text-xs text-purple-500 mt-1">Retenciones emitidas</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">${Number(formData.totales?.c349_subtotal_base_pais||0).toFixed(2)}</div>
                  <div className="text-xs text-blue-500 mt-1">Casilla 349 — Base imponible total</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">${Number(formData.totales?.c499_total_retencion||0).toFixed(2)}</div>
                  <div className="text-xs text-red-500 mt-1">Casilla 499 — Total a declarar</div>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-purple-100">
                <table className="w-full text-sm">
                  <thead className="bg-purple-50">
                    <tr>
                      {['Cód. Base','Cód. Ret.','Descripción','% Ret.','# Docs','Casilla Base (Base Imp.)','Casilla Ret. (Valor Ret.)'].map(h=>(
                        <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase text-purple-700">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.detalle_por_codigo||[]).map((r:any,i:number)=>(
                      <tr key={r.codigo} className={`border-t border-purple-50 ${i%2===0?'':'bg-purple-50/30'}`}>
                        <td className="px-3 py-2 font-mono font-bold text-purple-700">{r.casilla_base}</td>
                        <td className="px-3 py-2 font-mono text-purple-500">{r.casilla_retenido||'—'}</td>
                        <td className="px-3 py-2 text-gray-700">{r.descripcion}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{r.porcentaje>0?`${r.porcentaje}%`:'var.'}</td>
                        <td className="px-3 py-2 text-center text-gray-500">{r.cantidad}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">${r.base_imponible.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono text-blue-600">${r.base_imponible.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-red-600">${r.valor_retenido.toFixed(2)}</td>
                      </tr>
                    ))}
                    {/* Fila total */}
                    <tr className="border-t-2 border-purple-300 bg-purple-100">
                      <td colSpan={4} className="px-3 py-2 font-bold text-purple-800 text-sm">TOTAL (casillas 349 / 399)</td>
                      <td className="px-3 py-2 text-center font-bold text-purple-700">{formData.resumen?.total_documentos}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-blue-800">${Number(formData.totales?.c349_subtotal_base_pais||0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-red-800">${Number(formData.totales?.c499_total_retencion||0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700">
                <strong>Cómo usar en DIMM:</strong> Casilla 349 = base total · Casilla 399 = total retenido país · Casilla 499 = total a pagar (902).
                Fecha límite: hasta el día {10} del mes siguiente según noveno dígito del RUC.
              </div>
            </div>
          )}

          {/* FORMULARIO 125 — RENTA MICROEMPRESAS */}
          {formData && formTipo==='125' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="font-bold text-green-800 mb-1">Formulario 125 — {formData.periodo?.label}</div>
                <div className="text-xs text-green-600 mb-3">Régimen RIMPE Microempresas · Tarifa aplicada: {formData.tarifa_aplicada}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {([
                    ['301','Ingresos brutos','text-gray-700'],
                    ['399','Base imponible','text-gray-900 font-bold'],
                    ['401','IR causado','text-orange-700 font-bold'],
                    ['499','IR A PAGAR','text-red-700 font-black text-xl'],
                  ] as [string,string,string][]).map(([cas,lbl,cls])=>(
                    <div key={cas} className="text-center bg-white rounded-xl p-3 border border-green-200">
                      <div className={`font-mono ${cls}`}>${Number(formData.casillas?.[cas]||0).toFixed(2)}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        <span className="font-mono text-xs bg-green-100 text-green-700 px-1 rounded mr-1">{cas}</span>
                        {lbl}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-green-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-green-50">
                    <tr>{['Casilla','Descripción','Valor'].map(h=><th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase text-green-700">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {Object.entries(formData.casillas||{}).map(([cas,val]:any,i)=>(
                      <tr key={cas} className={i%2===0?'':'bg-green-50/30'}>
                        <td className="px-3 py-2 font-mono font-bold text-green-700">{cas}</td>
                        <td className="px-3 py-2 text-gray-700 text-xs">
                          {({'301':'Ingresos brutos actividad empresarial','302':'(-) Devoluciones o descuentos','303':'(-) Ingresos exentos','399':'BASE IMPONIBLE','401':'IR causado Régimen Microempresas','402':'(-) Retenciones en la fuente del período','403':'(-) CT declaración anual anterior','499':'IR A PAGAR RÉGIMEN MICROEMPRESAS','902':'TOTAL IMPUESTO A PAGAR'} as any)[cas]||'—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold">${Number(val||0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                <strong>⚠️ Nota:</strong> {formData.nota}
              </div>
            </div>
          )}

          {/* FORMULARIO 102 — RENTA SOCIEDADES */}
          {formData && formTipo==='102' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="font-bold text-red-800 mb-1">Formulario 102 — {formData.periodo?.label}</div>
                <div className="text-xs text-red-600 mb-3">Declaración Impuesto a la Renta Sociedades · Tarifa aplicada: {formData.resumen?.tarifa_aplicada}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {([
                    ['829','Total ingresos','text-gray-700'],
                    ['859','Base imponible','text-gray-900 font-bold'],
                    ['861','IR causado','text-orange-700 font-bold'],
                    ['902','IR A PAGAR','text-red-700 font-black text-xl'],
                  ] as [string,string,string][]).map(([cas,lbl,cls])=>(
                    <div key={cas} className="text-center bg-white rounded-xl p-3 border border-red-200">
                      <div className={`font-mono ${cls}`}>${Number(formData.casillas?.[cas]||0).toFixed(2)}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        <span className="font-mono text-xs bg-red-100 text-red-700 px-1 rounded mr-1">{cas}</span>
                        {lbl}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-red-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-red-50">
                    <tr>{['Casilla','Descripción','Valor'].map(h=><th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase text-red-700">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {Object.entries(formData.casillas||{}).map(([cas,val]:any,i)=>(
                      <tr key={cas} className={i%2===0?'':'bg-red-50/30'}>
                        <td className="px-3 py-2 font-mono font-bold text-red-700">{cas}</td>
                        <td className="px-3 py-2 text-gray-700 text-xs">
                          {({
                            '829':'Total de ingresos',
                            '839':'Total costos y gastos',
                            '849':'Utilidad (pérdida) del ejercicio',
                            '850':'(-) 15% participación trabajadores',
                            '859':'BASE IMPONIBLE GRAVABLE',
                            '860':'Tarifa aplicada (%)',
                            '861':'Impuesto a la renta causado',
                            '871':'(-) Anticipo determinado para el ejercicio',
                            '872':'(-) Retenciones en la fuente que le han sido efectuadas',
                            '902':'IMPUESTO A LA RENTA A PAGAR',
                            '903':'Saldo a favor del contribuyente',
                          } as any)[cas]||'—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold">
                          {cas === '860' ? `${Number(val||0).toFixed(0)}%` : `$${Number(val||0).toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                <strong>⚠️ Nota:</strong> {formData.nota}
              </div>
            </div>
          )}

          {!formData && !formLoading && (
            <div className="text-center py-16 text-gray-400">
              <CreditCard className="w-16 h-16 mx-auto mb-4 opacity-20"/>
              <p>Selecciona el formulario, período y año, luego haz clic en Calcular</p>
              <p className="text-xs mt-2">F-104: Declaración IVA mensual · F-103: Retenciones en la Fuente · F-125: Renta Microempresas RIMPE · F-102: Renta Sociedades (anual)</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: CONCILIACIÓN BANCARIA
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'conciliacion' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Panel de carga */}
            <Card className="bg-white border-[#F97316]/20">
              <CardHeader><CardTitle className="text-base">📤 Importar Extracto Bancario</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-600">Banco *</Label>
                    <input value={concBanco} onChange={e=>setConcBanco(e.target.value)}
                      placeholder="Pichincha, Produbanco..."
                      className="w-full mt-1 border border-orange-200 rounded px-3 py-1.5 text-sm bg-white text-gray-900"/>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">N° Cuenta</Label>
                    <input value={concCuenta} onChange={e=>setConcCuenta(e.target.value)}
                      placeholder="220XXXXXXX"
                      className="w-full mt-1 border border-orange-200 rounded px-3 py-1.5 text-sm bg-white text-gray-900"/>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Mes</Label>
                    <select value={concMes} onChange={e=>setConcMes(Number(e.target.value))}
                      className="w-full mt-1 border border-orange-200 rounded px-2 py-1.5 text-sm bg-white text-gray-900">
                      {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i)=>(
                        <option key={i} value={i+1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Año</Label>
                    <input type="number" value={concAnio} onChange={e=>setConcAnio(Number(e.target.value))}
                      className="w-full mt-1 border border-orange-200 rounded px-2 py-1.5 text-sm bg-white text-gray-900"/>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Saldo final según banco *</Label>
                  <input type="number" value={concSaldoBanco} onChange={e=>setConcSaldoBanco(e.target.value)}
                    placeholder="12450.00"
                    className="w-full mt-1 border border-orange-200 rounded px-3 py-1.5 text-sm bg-white text-gray-900"/>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">
                    Extracto bancario (CSV: fecha,descripcion,debito,credito,saldo) *
                  </Label>
                  <textarea value={concMovimientosTxt} onChange={e=>setConcMovimientosTxt(e.target.value)}
                    rows={6} placeholder={'fecha,descripcion,debito,credito,saldo\n2026-05-01,Deposito venta,0,1250.00,5250.00\n2026-05-02,Comision bancaria,4.50,0,5245.50'}
                    className="w-full mt-1 border border-orange-200 rounded px-3 py-1.5 text-xs bg-white text-gray-900 font-mono resize-none"/>
                </div>
                <Button onClick={importarExtracto} disabled={concLoading} className="w-full bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                  {concLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2"/> : <CheckCircle className="w-4 h-4 mr-2"/>}
                  Procesar y Conciliar
                </Button>
              </CardContent>
            </Card>

            {/* Resultado */}
            {concResultado ? (
              <Card className={`bg-white border-2 ${Math.abs(concResultado.resumen?.diferencia||0)<0.01?'border-green-400':'border-orange-400'}`}>
                <CardHeader>
                  <CardTitle className={`text-base ${Math.abs(concResultado.resumen?.diferencia||0)<0.01?'text-green-700':'text-orange-700'}`}>
                    {Math.abs(concResultado.resumen?.diferencia||0)<0.01 ? '✅ CONCILIADO' : '⚠️ DIFERENCIA DETECTADA'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    ['Saldo según banco', concResultado.resumen?.saldo_banco, 'text-blue-700'],
                    ['Saldo en libros', concResultado.resumen?.saldo_libros, 'text-gray-700'],
                    ['Diferencia', concResultado.resumen?.diferencia, Math.abs(concResultado.resumen?.diferencia||0)<0.01?'text-green-600':'text-red-600 font-black text-xl'],
                  ].map(([label,val,cls])=>(
                    <div key={String(label)} className="flex justify-between items-center py-1.5 border-b border-gray-100">
                      <span className="text-sm text-gray-600">{label}</span>
                      <span className={`font-mono font-bold ${cls}`}>${Number(val||0).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="pt-2 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">✅ Conciliados</span>
                      <span className="font-bold">{concResultado.resumen?.conciliados_banco} / {concResultado.resumen?.total_banco}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-red-500">⚠️ Pendientes banco</span>
                      <span className="font-bold text-red-500">{concResultado.resumen?.pendientes_banco}</span>
                    </div>
                  </div>
                  {(concResultado.pendientes||[]).length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-bold text-red-600 mb-2">Movimientos del banco sin asiento en libros:</p>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {concResultado.pendientes.map((p:any,i:number)=>(
                          <div key={i} className="flex justify-between text-xs bg-red-50 rounded px-2 py-1">
                            <span className="text-gray-600">{p.fecha} · {p.descripcion}</span>
                            <span className="font-mono text-red-600 ml-2">${Number(p.monto||0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-gray-50 border-dashed border-gray-200">
                <CardContent className="flex flex-col items-center justify-center h-full py-12 text-gray-400">
                  <CheckCircle className="w-12 h-12 mb-3 opacity-20"/>
                  <p className="text-sm">El resultado de la conciliación aparecerá aquí</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Historial */}
          {conciliaciones.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2">Historial de conciliaciones</h3>
              <div className="overflow-x-auto rounded-xl border border-[#F97316]/20">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>{['Banco','Mes/Año','Saldo Banco','Saldo Libros','Diferencia','Estado'].map(h=>(
                      <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-600">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {conciliaciones.map((c,i)=>(
                      <tr key={c.id} className={`border-t border-gray-100 ${i%2===0?'':'bg-gray-50/40'}`}>
                        <td className="px-3 py-2 font-medium text-gray-900">{c.banco}</td>
                        <td className="px-3 py-2 text-gray-600">{c.mes}/{c.anio}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">${Number(c.saldo_banco||0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">${Number(c.saldo_libros||0).toFixed(2)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${Math.abs(c.diferencia||0)<0.01?'text-green-600':'text-red-600'}`}>
                          ${Number(c.diferencia||0).toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.estado==='conciliado'?'bg-green-100 text-green-700':'bg-orange-100 text-orange-700'}`}>
                            {c.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: CIERRES DE PERÍODO
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'cierres' && (
        <div className="space-y-6">
          {/* Cierre mensual */}
          <Card className="bg-white border-[#F97316]/20">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">🔒 Cierres Mensuales</CardTitle>
                <div className="flex items-center gap-2">
                  <input type="number" value={cierreAnio} onChange={e=>{setCierreAnio(Number(e.target.value)); loadPeriodos();}}
                    className="border border-orange-200 rounded px-2 py-1 text-sm bg-white text-gray-900 w-20"/>
                  <Button onClick={loadPeriodos} variant="outline" size="sm"><RefreshCw className="w-4 h-4"/></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((mes,i)=>{
                  const p = periodos.find(p=>p.mes===i+1);
                  const cerrado = p?.estado === 'cerrado';
                  const mesActual = new Date().getMonth();
                  const esActual = i === mesActual && cierreAnio === new Date().getFullYear();
                  return (
                    <div key={mes} className={`rounded-xl p-3 text-center border-2 transition-all ${
                      cerrado ? 'bg-gray-100 border-gray-300' :
                      esActual ? 'bg-orange-50 border-orange-400' :
                      'bg-white border-gray-200'
                    }`}>
                      <div className="text-xs font-bold text-gray-600 mb-1">{mes}</div>
                      <div className="text-lg mb-2">{cerrado ? '🔒' : esActual ? '📅' : '🔓'}</div>
                      {cerrado ? (
                        <button onClick={()=>reabrirPeriodo(i+1)}
                          className="text-xs text-orange-500 hover:text-orange-700 underline">
                          Reabrir
                        </button>
                      ) : (
                        <button onClick={()=>cerrarPeriodo(i+1)} disabled={cierreLoading}
                          className="text-xs bg-gray-700 text-white px-2 py-0.5 rounded hover:bg-gray-900 disabled:opacity-50">
                          Cerrar
                        </button>
                      )}
                      {p?.fecha_cierre && (
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(p.fecha_cierre).toLocaleDateString('es-EC', {day:'2-digit',month:'2-digit'})}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <strong>ℹ️ Cómo funciona:</strong> Al cerrar un período, los asientos con esa fecha quedan bloqueados — nadie puede crearlos, modificarlos ni anularlos. Solo el administrador puede reabrir un período con motivo justificado (quedará en auditoría).
              </div>
            </CardContent>
          </Card>

          {/* Cierre anual */}
          <Card className="bg-white border-[#F97316]/20">
            <CardHeader><CardTitle className="text-base">📅 Cierre Anual del Ejercicio</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                El cierre anual genera automáticamente el asiento de cierre: cancela todas las cuentas de ingresos y gastos, y traslada la utilidad (o pérdida) a la cuenta <strong>3.3.01 Resultado del Ejercicio</strong>.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                <strong>⚠️ Importante:</strong> Ejecuta el cierre anual SOLO después de haber cerrado los 12 meses del año y verificado que todos los asientos están correctos.
              </div>
              <div className="flex gap-3 items-end">
                <div>
                  <Label className="text-xs text-gray-600">Año a cerrar</Label>
                  <input type="number" value={cierreAnualAnio} onChange={e=>setCierreAnualAnio(Number(e.target.value))}
                    className="block mt-1 border border-orange-200 rounded px-3 py-2 text-sm bg-white text-gray-900 w-24"/>
                </div>
                <Button onClick={generarCierreAnual}
                  className="bg-gradient-to-r from-gray-700 to-gray-600 text-white">
                  <CheckCircle className="w-4 h-4 mr-2"/>
                  Generar Asiento de Cierre {cierreAnualAnio}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ MODAL: ACTIVO FIJO ═══════════════════════════════════════════ */}
      {showActivoModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[#F97316]/30 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#F97316]/20 p-4 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">{editActivo ? 'Editar Activo Fijo' : 'Nuevo Activo Fijo'}</h2>
              <button onClick={()=>{setShowActivoModal(false); setEditActivo(null); setActivoForm(emptyActivo());}}
                className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  {label:'Nombre *', key:'nombre', type:'text', placeholder:'Horno industrial'},
                  {label:'Código', key:'codigo', type:'text', placeholder:'AF-001'},
                  {label:'Fecha adquisición *', key:'fecha_adquisicion', type:'date'},
                  {label:'Valor adquisición *', key:'valor_adquisicion', type:'number', placeholder:'5000.00'},
                  {label:'Valor residual', key:'valor_residual', type:'number', placeholder:'500.00'},
                  {label:'Vida útil (meses) *', key:'vida_util_meses', type:'number', placeholder:'60'},
                  {label:'Proveedor', key:'proveedor', type:'text', placeholder:'Nombre proveedor'},
                  {label:'Factura de compra', key:'factura_compra', type:'text', placeholder:'001-001-000123'},
                ].map(f=>(
                  <div key={f.key}>
                    <Label className="text-xs text-gray-600">{f.label}</Label>
                    <input type={f.type} value={activoForm[f.key]||''} placeholder={f.placeholder||''}
                      onChange={e=>setActivoForm((p:any)=>({...p,[f.key]:e.target.value}))}
                      className="w-full mt-1 border border-orange-200 rounded px-3 py-1.5 text-sm bg-white text-gray-900"/>
                  </div>
                ))}
                <div>
                  <Label className="text-xs text-gray-600">Categoría</Label>
                  <select value={activoForm.categoria} onChange={e=>setActivoForm((p:any)=>({...p,categoria:e.target.value}))}
                    className="w-full mt-1 border border-orange-200 rounded px-3 py-1.5 text-sm bg-white text-gray-900">
                    {['equipo','mueble','vehiculo','inmueble','software','otro'].map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Método depreciación</Label>
                  <select value={activoForm.metodo_depreciacion} onChange={e=>setActivoForm((p:any)=>({...p,metodo_depreciacion:e.target.value}))}
                    className="w-full mt-1 border border-orange-200 rounded px-3 py-1.5 text-sm bg-white text-gray-900">
                    <option value="lineal">Lineal (recomendado)</option>
                    <option value="acelerada">Acelerada</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  {label:'Cta. Activo', key:'cuenta_activo_codigo', hint:'1.2.02'},
                  {label:'Cta. Dep. Acum.', key:'cuenta_dep_codigo', hint:'1.2.03'},
                  {label:'Cta. Gasto Dep.', key:'cuenta_gasto_codigo', hint:'6.1.05'},
                ].map(f=>(
                  <div key={f.key}>
                    <Label className="text-xs text-gray-600">{f.label}</Label>
                    <input value={activoForm[f.key]||''} placeholder={f.hint}
                      onChange={e=>setActivoForm((p:any)=>({...p,[f.key]:e.target.value}))}
                      className="w-full mt-1 border border-orange-200 rounded px-2 py-1.5 text-sm bg-white text-gray-900 font-mono"/>
                  </div>
                ))}
              </div>
              <div>
                <Label className="text-xs text-gray-600">Notas</Label>
                <textarea value={activoForm.notas||''} rows={2}
                  onChange={e=>setActivoForm((p:any)=>({...p,notas:e.target.value}))}
                  className="w-full mt-1 border border-orange-200 rounded px-3 py-1.5 text-sm bg-white text-gray-900 resize-none"/>
              </div>
              {activoForm.valor_adquisicion && activoForm.vida_util_meses && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                  📊 Depreciación mensual estimada: <strong>
                    ${((Number(activoForm.valor_adquisicion) - Number(activoForm.valor_residual||0)) / Number(activoForm.vida_util_meses)).toFixed(2)}
                  </strong> · Período: {activoForm.vida_util_meses} meses ({(Number(activoForm.vida_util_meses)/12).toFixed(1)} años)
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button onClick={()=>{setShowActivoModal(false); setEditActivo(null); setActivoForm(emptyActivo());}}
                  variant="outline" className="flex-1">Cancelar</Button>
                <Button onClick={saveActivo} className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                  {editActivo ? 'Actualizar' : 'Registrar Activo'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NUEVO ASIENTO ────────────────────────────────────────── */}
      <Dialog open={showAsientoModal} onOpenChange={open => { if (!open) { setShowAsientoModal(false); setAsientoForm(emptyAsientoForm()); } }}>
        <DialogContent className="bg-white border-[#F97316]/30 text-gray-900 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Nuevo Asiento Contable — Partida Doble</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGuardarAsiento} className="space-y-5 mt-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-gray-600">Fecha *</Label>
                <Input type="date" value={asientoForm.fecha}
                  onChange={e => setAsientoForm(f => ({ ...f, fecha: e.target.value }))}
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1" required />
              </div>
              <div>
                <Label className="text-xs text-gray-600">Tipo</Label>
                <Select value={asientoForm.tipo}
                  onValueChange={v => setAsientoForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#F97316]/30">
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
                <Label className="text-xs text-gray-600">Referencia</Label>
                <Input value={asientoForm.referencia}
                  onChange={e => setAsientoForm(f => ({ ...f, referencia: e.target.value }))}
                  placeholder="Factura, Contrato..."
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Descripción / Glosa *</Label>
              <Textarea value={asientoForm.descripcion}
                onChange={e => setAsientoForm(f => ({ ...f, descripcion: e.target.value }))}
                rows={2} required
                className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1"
                placeholder="Descripción del asiento contable..." />
            </div>

            {/* Items */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-xs text-gray-600">Líneas del Asiento</Label>
                <button type="button" onClick={addItemRow}
                  className="text-xs text-[#F97316] hover:text-gray-900 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Agregar línea
                </button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs text-gray-600 px-1">
                  <div className="col-span-5">Cuenta</div>
                  <div className="col-span-3">Detalle</div>
                  <div className="col-span-2 text-right">Débito</div>
                  <div className="col-span-2 text-right">Crédito</div>
                </div>
                {asientoForm.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 bg-gray-50 rounded-lg border border-[#F97316]/10">
                    <div className="col-span-5">
                      <Select value={item.cuenta_id}
                        onValueChange={v => updateItem(idx, 'cuenta_id', v)}>
                        <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-xs h-8">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-[#F97316]/30 max-h-48">
                          {cuentas.filter(c => !c.es_grupo).map(c => (
                            <SelectItem key={c.id} value={c.id} className="text-gray-900 text-xs">
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
                        className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-xs h-8" />
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
                          className="p-1 text-gray-600 hover:text-red-400">
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
                  <span className="text-gray-600">Total Débitos</span>
                  <div className="text-lg font-bold text-green-400">{fmt(totalDebito)}</div>
                </div>
                <div>
                  <span className="text-gray-600">Total Créditos</span>
                  <div className="text-lg font-bold text-red-400">{fmt(totalCredito)}</div>
                </div>
                <div>
                  <span className="text-gray-600">Estado</span>
                  <div className={`text-lg font-bold flex items-center gap-2 ${isBalanced ? 'text-green-400' : 'text-red-400'}`}>
                    {isBalanced ? <><CheckCircle className="w-5 h-5" /> Balanceado</> : <><AlertCircle className="w-5 h-5" /> Diferencia: {fmt(Math.abs(totalDebito - totalCredito))}</>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline"
                onClick={() => { setShowAsientoModal(false); setAsientoForm(emptyAsientoForm()); }}
                className="flex-1 border-[#F97316]/30 text-gray-900">
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
        <DialogContent className="bg-white border-red-500/30 text-gray-900 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-400">Anular Asiento Contable</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-gray-600 text-sm">
              Esta acción anulará el asiento y generará automáticamente un asiento de reversión.
            </p>
            <div>
              <Label className="text-xs text-gray-600">Motivo de anulación *</Label>
              <Textarea value={motivoAnulacion}
                onChange={e => setMotivoAnulacion(e.target.value)}
                rows={3} required
                className="bg-gray-50 border-red-500/20 text-gray-900 mt-1"
                placeholder="Especifique el motivo..." />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setShowAnularModal(false); setMotivoAnulacion(''); }}
                className="flex-1 border-[#F97316]/30 text-gray-900">
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
        <DialogContent className="bg-white border-[#F97316]/30 text-gray-900 max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{editCuenta?.id ? 'Editar' : 'Nueva'} Cuenta Contable</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGuardarCuenta} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-600">Código *</Label>
                <Input value={cuentaForm.codigo}
                  onChange={e => setCuentaForm(f => ({ ...f, codigo: e.target.value }))}
                  placeholder="1.1.01" required
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs text-gray-600">Nivel</Label>
                <Select value={String(cuentaForm.nivel)}
                  onValueChange={v => setCuentaForm(f => ({ ...f, nivel: parseInt(v) }))}>
                  <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#F97316]/30">
                    <SelectItem value="1">Nivel 1 (Grupo principal)</SelectItem>
                    <SelectItem value="2">Nivel 2 (Subgrupo)</SelectItem>
                    <SelectItem value="3">Nivel 3 (Cuenta detalle)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Nombre *</Label>
              <Input value={cuentaForm.nombre}
                onChange={e => setCuentaForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre de la cuenta" required
                className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-600">Tipo *</Label>
                <Select value={cuentaForm.tipo}
                  onValueChange={v => {
                    const nat = ['activo','costo','gasto'].includes(v) ? 'deudora' : 'acreedora';
                    setCuentaForm(f => ({ ...f, tipo: v as any, naturaleza: nat as any }));
                  }}>
                  <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#F97316]/30">
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
                <Label className="text-xs text-gray-600">Naturaleza</Label>
                <Select value={cuentaForm.naturaleza}
                  onValueChange={v => setCuentaForm(f => ({ ...f, naturaleza: v as any }))}>
                  <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#F97316]/30">
                    <SelectItem value="deudora">Deudora</SelectItem>
                    <SelectItem value="acreedora">Acreedora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={cuentaForm.es_grupo}
                  onChange={e => setCuentaForm(f => ({ ...f, es_grupo: e.target.checked }))}
                  className="rounded" />
                Es cuenta de grupo (no acepta movimientos)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={cuentaForm.activa}
                  onChange={e => setCuentaForm(f => ({ ...f, activa: e.target.checked }))}
                  className="rounded" />
                Activa
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline"
                onClick={() => { setShowCuentaModal(false); setEditCuenta(null); setCuentaForm(emptyCuentaForm()); }}
                className="flex-1 border-[#F97316]/30 text-gray-900">
                Cancelar
              </Button>
              <Button type="submit"
                className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                {editCuenta?.id ? 'Actualizar' : 'Crear'} Cuenta
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
