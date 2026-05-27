import { NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, ShoppingCart, Package, Calculator, Users, ChefHat,
  Shield, BarChart3, Settings, LogOut, UserCog,
  FolderKanban, TrendingUp, FileText, Bell, X, CheckCheck,
  Utensils, Wallet, CreditCard, Crown, Warehouse, Play, FileCheck,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { DiagnosticoPanel } from '../DiagnosticoPanel';
import { tieneAcceso, labelRol, badgeRol, type Modulo } from '../../utils/permisos';
import { BodegaSelector } from '../BodegaSelector';

interface Notif {
  id: string;
  title: string;
  time: string;
  type: 'stock' | 'comanda' | 'factura';
  route?: string;
}

const NOTIF_ROUTE: Record<string, string> = {
  stock: '/inventario',
  comanda: '/cocina',
  factura: '/facturacion/consulta',
};

const NOTIF_DOT: Record<string, string> = {
  stock: 'bg-yellow-400',
  comanda: 'bg-blue-400',
  factura: 'bg-red-400',
};

const NOTIF_LABEL: Record<string, string> = {
  stock: 'Inventario',
  comanda: 'Cocina',
  factura: 'Facturas',
};

const dismissedIds = new Set<string>();

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  // Poll real notifications every 30 seconds
  useEffect(() => {
    async function fetchNotifs() {
      try {
        const token = localStorage.getItem('erp_token') || '';
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/notificaciones`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
              'X-User-Token': token,
            },
          }
        );
        if (!resp.ok) return;
        const data = await resp.json();
        if (Array.isArray(data.notificaciones)) {
          setNotifs(data.notificaciones.filter((n: Notif) => !dismissedIds.has(n.id)));
        }
      } catch { /* silencioso si no hay conexión */ }
    }

    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside (works with fixed positioning)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inBell = bellRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inBell && !inDropdown) setShowNotifs(false);
    }
    if (showNotifs) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifs]);

  // Close notification dropdown on route change
  useEffect(() => {
    setShowNotifs(false);
  }, [location.pathname]);

  const dismissNotif = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    dismissedIds.add(id);
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  const dismissAll = () => {
    notifs.forEach(n => dismissedIds.add(n.id));
    setNotifs([]);
    setShowNotifs(false);
  };

  const handleNotifClick = (notif: Notif) => {
    const route = notif.route || NOTIF_ROUTE[notif.type] || '/';
    dismissNotif(notif.id);
    setShowNotifs(false);
    navigate(route);
  };

  const rol = user?.rol ?? '';
  const ma = user?.empresa?.modulos_activos ?? {};

  const NAV_ITEMS: [Modulo, string, any, string, boolean][] = [
    ['dashboard',        '/',                        LayoutDashboard, 'Dashboard',             true],
    ['pos',              '/pos',                     ShoppingCart,    'Punto de Venta',        !!ma.pos],
    ['mesas',            '/mesas',                   Utensils,        'Plano de Mesas',        !!ma.pos],
    ['caja',             '/caja',                    Wallet,          'Gestión de Caja',       !!ma.pos],
    ['inventario',       '/inventario',              Package,         'Inventario',            !!ma.inventario],
    ['cocina',           '/cocina',                  ChefHat,         'Cocina (KDS)',          !!ma.cocina],
    ['ingenieria_menu',  '/ingenieria-menu',         TrendingUp,      'Ingeniería de Menú',   !!ma.cocina],
    ['facturacion',      '/facturacion/consulta',    FileText,        'Consulta Facturas',     !!ma.contabilidad],
    ['retenciones',      '/facturacion/retenciones', FileCheck,       'Retenciones',           !!ma.contabilidad],
    ['facturacion_config','/facturacion/configuracion', FileText,     'Config. Facturación',  !!ma.contabilidad],
    ['contabilidad',     '/contabilidad',            Calculator,      'Contabilidad',          !!ma.contabilidad],
    ['proyectos',        '/proyectos',               FolderKanban,    'Proyectos',             true],
    ['rrhh',             '/rrhh',                    Users,           'Talento Humano',        !!ma.rrhh],
    ['auditoria',        '/auditoria',               Shield,          'Auditoría',             !!ma.auditoria],
    ['bi',               '/bi',                      BarChart3,       'Business Intelligence', !!ma.bi],
    ['usuarios',         '/usuarios',                UserCog,         'Usuarios',              true],
    ['configuracion',    '/configuracion',           Settings,        'Configuración',         true],
    ['suscripcion',      '/suscripcion',             CreditCard,      'Suscripción',           true],
    ['admin_panel',      '/admin',                   Crown,           'Super Admin',           true],
    ['produccion',       '/produccion',              Warehouse,       'Producción',            true],
  ];

  const modulos = NAV_ITEMS.filter(([modulo, , , , activoEnPlan]) =>
    activoEnPlan && tieneAcceso(rol, modulo)
  );

  return (
    <div className="w-72 md:w-64 h-full min-h-screen bg-[#F5F3EF] border-r border-gray-200 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 min-w-0">
            {/* Marca M.A.R COCINA LOCAL */}
            <div className="leading-none">
              <span
                className="font-black text-xs tracking-[0.2em] block"
                style={{
                  color: 'transparent',
                  WebkitTextStroke: '1px #F97316',
                  fontFamily: "'Arial Black', Arial, sans-serif",
                }}
              >M.A.R</span>
              <div className="flex items-baseline leading-none">
                <span
                  className="font-black text-base tracking-tight"
                  style={{ color: '#F97316', fontFamily: "'Arial Black', Arial, sans-serif" }}
                >COCINA</span>
                <span
                  className="font-black text-base tracking-tight"
                  style={{ color: '#1a1a1a', fontFamily: "'Arial Black', Arial, sans-serif" }}
                >LOCAL</span>
              </div>
            </div>
            <p className="text-[#F97316] text-[10px] font-medium opacity-80 mt-0.5">{user?.empresa?.plan?.toUpperCase() ?? ''}</p>
          </div>
          {/* Notification Bell */}
          <div className="relative flex-shrink-0">
            <button
              ref={bellRef}
              onClick={() => {
                if (!showNotifs && bellRef.current) {
                  const r = bellRef.current.getBoundingClientRect();
                  setDropdownPos({ top: r.bottom + 8, left: r.left });
                }
                setShowNotifs(v => !v);
              }}
              className="relative p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200"
              title="Notificaciones"
            >
              <Bell className={`w-5 h-5 ${notifs.length > 0 ? 'text-[#F97316]' : ''}`} />
              {notifs.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold leading-none animate-pulse">
                  {notifs.length > 9 ? '9+' : notifs.length}
                </span>
              )}
            </button>

            {showNotifs && (
              <div
                ref={dropdownRef}
                style={{ top: dropdownPos.top, left: dropdownPos.left }}
                className="fixed w-80 bg-white border border-[#F97316]/20 rounded-xl shadow-2xl shadow-black/60 z-[9999] overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-gray-900 text-sm font-semibold flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#F97316]" />
                    Notificaciones
                    {notifs.length > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {notifs.length}
                      </span>
                    )}
                  </span>
                  {notifs.length > 0 && (
                    <button
                      onClick={dismissAll}
                      className="flex items-center gap-1 text-xs text-gray-600 hover:text-[#F97316] transition-colors"
                      title="Marcar todas como leídas"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Limpiar todo
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-600 text-sm">Sin notificaciones pendientes</p>
                    </div>
                  ) : (
                    notifs.map(n => (
                      <button
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#F97316]/5 transition-colors border-b border-gray-100 last:border-0 text-left group"
                      >
                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${NOTIF_DOT[n.type] ?? 'bg-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 text-xs font-medium leading-snug group-hover:text-[#F97316] transition-colors">
                            {n.title}
                          </p>
                          <p className="text-gray-600 text-xs mt-0.5 flex items-center gap-1">
                            {n.time}
                            <span className="text-[#F97316]/60">· Ir a {NOTIF_LABEL[n.type] ?? 'módulo'} →</span>
                          </p>
                        </div>
                        <span
                          role="button"
                          onClick={e => dismissNotif(n.id, e)}
                          className="flex-shrink-0 p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                          title="Descartar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    ))
                  )}
                </div>

                {notifs.length > 0 && (
                  <div className="px-4 py-2 border-t border-gray-100 text-center">
                    <p className="text-xs text-gray-600">Haz clic en una notificación para ir al módulo</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="text-gray-600 text-sm truncate">{user?.empresa.nombre}</p>
      </div>

      {/* Bodega Selector */}
      {['admin','gerente','super_admin','bodeguero'].includes(rol) && (
        <div className="border-b border-gray-100">
          <BodegaSelector />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {modulos.map(([, path, Icon, label]) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                isActive
                  ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-md shadow-[#F97316]/25'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-600 group-hover:text-[#F97316]'}`} />
                <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-700'}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FB923C] to-[#F97316] flex items-center justify-center flex-shrink-0 font-bold text-white text-sm">
            {user?.nombre?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 text-sm font-medium truncate">{user?.nombre}</p>
            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badgeRol(user?.rol ?? '')}`}>
              {labelRol(user?.rol ?? '')}
            </span>
          </div>
        </div>

        <div className="mb-2 w-full">
          <DiagnosticoPanel />
        </div>

        {/* Tour del sistema */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-onboarding'))}
          className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-[#F97316]/10 transition-all duration-200 group mb-1"
          title="Ver tour del sistema"
        >
          <Play className="w-4 h-4 flex-shrink-0 text-[#F97316] group-hover:text-[#F97316]" />
          <span className="text-sm">Tour del sistema</span>
        </button>

        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-red-500/10 transition-all duration-200 group"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );
}
