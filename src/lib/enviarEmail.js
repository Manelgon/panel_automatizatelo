import { supabase } from './supabase';

// =============================================================================
// ENVÍO DE DOCUMENTOS POR CORREO
// =============================================================================
// Puente entre los PDF que genera el panel (jsPDF) y la Edge Function `email`,
// que es quien tiene las credenciales SMTP. El navegador nunca toca el SMTP:
// convierte el documento a base64 y se lo entrega a la función.
// =============================================================================

/** jsPDF → base64, por trozos: el spread de un ArrayBuffer grande revienta la pila. */
export function pdfABase64(doc) {
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    let binario = '';
    const TROZO = 0x8000;
    for (let i = 0; i < bytes.length; i += TROZO) {
        binario += String.fromCharCode.apply(null, bytes.subarray(i, i + TROZO));
    }
    return btoa(binario);
}

/**
 * Cuerpo HTML con la voz de la web: primera persona, marca arriba, sin adornos.
 * `lineas` son párrafos ya escritos; se escapan aquí.
 */
export function htmlDocumento({ saludo = '¡Hola!', lineas = [] }) {
    const esc = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const parrafos = lineas
        .map((l) => `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#44403c;">${esc(l)}</p>`)
        .join('');

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#1C1917;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#ffffff;">
    <tr><td style="padding:36px 32px 6px;">
      <p style="margin:0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#EA580C;font-weight:bold;">Automatizatelo</p>
    </td></tr>
    <tr><td style="padding:10px 32px 36px;">
      <h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;color:#1C1917;">${esc(saludo)}</h1>
      ${parrafos}
      <p style="margin:26px 0 0;font-size:16px;line-height:1.65;color:#44403c;">
        Un saludo,<br><strong>Manel Méndez González</strong><br>
        <span style="font-size:14px;color:#78716c;">Automatizatelo · Implantación de IA</span>
      </p>
    </td></tr>
    <tr><td style="padding:18px 32px;border-top:1px solid #f0ead9;background:#FAF6EF;text-align:center;">
      <p style="margin:0;font-size:11px;color:#a8a29e;">
        <a href="https://automatizatelo.com" style="color:#a8a29e;">automatizatelo.com</a>
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Envía un correo con un PDF adjunto a través de la Edge Function.
 * Devuelve { ok } o { error } — nunca lanza: quien llama decide qué enseñar.
 */
export async function enviarDocumento({ para, asunto, saludo, lineas, doc, nombreAdjunto }) {
    if (!para?.trim()) return { error: 'El cliente no tiene email guardado. Añádelo en su ficha.' };

    const { data, error } = await supabase.functions.invoke('email', {
        body: {
            accion: 'enviar',
            to: para.trim(),
            asunto,
            html: htmlDocumento({ saludo, lineas }),
            adjuntos: [{
                nombre: nombreAdjunto,
                tipo: 'application/pdf',
                base64: pdfABase64(doc),
            }],
        },
    });

    if (error) {
        let detalle = error.message;
        try {
            const j = await error.context?.json();
            if (j?.error) detalle = j.error;
        } catch { /* sin cuerpo JSON */ }
        if (/failed to send a request/i.test(detalle)) {
            detalle = 'No se llega a la Edge Function «email». Revisa Configuración → Correo del panel.';
        }
        return { error: detalle };
    }
    if (data?.error) return { error: data.error };
    return { ok: true };
}
