-- =============================================================================
-- MIGRACIÓN 012 — FASE 2 (C): UN LEAD, UNA FILA, UN ESTADO
-- =============================================================================
-- Un lead vivía repartido en tres tablas:
--
--   leads                  first_name, email, status…
--   service_segmentation   lead_id UNIQUE  → estrictamente 1:1
--   funnel_flows           lead_id         → en la práctica también 1:1
--
-- Son columnas disfrazadas de tablas. Obligan a tres inserciones al dar de alta
-- un lead y a dos join para leerlo entero, y las dos secundarias tenían INSERT
-- abierto a `anon`.
--
-- Peor: el estado del lead estaba DUPLICADO y con dos vocabularios distintos.
--
--   leads.status                pendiente · contactado · ganado    · perdido
--   funnel_flows.current_status nuevo · en_proceso · contactado · convertido · perdido
--
-- El panel filtra y cuenta por `current_status`, pero la conversión de lead a
-- cliente escribe en los dos a mano (status='ganado' y current_status=
-- 'convertido'). Dos fuentes de verdad que solo coinciden mientras nadie se
-- olvide de actualizar una.
--
-- Aquí se fusiona todo en `leads` y se conserva el vocabulario de cinco estados,
-- que es el que usa el panel. Es re-ejecutable.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Las columnas que venían de las otras dos tablas
-- -----------------------------------------------------------------------------
alter table public.leads
    -- de service_segmentation
    add column if not exists company_size          text,
    add column if not exists sector                text,
    add column if not exists automation_goal       text,
    -- de funnel_flows
    add column if not exists flow_name             text default 'web',
    add column if not exists activity              text default 'lead_inactivo',
    add column if not exists received_keyword      text,
    add column if not exists process_tags          jsonb default '[]'::jsonb,
    add column if not exists last_interaction_date timestamptz default now();


-- -----------------------------------------------------------------------------
-- 2. Traer los datos
-- -----------------------------------------------------------------------------
do $$
declare
    v_seg_origen integer := 0;
    v_seg_destino integer := 0;
    v_flow_origen integer := 0;
begin
    -- a) service_segmentation
    if to_regclass('public.service_segmentation') is not null then
        select count(*) into v_seg_origen from public.service_segmentation;

        update public.leads l
           set company_size    = coalesce(l.company_size, s.company_size),
               sector          = coalesce(l.sector, s.sector),
               automation_goal = coalesce(l.automation_goal, s.automation_goal)
          from public.service_segmentation s
         where s.lead_id = l.id;

        select count(*) into v_seg_destino
          from public.leads l
          join public.service_segmentation s on s.lead_id = l.id
         where l.sector is not distinct from s.sector
           and l.company_size is not distinct from s.company_size;

        if v_seg_origen > 0 and v_seg_destino < v_seg_origen then
            raise exception 'Copia incompleta de service_segmentation: % de % filas. Se aborta.',
                v_seg_destino, v_seg_origen;
        end if;
        raise notice 'service_segmentation: % filas trasladadas', v_seg_origen;
    end if;

    -- b) funnel_flows. Si hubiera varias por lead, gana la interacción más reciente.
    if to_regclass('public.funnel_flows') is not null then
        select count(distinct lead_id) into v_flow_origen from public.funnel_flows;

        update public.leads l
           set flow_name             = coalesce(f.flow_name, l.flow_name),
               activity              = coalesce(f.activity, l.activity),
               received_keyword      = coalesce(f.received_keyword, l.received_keyword),
               process_tags          = coalesce(f.process_tags, l.process_tags),
               last_interaction_date = coalesce(f.last_interaction_date, l.last_interaction_date)
          from (
              select distinct on (lead_id) *
                from public.funnel_flows
               order by lead_id, last_interaction_date desc nulls last, created_at desc
          ) f
         where f.lead_id = l.id;

        raise notice 'funnel_flows: % leads actualizados', v_flow_origen;
    end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. Un solo estado, con el vocabulario que ya usa el panel
-- -----------------------------------------------------------------------------
-- Manda `funnel_flows.current_status` cuando existe, porque es lo que el panel
-- venía mostrando. Si no hay, se traduce el `leads.status` antiguo.
-- -----------------------------------------------------------------------------
do $$
begin
    alter table public.leads drop constraint if exists leads_status_check;

    -- a) Traducir el vocabulario viejo
    update public.leads
       set status = case status
                        when 'pendiente' then 'nuevo'
                        when 'ganado'    then 'convertido'
                        else status
                    end
     where status in ('pendiente', 'ganado');

    -- b) Donde funnel_flows diga otra cosa, manda funnel_flows
    if to_regclass('public.funnel_flows') is not null then
        update public.leads l
           set status = f.current_status
          from (
              select distinct on (lead_id) lead_id, current_status
                from public.funnel_flows
               order by lead_id, last_interaction_date desc nulls last, created_at desc
          ) f
         where f.lead_id = l.id
           and f.current_status is not null
           and f.current_status <> l.status;
    end if;

    -- c) Cualquier cosa rara pasa a 'nuevo' antes de poner la restricción
    update public.leads
       set status = 'nuevo'
     where status is null
        or status not in ('nuevo', 'en_proceso', 'contactado', 'convertido', 'perdido');

    alter table public.leads alter column status set default 'nuevo';
    alter table public.leads add constraint leads_status_check
        check (status in ('nuevo', 'en_proceso', 'contactado', 'convertido', 'perdido'));

    alter table public.leads drop constraint if exists leads_activity_check;
    alter table public.leads add constraint leads_activity_check
        check (activity in ('lead_activo', 'lead_inactivo'));
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Fuera las dos tablas
-- -----------------------------------------------------------------------------
-- Solo después de que los pasos 2 y 3 hayan terminado sin excepción. Si algo
-- hubiera fallado arriba, la transacción habría abortado y esto no se ejecuta.
-- -----------------------------------------------------------------------------
drop table if exists public.service_segmentation cascade;
drop table if exists public.funnel_flows cascade;


-- -----------------------------------------------------------------------------
-- 5. Índices sobre lo que ahora se filtra
-- -----------------------------------------------------------------------------
drop index if exists public.idx_leads_status;
create index if not exists idx_leads_status    on public.leads(status, created_at desc);
create index if not exists idx_leads_sector    on public.leads(sector);
create index if not exists idx_leads_actividad on public.leads(activity);


-- -----------------------------------------------------------------------------
-- 6. El derecho al olvido tenía que borrar de esas dos tablas
-- -----------------------------------------------------------------------------
-- `forget_lead_by_email` recorría leads, service_segmentation y funnel_flows.
-- Al desaparecer las dos últimas, la función se rompe. Se reescribe con el mismo
-- contrato que espera el panel (mismo nombre de campos en el JSON de vuelta),
-- cambiando las dos tablas por `email_envios`, que es donde han quedado los
-- datos personales que antes no se contaban: el correo del destinatario y el
-- HTML de cada envío.
-- -----------------------------------------------------------------------------
drop function if exists public.forget_lead_by_email(text, boolean);

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

    -- Si hay proyecto o factura de por medio, no se borra: se anonimiza.
    -- Una factura emitida hay que conservarla, y el art. 17.3(b) del RGPD ampara
    -- conservarla frente al derecho de supresión.
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
                'project_milestones', v_n_hitos
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

        return jsonb_build_object('status', 'anonymized_due_to_active_project');
    end if;

    delete from public.email_envios       where lead_id = any (v_lead_ids);
    update public.project_milestones set lead_id = null where lead_id = any (v_lead_ids);
    update public.clients            set lead_id = null where lead_id = any (v_lead_ids);
    update public.projects           set lead_id = null where lead_id = any (v_lead_ids);
    delete from public.leads              where id      = any (v_lead_ids);

    return jsonb_build_object(
        'status',  'deleted',
        'deleted', jsonb_build_object('leads', v_n_leads, 'email_envios', v_n_envios)
    );
end;
$$;

grant execute on function public.forget_lead_by_email(text, boolean) to authenticated;


-- =============================================================================
-- OJO: HAY QUE TOCAR LA WEB
-- =============================================================================
-- /api/contact de automatizatelo.com hacía tres inserciones: leads,
-- service_segmentation y funnel_flows. Las dos últimas ya no existen y sus
-- inserciones fallarán.
--
-- Ahora es una sola, con las columnas nuevas dentro de `leads`, y el estado
-- inicial es 'nuevo' en vez de 'pendiente'.
-- =============================================================================
