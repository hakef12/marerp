import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Users, UserPlus, Calendar, DollarSign, Award,
  Briefcase, GraduationCap, Heart, FileText, TrendingUp,
  Edit, Trash2, Plus, X, CheckCircle, Clock, AlertCircle,
  Download, Printer
} from 'lucide-react';
import { toast } from 'sonner';
import VerAsientoButton from '../components/VerAsientoButton';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { ExportButtons } from '../components/ExportButtons';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';

interface Empleado {
  id: string;
  nombre_completo: string;
  email: string;
  telefono?: string;
  cargo?: string;
  departamento?: string;
  fecha_ingreso: string;
  salario_base: number;
  estado: 'activo' | 'inactivo';
}

interface Vacante {
  id: string;
  titulo: string;
  departamento: string;
  descripcion: string;
  requisitos: string;
  salario_min?: number;
  salario_max?: number;
  estado: 'abierta' | 'cerrada';
  created_at: string;
}

interface Evaluacion {
  id: string;
  empleado_nombre: string;
  periodo: string;
  calificacion: number;
  competencias: any;
  estado: 'pendiente' | 'completada';
  created_at: string;
}

interface Capacitacion {
  id: string;
  titulo: string;
  descripcion: string;
  instructor?: string;
  fecha_inicio: string;
  fecha_fin: string;
  participantes: string[];
  estado: 'programada' | 'en_curso' | 'completada';
}

export default function TalentoHumano() {
  const { token } = useAuth();
  const [view, setView] = useState<'empleados' | 'reclutamiento' | 'evaluaciones' | 'capacitacion' | 'clima' | 'nomina'>('empleados');
  
  // Estados de datos
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [vacantes, setVacantes] = useState<Vacante[]>([]);
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([]);
  const [capacitaciones, setCapacitaciones] = useState<Capacitacion[]>([]);
  const [metricas, setMetricas] = useState<any>(null);
  
  // Estados de modales
  const [showEmpleadoModal, setShowEmpleadoModal] = useState(false);
  const [showVacanteModal, setShowVacanteModal] = useState(false);
  const [showEvaluacionModal, setShowEvaluacionModal] = useState(false);
  const [showCapacitacionModal, setShowCapacitacionModal] = useState(false);
  
  // Estados de formularios
  const [formEmpleado, setFormEmpleado] = useState<Partial<Empleado>>({});
  const [formVacante, setFormVacante] = useState<Partial<Vacante>>({});
  const [formEvaluacion, setFormEvaluacion] = useState<Partial<Evaluacion>>({});
  const [formCapacitacion, setFormCapacitacion] = useState<Partial<Capacitacion>>({});

  // Nómina state
  const [nominaExtras, setNominaExtras] = useState<Record<string, { horas_extras: number; otros_ingresos: number }>>({});

  // Clima laboral state
  const [encuestaRespuestas, setEncuestaRespuestas] = useState<Record<number, number>>({});
  const [encuestaEnviada, setEncuestaEnviada] = useState(false);
  const [resultadosEncuesta, setResultadosEncuesta] = useState<{ promedio: number; nivel: string; color: string } | null>(null);
  const [climaResultados, setClimaResultados] = useState<{
    periodo: string;
    total_respuestas: number;
    ya_respondi: boolean;
    umbral_minimo?: number;
    mensaje?: string;
    promedios_por_pregunta: number[] | null;
    promedio_general: number | null;
  } | null>(null);
  const [climaLoading, setClimaLoading] = useState(false);

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token, view]);

  const fetchData = async () => {
    await Promise.all([
      fetchEmpleados(),
      fetchMetricas()
    ]);

    if (view === 'reclutamiento') fetchVacantes();
    if (view === 'evaluaciones') fetchEvaluaciones();
    if (view === 'capacitacion') fetchCapacitaciones();
    if (view === 'clima') fetchClimaResultados();
  };

  const fetchEmpleados = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/empleados`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token || '',
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 401) {
        toast.error('Sesión expirada. Por favor inicia sesión nuevamente.');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setEmpleados(data.empleados || []);
      } else {
        const errorData = await response.json();
        console.error('❌ [fetchEmpleados] Error:', errorData);
        toast.error('Error cargando empleados: ' + (errorData.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('❌ [fetchEmpleados] Error de red:', error);
      toast.error('Error de conexión al cargar empleados');
    }
  };

  const fetchVacantes = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/vacantes`,
        { 
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token 
          } 
        }
      );
      if (response.ok) {
        const data = await response.json();
        setVacantes(data.vacantes || []);
      }
    } catch (error) {
      console.error('Error cargando vacantes:', error);
    }
  };

  const fetchEvaluaciones = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/evaluaciones`,
        { 
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token 
          } 
        }
      );
      if (response.ok) {
        const data = await response.json();
        setEvaluaciones(data.evaluaciones || []);
      }
    } catch (error) {
      console.error('Error cargando evaluaciones:', error);
    }
  };

  const fetchCapacitaciones = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/capacitaciones`,
        { 
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token 
          } 
        }
      );
      if (response.ok) {
        const data = await response.json();
        setCapacitaciones(data.capacitaciones || []);
      }
    } catch (error) {
      console.error('Error cargando capacitaciones:', error);
    }
  };

  const fetchMetricas = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/metricas`,
        { 
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token 
          } 
        }
      );
      if (response.ok) {
        const data = await response.json();
        setMetricas(data);
      }
    } catch (error) {
      console.error('Error cargando métricas:', error);
    }
  };

  const crearEmpleado = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/empleados`,
        {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
            'X-User-Token': token 
          },
          body: JSON.stringify(formEmpleado)
        }
      );

      if (response.ok) {
        toast.success('Empleado creado exitosamente');
        setShowEmpleadoModal(false);
        setFormEmpleado({});
        fetchEmpleados();
      } else {
        toast.error('Error al crear empleado');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al crear empleado');
    }
  };

  const crearVacante = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/vacantes`,
        {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
            'X-User-Token': token 
          },
          body: JSON.stringify(formVacante)
        }
      );

      if (response.ok) {
        toast.success('Vacante creada exitosamente');
        setShowVacanteModal(false);
        setFormVacante({});
        fetchVacantes();
      } else {
        toast.error('Error al crear vacante');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al crear vacante');
    }
  };

  const crearEvaluacion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/evaluaciones`,
        {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
            'X-User-Token': token 
          },
          body: JSON.stringify(formEvaluacion)
        }
      );

      if (response.ok) {
        toast.success('Evaluación creada exitosamente');
        setShowEvaluacionModal(false);
        setFormEvaluacion({});
        fetchEvaluaciones();
      } else {
        toast.error('Error al crear evaluación');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al crear evaluación');
    }
  };

  const crearCapacitacion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/capacitaciones`,
        {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
            'X-User-Token': token 
          },
          body: JSON.stringify(formCapacitacion)
        }
      );

      if (response.ok) {
        toast.success('Capacitación creada exitosamente');
        setShowCapacitacionModal(false);
        setFormCapacitacion({});
        fetchCapacitaciones();
      } else {
        toast.error('Error al crear capacitación');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al crear capacitación');
    }
  };

  // ── Nómina helpers (Ecuador 2026) ───────────────────────────────────────────
  const SBU = 482; // SBU Ecuador 2026 (acuerdo tripartito Gobierno-empleadores-trabajadores, vigente desde 1/1/2026)

  // Tabla IR Ecuador 2026 (Resolución NAC-DGERCGC25-00000043, vigente desde 1/1/2026)
  const TABLA_IR = [
    { desde: 0,      hasta: 12208,    base: 0,     excedente: 0,      fraccion: 0    },
    { desde: 12208,  hasta: 15549,    base: 0,     excedente: 12208,  fraccion: 0.05 },
    { desde: 15549,  hasta: 20188,    base: 167,   excedente: 15549,  fraccion: 0.10 },
    { desde: 20188,  hasta: 26700,    base: 631,   excedente: 20188,  fraccion: 0.12 },
    { desde: 26700,  hasta: 35136,    base: 1412,  excedente: 26700,  fraccion: 0.15 },
    { desde: 35136,  hasta: 46575,    base: 2678,  excedente: 35136,  fraccion: 0.20 },
    { desde: 46575,  hasta: 62005,    base: 4965,  excedente: 46575,  fraccion: 0.25 },
    { desde: 62005,  hasta: 82679,    base: 8823,  excedente: 62005,  fraccion: 0.30 },
    { desde: 82679,  hasta: 109956,   base: 15025, excedente: 82679,  fraccion: 0.35 },
    { desde: 109956, hasta: Infinity, base: 24572, excedente: 109956, fraccion: 0.37 },
  ];

  const calcularIR = (ingresoAnual: number) => {
    const t = TABLA_IR.find(t => ingresoAnual >= t.desde && ingresoAnual < t.hasta);
    if (!t || t.fraccion === 0) return 0;
    return t.base + (ingresoAnual - t.excedente) * t.fraccion;
  };

  const r2 = (n: number) => Math.round(n * 100) / 100;

  const computeNomina = (emp: Empleado) => {
    const extras = nominaExtras[emp.id] || { horas_extras: 0, horas_extras_nocturnas: 0, otros_ingresos: 0, descuentos: 0 };
    const valorHoraBase = emp.salario_base / 160;
    const montoExtras = r2(
      Number(extras.horas_extras || 0) * valorHoraBase * 1.5 +
      Number(extras.horas_extras_nocturnas || 0) * valorHoraBase * 2
    );
    const salario_bruto = r2(emp.salario_base + montoExtras + Number(extras.otros_ingresos || 0));
    const iess_personal = r2(salario_bruto * 0.0945);
    const iess_patronal = r2(salario_bruto * 0.1115);

    // Fondos de reserva: empleados con > 12 meses
    const fechaIngreso = (emp as any).fecha_ingreso ? new Date((emp as any).fecha_ingreso) : new Date();
    const mesesAnt = Math.floor((Date.now() - fechaIngreso.getTime()) / (30.44 * 86400000));
    const fondos_reserva = mesesAnt >= 12 ? r2(salario_bruto * 0.0833) : 0;

    // Retención IR mensual
    const ingresoAnualProy = salario_bruto * 13; // 12 meses + 1 mes de décimo 13
    const ir_anual = calcularIR(ingresoAnualProy);
    const ir_mensual = r2(ir_anual / 12);

    const neto_pagar = r2(salario_bruto - iess_personal - ir_mensual - Number(extras.descuentos || 0));
    const provision_decimoTercero = r2(salario_bruto / 12);
    const provision_decimoCuarto  = r2(SBU / 12);
    const provision_vacaciones     = r2(salario_bruto / 24);
    const costo_total_empresa = r2(salario_bruto + iess_patronal + fondos_reserva + provision_decimoTercero + provision_decimoCuarto + provision_vacaciones);

    return {
      salario_bruto, iess_personal, iess_patronal, fondos_reserva,
      ir_mensual, ir_anual_proyectado: r2(ir_anual),
      neto_pagar, provision_decimoTercero, provision_decimoCuarto,
      provision_vacaciones, costo_total_empresa,
      meses_antiguedad: mesesAnt, tiene_fondos_reserva: mesesAnt >= 12,
    };
  };

  // ── Estado nómina avanzada ───────────────────────────────────────────────────
  const [nominaGuardando, setNominaGuardando] = useState(false);
  const [nominaEnviando, setNominaEnviando]   = useState(false);
  const [nominaId, setNominaId]               = useState<string|null>(null);
  const [historialNomina, setHistorialNomina] = useState<any[]>([]);
  const [nominaMes, setNominaMes]             = useState(new Date().getMonth() + 1);
  const [nominaAnio, setNominaAnio]           = useState(new Date().getFullYear());
  const [showFiniquito, setShowFiniquito]     = useState(false);
  const [finiquitoEmpId, setFiniquitoEmpId]   = useState('');
  const [finiquitoMotivo, setFiniquitoMotivo] = useState<'renuncia'|'desahucio'>('renuncia');
  const [finiquitoData, setFiniquitoData]     = useState<any>(null);
  const [servicio10Data, setServicio10Data]   = useState<any>(null);
  const [servicio10Loading, setServicio10Loading] = useState(false);
  const [servicio10Criterio, setServicio10Criterio] = useState<'equitativo'|'horas'>('equitativo');

  const guardarNomina = async () => {
    setNominaGuardando(true);
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/rrhh/nomina/calcular`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ anio: nominaAnio, mes: nominaMes, extras: nominaExtras }),
      });
      const d = await res.json();
      if (res.ok) { toast.success(`✅ Nómina ${nominaMes}/${nominaAnio} guardada — ${d.empleados_procesados} empleados`); setNominaId(d.nomina?.id || null); }
      else toast.error(d.error || 'Error');
    } catch (e: any) { toast.error(e.message); }
    finally { setNominaGuardando(false); }
  };

  const enviarRoles = async () => {
    if (!nominaId) { toast.error('Primero guarda la nómina'); return; }
    if (!confirm(`¿Enviar el rol de pagos por email a todos los empleados activos con email registrado?`)) return;
    setNominaEnviando(true);
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/rrhh/nomina/${nominaId}/enviar-roles`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
        body: '{}',
      });
      const d = await res.json();
      if (res.ok) toast.success(`✅ ${d.enviados} roles de pago enviados por email`);
      else toast.error(d.error || 'Error');
    } catch (e: any) { toast.error(e.message); }
    finally { setNominaEnviando(false); }
  };

  const generarAsientoNomina = async () => {
    if (!nominaId) { toast.error('Primero guarda la nómina'); return; }
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/rrhh/nomina/${nominaId}/asiento`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
        body: '{}',
      });
      const d = await res.json();
      if (res.ok) toast.success('✅ Asiento contable de nómina generado');
      else toast.error(d.error || 'Error');
    } catch (e: any) { toast.error(e.message); }
  };

  const consultarServicio10 = async () => {
    setServicio10Loading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/servicio/acumulado?anio=${nominaAnio}&mes=${nominaMes}`,
        { headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' } }
      );
      const d = await res.json();
      if (res.ok) setServicio10Data(d);
      else toast.error(d.error || 'Error consultando 10% servicio');
    } catch (e: any) { toast.error(e.message); }
    finally { setServicio10Loading(false); }
  };

  const distribuirServicio10 = async () => {
    if (!servicio10Data) { toast.error('Primero consulta el acumulado'); return; }
    if (!servicio10Data.configurado) { toast.error('Active el cobro del 10% en Configuracion → Facturacion → Reglamento Ley de Turismo'); return; }
    if (!servicio10Data.total || servicio10Data.total <= 0) { toast.error('No hay acumulado en el periodo'); return; }
    if (!confirm(`¿Distribuir $${Number(servicio10Data.total).toFixed(2)} entre los empleados activos (criterio: ${servicio10Criterio})?`)) return;
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/servicio/distribuir`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
          body: JSON.stringify({ anio: nominaAnio, mes: nominaMes, criterio: servicio10Criterio }),
        }
      );
      const d = await res.json();
      if (res.ok) {
        toast.success(`10% distribuido: $${Number(d.total_repartido).toFixed(2)} entre ${d.empleados_beneficiarios} empleado(s)`);
        await consultarServicio10();
      } else {
        toast.error(d.error || 'Error');
      }
    } catch (e: any) { toast.error(e.message); }
  };

  const calcularFiniquito = async () => {
    if (!finiquitoEmpId) { toast.error('Selecciona un empleado'); return; }
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/rrhh/nomina/finiquito`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ empleado_id: finiquitoEmpId, motivo: finiquitoMotivo }),
      });
      const d = await res.json();
      if (res.ok) setFiniquitoData(d);
      else toast.error(d.error || 'Error');
    } catch (e: any) { toast.error(e.message); }
  };

  const exportarCSV = () => {
    const encabezado = [
      'Nombre',
      'Cargo',
      'Salario Base',
      'Horas Extra',
      'Otros Ingresos',
      'Salario Bruto',
      'IESS Personal (9.45%)',
      'IESS Patronal (11.15%)',
      'Neto a Pagar',
      'Prov. Décimo Tercero',
      'Prov. Décimo Cuarto',
      'Prov. Vacaciones',
      'Costo Total Empresa',
    ];
    const filas = empleados
      .filter((e) => e.estado === 'activo')
      .map((emp) => {
        const extras = nominaExtras[emp.id] || { horas_extras: 0, otros_ingresos: 0 };
        const n = computeNomina(emp);
        return [
          emp.nombre_completo,
          emp.cargo || '',
          emp.salario_base.toFixed(2),
          extras.horas_extras.toFixed(2),
          extras.otros_ingresos.toFixed(2),
          n.salario_bruto.toFixed(2),
          n.iess_personal.toFixed(2),
          n.iess_patronal.toFixed(2),
          n.neto_pagar.toFixed(2),
          n.provision_decimoTercero.toFixed(2),
          n.provision_decimoCuarto.toFixed(2),
          n.provision_vacaciones.toFixed(2),
          n.costo_total_empresa.toFixed(2),
        ];
      });
    const csv = [encabezado, ...filas].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nomina_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── Clima laboral helpers ────────────────────────────────────────────────────
  const PREGUNTAS_CLIMA = [
    '¿Cómo califica el ambiente de trabajo en general?',
    '¿Siente que su trabajo es reconocido y valorado?',
    '¿La comunicación con su equipo y líderes es efectiva?',
    '¿Cuenta con las herramientas necesarias para realizar su trabajo?',
    '¿Existe equilibrio entre su vida laboral y personal?',
    '¿Está satisfecho con su compensación y beneficios?',
    '¿Se siente parte del equipo y de la empresa?',
    '¿Recomendaría esta empresa como un buen lugar para trabajar?',
  ];

  const fetchClimaResultados = async () => {
    try {
      setClimaLoading(true);
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/clima/resultados`,
        { headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': token || '',
          'Content-Type': 'application/json',
        } }
      );
      if (!res.ok) return;
      const data = await res.json();
      setClimaResultados(data);
      if (data.ya_respondi) setEncuestaEnviada(true);
    } catch { /* silencioso */ }
    finally { setClimaLoading(false); }
  };

  const enviarEncuesta = async () => {
    const valores = PREGUNTAS_CLIMA.map((_, i) => encuestaRespuestas[i]);
    if (valores.some(v => !v)) {
      toast.error('Por favor responde todas las preguntas antes de enviar.');
      return;
    }
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/rrhh/clima/responder`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ respuestas: valores }),
        }
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || 'Error al enviar la encuesta');
        return;
      }
      const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
      let nivel: string, color: string;
      if (promedio <= 2)      { nivel = 'Crítico';   color = 'red'; }
      else if (promedio <= 4) { nivel = 'Mejorable'; color = 'yellow'; }
      else                    { nivel = 'Bueno';    color = 'green'; }
      setResultadosEncuesta({ promedio, nivel, color });
      setEncuestaEnviada(true);
      toast.success('¡Encuesta enviada exitosamente!');
      await fetchClimaResultados();
    } catch (e: any) {
      toast.error(e?.message || 'Error al enviar la encuesta');
    }
  };

  const promedioAgregado = climaResultados?.promedio_general ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Users className="w-8 h-8 text-[#F97316]" />
            Talento Humano
          </h1>
          <p className="text-gray-600">Gestión integral de recursos humanos</p>
        </div>
        <ExportButtons
          variant="compact"
          onExportExcel={() => exportToExcel(
            empleados.map(e => ({
              'Nombre': e.nombre_completo,
              'Email': e.email,
              'Teléfono': e.telefono || '',
              'Cargo': e.cargo || '',
              'Departamento': e.departamento || '',
              'Fecha Ingreso': e.fecha_ingreso,
              'Salario Base': e.salario_base,
              'Estado': e.estado,
            })),
            'talento_humano_empleados',
            'Empleados',
          )}
          onExportPDF={() => exportToPDF(
            empleados,
            [
              { header: 'Nombre', key: 'nombre_completo' },
              { header: 'Cargo', key: 'cargo' },
              { header: 'Departamento', key: 'departamento' },
              { header: 'Salario', key: 'salario_base' },
              { header: 'Estado', key: 'estado' },
            ],
            'Reporte de Talento Humano',
            'talento_humano_empleados',
          )}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Empleados Activos</CardTitle>
            <Users className="w-5 h-5 text-[#F97316]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{metricas?.empleados_activos || 0}</div>
            <p className="text-xs text-gray-600">Total en nómina</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#F97316]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Salario Promedio</CardTitle>
            <DollarSign className="w-5 h-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">
              ${metricas?.salario_promedio ? metricas.salario_promedio.toFixed(0) : '0'}
            </div>
            <p className="text-xs text-gray-600">Por empleado</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#F97316]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Vacantes Abiertas</CardTitle>
            <Briefcase className="w-5 h-5 text-[#FB923C]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{metricas?.vacantes_abiertas || 0}</div>
            <p className="text-xs text-gray-600">En reclutamiento</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#F97316]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Clima Laboral</CardTitle>
            <Heart className="w-5 h-5 text-pink-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              {metricas?.clima_laboral ? (metricas.clima_laboral * 20).toFixed(0) : '0'}%
            </div>
            <p className="text-xs text-gray-600">Satisfacción</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de Navegación */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl shadow-lg border border-[#F97316]/20 p-2 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setView('empleados')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'empleados'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Users className="w-5 h-5" /> Empleados
        </button>
        <button
          onClick={() => setView('reclutamiento')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'reclutamiento'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Briefcase className="w-5 h-5" /> Reclutamiento
        </button>
        <button
          onClick={() => setView('evaluaciones')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'evaluaciones'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Award className="w-5 h-5" /> Evaluaciones
        </button>
        <button
          onClick={() => setView('capacitacion')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'capacitacion'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <GraduationCap className="w-5 h-5" /> Capacitación
        </button>
        <button
          onClick={() => setView('clima')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'clima'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Heart className="w-5 h-5" /> Clima Laboral
        </button>
        <button
          onClick={() => setView('nomina')}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${
            view === 'nomina'
              ? 'bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <DollarSign className="w-5 h-5" /> Nómina
        </button>
      </div>

      {/* VISTA: EMPLEADOS */}
      {view === 'empleados' && (
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-[#F97316]" />
                Directorio de Empleados
              </CardTitle>
              <Button
                onClick={() => setShowEmpleadoModal(true)}
                className="bg-gradient-to-r from-[#C2410C] to-[#F97316] hover:opacity-90"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Nuevo Empleado
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto scroll-top">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#F97316]/20 hover:bg-transparent">
                    <TableHead className="text-gray-600">Nombre</TableHead>
                    <TableHead className="text-gray-600">Email</TableHead>
                    <TableHead className="text-gray-600">Cargo</TableHead>
                    <TableHead className="text-gray-600">Departamento</TableHead>
                    <TableHead className="text-gray-600">Fecha Ingreso</TableHead>
                    <TableHead className="text-gray-600">Salario</TableHead>
                    <TableHead className="text-gray-600">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empleados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-600 py-12">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No hay empleados registrados</p>
                        <p className="text-sm mt-2">Agrega empleados para comenzar</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    empleados.map((empleado) => (
                      <TableRow key={empleado.id} className="border-[#F97316]/10 hover:bg-gray-50">
                        <TableCell className="text-gray-900 font-medium">{empleado.nombre_completo}</TableCell>
                        <TableCell className="text-gray-600">{empleado.email}</TableCell>
                        <TableCell className="text-gray-600">{empleado.cargo || 'N/A'}</TableCell>
                        <TableCell className="text-gray-600">{empleado.departamento || 'Sin asignar'}</TableCell>
                        <TableCell className="text-gray-600">
                          {new Date(empleado.fecha_ingreso).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-[#F97316] font-medium">
                          ${empleado.salario_base ? empleado.salario_base.toLocaleString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            empleado.estado === 'activo'
                              ? 'bg-green-500/20 text-green-400 border-green-500/30'
                              : 'bg-gray-500/20 text-gray-600 border-gray-500/30'
                          }>
                            {empleado.estado}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* VISTA: RECLUTAMIENTO */}
      {view === 'reclutamiento' && (
        <div className="space-y-6">
          <Card className="bg-white border-[#F97316]/20">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-gray-900 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-[#FB923C]" />
                  Vacantes Activas
                </CardTitle>
                <Button
                  onClick={() => setShowVacanteModal(true)}
                  className="bg-gradient-to-r from-[#FB923C] to-[#FB923C] hover:opacity-90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nueva Vacante
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {vacantes.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-50 text-gray-600" />
                  <p className="text-gray-600">No hay vacantes publicadas</p>
                  <p className="text-sm mt-2 text-gray-600">Crea una vacante para comenzar el reclutamiento</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vacantes.map((vacante) => (
                    <div key={vacante.id} className="p-4 rounded-lg bg-gray-50 border border-[#F97316]/20">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="text-gray-900 font-bold">{vacante.titulo}</h3>
                          <p className="text-gray-600 text-sm">{vacante.departamento}</p>
                        </div>
                        <Badge className={
                          vacante.estado === 'abierta'
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : 'bg-gray-500/20 text-gray-600 border-gray-500/30'
                        }>
                          {vacante.estado}
                        </Badge>
                      </div>
                      <p className="text-gray-600 text-sm mb-3">{vacante.descripcion}</p>
                      {(vacante.salario_min || vacante.salario_max) && (
                        <p className="text-[#F97316] text-sm font-medium">
                          Salario: ${vacante.salario_min?.toLocaleString()} - ${vacante.salario_max?.toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* VISTA: EVALUACIONES */}
      {view === 'evaluaciones' && (
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-yellow-400" />
                Evaluaciones de Desempeño
              </CardTitle>
              <Button
                onClick={() => setShowEvaluacionModal(true)}
                className="bg-gradient-to-r from-yellow-600 to-yellow-500 hover:opacity-90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nueva Evaluación
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {evaluaciones.length === 0 ? (
              <div className="text-center py-12">
                <Award className="w-12 h-12 mx-auto mb-3 opacity-50 text-gray-600" />
                <p className="text-gray-600">No hay evaluaciones registradas</p>
                <p className="text-sm mt-2 text-gray-600">Crea evaluaciones para medir el desempeño</p>
              </div>
            ) : (
              <div className="overflow-x-auto scroll-top">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#F97316]/20 hover:bg-transparent">
                      <TableHead className="text-gray-600">Empleado</TableHead>
                      <TableHead className="text-gray-600">Período</TableHead>
                      <TableHead className="text-gray-600">Calificación</TableHead>
                      <TableHead className="text-gray-600">Estado</TableHead>
                      <TableHead className="text-gray-600">Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evaluaciones.map((evaluacion) => (
                      <TableRow key={evaluacion.id} className="border-[#F97316]/10 hover:bg-gray-50">
                        <TableCell className="text-gray-900">{evaluacion.empleado_nombre}</TableCell>
                        <TableCell className="text-gray-600">{evaluacion.periodo}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="text-yellow-400 font-bold">{evaluacion.calificacion}/5</div>
                            <div className="flex gap-1">
                              {[...Array(5)].map((_, i) => (
                                <div
                                  key={i}
                                  className={`w-2 h-2 rounded-full ${
                                    i < evaluacion.calificacion ? 'bg-yellow-400' : 'bg-gray-600'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            evaluacion.estado === 'completada'
                              ? 'bg-green-500/20 text-green-400 border-green-500/30'
                              : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                          }>
                            {evaluacion.estado}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {new Date(evaluacion.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* VISTA: CAPACITACIÓN */}
      {view === 'capacitacion' && (
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-[#F97316]" />
                Programas de Capacitación
              </CardTitle>
              <Button
                onClick={() => setShowCapacitacionModal(true)}
                className="bg-gradient-to-r from-[#C2410C] to-[#F97316] hover:opacity-90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nueva Capacitación
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {capacitaciones.length === 0 ? (
              <div className="text-center py-12">
                <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50 text-gray-600" />
                <p className="text-gray-600">No hay capacitaciones programadas</p>
                <p className="text-sm mt-2 text-gray-600">Programa capacitaciones para desarrollar tu equipo</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {capacitaciones.map((capacitacion) => (
                  <div key={capacitacion.id} className="p-4 rounded-lg bg-gray-50 border border-[#F97316]/20">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-gray-900 font-bold">{capacitacion.titulo}</h3>
                        {capacitacion.instructor && (
                          <p className="text-gray-600 text-sm">Instructor: {capacitacion.instructor}</p>
                        )}
                      </div>
                      <Badge className={
                        capacitacion.estado === 'completada'
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : capacitacion.estado === 'en_curso'
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                      }>
                        {capacitacion.estado}
                      </Badge>
                    </div>
                    <p className="text-gray-600 text-sm mb-3">{capacitacion.descripcion}</p>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">
                        {new Date(capacitacion.fecha_inicio).toLocaleDateString()} - {new Date(capacitacion.fecha_fin).toLocaleDateString()}
                      </span>
                      <span className="text-[#F97316]">
                        {capacitacion.participantes?.length || 0} participantes
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* VISTA: CLIMA LABORAL */}
      {view === 'clima' && (
        <div className="space-y-6">
          {/* Encuesta individual */}
          <Card className="bg-white border-[#F97316]/20">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-400" />
                Encuesta de Clima Laboral
              </CardTitle>
              <p className="text-gray-600 text-sm">Califique cada aspecto del 1 (muy malo) al 5 (excelente)</p>
            </CardHeader>
            <CardContent>
              {!encuestaEnviada ? (
                <div className="space-y-6">
                  {PREGUNTAS_CLIMA.map((pregunta, idx) => (
                    <div key={idx} className="p-4 rounded-lg bg-gray-50 border border-[#F97316]/10">
                      <p className="text-gray-900 font-medium mb-3">
                        <span className="text-[#F97316] mr-2">{idx + 1}.</span>
                        {pregunta}
                      </p>
                      <div className="flex gap-3 flex-wrap">
                        {[1, 2, 3, 4, 5].map((val) => {
                          const starColors = ['text-red-400', 'text-orange-400', 'text-yellow-400', 'text-lime-400', 'text-green-400'];
                          const labels = ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];
                          const selected = encuestaRespuestas[idx] === val;
                          return (
                            <label
                              key={val}
                              className={`flex flex-col items-center gap-1 cursor-pointer px-3 py-2 rounded-lg border transition-all ${
                                selected
                                  ? 'border-pink-400 bg-pink-500/20'
                                  : 'border-gray-100 hover:border-white/30 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`pregunta-${idx}`}
                                value={val}
                                checked={selected}
                                onChange={() =>
                                  setEncuestaRespuestas((prev) => ({ ...prev, [idx]: val }))
                                }
                                className="hidden"
                              />
                              <span className={`text-2xl ${starColors[val - 1]}`}>
                                {val === 1 ? '😞' : val === 2 ? '😕' : val === 3 ? '😐' : val === 4 ? '🙂' : '😄'}
                              </span>
                              <span className={`text-xs font-bold ${selected ? 'text-pink-300' : 'text-gray-600'}`}>{val}</span>
                              <span className={`text-xs ${selected ? 'text-gray-900' : 'text-gray-600'}`}>{labels[val - 1]}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <Button
                      onClick={enviarEncuesta}
                      className="bg-gradient-to-r from-pink-600 to-pink-500 hover:opacity-90 px-8"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Enviar Encuesta
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  {resultadosEncuesta && (
                    <>
                      <div className="text-6xl mb-4">
                        {resultadosEncuesta.color === 'green' ? '🌟' : resultadosEncuesta.color === 'yellow' ? '⚠️' : '🚨'}
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">
                        Resultado: <span className={
                          resultadosEncuesta.color === 'green' ? 'text-green-400' :
                          resultadosEncuesta.color === 'yellow' ? 'text-yellow-400' : 'text-red-400'
                        }>{resultadosEncuesta.nivel}</span>
                      </h3>
                      <p className="text-gray-600 mb-6">
                        Tu promedio: <span className="text-gray-900 font-bold">{resultadosEncuesta.promedio.toFixed(2)}</span> / 5.00
                      </p>
                      <div className="max-w-md mx-auto mb-6">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>1</span><span>5</span>
                        </div>
                        <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              resultadosEncuesta.color === 'green'
                                ? 'bg-gradient-to-r from-lime-500 to-green-400'
                                : resultadosEncuesta.color === 'yellow'
                                ? 'bg-gradient-to-r from-yellow-600 to-yellow-400'
                                : 'bg-gradient-to-r from-red-700 to-red-500'
                            }`}
                            style={{ width: `${(resultadosEncuesta.promedio / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          setEncuestaEnviada(false);
                          setEncuestaRespuestas({});
                          setResultadosEncuesta(null);
                        }}
                        variant="outline"
                        className="border-pink-400/40 text-pink-300 hover:bg-pink-500/10"
                      >
                        Responder de nuevo
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resultados agregados — datos reales del backend, anónimos */}
          <Card className="bg-white border-[#F97316]/20">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#F97316]" />
                Resultados Agregados del Equipo
              </CardTitle>
              <p className="text-gray-600 text-sm">
                {climaLoading
                  ? 'Cargando…'
                  : climaResultados
                    ? `Periodo ${climaResultados.periodo} · ${climaResultados.total_respuestas} respuesta${climaResultados.total_respuestas === 1 ? '' : 's'} anónima${climaResultados.total_respuestas === 1 ? '' : 's'}`
                    : 'Sin datos'}
              </p>
            </CardHeader>
            <CardContent>
              {climaResultados && climaResultados.promedios_por_pregunta ? (
                <div className="space-y-4">
                  {PREGUNTAS_CLIMA.map((pregunta, idx) => {
                    const promQ = climaResultados.promedios_por_pregunta?.[idx] ?? 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <p className="text-gray-600 text-sm">{idx + 1}. {pregunta}</p>
                          <span className="text-gray-900 font-bold text-sm ml-4 shrink-0">{promQ.toFixed(1)}/5</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              promQ >= 4 ? 'bg-green-400' : promQ >= 3 ? 'bg-yellow-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${(promQ / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-[#F97316]/20 flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm">Promedio general del equipo</p>
                      <p className="text-2xl font-bold text-gray-900">{promedioAgregado.toFixed(2)} / 5.00</p>
                    </div>
                    <div className={`text-3xl px-4 py-2 rounded-lg font-bold ${
                      promedioAgregado >= 4 ? 'bg-green-500/20 text-green-400' :
                      promedioAgregado >= 2 ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {promedioAgregado >= 4 ? 'Bueno' : promedioAgregado >= 2 ? 'Mejorable' : 'Crítico'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-gray-500 text-sm">
                  {climaResultados?.mensaje ||
                    'Aún no hay suficientes respuestas para mostrar resultados agregados. Se requieren al menos 3 respuestas para preservar el anonimato.'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* VISTA: NÓMINA */}
      {view === 'nomina' && (
        <>
        {/* 10% Servicio Ley de Turismo — distribucion mensual */}
        <Card className="bg-white border-amber-200 mb-4">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2 text-base">
              💰 10% de Servicio (Ley de Turismo) — {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][nominaMes-1]} {nominaAnio}
            </CardTitle>
            <p className="text-xs text-gray-600">
              El 10% cobrado en facturas pertenece a los trabajadores y debe distribuirse mensualmente.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={consultarServicio10} disabled={servicio10Loading} size="sm" variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50">
                {servicio10Loading ? '...' : '🔄 Consultar acumulado'}
              </Button>
              {servicio10Data && (
                <>
                  <div className="text-sm">
                    {servicio10Data.configurado ? (
                      <>
                        <span className="text-gray-600">Acumulado del periodo:</span>{' '}
                        <strong className="text-amber-700">${Number(servicio10Data.total || 0).toFixed(2)}</strong>
                        <span className="text-xs text-gray-400 ml-2">
                          ({servicio10Data.porcentaje}% sobre ${Number(servicio10Data.subtotal_periodo || 0).toFixed(2)} de ventas)
                        </span>
                      </>
                    ) : (
                      <span className="text-red-600">
                        ⚠️ El cobro del 10% no esta activo. Actívelo en <em>Configuracion → Facturacion → Reglamento Ley de Turismo</em>.
                      </span>
                    )}
                  </div>
                  {servicio10Data.configurado && (
                    <>
                      <select value={servicio10Criterio} onChange={e => setServicio10Criterio(e.target.value as any)}
                        className="border border-amber-200 rounded px-2 py-1.5 text-sm bg-white text-gray-900">
                        <option value="equitativo">Reparto equitativo</option>
                        <option value="horas">Por horas trabajadas</option>
                      </select>
                      <Button onClick={distribuirServicio10} size="sm" className="bg-amber-500 hover:bg-amber-600 text-white">
                        💵 Distribuir
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
            {servicio10Data?.distribucion && (
              <div className="mt-4 border-t border-amber-100 pt-3">
                <p className="text-xs text-gray-600 mb-2">
                  Última distribución: {new Date(servicio10Data.distribucion.created_at).toLocaleString()} ·
                  Criterio: <strong>{servicio10Data.distribucion.criterio}</strong> ·
                  Beneficiarios: <strong>{servicio10Data.distribucion.empleados_beneficiarios}</strong>
                </p>
                <div className="rounded border border-amber-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-amber-50">
                      <tr>{['Empleado','Cargo','Monto'].map(h=><th key={h} className="px-3 py-1.5 text-left text-amber-700">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {(servicio10Data.distribucion.reparto || []).map((r: any, i: number) => (
                        <tr key={i} className={i%2===0?'':'bg-amber-50/30'}>
                          <td className="px-3 py-1">{r.empleado_nombre}</td>
                          <td className="px-3 py-1 text-gray-500">{r.cargo}</td>
                          <td className="px-3 py-1 font-mono font-bold text-right">${Number(r.monto).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-400" />
                    Nómina Ecuador — {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][nominaMes-1]} {nominaAnio}
                  </CardTitle>
                  <p className="text-gray-600 text-sm mt-1">
                    IESS personal 9.45% · IESS patronal 11.15% · Fondos reserva 8.33% (mas 1 año) · SBU 2026: ${SBU} · IR tabla progresiva
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <select value={nominaMes} onChange={e=>setNominaMes(Number(e.target.value))}
                    className="border border-orange-200 rounded px-2 py-1.5 text-sm bg-white text-gray-900">
                    {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i)=>(
                      <option key={i} value={i+1}>{m}</option>
                    ))}
                  </select>
                  <input type="number" value={nominaAnio} onChange={e=>setNominaAnio(Number(e.target.value))}
                    className="border border-orange-200 rounded px-2 py-1.5 text-sm bg-white text-gray-900 w-20"/>
                  <Button onClick={guardarNomina} disabled={nominaGuardando} size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white">
                    {nominaGuardando ? '...' : '💾 Guardar'}
                  </Button>
                  {nominaId && (
                    <>
                      <Button onClick={enviarRoles} disabled={nominaEnviando} size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white">
                        {nominaEnviando ? 'Enviando...' : '📧 Enviar Roles'}
                      </Button>
                      <Button onClick={generarAsientoNomina} size="sm" variant="outline"
                        className="border-purple-300 text-purple-600 hover:bg-purple-50">
                        📒 Generar Asiento
                      </Button>
                      {nominaId && (
                        <VerAsientoButton
                          referencia={String(nominaId)}
                          tipo="nomina"
                          label="Ver asiento"
                          size="sm"
                        />
                      )}
                    </>
                  )}
                  <Button onClick={exportarCSV} size="sm" variant="outline"
                    className="border-green-300 text-green-700">
                    <Download className="w-4 h-4 mr-1" /> CSV
                  </Button>
                  <Button onClick={()=>setShowFiniquito(!showFiniquito)} size="sm" variant="outline"
                    className="border-red-300 text-red-600">
                    📄 Finiquito
                  </Button>
                </div>
              </div>

              {/* Panel de Finiquito */}
              {showFiniquito && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <h3 className="font-bold text-red-700 text-sm">Calculadora de Finiquito / Liquidación</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Empleado</label>
                      <select value={finiquitoEmpId} onChange={e=>setFiniquitoEmpId(e.target.value)}
                        className="w-full border border-red-200 rounded px-2 py-1.5 text-sm bg-white text-gray-900">
                        <option value="">— Seleccionar —</option>
                        {empleados.filter(e=>e.estado==='activo').map(e=>(
                          <option key={e.id} value={e.id}>{e.nombre_completo}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Motivo de salida</label>
                      <select value={finiquitoMotivo} onChange={e=>setFiniquitoMotivo(e.target.value as any)}
                        className="w-full border border-red-200 rounded px-2 py-1.5 text-sm bg-white text-gray-900">
                        <option value="renuncia">Renuncia voluntaria</option>
                        <option value="desahucio">Desahucio (empleador termina)</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <Button onClick={calcularFiniquito} className="w-full bg-red-600 hover:bg-red-700 text-white" size="sm">
                        Calcular Liquidación
                      </Button>
                    </div>
                  </div>
                  {finiquitoData && (
                    <div className="bg-white border border-red-200 rounded-lg p-4 text-sm">
                      <div className="font-bold text-gray-900 mb-2">{finiquitoData.empleado?.nombre} — {finiquitoData.periodo?.dias_trabajados} días trabajados ({finiquitoData.periodo?.anios} años)</div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ['Décimo 13° proporcional', finiquitoData.calculo?.decimo13_proporcional],
                          ['Décimo 14° proporcional', finiquitoData.calculo?.decimo14_proporcional],
                          ['Vacaciones proporcionales', finiquitoData.calculo?.vacaciones_proporcionales],
                          ['Fondos de reserva prop.', finiquitoData.calculo?.fondos_reserva_proporcional],
                          ['Desahucio', finiquitoData.calculo?.desahucio],
                        ].map(([label, val]: any[]) => (
                          <div key={label} className="flex justify-between border-b border-gray-100 py-1">
                            <span className="text-gray-600">{label}</span>
                            <span className="font-mono">${Number(val||0).toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="col-span-2 flex justify-between border-t-2 border-red-300 pt-2 mt-1">
                          <span className="font-bold text-red-700">TOTAL LIQUIDACIÓN</span>
                          <span className="font-bold text-red-700 font-mono">${Number(finiquitoData.calculo?.total_liquidacion||0).toFixed(2)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">{finiquitoData.nota}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {empleados.filter((e) => e.estado === 'activo').length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50 text-gray-600" />
                <p className="text-gray-600">No hay empleados activos para calcular nómina</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#F97316]/20">
                      {[
                        'Empleado', 'Sal. Base', 'H.E.Diur.', 'H.E.Noct.', 'Otros/Desc.',
                        'Sal. Bruto', 'IESS Pers.', 'Fondos Res.', 'Ret. IR', 'Neto Pagar',
                        'IESS Patr.', 'Prov. 13°', 'Prov. 14°', 'Prov. Vac.', 'Costo Total',
                      ].map((h) => (
                        <th key={h} className="text-left text-gray-600 font-medium px-2 py-3 whitespace-nowrap text-xs">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const activos = empleados.filter((e) => e.estado === 'activo');
                      let tot = { bruto:0, personal:0, patronal:0, fondos:0, ir:0, neto:0, d13:0, d14:0, vac:0, costo:0 };
                      const inp = (empId: string, field: string, val: number) =>
                        setNominaExtras(prev => ({ ...prev, [empId]: { ...(prev[empId]||{}), [field]: val } }));

                      const rows = activos.map((emp) => {
                        const extras = nominaExtras[emp.id] || {};
                        const n = computeNomina(emp);
                        tot.bruto   += n.salario_bruto;    tot.personal += n.iess_personal;
                        tot.patronal += n.iess_patronal;   tot.fondos += n.fondos_reserva;
                        tot.ir      += n.ir_mensual;       tot.neto   += n.neto_pagar;
                        tot.d13     += n.provision_decimoTercero; tot.d14 += n.provision_decimoCuarto;
                        tot.vac     += n.provision_vacaciones;    tot.costo += n.costo_total_empresa;
                        const inputCls = "w-16 bg-gray-100 border border-orange-200 text-gray-900 rounded px-1 py-0.5 text-xs";
                        return (
                          <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50 text-xs">
                            <td className="px-2 py-2 text-gray-900 font-medium whitespace-nowrap">
                              {emp.nombre_completo}
                              <div className="text-gray-400 font-normal">${emp.salario_base.toFixed(0)}/mes{n.tiene_fondos_reserva ? ' · FR' : ''}{n.ir_mensual > 0 ? ' · IR' : ''}</div>
                            </td>
                            <td className="px-1 py-2 text-orange-600 font-mono">${emp.salario_base.toFixed(2)}</td>
                            <td className="px-1 py-1"><input type="number" min="0" step="0.5" defaultValue={0} onChange={e=>inp(emp.id,'horas_extras',parseFloat(e.target.value)||0)} className={inputCls} placeholder="0"/></td>
                            <td className="px-1 py-1"><input type="number" min="0" step="0.5" defaultValue={0} onChange={e=>inp(emp.id,'horas_extras_nocturnas',parseFloat(e.target.value)||0)} className={inputCls} placeholder="0"/></td>
                            <td className="px-1 py-1">
                              <input type="number" min="0" step="0.01" defaultValue={0} onChange={e=>inp(emp.id,'otros_ingresos',parseFloat(e.target.value)||0)} className={inputCls} placeholder="+"/>&nbsp;
                              <input type="number" min="0" step="0.01" defaultValue={0} onChange={e=>inp(emp.id,'descuentos',parseFloat(e.target.value)||0)} className={inputCls} placeholder="-"/>
                            </td>
                            <td className="px-2 py-2 font-mono font-bold text-gray-900">${n.salario_bruto.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-red-500">-${n.iess_personal.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-blue-600">{n.fondos_reserva > 0 ? `$${n.fondos_reserva.toFixed(2)}` : <span className="text-gray-300">—</span>}</td>
                            <td className="px-2 py-2 font-mono text-red-400">{n.ir_mensual > 0 ? `-$${n.ir_mensual.toFixed(2)}` : <span className="text-gray-300">—</span>}</td>
                            <td className="px-2 py-2 font-mono font-bold text-green-600">${n.neto_pagar.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-orange-500">${n.iess_patronal.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-gray-500">${n.provision_decimoTercero.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-gray-500">${n.provision_decimoCuarto.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-gray-500">${n.provision_vacaciones.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono font-bold text-orange-600">${n.costo_total_empresa.toFixed(2)}</td>
                          </tr>
                        );
                      });
                      return (
                        <>
                          {rows}
                          <tr className="border-t-2 border-orange-300 bg-orange-50 font-bold text-xs">
                            <td className="px-2 py-2 text-orange-700" colSpan={5}>TOTALES ({activos.length} empleados)</td>
                            <td className="px-2 py-2 font-mono text-gray-900">${tot.bruto.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-red-500">-${tot.personal.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-blue-600">${tot.fondos.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-red-400">${tot.ir.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-green-600">${tot.neto.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-orange-500">${tot.patronal.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-gray-600">${tot.d13.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-gray-600">${tot.d14.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-gray-600">${tot.vac.toFixed(2)}</td>
                            <td className="px-2 py-2 font-mono text-orange-700">${tot.costo.toFixed(2)}</td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
                <p className="text-gray-600 text-xs mt-3">
                  * IESS Patronal (11.15%) es informativo — no se descuenta del empleado; es el aporte a cargo de la empresa.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        </>
      )}

      {/* MODAL: NUEVO EMPLEADO */}
      {showEmpleadoModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#F97316]/30 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Nuevo Empleado</h2>
              <button onClick={() => setShowEmpleadoModal(false)} className="text-gray-600 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={crearEmpleado} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">Nombre Completo</Label>
                  <Input
                    required
                    value={formEmpleado.nombre_completo || ''}
                    onChange={(e) => setFormEmpleado({ ...formEmpleado, nombre_completo: e.target.value })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Email</Label>
                  <Input
                    type="email"
                    required
                    value={formEmpleado.email || ''}
                    onChange={(e) => setFormEmpleado({ ...formEmpleado, email: e.target.value })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Teléfono</Label>
                  <Input
                    value={formEmpleado.telefono || ''}
                    onChange={(e) => setFormEmpleado({ ...formEmpleado, telefono: e.target.value })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Cargo</Label>
                  <Input
                    value={formEmpleado.cargo || ''}
                    onChange={(e) => setFormEmpleado({ ...formEmpleado, cargo: e.target.value })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Departamento</Label>
                  <Input
                    value={formEmpleado.departamento || ''}
                    onChange={(e) => setFormEmpleado({ ...formEmpleado, departamento: e.target.value })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Fecha de Ingreso</Label>
                  <Input
                    type="date"
                    value={formEmpleado.fecha_ingreso || ''}
                    onChange={(e) => setFormEmpleado({ ...formEmpleado, fecha_ingreso: e.target.value })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Salario Base</Label>
                  <Input
                    type="number"
                    required
                    value={formEmpleado.salario_base || ''}
                    onChange={(e) => setFormEmpleado({ ...formEmpleado, salario_base: parseFloat(e.target.value) })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Estado</Label>
                  <Select
                    value={formEmpleado.estado || 'activo'}
                    onValueChange={(value: any) => setFormEmpleado({ ...formEmpleado, estado: value })}
                  >
                    <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#F97316]/30">
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEmpleadoModal(false)}
                  className="border-gray-600 text-gray-600 hover:bg-gray-800"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                  Crear Empleado
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NUEVA VACANTE */}
      {showVacanteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#F97316]/30 rounded-xl p-6 w-full max-w-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Nueva Vacante</h2>
              <button onClick={() => setShowVacanteModal(false)} className="text-gray-600 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={crearVacante} className="space-y-4">
              <div>
                <Label className="text-gray-900">Título del Puesto</Label>
                <Input
                  required
                  value={formVacante.titulo || ''}
                  onChange={(e) => setFormVacante({ ...formVacante, titulo: e.target.value })}
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                />
              </div>
              <div>
                <Label className="text-gray-900">Departamento</Label>
                <Input
                  required
                  value={formVacante.departamento || ''}
                  onChange={(e) => setFormVacante({ ...formVacante, departamento: e.target.value })}
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                />
              </div>
              <div>
                <Label className="text-gray-900">Descripción</Label>
                <textarea
                  required
                  value={formVacante.descripcion || ''}
                  onChange={(e) => setFormVacante({ ...formVacante, descripcion: e.target.value })}
                  className="w-full bg-gray-50 border border-[#F97316]/20 text-gray-900 rounded-lg p-2 min-h-[100px]"
                />
              </div>
              <div>
                <Label className="text-gray-900">Requisitos</Label>
                <textarea
                  required
                  value={formVacante.requisitos || ''}
                  onChange={(e) => setFormVacante({ ...formVacante, requisitos: e.target.value })}
                  className="w-full bg-gray-50 border border-[#F97316]/20 text-gray-900 rounded-lg p-2 min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">Salario Mínimo</Label>
                  <Input
                    type="number"
                    value={formVacante.salario_min || ''}
                    onChange={(e) => setFormVacante({ ...formVacante, salario_min: parseFloat(e.target.value) })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Salario Máximo</Label>
                  <Input
                    type="number"
                    value={formVacante.salario_max || ''}
                    onChange={(e) => setFormVacante({ ...formVacante, salario_max: parseFloat(e.target.value) })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowVacanteModal(false)}
                  className="border-gray-600 text-gray-600 hover:bg-gray-800"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="bg-gradient-to-r from-[#FB923C] to-[#FB923C]">
                  Publicar Vacante
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NUEVA EVALUACIÓN */}
      {showEvaluacionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#F97316]/30 rounded-xl p-6 w-full max-w-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Nueva Evaluación</h2>
              <button onClick={() => setShowEvaluacionModal(false)} className="text-gray-600 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={crearEvaluacion} className="space-y-4">
              <div>
                <Label className="text-gray-900">Empleado</Label>
                <Select
                  value={formEvaluacion.empleado_nombre || ''}
                  onValueChange={(value) => setFormEvaluacion({ ...formEvaluacion, empleado_nombre: value })}
                >
                  <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900">
                    <SelectValue placeholder="Selecciona un empleado" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#F97316]/30">
                    {empleados.map((emp) => (
                      <SelectItem key={emp.id} value={emp.nombre_completo}>
                        {emp.nombre_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-900">Período</Label>
                <Input
                  required
                  placeholder="Ej: Q1 2024, Enero 2024"
                  value={formEvaluacion.periodo || ''}
                  onChange={(e) => setFormEvaluacion({ ...formEvaluacion, periodo: e.target.value })}
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                />
              </div>
              <div>
                <Label className="text-gray-900">Calificación (1-5)</Label>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  required
                  value={formEvaluacion.calificacion || ''}
                  onChange={(e) => setFormEvaluacion({ ...formEvaluacion, calificacion: parseFloat(e.target.value) })}
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                />
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEvaluacionModal(false)}
                  className="border-gray-600 text-gray-600 hover:bg-gray-800"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="bg-gradient-to-r from-yellow-600 to-yellow-500">
                  Crear Evaluación
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NUEVA CAPACITACIÓN */}
      {showCapacitacionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#F97316]/30 rounded-xl p-6 w-full max-w-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Nueva Capacitación</h2>
              <button onClick={() => setShowCapacitacionModal(false)} className="text-gray-600 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={crearCapacitacion} className="space-y-4">
              <div>
                <Label className="text-gray-900">Título</Label>
                <Input
                  required
                  value={formCapacitacion.titulo || ''}
                  onChange={(e) => setFormCapacitacion({ ...formCapacitacion, titulo: e.target.value })}
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                />
              </div>
              <div>
                <Label className="text-gray-900">Descripción</Label>
                <textarea
                  required
                  value={formCapacitacion.descripcion || ''}
                  onChange={(e) => setFormCapacitacion({ ...formCapacitacion, descripcion: e.target.value })}
                  className="w-full bg-gray-50 border border-[#F97316]/20 text-gray-900 rounded-lg p-2 min-h-[100px]"
                />
              </div>
              <div>
                <Label className="text-gray-900">Instructor</Label>
                <Input
                  value={formCapacitacion.instructor || ''}
                  onChange={(e) => setFormCapacitacion({ ...formCapacitacion, instructor: e.target.value })}
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">Fecha Inicio</Label>
                  <Input
                    type="date"
                    required
                    value={formCapacitacion.fecha_inicio || ''}
                    onChange={(e) => setFormCapacitacion({ ...formCapacitacion, fecha_inicio: e.target.value })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Fecha Fin</Label>
                  <Input
                    type="date"
                    required
                    value={formCapacitacion.fecha_fin || ''}
                    onChange={(e) => setFormCapacitacion({ ...formCapacitacion, fecha_fin: e.target.value })}
                    className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCapacitacionModal(false)}
                  className="border-gray-600 text-gray-600 hover:bg-gray-800"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="bg-gradient-to-r from-[#C2410C] to-[#F97316]">
                  Crear Capacitación
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}