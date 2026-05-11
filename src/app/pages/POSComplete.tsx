import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBodega } from '../context/BodegaContext';
import { useSearchParams, useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { RIDE } from '../components/facturacion/RIDE';
import { DatosClienteDialog, type DatosCliente } from '../components/facturacion/DatosClienteDialog';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, DollarSign, CreditCard,
  Wallet, Utensils, Receipt, Percent, CheckCircle2, FileText, Printer,
  MessageSquare, X, ChefHat, Clock, Users, Package, AlertCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock_actual: number;
  stock_minimo: number;
  disponible: boolean;
  categoria_id?: string;
  categorias?: { id: string; nombre: string; color: string };
}

interface ItemOrden {
  producto: Producto;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  notas: string;
}

type TipoServicio = 'mesa' | 'para_llevar' | 'delivery';

const MESAS = Array.from({ length: 20 }, (_, i) => i + 1);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const apiHeaders = (token: string) => ({
  Authorization: `Bearer ${publicAnonKey}`,
  'X-User-Token': token,
  'Content-Type': 'application/json',
});

const apiGet = (token: string) => ({
  Authorization: `Bearer ${publicAnonKey}`,
  'X-User-Token': token,
});

// ─── Comanda Print ───────────────────────────────────────────────────────────

function imprimirComanda(comanda: {
  numero_orden: string;
  tipo_servicio: TipoServicio;
  mesa?: string;
  cliente?: string;
  items: ItemOrden[];
  notas?: string;
  fecha: Date;
}) {
  const tipoLabel = comanda.tipo_servicio === 'mesa'
    ? `Mesa ${comanda.mesa}`
    : comanda.tipo_servicio === 'para_llevar'
    ? 'Para Llevar'
    : 'Delivery';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 4mm; }
        h1 { font-size: 18px; text-align: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
        .centro { text-align: center; }
        .row { display: flex; justify-content: space-between; margin: 3px 0; }
        .bold { font-weight: bold; }
        .big { font-size: 16px; font-weight: bold; text-align: center; margin: 6px 0; }
        .sep { border-top: 1px dashed #000; margin: 6px 0; }
        .item { margin: 4px 0; }
        .item-nombre { font-weight: bold; font-size: 13px; }
        .item-nota { font-style: italic; font-size: 11px; margin-left: 8px; color: #444; }
        .notas { margin-top: 6px; padding: 4px; border: 1px dashed #000; }
      </style>
    </head>
    <body>
      <h1>★ COMANDA ★</h1>
      <div class="centro bold" style="font-size:14px">${tipoLabel}</div>
      ${comanda.cliente ? `<div class="centro">Cliente: ${comanda.cliente}</div>` : ''}
      <div class="sep"></div>
      <div class="row"><span>Orden:</span><span class="bold">${comanda.numero_orden}</span></div>
      <div class="row"><span>Fecha:</span><span>${comanda.fecha.toLocaleDateString('es-EC')}</span></div>
      <div class="row"><span>Hora:</span><span class="bold">${comanda.fecha.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="sep"></div>
      <div class="bold" style="font-size:13px; margin-bottom:4px;">ITEMS:</div>
      ${comanda.items.map(item => `
        <div class="item">
          <div class="row">
            <span class="item-nombre">${item.cantidad}x ${item.producto.nombre}</span>
          </div>
          ${item.notas ? `<div class="item-nota">⚑ ${item.notas}</div>` : ''}
        </div>
      `).join('')}
      ${comanda.notas ? `
        <div class="sep"></div>
        <div class="notas"><div class="bold">Notas generales:</div>${comanda.notas}</div>
      ` : ''}
      <div class="sep"></div>
      <div class="centro" style="font-size:11px; margin-top:4px;">*** COCINA ***</div>
    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=340,height=600');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function POS() {
  const { token } = useAuth();
  const { bodegaActiva } = useBodega();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── Estado de caja (obligatorio para vender) ──────────────────
  const [caja, setCaja] = useState<{ abierta: boolean; cajero?: string; monto_real?: number } | null>(null);
  const [cargandoCaja, setCargandoCaja] = useState(true);

  // Datos
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [loadingProductos, setLoadingProductos] = useState(true);

  // Orden
  const [orden, setOrden] = useState<ItemOrden[]>([]);
  const [tipoServicio, setTipoServicio] = useState<TipoServicio>('mesa');
  const [mesa, setMesa] = useState('');
  const [cliente, setCliente] = useState('');
  const [notas, setNotas] = useState('');
  const [descuento, setDescuento] = useState(0);
  const [aplicarIVA, setAplicarIVA] = useState(true);
  const [editandoNota, setEditandoNota] = useState<string | null>(null);
  const [notaTemp, setNotaTemp] = useState('');
  const [comandaEnviada, setComandaEnviada] = useState(false);

  // Pago
  const [dialogPago, setDialogPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [procesando, setProcesando] = useState(false);

  // Post-venta
  const [dialogComanda, setDialogComanda] = useState(false);
  const [ultimaComanda, setUltimaComanda] = useState<any>(null);
  const [ventaCompletada, setVentaCompletada] = useState<any>(null);
  const [dialogDatosCliente, setDialogDatosCliente] = useState(false);
  const [dialogRIDE, setDialogRIDE] = useState(false);
  const [facturaGenerada, setFacturaGenerada] = useState<any>(null);

  // ── Verificar estado de caja al montar (y cuando cambia bodega) ──
  useEffect(() => {
    async function checkCaja() {
      if (!bodegaActiva?.id) return; // esperar a que cargue la bodega activa
      setCargandoCaja(true);
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/caja/estado?bodega_id=${bodegaActiva.id}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token } }
        );
        if (!res.ok) { setCaja({ abierta: false }); return; }
        const data = await res.json();
        const s = data.sesion;
        if (s && s.estado === 'abierta') {
          setCaja({ abierta: true, cajero: s.cajero_nombre, monto_real: s.monto_real });
        } else {
          setCaja({ abierta: false });
        }
      } catch {
        setCaja({ abierta: false });
      } finally {
        setCargandoCaja(false);
      }
    }
    if (token) checkCaja();
  }, [token, bodegaActiva?.id]);

  // ── Leer parámetros de URL (venimos desde Mesas) ──────────────
  useEffect(() => {
    const mesaParam = searchParams.get('mesa');
    if (mesaParam) {
      setTipoServicio('mesa');
      setMesa(mesaParam);
    }
  }, [searchParams]);

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setLoadingProductos(true);
    await Promise.all([fetchProductos(), fetchCategorias()]);
    setLoadingProductos(false);
  };

  const fetchProductos = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/pos/productos`,
        { headers: apiGet(token) }
      );
      if (!res.ok) return;
      const data = await res.json();
      const isMock = (p: any) => {
        if (p.id?.startsWith('prod_')) return true;
        const n = (p.nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const mocks = ['hamburguesa', 'alitas', 'papas', 'refresco', 'cerveza', 'limonada',
          'cheesecake', 'brownie', 'helado', 'cafe', 'cappuccino', 'capuccino', 'chai',
          'pizza', 'ensalada', 'clasica', 'americano'];
        return mocks.some(m => n.includes(m));
      };
      setProductos((data.productos || []).filter((p: any) => !isMock(p)));
    } catch { /* silencioso */ }
  };

  const fetchCategorias = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/categorias`,
        { headers: apiGet(token) }
      );
      if (!res.ok) return;
      const data = await res.json();
      const isMockCat = (c: any) => {
        if (c.id?.startsWith('cat_')) return true;
        const n = (c.nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        return ['alimentos', 'bebidas', 'postres', 'entradas', 'platos fuertes'].some(m => n.includes(m));
      };
      setCategorias((data.categorias || []).filter((c: any) => !isMockCat(c)));
    } catch { /* silencioso */ }
  };

  // ─── Orden ─────────────────────────────────────────────────────────────────

  const agregarProducto = (p: Producto) => {
    if (!p.disponible) return toast.error('Producto no disponible');
    if (p.stock_actual <= 0) return toast.error('Sin stock');
    setOrden(prev => {
      const idx = prev.findIndex(i => i.producto.id === p.id);
      if (idx >= 0) {
        if (prev[idx].cantidad >= p.stock_actual) { toast.error('Stock insuficiente'); return prev; }
        return prev.map((i, n) => n === idx
          ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio_unitario }
          : i);
      }
      const precio = Number(p.precio) || 0;
      return [...prev, { producto: p, cantidad: 1, precio_unitario: precio, subtotal: precio, notas: '' }];
    });
    setComandaEnviada(false);
    toast.success(`${p.nombre} agregado`, { duration: 800 });
  };

  const cambiarCantidad = (productoId: string, delta: number) => {
    setOrden(prev => prev.flatMap(i => {
      if (i.producto.id !== productoId) return [i];
      const nueva = i.cantidad + delta;
      if (nueva <= 0) return [];
      if (nueva > i.producto.stock_actual) { toast.error('Stock insuficiente'); return [i]; }
      return [{ ...i, cantidad: nueva, subtotal: nueva * i.precio_unitario }];
    }));
    setComandaEnviada(false);
  };

  const eliminarItem = (productoId: string) =>
    setOrden(prev => prev.filter(i => i.producto.id !== productoId));

  const guardarNota = (productoId: string) => {
    setOrden(prev => prev.map(i =>
      i.producto.id === productoId ? { ...i, notas: notaTemp } : i
    ));
    setEditandoNota(null);
    setNotaTemp('');
  };

  const subtotal = orden.reduce((s, i) => s + i.subtotal, 0);
  const descuentoVal = (subtotal * descuento) / 100;
  const ivaVal = aplicarIVA ? (subtotal - descuentoVal) * 0.15 : 0;
  const total = subtotal - descuentoVal + ivaVal;
  const cambio = metodoPago === 'efectivo' && montoRecibido
    ? Math.max(0, parseFloat(montoRecibido) - total) : 0;

  // ─── Enviar a cocina ────────────────────────────────────────────────────────

  const generarNumeroOrden = () => {
    const ts = Date.now().toString().slice(-6);
    return tipoServicio === 'mesa' ? `M${mesa || '?'}-${ts}` : `TL-${ts}`;
  };

  const enviarCocina = async (): Promise<string | null> => {
    const numero_orden = generarNumeroOrden();
    const items = orden.map(i => ({
      producto_id: i.producto.id,
      nombre: i.producto.nombre,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.subtotal,
      notas: i.notas || undefined,
    }));
    const body = {
      numero_orden,
      items,
      estado: 'pendiente',
      notas,
      mesa: tipoServicio === 'mesa' ? mesa : undefined,
      cliente: cliente || undefined,
      tipo_servicio: tipoServicio,
      prioridad: 'normal',
    };
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/comandas`,
        { method: 'POST', headers: apiHeaders(token), body: JSON.stringify(body) }
      );
      if (res.ok) return numero_orden;
    } catch { /* continuar */ }
    return null;
  };

  const handleEnviarCocina = async () => {
    if (orden.length === 0) return toast.error('La orden está vacía');
    if (tipoServicio === 'mesa' && !mesa) return toast.error('Selecciona una mesa');
    setProcesando(true);
    const numero = await enviarCocina();
    setProcesando(false);
    if (numero) {
      setComandaEnviada(true);
      setUltimaComanda({
        numero_orden: numero,
        tipo_servicio: tipoServicio,
        mesa,
        cliente,
        items: orden,
        notas,
        fecha: new Date(),
      });
      setDialogComanda(true);
      toast.success(`Comanda ${numero} enviada a cocina`);
    } else {
      toast.error('Error al enviar comanda');
    }
  };

  // ─── Cobrar ─────────────────────────────────────────────────────────────────

  const handleCobrar = () => {
    if (orden.length === 0) return toast.error('La orden está vacía');
    if (tipoServicio === 'mesa' && !mesa) return toast.error('Selecciona una mesa');
    setDialogPago(true);
  };

  const confirmarPago = async () => {
    if (metodoPago === 'efectivo' && (!montoRecibido || parseFloat(montoRecibido) < total)) {
      return toast.error('Monto recibido insuficiente');
    }
    setProcesando(true);
    const mesaOrigen = tipoServicio === 'mesa' ? mesa : null;
    try {
      // Si no se ha enviado a cocina aún, enviar ahora
      let numero_orden = generarNumeroOrden();
      if (!comandaEnviada) {
        const n = await enviarCocina();
        if (n) { numero_orden = n; setComandaEnviada(true); }
      }

      const items = orden.map(i => ({
        producto_id: i.producto.id,
        nombre: i.producto.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal: i.subtotal,
        notas: i.notas || undefined,
      }));

      const ventaBody = {
        numero_ticket: numero_orden,
        fecha: new Date().toISOString(),
        items,
        subtotal,
        descuento: descuentoVal,
        impuestos: ivaVal,
        total,
        metodo_pago: metodoPago,
        mesa: tipoServicio === 'mesa' ? mesa : undefined,
        cliente: cliente || undefined,
        tipo_servicio: tipoServicio,
        estado: 'completada',
        notas,
        bodega_id: bodegaActiva?.id,
      };

      // ── 1. Guardar venta en POS ────────────────────────────────
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/pos/ventas`,
        { method: 'POST', headers: apiHeaders(token), body: JSON.stringify(ventaBody) }
      );

      if (!res.ok) {
        const err = await res.json();
        if (err.codigo === 'CAJA_CERRADA') {
          setCaja({ abierta: false });
          toast.error('La caja fue cerrada. Vuelve a abrirla para continuar.');
        } else {
          toast.error(err.error || 'Error al procesar venta');
        }
        return;
      }

      // ── 2. Registrar movimiento en caja directamente ───────────
      // Esto garantiza que el movimiento queda en la sesión activa
      // sin depender de llamadas backend-a-backend.
      let cajaOk = false;
      try {
        const descCaja = [
          `Venta ${numero_orden}`,
          tipoServicio === 'mesa' && mesa ? `Mesa ${mesa}` : null,
          cliente ? `Cliente: ${cliente}` : null,
        ].filter(Boolean).join(' · ');

        const cajaRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/caja/movimiento`,
          {
            method: 'POST',
            headers: apiHeaders(token),
            body: JSON.stringify({
              tipo: 'venta',
              monto: total,
              descripcion: descCaja,
              metodo_pago: metodoPago,
              referencia: numero_orden,
              bodega_id: bodegaActiva?.id,
            }),
          }
        );
        cajaOk = cajaRes.ok;
        if (!cajaOk) {
          const cajaErr = await cajaRes.json().catch(() => ({}));
          console.error('⚠ Error caja/movimiento:', cajaErr);
        }
      } catch (e) {
        console.error('⚠ No se pudo contactar caja/movimiento:', e);
      }

      // ── 3. Toast de resultado ─────────────────────────────────
      if (!cajaOk) {
        toast.warning('Venta guardada, pero no pudo registrarse en caja. Verifica con administración.', { duration: 8000 });
      } else if (cambio > 0) {
        toast.success(`Cambio: $${cambio.toFixed(2)}`, { duration: 5000 });
      } else {
        toast.success('¡Venta procesada y registrada en caja!');
      }

      setVentaCompletada(ventaBody);
      setDialogPago(false);
      setDialogDatosCliente(true);

      // Actualizar stock en UI
      await fetchProductos();

      if (mesaOrigen) {
        toast.success(`Mesa ${mesaOrigen} liberada automáticamente`, { duration: 3000 });
      }
    } finally {
      setProcesando(false);
    }
  };

  const mesaOrigenRef = ventaCompletada?.mesa;

  const limpiarVenta = (volverAMesas = false) => {
    setOrden([]);
    setMesa('');
    setCliente('');
    setNotas('');
    setDescuento(0);
    setMetodoPago('efectivo');
    setMontoRecibido('');
    setComandaEnviada(false);
    setVentaCompletada(null);
    // Si venía del plano de mesas, volver al plano
    if (volverAMesas && searchParams.get('mesa')) {
      navigate('/mesas');
    }
  };

  const generarFactura = async (datosCliente: DatosCliente) => {
    if (!ventaCompletada) return;
    setProcesando(true);
    setDialogDatosCliente(false);
    try {
      const body = {
        numero_ticket: ventaCompletada.numero_ticket,
        items: ventaCompletada.items,
        subtotal: ventaCompletada.subtotal,
        descuento: ventaCompletada.descuento,
        impuestos: ventaCompletada.impuestos,
        total: ventaCompletada.total,
        metodo_pago: ventaCompletada.metodo_pago,
        cliente_identificacion: datosCliente.identificacion,
        cliente_tipo_identificacion: datosCliente.tipo_identificacion,
        cliente_razon_social: datosCliente.razon_social,
        cliente_email: datosCliente.email,
      };
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/facturacion/generar`,
        { method: 'POST', headers: apiHeaders(token), body: JSON.stringify(body) }
      );
      if (res.ok) {
        const data = await res.json();
        setFacturaGenerada(data.factura);
        setDialogRIDE(true);
        const estado = data.factura?.estado;
        if (estado === 'AUTORIZADO') {
          toast.success('✅ Factura electrónica AUTORIZADA por el SRI');
        } else if (estado === 'NO_AUTORIZADO') {
          toast.error('❌ SRI rechazó la factura — revisa Consulta de Facturas');
        } else {
          toast.success('📄 Factura generada y enviada al SRI — ve a Consulta de Facturas para ver el estado');
        }
      } else {
        const err = await res.json();
        if (err.requiere_configuracion) toast.error('Configure la facturación electrónica primero en Facturación → Configuración');
        else toast.error(err.error || 'Error al generar factura');
      }
    } finally {
      setProcesando(false);
      limpiarVenta(true);
    }
  };

  // ─── Productos filtrados ────────────────────────────────────────────────────

  const productosFiltrados = productos.filter(p => {
    const q = busqueda.toLowerCase();
    const matchQ = !q || p.nombre.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q);
    const matchCat = categoriaActiva === 'todos' || p.categoria_id === categoriaActiva;
    return matchQ && matchCat;
  });

  // ─── Render ─────────────────────────────────────────────────────────────────

  // ── Pantalla: caja cerrada ────────────────────────────────────
  if (cargandoCaja) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-[#060f1e] to-[#0A1A2F]">
        <div className="w-10 h-10 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin" />
      </div>
    );
  }

  if (!caja?.abierta) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-[#060f1e] to-[#0A1A2F] p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto">
            <AlertCircle className="w-10 h-10 text-orange-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Caja cerrada</h2>
            <p className="text-gray-400">
              Para comenzar a vender debes <strong className="text-white">abrir la caja</strong> primero.
              Todas las ventas se registran automáticamente en la sesión de caja activa.
            </p>
          </div>
          <div className="bg-[#0A1A2F]/80 border border-orange-500/20 rounded-xl p-4 text-left space-y-2 text-sm text-gray-400">
            <p className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span> Ve a Gestión de Caja</p>
            <p className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span> Abre la caja con el monto inicial</p>
            <p className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span> Vuelve al POS para vender</p>
          </div>
          <div className="flex gap-3">
            <Button
              className="flex-1 bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] font-semibold"
              onClick={() => navigate('/caja')}
            >
              <Wallet className="w-4 h-4 mr-2" /> Ir a Gestión de Caja
            </Button>
            <Button
              variant="outline"
              className="border-white/10 text-gray-400 hover:text-white"
              onClick={() => {
                // Reintentar verificación de caja
                setCargandoCaja(true);
                fetch(`https://${projectId}.supabase.co/functions/v1/server/caja/estado?bodega_id=${bodegaActiva?.id || ''}`, {
                  headers: { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token }
                }).then(r => r.json()).then(d => {
                  const s = d.sesion;
                  setCaja(s?.estado === 'abierta' ? { abierta: true, cajero: s.cajero_nombre, monto_real: s.monto_real } : { abierta: false });
                }).catch(() => setCaja({ abierta: false })).finally(() => setCargandoCaja(false));
              }}
            >
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-[#060f1e] to-[#0A1A2F] overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-none bg-[#0A1A2F]/90 border-b border-[#00E5FF]/20 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">

          {/* Tipo de servicio */}
          <div className="flex rounded-lg overflow-hidden border border-[#00E5FF]/20">
            {(['mesa', 'para_llevar', 'delivery'] as TipoServicio[]).map(t => (
              <button
                key={t}
                onClick={() => { setTipoServicio(t); setMesa(''); }}
                className={`px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  tipoServicio === t
                    ? 'bg-[#00E5FF] text-black'
                    : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                {t === 'mesa' && <Users className="w-3.5 h-3.5" />}
                {t === 'para_llevar' && <Package className="w-3.5 h-3.5" />}
                {t === 'delivery' && <Receipt className="w-3.5 h-3.5" />}
                {t === 'mesa' ? 'Mesa' : t === 'para_llevar' ? 'Para Llevar' : 'Delivery'}
              </button>
            ))}
          </div>

          {/* Mesa selector */}
          {tipoServicio === 'mesa' && (
            <div className="flex items-center gap-2">
              <select
                value={mesa}
                onChange={e => setMesa(e.target.value)}
                className="bg-[#0A1A2F] border border-[#00E5FF]/30 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00E5FF]"
              >
                <option value="">Mesa...</option>
                {MESAS.map(n => <option key={n} value={String(n)}>Mesa {n}</option>)}
              </select>
              {mesa && (
                <span className="bg-[#00E5FF]/20 text-[#00E5FF] font-bold px-3 py-1.5 rounded-lg text-sm border border-[#00E5FF]/30">
                  Mesa {mesa}
                </span>
              )}
            </div>
          )}

          {/* Cliente */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                placeholder="Cliente (opcional)"
                value={cliente}
                onChange={e => setCliente(e.target.value)}
                className="pl-8 bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white placeholder:text-gray-500 h-9 text-sm w-44"
              />
            </div>
          </div>

          {/* Buscar */}
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar producto..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="pl-9 bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white placeholder:text-gray-500 h-9 text-sm"
            />
          </div>

          {/* Estado de la orden */}
          {orden.length > 0 && (
            <Badge className={`text-xs px-2 py-1 ${comandaEnviada ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30'}`}>
              {comandaEnviada ? '✓ En cocina' : '● Pendiente'}
            </Badge>
          )}

          {/* Indicador de caja activa + botón plano de mesas */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 rounded-lg px-2.5 py-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <span className="text-green-400 text-xs font-medium hidden sm:block">Caja abierta</span>
              {caja?.cajero && <span className="text-gray-500 text-xs hidden md:block">· {caja.cajero}</span>}
            </div>
            {searchParams.get('mesa') && (
              <button
                onClick={() => navigate('/mesas')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#00E5FF]/10 border border-[#00E5FF]/30 text-[#00E5FF] text-xs hover:bg-[#00E5FF]/20 transition-all"
              >
                ← Plano de Mesas
              </button>
            )}
            <button
              onClick={cargarDatos}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title="Actualizar"
            >
              <Receipt className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ── Panel izquierdo: Productos ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Categorías */}
          <div className="flex-none px-4 pt-3 pb-2">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setCategoriaActiva('todos')}
                className={`flex-none px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  categoriaActiva === 'todos'
                    ? 'bg-[#00E5FF] text-black'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
              >
                Todo ({productos.length})
              </button>
              {categorias.map(cat => {
                const count = productos.filter(p => p.categoria_id === cat.id).length;
                const active = categoriaActiva === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategoriaActiva(cat.id)}
                    className="flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                    style={{
                      backgroundColor: active ? cat.color : `${cat.color}22`,
                      color: active ? '#000' : cat.color,
                      border: `1px solid ${cat.color}55`,
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active ? '#000' : cat.color }} />
                    {cat.nombre} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid de productos */}
          <ScrollArea className="flex-1 px-4 pb-4">
            {loadingProductos ? (
              <div className="flex items-center justify-center h-48 text-gray-400">
                <div className="text-center">
                  <Utensils className="w-12 h-12 mx-auto mb-3 opacity-20 animate-pulse" />
                  <p>Cargando menú...</p>
                </div>
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400">
                <div className="text-center">
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>Sin resultados</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {productosFiltrados.map(p => {
                  const enOrden = orden.find(i => i.producto.id === p.id);
                  const sinStock = p.stock_actual <= 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => agregarProducto(p)}
                      disabled={sinStock}
                      className={`relative rounded-xl border text-left transition-all duration-150 overflow-hidden group ${
                        sinStock
                          ? 'opacity-40 cursor-not-allowed border-white/10 bg-white/3'
                          : enOrden
                          ? 'border-[#00E5FF]/70 bg-[#00E5FF]/10 hover:bg-[#00E5FF]/15 scale-[1.02]'
                          : 'border-white/10 bg-white/5 hover:border-[#00E5FF]/40 hover:bg-white/8'
                      }`}
                    >
                      {/* Color band */}
                      <div
                        className="h-1.5 w-full"
                        style={{ backgroundColor: p.categorias?.color || '#1e64a7' }}
                      />
                      <div className="p-3">
                        <p className="text-white text-sm font-semibold leading-tight mb-2 line-clamp-2 min-h-[2.5rem]">
                          {p.nombre}
                        </p>
                        <div className="flex items-end justify-between gap-1">
                          <p className="text-[#00E5FF] font-bold text-base">
                            ${(Number(p.precio) || 0).toFixed(2)}
                          </p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            sinStock
                              ? 'bg-red-500/20 text-red-400'
                              : p.stock_actual <= p.stock_minimo
                              ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-green-500/15 text-green-400'
                          }`}>
                            {sinStock ? 'Agotado' : `${p.stock_actual}`}
                          </span>
                        </div>
                        {enOrden && (
                          <div className="mt-2 bg-[#00E5FF] text-black text-xs font-bold rounded-full px-2 py-0.5 text-center">
                            {enOrden.cantidad} en orden
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* ── Panel derecho: Orden ── */}
        <div className="w-[380px] flex-none flex flex-col bg-[#08111e] border-l border-[#00E5FF]/15">

          {/* Header orden */}
          <div className="flex-none px-4 py-3 border-b border-[#00E5FF]/15">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#00E5FF]" />
                <span className="text-white font-semibold">Orden</span>
                {orden.length > 0 && (
                  <span className="bg-[#00E5FF] text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {orden.length}
                  </span>
                )}
              </div>
              {orden.length > 0 && (
                <button
                  onClick={() => { setOrden([]); setComandaEnviada(false); }}
                  className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Limpiar
                </button>
              )}
            </div>
            {/* Resumen mesa/cliente */}
            {(mesa || cliente) && (
              <div className="mt-1.5 flex gap-2 text-xs text-gray-400">
                {mesa && tipoServicio === 'mesa' && <span className="text-[#00E5FF]">Mesa {mesa}</span>}
                {cliente && <span>• {cliente}</span>}
              </div>
            )}
          </div>

          {/* Items */}
          <ScrollArea className="flex-1">
            {orden.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-500 px-6">
                <ShoppingCart className="w-12 h-12 mb-3 opacity-15" />
                <p className="text-sm text-center">Toca un producto para agregarlo a la orden</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {orden.map(item => (
                  <div key={item.producto.id} className="bg-white/5 rounded-xl p-3 border border-white/8">
                    <div className="flex items-start gap-2">
                      {/* Cantidad */}
                      <div className="flex items-center gap-1 bg-[#0A1A2F] rounded-lg p-1 flex-none">
                        <button
                          onClick={() => cambiarCantidad(item.producto.id, -1)}
                          className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-white font-bold text-sm w-6 text-center">{item.cantidad}</span>
                        <button
                          onClick={() => cambiarCantidad(item.producto.id, +1)}
                          className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{item.producto.nombre}</p>
                        <p className="text-xs text-gray-400">${item.precio_unitario.toFixed(2)} c/u</p>
                        {item.notas && (
                          <p className="text-xs text-amber-400 mt-0.5 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> {item.notas}
                          </p>
                        )}
                      </div>

                      {/* Subtotal + acciones */}
                      <div className="flex flex-col items-end gap-1 flex-none">
                        <p className="text-[#00E5FF] font-bold text-sm">${item.subtotal.toFixed(2)}</p>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditandoNota(item.producto.id);
                              setNotaTemp(item.notas);
                            }}
                            className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-amber-400 transition-colors"
                            title="Agregar nota"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => eliminarItem(item.producto.id)}
                            className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Notas generales */}
                <div>
                  <textarea
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    placeholder="Notas generales de la orden..."
                    rows={2}
                    className="w-full text-xs bg-white/3 border border-white/10 rounded-lg p-2 text-gray-300 placeholder:text-gray-600 resize-none focus:outline-none focus:border-[#00E5FF]/30"
                  />
                </div>
              </div>
            )}
          </ScrollArea>

          {/* Totales + acciones */}
          {orden.length > 0 && (
            <div className="flex-none border-t border-[#00E5FF]/15 p-4 space-y-3 bg-[#060f1e]">
              {/* Descuento e IVA */}
              <div className="flex gap-3 items-center">
                <div className="flex items-center gap-1.5 flex-1">
                  <Percent className="w-3.5 h-3.5 text-gray-400" />
                  <Input
                    type="number" min="0" max="100"
                    value={descuento || ''}
                    onChange={e => setDescuento(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    placeholder="Dcto %"
                    className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-gray-600"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aplicarIVA}
                    onChange={e => setAplicarIVA(e.target.checked)}
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                  IVA 15%
                </label>
              </div>

              {/* Resumen */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal</span>
                  <span className="text-white">${subtotal.toFixed(2)}</span>
                </div>
                {descuento > 0 && (
                  <div className="flex justify-between text-gray-400">
                    <span>Descuento ({descuento}%)</span>
                    <span className="text-red-400">-${descuentoVal.toFixed(2)}</span>
                  </div>
                )}
                {aplicarIVA && (
                  <div className="flex justify-between text-gray-400">
                    <span>IVA (15%)</span>
                    <span className="text-white">${ivaVal.toFixed(2)}</span>
                  </div>
                )}
                <Separator className="bg-white/10 my-1" />
                <div className="flex justify-between">
                  <span className="text-white font-bold text-base">TOTAL</span>
                  <span className="text-[#00E5FF] font-bold text-2xl">${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Botones principales */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={handleEnviarCocina}
                  disabled={procesando}
                  className={`h-12 font-bold text-sm ${
                    comandaEnviada
                      ? 'bg-green-700/80 hover:bg-green-700 text-white'
                      : 'bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white'
                  }`}
                >
                  <ChefHat className="w-4 h-4 mr-1.5" />
                  {comandaEnviada ? '✓ Cocina' : 'Enviar Cocina'}
                </Button>
                <Button
                  onClick={handleCobrar}
                  disabled={procesando}
                  className="h-12 font-bold text-sm bg-gradient-to-r from-[#00E5FF] to-[#1e64a7] hover:from-[#00E5FF]/90 hover:to-[#1e64a7]/90 text-white"
                >
                  <DollarSign className="w-4 h-4 mr-1.5" />
                  Cobrar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: Nota por item ── */}
      <Dialog open={!!editandoNota} onOpenChange={() => setEditandoNota(null)}>
        <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-400" /> Nota del item
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              {orden.find(i => i.producto.id === editandoNota)?.producto.nombre}
            </p>
            <textarea
              autoFocus
              value={notaTemp}
              onChange={e => setNotaTemp(e.target.value)}
              placeholder="Ej: Sin cebolla, término medio, sin gluten..."
              rows={3}
              className="w-full bg-white/5 border border-[#00E5FF]/20 rounded-lg p-3 text-white placeholder:text-gray-500 resize-none focus:outline-none focus:border-[#00E5FF]/50 text-sm"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditandoNota(null)}
                className="flex-1 border-white/20 text-white">Cancelar</Button>
              <Button onClick={() => guardarNota(editandoNota!)}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white">Guardar nota</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Comanda enviada (imprimible) ── */}
      <Dialog open={dialogComanda} onOpenChange={setDialogComanda}>
        <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-violet-400" />
              Comanda enviada a cocina
            </DialogTitle>
          </DialogHeader>
          {ultimaComanda && (
            <div className="space-y-4">
              {/* Vista previa de comanda */}
              <div className="bg-white text-black rounded-lg p-4 font-mono text-sm shadow-inner">
                <div className="text-center font-bold text-lg border-b border-black pb-2 mb-3">
                  ★ COMANDA ★
                </div>
                <div className="text-center font-bold text-base mb-1">
                  {ultimaComanda.tipo_servicio === 'mesa'
                    ? `Mesa ${ultimaComanda.mesa}`
                    : ultimaComanda.tipo_servicio === 'para_llevar'
                    ? 'Para Llevar'
                    : 'Delivery'}
                </div>
                {ultimaComanda.cliente && (
                  <div className="text-center text-sm mb-2">Cliente: {ultimaComanda.cliente}</div>
                )}
                <div className="border-t border-dashed border-black pt-2 mb-2 flex justify-between text-xs">
                  <span>Orden: <b>{ultimaComanda.numero_orden}</b></span>
                  <span>{ultimaComanda.fecha.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="space-y-2">
                  {ultimaComanda.items.map((item: ItemOrden) => (
                    <div key={item.producto.id}>
                      <div className="font-bold">{item.cantidad}x {item.producto.nombre}</div>
                      {item.notas && (
                        <div className="text-xs ml-4 italic text-gray-600">⚑ {item.notas}</div>
                      )}
                    </div>
                  ))}
                </div>
                {ultimaComanda.notas && (
                  <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
                    <b>Notas:</b> {ultimaComanda.notas}
                  </div>
                )}
                <div className="text-center text-xs mt-3 border-t border-black pt-2">
                  *** COCINA ***
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => imprimirComanda(ultimaComanda)}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-bold"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir Comanda
                </Button>
                <Button
                  onClick={() => setDialogComanda(false)}
                  variant="outline"
                  className="flex-1 border-white/20 text-white"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Pago ── */}
      <Dialog open={dialogPago} onOpenChange={v => { if (!procesando) setDialogPago(v); }}>
        <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#00E5FF]" />
              Cobrar Orden
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Total grande */}
            <div className="bg-gradient-to-r from-[#00E5FF]/10 to-[#1e64a7]/10 border border-[#00E5FF]/20 rounded-xl p-4 text-center">
              {mesa && tipoServicio === 'mesa' && <p className="text-gray-400 text-sm mb-1">Mesa {mesa}</p>}
              <p className="text-gray-400 text-sm">Total a cobrar</p>
              <p className="text-[#00E5FF] text-4xl font-bold mt-1">${total.toFixed(2)}</p>
            </div>

            {/* Método de pago */}
            <div>
              <p className="text-white text-sm font-medium mb-2">Método de pago</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                  { id: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
                  { id: 'transferencia', label: 'Transferencia', icon: DollarSign },
                ] as const).map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMetodoPago(m.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                      metodoPago === m.id
                        ? 'bg-[#00E5FF] border-[#00E5FF] text-black'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:border-[#00E5FF]/40'
                    }`}
                  >
                    <m.icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Monto recibido (efectivo) */}
            {metodoPago === 'efectivo' && (
              <div>
                <Label className="text-white text-sm font-medium block mb-2">Monto recibido</Label>
                <Input
                  type="number" step="0.01" autoFocus
                  value={montoRecibido}
                  onChange={e => setMontoRecibido(e.target.value)}
                  placeholder="0.00"
                  className="bg-white/5 border-[#00E5FF]/20 text-white text-xl h-12 text-center font-bold"
                />
                {/* Atajos rápidos */}
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[1, 5, 10, 20, 50, 100, Math.ceil(total), Math.ceil(total / 5) * 5].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8).map(v => (
                    <button key={v} onClick={() => setMontoRecibido(String(v))}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs rounded-lg py-1.5 transition-colors">
                      ${v}
                    </button>
                  ))}
                </div>
                {montoRecibido && parseFloat(montoRecibido) >= total && (
                  <div className="mt-3 bg-green-500/15 border border-green-500/30 rounded-xl p-3 text-center">
                    <p className="text-green-400 text-xs">Cambio a entregar</p>
                    <p className="text-green-300 text-3xl font-bold">${cambio.toFixed(2)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Resumen items */}
            <div className="bg-white/3 border border-white/8 rounded-xl p-3 max-h-36 overflow-auto">
              <p className="text-gray-500 text-xs mb-2">{orden.length} item(s):</p>
              {orden.map(i => (
                <div key={i.producto.id} className="flex justify-between text-sm py-0.5">
                  <span className="text-gray-300">{i.cantidad}× {i.producto.nombre}</span>
                  <span className="text-gray-400">${i.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogPago(false)} disabled={procesando}
                className="flex-1 border-white/20 text-white">
                Cancelar
              </Button>
              <Button
                onClick={confirmarPago}
                disabled={procesando || (metodoPago === 'efectivo' && (!montoRecibido || parseFloat(montoRecibido) < total))}
                className="flex-1 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold h-11"
              >
                {procesando ? (
                  <span className="flex items-center gap-2"><Clock className="w-4 h-4 animate-spin" /> Procesando...</span>
                ) : (
                  <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Confirmar Pago</span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Datos cliente / Factura ── */}
      <DatosClienteDialog
        open={dialogDatosCliente}
        onOpenChange={setDialogDatosCliente}
        onConfirmar={generarFactura}
        onOmitir={() => { setDialogDatosCliente(false); toast.info('Venta completada sin factura'); limpiarVenta(true); }}
      />

      {/* ── Modal: RIDE ── */}
      <Dialog open={dialogRIDE} onOpenChange={setDialogRIDE}>
        <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/20 max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#00E5FF]" />
              Factura Electrónica
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {facturaGenerada && (
              <div className="overflow-y-auto max-h-[calc(90vh-160px)]">
                <RIDE factura={facturaGenerada} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-[#00E5FF]/20">
              <Button onClick={() => window.print()}
                className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white">
                <Printer className="w-4 h-4 mr-2" /> Imprimir
              </Button>
              <Button variant="outline" onClick={() => setDialogRIDE(false)}
                className="border-white/20 text-white">
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
