-- =============================================================================
-- MIGRACIÓN 016 — LA DERIVA QUE ROMPÍA ARCHIVOS Y TAREAS
-- =============================================================================
-- El baseline (000) define project_sprints, task_status_logs y la columna
-- project_tasks.sprint_id. En la base de datos real NO EXISTEN: el schema.sql
-- creció en el repositorio después de que la base de datos se creara a mano, y
-- nadie volvió a pegar esa parte. El volcado de agosto de 2026 lo confirma.
--
-- Consecuencias visibles, todas fallando en silencio:
--
--   · ProjectDetail carga proyecto → hitos → tareas → SPRINTS → archivos en el
--     mismo try. La consulta de sprints revienta y corta la función: la tarjeta
--     de Archivos siempre decía «No hay archivos adjuntos» aunque el presupuesto
--     estuviera guardado. (El síntoma que destapó todo esto.)
--   · Crear una tarea desde la ficha del proyecto escribe sprint_id → columna
--     inexistente → falla.
--   · El gestor de Tareas intenta leer y crear sprints y registrar cambios de
--     estado en task_status_logs → nada de eso funcionaba.
--
-- ¿Por qué no re-ejecutar el baseline entero, si es idempotente? Porque además
-- de crear las tablas que faltan, RE-CREA las políticas RLS permisivas viejas
-- (drop + create) y desharía la migración 008. Aquí se crea solo lo que falta,
-- ya con las políticas correctas.
--
-- Es re-ejecutable.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SPRINTS
-- -----------------------------------------------------------------------------
create table if not exists public.project_sprints (
    id         uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    name       text not null,              -- "Sprint 1", "MVP"…
    goal       text,
    start_date date,
    end_date   date,
    status     text default 'planning'
               check (status in ('planning', 'active', 'completed')),
    created_at timestamptz default now()
);

create index if not exists idx_project_sprints_project on public.project_sprints(project_id);

-- Vincular tareas a sprints (NULL = backlog)
alter table public.project_tasks
    add column if not exists sprint_id uuid references public.project_sprints(id) on delete set null;

create index if not exists idx_project_tasks_sprint on public.project_tasks(sprint_id);


-- -----------------------------------------------------------------------------
-- 2. REGISTRO DE CAMBIOS DE ESTADO DE TAREAS
-- -----------------------------------------------------------------------------
-- Lo escribe el panel cada vez que una tarea cambia de columna; sirve para
-- calcular cuánto tiempo pasa cada tarea en cada estado.
-- -----------------------------------------------------------------------------
create table if not exists public.task_status_logs (
    id         uuid primary key default gen_random_uuid(),
    task_id    uuid not null references public.project_tasks(id) on delete cascade,
    status     text not null,
    changed_at timestamptz default now(),
    changed_by uuid references public.users(id) on delete set null
);

create index if not exists idx_task_status_logs_task on public.task_status_logs(task_id);
create index if not exists idx_task_status_logs_time on public.task_status_logs(changed_at);


-- -----------------------------------------------------------------------------
-- 3. RLS — el criterio de la 008, no el del baseline
-- -----------------------------------------------------------------------------
alter table public.project_sprints  enable row level security;
alter table public.task_status_logs enable row level security;

drop policy if exists "project_sprints_acceso" on public.project_sprints;
create policy "project_sprints_acceso" on public.project_sprints
    for all to authenticated
    using      (public.is_admin() or public.es_miembro_proyecto(project_id))
    with check (public.is_admin() or public.es_miembro_proyecto(project_id));

drop policy if exists "task_status_logs_acceso" on public.task_status_logs;
create policy "task_status_logs_acceso" on public.task_status_logs
    for all to authenticated
    using      (public.puede_ver_tarea(task_id))
    with check (public.puede_ver_tarea(task_id));
