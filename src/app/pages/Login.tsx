import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Lock, Mail, User, Building, Hash } from 'lucide-react';
import { DatabaseSetupAlert } from '../components/DatabaseSetupAlert';
import { CreateSuperAdmin } from '../components/CreateSuperAdmin';
import { PlanSelector } from '../components/PlanSelector';
import { MARLogo } from '../components/MARLogo';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [showDatabaseAlert, setShowDatabaseAlert] = useState(false);
  const [showSuperAdminForm, setShowSuperAdminForm] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [signupData, setSignupData] = useState({
    empresa_nombre: '',
    empresa_ruc: '',
    empresa_email: '',
    usuario_nombre: '',
    usuario_email: '',
    usuario_password: '',
    plan_tipo: 'basico'
  });
  const [superAdminData, setSuperAdminData] = useState({
    nombre: '',
    email: '',
    password: ''
  });
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      console.log('🔐 Intentando login...');
      await login(loginData.email, loginData.password);
      console.log('✅ Login exitoso');
      toast.success('Bienvenido al sistema');
      navigate('/');
    } catch (error: any) {
      console.error('❌ Error en login:', error);
      
      // Detectar si el error es por registro incompleto
      if (error.message.includes('REGISTRO INCOMPLETO') ||
          error.message.includes('INCOMPLETE_REGISTRATION')) {
        // Mostrar mensaje detallado sobre registro incompleto
        const errorMsg = error.message.split('instrucciones')[0]; // Extraer solo el mensaje principal
        toast.error(errorMsg, { duration: 10000 });
        
        // Mostrar alert con instrucciones completas
        setTimeout(() => {
          alert(
            '❌ REGISTRO INCOMPLETO\n\n' +
            'Tu usuario fue creado en la autenticación pero el registro no se completó.\n\n' +
            'SOLUCIÓN:\n' +
            '1. Ve a Supabase Auth Dashboard\n' +
            '2. Busca y BORRA tu usuario\n' +
            '3. Vuelve a registrarte\n\n' +
            'O contacta al administrador del sistema.'
          );
        }, 500);
        return;
      }
      
      // Detectar si el error es por tablas faltantes
      if (error.message.includes('BASE DE DATOS NO CONFIGURADA') ||
          error.message.includes('DATABASE_NOT_SETUP') ||
          error.message.includes('tabla') || 
          error.message.includes('table') || 
          error.message.includes('Could not find') ||
          error.message.includes('schema cache') ||
          error.message.includes('does not exist') ||
          error.message.includes('SETUP_COMPLETO.sql')) {
        setShowDatabaseAlert(true);
        toast.error('⚠️ Base de datos no configurada. Debes ejecutar el script SQL.');
      } else {
        toast.error(error.message || 'Error al iniciar sesión');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      console.log('🚀 [REGISTRO] Iniciando registro...');
      console.log('📝 [REGISTRO] Datos a enviar:', {
        empresa_nombre: signupData.empresa_nombre,
        empresa_ruc: signupData.empresa_ruc,
        empresa_email: signupData.empresa_email,
        usuario_nombre: signupData.usuario_nombre,
        usuario_email: signupData.usuario_email,
        plan_tipo: signupData.plan_tipo,
      });

      const url = `https://${projectId}.supabase.co/functions/v1/server/auth/signup`;
      console.log('🌐 [REGISTRO] URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(signupData),
      });

      console.log('📡 [REGISTRO] Response status:', response.status);
      console.log('📡 [REGISTRO] Response statusText:', response.statusText);
      
      const data = await response.json();
      console.log('📡 [REGISTRO] Response data:', data);

      if (!response.ok) {
        console.error('❌ [REGISTRO] Error en respuesta:', data);
        
        // Si el servidor envía un error estructurado con instrucciones
        if (data.instrucciones && Array.isArray(data.instrucciones)) {
          console.error('🚨 [REGISTRO] Base de datos no configurada - Error estructurado:', data);
          console.error('📋 Instrucciones:', data.instrucciones);
          
          // Mostrar alerta con instrucciones detalladas
          alert(
            `${data.error || '🚨 BASE DE DATOS NO CONFIGURADA'}\n\n` +
            `${data.mensaje || 'Debes ejecutar el script SETUP_COMPLETO.sql'}\n\n` +
            `INSTRUCCIONES:\n` +
            data.instrucciones.join('\n') +
            `\n\nDetalles técnicos: ${data.detalles_tecnicos || ''}`
          );
          
          setShowDatabaseAlert(true);
          throw new Error(data.mensaje || data.error || 'Error de configuración de base de datos');
        }
        
        throw new Error(data.error || data.message || 'Error al registrar empresa');
      }

      console.log('✅ [REGISTRO] Registro exitoso!');
      toast.success('✅ Empresa registrada exitosamente. Por favor inicia sesión.');
      
      // Cambiar a tab de login y pre-llenar email
      setLoginData({ email: signupData.usuario_email, password: '' });
      
      // Limpiar formulario
      setSignupData({
        empresa_nombre: '',
        empresa_ruc: '',
        empresa_email: '',
        usuario_nombre: '',
        usuario_email: '',
        usuario_password: '',
        plan_tipo: 'basico'
      });
      
      // IMPORTANTE: Intentar login automático después del registro exitoso
      // Esto asegura que el usuario esté completamente configurado
      console.log('🔐 [REGISTRO] Intentando login automático...');
      try {
        await login(signupData.usuario_email, signupData.usuario_password);
        toast.success('¡Bienvenido! Tu cuenta ha sido creada exitosamente.');
        navigate('/');
      } catch (loginError: any) {
        console.error('⚠ [REGISTRO] Login automático falló:', loginError);
        toast.warning('Registro exitoso. Por favor inicia sesión manualmente.');
        
        // Pre-llenar el formulario de login
        setLoginData({ email: signupData.usuario_email, password: '' });
        
        // Limpiar formulario de registro
        setSignupData({
          empresa_nombre: '',
          empresa_ruc: '',
          empresa_email: '',
          usuario_nombre: '',
          usuario_email: '',
          usuario_password: '',
          plan_tipo: 'basico'
        });
      }
      
    } catch (error: any) {
      console.error('❌ [REGISTRO] Error completo:', error);
      console.error('❌ [REGISTRO] Error message:', error.message);
      console.error('❌ [REGISTRO] Error stack:', error.stack);
      
      // Detectar si el error es por tablas faltantes
      if (error.message.includes('BASE DE DATOS NO CONFIGURADA') ||
          error.message.includes('DATABASE_NOT_SETUP') ||
          error.message.includes('tabla') || 
          error.message.includes('table') || 
          error.message.includes('relation') ||
          error.message.includes('Could not find') ||
          error.message.includes('schema cache') ||
          error.message.includes('does not exist') ||
          error.message.includes('SETUP_COMPLETO.sql') ||
          error.message.includes('schema SQL')) {
        console.error('🚨 [REGISTRO] Base de datos no configurada');
        setShowDatabaseAlert(true);
        toast.error('⚠️ Base de datos no configurada. Debes ejecutar el script SQL.');
      } else {
        toast.error(error.message || 'Error al registrar');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Mostrar alerta de configuración de BD si es necesario
  if (showDatabaseAlert) {
    return <DatabaseSetupAlert />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#0F2640] to-[#1a3a52] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00E5FF] rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#7B61FF] rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <Card className="w-full max-w-md bg-[#0A1A2F]/80 backdrop-blur-xl border-[#00E5FF]/30 shadow-2xl shadow-[#00E5FF]/10 relative z-10">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <MARLogo className="w-20 h-20" gradientId="loginMarGradient" />
            </div>
          </div>
          <CardTitle className="text-4xl font-bold text-white tracking-wider">
            M.A.R
          </CardTitle>
          <CardDescription className="text-gray-400 text-base">
            Modular Administration Resource
          </CardDescription>
          <p className="text-gray-500 text-sm">
            Sistema ERP completo para PYMEs
          </p>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-white/5 border border-[#00E5FF]/20">
              <TabsTrigger 
                value="login"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#1e64a7] data-[state=active]:to-[#00E5FF] data-[state=active]:text-white"
              >
                Iniciar Sesión
              </TabsTrigger>
              <TabsTrigger 
                value="signup"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#1e64a7] data-[state=active]:to-[#00E5FF] data-[state=active]:text-white"
              >
                Registrarse
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="usuario@empresa.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      required
                      className="pl-10 bg-white/5 border-[#00E5FF]/20 text-white placeholder:text-gray-500 focus:border-[#00E5FF]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-300">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      required
                      className="pl-10 bg-white/5 border-[#00E5FF]/20 text-white placeholder:text-gray-500 focus:border-[#00E5FF]"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:shadow-lg hover:shadow-[#00E5FF]/30 transition-all duration-200"
                >
                  {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-4 border-b border-[#00E5FF]/20 pb-4">
                  <p className="text-sm text-gray-400">Datos de la Empresa</p>
                  
                  <div className="space-y-2">
                    <Label htmlFor="empresa_nombre" className="text-gray-300">Nombre de la Empresa</Label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="empresa_nombre"
                        value={signupData.empresa_nombre}
                        onChange={(e) => setSignupData({ ...signupData, empresa_nombre: e.target.value })}
                        required
                        className="pl-10 bg-white/5 border-[#00E5FF]/20 text-white placeholder:text-gray-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="empresa_ruc" className="text-gray-300">RUC/NIT</Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="empresa_ruc"
                        value={signupData.empresa_ruc}
                        onChange={(e) => setSignupData({ ...signupData, empresa_ruc: e.target.value })}
                        required
                        className="pl-10 bg-white/5 border-[#00E5FF]/20 text-white placeholder:text-gray-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="empresa_email" className="text-gray-300">Email Empresa</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="empresa_email"
                        type="email"
                        value={signupData.empresa_email}
                        onChange={(e) => setSignupData({ ...signupData, empresa_email: e.target.value })}
                        required
                        className="pl-10 bg-white/5 border-[#00E5FF]/20 text-white placeholder:text-gray-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-gray-400">Datos del Administrador</p>
                  
                  <div className="space-y-2">
                    <Label htmlFor="usuario_nombre" className="text-gray-300">Nombre Completo</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="usuario_nombre"
                        value={signupData.usuario_nombre}
                        onChange={(e) => setSignupData({ ...signupData, usuario_nombre: e.target.value })}
                        required
                        className="pl-10 bg-white/5 border-[#00E5FF]/20 text-white placeholder:text-gray-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="usuario_email" className="text-gray-300">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="usuario_email"
                        type="email"
                        value={signupData.usuario_email}
                        onChange={(e) => setSignupData({ ...signupData, usuario_email: e.target.value })}
                        required
                        className="pl-10 bg-white/5 border-[#00E5FF]/20 text-white placeholder:text-gray-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="usuario_password" className="text-gray-300">Contraseña</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="usuario_password"
                        type="password"
                        value={signupData.usuario_password}
                        onChange={(e) => setSignupData({ ...signupData, usuario_password: e.target.value })}
                        required
                        minLength={6}
                        className="pl-10 bg-white/5 border-[#00E5FF]/20 text-white placeholder:text-gray-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-gray-400">Plan de Suscripción</p>
                  <PlanSelector
                    selectedPlan={signupData.plan_tipo}
                    onSelectPlan={(plan) => {
                      console.log('📋 [LOGIN] Nuevo plan seleccionado:', plan);
                      setSignupData({ ...signupData, plan_tipo: plan });
                      console.log('📋 [LOGIN] signupData actualizado con plan:', plan);
                    }}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-[#7B61FF] to-[#00E5FF] hover:shadow-lg hover:shadow-[#7B61FF]/30 transition-all duration-200"
                >
                  {isLoading ? 'Registrando...' : 'Crear Empresa'}
                </Button>

                <p className="text-xs text-gray-400 text-center">
                  Incluye 30 días de prueba gratuita
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Componente para crear Super Admin */}
      <CreateSuperAdmin />
    </div>
  );
}