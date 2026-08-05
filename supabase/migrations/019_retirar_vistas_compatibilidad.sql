-- =============================================================================
-- MIGRACIÓN 019 — RETIRAR EL PUENTE DEL RENOMBRADO
-- =============================================================================
-- ⚠️ NO APLICAR HASTA HABER USADO EL PANEL UNOS DÍAS CON NORMALIDAD tras el
--    renombrado (migración 017): facturar, cobrar, crear proyectos y tareas,
--    certificar. Si todo funciona, nadie usa ya los nombres viejos.
--
-- La 017 creó vistas con los nombres ingleses (projects, clients…) para que el
-- panel desplegado siguiera funcionando durante la ventana del deploy. Esa
-- ventana pasó: el panel habla con las tablas nuevas.
--
-- Dejar las vistas para siempre tendría un coste sutil: cada tabla con DOS
-- nombres válidos — la confusión que el renombrado vino a matar — y cualquier
-- `.from('projects')` escrito por error FUNCIONARÍA en vez de fallar,
-- escondiendo el fallo.
--
-- Es re-ejecutable. Solo borra VISTAS: si algo con ese nombre fuera una tabla
-- (una base de datos que nunca pasó por la 017), no la toca.
-- =============================================================================

do $$
declare
    r record;
begin
    for r in
        select * from (values
            ('clients'), ('services'), ('projects'), ('project_milestones'),
            ('project_tasks'), ('project_files'), ('project_members'),
            ('project_services'), ('project_budgets'), ('project_budget_lines'),
            ('project_payments'), ('project_sprints'), ('task_status_logs'),
            ('task_subtasks'), ('task_comments')
        ) as t(nombre)
    loop
        if exists (
            select 1 from information_schema.views
             where table_schema = 'public' and table_name = r.nombre
        ) then
            execute format('drop view public.%I', r.nombre);
            raise notice 'VISTA RETIRADA: %', r.nombre;
        else
            raise notice 'no era una vista (se deja en paz): %', r.nombre;
        end if;
    end loop;
end;
$$;

-- Comprobación: esto debe devolver CERO filas
--   select table_name from information_schema.views
--    where table_schema = 'public'
--      and table_name in ('projects','clients','services','project_tasks');
