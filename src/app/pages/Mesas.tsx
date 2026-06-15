import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { useNavigate } from 'react-router';
import {
  Users, Clock, DollarSign, RefreshCw, X, ChefHat,
  UserCheck, AlertCircle, CheckCircle2, Coffee, Utensils,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

// ─── Types ────────────────────────────────────────────────────

type EstadoMesa = 'libre' | 'ocupada' | 'reservada' | 'esperando_cuenta';

interface Mesa {
  id: string;
  numero: number;
  nombre: string;
  capacidad: number;
  zona: string;
  estado: EstadoMesa;
  mesero_id: string | null;
  mesero_nombre: string | null;
  hora_ocupacion: string | null;
  consumo_acumulado: number;
  numero_comanda: string | null;
  personas: number;
  nota: string | null;
  minutos_ocupada?: number;
}

// ─── Estado visual ────────────────────────────────────────────

const ESTADO_CONFIG: Record<EstadoMesa, { label: string; color: string; border: string; bg: string; dot: string; icon: any }> = {
  libre:            { label: 'Libre',             color: 'text-green-400',  border: 'border-green-500/40',  bg: 'bg-green-500/10',  dot: 'bg-green-400',  icon: CheckCircle2 },
  ocupada:          { label: 'Ocupada',           color: 'text-red-400',    border: 'border-red-500/40',    bg: 'bg-red-500/10',    dot: 'bg-red-400',    icon: Users },
  reservada:        { label: 'Reservada',         color: 'text-yellow-400', border: 'border-yellow-500/40', bg: 'bg-yellow-500/10', dot: 'bg-yellow-400', icon: Clock },
  esperando_cuenta: { label: 'Esp. Cuenta',       color: 'text-blue-400',   border: 'border-blue-500/40',   bg: 'bg-blue-500/10',   dot: 'bg-blue-400',   icon: DollarSign },
};

function formatTiempo(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function apiH(token: string) {
  return { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token, 'Content-Type': 'application/json' };
}
const BASE = `https://${projectId}.supabase.co/functions/v1/server`;

// ─── Componente Mesa Card ─────────────────────────────────────

function MesaCard({ mesa, onClick }: { mesa: Mesa; onClick: () => void }) {
  const cfg = ESTADO_CONFIG[mesa.estado];
  const Icon = cfg.icon;
  const mins = mesa.minutos_ocupada ?? 0;

  // Alertas de tiempo: verde <60, naranja 60-90, rojo >90
  const alertaBorder = mesa.estado === 'ocupada'
    ? mins > 90 ? 'border-red-500 ring-2 ring-red-400/40'
    : mins > 60 ? 'border-orange-400 ring-2 ring-orange-300/40'
    : cfg.border
    : cfg.border;

  return (
    <button
      onClick={onClick}
      className={`relative w-full aspect-square rounded-2xl border-2 ${alertaBorder} ${cfg.bg} hover:scale-105 transition-all duration-200 flex flex-col items-center justify-center gap-1 p-3 group`}
    >
      {/* Dot indicator */}
      <span className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${
        mesa.estado === 'ocupada' && mins > 90 ? 'bg-red-500 animate-ping' :
        mesa.estado === 'ocupada' && mins > 60 ? 'bg-orange-400 animate-pulse' :
        cfg.dot + (mesa.estado === 'ocupada' ? ' animate-pulse' : '')
      }`} />

      {/* Nota especial */}
      {(mesa as any).nota && (
        <span className="absolute top-3 left-3 text-[10px]" title={(mesa as any).nota}>📝</span>
      )}

      {/* Número */}
      <div className={`text-3xl font-black ${
        mesa.estado === 'ocupada' && mins > 90 ? 'text-red-500' :
        mesa.estado === 'ocupada' && mins > 60 ? 'text-orange-400' :
        cfg.color
      }`}>{mesa.numero}</div>

      {/* Zona */}
      <div className="text-gray-600 text-[10px] font-medium uppercase tracking-wider">{mesa.zona}</div>

      {/* Estado */}
      <div className={`flex items-center gap-1 ${cfg.color} text-xs font-semibold`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </div>

      {/* Info ocupada */}
      {mesa.estado !== 'libre' && (
        <div className="mt-1 space-y-0.5 w-full">
          {mesa.mesero_nombre && (
            <p className="text-gray-600 text-[10px] truncate text-center">{mesa.mesero_nombre}</p>
          )}
          {mins > 0 && (
            <p className={`text-[10px] text-center font-bold ${mins > 90 ? 'text-red-500' : mins > 60 ? 'text-orange-400' : 'text-gray-600'}`}>
              ⏱ {formatTiempo(mins)}
            </p>
          )}
          {mesa.consumo_acumulado > 0 && (
            <p className="text-[#F97316] text-[11px] text-center font-bold">
              ${mesa.consumo_acumulado.toFixed(2)}
            </p>
          )}
          {mesa.personas > 0 && (
            <p className="text-gray-600 text-[10px] text-center">👥 {mesa.personas}</p>
          )}
        </div>
      )}

      {/* Capacidad */}
      <div className="absolute bottom-2 left-3 text-gray-700 text-[9px]">{mesa.capacidad} pers.</div>

      {/* Alerta tiempo */}
      {mesa.estado === 'ocupada' && mins > 90 && (
        <div className="absolute bottom-2 right-2 text-[9px] text-red-500 font-bold">⚠️</div>
      )}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────

export default function Mesas() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Mesa | null>(null);
  const [modal, setModal] = useState<'accion' | 'ocupar' | 'transferir' | 'reservar' | null>(null);
  const [zonaFiltro, setZonaFiltro] = useState<string>('todas');
  const [estadoFiltro, setEstadoFiltro] = useState<string>('todos');

  // Formulario ocupar
  const [fPersonas, setFPersonas] = useState('2');
  const [fMesero, setFMesero] = useState(user?.nombre ?? '');
  const [fNota, setFNota] = useState('');

  // ── Nuevos estados ────────────────────────────────────────────────────
  const [modalCuenta, setModalCuenta]       = useState(false);
  const [cuentaData, setCuentaData]         = useState<any>(null);
  const [cuentaLoading, setCuentaLoading]   = useState(false);
  const [modalListaEspera, setModalListaEspera] = useState(false);
  const [listaEspera, setListaEspera]       = useState<any[]>([]);
  const [espNombre, setEspNombre]           = useState('');
  const [espPersonas, setEspPersonas]       = useState('2');
  const [espTelefono, setEspTelefono]       = useState('');
  const [espNota, setEspNota]               = useState('');
  const [modalNota, setModalNota]           = useState(false);
  const [notaTexto, setNotaTexto]           = useState('');
  const [modalUnir, setModalUnir]           = useState(false);
  const [mesaDestinoUnir, setMesaDestinoUnir] = useState('');
  const [modalDescuento, setModalDescuento] = useState(false);
  const [descuentoPct, setDescuentoPct]     = useState('');
  const [propinaPct, setPropinaPct]         = useState('');
  const [modalPagoParcial, setModalPagoParcial] = useState(false);
  const [pagoParcialMonto, setPagoParcialMonto] = useState('');
  const [pagoParcialMetodo, setPagoParcialMetodo] = useState('efectivo');
  const [pagoParcialNombre, setPagoParcialNombre] = useState('');
  const [modalEstadisticas, setModalEstadisticas] = useState(false);
  const [estadisticasData, setEstadisticasData] = useState<any>(null);

  const fetchMesas = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BASE}/mesas`, { headers: apiH(token) });
      if (res.ok) {
        const data = await res.json();
        setMesas(data.mesas || []);
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    fetchMesas();
    const interval = setInterval(fetchMesas, 30000); // refrescar cada 30 s
    return () => clearInterval(interval);
  }, [fetchMesas]);

  const post = async (url: string, body: any) => {
    const res = await fetch(url, { method: 'POST', headers: apiH(token!), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  };

  const apiGet = async (url: string) => {
    const res = await fetch(url, { headers: apiH(token!) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  };

  const apiPut = async (url: string, body: any) => {
    const res = await fetch(url, { method: 'PUT', headers: apiH(token!), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  };

  // ── Nuevas funciones ──────────────────────────────────────────────────

  const abrirCuenta = async (mesa: any) => {
    setCuentaLoading(true); setCuentaData(null); setModalCuenta(true);
    try {
      const d = await apiGet(`${BASE}/mesas/${mesa.id || mesa.codigo}/cuenta`);
      setCuentaData(d);
    } catch (e: any) { toast.error(e.message); setModalCuenta(false); }
    finally { setCuentaLoading(false); }
  };

  const fetchListaEspera = async () => {
    try { const d = await apiGet(`${BASE}/mesas/lista-espera`); setListaEspera(d.lista || []); }
    catch { /* silencioso */ }
  };

  const agregarListaEspera = async () => {
    if (!espNombre) { toast.error('Ingresa el nombre'); return; }
    try {
      await post(`${BASE}/mesas/lista-espera`, { nombre: espNombre, personas: Number(espPersonas)||2, telefono: espTelefono, nota: espNota });
      toast.success('Agregado a lista de espera');
      setEspNombre(''); setEspPersonas('2'); setEspTelefono(''); setEspNota('');
      fetchListaEspera();
    } catch (e: any) { toast.error(e.message); }
  };

  const actualizarListaEspera = async (id: string, estado: string) => {
    try { await apiPut(`${BASE}/mesas/lista-espera/${id}`, { estado }); fetchListaEspera(); }
    catch (e: any) { toast.error(e.message); }
  };

  const guardarNota = async () => {
    if (!selected) return;
    try {
      await post(`${BASE}/mesas/${selected.id}/nota`, { nota: notaTexto });
      toast.success('Nota guardada'); setModalNota(false); fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const unirMesas = async () => {
    if (!selected || !mesaDestinoUnir) { toast.error('Selecciona la mesa destino'); return; }
    if (!confirm(`¿Unir Mesa ${selected.numero} a ${mesaDestinoUnir}? El consumo se sumará.`)) return;
    try {
      const d = await post(`${BASE}/mesas/unir`, { mesa_origen_id: selected.id, mesa_destino_id: mesaDestinoUnir });
      toast.success(d.mensaje); setModalUnir(false); setModal(null); setSelected(null); fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const aplicarDescuento = async () => {
    if (!selected || !cuentaData) return;
    try {
      const total = cuentaData.resumen?.total || 0;
      await post(`${BASE}/mesas/${selected.id}/descuento`, { descuento_pct: Number(descuentoPct)||0, propina_pct: Number(propinaPct)||0, total_base: total });
      toast.success('Descuento/propina aplicado'); setModalDescuento(false);
      await abrirCuenta(selected);
    } catch (e: any) { toast.error(e.message); }
  };

  const registrarPagoParcial = async () => {
    if (!selected || !pagoParcialMonto) { toast.error('Ingresa el monto'); return; }
    try {
      await post(`${BASE}/mesas/${selected.id}/pago-parcial`, { monto: Number(pagoParcialMonto), metodo: pagoParcialMetodo, nombre: pagoParcialNombre });
      toast.success(`Pago de $${pagoParcialMonto} registrado`);
      setModalPagoParcial(false); setPagoParcialMonto(''); setPagoParcialNombre('');
      await abrirCuenta(selected);
    } catch (e: any) { toast.error(e.message); }
  };

  const imprimirPreCuenta = () => {
    if (!cuentaData) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const items = (cuentaData.items || []);
    const r = cuentaData.resumen || {};
    w.document.write(`<!DOCTYPE html><html><head><title>Pre-Cuenta Mesa ${selected?.numero}</title>
    <style>body{font-family:monospace;max-width:300px;margin:0 auto;padding:10px}
    h2{text-align:center;font-size:14px}
    .item{display:flex;justify-content:space-between;font-size:12px;margin:2px 0}
    .total{border-top:1px solid #000;margin-top:8px;font-weight:bold;font-size:13px}
    .center{text-align:center}.small{font-size:10px;color:#666}</style></head><body>
    <h2>PRE-CUENTA<br/>Mesa ${selected?.numero} — ${selected?.zona}</h2>
    <p class="center small">${new Date().toLocaleString('es-EC')}</p>
    <p class="center small">${selected?.mesero_nombre ? 'Mesero: ' + selected.mesero_nombre : ''}</p>
    <hr/>
    ${items.map((it: any) => `<div class="item"><span>${it.descripcion||it.nombre||'—'} x${it.cantidad||1}</span><span>$${((it.precio_unitario||it.precio||0)*(it.cantidad||1)).toFixed(2)}</span></div>`).join('')}
    <hr/>
    <div class="item total"><span>Subtotal</span><span>$${(r.subtotal||0).toFixed(2)}</span></div>
    <div class="item total"><span>IVA</span><span>$${(r.iva||0).toFixed(2)}</span></div>
    ${r.descuento > 0 ? `<div class="item" style="color:green"><span>Descuento</span><span>-$${r.descuento.toFixed(2)}</span></div>` : ''}
    ${r.propina > 0 ? `<div class="item" style="color:blue"><span>Propina sugerida</span><span>$${r.propina.toFixed(2)}</span></div>` : ''}
    <div class="item total" style="font-size:15px"><span>TOTAL</span><span>$${(r.total||0).toFixed(2)}</span></div>
    ${r.pagado > 0 ? `<div class="item" style="color:green"><span>Pagado</span><span>$${r.pagado.toFixed(2)}</span></div>` : ''}
    ${r.saldo_pendiente > 0 ? `<div class="item total" style="color:red"><span>SALDO PENDIENTE</span><span>$${r.saldo_pendiente.toFixed(2)}</span></div>` : ''}
    <hr/><p class="center small">Gracias por su visita</p>
    </body></html>`);
    w.document.close(); w.print();
  };

  const generarQR = (mesa: any) => {
    const url = `${window.location.origin}/menu?mesa=${mesa.numero}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><body style="text-align:center;font-family:Arial">
    <h2>Mesa ${mesa.numero} — ${mesa.zona}</h2>
    <p>Escanea para ver la carta</p>
    <img src="${qrUrl}" width="200" height="200"/>
    <p style="font-size:12px">${url}</p>
    </body></html>`);
    w.document.close();
  };

  const verEstadisticas = async () => {
    try {
      const d = await apiGet(`${BASE}/mesas/estadisticas`);
      setEstadisticasData(d); setModalEstadisticas(true);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleOcupar = async () => {
    if (!selected) return;
    try {
      await post(`${BASE}/mesas/${selected.id}/ocupar`, {
        mesero_nombre: fMesero || user?.nombre,
        personas: Number(fPersonas) || 1,
        nota: fNota || undefined,
      });
      toast.success(`Mesa ${selected.numero} ocupada`);
      setModal(null); setSelected(null);
      fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleLiberar = async () => {
    if (!selected) return;
    if (!confirm(`¿Liberar Mesa ${selected.numero}? Se perderá el consumo acumulado.`)) return;
    try {
      await post(`${BASE}/mesas/${selected.id}/liberar`, {});
      toast.success(`Mesa ${selected.numero} liberada`);
      setModal(null); setSelected(null);
      fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEsperandoCuenta = async () => {
    if (!selected) return;
    try {
      await post(`${BASE}/mesas/${selected.id}/esperando-cuenta`, {});
      toast.success(`Mesa ${selected.numero} — esperando cuenta`);
      setModal(null); setSelected(null);
      fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReservar = async () => {
    if (!selected) return;
    try {
      await post(`${BASE}/mesas/${selected.id}/reservar`, { nota: fNota, personas: Number(fPersonas) || 0 });
      toast.success(`Mesa ${selected.numero} reservada`);
      setModal(null); setSelected(null);
      fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleTransferir = async () => {
    if (!selected || !fMesero.trim()) return toast.error('Ingresa el nombre del mesero');
    try {
      await post(`${BASE}/mesas/${selected.id}/transferir`, { mesero_nombre: fMesero });
      toast.success(`Mesa ${selected.numero} transferida a ${fMesero}`);
      setModal(null); setSelected(null);
      fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const irAlPOS = () => {
    if (!selected) return;
    navigate(`/pos?mesa=${selected.numero}`);
    setModal(null); setSelected(null);
  };

  // Cobrar: marca como esperando_cuenta (si aún no lo está) y abre POS
  const irAlPOSCobrar = async () => {
    if (!selected) return;
    if (selected.estado === 'ocupada') {
      try {
        await post(`${BASE}/mesas/${selected.id}/esperando-cuenta`, {});
      } catch { /* continuar igual */ }
    }
    navigate(`/pos?mesa=${selected.numero}`);
    setModal(null); setSelected(null);
  };

  // Zonas únicas
  const zonas = ['todas', ...Array.from(new Set(mesas.map(m => m.zona)))];

  const mesasFiltradas = mesas.filter(m => {
    const okZona = zonaFiltro === 'todas' || m.zona === zonaFiltro;
    const okEstado = estadoFiltro === 'todos' || m.estado === estadoFiltro;
    return okZona && okEstado;
  });

  // Resumen
  const libre     = mesas.filter(m => m.estado === 'libre').length;
  const ocupada   = mesas.filter(m => m.estado === 'ocupada').length;
  const reservada = mesas.filter(m => m.estado === 'reservada').length;
  const espera    = mesas.filter(m => m.estado === 'esperando_cuenta').length;
  const consumoTotal = mesas.filter(m => m.estado === 'ocupada').reduce((s, m) => s + m.consumo_acumulado, 0);

  return (
    <>
    <div className="p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Plano de Mesas</h1>
          <p className="text-gray-600 text-sm">Vista en tiempo real · se actualiza cada 30 s</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons
            variant="compact"
            onExportExcel={() => exportToExcel(
              mesas.map(m => ({
                'Mesa': m.nombre || `Mesa ${m.numero}`,
                'Número': m.numero,
                'Zona': m.zona,
                'Capacidad': m.capacidad,
                'Estado': ESTADO_CONFIG[m.estado].label,
                'Mesero': m.mesero_nombre || '-',
                'Personas': m.personas || 0,
                'Consumo ($)': m.consumo_acumulado.toFixed(2),
                'Hora ocupación': m.hora_ocupacion ? new Date(m.hora_ocupacion).toLocaleTimeString() : '-',
              })),
              'Mesas',
              'Mesas'
            )}
            onExportPDF={() => exportToPDF(
              mesas.map(m => ({
                mesa: m.nombre || `Mesa ${m.numero}`,
                zona: m.zona,
                capacidad: m.capacidad,
                estado: ESTADO_CONFIG[m.estado].label,
                mesero: m.mesero_nombre || '-',
                consumo: `$${m.consumo_acumulado.toFixed(2)}`,
              })),
              [
                { header: 'Mesa', key: 'mesa' },
                { header: 'Zona', key: 'zona' },
                { header: 'Capacidad', key: 'capacidad' },
                { header: 'Estado', key: 'estado' },
                { header: 'Mesero', key: 'mesero' },
                { header: 'Consumo', key: 'consumo' },
              ],
              'Plano de Mesas',
              'Mesas'
            )}
          />
          <div className="flex gap-2">
            <button onClick={fetchMesas} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 border border-[#F97316]/20 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#F97316]' : ''}`} />
              <span className="text-sm">Actualizar</span>
            </button>
            <button onClick={() => { setModalEstadisticas(false); verEstadisticas(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 transition-all text-sm">
              📊 Estadísticas
            </button>
            <button onClick={() => { fetchListaEspera(); setModalListaEspera(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700 hover:bg-yellow-100 transition-all text-sm">
              ⏳ Lista Espera {listaEspera.length > 0 && <span className="bg-yellow-400 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{listaEspera.length}</span>}
            </button>
            <button
              onClick={async () => {
                const zona = prompt('Zona (Salón, Terraza, Barra, VIP):', 'Salón');
                if (!zona) return;
                const capacidad = prompt('Capacidad (personas):', '4');
                try {
                  const { projectId, publicAnonKey } = await import('/utils/supabase/info');
                  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/mesas/nueva`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ zona, capacidad: Number(capacidad) || 4 }),
                  });
                  if (res.ok) { toast.success('Mesa creada'); fetchMesas(); }
                  else { const d = await res.json(); toast.error(d.error || 'Error'); }
                } catch (e: any) { toast.error(e.message); }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] text-white hover:bg-[#C2410C] transition-all text-sm font-semibold"
            >
              + Mesa
            </button>
          </div>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Libres',   val: libre,   color: 'text-green-400',  bg: 'bg-green-500/10'  },
          { label: 'Ocupadas', val: ocupada, color: 'text-red-400',    bg: 'bg-red-500/10'    },
          { label: 'Reservadas',val:reservada,color:'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: 'Esp. Cuenta',val:espera, color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
          { label: 'Consumo en curso', val: `$${consumoTotal.toFixed(2)}`, color: 'text-[#F97316]', bg: 'bg-[#F97316]/10' },
        ].map(k => (
          <Card key={k.label} className={`${k.bg} border-0`}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${k.color}`}>{k.val}</p>
              <p className="text-gray-600 text-xs mt-0.5">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Leyenda + Filtros ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Leyenda */}
        <div className="flex flex-wrap gap-3">
          {(Object.entries(ESTADO_CONFIG) as [EstadoMesa, typeof ESTADO_CONFIG[EstadoMesa]][]).map(([estado, cfg]) => (
            <button
              key={estado}
              onClick={() => setEstadoFiltro(estadoFiltro === estado ? 'todos' : estado)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                estadoFiltro === estado
                  ? `${cfg.border} ${cfg.bg} ${cfg.color}`
                  : 'border-gray-100 text-gray-600 hover:border-gray-200 hover:text-gray-600'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </button>
          ))}
        </div>

        {/* Zona */}
        <select
          value={zonaFiltro}
          onChange={e => setZonaFiltro(e.target.value)}
          className="ml-auto px-3 py-1.5 bg-white border border-[#F97316]/20 text-gray-900 rounded-lg text-sm focus:outline-none focus:border-[#F97316]"
        >
          {zonas.map(z => <option key={z} value={z} className="bg-white">{z === 'todas' ? 'Todas las zonas' : z}</option>)}
        </select>
      </div>

      {/* ── Grid de mesas ──────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {mesasFiltradas.map(m => (
            <MesaCard
              key={m.id}
              mesa={m}
              onClick={() => { setSelected(m); setFMesero(user?.nombre ?? ''); setFNota(''); setFPersonas('2'); setModal('accion'); }}
            />
          ))}
          {mesasFiltradas.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-600">
              <Utensils className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No hay mesas con el filtro seleccionado</p>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Acción sobre mesa ────────────────────────── */}
      {selected && modal === 'accion' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm bg-white border-[#F97316]/40 shadow-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-gray-900 text-xl font-bold">Mesa {selected.numero}</h2>
                  <p className="text-gray-600 text-sm">{selected.zona} · Cap. {selected.capacidad}</p>
                </div>
                <button onClick={() => { setModal(null); setSelected(null); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-gray-900">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Estado actual */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 ${ESTADO_CONFIG[selected.estado].bg} ${ESTADO_CONFIG[selected.estado].border} border`}>
                <span className={`w-2.5 h-2.5 rounded-full ${ESTADO_CONFIG[selected.estado].dot}`} />
                <span className={`font-semibold text-sm ${ESTADO_CONFIG[selected.estado].color}`}>
                  {ESTADO_CONFIG[selected.estado].label}
                </span>
                {selected.mesero_nombre && <span className="text-gray-600 text-xs ml-auto">{selected.mesero_nombre}</span>}
              </div>

              {/* Info si está ocupada */}
              {selected.estado !== 'libre' && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1 text-sm">
                  {(selected.minutos_ocupada ?? 0) > 0 && <div className="flex justify-between text-gray-600"><span>Tiempo</span><span className={`font-medium ${(selected.minutos_ocupada ?? 0) > 60 ? 'text-orange-400' : 'text-gray-900'}`}>{formatTiempo(selected.minutos_ocupada ?? 0)}</span></div>}
                  {selected.personas > 0 && <div className="flex justify-between text-gray-600"><span>Personas</span><span className="text-gray-900 font-medium">{selected.personas}</span></div>}
                  {selected.consumo_acumulado > 0 && <div className="flex justify-between text-gray-600"><span>Consumo</span><span className="text-[#F97316] font-bold">${selected.consumo_acumulado.toFixed(2)}</span></div>}
                  {selected.nota && <div className="text-gray-600 text-xs italic">📝 {selected.nota}</div>}
                </div>
              )}

              {/* Acciones */}
              <div className="space-y-2">
                {/* ── Mesa LIBRE ────────────────────────────── */}
                {selected.estado === 'libre' && <>
                  <Button className="w-full bg-gradient-to-r from-[#C2410C] to-[#F97316] hover:opacity-90" onClick={() => setModal('ocupar')}>
                    <Users className="w-4 h-4 mr-2" /> Ocupar Mesa
                  </Button>
                  <Button variant="outline" className="w-full border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10" onClick={() => setModal('reservar')}>
                    <Clock className="w-4 h-4 mr-2" /> Reservar
                  </Button>
                  <Button variant="outline" className="w-full border-red-300 text-red-500 hover:bg-red-50"
                    onClick={async () => {
                      if (!confirm(`¿Eliminar ${selected.nombre}? Esta acción no se puede deshacer.`)) return;
                      try {
                        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
                        const codigo = (selected as any).codigo || `mesa-${selected.numero}`;
                        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/mesas/${codigo}`, {
                          method: 'DELETE',
                          headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '' },
                        });
                        if (res.ok) { toast.success(`${selected.nombre} eliminada`); setModal(null); setSelected(null); fetchMesas(); }
                        else { const d = await res.json(); toast.error(d.error || 'Error'); }
                      } catch (e: any) { toast.error(e.message); }
                    }}>
                    🗑 Eliminar Mesa
                  </Button>
                </>}

                {/* ── Mesa OCUPADA ───────────────────────────── */}
                {selected.estado === 'ocupada' && <>
                  {/* Acción principal: Cobrar — marca esp. cuenta + abre POS */}
                  {/* Ver cuenta detalle */}
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={() => abrirCuenta(selected)}>
                    📋 Ver Cuenta Detallada
                  </Button>
                  <Button
                    className="w-full bg-gradient-to-r from-green-700 to-green-500 hover:opacity-90 font-bold text-base py-5"
                    onClick={irAlPOSCobrar}
                  >
                    <DollarSign className="w-5 h-5 mr-2" /> Cobrar Mesa
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" className="bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/30 hover:bg-[#F97316]/20" onClick={irAlPOS}>
                      <Coffee className="w-4 h-4 mr-1" /> Agregar (POS)
                    </Button>
                    <Button size="sm" variant="outline" className="border-blue-300 text-blue-600" onClick={() => { imprimirPreCuenta(); abrirCuenta(selected).then(() => {}); }}>
                      🖨 Pre-Cuenta
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="border-gray-300 text-gray-600"
                      onClick={() => { setNotaTexto((selected as any).nota || ''); setModalNota(true); }}>
                      📝 Nota
                    </Button>
                    <Button size="sm" variant="outline" className="border-gray-300 text-gray-600"
                      onClick={() => { setMesaDestinoUnir(''); setModalUnir(true); }}>
                      🔗 Unir Mesa
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" className="w-full border-gray-300 text-gray-500"
                    onClick={() => generarQR(selected)}>
                    📱 Generar QR Mesa
                  </Button>
                  <Button variant="outline" className="w-full border-purple-500/40 text-purple-400 hover:bg-purple-500/10" onClick={() => { setFMesero(''); setModal('transferir'); }}>
                    <UserCheck className="w-4 h-4 mr-2" /> Transferir Mesero
                  </Button>
                  <Button variant="outline" className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={handleLiberar}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Liberar sin cobrar
                  </Button>
                </>}

                {/* ── Mesa ESPERANDO CUENTA ──────────────────── */}
                {selected.estado === 'esperando_cuenta' && <>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2.5 text-center mb-1">
                    <p className="text-blue-400 text-xs font-semibold">⏳ El cliente está esperando la cuenta</p>
                  </div>
                  {/* Botón principal: ir al POS a completar el cobro */}
                  <Button
                    className="w-full bg-gradient-to-r from-green-700 to-green-500 hover:opacity-90 font-bold text-base py-6"
                    onClick={irAlPOS}
                  >
                    <DollarSign className="w-5 h-5 mr-2" /> Ir al POS — Cobrar
                  </Button>
                  <Button variant="outline" className="w-full border-purple-500/40 text-purple-400 hover:bg-purple-500/10" onClick={() => { setFMesero(''); setModal('transferir'); }}>
                    <UserCheck className="w-4 h-4 mr-2" /> Transferir Mesero
                  </Button>
                  <Button variant="outline" className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={handleLiberar}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Liberar sin cobrar
                  </Button>
                </>}

                {/* ── Mesa RESERVADA ─────────────────────────── */}
                {selected.estado === 'reservada' && <>
                  <Button className="w-full bg-gradient-to-r from-[#C2410C] to-[#F97316] hover:opacity-90" onClick={() => setModal('ocupar')}>
                    <Users className="w-4 h-4 mr-2" /> Convertir a Ocupada
                  </Button>
                  <Button variant="outline" className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={handleLiberar}>
                    <X className="w-4 h-4 mr-2" /> Cancelar Reserva
                  </Button>
                </>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Modal: Ocupar ──────────────────────────────────── */}
      {selected && modal === 'ocupar' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm bg-white border-[#F97316]/40 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900 text-lg font-bold">Ocupar Mesa {selected.numero}</h2>
                <button onClick={() => setModal('accion')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Mesero</Label>
                <Input value={fMesero} onChange={e => setFMesero(e.target.value)} placeholder="Nombre del mesero" className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Personas</Label>
                <Input type="number" min="1" value={fPersonas} onChange={e => setFPersonas(e.target.value)} className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Nota (opcional)</Label>
                <Input value={fNota} onChange={e => setFNota(e.target.value)} placeholder="Ej: cumpleaños, alérgico a mariscos..." className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-600 text-gray-600" onClick={() => setModal('accion')}>Cancelar</Button>
                <Button className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316]" onClick={handleOcupar}>Confirmar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Modal: Transferir ─────────────────────────────── */}
      {selected && modal === 'transferir' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm bg-white border-[#F97316]/40 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900 text-lg font-bold">Transferir Mesa {selected.numero}</h2>
                <button onClick={() => setModal('accion')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-gray-600 text-sm">Actualmente asignada a: <span className="text-gray-900 font-medium">{selected.mesero_nombre || 'Sin asignar'}</span></p>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Nuevo mesero</Label>
                <Input value={fMesero} onChange={e => setFMesero(e.target.value)} placeholder="Nombre del nuevo mesero" className="bg-gray-50 border-[#F97316]/20 text-gray-900" autoFocus />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-600 text-gray-600" onClick={() => setModal('accion')}>Cancelar</Button>
                <Button className="flex-1 bg-gradient-to-r from-purple-600 to-purple-400" onClick={handleTransferir}>Transferir</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Modal: Reservar ───────────────────────────────── */}
      {selected && modal === 'reservar' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm bg-white border-[#F97316]/40 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900 text-lg font-bold">Reservar Mesa {selected.numero}</h2>
                <button onClick={() => setModal('accion')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Personas</Label>
                <Input type="number" min="1" value={fPersonas} onChange={e => setFPersonas(e.target.value)} className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
              </div>
              <div>
                <Label className="text-gray-600 mb-1.5 block">Nota / Cliente</Label>
                <Input value={fNota} onChange={e => setFNota(e.target.value)} placeholder="Ej: Reserva de María García" className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-600 text-gray-600" onClick={() => setModal('accion')}>Cancelar</Button>
                <Button className="flex-1 bg-gradient-to-r from-yellow-600 to-yellow-400" onClick={handleReservar}>Reservar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>

    {/* ══ MODAL: VER CUENTA DETALLADA ════════════════════════════════ */}
    {modalCuenta && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl border border-blue-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-blue-100 p-4 flex justify-between items-center">
            <h2 className="font-bold text-gray-900 text-lg">📋 Cuenta — Mesa {selected?.numero}</h2>
            <button onClick={() => setModalCuenta(false)} className="text-gray-400 hover:text-gray-700">✕</button>
          </div>
          {cuentaLoading ? (
            <div className="p-8 text-center text-gray-500">Cargando cuenta...</div>
          ) : cuentaData ? (
            <div className="p-4 space-y-4">
              {/* Items */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">Producto</th>
                      <th className="px-2 py-2 text-center text-xs text-gray-500">Cant.</th>
                      <th className="px-2 py-2 text-right text-xs text-gray-500">P.Unit</th>
                      <th className="px-2 py-2 text-right text-xs text-gray-500">Total</th>
                      <th className="px-2 py-2 text-left text-xs text-gray-500">Mesero</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(cuentaData.items || []).length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-6 text-gray-400">Sin órdenes registradas</td></tr>
                    ) : (cuentaData.items || []).map((it: any, i: number) => (
                      <tr key={i} className={i%2===0?'':'bg-gray-50/40'}>
                        <td className="px-3 py-2 text-gray-900">{it.descripcion||it.nombre||'—'}</td>
                        <td className="px-2 py-2 text-center text-gray-600">{it.cantidad||1}</td>
                        <td className="px-2 py-2 text-right font-mono text-gray-600">${Number(it.precio_unitario||it.precio||0).toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-mono font-bold text-gray-900">${(Number(it.precio_unitario||it.precio||0)*Number(it.cantidad||1)).toFixed(2)}</td>
                        <td className="px-2 py-2 text-xs text-gray-400">{it.mesero||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                {[
                  ['Subtotal', cuentaData.resumen?.subtotal, 'text-gray-700'],
                  ['IVA', cuentaData.resumen?.iva, 'text-gray-700'],
                  ['TOTAL', cuentaData.resumen?.total, 'text-gray-900 font-bold text-base'],
                  cuentaData.resumen?.descuento > 0 && ['Descuento', -cuentaData.resumen?.descuento, 'text-green-600'],
                  cuentaData.resumen?.propina > 0 && ['Propina sugerida', cuentaData.resumen?.propina, 'text-blue-600'],
                  cuentaData.resumen?.pagado > 0 && ['Pagado', -cuentaData.resumen?.pagado, 'text-green-600'],
                  cuentaData.resumen?.saldo_pendiente > 0 && ['SALDO PENDIENTE', cuentaData.resumen?.saldo_pendiente, 'text-red-600 font-bold text-base'],
                ].filter(Boolean).map(([label, val, cls]: any) => (
                  <div key={label} className={`flex justify-between ${cls}`}>
                    <span>{label}</span>
                    <span className="font-mono">{Number(val)<0 ? `-$${Math.abs(val).toFixed(2)}` : `$${Number(val||0).toFixed(2)}`}</span>
                  </div>
                ))}
              </div>

              {/* Pagos parciales */}
              {(cuentaData.pagos_parciales||[]).length > 0 && (
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-xs font-bold text-green-700 mb-2">Pagos registrados:</p>
                  {cuentaData.pagos_parciales.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs text-green-600">
                      <span>{p.nombre||p.metodo} — {new Date(p.hora).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</span>
                      <span className="font-mono font-bold">${Number(p.monto).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Acciones */}
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" onClick={() => setModalPagoParcial(true)} className="bg-green-600 hover:bg-green-700 text-white">💵 Pago Parcial</Button>
                <Button size="sm" onClick={() => setModalDescuento(true)} variant="outline" className="border-orange-300 text-orange-600">% Descuento/Propina</Button>
                <Button size="sm" onClick={imprimirPreCuenta} variant="outline" className="border-gray-300 text-gray-600">🖨 Imprimir Pre-Cuenta</Button>
                <Button size="sm" onClick={() => { setModalCuenta(false); irAlPOSCobrar(); }} className="bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white">💰 Ir a Cobrar</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )}

    {/* ══ MODAL: LISTA DE ESPERA ════════════════════════════════════════ */}
    {modalListaEspera && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl border border-yellow-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-yellow-100 p-4 flex justify-between items-center">
            <h2 className="font-bold text-gray-900">⏳ Lista de Espera</h2>
            <button onClick={() => setModalListaEspera(false)} className="text-gray-400 hover:text-gray-700">✕</button>
          </div>
          <div className="p-4 space-y-4">
            {/* Agregar */}
            <div className="bg-yellow-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-bold text-yellow-700">Agregar a la espera</p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Nombre del cliente *" value={espNombre} onChange={e=>setEspNombre(e.target.value)} className="text-sm"/>
                <Input type="number" placeholder="Personas" value={espPersonas} onChange={e=>setEspPersonas(e.target.value)} className="text-sm"/>
                <Input placeholder="Teléfono" value={espTelefono} onChange={e=>setEspTelefono(e.target.value)} className="text-sm"/>
                <Input placeholder="Nota" value={espNota} onChange={e=>setEspNota(e.target.value)} className="text-sm"/>
              </div>
              <Button onClick={agregarListaEspera} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white">+ Agregar</Button>
            </div>
            {/* Lista */}
            <div className="space-y-2">
              {listaEspera.length === 0 ? (
                <p className="text-center text-gray-400 py-4">Lista vacía</p>
              ) : listaEspera.map((e: any, i: number) => (
                <div key={e.id} className="flex items-center justify-between bg-white border border-yellow-100 rounded-xl p-3">
                  <div>
                    <div className="font-bold text-gray-900 text-sm">#{i+1} {e.nombre} — 👥 {e.personas}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(e.hora_entrada).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}
                      {e.telefono && ` · 📱 ${e.telefono}`}
                      {e.nota && ` · ${e.nota}`}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => actualizarListaEspera(e.id, 'sentado')} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Sentado ✓</button>
                    <button onClick={() => actualizarListaEspera(e.id, 'cancelado')} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ══ MODAL: NOTA ESPECIAL ══════════════════════════════════════════ */}
    {modalNota && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl border border-gray-200 w-full max-w-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-900">📝 Nota — Mesa {selected?.numero}</h2>
          <textarea value={notaTexto} onChange={e=>setNotaTexto(e.target.value)} rows={4}
            placeholder="Ej: Alergia al mariscos, cliente VIP, cumpleaños, silla para bebé..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none"/>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setModalNota(false)} className="flex-1">Cancelar</Button>
            <Button onClick={guardarNota} className="flex-1 bg-[#F97316] text-white">Guardar</Button>
          </div>
        </div>
      </div>
    )}

    {/* ══ MODAL: UNIR MESAS ════════════════════════════════════════════ */}
    {modalUnir && selected && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl border border-gray-200 w-full max-w-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-900">🔗 Unir Mesa {selected.numero} con…</h2>
          <p className="text-sm text-gray-600">El consumo de Mesa {selected.numero} se sumará a la mesa destino y quedará libre.</p>
          <select value={mesaDestinoUnir} onChange={e=>setMesaDestinoUnir(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900">
            <option value="">— Seleccionar mesa destino —</option>
            {mesas.filter(m => m.estado === 'ocupada' && m.id !== selected.id).map(m => (
              <option key={m.id} value={m.id || (m as any).codigo}>Mesa {m.numero} ({m.zona}) — ${m.consumo_acumulado.toFixed(2)}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setModalUnir(false)} className="flex-1">Cancelar</Button>
            <Button onClick={unirMesas} className="flex-1 bg-blue-600 text-white">Unir</Button>
          </div>
        </div>
      </div>
    )}

    {/* ══ MODAL: DESCUENTO / PROPINA ══════════════════════════════════ */}
    {modalDescuento && cuentaData && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl border border-orange-200 w-full max-w-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-900">% Descuento / Propina</h2>
          <p className="text-sm text-gray-600">Total actual: <strong>${Number(cuentaData.resumen?.total||0).toFixed(2)}</strong></p>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Descuento (%)</label>
            <Input type="number" min="0" max="100" value={descuentoPct} onChange={e=>setDescuentoPct(e.target.value)} placeholder="0" className="text-sm"/>
          </div>
          {cuentaData.resumen?.servicio_10pct_automatico ? (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              ⚠️ El <strong>{cuentaData.resumen?.porcentaje_servicio || 10}% de servicio</strong> se cobra automáticamente segun la Ley de Turismo y se acumula para distribuir a los empleados. No puede modificarse desde aqui — desactivelo en <em>Configuracion → Facturacion → Reglamento Ley de Turismo</em>.
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-600 block mb-1">Propina sugerida (%)</label>
              <Input type="number" min="0" max="30" value={propinaPct} onChange={e=>setPropinaPct(e.target.value)} placeholder="10" className="text-sm"/>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setModalDescuento(false)} className="flex-1">Cancelar</Button>
            <Button onClick={aplicarDescuento} className="flex-1 bg-orange-500 text-white">Aplicar</Button>
          </div>
        </div>
      </div>
    )}

    {/* ══ MODAL: PAGO PARCIAL ══════════════════════════════════════════ */}
    {modalPagoParcial && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl border border-green-200 w-full max-w-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-900">💵 Registrar Pago Parcial</h2>
          {cuentaData && <p className="text-sm text-gray-600">Saldo pendiente: <strong className="text-red-600">${Number(cuentaData.resumen?.saldo_pendiente||0).toFixed(2)}</strong></p>}
          <Input type="number" min="0" step="0.01" value={pagoParcialMonto} onChange={e=>setPagoParcialMonto(e.target.value)} placeholder="Monto a pagar $" className="text-sm font-mono"/>
          <select value={pagoParcialMetodo} onChange={e=>setPagoParcialMetodo(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900">
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </select>
          <Input value={pagoParcialNombre} onChange={e=>setPagoParcialNombre(e.target.value)} placeholder="Nombre del pagador (opcional)" className="text-sm"/>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setModalPagoParcial(false)} className="flex-1">Cancelar</Button>
            <Button onClick={registrarPagoParcial} className="flex-1 bg-green-600 text-white">Registrar Pago</Button>
          </div>
        </div>
      </div>
    )}

    {/* ══ MODAL: ESTADÍSTICAS ══════════════════════════════════════════ */}
    {modalEstadisticas && estadisticasData && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl border border-blue-200 w-full max-w-md max-h-[80vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-blue-100 p-4 flex justify-between items-center">
            <h2 className="font-bold text-gray-900">📊 Estadísticas del Día</h2>
            <button onClick={() => setModalEstadisticas(false)} className="text-gray-400 hover:text-gray-700">✕</button>
          </div>
          <div className="p-4 space-y-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">${Number(estadisticasData.total_hoy||0).toFixed(2)}</div>
              <div className="text-xs text-blue-500">Total facturado hoy</div>
            </div>
            <div className="space-y-2">
              {(estadisticasData.estadisticas||[]).map((e: any, i: number) => (
                <div key={i} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-700">Mesa {e.mesa}</span>
                  <div className="text-right">
                    <div className="font-bold text-orange-600">${Number(e.total||0).toFixed(2)}</div>
                    <div className="text-xs text-gray-400">{e.ventas} órdenes</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
