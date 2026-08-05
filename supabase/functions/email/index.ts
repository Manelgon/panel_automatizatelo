// =============================================================================
// EDGE FUNCTION: email
// =============================================================================
// El panel es un SPA (Vite) y no tiene servidor propio, así que TODO lo que
// toque credenciales SMTP vive aquí. El navegador nunca ve una contraseña.
//
// Acciones (POST, body { accion: ... }):
//   leer-config     → ajustes sin contraseñas + flags de "hay contraseña guardada"
//   guardar-config  → guarda ajustes; cifra las contraseñas que lleguen en claro
//   probar          → envía un correo de prueba a la dirección indicada
//   enviar          → envía un correo (libre o desde plantilla + lead_id)
//
// Autorización:
//   - Acciones de config y prueba: JWT de un usuario con users.role = 'admin'.
//   - `enviar`: JWT de admin  O BIEN  cabecera x-email-secret (la usa el trigger
//     de la BD, que no tiene sesión de usuario).
//
// Variables de entorno necesarias:
//   EMAIL_ENCRYPTION_KEY  64 caracteres hex (32 bytes). Genérala una vez y NO la
//                         cambies: si la pierdes, hay que reintroducir las claves.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (las pone Supabase)
//
// Despliegue:
//   supabase functions deploy email
//   supabase secrets set EMAIL_ENCRYPTION_KEY=<64 hex>
// =============================================================================

// @ts-nocheck  // editor local sin tipos Deno; el runtime sí los tiene
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-email-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// =============================================================================
// CIFRADO AES-256-GCM
// Formato del blob: iv(16) + tag(16) + ciphertext, todo en base64.
// =============================================================================
async function getKey(): Promise<CryptoKey> {
  const hex = Deno.env.get('EMAIL_ENCRYPTION_KEY') ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('EMAIL_ENCRYPTION_KEY debe ser 64 caracteres hexadecimales (32 bytes)');
  }
  const raw = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function cifrar(texto: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const buf = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, new TextEncoder().encode(texto)),
  );
  // WebCrypto devuelve ciphertext||tag; lo guardamos como iv+tag+ciphertext
  const ct = buf.subarray(0, buf.length - 16);
  const tag = buf.subarray(buf.length - 16);
  const out = new Uint8Array(32 + ct.length);
  out.set(iv, 0);
  out.set(tag, 16);
  out.set(ct, 32);
  return toB64(out);
}

async function descifrar(blob: string): Promise<string> {
  const key = await getKey();
  const raw = fromB64(blob);
  const iv = raw.subarray(0, 16);
  const tag = raw.subarray(16, 32);
  const ct = raw.subarray(32);
  const joined = new Uint8Array(ct.length + 16);
  joined.set(ct, 0);
  joined.set(tag, ct.length);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, joined);
  return new TextDecoder().decode(plain);
}

// =============================================================================
// PLANTILLAS
// =============================================================================

// Debe coincidir con el selector "¿Qué te interesa?" del formulario de la web.
const SERVICIOS: Record<string, string> = {
  formacion_ia: 'formación en IA para tu equipo',
  cumplimiento_ai_act: 'el cumplimiento del AI Act',
  empezar_con_ia: 'empezar a usar la IA en tu empresa',
  automatizar_procesos: 'automatizar tareas repetitivas',
  chatbot: 'un chatbot para WhatsApp o tu web',
  panel_gestion: 'un panel de gestión a medida',
  no_lo_se: 'cómo puede ayudarte la IA',
};

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bloqueCta(agendaUrl: string, whatsappUrl: string): string {
  const wa = whatsappUrl
    ? `<p style="margin:16px 0 0;text-align:center;font-size:14px;color:#78716c;">
         ¿Prefieres otra vía? Responde a este correo o
         <a href="${escapeHtml(whatsappUrl)}" style="color:#EA580C;">escríbeme por WhatsApp</a>.
       </p>`
    : '';

  if (agendaUrl) {
    return `<div style="text-align:center;margin:32px 0 0;">
        <a href="${escapeHtml(agendaUrl)}" style="display:inline-block;background:#EA580C;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:16px 32px;border-radius:50px;">Reservar mis 30 minutos</a>
      </div>${wa}`;
  }

  return `<div style="background:#FAF6EF;border:1px solid #f0ead9;border-left:4px solid #EA580C;padding:24px;margin:28px 0 0;border-radius:6px;">
      <p style="margin:0;font-size:16px;line-height:1.6;color:#44403c;">
        Para reservar tu hueco, <strong>responde a este correo</strong> con un par de
        líneas sobre tu caso y te mando el enlace a mi agenda.
      </p>
    </div>${wa}`;
}

function render(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? '');
}

// =============================================================================
// ENVÍO SMTP
// =============================================================================
async function enviarSmtp(cfg: Record<string, unknown>, pass: string, to: string, subject: string, html: string) {
  const port = Number(cfg.smtp_port) || 465;
  const ssl = (cfg.smtp_encryption as string) !== 'starttls'; // 465 = TLS directo; 587 = STARTTLS

  const client = new SMTPClient({
    connection: {
      hostname: cfg.smtp_host as string,
      port,
      tls: ssl,
      auth: { username: cfg.smtp_user as string, password: pass },
    },
  });

  try {
    await client.send({
      from: `${(cfg.smtp_from_name as string) || (cfg.smtp_user as string)} <${cfg.smtp_user}>`,
      to,
      replyTo: (cfg.smtp_reply_to as string) || undefined,
      subject,
      html,
      content: 'auto', // genera la alternativa en texto plano
    });
  } finally {
    await client.close().catch(() => {});
  }
}

// =============================================================================
// HANDLER
// =============================================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const accion = String(body.accion ?? '');

  // ---------------------------------------------------------------------------
  // Autorización
  // ---------------------------------------------------------------------------
  const { data: settings, error: settingsError } = await admin
    .from('email_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (settingsError) return json({ error: 'No se pudo leer email_settings: ' + settingsError.message }, 500);
  if (!settings) return json({ error: 'Falta la fila 1 de email_settings (aplica la migración 007)' }, 500);

  const secretCabecera = req.headers.get('x-email-secret') ?? '';
  const secretGuardado = String(settings.edge_secret ?? '');
  const porSecreto = accion === 'enviar' && secretGuardado.length > 0 && secretCabecera === secretGuardado;

  let esAdmin = false;
  if (!porSecreto) {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'No autenticado' }, 401);

    const { data: userData } = await admin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'No autenticado' }, 401);

    const { data: perfil } = await admin.from('users').select('role').eq('id', uid).maybeSingle();
    esAdmin = perfil?.role === 'admin';
    if (!esAdmin) return json({ error: 'Se requiere rol de administrador' }, 403);
  }

  // ---------------------------------------------------------------------------
  // leer-config
  // ---------------------------------------------------------------------------
  if (accion === 'leer-config') {
    const { smtp_password, imap_password, edge_secret, ...resto } = settings as Record<string, unknown>;
    return json({
      ok: true,
      config: {
        ...resto,
        smtp_password_guardada: !!smtp_password,
        imap_password_guardada: !!imap_password,
        edge_secret_guardado: !!edge_secret,
      },
      clave_cifrado_ok: /^[0-9a-fA-F]{64}$/.test(Deno.env.get('EMAIL_ENCRYPTION_KEY') ?? ''),
    });
  }

  // ---------------------------------------------------------------------------
  // guardar-config
  // ---------------------------------------------------------------------------
  if (accion === 'guardar-config') {
    const entrada = (body.config ?? {}) as Record<string, unknown>;

    const CAMPOS_LIBRES = [
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_encryption', 'smtp_from_name', 'smtp_reply_to',
      'imap_host', 'imap_port', 'imap_user', 'imap_encryption',
      'agenda_url', 'whatsapp_url', 'edge_url', 'bienvenida_activa',
    ];

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const c of CAMPOS_LIBRES) {
      if (entrada[c] !== undefined) update[c] = entrada[c] === '' ? null : entrada[c];
    }

    // Las contraseñas solo se tocan si llegan con valor: vacío = "deja la que hay"
    try {
      if (typeof entrada.smtp_password === 'string' && entrada.smtp_password.length > 0) {
        update.smtp_password = await cifrar(entrada.smtp_password);
      }
      if (typeof entrada.imap_password === 'string' && entrada.imap_password.length > 0) {
        update.imap_password = await cifrar(entrada.imap_password);
      }
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }

    if (typeof entrada.edge_secret === 'string' && entrada.edge_secret.length > 0) {
      update.edge_secret = entrada.edge_secret;
    }

    const { error } = await admin.from('email_settings').update(update).eq('id', 1);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  }

  // ---------------------------------------------------------------------------
  // probar
  // ---------------------------------------------------------------------------
  if (accion === 'probar') {
    const destino = String(body.to ?? '').trim();
    if (!destino) return json({ error: 'Falta la dirección de destino' }, 400);
    if (!settings.smtp_host || !settings.smtp_password) {
      return json({ error: 'SMTP incompleto: falta servidor o contraseña' }, 400);
    }

    try {
      const pass = await descifrar(settings.smtp_password as string);
      await enviarSmtp(
        settings,
        pass,
        destino,
        'Prueba de configuración — panel Automatizatelo',
        `<p style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#1C1917;">
           Si lees esto, el SMTP del panel funciona.<br>
           Servidor: <strong>${escapeHtml(String(settings.smtp_host))}:${Number(settings.smtp_port) || 465}</strong>
           (${escapeHtml(String(settings.smtp_encryption ?? 'ssl'))}).
         </p>`,
      );
      return json({ ok: true, mensaje: 'Correo de prueba enviado a ' + destino });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // enviar
  // ---------------------------------------------------------------------------
  if (accion === 'enviar') {
    let to = String(body.to ?? '').trim();
    let asunto = String(body.asunto ?? '').trim();
    let html = String(body.html ?? '');
    const plantillaClave = body.plantilla ? String(body.plantilla) : null;
    const leadId = body.lead_id ? String(body.lead_id) : null;

    // Si viene plantilla, la renderizamos con los datos del lead
    if (plantillaClave) {
      const { data: plantilla } = await admin
        .from('email_plantillas')
        .select('*')
        .eq('clave', plantillaClave)
        .maybeSingle();

      if (!plantilla) return json({ error: `Plantilla "${plantillaClave}" no encontrada` }, 404);
      if (plantilla.activa === false) return json({ ok: true, omitido: 'plantilla desactivada' });

      let lead: Record<string, unknown> | null = null;
      if (leadId) {
        const { data } = await admin
          .from('leads')
          .select('id, first_name, last_name, email, service_interest, company')
          .eq('id', leadId)
          .maybeSingle();
        lead = data;
      }

      if (!to) to = String(lead?.email ?? '').trim();
      if (!to) return json({ error: 'No hay destinatario (ni body.to ni lead.email)' }, 400);

      const nombre = String(lead?.first_name ?? '').trim();
      const vars: Record<string, string> = {
        nombre: escapeHtml(nombre),
        saludo: nombre ? `¡Hola ${escapeHtml(nombre)}!` : '¡Hola!',
        email: escapeHtml(to),
        empresa: escapeHtml(String(lead?.company ?? '')),
        servicio: SERVICIOS[String(lead?.service_interest ?? '')] ?? 'cómo puede ayudarte la IA',
        cta: bloqueCta(String(settings.agenda_url ?? ''), String(settings.whatsapp_url ?? '')),
      };

      asunto = render(plantilla.asunto, vars).replace(/\s*—\s*$/, ''); // por si {{nombre}} va vacío
      html = render(plantilla.html, vars);
    }

    if (!to || !asunto || !html) return json({ error: 'Faltan destinatario, asunto o cuerpo' }, 400);

    // 1. Dejamos rastro ANTES de intentar el envío
    const { data: registro } = await admin
      .from('email_envios')
      .insert({
        lead_id: leadId,
        para: to,
        asunto,
        html,
        plantilla: plantillaClave,
        origen: porSecreto ? 'trigger' : 'panel',
        estado: 'pendiente',
      })
      .select('id')
      .maybeSingle();

    const registroId = registro?.id ?? null;

    // Si el índice único frenó el insert, es que ya se envió esa bienvenida
    if (!registroId && plantillaClave === 'lead_bienvenida') {
      return json({ ok: true, omitido: 'ya se envió la bienvenida a este lead' });
    }

    const marcarError = async (msg: string) => {
      if (registroId) await admin.from('email_envios').update({ estado: 'error', error: msg }).eq('id', registroId);
    };

    if (!settings.smtp_host || !settings.smtp_password) {
      const msg = 'SMTP no configurado en el panel';
      await marcarError(msg);
      return json({ error: msg }, 400);
    }

    try {
      const pass = await descifrar(settings.smtp_password as string);
      await enviarSmtp(settings, pass, to, asunto, html);

      if (registroId) {
        await admin
          .from('email_envios')
          .update({ estado: 'enviado', sent_at: new Date().toISOString() })
          .eq('id', registroId);
      }
      return json({ ok: true, id: registroId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await marcarError(msg);
      console.error('[email] fallo de envío', registroId ?? '(sin registro)', msg);
      return json({ error: msg }, 500);
    }
  }

  return json({ error: `Acción desconocida: "${accion}"` }, 400);
});
