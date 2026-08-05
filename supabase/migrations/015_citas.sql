-- =============================================================================
-- MIGRACIÓN 015 — FASE 5 (A): CITAS
-- =============================================================================
-- El paso que faltaba en el embudo. Hoy un lead entra y lo conviertes a
-- cliente, pero la llamada del medio — los «30 minutos gratis» que promete toda
-- la web — no existía en ningún sitio.
--
-- Esta versión es INTERNA: las citas se crean desde el panel. El lead todavía no
-- puede reservar solo. Ver la nota del final sobre cómo se enchufa Cal.com
-- después sin rehacer nada de esto.
--
-- Es re-ejecutable.
-- =============================================================================


create table if not exists public.citas (
    id uuid primary key default gen_random_uuid(),

    -- Con quién. Una cita cuelga de un lead o de un cliente, nunca de los dos.
    -- Jennifer usa recurso_tipo + recurso_id sin FK porque apunta a cuatro
    -- tablas distintas; aquí solo hay dos, así que se usan claves foráneas de
    -- verdad y la base de datos garantiza que existen.
    lead_id    uuid references public.leads(id)   on delete cascade,
    cliente_id uuid references public.clients(id) on delete cascade,
    constraint citas_con_alguien check (lead_id is not null or cliente_id is not null),

    -- Snapshot del contacto. Si el lead se borra por derecho al olvido, la cita
    -- desaparece con él; pero mientras vive, esto evita un join para pintarla.
    contacto_nombre text not null,
    contacto_email  text,

    titulo text not null default 'Diagnóstico · 30 minutos',
    tipo   text not null default 'diagnostico'
           check (tipo in ('diagnostico', 'seguimiento', 'formacion', 'auditoria', 'otro')),
    estado text not null default 'propuesta'
           check (estado in ('propuesta', 'confirmada', 'realizada', 'no_asistio', 'cancelada')),

    start_at timestamptz not null,
    end_at   timestamptz,

    modalidad text not null default 'videollamada'
              check (modalidad in ('videollamada', 'telefono', 'presencial')),
    enlace    text,   -- Meet, Zoom, Jitsi…
    lugar     text,

    notas     text,   -- lo que quieras recordar antes de la llamada
    resultado text,   -- lo que salió de ella. Se rellena después.

    -- La costura para Cal.com (o quien sea) sin tener que migrar luego:
    -- cuando llegue el webhook, escribirá aquí de dónde vino la reserva.
    origen      text not null default 'panel'
                check (origen in ('panel', 'cal_com', 'web', 'otro')),
    externo_id  text unique,   -- id de la reserva en el sistema de origen

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_citas_start   on public.citas(start_at desc);
create index if not exists idx_citas_lead    on public.citas(lead_id, start_at desc);
create index if not exists idx_citas_cliente on public.citas(cliente_id, start_at desc);
create index if not exists idx_citas_estado  on public.citas(estado, start_at);


-- -----------------------------------------------------------------------------
-- Duración por defecto: 30 minutos
-- -----------------------------------------------------------------------------
-- Es la oferta de la web. Si no se indica fin, se pone media hora en vez de
-- dejar la cita sin duración, que en un calendario se ve mal.
-- -----------------------------------------------------------------------------
create or replace function public.cita_fin_por_defecto()
returns trigger
language plpgsql
as $$
begin
    if new.end_at is null then
        new.end_at := new.start_at + interval '30 minutes';
    end if;
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_cita_fin on public.citas;
create trigger trg_cita_fin before insert or update on public.citas
    for each row execute function public.cita_fin_por_defecto();


-- -----------------------------------------------------------------------------
-- Al agendar con un lead, deja de estar «nuevo»
-- -----------------------------------------------------------------------------
-- Si has quedado con alguien, ese lead ya no está sin contestar. Sin esto habría
-- que acordarse de moverlo a mano y las pestañas del embudo mentirían.
-- -----------------------------------------------------------------------------
create or replace function public.cita_mover_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.lead_id is null then
        return new;
    end if;

    update public.leads
       set status = case when status = 'nuevo' then 'contactado' else status end,
           activity = 'lead_activo',
           last_interaction_date = now()
     where id = new.lead_id;

    return new;
end;
$$;

drop trigger if exists trg_cita_mover_lead on public.citas;
create trigger trg_cita_mover_lead after insert on public.citas
    for each row execute function public.cita_mover_lead();


-- -----------------------------------------------------------------------------
-- RLS — solo admin, como el resto de datos de negocio
-- -----------------------------------------------------------------------------
alter table public.citas enable row level security;

drop policy if exists "citas_admin" on public.citas;
create policy "citas_admin" on public.citas
    for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- El derecho al olvido también cuenta las citas
-- -----------------------------------------------------------------------------
-- forget_lead_by_email (migración 012) enumera lo que se borrará. Las citas
-- caen solas por el `on delete cascade`, pero si no se cuentan, el aviso previo
-- miente sobre el alcance del borrado.
-- -----------------------------------------------------------------------------
create or replace function public.forget_lead_by_email(
    p_email   text,
    p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_email     text := lower(trim(coalesce(p_email, '')));
    v_lead_ids  uuid[];
    v_n_leads   integer;
    v_n_envios  integer;
    v_n_hitos   integer;
    v_n_citas   integer;
    v_retenido  boolean;
begin
    if not public.is_admin() then
        raise exception 'Se requiere rol de administrador';
    end if;

    if v_email = '' then
        return jsonb_build_object('status', 'not_found');
    end if;

    select array_agg(id) into v_lead_ids
      from public.leads
     where lower(trim(email)) = v_email;

    if v_lead_ids is null then
        return jsonb_build_object('status', 'not_found');
    end if;

    select count(*) into v_n_leads  from public.leads              where id      = any (v_lead_ids);
    select count(*) into v_n_envios from public.email_envios       where lead_id = any (v_lead_ids);
    select count(*) into v_n_hitos  from public.project_milestones where lead_id = any (v_lead_ids);
    select count(*) into v_n_citas  from public.citas              where lead_id = any (v_lead_ids);

    select exists (
        select 1 from public.projects where lead_id = any (v_lead_ids)
        union all
        select 1
          from public.clients c
          join public.facturas f on f.client_id = c.id
         where c.lead_id = any (v_lead_ids)
    ) into v_retenido;

    if p_dry_run then
        return jsonb_build_object(
            'status',             'dry_run',
            'has_active_project', v_retenido,
            'warning', case when v_retenido
                then 'Este lead tiene proyecto o facturación asociada. Sus datos se anonimizarán en lugar de borrarse: la factura debe conservarse por obligación fiscal.'
                else 'Se eliminarán todos sus datos personales. No se puede deshacer.'
            end,
            'would_delete', jsonb_build_object(
                'leads',              v_n_leads,
                'email_envios',       v_n_envios,
                'project_milestones', v_n_hitos,
                'citas',              v_n_citas
            )
        );
    end if;

    if v_retenido then
        update public.leads
           set first_name       = '(anonimizado)',
               last_name        = null,
               email            = 'anonimizado+' || id::text || '@borrado.local',
               phone            = null,
               message          = null,
               company          = null,
               ip_address       = null,
               city             = null,
               country          = null,
               received_keyword = null,
               automation_goal  = null
         where id = any (v_lead_ids);

        update public.email_envios
           set para = '(anonimizado)', html = null
         where lead_id = any (v_lead_ids);

        update public.citas
           set contacto_nombre = '(anonimizado)', contacto_email = null, notas = null
         where lead_id = any (v_lead_ids);

        return jsonb_build_object('status', 'anonymized_due_to_active_project');
    end if;

    delete from public.email_envios       where lead_id = any (v_lead_ids);
    update public.project_milestones set lead_id = null where lead_id = any (v_lead_ids);
    update public.clients            set lead_id = null where lead_id = any (v_lead_ids);
    update public.projects           set lead_id = null where lead_id = any (v_lead_ids);
    delete from public.leads              where id      = any (v_lead_ids);  -- las citas caen en cascada

    return jsonb_build_object(
        'status',  'deleted',
        'deleted', jsonb_build_object('leads', v_n_leads, 'email_envios', v_n_envios, 'citas', v_n_citas)
    );
end;
$$;

grant execute on function public.forget_lead_by_email(text, boolean) to authenticated;


-- =============================================================================
-- PENDIENTE: QUE EL LEAD RESERVE SOLO
-- =============================================================================
-- Hoy las citas se crean desde el panel. El correo de bienvenida manda el
-- `agenda_url` de email_settings, pero el panel no se entera de lo que pasa
-- después de que el lead pinche ese enlace: son dos mundos que no se hablan.
--
-- OPCIÓN B — Cal.com avisa al panel  (recomendada)
--   Cal.com tiene webhooks nativos: BOOKING_CREATED, BOOKING_CANCELLED,
--   BOOKING_RESCHEDULED. Se apunta al endpoint de la Edge Function `email`
--   con una acción nueva, `cita-externa`, que:
--     1. valida el secreto compartido (ya existe: edge_secret)
--     2. busca el lead por email, o lo crea si es alguien nuevo
--     3. inserta en `citas` con origen='cal_com' y externo_id = uid de la reserva
--   El `externo_id` es único, así que un webhook repetido no duplica la cita, y
--   una cancelación encuentra la fila por ese id.
--   Requisitos: Cal.com con URL pública. Trabajo estimado: una tarde.
--
-- OPCIÓN C — Google Calendar como fuente
--   Es lo que hace el panel de Jennifer: Google manda y `citas` guarda
--   google_event_id como espejo. Necesita OAuth, almacenamiento y refresco de
--   tokens, y sincronización bidireccional. Descartada de momento: mucho más
--   trabajo para un solo usuario, y ata la agenda a Google.
--
-- El esquema de arriba ya deja la costura hecha — `origen` y `externo_id` — así
-- que enchufar B no obliga a migrar nada de lo que se cree mientras tanto.
-- =============================================================================
