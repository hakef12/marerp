import { useState, useEffect, useRef } from 'react';
import { Save, Upload, CheckCircle, AlertCircle, KeyRound, ShieldCheck, ShieldX, Eye, EyeOff, Wifi, WifiOff, RefreshCw } from 'lucide-react';
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
    codigo_establecimiento: '001',
    punto_emision: '001',
    secuencial_actual: 1,
    firma_electronica_activa: false,
    firma_electronica_nombre: '',
    firma_electronica_validez: '',
    ambiente: 'pruebas',
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
        <h1 className="text-3xl font-bold text-white mb-2">
          Configuración de Facturación Electrónica
        </h1>
        <p className="text-gray-400">
          Configure los datos del emisor y la firma digital para emitir comprobantes válidos ante el SRI Ecuador
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos del Emisor */}
        <Card className="bg-[#0A1A2F]/50 border-[#00E5FF]/20">
          <CardHeader>
            <CardTitle className="text-white">Datos del Emisor</CardTitle>
            <CardDescription>Información del contribuyente que aparecerá en todos los comprobantes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Razón Social *</Label>
                <Input value={config.razon_social} onChange={e => setConfig({ ...config, razon_social: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" required />
              </div>
              <div>
                <Label className="text-gray-300">Nombre Comercial</Label>
                <Input value={config.nombre_comercial} onChange={e => setConfig({ ...config, nombre_comercial: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" placeholder="Si es diferente a razón social" />
              </div>
              <div>
                <Label className="text-gray-300">RUC * (13 dígitos)</Label>
                <Input value={config.ruc} onChange={e => setConfig({ ...config, ruc: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" maxLength={13} required placeholder="0000000000001" />
              </div>
              <div>
                <Label className="text-gray-300">Teléfono</Label>
                <Input value={config.telefono} onChange={e => setConfig({ ...config, telefono: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" placeholder="02-2000000" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-gray-300">Dirección Matriz *</Label>
                <Input value={config.direccion_matriz} onChange={e => setConfig({ ...config, direccion_matriz: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" required />
              </div>
              <div className="md:col-span-2">
                <Label className="text-gray-300">Dirección Establecimiento</Label>
                <Input value={config.direccion_establecimiento} onChange={e => setConfig({ ...config, direccion_establecimiento: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" placeholder="Si es diferente a la matriz" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-gray-300">Email para envío de comprobantes</Label>
                <Input type="email" value={config.email} onChange={e => setConfig({ ...config, email: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuración Tributaria */}
        <Card className="bg-[#0A1A2F]/50 border-[#00E5FF]/20">
          <CardHeader>
            <CardTitle className="text-white">Configuración Tributaria</CardTitle>
            <CardDescription>Información requerida por el SRI para los comprobantes electrónicos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={config.obligado_contabilidad}
                  onChange={e => setConfig({ ...config, obligado_contabilidad: e.target.checked })}
                  className="w-4 h-4 rounded border-[#00E5FF]/20 accent-[#00E5FF]" />
                <span className="text-gray-300">Obligado a llevar contabilidad</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={config.regimen_rimpe}
                  onChange={e => setConfig({ ...config, regimen_rimpe: e.target.checked })}
                  className="w-4 h-4 rounded border-[#00E5FF]/20 accent-[#00E5FF]" />
                <span className="text-gray-300">Contribuyente Régimen RIMPE</span>
              </label>
              <div>
                <Label className="text-gray-300">Contribuyente Especial N°</Label>
                <Input value={config.contribuyente_especial} onChange={e => setConfig({ ...config, contribuyente_especial: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" placeholder="Dejar vacío si no aplica" />
              </div>
              <div>
                <Label className="text-gray-300">Agente de Retención N°</Label>
                <Input value={config.agente_retencion} onChange={e => setConfig({ ...config, agente_retencion: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" placeholder="Dejar vacío si no aplica" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Numeración */}
        <Card className="bg-[#0A1A2F]/50 border-[#00E5FF]/20">
          <CardHeader>
            <CardTitle className="text-white">Numeración de Comprobantes</CardTitle>
            <CardDescription>Código de establecimiento, punto de emisión y secuencial</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-300">Código Establecimiento</Label>
                <Input value={config.codigo_establecimiento} onChange={e => setConfig({ ...config, codigo_establecimiento: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" maxLength={3} placeholder="001" />
              </div>
              <div>
                <Label className="text-gray-300">Punto de Emisión</Label>
                <Input value={config.punto_emision} onChange={e => setConfig({ ...config, punto_emision: e.target.value })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" maxLength={3} placeholder="001" />
              </div>
              <div>
                <Label className="text-gray-300">Secuencial Actual</Label>
                <Input type="number" value={config.secuencial_actual} onChange={e => setConfig({ ...config, secuencial_actual: parseInt(e.target.value) || 1 })}
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white" min={1} />
              </div>
            </div>
            <div className="bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-lg p-4">
              <p className="text-sm text-gray-300">
                Próximo comprobante: <span className="text-[#00E5FF] font-bold font-mono">
                  {config.codigo_establecimiento}-{config.punto_emision}-{String(config.secuencial_actual).padStart(9, '0')}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Ambiente SRI */}
        <Card className="bg-[#0A1A2F]/50 border-[#00E5FF]/20">
          <CardHeader>
            <CardTitle className="text-white">Ambiente SRI</CardTitle>
            <CardDescription>Seleccione el ambiente de emisión</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              {['pruebas', 'produccion'].map(amb => (
                <label key={amb} className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="ambiente" value={amb} checked={config.ambiente === amb}
                    onChange={() => setConfig({ ...config, ambiente: amb })} className="w-4 h-4 accent-[#00E5FF]" />
                  <span className="text-gray-300 capitalize">{amb === 'pruebas' ? '🧪 Pruebas' : '🚀 Producción'}</span>
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
            className="bg-gradient-to-r from-[#00E5FF] to-[#1e64a7] hover:from-[#00E5FF]/80 hover:to-[#1e64a7]/80 px-8">
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Guardando...' : 'Guardar Configuración'}
          </Button>
        </div>
      </form>

      {/* ── Diagnóstico de conexión SRI ── */}
      <Card className="bg-[#0A1A2F]/50 border-[#00E5FF]/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Wifi className="w-5 h-5 text-[#00E5FF]" />
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
            className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90"
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
                  ? 'bg-green-500/10 border-green-500/30 text-green-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                {testResult.diagnostico?.startsWith('✅')
                  ? <Wifi className="w-5 h-5 shrink-0" />
                  : <WifiOff className="w-5 h-5 shrink-0" />}
                <span className="font-medium">{testResult.diagnostico || testResult.error}</span>
              </div>

              {/* Detalles técnicos */}
              <div className="bg-[#060f1e] border border-[#00E5FF]/10 rounded-lg p-3 text-xs font-mono space-y-2">
                {testResult.wsdl_recepcion && (
                  <div>
                    <span className={`font-bold ${testResult.wsdl_recepcion.ok ? 'text-green-400' : 'text-red-400'}`}>
                      WSDL Recepción:
                    </span>
                    <span className="text-gray-300 ml-2">
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
                    <span className="text-gray-300 ml-2">
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
                    <span className="text-gray-300 ml-2">
                      {testResult.soap_recepcion_test.sri_respondio
                        ? `SRI respondió (recibida=${testResult.soap_recepcion_test.recibida}, devuelta=${testResult.soap_recepcion_test.devuelta})`
                        : `Sin respuesta — ${testResult.soap_recepcion_test.errores?.[0] || 'timeout'}`}
                    </span>
                  </div>
                )}
                {testResult.soap_recepcion_test?.rawResponse && (
                  <div className="mt-2">
                    <span className="text-gray-400 font-bold">Respuesta raw SRI:</span>
                    <pre className="text-gray-400 mt-1 whitespace-pre-wrap break-all text-[10px] max-h-40 overflow-auto">
                      {testResult.soap_recepcion_test.rawResponse}
                    </pre>
                  </div>
                )}
                {testResult.configuracion && (
                  <div className="border-t border-[#00E5FF]/10 pt-2 mt-2">
                    <span className="text-[#00E5FF] font-bold">Config:</span>
                    <span className="text-gray-300 ml-2">
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

      {/* ── Firma Electrónica (fuera del form) ── */}
      <Card className="bg-[#0A1A2F]/50 border-[#00E5FF]/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#00E5FF]" />
            Firma Electrónica Digital (P12 / PFX)
          </CardTitle>
          <CardDescription>
            Certificado digital emitido por el Banco Central del Ecuador o entidad autorizada.
            Requerido para que el SRI autorice los comprobantes electrónicos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* HOW IT WORKS */}
          <div className="bg-[#00E5FF]/5 border border-[#00E5FF]/20 rounded-lg p-4">
            <p className="text-xs text-[#00E5FF] font-semibold mb-1">¿Cómo funciona para tu empresa?</p>
            <p className="text-xs text-gray-300 leading-relaxed">
              La contraseña de tu firma electrónica se ingresa <strong className="text-white">una sola vez aquí</strong>.
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
                      <span className="text-gray-400">Archivo: </span>
                      <span className="text-white">{certInfo.nombre}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Titular: </span>
                      <span className="text-white">{certInfo.info.titular}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Emisor: </span>
                      <span className="text-gray-300">{certInfo.info.emisor}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Válido hasta: </span>
                      <span className={certInfo.info.vigente ? 'text-green-400' : 'text-red-400'}>
                        {formatDate(certInfo.info.valido_hasta)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Válido desde: </span>
                      <span className="text-gray-300">{formatDate(certInfo.info.valido_desde)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Cargado: </span>
                      <span className="text-gray-300">{formatDate(certInfo.subido_en)}</span>
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
              <Label className="text-gray-300 mb-2 block">
                {certInfo ? 'Actualizar certificado' : 'Cargar certificado (.p12 / .pfx)'}
              </Label>
              <label className="flex items-center justify-center w-full px-4 py-5 border-2 border-dashed border-[#00E5FF]/20 rounded-lg cursor-pointer hover:border-[#00E5FF]/50 transition-colors group">
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-gray-400 group-hover:text-[#00E5FF] transition-colors mb-2" />
                  {selectedFile ? (
                    <p className="text-[#00E5FF] font-medium">{selectedFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400">
                        <span className="text-[#00E5FF]">Haz clic</span> o arrastra el archivo aquí
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Formatos: .p12 · .pfx</p>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} id="cert-file" type="file" accept=".p12,.pfx"
                  onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            <div>
              <Label className="text-gray-300 mb-2 block">Contraseña del certificado</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={certPassword}
                  onChange={e => setCertPassword(e.target.value)}
                  placeholder="Contraseña de la firma electrónica"
                  className="bg-[#0A1A2F] border-[#00E5FF]/20 text-white pr-10"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
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
          <div className="bg-[#0A1A2F]/60 border border-[#00E5FF]/10 rounded-lg p-4 text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-300 mb-2">ℹ️ Sobre la firma electrónica</p>
            <p>• El certificado debe ser emitido por el <strong className="text-white">Banco Central del Ecuador (BCE)</strong> o una entidad certificadora autorizada (Security Data, ANF, etc.).</p>
            <p>• El RUC del certificado debe coincidir con el RUC configurado como emisor.</p>
            <p>• El certificado se almacena de forma segura en el servidor y nunca se expone al cliente.</p>
            <p>• Para ambiente de <strong className="text-white">Producción</strong>, primero debe completar el proceso de homologación con el SRI.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
