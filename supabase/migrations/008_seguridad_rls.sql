-- =============================================================================
-- MIGRACIÓN 008 — SEGURIDAD: CERRAR LA ESCALADA DE PRIVILEGIOS Y LAS RLS FALSAS
-- =============================================================================
-- Ver docs/AUDITORIA-PANEL.md §2.
--
-- Dos problemas:
--
--   1. `users_update_own` permitía UPDATE sobre la propia fila sin restringir
--      columnas. Cualquier usuario podía hacer:
--          update users set role = 'admin' where id = auth.uid();
--      y a partir de ahí veía facturación, leads y clientes.
--
--   2. Doce tablas tenían políticas llamadas «..._all_admin» cuyo predicado era
--      literalmente USING (true). El rol `user` no existía de facto.
--
-- Reutiliza public.is_admin() (definida en 001_facturacion.sql).
--
-- -----------------------------------------------------------------------------
-- POR QUÉ ESTE FICHERO USA HELPERS EN VEZ DE CREATE POLICY A PELO
-- -----------------------------------------------------------------------------
-- El repositorio y la base de datos real llevan tiempo divergiendo (ver
-- docs/BASE-DE-DATOS.md). Hay tablas en schema.sql que ya no existen en
-- Supabase — `project_invoices`, por ejemplo, se abandonó al pasar a `facturas`.
-- Escribir `create policy ... on public.project_invoices` revienta con
-- «relation does not exist» y aborta toda la migración.
--
-- Los dos helpers de abajo comprueban antes si la tabla existe y, si no, avisan
-- y siguen. Así este fichero se aplica igual de bien sobre la base de datos
-- actual que sobre una recién creada desde las migraciones, sin tener que saber
-- de antemano cuál de las dos tienes delante.
--
-- Es re-ejecutable: lánzalo las veces que quieras.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- HELPERS (se borran al final del fichero)
-- -----------------------------------------------------------------------------
create or replace function public.__rls_drop(p_tabla text, p_politica text)
returns void
language plpgsql
as $$
begin
    if to_regclass('public.' || quote_ident(p_tabla)) is null then
        return;
    end if;
    execute format('drop policy if exists %I on public.%I', p_politica, p_tabla);
end;
$$;

create or replace function public.__rls_policy(
    p_tabla    text,
    p_politica text,
    p_cmd      text,            -- 'all' | 'select' | 'insert' | 'update' | 'delete'
    p_using    text default null,
    p_check    text default null
)
returns void
language plpgsql
as $$
begin
    if to_regclass('public.' || quote_ident(p_tabla)) is null then
        raise notice 'OMITIDA: la tabla public.% no existe (politica %)', p_tabla, p_politica;
        return;
    end if;

    execute format('alter table public.%I enable row level security', p_tabla);
    execute format('drop policy if exists %I on public.%I', p_politica, p_tabla);
    execute format(
        'create policy %I on public.%I for %s to authenticated %s %s',
        p_politica, p_tabla, p_cmd,
        case when p_using is not null then 'using (' || p_using || ')' else '' end,
        case when p_check is not null then 'with check (' || p_check || ')' else '' end
    );
end;
$$;


-- -----------------------------------------------------------------------------
-- 1. EL ROL NO SE AUTOASIGNA
-- -----------------------------------------------------------------------------
-- RLS no sabe restringir columnas concretas, así que la protección va en un
-- trigger. Solo un admin (o el servidor con service_role, que no tiene
-- auth.uid()) puede fijar o cambiar `role`. Para el resto se revierte en
-- silencio en lugar de fallar: así el panel puede seguir guardando el perfil
-- (nombre, avatar…) sin tratar el rol como un error.
-- -----------------------------------------------------------------------------
create or replace function public.proteger_rol_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then      -- service_role, triggers de auth
        return new;
    end if;

    if public.is_admin() then
        return new;
    end if;

    if tg_op = 'INSERT' then
        new.role := 'user';
    elsif new.role is distinct from old.role then
        new.role := old.role;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_proteger_rol_usuario on public.users;
create trigger trg_proteger_rol_usuario
    before insert or update on public.users
    for each row
    execute function public.proteger_rol_usuario();


-- -----------------------------------------------------------------------------
-- 2. HELPERS DE PERMISOS
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
          from public.project_members pm
         where pm.project_id = p_project_id
           and pm.user_id = auth.uid()
    );
$$;

grant execute on function public.es_miembro_proyecto(uuid) to authenticated;

do $$
begin
    if to_regclass('public.project_tasks') is null then
        raise notice 'OMITIDA: public.project_tasks no existe (funcion puede_ver_tarea)';
        return;
    end if;

    execute $ddl$
        create or replace function public.puede_ver_tarea(p_task_id uuid)
        returns boolean
        language sql
        stable
        security definer
        set search_path = ''
        as $fn$
            select exists (
                select 1
                  from public.project_tasks t
                 where t.id = p_task_id
                   and (
                        public.is_admin()
                        or public.es_miembro_proyecto(t.project_id)
                        or t.assigned_to = auth.uid()
                   )
            );
        $fn$;
    $ddl$;

    execute 'grant execute on function public.puede_ver_tarea(uuid) to authenticated';
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. public.users
-- -----------------------------------------------------------------------------
-- SELECT sigue abierto a autenticados: el panel necesita listar el equipo para
-- asignar tareas. INSERT solo de la propia fila. DELETE solo admin (si un
-- usuario borrase su fila quedaría un fantasma en auth.users sin perfil).
select public.__rls_drop('users', 'users_insert_authenticated');
select public.__rls_drop('users', 'users_update_own');
select public.__rls_drop('users', 'users_delete_own');

select public.__rls_policy('users', 'users_insert_self', 'insert',
    null,
    'auth.uid() = id');

select public.__rls_policy('users', 'users_update_propio_o_admin', 'update',
    'auth.uid() = id or public.is_admin()',
    'auth.uid() = id or public.is_admin()');

select public.__rls_policy('users', 'users_delete_admin', 'delete',
    'public.is_admin()');


-- -----------------------------------------------------------------------------
-- 4. TABLAS HIJAS DE PROYECTO: admin o miembro del proyecto
-- -----------------------------------------------------------------------------
select public.__rls_drop('project_milestones', 'milestones_select_member');
select public.__rls_drop('project_milestones', 'milestones_all_admin');
select public.__rls_policy('project_milestones', 'project_milestones_acceso', 'all',
    'public.is_admin() or public.es_miembro_proyecto(project_id)',
    'public.is_admin() or public.es_miembro_proyecto(project_id)');

-- project_tasks: quien la tiene asignada siempre la ve
select public.__rls_drop('project_tasks', 'tasks_select_member');
select public.__rls_drop('project_tasks', 'tasks_all_admin');
select public.__rls_policy('project_tasks', 'project_tasks_acceso', 'all',
    'public.is_admin() or public.es_miembro_proyecto(project_id) or assigned_to = auth.uid()',
    'public.is_admin() or public.es_miembro_proyecto(project_id) or assigned_to = auth.uid()');

select public.__rls_drop('project_files', 'files_select_member');
select public.__rls_drop('project_files', 'files_all_admin');
select public.__rls_policy('project_files', 'project_files_acceso', 'all',
    'public.is_admin() or public.es_miembro_proyecto(project_id)',
    'public.is_admin() or public.es_miembro_proyecto(project_id)');

select public.__rls_drop('project_services', 'project_services_select');
select public.__rls_drop('project_services', 'project_services_all');
select public.__rls_policy('project_services', 'project_services_acceso', 'all',
    'public.is_admin() or public.es_miembro_proyecto(project_id)',
    'public.is_admin() or public.es_miembro_proyecto(project_id)');

-- project_members: leer sí (para ver el equipo), tocar solo admin
select public.__rls_drop('project_members', 'members_select');
select public.__rls_drop('project_members', 'members_insert_self');
select public.__rls_drop('project_members', 'members_all_admin');
select public.__rls_policy('project_members', 'project_members_select', 'select',
    'public.is_admin() or public.es_miembro_proyecto(project_id) or user_id = auth.uid()');
select public.__rls_policy('project_members', 'project_members_admin', 'all',
    'public.is_admin()',
    'public.is_admin()');


-- -----------------------------------------------------------------------------
-- 5. DINERO Y LEADS: solo admin
-- -----------------------------------------------------------------------------
-- Las tablas project_budgets / project_budget_lines / project_invoices /
-- project_payments están marcadas para desaparecer (AUDITORIA-PANEL.md §4.1) y
-- puede que alguna ya no exista. Los helpers avisan y siguen.
select public.__rls_drop('project_budget_lines', 'budget_lines_select');
select public.__rls_drop('project_budget_lines', 'budget_lines_all');
select public.__rls_policy('project_budget_lines', 'project_budget_lines_admin', 'all',
    'public.is_admin()', 'public.is_admin()');

select public.__rls_drop('project_budgets', 'project_budgets_select');
select public.__rls_drop('project_budgets', 'project_budgets_all');
select public.__rls_policy('project_budgets', 'project_budgets_admin', 'all',
    'public.is_admin()', 'public.is_admin()');

select public.__rls_drop('project_invoices', 'invoices_select');
select public.__rls_drop('project_invoices', 'invoices_all');
select public.__rls_policy('project_invoices', 'project_invoices_admin', 'all',
    'public.is_admin()', 'public.is_admin()');

select public.__rls_drop('project_payments', 'payments_select');
select public.__rls_drop('project_payments', 'payments_all');
select public.__rls_policy('project_payments', 'project_payments_admin', 'all',
    'public.is_admin()', 'public.is_admin()');

-- leads: datos personales de terceros.
-- Se conserva "leads_insert_anon": el formulario público de la web lo necesita.
select public.__rls_drop('leads', 'leads_select_authenticated');
select public.__rls_drop('leads', 'leads_update_authenticated');
select public.__rls_drop('leads', 'leads_delete_authenticated');
select public.__rls_policy('leads', 'leads_admin', 'all',
    'public.is_admin()', 'public.is_admin()');

-- service_segmentation y funnel_flows: mismo dato, misma regla.
-- Se les quita el INSERT anónimo: quien las escribe es /api/contact de la web,
-- que usa la service_role key y no pasa por RLS.
select public.__rls_drop('service_segmentation', 'service_segmentation_select');
select public.__rls_drop('service_segmentation', 'service_segmentation_insert');
select public.__rls_drop('service_segmentation', 'service_segmentation_update');
select public.__rls_drop('service_segmentation', 'service_segmentation_delete');
select public.__rls_policy('service_segmentation', 'service_segmentation_admin', 'all',
    'public.is_admin()', 'public.is_admin()');

select public.__rls_drop('funnel_flows', 'funnel_flows_select');
select public.__rls_drop('funnel_flows', 'funnel_flows_insert');
select public.__rls_drop('funnel_flows', 'funnel_flows_update');
select public.__rls_drop('funnel_flows', 'funnel_flows_delete');
select public.__rls_policy('funnel_flows', 'funnel_flows_admin', 'all',
    'public.is_admin()', 'public.is_admin()');


-- -----------------------------------------------------------------------------
-- 6. PROYECTOS: el INSERT también se cierra
-- -----------------------------------------------------------------------------
select public.__rls_drop('projects', 'projects_insert_authenticated');
select public.__rls_policy('projects', 'projects_insert_admin', 'insert',
    null, 'public.is_admin()');


-- -----------------------------------------------------------------------------
-- 7. SUBTAREAS Y COMENTARIOS (venían de supabase_tasks.sql, con auth.role())
-- -----------------------------------------------------------------------------
select public.__rls_drop('task_subtasks', 'Auth users can manage subtasks');
select public.__rls_policy('task_subtasks', 'task_subtasks_acceso', 'all',
    'public.puede_ver_tarea(task_id)', 'public.puede_ver_tarea(task_id)');

select public.__rls_drop('task_comments', 'Auth users can manage comments');
select public.__rls_policy('task_comments', 'task_comments_acceso', 'all',
    'public.puede_ver_tarea(task_id)', 'public.puede_ver_tarea(task_id)');


-- -----------------------------------------------------------------------------
-- LIMPIEZA
-- -----------------------------------------------------------------------------
drop function if exists public.__rls_policy(text, text, text, text, text);
drop function if exists public.__rls_drop(text, text);


-- =============================================================================
-- COMPROBACIÓN — pega esto después
-- =============================================================================
--   select tablename, policyname, cmd
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('users','leads','projects','project_tasks','project_members')
--    order by tablename, policyname;
--
-- En `users` deben quedar users_insert_self, users_update_propio_o_admin,
-- users_delete_admin y la de SELECT de siempre.
-- En `leads`, solo leads_admin y leads_insert_anon.
--
-- CÓMO SE CREA EL PRIMER ADMIN
-- =============================================================================
-- A partir de aquí nadie puede ascenderse a sí mismo. Si algún día no queda
-- ningún admin, desde el SQL Editor (que corre como service_role y el trigger
-- deja pasar):
--
--   update public.users set role = 'admin' where email = 'serincosol@gmail.com';
-- =============================================================================
