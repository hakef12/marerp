import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { X, Factory, AlertTriangle, CheckCircle } from 'lucide-react';

interface ProducirModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  recetaPreseleccionada?: any;
}

export default function ProducirModal({ isOpen, onClose, onSuccess, recetaPreseleccionada }: ProducirModalProps) {
  const { token } = useAuth();
  const [recetas, setRecetas] = useState<any[]>([]);
  const [bodegas, setBodegas] = useState<any[]>([]);
  
  // ✅ NUEVO: Guardar el catálogo de productos para traducir los ingredientes en vivo
  const [catalogoProductos, setCatalogoProductos] = useState<any[]>([]);
  
  const [recetaSeleccionada, setRecetaSeleccionada] = useState<any>(null);
  const [bodegaOrigen, setBodegaOrigen] = useState('');
  const [bodegaDestino, setBodegaDestino] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [notas, setNotas] = useState('');
  const [produciendo, setProduciendo] = useState(false);
  // Merma por ingrediente: índice → porcentaje de merma (0-100)
  const [mermasPorIngrediente, setMermasPorIngrediente] = useState<Record<number, number>>({});

  // Cargar datos
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
        const headers = { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '' };

        // 1. Cargar recetas
        const recetasResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/server/cocina/recetas`, { headers });
        if (recetasResponse.ok) {
          const recetasData = await recetasResponse.json();
          setRecetas(recetasData.recetas || []);
        }

        // 2. Cargar bodegas
        const bodegasResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/server/bodegas`, { headers });
        if (bodegasResponse.ok) {
          const bodegasData = await bodegasResponse.json();
          setBodegas(bodegasData.bodegas || []);
        }
        
        // 3. ✅ Cargar Catálogo de Productos (Para traducciones seguras)
        const productosResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/server/productos`, { headers });
        if (productosResponse.ok) {
          const productosData = await productosResponse.json();
          setCatalogoProductos(productosData.productos || []);
        }

      } catch (error) {
        toast.error('Error de conexión al cargar datos');
      }
    };

    if (isOpen && token) {
      fetchData();
    }
  }, [isOpen, token]);

  // Pre-seleccionar receta
  useEffect(() => {
    if (recetaPreseleccionada) {
      setRecetaSeleccionada(recetaPreseleccionada);
    }
  }, [recetaPreseleccionada]);

  const handleRecetaChange = (recetaId: string) => {
    const receta = recetas.find(r => r.id === recetaId);
    setRecetaSeleccionada(receta || null);
  };

  const handleProducir = async () => {
    if (!recetaSeleccionada) return toast.error('Selecciona una receta para producir');
    if (!bodegaOrigen) return toast.error('Selecciona la bodega de donde se tomarán los ingredientes');
    if (!bodegaDestino) return toast.error('Selecciona la bodega donde se guardará el producto terminado');
    if (cantidad <= 0) return toast.error('La cantidad debe ser mayor a 0');

    setProduciendo(true);

    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const cantidadPorciones = cantidad * (recetaSeleccionada.porciones || 1);

      const body = {
        receta_id: recetaSeleccionada.id,
        bodega_origen_id: bodegaOrigen,
        bodega_destino_id: bodegaDestino,
        cantidad_lotes: cantidad,
        cantidad_porciones: cantidadPorciones,
        notas,
        // Mermas por ingrediente: { índice: %, ... } — el backend lo usa para descontar más stock
        mermas_ingredientes: ingredientesProcesados.map((ing: any) => ({
          nombre: ing.nombre,
          cantidad_base: ing.cantidad_base * cantidad,
          cantidad_con_merma: ing.cantidad_necesaria,
          merma_pct: ing.merma_pct || 0,
        }))
      };

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/producir`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (response.ok) {
        toast.success(`✅ Producción completada: ${cantidadPorciones} unidades agregadas al inventario`, { duration: 5000 });
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        if (error.faltantes && error.faltantes.length > 0) {
          toast.error(
            <div>
              <p className="font-bold">⚠️ Stock insuficiente</p>
              {error.faltantes.slice(0, 3).map((f: any, i: number) => (
                <p key={i} className="text-sm">• {f.nombre}: faltan {f.faltante.toFixed(2)} {f.unidad}</p>
              ))}
            </div>,
            { duration: 8000 }
          );
        } else {
          toast.error(error.error || 'Error al producir');
        }
      }
    } catch (error) {
      toast.error('Error al ejecutar la producción');
    } finally {
      setProduciendo(false);
    }
  };

  if (!isOpen) return null;

  // ✅ CÁLCULOS DE PRODUCCIÓN A PRUEBA DE BALAS
  const cantidadPorciones = recetaSeleccionada ? cantidad * (recetaSeleccionada.porciones || 1) : 0;
  
  // Extraer la lista de ingredientes (Soporta formato viejo y nuevo)
  const listaIngredientesRaw = recetaSeleccionada?.ingredientes || recetaSeleccionada?.receta_ingredientes || [];
  
  // Crear una lista procesada y traducida
  const ingredientesProcesados = listaIngredientesRaw.map((ing: any) => {
    // Buscar en el catálogo local
    const idBuscado = String(ing.insumo_id || ing.producto_id || ing.insumo?.id || ing.productos?.id);
    const prodCatalogo = catalogoProductos.find((p: any) => String(p.id) === idBuscado);
    
    const nombreFinal = ing.insumo?.nombre || ing.productos?.nombre || ing.nombre_producto || prodCatalogo?.nombre || 'Ingrediente Desconocido';
    const costoUnitarioFinal = parseFloat(ing.costo_unitario) || parseFloat(prodCatalogo?.costo_promedio) || parseFloat(prodCatalogo?.precio_compra) || 0;
    const cantidadOriginal = parseFloat(ing.cantidad) || 0;
    
    const mermaPct = mermasPorIngrediente[index] || 0;
    // Con merma: se necesita más materia prima para compensar la pérdida
    // Ej: 10% merma → necesito 100/(100-10) = 1.111x más cantidad
    const factorMerma = mermaPct > 0 ? 1 / (1 - mermaPct / 100) : 1;
    const cantidadConMerma = cantidadOriginal * factorMerma;

    return {
      nombre: nombreFinal,
      cantidad_base: cantidadOriginal,
      unidad_medida: ing.unidad_medida || 'und',
      costo_unitario: costoUnitarioFinal,
      merma_pct: mermaPct,
      // Calcular valores multiplicados por los lotes a producir (incluyendo merma)
      cantidad_necesaria: cantidadConMerma * cantidad,
      costo_total_ingrediente: (costoUnitarioFinal * cantidadConMerma) * cantidad
    };
  });

  // Calcular el costo total en base a la suma real de los ingredientes, evitamos $NaN
  const costoTotalLoteBase = ingredientesProcesados.reduce((sum: number, ing: any) => sum + (ing.cantidad_base * ing.costo_unitario), 0);
  const costoTotalProduccion = costoTotalLoteBase * cantidad;
  const costoPorUnidad = cantidadPorciones > 0 ? (costoTotalProduccion / cantidadPorciones) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0A1A2F] rounded-xl border border-[#00E5FF]/30 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#0A1A2F] border-b border-[#00E5FF]/20 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Factory className="w-6 h-6 text-[#00E5FF]" />
            Ejecutar Producción
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Selección de Receta */}
          {!recetaPreseleccionada && (
            <div>
              <Label className="text-gray-300">Seleccionar Receta *</Label>
              <Select
                value={recetaSeleccionada?.id || ''}
                onValueChange={handleRecetaChange}
              >
                <SelectTrigger className="bg-[#1a3a52] border-[#00E5FF]/20 text-white">
                  <SelectValue placeholder="Seleccionar receta para producir" />
                </SelectTrigger>
                <SelectContent>
                  {recetas.map((receta) => (
                    <SelectItem key={receta.id} value={receta.id}>
                      {receta.nombre} ({receta.porciones || 1} porciones)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {recetaSeleccionada && (
            <>
              {/* Información de la receta */}
              <div className="bg-[#1a3a52]/30 rounded-lg p-4 border border-[#00E5FF]/20">
                <h3 className="text-lg font-bold text-white mb-3">{recetaSeleccionada.nombre}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Producto que genera:</p>
                    <p className="text-white font-bold">{recetaSeleccionada.productos?.nombre || 'Producto Asociado'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Porciones por lote:</p>
                    <p className="text-white font-bold">{recetaSeleccionada.porciones || 1} unidades</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Costo Base del Lote:</p>
                    <p className="text-white font-bold">${costoTotalLoteBase.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Tiempo estimado:</p>
                    <p className="text-white font-bold">{recetaSeleccionada.tiempo_preparacion || 0} minutos</p>
                  </div>
                </div>
              </div>

              {/* Configuración de producción */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-300">Bodega de Ingredientes (Origen) *</Label>
                  <Select value={bodegaOrigen} onValueChange={setBodegaOrigen}>
                    <SelectTrigger className="bg-[#1a3a52] border-[#00E5FF]/20 text-white">
                      <SelectValue placeholder="Seleccionar bodega" />
                    </SelectTrigger>
                    <SelectContent>
                      {bodegas.map((bodega) => (
                        <SelectItem key={bodega.id} value={bodega.id}>
                          {bodega.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400 mt-1">Se descargarán los ingredientes de aquí</p>
                </div>

                <div>
                  <Label className="text-gray-300">Bodega Producto Terminado (Destino) *</Label>
                  <Select value={bodegaDestino} onValueChange={setBodegaDestino}>
                    <SelectTrigger className="bg-[#1a3a52] border-[#00E5FF]/20 text-white">
                      <SelectValue placeholder="Seleccionar bodega" />
                    </SelectTrigger>
                    <SelectContent>
                      {bodegas.map((bodega) => (
                        <SelectItem key={bodega.id} value={bodega.id}>
                          {bodega.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400 mt-1">Se agregará el producto aquí</p>
                </div>

                <div className="md:col-span-2">
                  <Label className="text-gray-300">Cantidad de Lotes a Producir *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={cantidad}
                    onChange={(e) => setCantidad(parseInt(e.target.value) || 1)}
                    className="bg-[#1a3a52] border-[#00E5FF]/20 text-white font-bold text-lg"
                  />
                  <p className="text-sm text-[#00E5FF] mt-1 font-medium">
                    = Se producirán {cantidadPorciones} unidades finales.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <Label className="text-gray-300">Notas de Producción</Label>
                  <textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    rows={2}
                    placeholder="Observaciones opcionales..."
                    className="w-full bg-[#1a3a52] border border-[#00E5FF]/20 rounded-lg p-3 text-white"
                  />
                </div>
              </div>

              {/* Ingredientes que se consumirán */}
              {ingredientesProcesados.length > 0 && (
                <div className="border border-[#00E5FF]/20 rounded-lg p-4 bg-[#0A1A2F]/50">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-400" />
                    Materia prima a consumir
                  </h3>
                  
                  <div className="mb-2 text-xs text-gray-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Ingresa el % de merma por ingrediente para un costeo exacto
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-2">
                    {ingredientesProcesados.map((ing: any, index: number) => (
                      <div key={index} className="bg-[#1a3a52]/50 p-3 rounded-lg border border-[#00E5FF]/10">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-white font-medium text-sm">{ing.nombre}</p>
                            <p className="text-[#00E5FF] font-bold text-sm">
                              {ing.cantidad_necesaria.toFixed(3)} {ing.unidad_medida}
                              {ing.merma_pct > 0 && (
                                <span className="text-amber-400 text-xs ml-1">
                                  (+{ing.merma_pct}% merma)
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-bold text-sm">${ing.costo_total_ingrediente.toFixed(2)}</p>
                            <p className="text-gray-400 text-xs">${ing.costo_unitario.toFixed(2)}/{ing.unidad_medida}</p>
                          </div>
                        </div>
                        {/* Input merma */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 whitespace-nowrap">Merma %:</span>
                          <input
                            type="number" min="0" max="99" step="0.5"
                            value={mermasPorIngrediente[index] || ''}
                            onChange={e => setMermasPorIngrediente(prev => ({
                              ...prev,
                              [index]: Math.min(99, Math.max(0, parseFloat(e.target.value) || 0))
                            }))}
                            placeholder="0"
                            className="w-20 h-6 text-xs bg-[#0A1A2F] border border-amber-400/30 rounded px-2 text-amber-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-400"
                          />
                          {ing.merma_pct > 0 && (
                            <span className="text-xs text-gray-400">
                              (base: {(ing.cantidad_base * cantidad).toFixed(3)} → con merma: {ing.cantidad_necesaria.toFixed(3)})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resumen de costos A PRUEBA DE NAN */}
              <div className="bg-gradient-to-br from-[#1e64a7]/20 to-[#00E5FF]/20 rounded-lg p-4 border border-[#00E5FF]/30">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-300 text-sm">Costo Total de Producción:</p>
                    <p className="text-3xl font-bold text-[#00E5FF]">${costoTotalProduccion.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-300 text-sm">Costo por Unidad Generada:</p>
                    <p className="text-3xl font-bold text-[#7B61FF]">
                      ${costoPorUnidad.toFixed(4)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Alertas */}
              {(!bodegaOrigen || !bodegaDestino) && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-300">
                    <p className="font-bold">Selecciona las bodegas</p>
                    <p>Debes indicar de dónde se tomarán los ingredientes y dónde se guardará el producto terminado.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Botones */}
          <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
              disabled={produciendo}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleProducir}
              className="bg-gradient-to-r from-green-600 to-green-500"
              disabled={produciendo || !recetaSeleccionada || !bodegaOrigen || !bodegaDestino}
            >
              {produciendo ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Produciendo...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Ejecutar Producción
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}