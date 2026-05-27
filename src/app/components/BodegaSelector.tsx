import { useState, useRef, useEffect } from 'react';
import { Warehouse, ChevronDown, Check, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBodega, type Bodega } from '../context/BodegaContext';

const ROLES_CON_ACCESO = ['admin', 'gerente', 'super_admin', 'bodeguero', 'cajero', 'cocinero'];

const TIPO_BADGE: Record<string, string> = {
  produccion:  'bg-orange-100 text-orange-700 border border-orange-300',
  principal:   'bg-orange-100 text-orange-700 border border-orange-300',
  sucursal:    'bg-blue-100 text-blue-700 border border-blue-300',
  restaurante: 'bg-blue-100 text-blue-700 border border-blue-300',
};

const TIPO_LABEL: Record<string, string> = {
  produccion:  'Producción',
  principal:   'Principal',
  sucursal:    'Sucursal',
  restaurante: 'Restaurante',
};

export function BodegaSelector() {
  const { user } = useAuth();
  const { bodegas, bodegaActiva, setBodegaActiva, loading, bodegaBloqueada } = useBodega();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ─── Todos los hooks ANTES de cualquier return condicional ───────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  // ─────────────────────────────────────────────────────────────────────

  const rol = user?.rol ?? '';
  if (!ROLES_CON_ACCESO.includes(rol)) return null;
  if (bodegas.length === 0 && !loading) return null;

  const handleSelect = (b: Bodega) => {
    if (bodegaBloqueada) return; // usuario con sucursal fija no puede cambiar
    setBodegaActiva(b);
    setOpen(false);
  };

  return (
    <div className="px-4 py-2" ref={ref}>
      <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1 font-semibold flex items-center gap-1">
        {bodegaBloqueada && <Lock className="w-2.5 h-2.5 text-yellow-500" />}
        {bodegaBloqueada ? 'Mi sucursal' : 'Bodega activa'}
      </p>
      <button
        onClick={() => !bodegaBloqueada && setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border transition-all duration-200 ${
          bodegaBloqueada
            ? 'border-yellow-500/20 cursor-default'
            : 'border-[#F97316]/20 text-gray-900 hover:border-[#F97316]/50 cursor-pointer'
        }`}
      >
        <Warehouse className={`w-4 h-4 flex-shrink-0 ${bodegaBloqueada ? 'text-yellow-400' : 'text-[#F97316]'}`} />
        <span className="flex-1 text-left text-sm truncate font-medium text-gray-900">
          {loading ? 'Cargando...' : (bodegaActiva?.nombre ?? 'Seleccionar')}
        </span>
        {bodegaBloqueada
          ? <Lock className="w-3 h-3 text-yellow-500 flex-shrink-0" />
          : <ChevronDown className={`w-3.5 h-3.5 text-gray-600 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        }
      </button>

      {open && !bodegaBloqueada && (
        <div className="mt-1 rounded-xl bg-white border border-[#F97316]/20 shadow-2xl shadow-black/60 overflow-hidden z-50">
          {bodegas.map(b => (
            <button
              key={b.id}
              onClick={() => handleSelect(b)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F97316]/5 transition-colors text-left border-b border-gray-100 last:border-0"
            >
              <Check className={`w-3.5 h-3.5 flex-shrink-0 ${bodegaActiva?.id === b.id ? 'text-[#F97316]' : 'opacity-0'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 text-xs font-medium truncate">{b.nombre}</p>
                <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${TIPO_BADGE[b.tipo] ?? 'bg-gray-500/20 text-gray-600 border border-gray-500/40'}`}>
                  {TIPO_LABEL[b.tipo] ?? b.tipo}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
