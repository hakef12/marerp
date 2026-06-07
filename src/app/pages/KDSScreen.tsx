/**
 * Kitchen Display System — pantalla independiente para cocina
 * Abrir en: /kds (nueva ventana/tab, sin sidebar)
 * Lee el token de localStorage igual que el resto de la app.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Bell, Flame, CheckCircle, Clock, Users, Wifi, WifiOff, RefreshCw } from 'lucide-react';

const POLL_INTERVAL = 8000; // 8 segundos

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(seconds: number) {
  if (!seconds || seconds < 0) return '00:00';
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Una comanda se considera "vencida/stale" si lleva más de 4 horas sin atenderse */
const STALE_SECS = 4 * 60 * 60;

function elapsed(from: string, now: number) {
  try {
    const t = new Date(from).getTime();
    if (isNaN(t)) return 0;
    return Math.max(0, Math.floor((now - t) / 1000));
  } catch { return 0; }
}

function timeColor(secs: number) {
  if (secs > 900) return '#f87171'; // rojo >15min
  if (secs > 600) return '#fb923c'; // naranja >10min
  return '#4ade80'; // verde
}

// ─── Comanda card ─────────────────────────────────────────────────────────────

function ComandaCard({
  comanda, now, onAccion, onArchivar, accionLabel, accionColor,
}: {
  comanda: any; now: number; onAccion: () => void; onArchivar: () => void; accionLabel: string; accionColor: string;
}) {
  const secs = elapsed(comanda.created_at || comanda.fecha_creacion, now);
  const urgente = secs > 900;
  const stale   = secs > STALE_SECS; // +4 horas → vencida

  return (
    <div
      className="rounded-2xl border-2 overflow-hidden flex flex-col"
      style={{
        borderColor: stale ? '#d1d5db' : urgente ? '#ef4444' : accionColor + '66',
        backgroundColor: 'white',
        opacity: stale ? 0.75 : 1,
        boxShadow: urgente && !stale ? '0 0 20px rgba(239,68,68,0.25)' : undefined,
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: stale ? '#f3f4f6' : accionColor + '18' }}>
        <div>
          <div className="text-gray-900 font-black text-xl flex items-center gap-2 flex-wrap">
            {comanda.mesa
              ? `Mesa ${comanda.mesa}`
              : comanda.tipo_servicio === 'para_llevar'
              ? '🥡 Para Llevar'
              : comanda.tipo_servicio === 'delivery'
              ? '🛵 Delivery'
              : comanda.numero_orden || '—'}
            {stale ? (
              <span className="text-xs font-bold bg-gray-500 text-white px-2 py-0.5 rounded-full">
                VENCIDA
              </span>
            ) : urgente ? (
              <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                URGENTE
              </span>
            ) : null}
          </div>
          {comanda.cliente && (
            <div className="text-sm mt-0.5" style={{ color: accionColor }}>
              <Users className="inline w-3 h-3 mr-1" />
              {comanda.cliente}
            </div>
          )}
          <div className="text-xs text-gray-600 mt-0.5">{comanda.numero_orden}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black tabular-nums" style={{ color: stale ? '#6b7280' : timeColor(secs) }}>
            {fmt(secs)}
          </div>
          <div className="text-xs text-gray-600">{secs >= 3600 ? 'horas' : 'min'}</div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 p-3 space-y-2">
        {(comanda.items || []).map((item: any, i: number) => (
          <div key={i} className="bg-gray-50 rounded-xl px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black" style={{ color: accionColor }}>
                {item.cantidad}×
              </span>
              <span className="text-gray-900 font-bold text-base leading-tight">{item.nombre}</span>
            </div>
            {item.notas && (
              <div className="text-amber-400 text-sm mt-1 ml-1 italic">
                ⚑ {item.notas}
              </div>
            )}
          </div>
        ))}
        {comanda.notas && (
          <div className="border border-yellow-400/50 bg-yellow-50 rounded-xl px-3 py-2 text-yellow-700 text-sm">
            💬 {comanda.notas}
          </div>
        )}
      </div>

      {/* Acción */}
      <div className="p-3 pt-0 flex gap-2">
        {stale ? (
          <button
            onClick={onArchivar}
            className="flex-1 py-3 rounded-xl font-bold text-base transition-all hover:brightness-110 active:scale-95 bg-gray-600 text-white"
          >
            🗑 Archivar (vencida)
          </button>
        ) : (
          <button
            onClick={onAccion}
            className="flex-1 py-3 rounded-xl font-bold text-base transition-all hover:brightness-110 active:scale-95"
            style={{ backgroundColor: accionColor, color: '#000' }}
          >
            {accionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Columna ─────────────────────────────────────────────────────────────────

function Columna({ title, icon, color, count, children }: {
  title: string; icon: React.ReactNode; color: string; count: number; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div style={{ color }}>{icon}</div>
        <span className="text-gray-900 font-bold text-lg">{title}</span>
        <span
          className="ml-auto text-sm font-bold px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: color + '25', color }}
        >
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-600">
            <div style={{ color: color + '40' }} className="mb-2">{icon}</div>
            <p className="text-sm">Sin comandas</p>
          </div>
        ) : children}
      </div>
    </div>
  );
}

// ─── KDS Screen ──────────────────────────────────────────────────────────────

export default function KDSScreen() {
  const [comandas, setComandas] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [updating, setUpdating] = useState(false);
  const prevCount = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);

  // Reloj interno cada segundo
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Beep cuando llega una comanda nueva
  const beep = () => {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch { /* ignorar si no hay permisos de audio */ }
  };

  const fetchComandas = useCallback(async () => {
    const token = localStorage.getItem('erp_token') || '';
    if (!token) return;
    try {
      setUpdating(true);
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/comandas`,
        { headers: { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token } }
      );
      if (res.ok) {
        const data = await res.json();
        const activas = (data.comandas || []).filter(
          (c: any) => c.estado !== 'entregada' && c.estado !== 'cancelada'
        );
        const pendientes = activas.filter((c: any) => c.estado === 'pendiente').length;
        if (pendientes > prevCount.current) beep();
        prevCount.current = pendientes;
        setComandas(activas);
        setOnline(true);
        setLastUpdate(new Date());
      } else {
        setOnline(false);
      }
    } catch {
      setOnline(false);
    } finally {
      setUpdating(false);
    }
  }, []);

  useEffect(() => {
    fetchComandas();
    const t = setInterval(fetchComandas, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchComandas]);

  const cambiarEstado = async (id: string, estado: string) => {
    if (!id || id === 'undefined') return;
    setComandas(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, estado } : c);
      // Remover inmediatamente del KDS si se marca como entregada/cancelada
      if (estado === 'entregada' || estado === 'cancelada') {
        return updated.filter(c => c.id !== id);
      }
      return updated;
    });
    const token = localStorage.getItem('erp_token') || '';
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/comandas/${id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            'X-User-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ estado }),
        }
      );
    } catch {
      fetchComandas();
    }
  };

  /** Archivar (marcar como entregada) una comanda vencida */
  const archivarComanda = (id: string) => cambiarEstado(id, 'entregada');

  /** Archivar TODAS las vencidas de golpe */
  const archivarTodasVencidas = () => {
    const nowMs = Date.now();
    const vencidas = comandas.filter(
      c => elapsed(c.created_at || c.fecha_creacion, nowMs) > STALE_SECS
    );
    vencidas.forEach(c => archivarComanda(c.id));
  };

  const nowMs = Date.now();
  const pendientes = comandas.filter(c => c.estado === 'pendiente');
  const enPrep = comandas.filter(c => c.estado === 'en_preparacion');
  const listas = comandas.filter(c => c.estado === 'lista');
  const totalVencidas = [...pendientes, ...enPrep].filter(
    c => elapsed(c.created_at || c.fecha_creacion, nowMs) > STALE_SECS
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex-none flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-gray-900 tracking-wide">KDS</span>
          <span className="text-gray-600 text-sm">Kitchen Display System</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Hora */}
          <span className="text-gray-900 font-mono text-lg tabular-nums">
            {new Date(now).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          {/* Estado conexión */}
          <div className={`flex items-center gap-1.5 text-sm px-3 py-1 rounded-full ${
            online ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {online ? 'En línea' : 'Sin conexión'}
          </div>

          {/* Archivar vencidas */}
          {totalVencidas > 0 && (
            <button
              onClick={archivarTodasVencidas}
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors flex items-center gap-1.5"
              title="Archivar todas las comandas con más de 4 horas"
            >
              🗑 Archivar vencidas ({totalVencidas})
            </button>
          )}

          {/* Botón refresh */}
          <button
            onClick={fetchComandas}
            disabled={updating}
            className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`} />
          </button>

          {lastUpdate && (
            <span className="text-gray-600 text-xs">
              Actualizado {lastUpdate.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* ── KDS grid ── */}
      <div className="flex-1 grid grid-cols-3 gap-4 p-4 min-h-0">
        {/* Pendientes */}
        <Columna
          title="Pendientes"
          icon={<Bell className="w-5 h-5" />}
          color="#f97316"
          count={pendientes.length}
        >
          {pendientes.map(c => (
            <ComandaCard
              key={c.id}
              comanda={c}
              now={now}
              onAccion={() => cambiarEstado(c.id, 'en_preparacion')}
              onArchivar={() => archivarComanda(c.id)}
              accionLabel="🔥 Iniciar preparación"
              accionColor="#3b82f6"
            />
          ))}
        </Columna>

        {/* En preparación */}
        <Columna
          title="En Preparación"
          icon={<Flame className="w-5 h-5" />}
          color="#3b82f6"
          count={enPrep.length}
        >
          {enPrep.map(c => (
            <ComandaCard
              key={c.id}
              comanda={c}
              now={now}
              onAccion={() => cambiarEstado(c.id, 'lista')}
              onArchivar={() => archivarComanda(c.id)}
              accionLabel="✓ Lista para servir"
              accionColor="#22c55e"
            />
          ))}
        </Columna>

        {/* Listas */}
        <Columna
          title="Listas para servir"
          icon={<CheckCircle className="w-5 h-5" />}
          color="#22c55e"
          count={listas.length}
        >
          {listas.map(c => (
            <ComandaCard
              key={c.id}
              comanda={c}
              now={now}
              onAccion={() => cambiarEstado(c.id, 'entregada')}
              onArchivar={() => archivarComanda(c.id)}
              accionLabel="Entregada ✓"
              accionColor="#6b7280"
            />
          ))}
        </Columna>
      </div>

      {/* ── Footer ── */}
      <div className="flex-none flex items-center justify-between px-6 py-2 bg-white border-t border-gray-100 text-xs text-gray-600">
        <span>M.A.R Cocina Local — Kitchen Display System</span>
        <span>Actualización automática cada {POLL_INTERVAL / 1000}s</span>
      </div>
    </div>
  );
}
