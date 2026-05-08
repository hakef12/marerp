import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

export async function registrarAuditoria(
  empresaId: string,
  usuarioId: string,
  accion: string,
  modulo: string,
  tabla: string | null,
  registroId: string | null,
  datosAnteriores: any = null,
  datosNuevos: any = null,
  ipAddress: string | null = null
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error } = await supabase.from('auditoria').insert({
      empresa_id: empresaId,
      usuario_id: usuarioId,
      accion,
      modulo,
      tabla,
      registro_id: registroId ? String(registroId) : null,
      datos_anteriores: datosAnteriores,
      datos_nuevos: datosNuevos,
      ip_address: ipAddress,
      resultado: 'exitoso'
    });
    if (error) {
      console.error('❌ [Auditoría] Error insertando log:', error.message);
    } else {
      console.log(`✅ [Auditoría] ${accion} en ${tabla} por usuario ${usuarioId}`);
    }
  } catch (err: any) {
    console.error('❌ [Auditoría] Excepción:', err.message);
  }
}

export async function verificarPassword(email: string, password: string): Promise<boolean> {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  } catch {
    return false;
  }
}
