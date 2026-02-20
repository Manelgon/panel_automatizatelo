-- ══════════════════════════════════════════════
-- TABLAS PARA EL GESTOR DE TAREAS (tipo Jira)
-- Ejecutar en el SQL Editor de Supabase
-- ══════════════════════════════════════════════

-- 1. Asegurar que project_tasks tiene los campos necesarios
-- (El campo description puede que ya no exista, lo añadimos si falta)
ALTER TABLE project_tasks 
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Subtareas de cada tarea
CREATE TABLE IF NOT EXISTS task_subtasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES project_tasks(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Comentarios / Actividad de cada tarea
CREATE TABLE IF NOT EXISTS task_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES project_tasks(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_id ON task_subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_to ON project_tasks(assigned_to);

-- 5. RLS (Row Level Security) - Todos los autenticados pueden ver y gestionar
ALTER TABLE task_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can manage subtasks" ON task_subtasks
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Auth users can manage comments" ON task_comments
    FOR ALL USING (auth.role() = 'authenticated');
