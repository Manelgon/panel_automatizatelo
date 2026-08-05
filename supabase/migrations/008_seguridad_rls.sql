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
-- Reutilizamos public.is_admin() (definida en 001_facturacion.sql), que ya está
-- bien hecha: security definer, search_path vacío, sin recursión de RLS.
--
-- RE-EJECUTABLE: cada `create policy` va precedido de su `drop policy if
-- exists`, tanto del nombre viejo como del nuevo. Se puede lanzar las veces que
-- haga falta y el resultado final es el mismo.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. EL ROL NO SE AUTOASIGNA
-- -----------------------------------------------------------------------------
-- RLS no sabe restringir columnas concretas, así que la protección va en un
-- trigger. Regla: solo un admin (o el servidor con service_role, que no tiene
-- auth.uid()) puede fijar o cambiar `role`. Para todos los demás, el valor se
-- revierte en silencio en lugar de fallar: así el panel puede seguir guardando
-- el perfil (nombre, avatar…) sin tratar el rol como un error.
-- -----------------------------------------------------------------------------
create or replace function public.proteger_rol_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Procesos de servidor (service_role, triggers de auth): sin sesión de usuario
    if auth.uid() is null then
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
-- 2. POLÍTICAS DE public.users
-- -----------------------------------------------------------------------------
-- SELECT sigue abierto a autenticados: el panel necesita listar el equipo para
-- asignar tareas. INSERT solo de la propia fila. DELETE solo admin (si un
-- usuario borrase su fila, quedaría un fantasma en auth.users sin perfil).
-- -----------------------------------------------------------------------------
drop policy if exists "users_insert_authenticated"   on public.users;
drop policy if exists "users_update_own"             on public.users;
drop policy if exists "users_delete_own"             on public.users;
drop policy if exists "users_insert_self"            on public.users;
drop policy if exists "users_update_propio_o_admin"  on public.users;
drop policy if exists "users_delete_admin"           on public.users;

create policy "users_insert_self" on public.users
    for insert to authenticated
    with check (auth.uid() = id);

create policy "users_update_propio_o_admin" on public.users
    for update to authenticated
    using       (auth.uid() = id or public.is_admin())
    with check  (auth.uid() = id or public.is_admin());

create policy "users_delete_admin" on public.users
    for delete to authenticated
    using (public.is_admin());


-- -----------------------------------------------------------------------------
-- 3. HELPER DE PERTENENCIA A PROYECTO
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


-- -----------------------------------------------------------------------------
-- 4. TABLAS HIJAS DE PROYECTO: admin o miembro del proyecto
-- -----------------------------------------------------------------------------
-- project_milestones
drop policy if exists "milestones_select_member"    on public.project_milestones;
drop policy if exists "milestones_all_admin"        on public.project_milestones;
drop policy if exists "project_milestones_acceso"   on public.project_milestones;
create policy "project_milestones_acceso" on public.project_milestones
    for all to authenticated
    using      (public.is_admin() or public.es_miembro_proyecto(project_id))
    with check (public.is_admin() or public.es_miembro_proyecto(project_id));

-- project_tasks — además, quien la tiene asignada siempre la ve
drop policy if exists "tasks_select_member"   on public.project_tasks;
drop policy if exists "tasks_all_admin"       on public.project_tasks;
drop policy if exists "project_tasks_acceso"  on public.project_tasks;
create policy "project_tasks_acceso" on public.project_tasks
    for all to authenticated
    using      (public.is_admin() or public.es_miembro_proyecto(project_id) or assigned_to = auth.uid())
    with check (public.is_admin() or public.es_miembro_proyecto(project_id) or assigned_to = auth.uid());

-- project_files
drop policy if exists "files_select_member"   on public.project_files;
drop policy if exists "files_all_admin"       on public.project_files;
drop policy if exists "project_files_acceso"  on public.project_files;
create policy "project_files_acceso" on public.project_files
    for all to authenticated
    using      (public.is_admin() or public.es_miembro_proyecto(project_id))
    with check (public.is_admin() or public.es_miembro_proyecto(project_id));

-- project_services
drop policy if exists "project_services_select" on public.project_services;
drop policy if exists "project_services_all"    on public.project_services;
drop policy if exists "project_services_acceso" on public.project_services;
create policy "project_services_acceso" on public.project_services
    for all to authenticated
    using      (public.is_admin() or public.es_miembro_proyecto(project_id))
    with check (public.is_admin() or public.es_miembro_proyecto(project_id));

-- project_members — leer sí (para ver el equipo), tocar solo admin
drop policy if exists "members_select"          on public.project_members;
drop policy if exists "members_insert_self"     on public.project_members;
drop policy if exists "members_all_admin"       on public.project_members;
drop policy if exists "project_members_select"  on public.project_members;
drop policy if exists "project_members_admin"   on public.project_members;
create policy "project_members_select" on public.project_members
    for select to authenticated
    using (public.is_admin() or public.es_miembro_proyecto(project_id) or user_id = auth.uid());
create policy "project_members_admin" on public.project_members
    for all to authenticated
    using      (public.is_admin())
    with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- 5. TABLAS DE DINERO Y DE LEADS: solo admin
-- -----------------------------------------------------------------------------
-- project_budgets / project_budget_lines / project_invoices / project_payments
-- están marcadas para desaparecer (docs/AUDITORIA-PANEL.md §4.1). Hasta que se
-- borren, que al menos no las vea cualquiera.
drop policy if exists "budget_lines_select"          on public.project_budget_lines;
drop policy if exists "budget_lines_all"             on public.project_budget_lines;
drop policy if exists "project_budget_lines_admin"   on public.project_budget_lines;
create policy "project_budget_lines_admin" on public.project_budget_lines
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "project_budgets_select" on public.project_budgets;
drop policy if exists "project_budgets_all"    on public.project_budgets;
drop policy if exists "project_budgets_admin"  on public.project_budgets;
create policy "project_budgets_admin" on public.project_budgets
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "invoices_select"         on public.project_invoices;
drop policy if exists "invoices_all"            on public.project_invoices;
drop policy if exists "project_invoices_admin"  on public.project_invoices;
create policy "project_invoices_admin" on public.project_invoices
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "payments_select"         on public.project_payments;
drop policy if exists "payments_all"            on public.project_payments;
drop policy if exists "project_payments_admin"  on public.project_payments;
create policy "project_payments_admin" on public.project_payments
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- leads: datos personales de terceros
drop policy if exists "leads_select_authenticated" on public.leads;
drop policy if exists "leads_update_authenticated" on public.leads;
drop policy if exists "leads_delete_authenticated" on public.leads;
drop policy if exists "leads_admin"                on public.leads;
create policy "leads_admin" on public.leads
    for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Se conserva "leads_insert_anon": el formulario público de la web necesita
-- poder dar de alta un lead sin sesión.

-- service_segmentation y funnel_flows: mismo dato, misma regla.
-- Se les quita el INSERT anónimo: quien los escribe es /api/contact de la web,
-- que usa la service_role key y no pasa por RLS.
drop policy if exists "service_segmentation_select" on public.service_segmentation;
drop policy if exists "service_segmentation_insert" on public.service_segmentation;
drop policy if exists "service_segmentation_update" on public.service_segmentation;
drop policy if exists "service_segmentation_delete" on public.service_segmentation;
drop policy if exists "service_segmentation_admin"  on public.service_segmentation;
create policy "service_segmentation_admin" on public.service_segmentation
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "funnel_flows_select" on public.funnel_flows;
drop policy if exists "funnel_flows_insert" on public.funnel_flows;
drop policy if exists "funnel_flows_update" on public.funnel_flows;
drop policy if exists "funnel_flows_delete" on public.funnel_flows;
drop policy if exists "funnel_flows_admin"  on public.funnel_flows;
create policy "funnel_flows_admin" on public.funnel_flows
    for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- 6. PROYECTOS: el INSERT también se cierra
-- -----------------------------------------------------------------------------
drop policy if exists "projects_insert_authenticated" on public.projects;
drop policy if exists "projects_insert_admin"         on public.projects;
create policy "projects_insert_admin" on public.projects
    for insert to authenticated
    with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- 7. SUBTAREAS Y COMENTARIOS (venían de supabase_tasks.sql, con auth.role())
-- -----------------------------------------------------------------------------
create or replace function public.puede_ver_tarea(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

grant execute on function public.puede_ver_tarea(uuid) to authenticated;

drop policy if exists "Auth users can manage subtasks" on public.task_subtasks;
drop policy if exists "task_subtasks_acceso"           on public.task_subtasks;
create policy "task_subtasks_acceso" on public.task_subtasks
    for all to authenticated
    using      (public.puede_ver_tarea(task_id))
    with check (public.puede_ver_tarea(task_id));

drop policy if exists "Auth users can manage comments" on public.task_comments;
drop policy if exists "task_comments_acceso"           on public.task_comments;
create policy "task_comments_acceso" on public.task_comments
    for all to authenticated
    using      (public.puede_ver_tarea(task_id))
    with check (public.puede_ver_tarea(task_id));


-- =============================================================================
-- COMPROBACIÓN — pega esto después para ver el resultado
-- =============================================================================
--   select tablename, policyname, cmd
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('users','leads','projects','project_tasks','project_members')
--    order by tablename, policyname;
--
-- IMPORTANTE — CÓMO SE CREA EL PRIMER ADMIN
-- =============================================================================
-- A partir de esta migración nadie puede ascenderse a sí mismo. Si algún día hay
-- que promover a alguien y no queda ningún admin, hazlo desde el SQL Editor de
-- Supabase (que corre como service_role y el trigger deja pasar):
--
--   update public.users set role = 'admin' where email = 'serincosol@gmail.com';
-- =============================================================================
