-- =============================================================================
-- MIGRACIÓN 018 — FASE 5 (RESTO): AUDITORÍA Y RETENCIÓN RGPD
-- =============================================================================
-- Las dos piezas que faltaban de la fase 5 (las citas ya están, migración 015).
--
--   1. audit_logs — poder responder «¿quién anuló esta factura y cuándo?».
--      En un panel que emite facturas con validez fiscal y guarda datos
--      personales, no tenerlo es un problema, no un detalle.
--
--   2. Retención — el RGPD exige no conservar datos personales más de lo
--      necesario. Vender cumplimiento desde un panel que guarda IPs para
--      siempre es un flanco absurdo. La retención corre sola cada noche.
--
-- Es re-ejecutable.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. REGISTRO DE AUDITORÍA
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid references public.users(id) on delete set null,
    accion        text not null,           -- 'factura.emitida', 'cobro.registrado', 'lead.olvidado'…
    recurso_tipo  text,                    -- 'factura', 'cobro', 'lead', 'certificado'…
    recurso_id    text,                    -- id del recurso (texto: vale uuid o numero de factura)
    recurso_label text,                    -- algo legible: 'F-2026-0003', 'Juan Pérez'…
    metadata      jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now()
);

create index if not exists idx_audit_logs_fecha   on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_accion  on public.audit_logs(accion, created_at desc);
create index if not exists idx_audit_logs_recurso on public.audit_logs(recurso_tipo, recurso_id);

alter table public.audit_logs enable row level security;

-- Leer: solo admin. Escribir: nadie directamente — solo la función de abajo.
-- Un registro de auditoría que cualquiera puede insertar (o peor, borrar) no
-- prueba nada.
drop policy if exists "audit_logs_admin_lee" on public.audit_logs;
create policy "audit_logs_admin_lee" on public.audit_logs
    for select to authenticated using (public.is_admin());

create or replace function public.registrar_accion(
    p_accion        text,
    p_recurso_tipo  text default null,
    p_recurso_id    text default null,
    p_recurso_label text default null,
    p_metadata      jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_accion is null or trim(p_accion) = '' then
        return;
    end if;
    insert into public.audit_logs (user_id, accion, recurso_tipo, recurso_id, recurso_label, metadata)
    values (auth.uid(), p_accion, p_recurso_tipo, p_recurso_id, p_recurso_label, coalesce(p_metadata, '{}'::jsonb));
exception
    -- La auditoría nunca debe tumbar la acción que audita
    when others then
        raise warning 'registrar_accion: %', sqlerrm;
end;
$$;

grant execute on function public.registrar_accion(text, text, text, text, jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. RETENCIÓN DE DATOS PERSONALES
-- -----------------------------------------------------------------------------
-- Una sola función con toda la política escrita, ejecutable a mano o por cron.
-- Los plazos:
--
--   · IP y dispositivo de los leads    → 90 días (solo sirven de diagnóstico)
--   · Leads perdidos sin interacción   → 2 años → anonimizados
--   · HTML de correos enviados         → 1 año (queda el asiento, cae el cuerpo)
-- -----------------------------------------------------------------------------
create or replace function public.aplicar_retencion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_ips     integer;
    v_leads   integer;
    v_correos integer;
begin
    -- a) IPs y datos de dispositivo con más de 90 días
    update public.leads
       set ip_address = null, device_type = null
     where created_at < now() - interval '90 days'
       and (ip_address is not null or device_type is not null);
    get diagnostics v_ips = row_count;

    -- b) Leads perdidos sin interacción en 2 años → anonimizar
    --    (mismo criterio que forget_lead_by_email, pero de oficio)
    update public.leads
       set first_name       = '(anonimizado)',
           last_name        = null,
           email            = 'retencion+' || id::text || '@borrado.local',
           phone            = null,
           message          = null,
           company          = null,
           city             = null,
           country          = null,
           received_keyword = null,
           automation_goal  = null
     where status = 'perdido'
       and coalesce(last_interaction_date, created_at) < now() - interval '2 years'
       and email not like 'retencion+%'
       and email not like 'anonimizado+%';
    get diagnostics v_leads = row_count;

    -- c) El cuerpo HTML de los correos con más de 1 año
    update public.email_envios
       set html = null
     where created_at < now() - interval '1 year'
       and html is not null;
    get diagnostics v_correos = row_count;

    -- La propia pasada queda auditada
    insert into public.audit_logs (user_id, accion, recurso_tipo, metadata)
    values (null, 'retencion.aplicada', 'sistema',
            jsonb_build_object('ips_borradas', v_ips, 'leads_anonimizados', v_leads, 'correos_vaciados', v_correos));

    return jsonb_build_object('ips_borradas', v_ips, 'leads_anonimizados', v_leads, 'correos_vaciados', v_correos);
end;
$$;

-- Cada noche a las 04:15. Si pg_cron no está disponible, avisa y la función
-- queda lista para ejecutarla a mano de vez en cuando.
do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule('retencion-rgpd')
          where exists (select 1 from cron.job where jobname = 'retencion-rgpd');
        perform cron.schedule('retencion-rgpd', '15 4 * * *', 'select public.aplicar_retencion()');
        raise notice 'Retencion programada cada noche a las 04:15';
    else
        begin
            create extension pg_cron;
            perform cron.schedule('retencion-rgpd', '15 4 * * *', 'select public.aplicar_retencion()');
            raise notice 'pg_cron activado y retencion programada a las 04:15';
        exception when others then
            raise notice 'pg_cron no disponible (%). Ejecuta a mano de vez en cuando:', sqlerrm;
            raise notice '  select public.aplicar_retencion();';
        end;
    end if;
end;
$$;
