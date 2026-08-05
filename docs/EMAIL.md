# Correo propio del panel (SMTP) — sin n8n

El panel envía sus propios correos. n8n deja de ser necesario para el email de
bienvenida a los leads.

## Por qué no es igual que el panel de Jennifer

El de Jennifer es **Next.js**: tiene servidor, así que puede usar `nodemailer`
(SMTP) e `imapflow` (bandeja de entrada) directamente en el backend.

Este panel es un **SPA de Vite**: se compila a HTML/JS estático y no tiene
servidor. Meter ahí las credenciales SMTP significaría publicarlas en el
navegador de cualquiera. El sustituto es una **Edge Function de Supabase**
(`supabase/functions/email`), que es el único código de servidor que existe aquí.

Consecuencia práctica:

| | Jennifer (Next.js) | Automatizatelo (SPA + Edge Function) |
|---|---|---|
| Enviar (SMTP) | `nodemailer` | `denomailer` en la Edge Function ✅ |
| Leer bandeja (IMAP) | `imapflow` ✅ | **no disponible** — Deno no tiene un cliente IMAP fiable |

Las credenciales IMAP se guardan igualmente (cifradas) para el día que exista un
servicio que pueda usarlas, pero hoy no leen nada. El envío, que es lo que
elimina la dependencia de n8n, funciona.

---

## Puesta en marcha (una sola vez)

> Todo desde el panel de Supabase. No hace falta la CLI ni un terminal.

### 1. Aplicar la migración

Copia `supabase/migrations/007_email.sql` entero y pégalo en **SQL Editor →
New query → Run**.

Crea `email_settings`, `email_plantillas`, `email_envios` y el trigger
`trg_lead_email_bienvenida`. El trigger nace **desactivado**
(`bienvenida_activa = false`), así que no envía nada hasta que tú lo actives.

### 2. Generar la clave de cifrado

Las contraseñas SMTP/IMAP se guardan cifradas con AES-256-GCM. La clave vive
solo en la Edge Function, nunca en la base de datos ni en el navegador.

En el mismo SQL Editor:

```sql
select encode(gen_random_bytes(32), 'hex');
```

Devuelve 64 caracteres hexadecimales. **Guárdalos donde no se pierdan**: si
desaparecen, hay que reintroducir todas las contraseñas.

### 3. Desplegar la Edge Function

**Supabase → Edge Functions → Deploy a new function → Via Editor.**

- Nombre: `email` — exactamente así, es el que invoca el panel.
- Contenido: todo `supabase/functions/email/index.ts`.
- Deploy.

Y el secreto, en **Project Settings → Edge Functions → Secrets**:

| Nombre | Valor |
|---|---|
| `EMAIL_ENCRYPTION_KEY` | los 64 caracteres del paso 2 |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase sola: no hay
que añadirlas.

> **Si el panel dice «Failed to send a request to the Edge Function»** es que
> este paso falta, o que la ruta no llega. La pantalla de Correo te lo explica
> con las dos causas y te enseña qué URL de Supabase está usando.
>
> La segunda causa es esta: `vercel.json` proxea Supabase a través del dominio
> del panel, y durante un tiempo tenía reglas para `/auth`, `/rest`, `/realtime`
> y `/storage` pero no para `/functions`. Las llamadas caían en el catch-all del
> SPA y volvían como `index.html`. Ya está añadida — pero requiere volver a
> desplegar el panel en Vercel para que surta efecto.

### 4. Configurar desde el panel

Entra en **Configuración → Correo del panel**:

1. **Pestaña «Envío (SMTP)»** — servidor, puerto, usuario y contraseña de tu
   correo. Guarda y lanza un correo de prueba a tu dirección.
   - Puerto 465 → cifrado `SSL/TLS directo`
   - Puerto 587 → cifrado `STARTTLS`
2. **Pestaña «Email automático»**:
   - *URL de la Edge Function*: `https://<tu-ref>.supabase.co/functions/v1/email`
   - *Secreto compartido*: inventa una cadena larga (es lo que autoriza a la base
     de datos a llamar a la función sin sesión de usuario).
   - *Enlace de agenda*: tu URL de Cal.com. Si lo dejas vacío, el correo pide al
     lead que responda en vez de mostrar el botón de reserva.
3. **Pestaña «Plantillas»** — el texto del email de bienvenida es editable desde
   aquí. Ya no hace falta tocar un nodo de código en n8n.

### 5. Cambiar el interruptor

**Primero** desactiva en n8n el flujo que manda el correo de bienvenida.
**Después** marca «Enviar el email de bienvenida automáticamente» en el panel.

Si activas los dos, el lead recibe dos correos.

---

## Cómo queda el flujo

```
Formulario de automatizatelo.com
        ↓
POST /api/contact  (web Next.js)
        ↓
INSERT en leads  (Supabase)
        ↓
trigger trg_lead_email_bienvenida
        ↓
Edge Function `email`  →  SMTP  →  el lead recibe el correo
        ↓
fila en email_envios (queda registrado en «Historial»)
```

n8n puede seguir ocupándose del aviso por WhatsApp a Manel y del resto del
pipeline: solo se le quita el envío del correo.

---

## Detalles que conviene saber

- **No se duplican correos.** Hay un índice único sobre
  `(lead_id, plantilla)` para `lead_bienvenida`: si el trigger se dispara dos
  veces, el segundo intento se descarta.
- **Un fallo de correo nunca tumba un lead.** El trigger captura cualquier error
  y deja el alta del lead intacta; el problema aparece como fila `error` en
  `email_envios`.
- **Todo envío queda registrado**, incluido el HTML exacto que se mandó. Útil
  cuando alguien dice «no me llegó nada».
- **Las contraseñas nunca vuelven al navegador.** El panel solo recibe un
  booleano «hay contraseña guardada». Dejar el campo vacío al guardar significa
  «no la cambies».
- **Reputación del remitente**: usa un dominio con SPF, DKIM y DMARC
  configurados. Un SMTP mal autenticado acaba en spam por muy bien escrito que
  esté el correo.

## Variables de entorno

| Nombre | Dónde | Para qué |
|---|---|---|
| `EMAIL_ENCRYPTION_KEY` | Secrets de Supabase | Cifrar/descifrar las contraseñas SMTP e IMAP (64 hex) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Las inyecta Supabase | Acceso de la función a las tablas |
