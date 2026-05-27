import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { X, Plus, Trash2, Package, DollarSign, TrendingUp, ChefHat } from 'lucide-react';

interface RecetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  receta?: any;
}

export default function RecetaModal({ isOpen, onClose, onSuccess, receta }: RecetaModalProps) {
  const { token } = useAuth();
  const [productos, setProductos] = useState<any[]>([]);

  // Inicialización directa desde la prop — evita la condición de carrera de useEffect
  const buildFormData = (r: any) => r ? {
    nombre: r.nombre || '',
    descripcion: r.descripcion || '',
    categoria: r.categoria || 'Platos Principales',
    producto_id: r.producto_id ? String(r.producto_id) : '',
    porciones: r.porciones || 1,
    tiempo_preparacion: r.tiempo_preparacion || 0,
    dificultad: r.dificultad || 'media',
    precio_sugerido: r.precio_sugerido || 0,
    instrucciones: r.instrucciones || '',
  } : {
    nombre: '', descripcion: '', categoria: 'Platos Principales',
    producto_id: '', porciones: 1, tiempo_preparacion: 0,
    dificultad: 'media', precio_sugerido: 0, instrucciones: '',
  };

  const buildIngredientes = (r: any) => {
    const list = r?.ingredientes || r?.receta_ingredientes || [];
    if (list.length > 0) {
      return list.map((ing: any) => {
        const rawId = ing.insumo_id || ing.producto_id || ing.insumo?.id || ing.productos?.id || '';
        return {
          insumo_id: String(rawId),
          cantidad: parseFloat(ing.cantidad) || 0,
          unidad_medida: ing.unidad_medida || 'und',
          costo_unitario: parseFloat(ing.costo_unitario) || 0,
          notas: ing.notas || ''
        };
      });
    }
    return [{ insumo_id: '', cantidad: 0, unidad_medida: 'und', costo_unitario: 0, notas: '' }];
  };

  const [formData, setFormData] = useState(() => buildFormData(receta));
  const [ingredientes, setIngredientes] = useState<any[]>(() => buildIngredientes(receta));
  const [metodoPrecio, setMetodoPrecio] = useState<'foodcost' | 'manual'>('foodcost');
  const [foodCostPorcentaje, setFoodCostPorcentaje] = useState(30);
  const [cargando, setCargando] = useState(false);

  // Cargar datos al montar: productos + receta fresca desde la API si hay ID
  useEffect(() => {
    if (!isOpen || !token) return;

    const cargarDatos = async () => {
      setCargando(true);
      try {
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
        const headers = { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token };

        // Siempre cargar lista de productos
        const [prodRes, recetaRes] = await Promise.all([
          fetch(`https://${projectId}.supabase.co/functions/v1/server/productos`, { headers }),
          // Si hay receta.id, cargar datos frescos de la API
          receta?.id
            ? fetch(`https://${projectId}.supabase.co/functions/v1/server/cocina/recetas/${receta.id}`, { headers })
            : Promise.resolve(null)
        ]);

        if (prodRes.ok) {
          const d = await prodRes.json();
          setProductos(d.productos || []);
        }

        if (recetaRes && recetaRes.ok) {
          const d = await recetaRes.json();
          const r = d.receta;
          if (r) {
            setFormData(buildFormData(r));
            setIngredientes(buildIngredientes(r));
          }
        }
      } catch (e) {
        console.error('Error cargando datos del modal:', e);
      } finally {
        setCargando(false);
      }
    };

    cargarDatos();
  }, [isOpen, token, receta?.id]);

  const agregarIngrediente = () => setIngredientes([...ingredientes, { insumo_id: '', cantidad: 0, unidad_medida: 'und', costo_unitario: 0, notas: '' }]);
  const eliminarIngrediente = (index: number) => { if (ingredientes.length > 1) setIngredientes(ingredientes.filter((_, i) => i !== index)); };

  const actualizarIngrediente = (index: number, field: string, value: any) => {
    const nuevosIngredientes = [...ingredientes];
    nuevosIngredientes[index] = { ...nuevosIngredientes[index], [field]: value };

    if (field === 'insumo_id') {
      const producto = productos.find(p => String(p.id) === String(value));
      if (producto) {
        // Intentar todos los campos donde puede estar el costo, incluyendo sub-recetas
        nuevosIngredientes[index].costo_unitario =
          parseFloat(producto.precio_compra)  ||  // compras / costo calculado de receta
          parseFloat(producto.costo_receta)   ||  // campo alternativo de sub-receta
          parseFloat(producto.costo_unitario) ||  // campo legacy
          parseFloat(producto.costo_promedio) ||  // promedio ponderado
          0;
      }
    }
    setIngredientes(nuevosIngredientes);
  };

  const costoTotal = ingredientes.reduce((sum, ing) => sum + ((parseFloat(ing.cantidad) || 0) * (parseFloat(ing.costo_unitario) || 0)), 0);
  const costoPorPorcion = formData.porciones > 0 ? costoTotal / formData.porciones : 0;

  useEffect(() => {
    if (metodoPrecio === 'foodcost' && costoPorPorcion > 0) {
      const precioCalculado = costoPorPorcion / (foodCostPorcentaje / 100);
      setFormData(prev => ({ ...prev, precio_sugerido: parseFloat(precioCalculado.toFixed(2)) }));
    }
  }, [costoPorPorcion, foodCostPorcentaje, metodoPrecio]);

  const foodCostReal = formData.precio_sugerido > 0 ? (costoPorPorcion / formData.precio_sugerido) * 100 : 0;
  // Margen bruto = (precio - costo) / precio × 100  (no markup)
  const margen = formData.precio_sugerido > 0 && costoPorPorcion > 0 ? ((formData.precio_sugerido - costoPorPorcion) / formData.precio_sugerido) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre) return toast.error('El nombre de la receta es requerido');
    
    const ingredientesValidos = ingredientes.filter(ing => ing.insumo_id && parseFloat(ing.cantidad) > 0);
    if (ingredientesValidos.length === 0) return toast.error('Debes agregar al menos un ingrediente con cantidad válida');

    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const body = {
        ...formData,
        porciones: parseInt(formData.porciones as any) || 1,
        precio_sugerido: parseFloat(formData.precio_sugerido as any) || 0,
        ingredientes: ingredientesValidos.map(ing => ({
          insumo_id: ing.insumo_id, 
          cantidad: parseFloat(ing.cantidad) || 0,
          unidad_medida: ing.unidad_medida,
          costo_unitario: parseFloat(ing.costo_unitario) || 0,
          costo_total: (parseFloat(ing.cantidad) || 0) * (parseFloat(ing.costo_unitario) || 0),
          notas: ing.notas
        }))
      };

      const url = receta 
        ? `https://${projectId}.supabase.co/functions/v1/server/cocina/recetas/${receta.id}`
        : `https://${projectId}.supabase.co/functions/v1/server/cocina/recetas`;

      const response = await fetch(url, {
        method: receta ? 'PUT' : 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        toast.success(receta ? 'Receta actualizada' : 'Receta creada exitosamente');
        onSuccess();
        onClose();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || err.details || 'Error al guardar receta');
      }
    } catch (error) {
      toast.error('Error de conexión al guardar receta');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#F97316]/30 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#F97316]/20 p-6 flex justify-between items-center z-10">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-[#F97316]" /> {receta ? 'Editar Receta' : 'Nueva Receta'}
          </h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900"><X className="w-6 h-6" /></button>
        </div>

        {cargando && (
          <div className="flex items-center justify-center py-12 gap-3 text-[#F97316]">
            <div className="w-6 h-6 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Cargando receta...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`p-6 space-y-6 ${cargando ? 'hidden' : ''}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-600">Nombre de la Receta *</Label>
              <Input value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} className="bg-gray-100 border-[#F97316]/20 text-gray-900" required />
            </div>
            <div>
              <Label className="text-gray-600">Producto Final *</Label>
              <Select value={String(formData.producto_id)} onValueChange={(v) => setFormData({ ...formData, producto_id: v })}>
                <SelectTrigger className="bg-gray-100 border-[#F97316]/20 text-gray-900"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {productos.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-600">Porciones *</Label>
              <Input type="number" min="1" value={formData.porciones} onChange={(e) => setFormData({ ...formData, porciones: parseInt(e.target.value) || 1 })} className="bg-gray-100 border-[#F97316]/20 text-gray-900" required />
            </div>
            <div>
              <Label className="text-gray-600">Tiempo de Preparación (minutos)</Label>
              <Input type="number" min="0" value={formData.tiempo_preparacion} onChange={(e) => setFormData({ ...formData, tiempo_preparacion: parseInt(e.target.value) || 0 })} className="bg-gray-100 border-[#F97316]/20 text-gray-900" />
            </div>
            <div>
              <Label className="text-gray-600">Dificultad</Label>
              <Select value={formData.dificultad} onValueChange={(value) => setFormData({ ...formData, dificultad: value })}>
                <SelectTrigger className="bg-gray-100 border-[#F97316]/20 text-gray-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="facil">Fácil</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="dificil">Difícil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-600">Categoría</Label>
              <Select value={formData.categoria} onValueChange={(value) => setFormData({ ...formData, categoria: value })}>
                <SelectTrigger className="bg-gray-100 border-[#F97316]/20 text-gray-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entradas">Entradas</SelectItem><SelectItem value="Platos Principales">Platos Principales</SelectItem>
                  <SelectItem value="Guarniciones">Guarniciones</SelectItem><SelectItem value="Postres">Postres</SelectItem>
                  <SelectItem value="Bebidas">Bebidas</SelectItem><SelectItem value="Salsas">Salsas</SelectItem>
                  <SelectItem value="Panadería">Panadería</SelectItem><SelectItem value="Otros">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-gray-600">Descripción</Label>
            <textarea value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} rows={2} className="w-full bg-gray-100 border border-[#F97316]/20 rounded-lg p-3 text-gray-900" />
          </div>

          <div className="border border-[#F97316]/20 rounded-lg p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Ingredientes</h3>
              <Button type="button" onClick={agregarIngrediente} className="bg-gradient-to-r from-[#C2410C] to-[#F97316]" size="sm"><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
            </div>
            <div className="space-y-3">
              {ingredientes.map((ingrediente, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end bg-white p-3 rounded-lg">
                  <div className="col-span-4">
                    <Label className="text-gray-600 text-xs">Producto del Inventario</Label>
                    {/* ✅ AQUÍ SE USA STRING() PARA GARANTIZAR QUE EL SELECT LO MUESTRE */}
                    <Select value={String(ingrediente.insumo_id)} onValueChange={(value) => actualizarIngrediente(index, 'insumo_id', value)}>
                      <SelectTrigger className="bg-gray-100 border-[#F97316]/20 text-gray-900 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        {productos.map((producto) => (
                          <SelectItem key={producto.id} value={String(producto.id)}>{producto.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-gray-600 text-xs">Cantidad</Label>
                    <Input type="number" step="0.0001" min="0" value={ingrediente.cantidad} onChange={(e) => actualizarIngrediente(index, 'cantidad', e.target.value)} className="bg-gray-100 border-[#F97316]/20 text-gray-900 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-gray-600 text-xs">Unidad</Label>
                    <Select value={ingrediente.unidad_medida} onValueChange={(value) => actualizarIngrediente(index, 'unidad_medida', value)}>
                      <SelectTrigger className="bg-gray-100 border-[#F97316]/20 text-gray-900 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="und">Unidad</SelectItem><SelectItem value="kg">Kilogramo</SelectItem><SelectItem value="g">Gramo</SelectItem><SelectItem value="l">Litro</SelectItem>
                        <SelectItem value="ml">Mililitro</SelectItem><SelectItem value="lb">Libra</SelectItem><SelectItem value="oz">Onza</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-gray-600 text-xs">Costo Unit. ($)</Label>
                    <Input type="number" step="0.01" min="0" value={ingrediente.costo_unitario} onChange={(e) => actualizarIngrediente(index, 'costo_unitario', e.target.value)} className="bg-[#F97316]/10 border-[#F97316]/30 text-gray-900 text-sm font-bold" />
                  </div>
                  <div className="col-span-1 flex items-end">
                    <Button type="button" onClick={() => eliminarIngrediente(index)} variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10 w-full" disabled={ingredientes.length === 1}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Panel Costos */}
            <div className="bg-gradient-to-br from-[#C2410C]/20 to-[#F97316]/20 rounded-lg p-4 border border-[#F97316]/30">
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2"><DollarSign className="w-5 h-5 text-[#F97316]" /> Costos</h3>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-600">Costo Ingredientes:</span><span className="text-xl font-bold text-gray-900">${costoTotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Porciones:</span><span className="text-xl font-bold text-[#F97316]">{formData.porciones}</span></div>
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-600 font-bold">Costo / Porción:</span>
                  <span className="text-2xl font-black text-[#FB923C]">${costoPorPorcion.toFixed(4)}</span>
                </div>
                {formData.producto_id && costoPorPorcion > 0 && (
                  <div className="mt-2 bg-[#FB923C]/10 border border-[#FB923C]/30 rounded p-2 flex items-center gap-2 text-xs text-[#FB923C]">
                    <ChefHat className="w-4 h-4 flex-shrink-0" />
                    <span>Este costo se guardará como precio de compra del producto final</span>
                  </div>
                )}
              </div>
            </div>

            {/* Panel Precio */}
            <div className="bg-gradient-to-br from-[#FB923C]/20 to-[#F97316]/20 rounded-lg p-4 border border-[#FB923C]/30">
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#FB923C]" /> Precio Sugerido</h3>
              <div className="mb-3">
                <Label className="text-gray-600 text-sm">Método de cálculo</Label>
                <div className="flex gap-2 mt-1">
                  <Button type="button" onClick={() => setMetodoPrecio('foodcost')} className={`flex-1 ${metodoPrecio === 'foodcost' ? 'bg-[#F97316] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} size="sm">Food Cost %</Button>
                  <Button type="button" onClick={() => setMetodoPrecio('manual')} className={`flex-1 ${metodoPrecio === 'manual' ? 'bg-[#F97316] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} size="sm">Manual</Button>
                </div>
              </div>

              {metodoPrecio === 'foodcost' && (
                <div className="mb-3">
                  <Label className="text-gray-600 text-sm">% Food Cost objetivo</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number" min="1" max="100" step="1"
                      value={foodCostPorcentaje}
                      onChange={e => setFoodCostPorcentaje(Math.min(100, Math.max(1, parseInt(e.target.value) || 30)))}
                      className="bg-gray-100 text-gray-900 w-24"
                    />
                    <span className="text-gray-600 text-sm">% del costo total</span>
                  </div>
                </div>
              )}

              <div className="mb-3">
                <Label className="text-gray-600 text-sm">Precio sugerido ($)</Label>
                <Input
                  type="number" step="0.01"
                  value={formData.precio_sugerido}
                  onChange={(e) => setFormData({ ...formData, precio_sugerido: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-100 text-gray-900 font-bold text-xl mt-1"
                  disabled={metodoPrecio === 'foodcost'}
                />
              </div>

              {/* Indicadores de rentabilidad */}
              {formData.precio_sugerido > 0 && costoPorPorcion > 0 && (
                <div className="space-y-1 border-t border-gray-100 pt-3 mt-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">% Food Cost real:</span>
                    <span className={`font-bold ${foodCostReal <= 30 ? 'text-green-400' : foodCostReal <= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {foodCostReal.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Margen bruto:</span>
                    <span className="font-bold text-[#F97316]">{margen.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Ganancia / porción:</span>
                    <span className="font-bold text-green-400">${(formData.precio_sugerido - costoPorPorcion).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <Label className="text-gray-600">Instrucciones</Label>
            <textarea value={formData.instrucciones} onChange={(e) => setFormData({ ...formData, instrucciones: e.target.value })} rows={4} className="w-full bg-gray-100 border border-[#F97316]/20 rounded-lg p-3 text-gray-900" />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
            <Button type="button" onClick={onClose} variant="outline" className="border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-900">Cancelar</Button>
            <Button type="submit" className="bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white font-bold">Guardar Receta</Button>
          </div>
        </form>
      </div>
    </div>
  );
}