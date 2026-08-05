-- =============================================================================
-- MIGRACIÓN 017 — FASE 4g: EL ESQUEMA HABLA UN SOLO IDIOMA
-- =============================================================================
-- Se renombran las 15 tablas inglesas del dominio del panel. Se conservan a
-- propósito, y hay que saber por qué:
--
--   users        la referencia auth.users, is_admin() y las dos Edge Functions
--   leads        escribe en ella la web pública Y es término asentado en español
--   facturas / factura_lineas / verifactu_registros   ya en castellano
--   blog_posts   lo lee la web pública de automatizatelo.com
--   email_* / company_settings / formaciones* / citas  ya en castellano
--
-- Gracias a eso, NI LA WEB NI LAS EDGE FUNCTIONS CAMBIAN. El renombrado queda
-- confinado al panel.
--
-- El mapa:
--
--   clients              → clientes
--   services             → servicios
--   projects             → proyectos
--   project_milestones   → proyecto_hitos
--   project_tasks        → tareas
--   project_files        → proyecto_archivos
--   project_members      → proyecto_miembros
--   project_services     → proyecto_servicios
--   project_budgets      → presupuestos
--   project_budget_lines → presupuesto_lineas
--   project_payments     → cobros
--   project_sprints      → sprints
--   task_status_logs     → tarea_estados
--   task_subtasks        → tarea_subtareas
--   task_comments        → tarea_comentarios
--
-- Las FKs, índices, triggers y políticas RLS siguen al renombrado solos (van
-- por identificador interno, no por nombre). Lo que NO le sigue y esta
-- migración recrea a mano:
--
--   1. Las funciones cuyo cuerpo nombra tablas en texto (se resuelven al
--      ejecutarse): es_miembro_proyecto, puede_ver_tarea, create_project,
--      forget_lead_by_email y projects_sincronizar_etiqueta_cliente.
--   2. VISTAS DE COMPATIBILIDAD con los nombres viejos, para que el panel
--      DESPLEGADO siga funcionando entre que se aplica esto y llega el deploy
--      nuevo. security_invoker: la RLS de la tabla real sigue mandando.
--      (Los canales realtime del panel viejo sí quedan sordos durante esa
--      ventana: escuchan por nombre de tabla. Se recuperan con el deploy.)
--
-- Las columnas NO se renombran (project_id, client_id… siguen igual): eso
-- multiplicaría el alcance y las FKs incrustadas del panel dependen de ellas.
--
-- ORDEN DE APLICACIÓN: esta migración PRIMERO, el deploy del panel DESPUÉS.
-- Es re-ejecutable: cada rename se salta si ya está hecho.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. RENOMBRADOS (idempotentes)
-- -----------------------------------------------------------------------------
do $$
declare
    r record;
begin
    for r in
        select * from (values
            ('clients',              'clientes'),
            ('services',             'servicios'),
            ('projects',             'proyectos'),
            ('project_milestones',   'proyecto_hitos'),
            ('project_tasks',        'tareas'),
            ('project_files',        'proyecto_archivos'),
            ('project_members',      'proyecto_miembros'),
            ('project_services',     'proyecto_servicios'),
            ('project_budgets',      'presupuestos'),
            ('project_budget_lines', 'presupuesto_lineas'),
            ('project_payments',     'cobros'),
            ('project_sprints',      'sprints'),
            ('task_status_logs',     'tarea_estados'),
            ('task_subtasks',        'tarea_subtareas'),
            ('task_comments',        'tarea_comentarios')
        ) as t(viejo, nuevo)
    loop
        if to_regclass('public.' || r.nuevo) is not null then
            raise notice 'YA RENOMBRADA: %', r.nuevo;
            continue;
        end if;
        if to_regclass('public.' || r.viejo) is null then
            raise notice 'NO EXISTE (se omite): %', r.viejo;
            continue;
        end if;
        execute format('alter table public.%I rename to %I', r.viejo, r.nuevo);
        raise notice 'RENOMBRADA: % -> %', r.viejo, r.nuevo;
    end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. FUNCIONES CUYO CUERPO NOMBRA TABLAS
-- -----------------------------------------------------------------------------
create or replace function public.es_miembro_proyecto(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
          from public.proyecto_miembros pm
         where pm.project_id = p_project_id
           and pm.user_id = auth.uid()
    );
$$;

create or replace function public.puede_ver_tarea(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
          from public.tareas t
         where t.id = p_task_id
           and (
                public.is_admin()
                or public.es_miembro_proyecto(t.project_id)
                or t.assigned_to = auth.uid()
           )
    );
$$;

create or replace function public.projects_sincronizar_etiqueta_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_nombre text;
begin
    if new.client_id is null then
        return new;
    end if;

    select coalesce(
               nullif(trim(c.company_name), ''),
               trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
           )
      into v_nombre
      from public.clientes c
     where c.id = new.client_id;

    if v_nombre is not null and trim(v_nombre) <> '' then
        new.client := v_nombre;
    end if;

    return new;
end;
$$;

create or replace function public.create_project(
    p_name           text,
    p_client_id      uuid,
    p_description    text    default '',
    p_alias          text    default null,
    p_total_hours    integer default 0,
    p_lead_id        uuid    default null,
    p_assigned_users uuid[]  default '{}',
    p_service_ids    uuid[]  default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_project_id uuid;
    v_alias      text;
begin
    if not public.is_admin() then
        raise exception 'Se requiere rol de administrador para crear proyectos';
    end if;

    if p_name is null or trim(p_name) = '' then
        raise exception 'El proyecto necesita un nombre';
    end if;

    if p_client_id is null then
        raise exception 'El proyecto necesita un cliente. Sin cliente no se puede facturar.';
    end if;

    if not exists (select 1 from public.clientes where id = p_client_id) then
        raise exception 'El cliente indicado no existe';
    end if;

    v_alias := nullif(trim(coalesce(p_alias, '')), '');
    if v_alias is null then
        v_alias := 'PR-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    end if;
    while exists (select 1 from public.proyectos where id_alias = v_alias) loop
        v_alias := 'PR-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    end loop;

    insert into public.proyectos (name, client_id, description, id_alias, total_hours, lead_id, status)
    values (trim(p_name), p_client_id, coalesce(p_description, ''), v_alias,
            coalesce(p_total_hours, 0), p_lead_id, 'Pendiente')
    returning id into v_project_id;

    insert into public.proyecto_miembros (project_id, user_id, role)
    select v_project_id, u, 'editor'
      from unnest(coalesce(p_assigned_users, '{}')) as u
     where u is not null
    on conflict (project_id, user_id) do nothing;

    if auth.uid() is not null then
        insert into public.proyecto_miembros (project_id, user_id, role)
        values (v_project_id, auth.uid(), 'admin')
        on conflict (project_id, user_id) do nothing;
    end if;

    insert into public.proyecto_servicios (project_id, service_id, unit_price, quantity, iva_percent)
    select v_project_id, s.id, coalesce(s.price, 0), 1, 21
      from public.servicios s
     where s.id = any (coalesce(p_service_ids, '{}'));

    return v_project_id;
end;
$$;

grant execute on function public.create_project(text, uuid, text, text, integer, uuid, uuid[], uuid[]) to authenticated;

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

    select count(*) into v_n_leads  from public.leads          where id      = any (v_lead_ids);
    select count(*) into v_n_envios from public.email_envios   where lead_id = any (v_lead_ids);
    select count(*) into v_n_hitos  from public.proyecto_hitos where lead_id = any (v_lead_ids);
    select count(*) into v_n_citas  from public.citas          where lead_id = any (v_lead_ids);

    select exists (
        select 1 from public.proyectos where lead_id = any (v_lead_ids)
        union all
        select 1
          from public.clientes c
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

    delete from public.email_envios     where lead_id = any (v_lead_ids);
    update public.proyecto_hitos set lead_id = null where lead_id = any (v_lead_ids);
    update public.clientes       set lead_id = null where lead_id = any (v_lead_ids);
    update public.proyectos      set lead_id = null where lead_id = any (v_lead_ids);
    delete from public.leads            where id      = any (v_lead_ids);

    return jsonb_build_object(
        'status',  'deleted',
        'deleted', jsonb_build_object('leads', v_n_leads, 'email_envios', v_n_envios, 'citas', v_n_citas)
    );
end;
$$;

grant execute on function public.forget_lead_by_email(text, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. VISTAS DE COMPATIBILIDAD (nombres viejos → tablas nuevas)
-- -----------------------------------------------------------------------------
-- Para la ventana entre aplicar esta migración y el deploy nuevo del panel.
-- security_invoker: la RLS de la tabla real se evalúa con el usuario que
-- consulta, no con el dueño de la vista. Se retiran en una migración futura
-- cuando el panel nuevo lleve tiempo desplegado.
-- -----------------------------------------------------------------------------
do $$
declare
    r record;
begin
    for r in
        select * from (values
            ('clients',              'clientes'),
            ('services',             'servicios'),
            ('projects',             'proyectos'),
            ('project_milestones',   'proyecto_hitos'),
            ('project_tasks',        'tareas'),
            ('project_files',        'proyecto_archivos'),
            ('project_members',      'proyecto_miembros'),
            ('project_services',     'proyecto_servicios'),
            ('project_budgets',      'presupuestos'),
            ('project_budget_lines', 'presupuesto_lineas'),
            ('project_payments',     'cobros'),
            ('project_sprints',      'sprints'),
            ('task_status_logs',     'tarea_estados'),
            ('task_subtasks',        'tarea_subtareas'),
            ('task_comments',        'tarea_comentarios')
        ) as t(viejo, nuevo)
    loop
        if to_regclass('public.' || r.nuevo) is null then
            continue;  -- la tabla nueva no existe: nada que enlazar
        end if;
        execute format('drop view if exists public.%I', r.viejo);
        execute format(
            'create view public.%I with (security_invoker = true) as select * from public.%I',
            r.viejo, r.nuevo
        );
        execute format('grant select, insert, update, delete on public.%I to authenticated', r.viejo);
        raise notice 'VISTA DE COMPATIBILIDAD: % -> %', r.viejo, r.nuevo;
    end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- COMPROBACIÓN — pega esto después
-- -----------------------------------------------------------------------------
--   select table_name, table_type
--     from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('proyectos','clientes','servicios','tareas','projects','clients')
--    order by table_type, table_name;
--
-- Debe salir: proyectos/clientes/servicios/tareas como BASE TABLE, y
-- projects/clients como VIEW.
-- =============================================================================
