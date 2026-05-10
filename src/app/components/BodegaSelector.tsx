import { useState, useRef, useEffect } from 'react';
import { Warehouse, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBodega, type Bodega } from '../context/BodegaContext';

const ROLES_CON_ACCESO = ['admin', 'gerente', 'super_admin', 'bodeguero'];

const TIPO_BADGE: Record<string, string> = {
  produccion: 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
  principal:  'bg-orange-500/20 text-orange-300 border border-orange-500/40',
  sucursal:   'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  restaurante:'bg-blue-500/20 text-blue-300 border border-blue-500/40',
};

const TIPO_LABEL: Record<string, string> = {
  produccion: 'Producción',
  principal:  'Principal',
  sucursal:   'Sucursal',
  restaurante:'Restaurante',
};

export function BodegaSelector() {
  const { user } = useAuth();
  const { bodegas, bodegaActiva, setBodegaActiva, loading } = useBodega();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const rol = user?.rol ?? '';
  if (!ROLES_CON_ACCESO.includes(rol)) return null;
  if (bodegas.length === 0 && !loading) return null;

  const handleSelect = (b: Bodega) => {
    setBodegaActiva(b);
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="px-4 py-2" ref={ref}>
      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-semibold">Bodega activa</p>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0A1A2F] border border-[#00E5FF]/20 text-white hover:border-[#00E5FF]/50 transition-all duration-200"
      >
        <Warehouse className="w-4 h-4 text-[#00E5FF] flex-shrink-0" />
        <span className="flex-1 text-left text-sm truncate font-medium">
          {loading ? 'Cargando...' : (bodegaActiva?.nombre ?? 'Seleccionar')}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1 rounded-xl bg-[#0A1A2F] border border-[#00E5FF]/20 shadow-2xl shadow-black/60 overflow-hidden z-50">
          {bodegas.map(b => (
            <button
              key={b.id}
              onClick={() => handleSelect(b)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#00E5FF]/5 transition-colors text-left border-b border-white/5 last:border-0"
            >
              <Check className={`w-3.5 h-3.5 flex-shrink-0 ${bodegaActiva?.id === b.id ? 'text-[#00E5FF]' : 'opacity-0'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{b.nombre}</p>
                <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${TIPO_BADGE[b.tipo] ?? 'bg-gray-500/20 text-gray-300 border border-gray-500/40'}`}>
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
