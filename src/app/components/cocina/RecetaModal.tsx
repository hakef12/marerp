import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { X, Plus, Trash2, Package, DollarSign, TrendingUp, ChefHat, Layers, FlaskConical } from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RecetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  receta?: any;
}

type TipoInsumo = 'producto' | 'subreceta';

interface Ingrediente {
  insumo_id: string;
  tipo_insumo: TipoInsumo;
  cantidad: number;
  unidad_medida: string;
  costo_unitario: number;
  merma_pct: number;
  notas: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UNIDADES = ['und', 'kg', 'g', 'l', 'ml', 'lb', 'oz', 'taza', 'cdta', 'cda', 'porcion'];

const UNIDADES_RENDIMIENTO = [
  { value: 'porcion', label: 'Porciones' },
  { value: 'litros',  label: 'Litros' },
  { value: 'kg',      label: 'Kilogramos' },
  { value: 'g',       label: 'Gramos' },
  { value: 'ml',      label: 'Mililitros' },
  { value: 'und',     label: 'Unidades' },
];

const CATEGORIAS_RECETA  = ['Platos Principales', 'Entradas', 'Guarniciones', 'Postres', 'Bebidas', 'Salsas', 'Panadería', 'Otros'];
const CATEGORIAS_SUBRECETA = ['Fondos y Caldos', 'Salsas Base', 'Masas y Pastas', 'Marinadas', 'Rellenos', 'Cremas y Purés', 'Aliños y Vinagretas', 'Otros'];

function buildFormData(r: any, esSubreceta?: boolean) {
  const esSub = esSubreceta ?? r?.es_subreceta ?? false;
  return {
    nombre:            r?.nombre            || '',
    descripcion:       r?.descripcion       || '',
    categoria:         r?.categoria         || (esSub ? 'Salsas Base' : 'Platos Principales'),
    producto_id:       r?.producto_id       ? String(r.producto_id) : '',
    porciones:         r?.porciones         || 1,
    unidad_rendimiento: r?.unidad_rendimiento || 'porcion',
    tiempo_preparacion: r?.tiempo_preparacion || 0,
    dificultad:        r?.dificultad        || 'media',
    precio_sugerido:   r?.precio_sugerido   || 0,
    instrucciones:     r?.instrucciones     || '',
    es_subreceta:      esSub,
  };
}

function buildIngredientes(r: any): Ingrediente[] {
  const list = r?.ingredientes || r?.receta_ingredientes || [];
  if (list.length > 0) {
    return list.map((ing: any) => ({
      insumo_id:     String(ing.insumo_id || ing.producto_id || ing.insumo?.id || ''),
      tipo_insumo:   (ing.tipo_insumo as TipoInsumo) || 'producto',
      cantidad:      parseFloat(ing.cantidad)      || 0,
      unidad_medida: ing.unidad_medida             || 'und',
      costo_unitario: parseFloat(ing.costo_unitario) || 0,
      merma_pct:     parseFloat(ing.merma_pct)     || 0,
      notas:         ing.notas                     || '',
    }));
  }
  return [{ insumo_id: '', tipo_insumo: 'producto', cantidad: 0, unidad_medida: 'und', costo_unitario: 0, merma_pct: 0, notas: '' }];
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function RecetaModal({ isOpen, onClose, onSuccess, receta }: RecetaModalProps) {
  const { token } = useAuth();
  const [productos,   setProductos]   = useState<any[]>([]);
  const [subrecetas,  setSubrecetas]  = useState<any[]>([]);
  const [formData,    setFormData]    = useState(() => buildFormData(receta));
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>(() => buildIngredientes(receta));
  // Si la receta ya trae un precio definido, respetarlo (modo manual) en vez
  // de recalcularlo automáticamente al abrir el modal — de lo contrario el
  // useEffect de food-cost lo sobrescribe con el 30% por defecto al instante.
  const [metodoPrecio, setMetodoPrecio] = useState<'foodcost' | 'manual'>(
    () => (receta?.precio_sugerido > 0 ? 'manual' : 'foodcost')
  );
  const [foodCostPct,  setFoodCostPct]  = useState(30);
  const [cargando,    setCargando]    = useState(false);
  // Se incrementa cuando termina de cargar la receta desde el backend, para
  // forzar el recálculo del precio sugerido (ver useEffect de food-cost):
  // sin esto, si costoPorUnidad no cambia de valor entre el primer render
  // (con los datos del prop `receta`) y la recarga async, el efecto no se
  // vuelve a disparar y el precio_sugerido queda en 0 (el que trae buildFormData).
  const [dataVersion, setDataVersion] = useState(0);

  // ── Cargar datos al abrir ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !token) return;
    const load = async () => {
      setCargando(true);
      try {
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
        const headers = { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token };

        const [prodRes, subRes, recetaRes] = await Promise.all([
          // OJO: usar /server/productos (catálogo completo de inventario), NO
          // /server/pos/productos — ese endpoint filtra `disponible !== false`
          // y excluye insumos/materia prima (no se venden directo), que son
          // justo los que se usan como ingredientes de las recetas.
          fetch(`https://${projectId}.supabase.co/functions/v1/server/productos`, { headers }),
          fetch(`https://${projectId}.supabase.co/functions/v1/server/cocina/subrecetas`, { headers }),
          receta?.id
            ? fetch(`https://${projectId}.supabase.co/functions/v1/server/cocina/recetas/${receta.id}`, { headers })
            : Promise.resolve(null),
        ]);

        if (prodRes.ok) {
          const d = await prodRes.json();
          setProductos(d.productos || []);
        }
        if (subRes.ok) {
          const d = await subRes.json();
          setSubrecetas(d.subrecetas || []);
        }
        if (recetaRes?.ok) {
          const d = await recetaRes.json();
          if (d.receta) {
            setFormData(buildFormData(d.receta));
            setIngredientes(buildIngredientes(d.receta));
            setMetodoPrecio((parseFloat(d.receta.precio_sugerido) || 0) > 0 ? 'manual' : 'foodcost');
          }
        }
      } catch (e) {
        console.error('Error cargando datos:', e);
      } finally {
        setCargando(false);
        setDataVersion(v => v + 1);
      }
    };
    load();
  }, [isOpen, token, receta?.id]);

  // ── Ingredientes ──────────────────────────────────────────────────────────
  const agregarIngrediente = () =>
    setIngredientes([...ingredientes, { insumo_id: '', tipo_insumo: 'producto', cantidad: 0, unidad_medida: 'und', costo_unitario: 0, merma_pct: 0, notas: '' }]);

  const eliminarIngrediente = (i: number) => {
    if (ingredientes.length > 1) setIngredientes(ingredientes.filter((_, idx) => idx !== i));
  };

  const actualizarIngrediente = (idx: number, field: string, value: any) => {
    const updated = [...ingredientes];
    updated[idx] = { ...updated[idx], [field]: value };

    if (field === 'tipo_insumo') {
      // Al cambiar de tipo, limpiar el insumo seleccionado y costo
      updated[idx].insumo_id = '';
      updated[idx].costo_unitario = 0;
    }

    if (field === 'insumo_id') {
      const tipo = updated[idx].tipo_insumo;
      if (tipo === 'producto') {
        const prod = productos.find(p => String(p.id) === String(value));
        if (prod) {
          updated[idx].costo_unitario =
            parseFloat(prod.precio_compra)  ||
            parseFloat(prod.costo_receta)   ||
            parseFloat(prod.costo_unitario) ||
            parseFloat(prod.costo_promedio) || 0;
        }
      } else {
        const sub = subrecetas.find(s => String(s.id) === String(value));
        if (sub) {
          updated[idx].costo_unitario = parseFloat(sub.costo_por_unidad) || 0;
        }
      }
    }

    setIngredientes(updated);
  };

  // ── Cálculos de costo ─────────────────────────────────────────────────────
  // cantidad_bruta = cantidad_neta / (1 - merma_pct/100) para contemplar pérdidas
  const costoTotal = ingredientes.reduce((sum, ing) => {
    const cant = parseFloat(String(ing.cantidad)) || 0;
    const cu   = parseFloat(String(ing.costo_unitario)) || 0;
    const merma = Math.min(parseFloat(String(ing.merma_pct)) || 0, 99);
    const factorMerma = merma > 0 ? 1 / (1 - merma / 100) : 1;
    return sum + cant * factorMerma * cu;
  }, 0);
  const porciones = parseInt(String(formData.porciones)) || 1;
  const costoPorUnidad = porciones > 0 ? costoTotal / porciones : 0;

  useEffect(() => {
    if (metodoPrecio === 'foodcost' && costoPorUnidad > 0 && !formData.es_subreceta) {
      setFormData(prev => ({
        ...prev,
        precio_sugerido: parseFloat((costoPorUnidad / (foodCostPct / 100)).toFixed(2)),
      }));
    }
  }, [costoPorUnidad, foodCostPct, metodoPrecio, formData.es_subreceta, dataVersion]);

  const foodCostReal = formData.precio_sugerido > 0 ? (costoPorUnidad / formData.precio_sugerido) * 100 : 0;
  const margen       = formData.precio_sugerido > 0 && costoPorUnidad > 0
    ? ((formData.precio_sugerido - costoPorUnidad) / formData.precio_sugerido) * 100 : 0;

  // ── Guardar ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre) return toast.error('El nombre es requerido');
    const validos = ingredientes.filter(ing => ing.insumo_id && parseFloat(String(ing.cantidad)) > 0);
    if (validos.length === 0) return toast.error('Agrega al menos un ingrediente con cantidad válida');
    if (!formData.es_subreceta && !formData.producto_id)
      return toast.error('Selecciona el producto final de la receta');

    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const body = {
        ...formData,
        porciones:      parseInt(String(formData.porciones)) || 1,
        precio_sugerido: formData.es_subreceta ? 0 : (parseFloat(String(formData.precio_sugerido)) || 0),
        ingredientes: validos.map(ing => {
          const cant   = parseFloat(String(ing.cantidad)) || 0;
          const cu     = parseFloat(String(ing.costo_unitario)) || 0;
          const merma  = Math.min(parseFloat(String(ing.merma_pct)) || 0, 99);
          const factor = merma > 0 ? 1 / (1 - merma / 100) : 1;
          return {
            insumo_id:     ing.insumo_id,
            tipo_insumo:   ing.tipo_insumo,
            cantidad:      cant,
            unidad_medida: ing.unidad_medida,
            costo_unitario: cu,
            merma_pct:     merma,
            costo_total:   cant * factor * cu,
            notas:         ing.notas,
          };
        }),
      };

      const url = receta?.id
        ? `https://${projectId}.supabase.co/functions/v1/server/cocina/recetas/${receta.id}`
        : `https://${projectId}.supabase.co/functions/v1/server/cocina/recetas`;

      const res = await fetch(url, {
        method: receta?.id ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(receta ? 'Receta actualizada' : `${formData.es_subreceta ? 'Sub-receta' : 'Receta'} creada exitosamente`);
        onSuccess();
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || err.details || 'Error al guardar');
      }
    } catch {
      toast.error('Error de conexión');
    }
  };

  if (!isOpen) return null;

  const esSub = formData.es_subreceta;
  const unidadLabel = UNIDADES_RENDIMIENTO.find(u => u.value === formData.unidad_rendimiento)?.label || 'porciones';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#F97316]/30 w-full max-w-5xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#F97316]/20 p-6 flex justify-between items-center z-10">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {esSub
              ? <><FlaskConical className="w-6 h-6 text-purple-500" /> {receta ? 'Editar Sub-receta' : 'Nueva Sub-receta'}</>
              : <><Package className="w-6 h-6 text-[#F97316]" /> {receta ? 'Editar Receta' : 'Nueva Receta'}</>
            }
          </h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900"><X className="w-6 h-6" /></button>
        </div>

        {cargando && (
          <div className="flex items-center justify-center py-12 gap-3 text-[#F97316]">
            <div className="w-6 h-6 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Cargando...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`p-6 space-y-6 ${cargando ? 'hidden' : ''}`}>

          {/* ── Toggle Sub-receta / Receta final ─────────────────────────── */}
          <div className="bg-gradient-to-r from-purple-50 to-orange-50 border border-purple-200/50 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">¿Qué tipo de preparación es?</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...buildFormData(null, false), nombre: prev.nombre, descripcion: prev.descripcion, instrucciones: prev.instrucciones }))}
                className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border-2 font-medium text-sm transition-all ${
                  !esSub
                    ? 'bg-[#F97316] text-white border-[#F97316] shadow-md'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#F97316]/50'
                }`}
              >
                <ChefHat className="w-4 h-4" />
                <div className="text-left">
                  <div className="font-bold">Receta Final</div>
                  <div className="text-xs opacity-80">Plato que se vende al cliente</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...buildFormData(null, true), nombre: prev.nombre, descripcion: prev.descripcion, instrucciones: prev.instrucciones }))}
                className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border-2 font-medium text-sm transition-all ${
                  esSub
                    ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400'
                }`}
              >
                <FlaskConical className="w-4 h-4" />
                <div className="text-left">
                  <div className="font-bold">Sub-receta</div>
                  <div className="text-xs opacity-80">Preparación usada como ingrediente</div>
                </div>
              </button>
            </div>
            {esSub && (
              <p className="text-xs text-purple-700 mt-2 bg-purple-50 rounded-lg px-3 py-2 border border-purple-100">
                💡 Ejemplos: <strong>Fondo de res</strong>, <strong>Salsa bechamel</strong>, <strong>Masa de pizza</strong>, <strong>Crema pastelera</strong>.<br />
                No aparece en el POS. Su costo/unidad se calcula automáticamente y se usa en recetas finales.
              </p>
            )}
          </div>

          {/* ── Datos generales ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-600">Nombre *</Label>
              <Input
                value={formData.nombre}
                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                placeholder={esSub ? 'Ej: Salsa bechamel, Fondo de res...' : 'Ej: Lasaña al horno...'}
                className="bg-gray-100 border-[#F97316]/20 text-gray-900"
                required
              />
            </div>

            {/* Solo recetas finales tienen producto vinculado */}
            {!esSub && (
              <div>
                <Label className="text-gray-600">Producto Final *</Label>
                <Select value={String(formData.producto_id)} onValueChange={v => setFormData({ ...formData, producto_id: v })}>
                  <SelectTrigger className="bg-gray-100 border-[#F97316]/20 text-gray-900">
                    <SelectValue placeholder="Seleccionar producto del catálogo" />
                  </SelectTrigger>
                  <SelectContent>
                    {productos.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-gray-600">{esSub ? 'Cantidad que produce *' : 'Porciones que produce *'}</Label>
              <Input
                type="number" min="0.001" step="0.001"
                value={formData.porciones}
                onChange={e => setFormData({ ...formData, porciones: parseFloat(e.target.value) || 1 })}
                className="bg-gray-100 border-[#F97316]/20 text-gray-900"
                required
              />
            </div>

            {/* Sub-recetas tienen unidad de rendimiento; recetas tienen dificultad */}
            {esSub ? (
              <div>
                <Label className="text-gray-600">Unidad de rendimiento *</Label>
                <Select value={formData.unidad_rendimiento} onValueChange={v => setFormData({ ...formData, unidad_rendimiento: v })}>
                  <SelectTrigger className="bg-gray-100 border-purple-300 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDADES_RENDIMIENTO.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">Ej: produce 2 <em>litros</em> → costo = total ÷ 2 por litro</p>
              </div>
            ) : (
              <div>
                <Label className="text-gray-600">Dificultad</Label>
                <Select value={formData.dificultad} onValueChange={v => setFormData({ ...formData, dificultad: v })}>
                  <SelectTrigger className="bg-gray-100 border-[#F97316]/20 text-gray-900"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facil">Fácil</SelectItem>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="dificil">Difícil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-gray-600">Categoría</Label>
              <Select value={formData.categoria} onValueChange={v => setFormData({ ...formData, categoria: v })}>
                <SelectTrigger className={`bg-gray-100 text-gray-900 ${esSub ? 'border-purple-300' : 'border-[#F97316]/20'}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(esSub ? CATEGORIAS_SUBRECETA : CATEGORIAS_RECETA).map(c =>
                    <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-600">Tiempo de preparación (min)</Label>
              <Input
                type="number" min="0"
                value={formData.tiempo_preparacion}
                onChange={e => setFormData({ ...formData, tiempo_preparacion: parseInt(e.target.value) || 0 })}
                className="bg-gray-100 border-[#F97316]/20 text-gray-900"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-600">Descripción</Label>
            <textarea
              value={formData.descripcion}
              onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
              rows={2}
              className="w-full bg-gray-100 border border-[#F97316]/20 rounded-lg p-3 text-gray-900"
            />
          </div>

          {/* ── Ingredientes ─────────────────────────────────────────────── */}
          <div className={`border rounded-lg p-4 bg-gray-50 ${esSub ? 'border-purple-200' : 'border-[#F97316]/20'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-gray-500" /> Ingredientes
                {subrecetas.length > 0 && (
                  <Badge className="bg-purple-100 text-purple-700 text-xs ml-1">
                    {subrecetas.length} sub-receta{subrecetas.length !== 1 ? 's' : ''} disponible{subrecetas.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </h3>
              <Button
                type="button"
                onClick={agregarIngrediente}
                className={`${esSub ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gradient-to-r from-[#C2410C] to-[#F97316]'}`}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-1" /> Agregar
              </Button>
            </div>

            <div className="space-y-3">
              {ingredientes.map((ing, idx) => (
                <div key={idx} className="bg-white p-3 rounded-lg border border-gray-100">
                  <div className="grid grid-cols-13 gap-2 items-end" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>

                    {/* Tipo de insumo */}
                    <div className="col-span-2">
                      <Label className="text-gray-500 text-xs">Tipo</Label>
                      <div className="flex gap-1 mt-1">
                        <button
                          type="button"
                          onClick={() => actualizarIngrediente(idx, 'tipo_insumo', 'producto')}
                          className={`flex-1 text-xs py-1.5 rounded border font-medium transition-all ${
                            ing.tipo_insumo === 'producto'
                              ? 'bg-[#F97316] text-white border-[#F97316]'
                              : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-[#F97316]/40'
                          }`}
                          title="Materia prima del inventario"
                        >
                          🥦
                        </button>
                        <button
                          type="button"
                          onClick={() => actualizarIngrediente(idx, 'tipo_insumo', 'subreceta')}
                          disabled={subrecetas.length === 0}
                          className={`flex-1 text-xs py-1.5 rounded border font-medium transition-all ${
                            ing.tipo_insumo === 'subreceta'
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-purple-400'
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                          title={subrecetas.length === 0 ? 'No hay sub-recetas creadas aún' : 'Sub-receta (preparación intermedia)'}
                        >
                          🧪
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 text-center">
                        {ing.tipo_insumo === 'subreceta' ? 'Sub-receta' : 'Producto'}
                      </p>
                    </div>

                    {/* Selector de insumo */}
                    <div className="col-span-3">
                      <Label className="text-gray-500 text-xs">
                        {ing.tipo_insumo === 'subreceta' ? 'Sub-receta' : 'Producto del inventario'}
                      </Label>
                      <Select
                        value={String(ing.insumo_id)}
                        onValueChange={v => actualizarIngrediente(idx, 'insumo_id', v)}
                      >
                        <SelectTrigger className={`text-gray-900 text-sm ${
                          ing.tipo_insumo === 'subreceta'
                            ? 'bg-purple-50 border-purple-200'
                            : 'bg-gray-100 border-[#F97316]/20'
                        }`}>
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {ing.tipo_insumo === 'subreceta'
                            ? subrecetas.map(s => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  🧪 {s.nombre} (${parseFloat(s.costo_por_unidad || 0).toFixed(4)}/{s.unidad_rendimiento || 'porcion'})
                                </SelectItem>
                              ))
                            : productos.map(p => (
                                <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
                              ))
                          }
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cantidad */}
                    <div className="col-span-2">
                      <Label className="text-gray-500 text-xs">Cantidad</Label>
                      <Input
                        type="number" step="0.0001" min="0"
                        value={ing.cantidad}
                        onChange={e => actualizarIngrediente(idx, 'cantidad', e.target.value)}
                        className="bg-gray-100 border-[#F97316]/20 text-gray-900 text-sm"
                      />
                    </div>

                    {/* Unidad */}
                    <div className="col-span-2">
                      <Label className="text-gray-500 text-xs">Unidad</Label>
                      <Select
                        value={ing.unidad_medida}
                        onValueChange={v => actualizarIngrediente(idx, 'unidad_medida', v)}
                      >
                        <SelectTrigger className="bg-gray-100 border-[#F97316]/20 text-gray-900 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Merma % */}
                    <div className="col-span-1">
                      <Label className="text-gray-500 text-xs">Merma%</Label>
                      <Input
                        type="number" step="1" min="0" max="99"
                        value={ing.merma_pct}
                        onChange={e => actualizarIngrediente(idx, 'merma_pct', Math.min(99, Math.max(0, parseFloat(e.target.value) || 0)))}
                        className="bg-amber-50 border-amber-200 text-gray-900 text-sm"
                        title="% pérdida por limpieza/cocción. 0 = sin merma"
                      />
                    </div>

                    {/* Costo unit */}
                    <div className="col-span-1">
                      <Label className="text-gray-500 text-xs">$/u</Label>
                      <Input
                        type="number" step="0.0001" min="0"
                        value={ing.costo_unitario}
                        onChange={e => actualizarIngrediente(idx, 'costo_unitario', e.target.value)}
                        className={`text-gray-900 text-sm font-bold ${
                          ing.tipo_insumo === 'subreceta'
                            ? 'bg-purple-50 border-purple-200'
                            : 'bg-[#F97316]/10 border-[#F97316]/30'
                        }`}
                        readOnly={ing.tipo_insumo === 'subreceta'}
                        title={ing.tipo_insumo === 'subreceta' ? 'Costo calculado automáticamente desde la sub-receta' : ''}
                      />
                    </div>

                    {/* Eliminar */}
                    <div className="col-span-1">
                      <Button
                        type="button"
                        onClick={() => eliminarIngrediente(idx)}
                        variant="outline"
                        size="sm"
                        className="border-red-300 text-red-400 hover:bg-red-50 w-full"
                        disabled={ingredientes.length === 1}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Subtotal de línea */}
                  <div className="mt-1 flex justify-end gap-3 text-xs text-gray-400">
                    {(parseFloat(String(ing.merma_pct)) || 0) > 0 && (
                      <span className="text-amber-600">
                        Bruto: {((parseFloat(String(ing.cantidad)) || 0) / (1 - (parseFloat(String(ing.merma_pct)) || 0) / 100)).toFixed(4)} {ing.unidad_medida}
                      </span>
                    )}
                    Subtotal: <span className="ml-1 font-medium text-gray-600">
                      ${(() => {
                        const cant = parseFloat(String(ing.cantidad)) || 0;
                        const cu   = parseFloat(String(ing.costo_unitario)) || 0;
                        const merma = Math.min(parseFloat(String(ing.merma_pct)) || 0, 99);
                        const factor = merma > 0 ? 1 / (1 - merma / 100) : 1;
                        return (cant * factor * cu).toFixed(4);
                      })()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Panel de costos ───────────────────────────────────────────── */}
          <div className={`grid grid-cols-1 ${esSub ? '' : 'lg:grid-cols-2'} gap-6`}>
            {/* Costos */}
            <div className={`rounded-lg p-4 border ${
              esSub
                ? 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200'
                : 'bg-gradient-to-br from-[#C2410C]/20 to-[#F97316]/20 border-[#F97316]/30'
            }`}>
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <DollarSign className={`w-5 h-5 ${esSub ? 'text-purple-600' : 'text-[#F97316]'}`} /> Costos
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Costo total ingredientes:</span>
                  <span className="text-lg font-bold text-gray-900">${costoTotal.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Produce:</span>
                  <span className="font-medium text-gray-700">
                    {formData.porciones} {esSub ? unidadLabel.toLowerCase() : 'porción(es)'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-white/50 pt-2">
                  <span className="font-bold text-gray-700">
                    Costo por {esSub ? (unidadLabel === 'Porciones' ? 'porción' : unidadLabel.slice(0, -1).toLowerCase()) : 'porción'}:
                  </span>
                  <span className={`text-2xl font-black ${esSub ? 'text-purple-700' : 'text-[#FB923C]'}`}>
                    ${costoPorUnidad.toFixed(4)}
                  </span>
                </div>
                {esSub && (
                  <div className="mt-2 bg-purple-100 border border-purple-200 rounded p-2 flex items-center gap-2 text-xs text-purple-700">
                    <FlaskConical className="w-4 h-4 flex-shrink-0" />
                    <span>Este costo/unidad se usa automáticamente cuando esta sub-receta se agrega como ingrediente en otras recetas</span>
                  </div>
                )}
                {!esSub && formData.producto_id && costoPorUnidad > 0 && (
                  <div className="mt-2 bg-[#FB923C]/10 border border-[#FB923C]/30 rounded p-2 flex items-center gap-2 text-xs text-[#FB923C]">
                    <ChefHat className="w-4 h-4 flex-shrink-0" />
                    <span>Este costo se guardará como precio de compra del producto final</span>
                  </div>
                )}
              </div>
            </div>

            {/* Panel precio (solo recetas finales) */}
            {!esSub && (
              <div className="bg-gradient-to-br from-[#FB923C]/20 to-[#F97316]/20 rounded-lg p-4 border border-[#FB923C]/30">
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#FB923C]" /> Precio Sugerido
                </h3>
                <div className="mb-3">
                  <Label className="text-gray-600 text-sm">Método de cálculo</Label>
                  <div className="flex gap-2 mt-1">
                    <Button type="button" onClick={() => setMetodoPrecio('foodcost')}
                      className={`flex-1 text-sm ${metodoPrecio === 'foodcost' ? 'bg-[#F97316] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} size="sm">
                      Food Cost %
                    </Button>
                    <Button type="button" onClick={() => setMetodoPrecio('manual')}
                      className={`flex-1 text-sm ${metodoPrecio === 'manual' ? 'bg-[#F97316] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} size="sm">
                      Manual
                    </Button>
                  </div>
                </div>
                {metodoPrecio === 'foodcost' && (
                  <div className="mb-3">
                    <Label className="text-gray-600 text-sm">% Food Cost objetivo</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number" min="1" max="100"
                        value={foodCostPct}
                        onChange={e => setFoodCostPct(Math.min(100, Math.max(1, parseInt(e.target.value) || 30)))}
                        className="bg-gray-100 text-gray-900 w-24"
                      />
                      <span className="text-gray-600 text-sm">% del precio de venta</span>
                    </div>
                  </div>
                )}
                <div className="mb-3">
                  <Label className="text-gray-600 text-sm">Precio de venta ($)</Label>
                  <Input
                    type="number" step="0.01"
                    value={formData.precio_sugerido}
                    onChange={e => setFormData({ ...formData, precio_sugerido: parseFloat(e.target.value) || 0 })}
                    className="bg-gray-100 text-gray-900 font-bold text-xl mt-1"
                    disabled={metodoPrecio === 'foodcost'}
                  />
                </div>
                {formData.precio_sugerido > 0 && costoPorUnidad > 0 && (
                  <div className="space-y-1 border-t border-gray-100 pt-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">% Food Cost real:</span>
                      <span className={`font-bold ${foodCostReal <= 30 ? 'text-green-600' : foodCostReal <= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {foodCostReal.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Margen bruto:</span>
                      <span className="font-bold text-[#F97316]">{margen.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ganancia / porción:</span>
                      <span className="font-bold text-green-600">${(formData.precio_sugerido - costoPorUnidad).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Instrucciones */}
          <div>
            <Label className="text-gray-600">Instrucciones de preparación</Label>
            <textarea
              value={formData.instrucciones}
              onChange={e => setFormData({ ...formData, instrucciones: e.target.value })}
              rows={4}
              className="w-full bg-gray-100 border border-[#F97316]/20 rounded-lg p-3 text-gray-900"
              placeholder={esSub ? 'Pasos para preparar esta base/salsa...' : 'Pasos para preparar este plato...'}
            />
          </div>

          {/* Botones */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
            <Button type="button" onClick={onClose} variant="outline" className="border-gray-300 text-gray-600">
              Cancelar
            </Button>
            <Button
              type="submit"
              className={esSub
                ? 'bg-purple-600 hover:bg-purple-700 text-white font-bold'
                : 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white font-bold'
              }
            >
              {esSub ? '💾 Guardar Sub-receta' : '💾 Guardar Receta'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
