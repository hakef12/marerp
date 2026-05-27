import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Shield, Mail, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

export function CreateSuperAdmin() {
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [superAdminExists, setSuperAdminExists] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: ''
  });

  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/auth/super-admin-exists`,
          { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setSuperAdminExists(data.exists);
        }
      } catch {
        setSuperAdminExists(false);
      }
    };
    checkSuperAdmin();
  }, []);

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

  // No mostrar nada si ya existe un super admin o mientras se verifica
  if (superAdminExists === null || superAdminExists === true) return null;

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
            className="text-sm text-[#FB923C] hover:text-[#F97316] transition-colors flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-[#FB923C]/30 hover:border-[#F97316]/50"
          >
            <Shield className="w-4 h-4" />
            ¿Crear Super Admin?
          </button>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[100]">
          <Card className="w-full max-w-md bg-white border-[#FB923C]/50 shadow-2xl shadow-[#FB923C]/20">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FB923C] to-[#F97316] flex items-center justify-center">
                  <Shield className="w-6 h-6 text-gray-900" />
                </div>
                <div>
                  <CardTitle className="text-xl text-gray-900">Crear Super Admin</CardTitle>
                  <CardDescription className="text-gray-600">
                    Solo puede existir uno en el sistema
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="superadmin-nombre" className="text-gray-600">Nombre Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <Input
                      id="superadmin-nombre"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      required
                      className="pl-10 bg-gray-50 border-[#FB923C]/20 text-gray-900 placeholder:text-gray-400"
                      placeholder="Super Administrador"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="superadmin-email" className="text-gray-600">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <Input
                      id="superadmin-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="pl-10 bg-gray-50 border-[#FB923C]/20 text-gray-900 placeholder:text-gray-400"
                      placeholder="admin@sistema.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="superadmin-password" className="text-gray-600">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <Input
                      id="superadmin-password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                      className="pl-10 bg-gray-50 border-[#FB923C]/20 text-gray-900 placeholder:text-gray-400"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="bg-[#FB923C]/10 border border-[#FB923C]/30 rounded-lg p-3">
                  <p className="text-xs text-gray-600">
                    ⚠️ El Super Admin tendrá acceso completo a todas las empresas y configuraciones del sistema.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                    className="flex-1 border-gray-600 text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 bg-gradient-to-r from-[#FB923C] to-[#F97316] hover:shadow-lg hover:shadow-[#FB923C]/30"
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