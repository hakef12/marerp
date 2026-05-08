import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  FolderKanban,
  Calendar,
  DollarSign,
  User,
  Building2,
  Target,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { ExportButtons } from '../components/ExportButtons';
import {
  exportToExcel,
  exportToPDF,
  formatCurrency,
  formatDate,
  prepareProjectsData
} from '../utils/exportUtils';

export default function Proyectos() {
  const { token } = useAuth();
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [centrosCostos, setCentrosCostos] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'>('all');
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    clientId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    status: 'planning' as 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled',
    budget: 0,
    actualCost: 0,
    costCenterId: '',
    manager: '',
    notes: '',
    active: true,
  });

  // Filtrar proyectos
  const filteredProjects = useMemo(() => {
    return proyectos.filter((p) => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.clientName && p.clientName.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
      
      return matchesSearch && matchesStatus;
    });
  }, [proyectos, searchTerm, filterStatus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const client = clientes.find((c) => c.id === formData.clientId);
    const projectData = {
      ...formData,
      clientName: client?.businessName || '',
      id: editingProject?.id || Date.now().toString(),
    };

    if (editingProject) {
      setProyectos(proyectos.map(p => p.id === editingProject.id ? projectData : p));
      toast.success('Proyecto actualizado exitosamente');
    } else {
      setProyectos([...proyectos, projectData]);
      toast.success('Proyecto creado exitosamente');
    }

    handleCloseModal();
  };

  const handleEdit = (project: any) => {
    setEditingProject(project);
    setFormData({
      code: project.code,
      name: project.name,
      description: project.description,
      clientId: project.clientId || '',
      startDate: project.startDate || new Date().toISOString().split('T')[0],
      endDate: project.endDate || '',
      status: project.status,
      budget: project.budget,
      actualCost: project.actualCost,
      costCenterId: project.costCenterId || '',
      manager: project.manager,
      notes: project.notes || '',
      active: project.active,
    });
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    setProyectos(proyectos.filter(p => p.id !== id));
    toast.success('Proyecto eliminado');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingProject(null);
    setFormData({
      code: '',
      name: '',
      description: '',
      clientId: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      status: 'planning',
      budget: 0,
      actualCost: 0,
      costCenterId: '',
      manager: '',
      notes: '',
      active: true,
    });
  };

  // ✅ FUNCIONES DE EXPORTACIÓN
  const handleExportExcel = useCallback(() => {
    const data = prepareProjectsData(filteredProjects);
    exportToExcel(data, 'Proyectos', 'Proyectos');
    toast.success('Proyectos exportados a Excel');
  }, [filteredProjects]);

  const handleExportPDF = useCallback(() => {
    const columns = [
      { header: 'Código', key: 'Código' },
      { header: 'Nombre', key: 'Nombre del Proyecto' },
      { header: 'Cliente', key: 'Cliente' },
      { header: 'Estado', key: 'Estado' },
      { header: 'Inicio', key: 'Fecha Inicio' },
      { header: 'Fin', key: 'Fecha Fin' },
      { header: 'Presupuesto', key: 'Presupuesto' },
      { header: 'Progreso', key: 'Progreso' },
    ];
    const data = prepareProjectsData(filteredProjects);
    exportToPDF(data, columns, 'Listado de Proyectos', 'Proyectos');
    toast.success('Proyectos exportados a PDF');
  }, [filteredProjects]);

  // KPIs
  const kpis = useMemo(() => {
    const totalProjects = proyectos.length;
    const activeProjects = proyectos.filter(p => p.status === 'in_progress').length;
    const completedProjects = proyectos.filter(p => p.status === 'completed').length;
    const totalBudget = proyectos.reduce((sum, p) => sum + p.budget, 0);
    const totalCost = proyectos.reduce((sum, p) => sum + p.actualCost, 0);
    const overBudget = proyectos.filter(p => p.actualCost > p.budget).length;

    return { totalProjects, activeProjects, completedProjects, totalBudget, totalCost, overBudget };
  }, [proyectos]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'in_progress':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'on_hold':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Completado';
      case 'in_progress': return 'En Progreso';
      case 'on_hold': return 'En Espera';
      case 'cancelled': return 'Cancelado';
      default: return 'Planificación';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Gestión de Proyectos</h1>
          <p className="text-gray-400">Administre los proyectos de su empresa</p>
        </div>
        <div className="flex gap-3">
          <ExportButtons
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            variant="compact"
          />
          <Button 
            onClick={() => setShowModal(true)}
            className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Proyecto
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Total Proyectos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{kpis.totalProjects}</div>
            <FolderKanban className="w-5 h-5 text-[#00E5FF] mt-2" />
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-blue-500/20 border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">En Progreso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">{kpis.activeProjects}</div>
            <Clock className="w-5 h-5 text-blue-400 mt-2" />
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-green-500/20 border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Completados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">{kpis.completedProjects}</div>
            <CheckCircle className="w-5 h-5 text-green-400 mt-2" />
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Presupuesto Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ${(kpis.totalBudget / 1000).toFixed(1)}K
            </div>
            <DollarSign className="w-5 h-5 text-[#00E5FF] mt-2" />
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#7B61FF]/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Costo Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#7B61FF]">
              ${(kpis.totalCost / 1000).toFixed(1)}K
            </div>
            <TrendingUp className="w-5 h-5 text-[#7B61FF] mt-2" />
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-red-500/20 border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Sobre Presupuesto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">{kpis.overBudget}</div>
            <AlertCircle className="w-5 h-5 text-red-400 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar proyecto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-white/5 border-[#00E5FF]/20 text-white"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="planning">Planificación</SelectItem>
                <SelectItem value="in_progress">En Progreso</SelectItem>
                <SelectItem value="on_hold">En Espera</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Grid de Proyectos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.length === 0 ? (
          <Card className="col-span-full bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
            <CardContent className="p-12 text-center">
              <FolderKanban className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">No se encontraron proyectos</p>
              <p className="text-gray-500 text-sm mt-2">Crea tu primer proyecto para comenzar</p>
            </CardContent>
          </Card>
        ) : (
          filteredProjects.map((project) => {
            const progress = project.budget > 0 ? (project.actualCost / project.budget) * 100 : 0;
            
            return (
              <Card 
                key={project.id} 
                className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20 hover:border-[#7B61FF]/40 transition-all hover:shadow-lg hover:shadow-[#7B61FF]/10"
              >
                <CardContent className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FolderKanban className="w-5 h-5 text-[#00E5FF]" />
                        <h3 className="text-lg font-bold text-white">{project.name}</h3>
                      </div>
                      <p className="text-xs text-gray-500">{project.code}</p>
                    </div>
                    <Badge className={getStatusColor(project.status)}>
                      {getStatusLabel(project.status)}
                    </Badge>
                  </div>

                  {/* Descripción */}
                  <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                    {project.description || 'Sin descripción'}
                  </p>

                  {/* Cliente */}
                  {project.clientName && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="w-4 h-4 text-[#00E5FF]" />
                        <span className="text-gray-400">Cliente:</span>
                        <span className="text-white font-medium">{project.clientName}</span>
                      </div>
                    </div>
                  )}

                  {/* Presupuesto y Costo */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/5 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-1">Presupuesto</p>
                      <p className="text-sm font-bold text-white">
                        ${project.budget.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-1">Costo Actual</p>
                      <p className={`text-sm font-bold ${
                        project.actualCost > project.budget ? 'text-red-400' : 'text-green-400'
                      }`}>
                        ${project.actualCost.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Progreso de Costos</span>
                      <span className="text-xs font-medium text-white">
                        {progress.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          progress > 100
                            ? 'bg-red-500'
                            : progress > 75
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-[#00E5FF]/10">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <User className="w-3 h-3 text-[#00E5FF]" />
                        <span>{project.manager}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Calendar className="w-3 h-3 text-[#00E5FF]" />
                        <span>{project.startDate}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(project)}
                        className="p-2 hover:bg-white/10 rounded-lg transition"
                      >
                        <Edit2 className="w-4 h-4 text-[#00E5FF]" />
                      </button>
                      <button
                        onClick={() => handleDelete(project.id)}
                        className="p-2 hover:bg-white/10 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/30 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {editingProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Código *</Label>
                <Input
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="bg-white/5 border-[#00E5FF]/20 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label>Estado *</Label>
                <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                    <SelectItem value="planning">Planificación</SelectItem>
                    <SelectItem value="in_progress">En Progreso</SelectItem>
                    <SelectItem value="on_hold">En Espera</SelectItem>
                    <SelectItem value="completed">Completado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nombre del Proyecto *</Label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-white/5 border-[#00E5FF]/20 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="bg-white/5 border-[#00E5FF]/20 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={formData.clientId} onValueChange={(value) => setFormData({ ...formData, clientId: value })}>
                  <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white">
                    <SelectValue placeholder="Seleccione un cliente" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                    {clientes.map((cliente) => (
                      <SelectItem key={cliente.id} value={cliente.id}>
                        {cliente.businessName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Centro de Costos</Label>
                <Select value={formData.costCenterId} onValueChange={(value) => setFormData({ ...formData, costCenterId: value })}>
                  <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white">
                    <SelectValue placeholder="Seleccione un centro" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                    {centrosCostos.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Fecha de Inicio *</Label>
                <Input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="bg-white/5 border-[#00E5FF]/20 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label>Fecha de Fin</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="bg-white/5 border-[#00E5FF]/20 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Presupuesto *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: parseFloat(e.target.value) })}
                  className="bg-white/5 border-[#00E5FF]/20 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label>Costo Actual</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.actualCost}
                  onChange={(e) => setFormData({ ...formData, actualCost: parseFloat(e.target.value) })}
                  className="bg-white/5 border-[#00E5FF]/20 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Responsable *</Label>
              <Input
                required
                value={formData.manager}
                onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                className="bg-white/5 border-[#00E5FF]/20 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="bg-white/5 border-[#00E5FF]/20 text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <Label htmlFor="active">Proyecto activo</Label>
            </div>

            <div className="flex gap-4 pt-4 border-t border-[#00E5FF]/20">
              <Button
                type="button"
                onClick={handleCloseModal}
                variant="outline"
                className="flex-1 border-[#00E5FF]/30 text-white"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]"
              >
                {editingProject ? 'Actualizar' : 'Crear'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}