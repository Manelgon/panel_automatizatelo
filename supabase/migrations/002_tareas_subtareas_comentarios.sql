-- =============================================================================
-- MIGRACIÓN 002 — SUBTAREAS Y COMENTARIOS DE TAREAS
-- =============================================================================
-- Este contenido vivía en `supabase_tasks.sql`, en la raíz del repositorio, con
-- la cabecera «Ejecutar en el SQL Editor de Supabase». Es decir: se aplicaba a
-- mano y el repositorio no se enteraba. Ahora es una migración normal.
--
-- Se corrige de paso una referencia rota: apuntaba a `profiles(id)`, tabla que
-- no existe en este proyecto — aquí el perfil de usuario es `public.users`.
--
-- Las políticas que se crean aquí son provisionales; la migración 008 las
-- sustituye por permisos reales por proyecto.
-- =============================================================================

-- El gestor de tareas necesita estas dos columnas
alter table public.project_tasks
    add column if not exists description text,
    add column if not exists created_at timestamptz default now();


-- Subtareas
create table if not exists public.task_subtasks (
    id         uuid primary key default gen_random_uuid(),
    task_id    uuid not null references public.project_tasks(id) on delete cascade,
    title      text not null,
    status     text default 'pending' check (status in ('pending', 'done')),
    created_at timestamptz default now()
);


-- Comentarios / actividad
create table if not exists public.task_comments (
    id         uuid primary key default gen_random_uuid(),
    task_id    uuid not null references public.project_tasks(id) on delete cascade,
    user_id    uuid references public.users(id) on delete set null,
    content    text not null,
    created_at timestamptz default now()
);


create index if not exists idx_task_subtasks_task_id     on public.task_subtasks(task_id);
create index if not exists idx_task_comments_task_id     on public.task_comments(task_id);
create index if not exists idx_project_tasks_project_id  on public.project_tasks(project_id);
create index if not exists idx_project_tasks_assigned_to on public.project_tasks(assigned_to);


alter table public.task_subtasks enable row level security;
alter table public.task_comments enable row level security;

drop policy if exists "Auth users can manage subtasks" on public.task_subtasks;
create policy "Auth users can manage subtasks" on public.task_subtasks
    for all to authenticated using (true) with check (true);

drop policy if exists "Auth users can manage comments" on public.task_comments;
create policy "Auth users can manage comments" on public.task_comments
    for all to authenticated using (true) with check (true);
