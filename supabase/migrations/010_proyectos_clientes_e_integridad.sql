-- =============================================================================
-- MIGRACIÓN 010 — FASE 2 (A): ARREGLAR LO QUE IMPIDE FACTURAR
-- =============================================================================
-- Dos fallos que hoy se traducen en dinero mal facturado, más tres arreglos de
-- integridad. Ver docs/AUDITORIA-PANEL.md §4.
--
-- Es re-ejecutable.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. project_services no tiene clave primaria
-- -----------------------------------------------------------------------------
-- La tabla tiene project_id, service_id, unit_price, quantity, iva_percent,
-- invoice_id y created_at. Ninguna clave primaria y ninguna columna `id`.
--
-- Pero al emitir una factura, ProjectDetail.jsx hace:
--
--     supabase.from('project_services')
--             .update({ invoice_id: factura.id })
--             .in('id', serviceIdsAfectados)
--
-- Esa columna no existe, así que la llamada falla y los servicios facturados
-- NUNCA se marcan como facturados: vuelven a aparecer como pendientes y se
-- pueden facturar por segunda vez.
--
-- Se añade la clave primaria. La combinación (project_id, service_id) no sirve
-- como PK porque un proyecto puede llevar el mismo servicio dos veces con
-- cantidades distintas.
-- -----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.project_services') is null then
        raise notice 'OMITIDA: public.project_services no existe';
        return;
    end if;

    if not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'project_services' and column_name = 'id'
    ) then
        alter table public.project_services add column id uuid not null default gen_random_uuid();
        raise notice 'AÑADIDA: project_services.id';
    end if;

    if not exists (
        select 1 from information_schema.table_constraints
         where table_schema = 'public' and table_name = 'project_services'
           and constraint_type = 'PRIMARY KEY'
    ) then
        alter table public.project_services add constraint project_services_pkey primary key (id);
        raise notice 'AÑADIDA: clave primaria de project_services';
    end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. Los proyectos no llegan a tener cliente
-- -----------------------------------------------------------------------------
-- `projects` tiene DOS campos de cliente: `client` (texto libre, obligatorio) y
-- `client_id` (clave foránea a clients, opcional). El panel escribe solo el
-- texto — la función create_project recibe `p_client text` — así que ningún
-- proyecto creado desde el panel tiene client_id.
--
-- Y facturar exige client_id: _emitirFactura lanza «El proyecto no tiene cliente
-- asociado» en cuanto entra. Es decir: hoy NO se puede facturar un proyecto
-- creado desde el panel.
--
-- Aquí se rellena client_id de los que se puedan casar por nombre. No se fuerza
-- NOT NULL todavía: primero hay que ver cuántos quedan sueltos.
-- -----------------------------------------------------------------------------
do $$
declare
    v_rellenados integer := 0;
    v_huerfanos  integer := 0;
    r record;
begin
    if to_regclass('public.projects') is null or to_regclass('public.clients') is null then
        raise notice 'OMITIDA: falta projects o clients';
        return;
    end if;

    -- a) Por nombre de empresa
    update public.projects p
       set client_id = c.id
      from public.clients c
     where p.client_id is null
       and c.company_name is not null
       and lower(trim(c.company_name)) = lower(trim(p.client));
    get diagnostics v_rellenados = row_count;
    raise notice 'client_id rellenado por nombre de empresa: %', v_rellenados;

    -- b) Por nombre y apellido de la persona
    update public.projects p
       set client_id = c.id
      from public.clients c
     where p.client_id is null
       and lower(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) = lower(trim(p.client));
    get diagnostics v_rellenados = row_count;
    raise notice 'client_id rellenado por nombre de persona: %', v_rellenados;

    -- c) A través del lead del que salió el proyecto
    update public.projects p
       set client_id = c.id
      from public.clients c
     where p.client_id is null
       and p.lead_id is not null
       and c.lead_id = p.lead_id;
    get diagnostics v_rellenados = row_count;
    raise notice 'client_id rellenado a traves del lead: %', v_rellenados;

    -- d) Lo que quede, a mano
    select count(*) into v_huerfanos from public.projects where client_id is null;
    if v_huerfanos > 0 then
        raise notice '--------------------------------------------------------';
        raise notice 'QUEDAN % PROYECTOS SIN CLIENTE. No se podran facturar', v_huerfanos;
        raise notice 'hasta que les asignes uno desde el panel:';
        for r in select id, name, client from public.projects where client_id is null order by name loop
            raise notice '  · % — cliente escrito: "%"', r.name, r.client;
        end loop;
        raise notice '--------------------------------------------------------';
    else
        raise notice 'Todos los proyectos tienen cliente. Se puede forzar NOT NULL (migracion 011).';
    end if;
end;
$$;

-- La columna de texto se queda de momento, como respaldo de lo que se escribió.
-- Se elimina en la 011, cuando no queden proyectos sin client_id.
comment on column public.projects.client is
    'OBSOLETA: sustituida por client_id. Se conserva como respaldo hasta que todos '
    'los proyectos tengan cliente asignado. Ver docs/AUDITORIA-PANEL.md fase 2.';


-- -----------------------------------------------------------------------------
-- 3. Clientes duplicados por email
-- -----------------------------------------------------------------------------
-- `clients.email` es NOT NULL pero no es único, así que nada impide dos fichas
-- del mismo cliente. La conversión de lead a cliente lo evita a mano con un
-- `.ilike('email', ...)` antes de insertar — pero cualquier otra vía (o dos
-- pestañas a la vez) crea el duplicado igual.
--
-- Si el índice no se puede crear es que YA hay duplicados: la consulta del aviso
-- te dice cuáles.
-- -----------------------------------------------------------------------------
do $$
declare
    v_dups integer;
begin
    if to_regclass('public.clients') is null then
        return;
    end if;

    select count(*) into v_dups from (
        select lower(trim(email)) from public.clients
         where email is not null and trim(email) <> ''
         group by lower(trim(email)) having count(*) > 1
    ) t;

    if v_dups > 0 then
        raise notice 'OMITIDO el indice unico: hay % emails repetidos en clients.', v_dups;
        raise notice 'Fusionalos y vuelve a lanzar esta migracion. Para verlos:';
        raise notice '  select lower(trim(email)), count(*), array_agg(id) from clients';
        raise notice '   group by 1 having count(*) > 1;';
    else
        create unique index if not exists idx_clients_email_unico
            on public.clients (lower(trim(email)));
        raise notice 'CREADO: indice unico de email en clients';
    end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. leads.last_name obligatorio, pero el formulario de la web no lo pide
-- -----------------------------------------------------------------------------
-- /api/contact manda `last_name: apellido || ''`. Cuela porque la cadena vacía
-- no es NULL, pero es una restricción que miente: el apellido es opcional en el
-- origen. Además ensucia los listados con apellidos en blanco que parecen datos.
-- -----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.leads') is null then
        return;
    end if;

    alter table public.leads alter column last_name drop not null;

    -- Las cadenas vacías pasan a NULL, que es lo que significan
    update public.leads set last_name = null where trim(coalesce(last_name, '')) = '';
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. Índices que faltaban en las consultas más frecuentes
-- -----------------------------------------------------------------------------
create index if not exists idx_project_services_project on public.project_services(project_id);
create index if not exists idx_project_services_invoice on public.project_services(invoice_id);
create index if not exists idx_facturas_client          on public.facturas(client_id);
create index if not exists idx_facturas_project         on public.facturas(project_id);
create index if not exists idx_leads_status             on public.leads(status, created_at desc);
