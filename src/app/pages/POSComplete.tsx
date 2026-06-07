import { useState, useEffect, useRef } from 'react';
import { cssTermico, printHtml, esc } from '../utils/printThermal';
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
  MessageSquare, X, ChefHat, Clock, Users, Package, AlertCircle, ClipboardList,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock_actual: number | null; // null = receta sin gestión de inventario (ilimitado)
  stock_minimo: number;
  disponible: boolean;
  categoria_id?: string;
  categorias?: { id: string; nombre: string; color: string };
  es_receta?: boolean;
  gestiona_inventario?: boolean;
  porcentaje_iva?: number;      // 0, 5, 8, 15, etc.
  impuesto_incluido?: boolean;  // true = precio ya incluye IVA
}

interface ItemOrden {
  producto: Producto;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  notas: string;
  descuento_item: number; // % de descuento individual por producto
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
  // Detectar ancho de papel desde configuración local (default 58mm)
  const ancho = (parseInt(localStorage.getItem('print_ancho') || '58') as 58 | 80) === 80 ? 80 : 58;

  const tipoLabel = comanda.tipo_servicio === 'mesa'
    ? `Mesa ${comanda.mesa}`
    : comanda.tipo_servicio === 'para_llevar'
    ? 'Para Llevar'
    : 'Delivery';

  const hora = comanda.fecha.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const fecha = comanda.fecha.toLocaleDateString('es-EC');

  const itemsHtml = comanda.items.map(item => `
    <div class="item" style="margin:3px 0;">
      <div class="row">
        <span class="bold" style="font-size:${ancho===58?'12px':'13px'}">${item.cantidad}x ${esc(item.producto.nombre)}</span>
      </div>
      ${item.notas ? `<div style="font-style:italic;font-size:9px;margin-left:10px;color:#333;">⚑ ${esc(item.notas)}</div>` : ''}
    </div>
  `).join('');

  const html = `
    <div class="huge" style="border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:5px;">
      ★ COMANDA ★
    </div>
    <div class="c bold" style="font-size:${ancho===58?'13px':'15px'};margin-bottom:2px;">${esc(tipoLabel)}</div>
    ${comanda.cliente ? `<div class="c" style="font-size:9px;">Cliente: ${esc(comanda.cliente)}</div>` : ''}
    <div class="sep"></div>
    <div class="row"><span class="lbl">Orden:</span><span class="val bold">${esc(comanda.numero_orden)}</span></div>
    <div class="row"><span class="lbl">Fecha:</span><span class="val">${fecha}</span></div>
    <div class="row"><span class="lbl">Hora:</span><span class="val bold">${hora}</span></div>
    <div class="sep"></div>
    <div class="bold" style="margin-bottom:3px;">ITEMS:</div>
    ${itemsHtml}
    ${comanda.notas ? `
      <div class="sep"></div>
      <div style="border:1px dashed #000;padding:3px;">
        <div class="bold">Notas:</div>
        <div style="font-size:9px;">${esc(comanda.notas)}</div>
      </div>
    ` : ''}
    <div class="sep"></div>
    <div class="c sm">★★★ COCINA ★★★</div>
    <div class="feed"></div>
  `;

  printHtml(html, `Comanda ${comanda.numero_orden}`, ancho);
}

// ─── Pre-cuenta Print ────────────────────────────────────────────────────────

function imprimirPreCuenta(datos: {
  tipo_servicio: TipoServicio;
  mesa?: string;
  cliente?: string;
  items: ItemOrden[];
  notas?: string;
  descuento: number;
  descuentoVal: number;
  subtotalBase: number;
  ivaVal: number;
  total: number;
  aplicarIVA: boolean;
}) {
  const ancho = (parseInt(localStorage.getItem('print_ancho') || '58') as 58 | 80) === 80 ? 80 : 58;
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const fecha = ahora.toLocaleDateString('es-EC');

  const tipoLabel = datos.tipo_servicio === 'mesa'
    ? `Mesa ${datos.mesa}`
    : datos.tipo_servicio === 'para_llevar'
    ? 'Para Llevar'
    : 'Delivery';

  const itemsHtml = datos.items.map(item => `
    <div class="row" style="margin:2px 0;font-size:${ancho===58?'11px':'12px'}">
      <span>${item.cantidad}x ${esc(item.producto.nombre)}</span>
      <span>$${item.subtotal.toFixed(2)}</span>
    </div>
    ${item.descuento_item > 0 ? `<div style="font-size:9px;color:#555;margin-left:10px;">Dcto ${item.descuento_item}%</div>` : ''}
  `).join('');

  const descuentoHtml = datos.descuento > 0
    ? `<div class="row" style="font-size:10px;color:#555;"><span>Descuento (${datos.descuento}%)</span><span>-$${datos.descuentoVal.toFixed(2)}</span></div>`
    : '';

  const ivaHtml = datos.aplicarIVA && datos.ivaVal > 0
    ? `<div class="row" style="font-size:10px;"><span>IVA</span><span>$${datos.ivaVal.toFixed(2)}</span></div>`
    : '';

  const html = `
    <div class="huge" style="border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:5px;">
      PRE-CUENTA
    </div>
    <div class="c bold" style="font-size:${ancho===58?'12px':'14px'};margin-bottom:2px;">${esc(tipoLabel)}</div>
    ${datos.cliente ? `<div class="c" style="font-size:9px;">Cliente: ${esc(datos.cliente)}</div>` : ''}
    <div class="sep"></div>
    <div class="row"><span class="lbl">Fecha:</span><span class="val">${fecha}</span></div>
    <div class="row"><span class="lbl">Hora:</span><span class="val">${hora}</span></div>
    <div class="sep"></div>
    <div class="bold" style="margin-bottom:3px;font-size:10px;">DETALLE:</div>
    ${itemsHtml}
    <div class="sep"></div>
    <div class="row" style="font-size:10px;"><span>Subtotal</span><span>$${datos.subtotalBase.toFixed(2)}</span></div>
    ${descuentoHtml}
    ${ivaHtml}
    <div class="sep"></div>
    <div class="row bold" style="font-size:${ancho===58?'14px':'16px'};">
      <span>TOTAL</span><span>$${datos.total.toFixed(2)}</span>
    </div>
    <div class="sep"></div>
    <div class="c sm" style="font-style:italic;margin-top:4px;">Este documento no es un comprobante fiscal.</div>
    <div class="c sm">Solicite su factura al momento del pago.</div>
    <div class="feed"></div>
  `;

  printHtml(html, 'Pre-cuenta', ancho);
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

  // Orden — se recupera de sessionStorage para sobrevivir recargas accidentales
  const [orden, setOrden] = useState<ItemOrden[]>(() => {
    try {
      const saved = sessionStorage.getItem('pos_orden_draft');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [tipoServicio, setTipoServicio] = useState<TipoServicio>(() => {
    try { return (sessionStorage.getItem('pos_tipo_servicio') as TipoServicio) || 'mesa'; } catch { return 'mesa'; }
  });
  const [mesa, setMesa] = useState(() => {
    try { return sessionStorage.getItem('pos_mesa') || ''; } catch { return ''; }
  });
  const [cliente, setCliente] = useState(() => {
    try { return sessionStorage.getItem('pos_cliente') || ''; } catch { return ''; }
  });
  const [notas, setNotas] = useState('');
  const [descuento, setDescuento] = useState(0);
  const [aplicarIVA, setAplicarIVA] = useState(true);
  const [costoEnvio, setCostoEnvio] = useState(0);
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
  const [autoImprimirRIDE, setAutoImprimirRIDE] = useState(false);
  const [generandoFactura, setGenerandoFactura] = useState(false);
  // Polling SRI en background (id de la factura pendiente, null = no pollear)
  const [sriPollingId, setSriPollingId] = useState<string | null>(null);
  const sriPollingCancelled = useRef(false);

  // Vista móvil: alternar entre productos y orden
  const [vistaMovil, setVistaMovil] = useState<'productos' | 'orden'>('productos');

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
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          return;
        }
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

  // ── Persistir carrito en sessionStorage (sobrevive recargas) ─
  useEffect(() => {
    try { sessionStorage.setItem('pos_orden_draft', JSON.stringify(orden)); } catch { /* sin acceso a storage */ }
  }, [orden]);
  useEffect(() => {
    try { sessionStorage.setItem('pos_tipo_servicio', tipoServicio); } catch { /* */ }
  }, [tipoServicio]);
  useEffect(() => {
    try { sessionStorage.setItem('pos_mesa', mesa); } catch { /* */ }
  }, [mesa]);
  useEffect(() => {
    try { sessionStorage.setItem('pos_cliente', cliente); } catch { /* */ }
  }, [cliente]);

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
      setProductos(data.productos || []);
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
      setCategorias(data.categorias || []);
    } catch { /* silencioso */ }
  };

  // ─── Orden ─────────────────────────────────────────────────────────────────

  // true cuando el producto es receta pura (sin gestión de stock físico)
  const esRecetaLibre = (p: Producto) => p.es_receta === true && p.gestiona_inventario !== true;

  const agregarProducto = (p: Producto) => {
    if (!p.disponible) return toast.error('Producto no disponible');
    // Recetas libres (null stock) no tienen restricción de stock
    if (!esRecetaLibre(p) && (p.stock_actual ?? 0) <= 0) return toast.error('Sin stock');
    setOrden(prev => {
      const idx = prev.findIndex(i => i.producto.id === p.id);
      if (idx >= 0) {
        if (!esRecetaLibre(p) && prev[idx].cantidad >= (p.stock_actual ?? 0)) {
          toast.error('Stock insuficiente'); return prev;
        }
        return prev.map((i, n) => n === idx
          ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio_unitario * (1 - (i.descuento_item || 0) / 100) }
          : i);
      }
      const precio = Number(p.precio) || 0;
      return [...prev, { producto: p, cantidad: 1, precio_unitario: precio, subtotal: precio, notas: '', descuento_item: 0 }];
    });
    setComandaEnviada(false);
    toast.success(`${p.nombre} agregado`, { duration: 800 });
    // En mobile: ir automáticamente a la vista de orden
    if (window.innerWidth < 768) setVistaMovil('orden');
  };

  const cambiarCantidad = (productoId: string, delta: number) => {
    setOrden(prev => prev.flatMap(i => {
      if (i.producto.id !== productoId) return [i];
      const nueva = i.cantidad + delta;
      if (nueva <= 0) return [];
      if (!esRecetaLibre(i.producto) && nueva > (i.producto.stock_actual ?? 0)) {
        toast.error('Stock insuficiente'); return [i];
      }
      return [{ ...i, cantidad: nueva, subtotal: nueva * i.precio_unitario * (1 - (i.descuento_item || 0) / 100) }];
    }));
    setComandaEnviada(false);
  };

  const eliminarItem = (productoId: string) =>
    setOrden(prev => prev.filter(i => i.producto.id !== productoId));

  const cambiarDescuentoItem = (productoId: string, pct: number) => {
    const pctVal = Math.min(100, Math.max(0, pct || 0));
    setOrden(prev => prev.map(i => {
      if (i.producto.id !== productoId) return i;
      const nuevoSubtotal = i.cantidad * i.precio_unitario * (1 - pctVal / 100);
      return { ...i, descuento_item: pctVal, subtotal: nuevoSubtotal };
    }));
  };

  const guardarNota = (productoId: string) => {
    setOrden(prev => prev.map(i =>
      i.producto.id === productoId ? { ...i, notas: notaTemp } : i
    ));
    setEditandoNota(null);
    setNotaTemp('');
  };

  // subtotalBruto = suma de precios × cantidades (el precio puede incluir IVA o no)
  const subtotalBruto = orden.reduce((s, i) => s + i.subtotal, 0);
  const descuentoVal = (subtotalBruto * descuento) / 100;

  // Desglose por ítem: separa base sin IVA y el IVA de cada producto.
  // impuesto_incluido=true  → extrae IVA del precio: IVA = precio × pct/(100+pct)
  // impuesto_incluido=false → añade IVA sobre la base: IVA = base × pct/100
  const { subtotalBase, ivaVal } = (() => {
    if (!aplicarIVA) {
      return { subtotalBase: subtotalBruto - descuentoVal, ivaVal: 0 };
    }
    return orden.reduce(
      (acc, item) => {
        const p = item.producto;
        const pct = (p.porcentaje_iva ?? 0) > 0 ? (p.porcentaje_iva ?? 0) : 15;
        const lineaConDescuento = item.subtotal * (1 - descuento / 100);
        if (p.impuesto_incluido) {
          // El precio ya lleva IVA → extraerlo
          const ivaExtraido = lineaConDescuento * pct / (100 + pct);
          return { subtotalBase: acc.subtotalBase + (lineaConDescuento - ivaExtraido), ivaVal: acc.ivaVal + ivaExtraido };
        } else {
          // El precio es base → calcular IVA encima
          return { subtotalBase: acc.subtotalBase + lineaConDescuento, ivaVal: acc.ivaVal + lineaConDescuento * pct / 100 };
        }
      },
      { subtotalBase: 0, ivaVal: 0 }
    );
  })();

  // Total = base sin IVA + IVA desglosado + delivery (matemáticamente idéntico al total anterior)
  const total = parseFloat((subtotalBase + ivaVal + (tipoServicio === 'delivery' ? costoEnvio : 0)).toFixed(2));

  // hayIVAIncluido: true si algún ítem tiene el precio con IVA ya adentro
  const hayIVAIncluido = aplicarIVA && orden.some(i => i.producto.impuesto_incluido);
  const cambio = metodoPago === 'efectivo' && montoRecibido
    ? Math.max(0, parseFloat(montoRecibido) - total) : 0;

  // ─── Enviar a cocina ────────────────────────────────────────────────────────

  const generarNumeroOrden = () => {
    // base36 timestamp + 3-char random suffix → colisión prácticamente imposible
    const ts  = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
    return tipoServicio === 'mesa' ? `M${mesa || '?'}-${ts}${rnd}` : `TL-${ts}${rnd}`;
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
      // Log del error para diagnóstico
      const errData = await res.json().catch(() => ({}));
      console.error('❌ [enviarCocina] HTTP', res.status, errData);
    } catch (e: any) {
      console.error('❌ [enviarCocina] Error de red:', e.message);
    }
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
    const totalRedondeado = parseFloat(total.toFixed(2));
    if (metodoPago === 'efectivo' && (!montoRecibido || parseFloat(montoRecibido) < totalRedondeado)) {
      return toast.error('Monto recibido insuficiente');
    }
    setProcesando(true);
    const mesaOrigen = tipoServicio === 'mesa' ? mesa : null;
    try {
      // Si no se ha enviado a cocina aún, enviar ahora
      let numero_orden = generarNumeroOrden();
      if (!comandaEnviada) {
        const n = await enviarCocina();
        if (n) {
          numero_orden = n;
          setComandaEnviada(true);
        } else {
          // Avisar al usuario que la comanda no llegó a cocina
          toast.warning('⚠️ Venta registrada pero no se pudo enviar la comanda a cocina. Usa "Enviar Cocina" manualmente.', { duration: 6000 });
        }
      }

      const items = orden.map(i => ({
        producto_id: i.producto.id,
        nombre: i.producto.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        descuento_item: i.descuento_item || 0,
        subtotal: i.subtotal,
        notas: i.notas || undefined,
      }));

      const ventaBody = {
        numero_ticket: numero_orden,
        fecha: new Date().toISOString(),
        items,
        subtotal: parseFloat(subtotalBase.toFixed(2)),
        descuento: parseFloat(descuentoVal.toFixed(2)),
        impuestos: parseFloat(ivaVal.toFixed(2)),
        costo_envio: tipoServicio === 'delivery' ? costoEnvio : 0,
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
    // Limpiar sessionStorage — venta completada, no restaurar borrador
    try {
      sessionStorage.removeItem('pos_orden_draft');
      sessionStorage.removeItem('pos_tipo_servicio');
      sessionStorage.removeItem('pos_mesa');
      sessionStorage.removeItem('pos_cliente');
    } catch { /* */ }
    // Si venía del plano de mesas, volver al plano
    if (volverAMesas && searchParams.get('mesa')) {
      navigate('/mesas');
    }
  };

  // ── Polling SRI en background ────────────────────────────────────────────────
  // Se activa cuando sriPollingId tiene valor y el diálogo RIDE está abierto.
  // Consulta el estado de autorización cada 5s hasta 60s o hasta que el SRI responda.
  useEffect(() => {
    if (!sriPollingId || !dialogRIDE) return;

    sriPollingCancelled.current = false;
    let attempts = 0;
    const MAX = 12; // 12 × 5s = 60s máximo
    let timerId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (sriPollingCancelled.current || attempts >= MAX) {
        // Agotamos intentos — mantener PENDIENTE, avisar al usuario
        if (!sriPollingCancelled.current) {
          toast.dismiss('sri-bg');
          toast.warning('⏱ SRI aún no responde — usa "Reintentar" en Consulta de Facturas', { duration: 6000 });
          setSriPollingId(null);
        }
        return;
      }
      attempts++;

      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/facturacion/facturas/${sriPollingId}/autorizar`,
          { method: 'POST', headers: apiHeaders(token), body: JSON.stringify({ factura_id: sriPollingId }) }
        );
        if (res.ok) {
          const data = await res.json();
          const f = data.factura;
          if (f && f.estado !== 'PENDIENTE') {
            if (!sriPollingCancelled.current) {
              setFacturaGenerada(f);
              setSriPollingId(null);
              toast.dismiss('sri-bg');
              if (f.estado === 'AUTORIZADO') {
                toast.success('✅ Factura AUTORIZADA por el SRI');
                setAutoImprimirRIDE(true); // imprimir ahora que está autorizada
              } else {
                toast.error('❌ El SRI no autorizó la factura — revisa Consulta de Facturas');
              }
            }
            return;
          }
        }
      } catch { /* ignorar errores de red y reintentar */ }

      if (!sriPollingCancelled.current) {
        timerId = setTimeout(poll, 5000);
      }
    };

    // Primer intento a los 5s (dar tiempo al SRI)
    timerId = setTimeout(poll, 5000);

    return () => {
      sriPollingCancelled.current = true;
      clearTimeout(timerId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sriPollingId, dialogRIDE]);

  const generarFactura = async (datosCliente: DatosCliente) => {
    if (!ventaCompletada) return;
    setProcesando(true);
    setGenerandoFactura(true);
    setDialogDatosCliente(false);

    try {
      // ── 1. Generar factura en el backend ───────────────────────────────────
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

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.requiere_configuracion) toast.error('Configure la facturación electrónica en Facturación → Configuración');
        else toast.error(err.error || 'Error al generar factura');
        limpiarVenta(true);
        return;
      }

      const data = await res.json();
      const factura = data.factura;
      const facturaId: string = data.factura_id || factura?.id || '';

      // ── 2. Mostrar RIDE de inmediato (incluso si está PENDIENTE) ───────────
      setFacturaGenerada(factura);
      setDialogRIDE(true);

      if (factura.estado === 'AUTORIZADO') {
        // Ya está autorizada — imprimir de una vez
        toast.success('✅ Factura AUTORIZADA por el SRI');
        setAutoImprimirRIDE(true);
      } else if (factura.estado === 'NO_AUTORIZADO') {
        toast.error('❌ El SRI no autorizó la factura');
      } else {
        // PENDIENTE — iniciar polling silencioso en background
        toast.loading('⏳ Consultando autorización SRI…', { id: 'sri-bg', duration: 65000 });
        setSriPollingId(facturaId);
      }

      // ── 3. Auto-enviar email en background (si tiene correo) ──────────────
      const emailCliente = datosCliente.email || factura.cliente_email || '';
      if (emailCliente && facturaId) {
        fetch(
          `https://${projectId}.supabase.co/functions/v1/server/facturacion/reenviar-email`,
          { method: 'POST', headers: apiHeaders(token), body: JSON.stringify({ factura_id: facturaId, destinatario: emailCliente }) }
        )
          .then(r => r.json())
          .then(r => { if (r.success) toast.success(`📧 Factura enviada a ${emailCliente}`, { duration: 4000 }); })
          .catch(() => { /* silencioso */ });
      }

    } finally {
      setProcesando(false);
      setGenerandoFactura(false);
    }
  };

  /** Cierra el RIDE, cancela polling y limpia la venta */
  const cerrarRIDE = () => {
    sriPollingCancelled.current = true;
    setSriPollingId(null);
    toast.dismiss('sri-bg');
    setDialogRIDE(false);
    setAutoImprimirRIDE(false);
    setFacturaGenerada(null);
    limpiarVenta(true);
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
      <div className="h-full flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin" />
      </div>
    );
  }

  if (!caja?.abierta) {
    return (
      <div className="h-full flex items-center justify-center bg-white p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto">
            <AlertCircle className="w-10 h-10 text-orange-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Caja cerrada</h2>
            <p className="text-gray-600">
              Para comenzar a vender debes <strong className="text-gray-900">abrir la caja</strong> primero.
              Todas las ventas se registran automáticamente en la sesión de caja activa.
            </p>
          </div>
          <div className="bg-white border border-orange-500/20 rounded-xl p-4 text-left space-y-2 text-sm text-gray-600">
            <p className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span> Ve a Gestión de Caja</p>
            <p className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span> Abre la caja con el monto inicial</p>
            <p className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span> Vuelve al POS para vender</p>
          </div>
          <div className="flex gap-3">
            <Button
              className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316] font-semibold"
              onClick={() => navigate('/caja')}
            >
              <Wallet className="w-4 h-4 mr-2" /> Ir a Gestión de Caja
            </Button>
            <Button
              variant="outline"
              className="border-gray-100 text-gray-600 hover:text-gray-900"
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
    <div className="h-full flex flex-col bg-white overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-none bg-white border-b border-[#F97316]/20 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">

          {/* Tipo de servicio */}
          <div className="flex rounded-lg overflow-hidden border border-[#F97316]/20">
            {(['mesa', 'para_llevar', 'delivery'] as TipoServicio[]).map(t => (
              <button
                key={t}
                onClick={() => { setTipoServicio(t); setMesa(''); }}
                className={`px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  tipoServicio === t
                    ? 'bg-[#F97316] text-black'
                    : 'text-gray-600 hover:bg-gray-50'
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
                className="bg-white border border-[#F97316]/30 text-gray-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F97316]"
              >
                <option value="">Mesa...</option>
                {MESAS.map(n => <option key={n} value={String(n)}>Mesa {n}</option>)}
              </select>
              {mesa && (
                <span className="bg-[#F97316]/20 text-[#F97316] font-bold px-3 py-1.5 rounded-lg text-sm border border-[#F97316]/30">
                  Mesa {mesa}
                </span>
              )}
            </div>
          )}

          {/* Cliente */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
              <Input
                placeholder="Cliente (opcional)"
                value={cliente}
                onChange={e => setCliente(e.target.value)}
                className="pl-8 bg-white border-[#F97316]/20 text-gray-900 placeholder:text-gray-400 h-9 text-sm w-44"
              />
            </div>
          </div>

          {/* Buscar */}
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <Input
              placeholder="Buscar producto..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="pl-9 bg-white border-[#F97316]/20 text-gray-900 placeholder:text-gray-400 h-9 text-sm"
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
              {caja?.cajero && <span className="text-gray-600 text-xs hidden md:block">· {caja.cajero}</span>}
            </div>
            {searchParams.get('mesa') && (
              <button
                onClick={() => navigate('/mesas')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F97316]/10 border border-[#F97316]/30 text-[#F97316] text-xs hover:bg-[#F97316]/20 transition-all"
              >
                ← Plano de Mesas
              </button>
            )}
            <button
              onClick={cargarDatos}
              className="text-gray-600 hover:text-gray-900 transition-colors p-1"
              title="Actualizar"
            >
              <Receipt className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab bar mobile (solo visible en sm) ── */}
      <div className="md:hidden flex-none flex border-b border-[#F97316]/15 bg-gray-50">
        <button
          onClick={() => setVistaMovil('productos')}
          className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            vistaMovil === 'productos'
              ? 'text-[#F97316] border-b-2 border-[#F97316]'
              : 'text-gray-600'
          }`}
        >
          <Package className="w-4 h-4" />
          Productos
        </button>
        <button
          onClick={() => setVistaMovil('orden')}
          className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            vistaMovil === 'orden'
              ? 'text-[#F97316] border-b-2 border-[#F97316]'
              : 'text-gray-600'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Orden
          {orden.length > 0 && (
            <span className="bg-[#F97316] text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {orden.length}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ── Panel izquierdo: Productos ── */}
        <div className={`flex-1 flex flex-col overflow-hidden ${vistaMovil === 'orden' ? 'hidden md:flex' : 'flex'}`}>

          {/* Categorías */}
          <div className="flex-none px-4 pt-3 pb-2">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setCategoriaActiva('todos')}
                className={`flex-none px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  categoriaActiva === 'todos'
                    ? 'bg-[#F97316] text-black'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
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
              <div className="flex items-center justify-center h-48 text-gray-600">
                <div className="text-center">
                  <Utensils className="w-12 h-12 mx-auto mb-3 opacity-20 animate-pulse" />
                  <p>Cargando menú...</p>
                </div>
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-600">
                <div className="text-center">
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>Sin resultados</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {productosFiltrados.map(p => {
                  const enOrden = orden.find(i => i.producto.id === p.id);
                  const esReceta = esRecetaLibre(p);
                  const sinStock = !esReceta && (p.stock_actual ?? 0) <= 0;
                  const tieneIVA = (p.porcentaje_iva ?? 0) > 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => agregarProducto(p)}
                      disabled={sinStock}
                      className={`relative rounded-xl border text-left transition-all duration-150 overflow-hidden group ${
                        sinStock
                          ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
                          : enOrden
                          ? 'border-[#F97316]/70 bg-[#F97316]/10 hover:bg-[#F97316]/15 scale-[1.02]'
                          : 'border-gray-100 bg-gray-50 hover:border-[#F97316]/40 hover:bg-gray-100'
                      }`}
                    >
                      {/* Color band */}
                      <div
                        className="h-1.5 w-full"
                        style={{ backgroundColor: p.categorias?.color || '#C2410C' }}
                      />
                      <div className="p-3">
                        <p className="text-gray-900 text-sm font-semibold leading-tight mb-2 line-clamp-2 min-h-[2.5rem]">
                          {p.nombre}
                        </p>
                        <div className="flex items-end justify-between gap-1">
                          <div>
                            <p className="text-[#F97316] font-bold text-base">
                              ${(Number(p.precio) || 0).toFixed(2)}
                            </p>
                            {tieneIVA && (
                              <span className="text-[10px] text-yellow-400/80 leading-none">
                                {p.impuesto_incluido ? 'IVA inc.' : `+${p.porcentaje_iva}% IVA`}
                              </span>
                            )}
                          </div>
                          {/* Badge de stock o tipo */}
                          {esReceta ? (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                              Receta
                            </span>
                          ) : (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              sinStock
                                ? 'bg-red-500/20 text-red-400'
                                : (p.stock_actual ?? 0) <= p.stock_minimo
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-green-500/15 text-green-400'
                            }`}>
                              {sinStock ? 'Agotado' : `${p.stock_actual}`}
                            </span>
                          )}
                        </div>
                        {enOrden && (
                          <div className="mt-2 bg-[#F97316] text-black text-xs font-bold rounded-full px-2 py-0.5 text-center">
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

        {/* ── Panel derecho: Orden (sidebar scrollable) ── */}
        <div className={`
          w-full md:w-[340px] lg:w-[380px] flex-none flex flex-col bg-gray-50 border-l border-[#F97316]/15 overflow-hidden
          ${vistaMovil === 'productos' ? 'hidden md:flex' : 'flex'}
        `}>

          {/* Header orden — sticky arriba */}
          <div className="flex-none px-4 py-3 border-b border-[#F97316]/15 bg-gray-50 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#F97316]" />
                <span className="text-gray-900 font-semibold">Orden</span>
                {orden.length > 0 && (
                  <span className="bg-[#F97316] text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {orden.length}
                  </span>
                )}
              </div>
              {orden.length > 0 && (
                <button
                  onClick={() => {
                    setOrden([]); setComandaEnviada(false);
                    try { sessionStorage.removeItem('pos_orden_draft'); } catch { /* */ }
                  }}
                  className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Limpiar
                </button>
              )}
            </div>
            {(mesa || cliente) && (
              <div className="mt-1.5 flex gap-2 text-xs text-gray-600">
                {mesa && tipoServicio === 'mesa' && <span className="text-[#F97316]">Mesa {mesa}</span>}
                {cliente && <span>• {cliente}</span>}
              </div>
            )}
          </div>

          {/* Contenido scrollable: items + totales + botones */}
          <div className="flex-1 overflow-y-auto">
            {orden.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-600 px-6">
                <ShoppingCart className="w-12 h-12 mb-3 opacity-15" />
                <p className="text-sm text-center">Toca un producto para agregarlo a la orden</p>
              </div>
            ) : (
              <>
                {/* Items */}
                <div className="p-3 space-y-2">
                  {orden.map(item => (
                    <div key={item.producto.id} className="bg-white rounded-xl p-3 border border-gray-100">
                      <div className="flex items-start gap-2">
                        {/* Cantidad */}
                        <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1 flex-none">
                          <button
                            onClick={() => cambiarCantidad(item.producto.id, -1)}
                            className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-gray-900 font-bold text-sm w-6 text-center">{item.cantidad}</span>
                          <button
                            onClick={() => cambiarCantidad(item.producto.id, +1)}
                            className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 text-sm font-medium truncate">{item.producto.nombre}</p>
                          <p className="text-xs text-gray-600">${item.precio_unitario.toFixed(2)} c/u</p>
                          {item.notas && (
                            <p className="text-xs text-amber-400 mt-0.5 flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" /> {item.notas}
                            </p>
                          )}
                        </div>

                        {/* Subtotal + acciones */}
                        <div className="flex flex-col items-end gap-1 flex-none">
                          <p className="text-[#F97316] font-bold text-sm">${item.subtotal.toFixed(2)}</p>
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setEditandoNota(item.producto.id); setNotaTemp(item.notas); }}
                              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-amber-400 transition-colors"
                              title="Agregar nota"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => eliminarItem(item.producto.id)}
                              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* Descuento por ítem */}
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                        <span className="text-xs text-gray-600 whitespace-nowrap flex items-center gap-1">
                          <Percent className="w-3 h-3" /> Dcto:
                        </span>
                        <input
                          type="number" min="0" max="100" step="1"
                          value={item.descuento_item || ''}
                          onChange={e => cambiarDescuentoItem(item.producto.id, Number(e.target.value))}
                          placeholder="0"
                          className="w-16 h-7 text-sm bg-gray-100 border border-amber-400/40 rounded px-2 text-amber-300 placeholder:text-gray-400 focus:outline-none focus:border-amber-400"
                        />
                        <span className="text-xs text-gray-600">%</span>
                        {(item.descuento_item || 0) > 0 && (
                          <span className="text-xs text-amber-400 font-bold ml-auto">
                            -{item.descuento_item}% = -${(item.precio_unitario * item.cantidad * (item.descuento_item / 100)).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Notas generales */}
                  <textarea
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    placeholder="Notas generales de la orden..."
                    rows={2}
                    className="w-full text-xs bg-white border border-gray-100 rounded-lg p-2 text-gray-600 placeholder:text-gray-400 resize-none focus:outline-none focus:border-[#F97316]/30"
                  />
                </div>

                {/* Totales + botones */}
                <div className="border-t border-[#F97316]/15 p-4 space-y-3 bg-gray-50">
                  {/* Descuento global e IVA */}
                  <div className="flex gap-3 items-center">
                    <div className="flex items-center gap-1.5 flex-1">
                      <Percent className="w-3.5 h-3.5 text-gray-600" />
                      <Input
                        type="number" min="0" max="100"
                        value={descuento || ''}
                        onChange={e => setDescuento(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                        placeholder="Dcto global %"
                        className="h-8 text-sm bg-white border-gray-100 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={aplicarIVA}
                        onChange={e => setAplicarIVA(e.target.checked)}
                        className="w-4 h-4 accent-[#F97316]"
                      />
                      IVA
                    </label>
                  </div>

                  {/* Costo de envío (solo delivery) */}
                  {tipoServicio === 'delivery' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 whitespace-nowrap">🛵 Envío $</span>
                      <Input
                        type="number" min="0" step="0.01"
                        value={costoEnvio || ''}
                        onChange={e => setCostoEnvio(Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="0.00"
                        className="h-8 text-sm bg-white border-orange-400/30 text-gray-900 placeholder:text-gray-400 flex-1"
                      />
                    </div>
                  )}

                  {/* Resumen de totales */}
                  <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal{hayIVAIncluido ? ' (c/IVA incl.)' : ''}</span>
                      <span className="text-gray-900">${subtotalBruto.toFixed(2)}</span>
                    </div>
                    {orden.some(i => (i.descuento_item || 0) > 0) && (
                      <div className="flex justify-between text-gray-600">
                        <span>Dcto. por ítem</span>
                        <span className="text-amber-400">incluido</span>
                      </div>
                    )}
                    {descuento > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Descuento ({descuento}%)</span>
                        <span className="text-red-400">-${descuentoVal.toFixed(2)}</span>
                      </div>
                    )}
                    {hayIVAIncluido && (
                      <div className="flex justify-between text-gray-600">
                        <span>Base sin IVA</span>
                        <span className="text-gray-900">${subtotalBase.toFixed(2)}</span>
                      </div>
                    )}
                    {aplicarIVA && ivaVal > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>IVA{hayIVAIncluido ? ' desglosado' : ''}</span>
                        <span className="text-gray-900">${ivaVal.toFixed(2)}</span>
                      </div>
                    )}
                    {tipoServicio === 'delivery' && costoEnvio > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>🛵 Costo de envío</span>
                        <span className="text-orange-400">+${costoEnvio.toFixed(2)}</span>
                      </div>
                    )}
                    <Separator className="bg-gray-100 my-1" />
                    <div className="flex justify-between items-center">
                      <span className="text-gray-900 font-bold text-base">TOTAL</span>
                      <span className="text-[#F97316] font-bold text-2xl">${total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Botones: Pre-cuenta | Cocina / Cobrar */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => imprimirPreCuenta({
                        tipo_servicio: tipoServicio, mesa, cliente, items: orden, notas,
                        descuento, descuentoVal, subtotalBase, ivaVal, total, aplicarIVA,
                      })}
                      disabled={procesando}
                      variant="outline"
                      className="h-11 font-semibold text-sm border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                      <ClipboardList className="w-4 h-4 mr-1.5 text-gray-500" />
                      Pre-cuenta
                    </Button>
                    <Button
                      onClick={handleEnviarCocina}
                      disabled={procesando}
                      className={`h-11 font-bold text-sm ${
                        comandaEnviada
                          ? 'bg-green-700/80 hover:bg-green-700 text-white'
                          : 'bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white'
                      }`}
                    >
                      <ChefHat className="w-4 h-4 mr-1.5" />
                      {comandaEnviada ? '✓ Cocina' : 'Cocina'}
                    </Button>
                  </div>
                  <Button
                    onClick={handleCobrar}
                    disabled={procesando}
                    className="w-full h-12 font-bold text-base bg-gradient-to-r from-[#F97316] to-[#C2410C] hover:from-[#F97316]/90 hover:to-[#C2410C]/90 text-white"
                  >
                    <DollarSign className="w-5 h-5 mr-2" />
                    Cobrar ${total.toFixed(2)}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Nota por item ── */}
      <Dialog open={!!editandoNota} onOpenChange={() => setEditandoNota(null)}>
        <DialogContent className="bg-white border-[#F97316]/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-400" /> Nota del item
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-gray-600 text-sm">
              {orden.find(i => i.producto.id === editandoNota)?.producto.nombre}
            </p>
            <textarea
              autoFocus
              value={notaTemp}
              onChange={e => setNotaTemp(e.target.value)}
              placeholder="Ej: Sin cebolla, término medio, sin gluten..."
              rows={3}
              className="w-full bg-gray-50 border border-[#F97316]/20 rounded-lg p-3 text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:border-[#F97316]/50 text-sm"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditandoNota(null)}
                className="flex-1 border-gray-200 text-gray-900">Cancelar</Button>
              <Button onClick={() => guardarNota(editandoNota!)}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-gray-900">Guardar nota</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Comanda enviada (imprimible) ── */}
      <Dialog open={dialogComanda} onOpenChange={setDialogComanda}>
        <DialogContent className="bg-white border-[#F97316]/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
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
                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-gray-900 font-bold"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir Comanda
                </Button>
                <Button
                  onClick={() => setDialogComanda(false)}
                  variant="outline"
                  className="flex-1 border-gray-200 text-gray-900"
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
        <DialogContent className="bg-white border-[#F97316]/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900 text-xl flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#F97316]" />
              Cobrar Orden
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Total grande */}
            <div className="bg-gradient-to-r from-[#F97316]/10 to-[#C2410C]/10 border border-[#F97316]/20 rounded-xl p-4 text-center">
              {mesa && tipoServicio === 'mesa' && <p className="text-gray-600 text-sm mb-1">Mesa {mesa}</p>}
              <p className="text-gray-600 text-sm">Total a cobrar</p>
              <p className="text-[#F97316] text-4xl font-bold mt-1">${total.toFixed(2)}</p>
            </div>

            {/* Método de pago */}
            <div>
              <p className="text-gray-900 text-sm font-medium mb-2">Método de pago</p>
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
                        ? 'bg-[#F97316] border-[#F97316] text-black'
                        : 'bg-gray-50 border-gray-100 text-gray-600 hover:border-[#F97316]/40'
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
                <Label className="text-gray-900 text-sm font-medium block mb-2">Monto recibido</Label>
                <Input
                  type="number" step="0.01" autoFocus
                  value={montoRecibido}
                  onChange={e => setMontoRecibido(e.target.value)}
                  placeholder="0.00"
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900 text-xl h-12 text-center font-bold"
                />
                {/* Atajos rápidos */}
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[1, 5, 10, 20, 50, 100, Math.ceil(total), Math.ceil(total / 5) * 5].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8).map(v => (
                    <button key={v} onClick={() => setMontoRecibido(String(v))}
                      className="bg-gray-50 hover:bg-gray-100 border border-gray-100 text-gray-900 text-xs rounded-lg py-1.5 transition-colors">
                      ${v}
                    </button>
                  ))}
                </div>
                {montoRecibido && parseFloat(montoRecibido) >= parseFloat(total.toFixed(2)) && (
                  <div className="mt-3 bg-green-500/15 border border-green-500/30 rounded-xl p-3 text-center">
                    <p className="text-green-400 text-xs">Cambio a entregar</p>
                    <p className="text-green-300 text-3xl font-bold">${cambio.toFixed(2)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Resumen items */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 max-h-36 overflow-auto">
              <p className="text-gray-600 text-xs mb-2">{orden.length} item(s):</p>
              {orden.map(i => (
                <div key={i.producto.id} className="flex justify-between text-sm py-0.5">
                  <span className="text-gray-600">{i.cantidad}× {i.producto.nombre}</span>
                  <span className="text-gray-600">${i.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogPago(false)} disabled={procesando}
                className="flex-1 border-gray-200 text-gray-900">
                Cancelar
              </Button>
              <Button
                onClick={confirmarPago}
                disabled={procesando || (metodoPago === 'efectivo' && (!montoRecibido || parseFloat(montoRecibido) < parseFloat(total.toFixed(2))))}
                className="flex-1 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-gray-900 font-bold h-11"
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
        onOmitir={() => { setDialogDatosCliente(false); limpiarVenta(true); }}
      />

      {/* ── Modal: RIDE — se abre tras generar la factura ── */}
      <Dialog open={dialogRIDE} onOpenChange={(v) => { if (!v) cerrarRIDE(); }}>
        <DialogContent className="bg-white border-[#F97316]/20 max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-gray-900 text-xl flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#F97316]" />
              Factura Electrónica
              {facturaGenerada?.estado === 'AUTORIZADO' && (
                <span className="ml-2 text-xs font-normal bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                  ✓ Autorizada
                </span>
              )}
              {facturaGenerada?.estado === 'NO_AUTORIZADO' && (
                <span className="ml-2 text-xs font-normal bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                  ✗ No autorizada
                </span>
              )}
              {facturaGenerada?.estado === 'PENDIENTE' && (
                <span className="ml-2 text-xs font-normal bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full border border-yellow-200 flex items-center gap-1">
                  <Clock className="w-3 h-3 animate-spin" />
                  {sriPollingId ? 'Consultando SRI…' : '⏱ Pendiente'}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {facturaGenerada && (
              <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
                <RIDE factura={facturaGenerada} autoImprimir={autoImprimirRIDE} />
              </div>
            )}
            <div className="flex justify-end pt-2 border-t border-[#F97316]/20">
              <Button variant="outline" onClick={cerrarRIDE}
                className="border-gray-200 text-gray-900">
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
