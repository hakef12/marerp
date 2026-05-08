import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Shield, Mail, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

export function CreateSuperAdmin() {
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      
      console.log('Creando Super Admin...');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/auth/create-super-admin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify(formData)
        }
      );

      const data = await response.json();
      console.log('Response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear Super Admin');
      }

      toast.success('Super Admin creado exitosamente! Ahora puedes iniciar sesión.');
      setShowForm(false);
      setFormData({ nombre: '', email: '', password: '' });

    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al crear Super Admin');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Botón para mostrar el modal */}
      {!showForm && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={() => {
              console.log('Abriendo modal de Super Admin');
              setShowForm(true);
            }}
            className="text-sm text-[#7B61FF] hover:text-[#00E5FF] transition-colors flex items-center gap-2 bg-[#0A1A2F]/80 px-4 py-2 rounded-lg border border-[#7B61FF]/30 hover:border-[#00E5FF]/50 backdrop-blur-xl"
          >
            <Shield className="w-4 h-4" />
            ¿Crear Super Admin?
          </button>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <Card className="w-full max-w-md bg-[#0A1A2F]/95 backdrop-blur-xl border-[#7B61FF]/50 shadow-2xl shadow-[#7B61FF]/20">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#7B61FF] to-[#00E5FF] flex items-center justify-center">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl text-white">Crear Super Admin</CardTitle>
                  <CardDescription className="text-gray-400">
                    Solo puede existir uno en el sistema
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="superadmin-nombre" className="text-gray-300">Nombre Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="superadmin-nombre"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      required
                      className="pl-10 bg-white/5 border-[#7B61FF]/20 text-white placeholder:text-gray-500"
                      placeholder="Super Administrador"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="superadmin-email" className="text-gray-300">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="superadmin-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="pl-10 bg-white/5 border-[#7B61FF]/20 text-white placeholder:text-gray-500"
                      placeholder="admin@sistema.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="superadmin-password" className="text-gray-300">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="superadmin-password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                      className="pl-10 bg-white/5 border-[#7B61FF]/20 text-white placeholder:text-gray-500"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="bg-[#7B61FF]/10 border border-[#7B61FF]/30 rounded-lg p-3">
                  <p className="text-xs text-gray-400">
                    ⚠️ El Super Admin tendrá acceso completo a todas las empresas y configuraciones del sistema.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                    className="flex-1 border-gray-600 text-gray-400 hover:bg-white/5"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 bg-gradient-to-r from-[#7B61FF] to-[#00E5FF] hover:shadow-lg hover:shadow-[#7B61FF]/30"
                  >
                    {isLoading ? 'Creando...' : 'Crear Super Admin'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}