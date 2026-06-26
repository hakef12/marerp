import { useState, useEffect, useRef } from 'react';
import { Save, Upload, CheckCircle, AlertCircle, KeyRound, ShieldCheck, ShieldX, Eye, EyeOff, Wifi, WifiOff, RefreshCw, Mail, Send } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';

interface CertInfo {
  titular: string;
  emisor: string;
  valido_desde: string;
  valido_hasta: string;
  vigente: boolean;
}

interface CertData {
  nombre: string;
  info: CertInfo;
  subido_en: string;
}

export default function ConfiguracionFacturacion() {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [certLoading, setCertLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<any>(null);
  const [emailTestDest, setEmailTestDest] = useState('');
  const [certPassword, setCertPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [certInfo, setCertInfo] = useState<CertData | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [config, setConfig] = useState({
    razon_social: '',
    nombre_comercial: '',
    ruc: '',
    direccion_matriz: '',
    direccion_establecimiento: '',
    telefono: '',
    email: '',
    obligado_contabilidad: false,
    contribuyente_especial: '',
    agente_retencion: '',
    regimen_rimpe: false,
    tipo_contribuyente: 'sociedad',
    codigo_establecimiento: '001',
    punto_emision: '001',
    secuencial_actual: 1,
    firma_electronica_activa: false,
    firma_electronica_nombre: '',
    firma_electronica_validez: '',
    ambiente: 'pruebas',
    // Reglamento Ley de Turismo
    numero_registro_turismo: '',
    categoria_tenedores: 0,
    luaf_numero: '',
    luaf_fecha_emision: '',
    luaf_fecha_vencimiento: '',
    // 10% servicio Ley de Turismo
    cobra_servicio_10pct: false,
    porcentaje_servicio: 10,
    // Canales de venta (delivery apps)
    canales_venta: [
      { codigo: 'directo',    nombre: 'Directo',    comision_pct: 0,  activo: true,  color: '#22c55e' },
      { codigo: 'uber_eats',  nombre: 'Uber Eats',  comision_pct: 30, activo: true,  color: '#000000' },
      { codigo: 'rappi',      nombre: 'Rappi',      comision_pct: 25, activo: true,  color: '#FF441F' },
      { codigo: 'pedidosya',  nombre: 'PedidosYa',  comision_pct: 22, activo: true,  color: '#FA0050' },
      { codigo: 'didi_food',  nombre: 'DiDi Food',  comision_pct: 25, activo: true,  color: '#FF7A00' },
    ] as { codigo: string; nombre: string; comision_pct: number; activo: boolean; color: string }[],
  });

  useEffect(() => {
    cargarConfiguracion();
    cargarCertInfo();
  }, []);

  const cargarConfiguracion = async () => {
    try {
      setLoading(true);
      const data = await api.get('/facturacion/configuracion', token);
      if (data.configuracion) setConfig(prev => ({ ...prev, ...data.configuracion }));
    } catch {
      // silent - first load may fail if offline
    } finally {
      setLoading(false);
    }
  };

  const cargarCertInfo = async () => {
    try {
      const data = await api.get('/facturacion/certificado/info', token);
      if (data.certificado) setCertInfo(data.certificado);
    } catch {
      // silent
    }
  };

  const testearEmail = async () => {
    setEmailTestLoading(true);
    setEmailTestResult(null);
    try {
      const data = await api.post(
        '/facturacion/test-email',
        emailTestDest ? { destinatario: emailTestDest } : {},
        token
      );
      setEmailTestResult(data);
    } catch (e: any) {
      setEmailTestResult({ diagnostico: `❌ Error: ${e.message}` });
    } finally {
      setEmailTestLoading(false);
    }
  };

  const testearConexionSRI = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const data = await api.get('/facturacion/test-sri', token);
      setTestResult(data);
    } catch (e: any) {
      setTestResult({ error: e.message, diagnostico: '❌ Error al ejecutar la prueba' });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.post('/facturacion/configuracion', config, token);
      toast.success('Configuración guardada exitosamente');
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.p12') && !file.name.endsWith('.pfx')) {
      toast.error('El archivo debe ser .p12 o .pfx');
      return;
    }
    setSelectedFile(file);
  };

  const handleUploadCert = async () => {
    if (!selectedFile) { toast.error('Seleccione el archivo del certificado (.p12 o .pfx)'); return; }
    if (!certPassword) { toast.error('Ingrese la contraseña del certificado'); return; }

    setCertLoading(true);
    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // result is "data:application/...;base64,XXXXXX" - extract the base64 part
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      const data = await api.post('/facturacion/certificado', {
        p12_base64: base64,
        password: certPassword,
        nombre: selectedFile.name,
      }, token);

      if (data.info) {
        setCertInfo({ nombre: selectedFile.name, info: data.info, subido_en: new Date().toISOString() });
        setConfig(prev => ({
          ...prev,
          firma_electronica_activa: true,
          firma_electronica_nombre: selectedFile.name,
          firma_electronica_validez: data.info.valido_hasta || '',
        }));
      }

      toast.success('✅ Certificado digital cargado y validado exitosamente');
      setSelectedFile(null);
      setCertPassword('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      toast.error(error.message || 'Error al cargar el certificado. Verifique la contraseña.');
    } finally {
      setCertLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }); }
    catch { return iso; }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Configuración de Facturación Electrónica
        </h1>
        <p className="text-gray-600">
          Configure los datos del emisor y la firma digital para emitir comprobantes válidos ante el SRI Ecuador
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos del Emisor */}
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <CardTitle className="text-gray-900">Datos del Emisor</CardTitle>
            <CardDescription>Información del contribuyente que aparecerá en todos los comprobantes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-600">Razón Social *</Label>
                <Input value={config.razon_social} onChange={e => setConfig({ ...config, razon_social: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" required />
              </div>
              <div>
                <Label className="text-gray-600">Nombre Comercial</Label>
                <Input value={config.nombre_comercial} onChange={e => setConfig({ ...config, nombre_comercial: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" placeholder="Si es diferente a razón social" />
              </div>
              <div>
                <Label className="text-gray-600">RUC * (13 dígitos)</Label>
                <Input
                  value={config.ruc}
                  onChange={e => setConfig({ ...config, ruc: e.target.value.replace(/\D/g, '').slice(0, 13) })}
                  className={`bg-white text-gray-900 ${config.ruc && config.ruc.length !== 13 ? 'border-red-500' : 'border-[#F97316]/20'}`}
                  maxLength={13}
                  inputMode="numeric"
                  required
                  placeholder="0000000000001"
                />
                {config.ruc && config.ruc.length !== 13 && (
                  <p className="text-red-400 text-xs mt-1">El RUC debe tener exactamente 13 dígitos ({config.ruc.length}/13)</p>
                )}
              </div>
              <div>
                <Label className="text-gray-600">Teléfono</Label>
                <Input value={config.telefono} onChange={e => setConfig({ ...config, telefono: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" placeholder="02-2000000" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-gray-600">Dirección Matriz *</Label>
                <Input value={config.direccion_matriz} onChange={e => setConfig({ ...config, direccion_matriz: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" required />
              </div>
              <div className="md:col-span-2">
                <Label className="text-gray-600">Dirección Establecimiento</Label>
                <Input value={config.direccion_establecimiento} onChange={e => setConfig({ ...config, direccion_establecimiento: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" placeholder="Si es diferente a la matriz" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-gray-600">Email para envío de comprobantes</Label>
                <Input type="email" value={config.email} onChange={e => setConfig({ ...config, email: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuración Tributaria */}
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <CardTitle className="text-gray-900">Configuración Tributaria</CardTitle>
            <CardDescription>Información requerida por el SRI para los comprobantes electrónicos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={config.obligado_contabilidad}
                  onChange={e => setConfig({ ...config, obligado_contabilidad: e.target.checked })}
                  className="w-4 h-4 rounded border-[#F97316]/20 accent-[#F97316]" />
                <span className="text-gray-600">Obligado a llevar contabilidad</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={config.regimen_rimpe}
                  onChange={e => setConfig({ ...config, regimen_rimpe: e.target.checked })}
                  className="w-4 h-4 rounded border-[#F97316]/20 accent-[#F97316]" />
                <span className="text-gray-600">Contribuyente Régimen RIMPE</span>
              </label>
              <div>
                <Label className="text-gray-600">Tipo de contribuyente</Label>
                <select value={config.tipo_contribuyente}
                  onChange={e => setConfig({ ...config, tipo_contribuyente: e.target.value })}
                  className="w-full h-10 rounded-md border border-[#F97316]/20 bg-white text-gray-900 px-3 text-sm">
                  <option value="sociedad">Sociedad (Formulario 101)</option>
                  <option value="persona_natural">Persona Natural / Sucesión Indivisa (Formulario 102)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Determina qué declaración de Impuesto a la Renta se muestra en Contabilidad → Formularios SRI.</p>
              </div>
              <div>
                <Label className="text-gray-600">Contribuyente Especial N°</Label>
                <Input value={config.contribuyente_especial} onChange={e => setConfig({ ...config, contribuyente_especial: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" placeholder="Dejar vacío si no aplica" />
              </div>
              <div>
                <Label className="text-gray-600">Agente de Retención N°</Label>
                <Input value={config.agente_retencion} onChange={e => setConfig({ ...config, agente_retencion: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" placeholder="Dejar vacío si no aplica" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ley de Turismo (restaurantes turísticos categorizados) */}
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <CardTitle className="text-gray-900">Reglamento Ley de Turismo</CardTitle>
            <CardDescription>Aplica a restaurantes inscritos en el Registro Nacional de Turismo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-600">N° Registro Nacional de Turismo</Label>
                <Input value={config.numero_registro_turismo || ''}
                  onChange={e => setConfig({ ...config, numero_registro_turismo: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" placeholder="Ej: 0917-XXXX" />
              </div>
              <div>
                <Label className="text-gray-600">Categoría (tenedores)</Label>
                <select value={config.categoria_tenedores ?? 0}
                  onChange={e => setConfig({ ...config, categoria_tenedores: Number(e.target.value) })}
                  className="w-full h-10 rounded-md border border-[#F97316]/20 bg-white text-gray-900 px-3 text-sm">
                  <option value={0}>Sin categorizar</option>
                  <option value={1}>1 tenedor</option>
                  <option value={2}>2 tenedores</option>
                  <option value={3}>3 tenedores</option>
                  <option value={4}>4 tenedores</option>
                  <option value={5}>5 tenedores</option>
                </select>
              </div>
              <div>
                <Label className="text-gray-600">N° LUAF</Label>
                <Input value={config.luaf_numero || ''}
                  onChange={e => setConfig({ ...config, luaf_numero: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" placeholder="Licencia Única Anual de Funcionamiento" />
              </div>
              <div>
                <Label className="text-gray-600">LUAF — Fecha emisión</Label>
                <Input type="date" value={config.luaf_fecha_emision || ''}
                  onChange={e => setConfig({ ...config, luaf_fecha_emision: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" />
              </div>
              <div>
                <Label className="text-gray-600">LUAF — Fecha vencimiento</Label>
                <Input type="date" value={config.luaf_fecha_vencimiento || ''}
                  onChange={e => setConfig({ ...config, luaf_fecha_vencimiento: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" />
                <p className="text-xs text-gray-400 mt-1">Operar sin LUAF vigente conlleva clausura del establecimiento.</p>
              </div>
            </div>
            <div className="border-t border-[#F97316]/10 pt-4 space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={config.cobra_servicio_10pct || false}
                  onChange={e => setConfig({ ...config, cobra_servicio_10pct: e.target.checked })}
                  className="w-4 h-4 rounded border-[#F97316]/20 accent-[#F97316]" />
                <span className="text-gray-700 font-medium">Cobrar 10% de servicio en facturas (obligatorio para restaurantes turísticos categorizados ≥ 2 tenedores)</span>
              </label>
              {config.cobra_servicio_10pct && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-600">Porcentaje de servicio (%)</Label>
                    <Input type="number" min={0} max={20} step={0.5}
                      value={config.porcentaje_servicio ?? 10}
                      onChange={e => setConfig({ ...config, porcentaje_servicio: Number(e.target.value) })}
                      className="bg-white border-[#F97316]/20 text-gray-900" />
                  </div>
                  <div className="text-xs text-gray-500 self-end pb-2">
                    Se calcula sobre el subtotal antes de IVA. Se acumula en cuenta <b>2010706 Servicio 10% por Pagar</b> y debe distribuirse mensualmente entre todos los empleados (módulo Talento Humano).
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Canales de Venta — Delivery Apps */}
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <CardTitle className="text-gray-900">Canales de Venta y Delivery</CardTitle>
            <CardDescription>
              Define las comisiones que cobra cada plataforma. Se aplican automáticamente al registrar una venta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-3 text-gray-700 font-medium">Canal</th>
                    <th className="text-left py-2 px-3 text-gray-700 font-medium">Código</th>
                    <th className="text-right py-2 px-3 text-gray-700 font-medium">Comisión %</th>
                    <th className="text-center py-2 px-3 text-gray-700 font-medium">Activo</th>
                    <th className="text-center py-2 px-3 text-gray-700 font-medium">Color</th>
                    <th className="text-center py-2 px-3 text-gray-700 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(config.canales_venta || []).map((canal: any, idx: number) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2 px-3">
                        <Input value={canal.nombre}
                          onChange={e => {
                            const arr = [...(config.canales_venta || [])];
                            arr[idx] = { ...arr[idx], nombre: e.target.value };
                            setConfig({ ...config, canales_venta: arr });
                          }}
                          className="bg-white border-[#F97316]/20 text-gray-900 h-8" />
                      </td>
                      <td className="py-2 px-3">
                        <Input value={canal.codigo}
                          onChange={e => {
                            const arr = [...(config.canales_venta || [])];
                            arr[idx] = { ...arr[idx], codigo: e.target.value.toLowerCase().replace(/\s+/g, '_') };
                            setConfig({ ...config, canales_venta: arr });
                          }}
                          disabled={canal.codigo === 'directo'}
                          className="bg-white border-[#F97316]/20 text-gray-900 h-8 font-mono text-xs" />
                      </td>
                      <td className="py-2 px-3">
                        <Input type="number" min={0} max={100} step={0.5} value={canal.comision_pct}
                          onChange={e => {
                            const arr = [...(config.canales_venta || [])];
                            arr[idx] = { ...arr[idx], comision_pct: Number(e.target.value) || 0 };
                            setConfig({ ...config, canales_venta: arr });
                          }}
                          disabled={canal.codigo === 'directo'}
                          className="bg-white border-[#F97316]/20 text-gray-900 h-8 text-right" />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input type="checkbox" checked={canal.activo}
                          onChange={e => {
                            const arr = [...(config.canales_venta || [])];
                            arr[idx] = { ...arr[idx], activo: e.target.checked };
                            setConfig({ ...config, canales_venta: arr });
                          }}
                          className="w-4 h-4 accent-[#F97316]" />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input type="color" value={canal.color}
                          onChange={e => {
                            const arr = [...(config.canales_venta || [])];
                            arr[idx] = { ...arr[idx], color: e.target.value };
                            setConfig({ ...config, canales_venta: arr });
                          }}
                          className="w-8 h-6 rounded border border-gray-200" />
                      </td>
                      <td className="py-2 px-3 text-center">
                        {canal.codigo !== 'directo' && (
                          <button type="button" onClick={() => {
                            const arr = (config.canales_venta || []).filter((_: any, i: number) => i !== idx);
                            setConfig({ ...config, canales_venta: arr });
                          }} className="text-red-500 hover:text-red-700 text-xs">Eliminar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button"
              onClick={() => {
                const arr = [...(config.canales_venta || [])];
                arr.push({ codigo: `canal_${arr.length}`, nombre: 'Nuevo canal', comision_pct: 20, activo: true, color: '#888888' });
                setConfig({ ...config, canales_venta: arr });
              }}
              className="text-sm text-[#F97316] hover:text-[#C2410C] font-medium">
              + Agregar canal personalizado
            </button>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
              <strong>💡 Cómo se aplica:</strong> al registrar una venta por POS o cerrar mesa, se selecciona el canal. El sistema calcula automáticamente la comisión (como gasto contable en cuenta <code>520106</code>) y reporta el ingreso neto real. Los reportes de Business Intelligence separan ventas por canal para que veas tu margen real después de comisiones.
            </div>
          </CardContent>
        </Card>

        {/* Numeración */}
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <CardTitle className="text-gray-900">Numeración de Comprobantes</CardTitle>
            <CardDescription>Código de establecimiento, punto de emisión y secuencial</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-600">Código Establecimiento</Label>
                <Input value={config.codigo_establecimiento} onChange={e => setConfig({ ...config, codigo_establecimiento: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" maxLength={3} placeholder="001" />
              </div>
              <div>
                <Label className="text-gray-600">Punto de Emisión</Label>
                <Input value={config.punto_emision} onChange={e => setConfig({ ...config, punto_emision: e.target.value })}
                  className="bg-white border-[#F97316]/20 text-gray-900" maxLength={3} placeholder="001" />
              </div>
              <div>
                <Label className="text-gray-600">Secuencial Actual</Label>
                <Input type="number" value={config.secuencial_actual} onChange={e => setConfig({ ...config, secuencial_actual: parseInt(e.target.value) || 1 })}
                  className="bg-white border-[#F97316]/20 text-gray-900" min={1} />
              </div>
            </div>
            <div className="bg-[#F97316]/10 border border-[#F97316]/20 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                Próximo comprobante: <span className="text-[#F97316] font-bold font-mono">
                  {config.codigo_establecimiento}-{config.punto_emision}-{String(config.secuencial_actual).padStart(9, '0')}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Ambiente SRI */}
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <CardTitle className="text-gray-900">Ambiente SRI</CardTitle>
            <CardDescription>Seleccione el ambiente de emisión</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              {['pruebas', 'produccion'].map(amb => (
                <label key={amb} className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="ambiente" value={amb} checked={config.ambiente === amb}
                    onChange={() => setConfig({ ...config, ambiente: amb })} className="w-4 h-4 accent-[#F97316]" />
                  <span className="text-gray-600 capitalize">{amb === 'pruebas' ? '🧪 Pruebas' : '🚀 Producción'}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-amber-400 mt-3">
              ⚠️ Use Pruebas durante la implementación. Cambie a Producción solo después de completar la homologación con el SRI.
            </p>
          </CardContent>
        </Card>

        {/* Botón guardar config */}
        <div className="flex justify-end">
          <Button type="submit" disabled={loading}
            className="bg-gradient-to-r from-[#F97316] to-[#C2410C] hover:from-[#F97316]/80 hover:to-[#C2410C]/80 px-8">
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Guardando...' : 'Guardar Configuración'}
          </Button>
        </div>
      </form>

      {/* ── Diagnóstico de conexión SRI ── */}
      <Card className="bg-white border-[#F97316]/20">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Wifi className="w-5 h-5 text-[#F97316]" />
            Diagnóstico de Conexión SRI
          </CardTitle>
          <CardDescription>
            Verifica que el servidor puede comunicarse con los servicios web del SRI Ecuador
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            onClick={testearConexionSRI}
            disabled={testLoading}
            className="bg-gradient-to-r from-[#C2410C] to-[#F97316] hover:opacity-90"
          >
            {testLoading
              ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Probando conexión...</>
              : <><Wifi className="w-4 h-4 mr-2" />Probar conexión con SRI</>
            }
          </Button>

          {testResult && (
            <div className="space-y-3 mt-2">
              {/* Diagnóstico general */}
              <div className={`flex items-center gap-3 rounded-lg p-3 border ${
                testResult.diagnostico?.startsWith('✅')
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-red-50 border-red-300 text-red-600'
              }`}>
                {testResult.diagnostico?.startsWith('✅')
                  ? <Wifi className="w-5 h-5 shrink-0" />
                  : <WifiOff className="w-5 h-5 shrink-0" />}
                <span className="font-medium">{testResult.diagnostico || testResult.error}</span>
              </div>

              {/* Detalles técnicos */}
              <div className="bg-gray-50 border border-[#F97316]/10 rounded-lg p-3 text-xs font-mono space-y-2">
                {testResult.wsdl_recepcion && (
                  <div>
                    <span className={`font-bold ${testResult.wsdl_recepcion.ok ? 'text-green-400' : 'text-red-400'}`}>
                      WSDL Recepción:
                    </span>
                    <span className="text-gray-600 ml-2">
                      {testResult.wsdl_recepcion.ok
                        ? `HTTP ${testResult.wsdl_recepcion.status} — ${testResult.wsdl_recepcion.bytes} bytes`
                        : testResult.wsdl_recepcion.error}
                    </span>
                  </div>
                )}
                {testResult.wsdl_autorizacion && (
                  <div>
                    <span className={`font-bold ${testResult.wsdl_autorizacion.ok ? 'text-green-400' : 'text-red-400'}`}>
                      WSDL Autorización:
                    </span>
                    <span className="text-gray-600 ml-2">
                      {testResult.wsdl_autorizacion.ok
                        ? `HTTP ${testResult.wsdl_autorizacion.status} — ${testResult.wsdl_autorizacion.bytes} bytes`
                        : testResult.wsdl_autorizacion.error}
                    </span>
                  </div>
                )}
                {testResult.soap_recepcion_test && (
                  <div>
                    <span className={`font-bold ${testResult.soap_recepcion_test.sri_respondio ? 'text-green-400' : 'text-red-400'}`}>
                      SOAP Recepción:
                    </span>
                    <span className="text-gray-600 ml-2">
                      {testResult.soap_recepcion_test.sri_respondio
                        ? `SRI respondió (recibida=${testResult.soap_recepcion_test.recibida}, devuelta=${testResult.soap_recepcion_test.devuelta})`
                        : `Sin respuesta — ${testResult.soap_recepcion_test.errores?.[0] || 'timeout'}`}
                    </span>
                  </div>
                )}
                {testResult.soap_recepcion_test?.rawResponse && (
                  <div className="mt-2">
                    <span className="text-gray-600 font-bold">Respuesta raw SRI:</span>
                    <pre className="text-gray-600 mt-1 whitespace-pre-wrap break-all text-[10px] max-h-40 overflow-auto">
                      {testResult.soap_recepcion_test.rawResponse}
                    </pre>
                  </div>
                )}
                {testResult.configuracion && (
                  <div className="border-t border-[#F97316]/10 pt-2 mt-2">
                    <span className="text-[#F97316] font-bold">Config:</span>
                    <span className="text-gray-600 ml-2">
                      RUC={testResult.configuracion.ruc_configurado ? '✓' : '✗'}
                      {' | '}cert={testResult.configuracion.tiene_certificado ? `✓ (${testResult.configuracion.cert_titular})` : '✗ sin certificado'}
                      {' | '}ambiente={testResult.configuracion.ambiente}
                    </span>
                  </div>
                )}
              </div>

              {!testResult.soap_recepcion_test?.sri_respondio && !testResult.error && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300 space-y-1">
                  <p className="font-semibold">Posibles causas si SRI no responde:</p>
                  <p>• <strong>Bloqueo de IP:</strong> SRI Ecuador bloquea conexiones desde proveedores de nube (AWS, Google, Cloudflare). Esto requiere un proxy o servidor propio.</p>
                  <p>• <strong>Servidor SRI caído:</strong> El servidor de pruebas <em>celcer.sri.gob.ec</em> puede tener mantenimiento programado.</p>
                  <p>• <strong>SSL/TLS:</strong> El certificado SSL del SRI puede no ser reconocido por Deno.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Diagnóstico de Email (Resend) ── */}
      <Card className="bg-white border-[#F97316]/20">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-[#F97316]" />
            Diagnóstico de Envío de Emails
          </CardTitle>
          <CardDescription>
            Verifica que Resend esté configurado correctamente y envía un email de prueba
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="email@destino.com (opcional — usa el email del emisor si se deja vacío)"
              value={emailTestDest}
              onChange={e => setEmailTestDest(e.target.value)}
              className="bg-gray-50 border-gray-200 text-gray-900 flex-1"
            />
            <Button
              type="button"
              onClick={testearEmail}
              disabled={emailTestLoading}
              className="bg-gradient-to-r from-blue-600 to-blue-500 hover:opacity-90 shrink-0"
            >
              {emailTestLoading
                ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Probando...</>
                : <><Send className="w-4 h-4 mr-2" />Probar Email</>
              }
            </Button>
          </div>

          {emailTestResult && (
            <div className="space-y-3">
              {/* Diagnóstico principal */}
              <div className={`flex items-start gap-3 rounded-lg p-3 border ${
                emailTestResult.diagnostico?.startsWith('✅')
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : emailTestResult.diagnostico?.startsWith('⚠️')
                  ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                  : 'bg-red-50 border-red-300 text-red-600'
              }`}>
                <Mail className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{emailTestResult.diagnostico}</p>
                  {emailTestResult.sugerencia && (
                    <p className="text-sm mt-1">{emailTestResult.sugerencia}</p>
                  )}
                </div>
              </div>

              {/* Detalles técnicos */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono space-y-1.5">
                {emailTestResult.secrets && (
                  <>
                    <div>
                      <span className={`font-bold ${emailTestResult.secrets.resend_api_key_set ? 'text-green-600' : 'text-red-500'}`}>
                        RESEND_API_KEY:
                      </span>
                      <span className="text-gray-600 ml-2">{emailTestResult.secrets.resend_api_key_prefix}</span>
                    </div>
                    <div>
                      <span className={`font-bold ${emailTestResult.secrets.resend_from_domain_set ? 'text-green-600' : 'text-yellow-600'}`}>
                        RESEND_FROM_DOMAIN:
                      </span>
                      <span className="text-gray-600 ml-2">{emailTestResult.secrets.resend_from_domain}</span>
                    </div>
                  </>
                )}
                {emailTestResult.from_calculado && (
                  <div>
                    <span className="font-bold text-blue-600">From (calculado):</span>
                    <span className="text-gray-600 ml-2">{emailTestResult.from_calculado}</span>
                  </div>
                )}
                {emailTestResult.destinatario_prueba && (
                  <div>
                    <span className="font-bold text-blue-600">Enviado a:</span>
                    <span className="text-gray-600 ml-2">{emailTestResult.destinatario_prueba}</span>
                  </div>
                )}
                {emailTestResult.resend_http_status && (
                  <div>
                    <span className={`font-bold ${emailTestResult.resend_http_status < 300 ? 'text-green-600' : 'text-red-500'}`}>
                      Resend HTTP {emailTestResult.resend_http_status}:
                    </span>
                    <span className="text-gray-600 ml-2 break-all">
                      {JSON.stringify(emailTestResult.resend_response)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Firma Electrónica (fuera del form) ── */}
      <Card className="bg-white border-[#F97316]/20">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#F97316]" />
            Firma Electrónica Digital (P12 / PFX)
          </CardTitle>
          <CardDescription>
            Certificado digital emitido por el Banco Central del Ecuador o entidad autorizada.
            Requerido para que el SRI autorice los comprobantes electrónicos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* HOW IT WORKS */}
          <div className="bg-[#F97316]/5 border border-[#F97316]/20 rounded-lg p-4">
            <p className="text-xs text-[#F97316] font-semibold mb-1">¿Cómo funciona para tu empresa?</p>
            <p className="text-xs text-gray-600 leading-relaxed">
              La contraseña de tu firma electrónica se ingresa <strong className="text-gray-900">una sola vez aquí</strong>.
              El servidor la guarda de forma segura y la usa automáticamente para firmar cada factura al momento de emitirla —
              sin necesidad de ingresarla de nuevo. Así el proceso es transparente para los cajeros y el sistema autoriza
              los comprobantes en tiempo real ante el SRI.
            </p>
          </div>

          {/* Current cert status */}
          {certInfo ? (
            <div className={`rounded-lg p-4 border ${certInfo.info.vigente
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex items-start gap-3">
                {certInfo.info.vigente
                  ? <ShieldCheck className="w-6 h-6 text-green-400 mt-0.5 shrink-0" />
                  : <ShieldX className="w-6 h-6 text-red-400 mt-0.5 shrink-0" />}
                <div className="flex-1">
                  <p className={`font-semibold ${certInfo.info.vigente ? 'text-green-400' : 'text-red-400'}`}>
                    {certInfo.info.vigente ? '✓ Certificado vigente y activo' : '✗ Certificado vencido'}
                  </p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-2 text-sm">
                    <div>
                      <span className="text-gray-600">Archivo: </span>
                      <span className="text-gray-900">{certInfo.nombre}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Titular: </span>
                      <span className="text-gray-900">{certInfo.info.titular}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Emisor: </span>
                      <span className="text-gray-600">{certInfo.info.emisor}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Válido hasta: </span>
                      <span className={certInfo.info.vigente ? 'text-green-400' : 'text-red-400'}>
                        {formatDate(certInfo.info.valido_hasta)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Válido desde: </span>
                      <span className="text-gray-600">{formatDate(certInfo.info.valido_desde)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Cargado: </span>
                      <span className="text-gray-600">{formatDate(certInfo.subido_en)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                No hay certificado digital cargado. Las facturas generadas quedarán sin firma y el SRI no las autorizará.
              </p>
            </div>
          )}

          {/* Upload section */}
          <div className="space-y-4">
            <div>
              <Label className="text-gray-600 mb-2 block">
                {certInfo ? 'Actualizar certificado' : 'Cargar certificado (.p12 / .pfx)'}
              </Label>
              <label className="flex items-center justify-center w-full px-4 py-5 border-2 border-dashed border-[#F97316]/20 rounded-lg cursor-pointer hover:border-[#F97316]/50 transition-colors group">
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-gray-600 group-hover:text-[#F97316] transition-colors mb-2" />
                  {selectedFile ? (
                    <p className="text-[#F97316] font-medium">{selectedFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600">
                        <span className="text-[#F97316]">Haz clic</span> o arrastra el archivo aquí
                      </p>
                      <p className="text-xs text-gray-600 mt-1">Formatos: .p12 · .pfx</p>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} id="cert-file" type="file" accept=".p12,.pfx"
                  onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            <div>
              <Label className="text-gray-600 mb-2 block">Contraseña del certificado</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={certPassword}
                  onChange={e => setCertPassword(e.target.value)}
                  placeholder="Contraseña de la firma electrónica"
                  className="bg-white border-[#F97316]/20 text-gray-900 pr-10"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="button" onClick={handleUploadCert}
              disabled={certLoading || !selectedFile || !certPassword}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:opacity-50">
              {certLoading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Validando certificado...</>
                : <><CheckCircle className="w-4 h-4 mr-2" />Cargar y Validar Certificado</>
              }
            </Button>
          </div>

          {/* Help text */}
          <div className="bg-white border border-[#F97316]/10 rounded-lg p-4 text-xs text-gray-600 space-y-1">
            <p className="font-semibold text-gray-600 mb-2">ℹ️ Sobre la firma electrónica</p>
            <p>• El certificado debe ser emitido por el <strong className="text-gray-900">Banco Central del Ecuador (BCE)</strong> o una entidad certificadora autorizada (Security Data, ANF, etc.).</p>
            <p>• El RUC del certificado debe coincidir con el RUC configurado como emisor.</p>
            <p>• El certificado se almacena de forma segura en el servidor y nunca se expone al cliente.</p>
            <p>• Para ambiente de <strong className="text-gray-900">Producción</strong>, primero debe completar el proceso de homologación con el SRI.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
