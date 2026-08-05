-- =============================================================================
-- MIGRACIÓN 007 — EMAIL PROPIO (SMTP/IMAP) SIN DEPENDER DE n8n
-- =============================================================================
-- Tres piezas:
--   1. email_settings   — credenciales SMTP/IMAP (contraseñas cifradas AES-256-GCM
--                          en la Edge Function; la BD solo guarda el blob base64).
--   2. email_plantillas — plantillas editables desde el panel (asunto + HTML con
--                          variables {{nombre}}, {{servicio}}, {{cta}}...).
--   3. email_envios     — log de cada envío: qué, a quién, cuándo y si falló.
--
-- Más el trigger que manda el email de bienvenida al insertarse un lead,
-- llamando a la Edge Function `email` en vez de al webhook de n8n.
-- =============================================================================

-- Necesario para que el trigger pueda llamar a la Edge Function.
-- pg_net crea siempre su propio esquema `net`.
create extension if not exists pg_net;

-- -----------------------------------------------------------------------------
-- 1. AJUSTES DE CORREO (fila única)
-- -----------------------------------------------------------------------------
create table if not exists public.email_settings (
    id integer primary key default 1 check (id = 1),

    -- SMTP (envío)
    smtp_host        text,
    smtp_port        integer default 465,
    smtp_user        text,
    smtp_password    text,                      -- cifrado AES-256-GCM + base64
    smtp_encryption  text default 'ssl',        -- 'ssl' (465) | 'starttls' (587)
    smtp_from_name   text default 'Manel · Automatizatelo',
    smtp_reply_to    text,

    -- IMAP (lectura de bandeja — reservado, ver nota al final)
    imap_host        text,
    imap_port        integer default 993,
    imap_user        text,
    imap_password    text,                      -- cifrado AES-256-GCM + base64
    imap_encryption  text default 'ssl',

    -- Contenido
    agenda_url       text,                      -- enlace de reserva (Cal.com). Si está
                                                -- vacío, el email pide que respondan.
    whatsapp_url     text default 'https://wa.me/34678399182',

    -- Llamada desde la BD a la Edge Function (trigger de bienvenida)
    edge_url         text,                      -- https://<ref>.supabase.co/functions/v1/email
    edge_secret      text,                      -- secreto compartido, en claro (tabla admin-only)
    bienvenida_activa boolean default false,    -- interruptor maestro: déjalo en false
                                                -- hasta que n8n esté desactivado

    updated_at timestamptz default now()
);

insert into public.email_settings (id) values (1) on conflict (id) do nothing;

alter table public.email_settings enable row level security;

drop policy if exists "email_settings admin" on public.email_settings;
create policy "email_settings admin" on public.email_settings
    for all
    using ( (select role from public.users where id = auth.uid()) = 'admin' )
    with check ( (select role from public.users where id = auth.uid()) = 'admin' );

-- -----------------------------------------------------------------------------
-- 2. PLANTILLAS
-- -----------------------------------------------------------------------------
create table if not exists public.email_plantillas (
    clave      text primary key,       -- 'lead_bienvenida', 'seguimiento_7d'...
    nombre     text not null,
    asunto     text not null,
    html       text not null,
    activa     boolean default true,
    updated_at timestamptz default now()
);

alter table public.email_plantillas enable row level security;

drop policy if exists "email_plantillas admin" on public.email_plantillas;
create policy "email_plantillas admin" on public.email_plantillas
    for all
    using ( (select role from public.users where id = auth.uid()) = 'admin' )
    with check ( (select role from public.users where id = auth.uid()) = 'admin' );

-- Plantilla de bienvenida por defecto (misma voz que la web: primera persona)
insert into public.email_plantillas (clave, nombre, asunto, html) values (
'lead_bienvenida',
'Bienvenida a lead nuevo',
'Tus 30 minutos conmigo — {{nombre}}',
$plantilla$
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#1C1917;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#ffffff;border-collapse:collapse;">
    <tr>
      <td style="padding:40px 32px 8px;">
        <p style="margin:0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#EA580C;font-weight:bold;">Automatizatelo</p>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 40px;">
        <h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;color:#1C1917;">{{saludo}}</h1>

        <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#44403c;">
          Soy Manel. He recibido tu mensaje sobre <strong>{{servicio}}</strong> — gracias por escribir.
        </p>

        <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#44403c;">
          El siguiente paso son <strong>30 minutos por videollamada, sin compromiso</strong>:
          me cuentas cómo trabajáis, te digo por dónde empezar y qué te costaría.
          Y si algo no te compensa hacer, también te lo digo.
        </p>

        {{cta}}

        <p style="margin:32px 0 0;font-size:16px;line-height:1.65;color:#44403c;">
          Un saludo,<br>
          <strong>Manel Méndez González</strong><br>
          <span style="font-size:14px;color:#78716c;">Automatizatelo · Implantación de IA</span>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;border-top:1px solid #f0ead9;background:#FAF6EF;text-align:center;">
        <p style="margin:0;font-size:11px;color:#a8a29e;">
          Recibes este correo porque has escrito desde
          <a href="https://automatizatelo.com" style="color:#a8a29e;">automatizatelo.com</a>.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
$plantilla$
) on conflict (clave) do nothing;

-- -----------------------------------------------------------------------------
-- 3. LOG DE ENVÍOS
-- -----------------------------------------------------------------------------
create table if not exists public.email_envios (
    id          uuid primary key default gen_random_uuid(),
    lead_id     uuid references public.leads(id) on delete set null,
    para        text not null,
    asunto      text not null,
    html        text,
    plantilla   text,
    origen      text default 'panel',      -- 'panel' | 'trigger'
    estado      text default 'pendiente',  -- 'pendiente' | 'enviado' | 'error'
    error       text,
    sent_at     timestamptz,
    created_at  timestamptz default now()
);

create index if not exists idx_email_envios_lead on public.email_envios(lead_id);
create index if not exists idx_email_envios_estado on public.email_envios(estado, created_at desc);

alter table public.email_envios enable row level security;

drop policy if exists "email_envios admin" on public.email_envios;
create policy "email_envios admin" on public.email_envios
    for all
    using ( (select role from public.users where id = auth.uid()) = 'admin' )
    with check ( (select role from public.users where id = auth.uid()) = 'admin' );

-- Evita duplicar la bienvenida si el lead se reinsertara o el trigger se repitiera
create unique index if not exists idx_email_envios_bienvenida_unica
    on public.email_envios(lead_id, plantilla)
    where plantilla = 'lead_bienvenida' and estado <> 'error';

-- -----------------------------------------------------------------------------
-- 4. TRIGGER: lead nuevo → email de bienvenida (sustituye al webhook de n8n)
-- -----------------------------------------------------------------------------
create or replace function public.lead_email_bienvenida()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
    cfg record;
begin
    select edge_url, edge_secret, bienvenida_activa
      into cfg
      from public.email_settings
     where id = 1;

    -- Sin configurar, desactivado o sin email → no hacemos nada
    if cfg is null
       or coalesce(cfg.bienvenida_activa, false) = false
       or coalesce(cfg.edge_url, '') = ''
       or coalesce(new.email, '') = ''
    then
        return new;
    end if;

    perform net.http_post(
        url     := cfg.edge_url,
        headers := jsonb_build_object(
            'Content-Type',   'application/json',
            'x-email-secret', coalesce(cfg.edge_secret, '')
        ),
        body    := jsonb_build_object(
            'accion',    'enviar',
            'plantilla', 'lead_bienvenida',
            'lead_id',   new.id
        ),
        timeout_milliseconds := 8000
    );

    return new;
exception
    -- Un fallo enviando el correo nunca debe tumbar el alta del lead
    when others then
        raise warning 'lead_email_bienvenida: %', sqlerrm;
        return new;
end;
$$;

drop trigger if exists trg_lead_email_bienvenida on public.leads;
create trigger trg_lead_email_bienvenida
    after insert on public.leads
    for each row
    execute function public.lead_email_bienvenida();

-- =============================================================================
-- NOTA SOBRE IMAP
-- =============================================================================
-- Las credenciales IMAP se guardan aquí para tenerlas centralizadas, pero LEER
-- la bandeja de entrada necesita un cliente IMAP con sockets, que las Edge
-- Functions (Deno) no tienen de forma fiable. El envío (SMTP) sí funciona y es
-- lo que elimina la dependencia de n8n. Ver docs/EMAIL.md.
-- =============================================================================
