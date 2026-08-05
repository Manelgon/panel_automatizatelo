# Receta: correo propio (SMTP) en un SPA con Supabase

Cómo montar envío de correo real —credenciales cifradas, plantillas editables,
log de envíos— en un proyecto que **no tiene servidor**. Sirve para cualquier
front estático (Vite, CRA, Astro, HTML pelado) con Supabase detrás.

Escrito después de montarlo en el panel de Automatízatelo, agosto de 2026.
El código de referencia está en este mismo repositorio:

```
supabase/migrations/007_email.sql     las tres tablas y el trigger
supabase/functions/email/index.ts     la función
src/pages/AjustesEmail.jsx            la pantalla de configuración
docs/EMAIL.md                         puesta en marcha
```

---

## Cuándo usar esto

Cuando quieras mandar correos **desde tu propio dominio** sin depender de n8n,
Make, Zapier ni de un servicio de terceros tipo Resend o SendGrid.

Y cuándo **no**: si el proyecto ya tiene servidor (Next.js, Remix, Nuxt), no hace
falta nada de esto — usa `nodemailer` en el backend y ya. Esta receta existe
justamente porque un SPA no tiene dónde meter una contraseña.

**La regla que lo explica todo:** las credenciales SMTP no pueden pasar por el
navegador. Todo lo que compila Vite acaba descargándose el cliente. Así que el
envío tiene que ocurrir en un sitio que el usuario no pueda leer, y en Supabase
ese sitio es una Edge Function.

---

## Las tres piezas

### 1. Tres tablas

```
email_settings     fila única: host, puerto, usuario, contraseña cifrada, cifrado
email_plantillas   clave, asunto, html con {{variables}}
email_envios       log: a quién, qué, cuándo, y si falló por qué
```

Todas con RLS **solo admin**. La contraseña se guarda cifrada; el resto en claro.

Detalles que evitan disgustos:

- **Índice único en `email_envios`** por `(destinatario_id, plantilla)` para los
  correos que solo deben salir una vez. Si el trigger se dispara dos veces, el
  segundo insert choca y no se envía nada.
- **Registrar el intento ANTES de enviar**, no después. Si el SMTP se cuelga, al
  menos queda constancia de que se intentó.
- **Guardar el HTML exacto** que se mandó. Sirve el día que alguien diga «no me
  llegó nada» o «no ponía eso».

### 2. Una Edge Function

Un solo endpoint con un campo `accion` en el cuerpo. Menos despliegues, un solo
secreto, una sola URL:

| Acción | Qué hace |
|---|---|
| `leer-config` | Devuelve los ajustes **sin contraseñas**, solo un booleano «hay contraseña guardada» |
| `guardar-config` | Cifra las contraseñas que lleguen con valor; las vacías no se tocan |
| `probar` | Manda un correo de prueba |
| `enviar` | Envía, libre o desde plantilla |

Autorización doble: **JWT de admin** para el panel, o **secreto compartido en una
cabecera** para las llamadas que vengan de la base de datos (triggers), que no
tienen sesión de usuario.

### 3. Una pantalla de ajustes

Cinco pestañas: SMTP, IMAP, automatismos, plantillas e historial. La clave del
diseño es que **el navegador nunca recibe una contraseña**: solo un booleano.
Dejar el campo vacío al guardar significa «no la cambies».

---

## Los cuatro tropiezos

Esto es lo que realmente cuesta. El código se escribe en una tarde; esto se paga
en horas de depurar a ciegas.

### 1. «Verify JWT» tiene que estar en OFF

**Síntoma:** `Failed to send a request to the Edge Function`, sin más pistas.

Con ese interruptor en ON, la pasarela de Supabase valida el token *antes* de
ejecutar tu función. Pero el preflight `OPTIONS` que manda el navegador **no
lleva cabecera `Authorization`**: se lleva un 401 sin cabeceras CORS, el
navegador bloquea la respuesta, y el `fetch` falla a nivel de red. Por eso el
error no menciona ningún código HTTP — la petición nunca llegó a completarse.

La solución es la que recomienda la propia Supabase: **OFF**, y la autenticación
dentro de la función. No es rebajar la seguridad, es subirla: la pasarela solo
comprobaba que el token estuviera firmado; tu función comprueba además quién es y
qué rol tiene.

```ts
const { data: userData } = await admin.auth.getUser(token);
const { data: perfil } = await admin.from('users').select('role').eq('id', uid).maybeSingle();
if (perfil?.role !== 'admin') return json({ error: 'Se requiere rol de administrador' }, 403);
```

Y es obligatorio si un trigger de la base de datos llama a la función: no tiene
sesión que ofrecer.

### 2. CORS: responde al preflight tú mismo

```ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-email-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
```

**Toda cabecera propia tiene que aparecer en `Allow-Headers`.** Si te inventas
una `x-email-secret` y se te olvida declararla, el preflight la rechaza y vuelves
al error del punto 1 sin entender por qué.

### 3. Si proxeas Supabase por tu dominio, incluye `/functions`

Es habitual enrutar Supabase a través del dominio propio. En Vercel:

```json
{ "source": "/functions/(.*)", "destination": "https://<ref>.supabase.co/functions/$1" }
```

Si tienes reglas para `/rest`, `/auth`, `/realtime` y `/storage` pero **no para
`/functions`**, las llamadas caen en el catch-all del SPA y vuelven como
`index.html`. Mismo error, tercera causa distinta. Y afecta a *todas* tus
funciones, no solo a la nueva.

### 4. `nodemailer` no vale: las Edge Functions son Deno

```ts
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const client = new SMTPClient({
  connection: {
    hostname: host,
    port,                          // 465 o 587
    tls: puerto === 465,           // true = TLS directo; false = STARTTLS
    auth: { username, password },
  },
});

await client.send({ from, to, subject, html, content: 'auto' });
await client.close();
```

`content: 'auto'` genera la alternativa en texto plano — importante para no caer
en spam.

**Y el límite que conviene saber de antemano: IMAP no se puede.** Deno no tiene
un cliente IMAP fiable, así que leer la bandeja de entrada queda fuera. Si el
proyecto necesita bandeja, necesita un servidor de verdad.

---

## Cifrado de las contraseñas

AES-256-GCM con WebCrypto, clave de 32 bytes en un secreto de la función. Formato
del blob: `iv(16) + tag(16) + ciphertext`, todo en base64.

Ojo con esto: **WebCrypto devuelve `ciphertext || tag` pegados**, así que hay que
separarlos al cifrar y volver a juntarlos al descifrar. Es el error clásico al
portar código desde el `crypto` de Node, que los expone por separado.

```ts
// cifrar: WebCrypto da ciphertext||tag; guardamos iv+tag+ciphertext
const ct  = buf.subarray(0, buf.length - 16);
const tag = buf.subarray(buf.length - 16);

// descifrar: rehacemos ciphertext||tag
const joined = new Uint8Array(ct.length + 16);
joined.set(ct, 0);
joined.set(tag, ct.length);
```

Generar la clave sin necesidad de terminal, desde el SQL Editor:

```sql
select encode(gen_random_bytes(32), 'hex');
```

**Si se pierde, las contraseñas guardadas quedan ilegibles.** No hay recuperación:
hay que reintroducirlas. Apúntala el mismo día que la generas.

---

## Disparar correos desde la base de datos

Para el «cuando entre un registro, manda el correo» sin n8n: un trigger que llama
a la función con `pg_net`.

```sql
create extension if not exists pg_net;   -- crea su propio esquema `net`

perform net.http_post(
    url     := cfg.edge_url,
    headers := jsonb_build_object('Content-Type','application/json','x-email-secret', cfg.edge_secret),
    body    := jsonb_build_object('accion','enviar','plantilla','bienvenida','lead_id', new.id),
    timeout_milliseconds := 8000
);
```

Tres cosas que no son opcionales:

1. **Captura la excepción.** Un fallo de correo no puede tumbar el alta del
   registro:
   ```sql
   exception when others then
       raise warning 'trigger de correo: %', sqlerrm;
       return new;
   ```
2. **Un interruptor en la tabla de ajustes** (`bienvenida_activa`), apagado por
   defecto. Así puedes desplegarlo sin que empiece a mandar correos mientras el
   sistema antiguo sigue encendido. Encenderlo es el último paso, no el primero.
3. **La URL y el secreto en la tabla**, no incrustados en la función SQL. Cambiar
   de entorno no debería ser reescribir un trigger.

---

## Checklist de despliegue

- [ ] Migración aplicada (tablas + trigger apagado)
- [ ] Clave de cifrado generada **y apuntada fuera del repositorio**
- [ ] Función desplegada con el nombre exacto que invoca el front
- [ ] **Verify JWT → OFF**
- [ ] Secreto `*_ENCRYPTION_KEY` en Project Settings → Edge Functions → Secrets
- [ ] Regla `/functions/(.*)` en `vercel.json` si proxeas por tu dominio
- [ ] Correo de prueba enviado y recibido
- [ ] SPF, DKIM y DMARC del dominio comprobados
- [ ] Sistema antiguo apagado **antes** de encender el interruptor del nuevo

Sobre el penúltimo: un SMTP correcto con el dominio mal autenticado acaba en spam
por muy bien escrito que esté el correo. Es la parte que no se ve al probar,
porque los correos a tu propia dirección casi siempre entran.

---

## Qué cambiar al replicarlo

| Pieza | Qué toca |
|---|---|
| Nombre de la función | Debe coincidir con el `functions.invoke('...')` del front |
| Comprobación de admin | Aquí es `users.role = 'admin'`; adapta a tu tabla de perfiles |
| Nombre del secreto | `EMAIL_ENCRYPTION_KEY` → el que quieras, en función y checklist |
| Tabla que dispara el trigger | Aquí `leads`; puede ser pedidos, altas, reservas… |
| Variables de plantilla | Aquí `{{saludo}}`, `{{servicio}}`, `{{cta}}` |
| Cliente de Supabase | Aquí `supabase.functions.invoke`; con `fetch` a pelo, la cabecera `Authorization: Bearer <access_token>` va a mano |

El resto —cifrado, doble autorización, log de envíos, índice antiduplicados— se
copia tal cual.
