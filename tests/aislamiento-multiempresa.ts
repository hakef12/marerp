/**
 * ════════════════════════════════════════════════════════════════════════
 *  TEST DE AISLAMIENTO MULTI-EMPRESA (multi-tenant) — MAR ERP
 * ════════════════════════════════════════════════════════════════════════
 *
 * QUÉ HACE:
 *   Crea dos "empresas" de prueba (A y B) usando la API pública real
 *   (/server/auth/signup + /server/auth/login, igual que lo haría el
 *   frontend), y luego, para una serie de recursos (productos, mesas,
 *   usuarios, empleados, etc.):
 *
 *     1. los crea como Empresa A,
 *     2. intenta LEERLOS / MODIFICARLOS / BORRARLOS como Empresa B
 *        (el "atacante"), y
 *     3. verifica que:
 *          (a) la Empresa B SIEMPRE reciba 403/404 (nunca datos ni éxito), y
 *          (b) el recurso de la Empresa A quede intacto después del intento.
 *
 *   Si algún endpoint deja pasar a B, se reporta como 🚨 FUGA — eso sería
 *   una vulnerabilidad real de aislamiento entre clientes (catastrófico
 *   para un producto SaaS multi-tenant).
 *
 * POR QUÉ NECESITA LA SERVICE ROLE KEY:
 *   El test crea usuarios y empresas reales en la base de datos para poder
 *   probar contra la API real (no hay forma de simularlo). Al terminar,
 *   limpia todo lo que creó —y para eso (borrar usuarios de Supabase Auth,
 *   filas de `usuarios`/`empresas` y datos asociados) necesita la
 *   Service Role Key, que normalmente solo usa el backend.
 *
 *   Consíguela en: Supabase Dashboard → Project Settings → API → "service_role"
 *   (es secreta — NO la "anon key". Nunca la subas al repo).
 *
 * CÓMO CORRERLO:
 *   SUPABASE_SERVICE_ROLE_KEY="tu_clave_secreta" \
 *     deno run --allow-net --allow-env tests/aislamiento-multiempresa.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ── Configuración del proyecto (valores públicos, igual que en .env) ──────
const SUPABASE_URL = "https://ayaczqzezswnimabmvqx.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YWN6cXplenN3bmltYWJtdnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDYyNTIsImV4cCI6MjA4NzUyMjI1Mn0.MZTmP3F1RkH_pYisaiBWNyOYQyp0FAaWLVdFMH4LcRs";
const FUNC_BASE = `${SUPABASE_URL}/functions/v1/server`;

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SERVICE_KEY) {
  console.error(`
❌ Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY.

Este test crea empresas y usuarios reales para probar el aislamiento entre
ellos contra la API real, y necesita esa clave SOLO para poder limpiar todo
al finalizar (borrar usuarios de Auth + filas de "usuarios"/"empresas").

1. Ve a: Supabase Dashboard → Project Settings → API → "service_role"
2. Corre:

   SUPABASE_SERVICE_ROLE_KEY="tu_clave_secreta" deno run --allow-net --allow-env tests/aislamiento-multiempresa.ts
`);
  Deno.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Identificadores únicos para esta corrida (evita choques entre corridas) ─
const RUN = Date.now();
const NOMBRE_EMPRESA = (tag: string) => `TEST-AISLAMIENTO-${RUN}-${tag}`;
const RUC = (tag: string) => `1799999${String(RUN).slice(-3)}${tag === "A" ? "1" : "2"}`;
const EMAIL = (tag: string) => `test.aislamiento.${RUN}.${tag.toLowerCase()}@mar-test.local`;
const PASSWORD = (tag: string) => `T3st#Aisl${RUN}${tag}`;

interface Empresa {
  tag: "A" | "B";
  email: string;
  password: string;
  token: string;
  empresaId: string;
  authUserId: string;
  usuarioId: string;
}

async function crearEmpresaDePrueba(tag: "A" | "B"): Promise<Empresa> {
  const email = EMAIL(tag);
  const password = PASSWORD(tag);

  const rSignup = await fetch(`${FUNC_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({
      empresa_nombre: NOMBRE_EMPRESA(tag),
      empresa_ruc: RUC(tag),
      empresa_email: email,
      usuario_nombre: `Tester ${tag}`,
      usuario_email: email,
      usuario_password: password,
      plan_tipo: "basico",
    }),
  });
  const signupJson = await rSignup.json();
  if (!rSignup.ok) {
    throw new Error(`No se pudo crear la empresa de prueba ${tag}: ${JSON.stringify(signupJson)}`);
  }

  const rLogin = await fetch(`${FUNC_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ email, password }),
  });
  const loginJson = await rLogin.json();
  if (!rLogin.ok) {
    throw new Error(`No se pudo iniciar sesión con la empresa de prueba ${tag}: ${JSON.stringify(loginJson)}`);
  }

  return {
    tag,
    email,
    password,
    token: loginJson.access_token,
    empresaId: signupJson.empresa.id,
    authUserId: signupJson.usuario.auth_user_id,
    usuarioId: signupJson.usuario.id,
  };
}

function authFetch(emp: Empresa, path: string, init: RequestInit = {}) {
  return fetch(`${FUNC_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      "X-User-Token": emp.token,
      ...(init.headers || {}),
    },
  });
}

async function asJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ── Registro de resultados ────────────────────────────────────────────────
type Veredicto = "OK" | "FUGA" | "INCONCLUSO";
interface Resultado {
  recurso: string;
  operacion: string;
  veredicto: Veredicto;
  detalle: string;
}
const resultados: Resultado[] = [];

function reportar(recurso: string, operacion: string, veredicto: Veredicto, detalle: string) {
  resultados.push({ recurso, operacion, veredicto, detalle });
  const icono = veredicto === "OK" ? "✅" : veredicto === "FUGA" ? "🚨" : "⚠️ ";
  console.log(`   ${icono} ${operacion.padEnd(28)} ${veredicto.padEnd(11)} ${detalle}`);
}

// ── Núcleo: crea un recurso como A, ataca como B, verifica integridad ─────
interface PruebaRecurso {
  recurso: string;
  /** Crea el recurso como `victima` (Empresa A) y devuelve su id, o null si no se pudo. */
  crear: (victima: Empresa) => Promise<string | null>;
  /** Operaciones que el atacante (Empresa B) intentará sobre el id ajeno. */
  operaciones: { nombre: string; metodo: string; path: (id: string) => string; payload?: unknown }[];
  /** Confirma que, tras el ataque, el recurso de A sigue intacto (true = intacto). */
  verificarIntacto?: (victima: Empresa, id: string) => Promise<boolean>;
  /** Limpieza best-effort del recurso creado (no afecta el veredicto). */
  limpiar?: (victima: Empresa, id: string) => Promise<void>;
}

async function ejecutarPrueba(empresaA: Empresa, empresaB: Empresa, p: PruebaRecurso) {
  console.log(`\n▶ ${p.recurso}`);

  let id: string | null;
  try {
    id = await p.crear(empresaA);
  } catch (e) {
    reportar(p.recurso, "crear recurso de prueba", "INCONCLUSO", `excepción: ${(e as Error).message}`);
    return;
  }
  if (!id) {
    reportar(p.recurso, "crear recurso de prueba", "INCONCLUSO", "el endpoint de creación no devolvió un id usable — no se pudo probar este recurso");
    return;
  }

  for (const op of p.operaciones) {
    try {
      const res = await authFetch(empresaB, op.path(id), {
        method: op.metodo,
        body: op.payload !== undefined ? JSON.stringify(op.payload) : undefined,
      });
      const body = await asJson(res);
      const exito = res.status >= 200 && res.status < 300;

      if (exito) {
        reportar(
          p.recurso,
          `B → ${op.nombre}`,
          "FUGA",
          `HTTP ${res.status} — la empresa B pudo operar sobre un recurso de la empresa A. Respuesta: ${JSON.stringify(body).slice(0, 180)}`
        );
      } else if ([403, 404, 400, 422].includes(res.status)) {
        reportar(p.recurso, `B → ${op.nombre}`, "OK", `bloqueado correctamente (HTTP ${res.status})`);
      } else {
        reportar(
          p.recurso,
          `B → ${op.nombre}`,
          "INCONCLUSO",
          `HTTP ${res.status} no esperado (ni éxito ni 403/404/400/422) — revisar manualmente: ${JSON.stringify(body).slice(0, 150)}`
        );
      }
    } catch (e) {
      reportar(p.recurso, `B → ${op.nombre}`, "INCONCLUSO", `error de red: ${(e as Error).message}`);
    }
  }

  if (p.verificarIntacto) {
    try {
      const intacto = await p.verificarIntacto(empresaA, id);
      reportar(
        p.recurso,
        "integridad post-ataque",
        intacto ? "OK" : "FUGA",
        intacto
          ? "el recurso de la empresa A sigue intacto tras los intentos de B"
          : "🚨 el recurso de la empresa A fue alterado o eliminado por la empresa B"
      );
    } catch (e) {
      reportar(p.recurso, "integridad post-ataque", "INCONCLUSO", `no se pudo verificar: ${(e as Error).message}`);
    }
  }

  if (p.limpiar) {
    try {
      await p.limpiar(empresaA, id);
    } catch {
      /* limpieza best-effort */
    }
  }
}

// ── Definición de las pruebas por recurso ─────────────────────────────────
function definirPruebas(): PruebaRecurso[] {
  const sufijo = `AISL-${RUN}`;

  return [
    // ── Inventario: productos ───────────────────────────────────────────
    {
      recurso: "productos (inventario-routes.tsx)",
      crear: async (a) => {
        const r = await authFetch(a, "/productos", {
          method: "POST",
          body: JSON.stringify({
            codigo: `PROD-${sufijo}`,
            nombre: `Producto Test Aislamiento ${sufijo}`,
            precio_venta: 9.99,
            precio_compra: 5,
            stock_actual: 10,
            unidad_medida: "unidad",
            categoria: "Otros",
          }),
        });
        const j = await asJson(r);
        return j?.producto?.id ?? null;
      },
      operaciones: [
        { nombre: "PUT /productos/:id", metodo: "PUT", path: (id) => `/productos/${id}`, payload: { nombre: "HACKEADO POR B" } },
        { nombre: "DELETE /productos/:id", metodo: "DELETE", path: (id) => `/productos/${id}` },
      ],
      verificarIntacto: async (a, id) => {
        const r = await authFetch(a, `/inventario`);
        const j = await asJson(r);
        const inventario = j?.inventario ?? [];
        const p = Array.isArray(inventario) ? inventario.find((x: any) => x.id === id) : null;
        return !!p && p.nombre !== "HACKEADO POR B";
      },
      limpiar: async (a, id) => { await authFetch(a, `/productos/${id}`, { method: "DELETE" }); },
    },

    // ── Inventario: categorías ──────────────────────────────────────────
    {
      recurso: "categorías (inventario-routes.tsx)",
      crear: async (a) => {
        const r = await authFetch(a, "/categorias", {
          method: "POST",
          body: JSON.stringify({ nombre: `Categoría Test ${sufijo}`, color: "#123456", icono: "🔒" }),
        });
        const j = await asJson(r);
        return j?.categoria?.id ?? null;
      },
      operaciones: [
        { nombre: "PUT /categorias/:id", metodo: "PUT", path: (id) => `/categorias/${id}`, payload: { nombre: "HACKEADO POR B" } },
        { nombre: "DELETE /categorias/:id", metodo: "DELETE", path: (id) => `/categorias/${id}` },
      ],
      limpiar: async (a, id) => { await authFetch(a, `/categorias/${id}`, { method: "DELETE" }); },
    },

    // ── Inventario: proveedores ─────────────────────────────────────────
    {
      recurso: "proveedores (inventario-routes.tsx)",
      crear: async (a) => {
        const r = await authFetch(a, "/proveedores", {
          method: "POST",
          body: JSON.stringify({ nombre: `Proveedor Test ${sufijo}`, ruc_nit: `RUC-${sufijo}`, telefono: "0999999999" }),
        });
        const j = await asJson(r);
        return j?.proveedor?.id ?? null;
      },
      operaciones: [
        { nombre: "PUT /proveedores/:id", metodo: "PUT", path: (id) => `/proveedores/${id}`, payload: { nombre: "HACKEADO POR B" } },
        { nombre: "DELETE /proveedores/:id", metodo: "DELETE", path: (id) => `/proveedores/${id}` },
      ],
      limpiar: async (a, id) => { await authFetch(a, `/proveedores/${id}`, { method: "DELETE" }); },
    },

    // ── Mesas (mesas-routes.tsx) — el "id" de ruta es en realidad el código ─
    {
      recurso: "mesas (mesas-routes.tsx)",
      crear: async (a) => {
        // POST /mesas crea una mesa nueva con código autogenerado
        const r = await authFetch(a, "/mesas", { method: "POST", body: JSON.stringify({ nombre: `Mesa Test ${sufijo}`, capacidad: 4 }) });
        const j = await asJson(r);
        return j?.mesa?.codigo ?? null;
      },
      operaciones: [
        { nombre: "PUT /mesas/:codigo", metodo: "PUT", path: (cod) => `/mesas/${cod}`, payload: { nombre: "HACKEADO POR B" } },
        { nombre: "POST /mesas/:codigo/ocupar", metodo: "POST", path: (cod) => `/mesas/${cod}/ocupar`, payload: { personas: 2 } },
        { nombre: "DELETE /mesas/:codigo", metodo: "DELETE", path: (cod) => `/mesas/${cod}` },
      ],
      verificarIntacto: async (a, cod) => {
        const r = await authFetch(a, `/mesas`);
        const j = await asJson(r);
        const mesas = j?.mesas ?? [];
        const m = Array.isArray(mesas) ? mesas.find((x: any) => x.codigo === cod) : null;
        return !!m && m.nombre !== "HACKEADO POR B" && m.estado !== "ocupada";
      },
      limpiar: async (a, cod) => { await authFetch(a, `/mesas/${cod}`, { method: "DELETE" }); },
    },

    // ── Usuarios (usuarios-routes.tsx) — atacar al usuario admin de A ───
    {
      recurso: "usuarios (usuarios-routes.tsx)",
      crear: async (a) => a.usuarioId, // usamos el usuario admin creado en el signup de A
      operaciones: [
        { nombre: "PUT /usuarios/:id", metodo: "PUT", path: (id) => `/usuarios/${id}`, payload: { nombre_completo: "HACKEADO POR B", rol: "admin" } },
        { nombre: "DELETE /usuarios/:id", metodo: "DELETE", path: (id) => `/usuarios/${id}` },
      ],
      verificarIntacto: async (a, id) => {
        // Si B pudo desactivar/borrar al admin de A, el login de A fallaría o el nombre cambiaría
        const r = await authFetch(a, `/usuarios`);
        const j = await asJson(r);
        const usuarios = j?.usuarios ?? [];
        const u = Array.isArray(usuarios) ? usuarios.find((x: any) => x.id === id) : null;
        return !!u && u.nombre_completo !== "HACKEADO POR B" && u.activo !== false;
      },
    },

    // ── RRHH: empleados ─────────────────────────────────────────────────
    {
      recurso: "empleados (rrhh-routes.tsx)",
      crear: async (a) => {
        const r = await authFetch(a, "/rrhh/empleados", {
          method: "POST",
          body: JSON.stringify({
            nombre_completo: `Empleado Test ${sufijo}`,
            cedula: `CED-${sufijo}`,
            cargo: "Mesero",
            salario: 460,
            fecha_ingreso: new Date().toISOString().split("T")[0],
          }),
        });
        const j = await asJson(r);
        return j?.empleado?.id ?? null;
      },
      operaciones: [
        { nombre: "GET /rrhh/empleados/:id", metodo: "GET", path: (id) => `/rrhh/empleados/${id}` },
        { nombre: "PUT /rrhh/empleados/:id", metodo: "PUT", path: (id) => `/rrhh/empleados/${id}`, payload: { nombre_completo: "HACKEADO POR B" } },
        { nombre: "DELETE /rrhh/empleados/:id", metodo: "DELETE", path: (id) => `/rrhh/empleados/${id}` },
      ],
      limpiar: async (a, id) => { await authFetch(a, `/rrhh/empleados/${id}`, { method: "DELETE" }); },
    },

    // ── Ingeniería de menú: recetas ─────────────────────────────────────
    {
      recurso: "recetas (ingenieria-menu-routes.tsx)",
      crear: async (a) => {
        const r = await authFetch(a, "/ingenieria-menu/recetas", {
          method: "POST",
          body: JSON.stringify({
            nombre_plato: `Receta Test ${sufijo}`,
            precio_venta: 8.5,
            ingredientes: [],
          }),
        });
        const j = await asJson(r);
        return j?.receta?.id ?? null;
      },
      operaciones: [
        { nombre: "GET /ingenieria-menu/recetas/:id", metodo: "GET", path: (id) => `/ingenieria-menu/recetas/${id}` },
        { nombre: "PUT /ingenieria-menu/recetas/:id", metodo: "PUT", path: (id) => `/ingenieria-menu/recetas/${id}`, payload: { nombre_plato: "HACKEADO POR B" } },
        { nombre: "DELETE /ingenieria-menu/recetas/:id", metodo: "DELETE", path: (id) => `/ingenieria-menu/recetas/${id}` },
      ],
      limpiar: async (a, id) => { await authFetch(a, `/ingenieria-menu/recetas/${id}`, { method: "DELETE" }); },
    },

    // ── Contabilidad: cuentas contables ─────────────────────────────────
    {
      recurso: "cuentas contables (contabilidad-routes.tsx)",
      crear: async (a) => {
        // Inicializa el plan contable de A (idempotente) y toma la primera cuenta
        await authFetch(a, "/contabilidad/cuentas/inicializar", { method: "POST" });
        const r = await authFetch(a, "/contabilidad/cuentas");
        const j = await asJson(r);
        const cuentas = j?.cuentas ?? [];
        return Array.isArray(cuentas) && cuentas.length ? cuentas[0].id : null;
      },
      operaciones: [
        { nombre: "PUT /contabilidad/cuentas/:id", metodo: "PUT", path: (id) => `/contabilidad/cuentas/${id}`, payload: { nombre: "HACKEADO POR B", codigo: "9999" } },
        { nombre: "DELETE /contabilidad/cuentas/:id", metodo: "DELETE", path: (id) => `/contabilidad/cuentas/${id}` },
      ],
      // Caso especial: guardarCuenta() hace upsert(onConflict:'id'), así que un PUT
      // exitoso de B no solo "modifica" la cuenta de A — además le RE-ASIGNA el
      // empresa_id al de B (la "secuestra"). Por eso la verificación de integridad
      // no solo mira el nombre: confirma que la cuenta SIGUE apareciendo en la
      // lista de A (si desapareció, fue robada hacia el tenant de B).
      verificarIntacto: async (a, id) => {
        const r = await authFetch(a, "/contabilidad/cuentas");
        const j = await asJson(r);
        const cuentas = j?.cuentas ?? [];
        const cta = Array.isArray(cuentas) ? cuentas.find((x: any) => x.id === id) : null;
        return !!cta && cta.nombre !== "HACKEADO POR B" && cta.codigo !== "9999";
      },
    },
  ];
}

// ── Limpieza final: borra todo lo creado por este run ─────────────────────
async function limpiarEmpresaDePrueba(emp: Empresa) {
  try {
    await admin.from("usuarios").delete().eq("empresa_id", emp.empresaId);
    await admin.from("bodegas").delete().eq("empresa_id", emp.empresaId);
    await admin.from("empresas").delete().eq("id", emp.empresaId);
    await admin.auth.admin.deleteUser(emp.authUserId);
    console.log(`   🧹 Empresa de prueba ${emp.tag} (${emp.empresaId}) eliminada`);
  } catch (e) {
    console.warn(`   ⚠️  No se pudo limpiar completamente la empresa ${emp.tag}: ${(e as Error).message}`);
    console.warn(`       → revisar manualmente empresa_id=${emp.empresaId} / auth_user_id=${emp.authUserId}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("════════════════════════════════════════════════════════════════");
  console.log(" TEST DE AISLAMIENTO MULTI-EMPRESA — MAR ERP");
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`Run ID: ${RUN}`);

  console.log("\n🏗  Creando empresas de prueba...");
  const empresaA = await crearEmpresaDePrueba("A");
  console.log(`   ✓ Empresa A creada (empresa_id=${empresaA.empresaId})`);
  const empresaB = await crearEmpresaDePrueba("B");
  console.log(`   ✓ Empresa B creada (empresa_id=${empresaB.empresaId}) — actuará como "atacante"`);

  try {
    const pruebas = definirPruebas();
    for (const p of pruebas) {
      await ejecutarPrueba(empresaA, empresaB, p);
    }
  } finally {
    console.log("\n🧹 Limpiando datos de prueba...");
    await limpiarEmpresaDePrueba(empresaA);
    await limpiarEmpresaDePrueba(empresaB);
  }

  // ── Resumen ──────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log(" RESUMEN");
  console.log("════════════════════════════════════════════════════════════════");
  const fugas = resultados.filter((r) => r.veredicto === "FUGA");
  const inconclusos = resultados.filter((r) => r.veredicto === "INCONCLUSO");
  const ok = resultados.filter((r) => r.veredicto === "OK");

  console.log(`   ✅ OK:         ${ok.length}`);
  console.log(`   🚨 FUGAS:      ${fugas.length}`);
  console.log(`   ⚠️  INCONCLUSO: ${inconclusos.length}`);

  if (fugas.length) {
    console.log("\n🚨🚨🚨 SE ENCONTRARON FUGAS DE AISLAMIENTO ENTRE EMPRESAS 🚨🚨🚨");
    for (const f of fugas) console.log(`   - [${f.recurso}] ${f.operacion}: ${f.detalle}`);
  } else {
    console.log("\n✅ No se detectaron fugas de datos entre empresas en los recursos probados.");
  }

  if (inconclusos.length) {
    console.log("\n⚠️  Casos inconclusos (revisar manualmente — no implican necesariamente un problema):");
    for (const i of inconclusos) console.log(`   - [${i.recurso}] ${i.operacion}: ${i.detalle}`);
  }

  Deno.exit(fugas.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\n💥 Error fatal en el test:", e);
  Deno.exit(2);
});
