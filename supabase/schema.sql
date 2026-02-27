-- =============================================
-- SCHEMA COMPLETO: Panel Automatizatelo
-- Supabase Self-Hosted
-- =============================================
-- Ejecutar este archivo en el SQL Editor de Supabase
-- para crear/recrear todas las tablas y políticas.
-- =============================================


-- =============================================
-- 1. TIPOS ENUM
-- =============================================

-- Tipo para roles de usuario
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('user', 'editor', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Tipo para estado de cuenta
DO $$ BEGIN
    CREATE TYPE public.user_status AS ENUM ('active', 'banned');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- =============================================
-- 2. TABLA: users (Perfiles de usuario)
-- =============================================
-- Vinculada a auth.users por id (uuid)

CREATE TABLE IF NOT EXISTS public.users (
    id            uuid          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email         text          NOT NULL UNIQUE,
    avatar_url    text,
    role          user_role     DEFAULT 'user',
    name          text,
    first_name    text,
    second_name   text,
    birth_date    date,
    phone_prefix  text          DEFAULT '+34',
    phone         text,
    country       text          DEFAULT 'España',
    province      text,
    city          text,
    address       text,
    status        user_status   DEFAULT 'active',
    created_at    timestamptz   DEFAULT now(),
    updated_at    timestamptz   DEFAULT now()
);

-- Si la tabla ya existe, añadir columnas nuevas (idempotente)
DO $$ BEGIN
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birth_date    date;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_prefix  text DEFAULT '+34';
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone         text;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country       text DEFAULT 'España';
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS province      text;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS city          text;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address       text;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status        user_status DEFAULT 'active';
END $$;

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_users ON public.users;
CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();


-- =============================================
-- 3. TABLA: leads (Contactos / Leads)
-- =============================================

CREATE TABLE IF NOT EXISTS public.leads (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name        text        NOT NULL,
    last_name         text        NOT NULL,
    phone             text        NOT NULL,
    email             text        NOT NULL,
    client_type       text,
    service_interest  text,
    message           text,
    privacy_accepted  boolean     DEFAULT false,
    company           text,
    status            text        DEFAULT 'pendiente', -- pendiente, contactado, ganado, perdido
    source            text,
    score             int4        DEFAULT 0,
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(score DESC);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_at_leads ON public.leads;
CREATE TRIGGER set_updated_at_leads
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- Alter leads for new schema requirements
DO $$ BEGIN
    ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ip_address text;
    ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS city text;
    ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS country text;
    ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS device_type text;
    ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
    ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status IN ('pendiente', 'contactado', 'ganado', 'perdido'));
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- =============================================
-- 4. ELIMINAR TRIGGERS PROBLEMÁTICOS
-- =============================================
-- IMPORTANTE: No usar trigger automático para crear perfil
-- en public.users desde auth.users. Lo hacemos manualmente
-- desde el frontend para incluir todos los campos.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();


-- =============================================
-- 5. POLÍTICAS RLS - TABLA users
-- =============================================
-- Activar RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas existentes
DROP POLICY IF EXISTS "Admins can update any profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can read users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can read all" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can insert" ON public.users;
DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Users can delete own" ON public.users;
DROP POLICY IF EXISTS "Users can delete own record" ON public.users;
DROP POLICY IF EXISTS "Allow read access" ON public.users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to read users" ON public.users;
DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;
DROP POLICY IF EXISTS "users_insert_authenticated" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_delete_own" ON public.users;

-- SELECT: Todos los autenticados pueden ver la lista de miembros
DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;
CREATE POLICY "users_select_authenticated" ON public.users FOR SELECT TO authenticated USING (true);

-- INSERT: Solo permitida por autenticados (el registro lo hace el panel)
DROP POLICY IF EXISTS "users_insert_authenticated" ON public.users;
CREATE POLICY "users_insert_authenticated" ON public.users FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE: Cada uno el suyo
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);

-- DELETE: Solo para dueños (simplificado sin subquery para evitar recursión)
DROP POLICY IF EXISTS "users_delete_own" ON public.users;
CREATE POLICY "users_delete_own" ON public.users FOR DELETE TO authenticated USING (auth.uid() = id);


-- =============================================
-- 6. POLÍTICAS RLS - TABLA leads
-- =============================================
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas existentes
DROP POLICY IF EXISTS "leads_select_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;
DROP POLICY IF EXISTS "leads_update_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;

-- SELECT: Solo usuarios autenticados pueden ver leads
CREATE POLICY "leads_select_authenticated"
    ON public.leads FOR SELECT
    TO authenticated
    USING (true);

-- INSERT: Formulario público puede crear leads, pero con validación anti-spam
CREATE POLICY "leads_insert_anon"
    ON public.leads FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        first_name IS NOT NULL AND length(first_name) > 0 AND length(first_name) < 100
        AND last_name IS NOT NULL AND length(last_name) > 0 AND length(last_name) < 100
        AND email IS NOT NULL AND length(email) > 3 AND length(email) < 255
        AND phone IS NOT NULL AND length(phone) > 5 AND length(phone) < 30
    );

-- UPDATE: Solo usuarios autenticados pueden editar leads
CREATE POLICY "leads_update_authenticated"
    ON public.leads FOR UPDATE
    TO authenticated
    USING (true);

-- DELETE: Solo usuarios autenticados pueden eliminar leads
CREATE POLICY "leads_delete_authenticated"
    ON public.leads FOR DELETE
    TO authenticated
    USING (true);


-- =============================================
-- 7. TABLA: service_segmentation (Cualificación del Lead)
-- =============================================
CREATE TABLE IF NOT EXISTS public.service_segmentation (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                 uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    company_size            text,       -- '1', '2-10', '11-50', '51-200', '200+'
    sector                  text,       -- 'logistica', 'retail', 'salud', 'legal', 'inmobiliaria', etc.
    automation_goal         text,
    UNIQUE(lead_id)
);

-- Añadir columnas nuevas si la tabla ya existe (idempotente)
DO $$ BEGIN
    ALTER TABLE public.service_segmentation ADD COLUMN IF NOT EXISTS sector text;
    ALTER TABLE public.service_segmentation ADD COLUMN IF NOT EXISTS company_size text;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE public.service_segmentation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_segmentation_select" ON public.service_segmentation;
CREATE POLICY "service_segmentation_select" ON public.service_segmentation FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "service_segmentation_insert" ON public.service_segmentation;
CREATE POLICY "service_segmentation_insert" ON public.service_segmentation FOR INSERT TO authenticated, anon WITH CHECK (true);
DROP POLICY IF EXISTS "service_segmentation_update" ON public.service_segmentation;
CREATE POLICY "service_segmentation_update" ON public.service_segmentation FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "service_segmentation_delete" ON public.service_segmentation;
CREATE POLICY "service_segmentation_delete" ON public.service_segmentation FOR DELETE TO authenticated USING (true);

-- Permisos
GRANT ALL ON TABLE public.service_segmentation TO anon, authenticated, service_role;

-- =============================================
-- 8. TABLA: funnel_flows (Embudos y Estados)
-- =============================================
CREATE TABLE IF NOT EXISTS public.funnel_flows (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                     uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    flow_name                   text        DEFAULT 'manual',
    current_status              text        DEFAULT 'nuevo' CHECK (current_status IN ('nuevo', 'en_proceso', 'contactado', 'convertido', 'perdido')),
    activity                    text        DEFAULT 'lead_inactivo' CHECK (activity IN ('lead_activo', 'lead_inactivo')),
    received_keyword            text,
    process_tags                jsonb       DEFAULT '[]'::jsonb,
    last_interaction_date       timestamptz DEFAULT now(),
    created_at                  timestamptz DEFAULT now(),
    updated_at                  timestamptz DEFAULT now()
);

ALTER TABLE public.funnel_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funnel_flows_select" ON public.funnel_flows;
CREATE POLICY "funnel_flows_select" ON public.funnel_flows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "funnel_flows_insert" ON public.funnel_flows;
CREATE POLICY "funnel_flows_insert" ON public.funnel_flows FOR INSERT TO authenticated, anon WITH CHECK (true);
DROP POLICY IF EXISTS "funnel_flows_update" ON public.funnel_flows;
CREATE POLICY "funnel_flows_update" ON public.funnel_flows FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "funnel_flows_delete" ON public.funnel_flows;
CREATE POLICY "funnel_flows_delete" ON public.funnel_flows FOR DELETE TO authenticated USING (true);

-- Permisos
GRANT ALL ON TABLE public.funnel_flows TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS set_updated_at_funnel_flows ON public.funnel_flows;
CREATE TRIGGER set_updated_at_funnel_flows
    BEFORE UPDATE ON public.funnel_flows
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- =============================================
-- 9. TABLA: services (Catálogo de Servicios)
-- =============================================

CREATE TABLE IF NOT EXISTS public.services (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text          NOT NULL,
    description   text,
    price         decimal(10,2),
    is_active     boolean       DEFAULT true,
    created_at    timestamptz   DEFAULT now(),
    updated_at    timestamptz   DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_services_name ON public.services(name);
CREATE INDEX IF NOT EXISTS idx_services_active ON public.services(is_active);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_at_services ON public.services;
CREATE TRIGGER set_updated_at_services
    BEFORE UPDATE ON public.services
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();


-- =============================================
-- 10. POLÍTICAS RLS - TABLA services
-- =============================================
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas existentes
DROP POLICY IF EXISTS "services_select_public" ON public.services;
DROP POLICY IF EXISTS "services_select_authenticated" ON public.services;
DROP POLICY IF EXISTS "services_all_admin" ON public.services;

-- SELECT: Cualquiera (public) puede ver los servicios
DROP POLICY IF EXISTS "services_select_public" ON public.services;
CREATE POLICY "services_select_public"
    ON public.services FOR SELECT
    TO public
    USING (true);

-- ALL: Permitir a cualquier admin gestionar servicios
DROP POLICY IF EXISTS "services_all_admin" ON public.services;
CREATE POLICY "services_all_admin"
    ON public.services FOR ALL
    TO authenticated
    USING ( (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin' );


-- =============================================
-- 11. HABILITAR REALTIME (Actualizado)
-- =============================================
-- Asegurar que las tablas están en la publicación de realtime

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'users') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'leads') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'services') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
    END IF;
END $$;


-- =============================================
-- 12. TABLAS: Gestión de Proyectos
-- =============================================

-- Tabla principal de Proyectos
CREATE TABLE IF NOT EXISTS public.projects (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text          NOT NULL,
    client        text          NOT NULL,
    status        text          DEFAULT 'Pendiente',
    description   text,
    id_alias      text          UNIQUE, -- e.g., PRJ-2024-001
    total_hours   integer       DEFAULT 0,
    actual_hours  integer       DEFAULT 0,
    lead_id       uuid          REFERENCES public.leads(id) ON DELETE SET NULL,
    created_at    timestamptz   DEFAULT now(),
    updated_at    timestamptz   DEFAULT now()
);

-- Hitos del Proyecto y Calendario
CREATE TABLE IF NOT EXISTS public.project_milestones (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    uuid          REFERENCES public.projects(id) ON DELETE CASCADE, -- Ahora puede ser NULL para hitos personales o reuniones
    assigned_to   uuid          REFERENCES public.users(id) ON DELETE SET NULL,
    title         text          NOT NULL,
    description   text,
    target_date   date,         -- Mantener por compatibilidad antigua
    start_date    timestamptz,  -- Nuevo formato para FullCalendar
    end_date      timestamptz,
    all_day       boolean       DEFAULT true,
    status        text          DEFAULT 'pending', -- pending, in_progress, completed
    created_at    timestamptz   DEFAULT now()
);

-- Migración para hacer project_id opcional y añadir nuevas columnas si la tabla ya existía
DO $$ BEGIN
    ALTER TABLE public.project_milestones ALTER COLUMN project_id DROP NOT NULL;
    ALTER TABLE public.project_milestones ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL;
    ALTER TABLE public.project_milestones ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE public.project_milestones ADD COLUMN IF NOT EXISTS start_date timestamptz;
    ALTER TABLE public.project_milestones ADD COLUMN IF NOT EXISTS end_date timestamptz;
    ALTER TABLE public.project_milestones ADD COLUMN IF NOT EXISTS all_day boolean DEFAULT true;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Tareas del Proyecto
CREATE TABLE IF NOT EXISTS public.project_tasks (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    uuid          REFERENCES public.projects(id) ON DELETE CASCADE,
    title         text          NOT NULL,
    status        text          DEFAULT 'pending', -- pending, in_progress, review, done
    priority      text          DEFAULT 'Media',   -- Crítica, Alta, Media, Baja
    assigned_to   uuid          REFERENCES public.users(id) ON DELETE SET NULL,
    description   text,
    created_at    timestamptz   DEFAULT now(),
    updated_at    timestamptz   DEFAULT now()
);

-- Migrar valores antiguos (todo → pending, doing → in_progress)
UPDATE public.project_tasks SET status = 'pending'     WHERE status = 'todo';
UPDATE public.project_tasks SET status = 'in_progress' WHERE status = 'doing';


-- Archivos del Proyecto
CREATE TABLE IF NOT EXISTS public.project_files (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    uuid          REFERENCES public.projects(id) ON DELETE CASCADE,
    name          text          NOT NULL,
    size          text,
    file_type     text,
    url           text          NOT NULL,
    created_at    timestamptz   DEFAULT now()
);

-- Miembros del Proyecto (para compartir/asignar)
CREATE TABLE IF NOT EXISTS public.project_members (
    project_id    uuid          REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id       uuid          REFERENCES public.users(id) ON DELETE CASCADE,
    role          text          DEFAULT 'viewer', -- admin, editor, viewer
    PRIMARY KEY (project_id, user_id)
);

-- Índices para Proyectos
CREATE INDEX IF NOT EXISTS idx_projects_name ON public.projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON public.project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_files_project ON public.project_files(project_id);

-- Triggers updated_at para Proyectos y Tareas
DROP TRIGGER IF EXISTS set_updated_at_projects ON public.projects;
CREATE TRIGGER set_updated_at_projects
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_project_tasks ON public.project_tasks;
CREATE TRIGGER set_updated_at_project_tasks
    BEFORE UPDATE ON public.project_tasks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Servicios vinculados a un Proyecto
CREATE TABLE IF NOT EXISTS public.project_services (
    unit_price    decimal(10,2) DEFAULT 0,
    quantity      integer       DEFAULT 1,
    iva_percent   decimal(5,2)  DEFAULT 21,
    invoice_id    uuid,
    created_at    timestamptz   DEFAULT now(),
    UNIQUE(project_id, service_id)
);

-- Agregar columnas de precio/iva si la tabla ya existe
DO $$ BEGIN
    ALTER TABLE public.project_services ADD COLUMN IF NOT EXISTS unit_price decimal(10,2) DEFAULT 0;
    ALTER TABLE public.project_services ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;
    ALTER TABLE public.project_services ADD COLUMN IF NOT EXISTS iva_percent decimal(5,2) DEFAULT 21;
    ALTER TABLE public.project_services ADD COLUMN IF NOT EXISTS invoice_id uuid;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_services_project ON public.project_services(project_id);

-- Líneas de presupuesto manuales
CREATE TABLE IF NOT EXISTS public.project_budget_lines (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    uuid          REFERENCES public.projects(id) ON DELETE CASCADE,
    description   text          NOT NULL,
    unit_price    decimal(10,2) DEFAULT 0,
    quantity      integer       DEFAULT 1,
    iva_percent   decimal(5,2)  DEFAULT 21,
    invoice_id    uuid,
    created_at    timestamptz   DEFAULT now(),
    updated_at    timestamptz   DEFAULT now()
);

-- Agregar columna invoice_id si la tabla ya existe
DO $$ BEGIN
    ALTER TABLE public.project_budget_lines ADD COLUMN IF NOT EXISTS invoice_id uuid;
END $$;

CREATE INDEX IF NOT EXISTS idx_budget_lines_project ON public.project_budget_lines(project_id);

DROP TRIGGER IF EXISTS set_updated_at_budget_lines ON public.project_budget_lines;
CREATE TRIGGER set_updated_at_budget_lines
    BEFORE UPDATE ON public.project_budget_lines
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Facturas del Proyecto
CREATE TABLE IF NOT EXISTS public.project_invoices (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid          REFERENCES public.projects(id) ON DELETE CASCADE,
    invoice_number  text          NOT NULL,
    invoice_date    date          DEFAULT CURRENT_DATE,
    subtotal        decimal(10,2) DEFAULT 0,
    iva_total       decimal(10,2) DEFAULT 0,
    total           decimal(10,2) DEFAULT 0,
    line_items      jsonb         DEFAULT '[]',
    status          text          DEFAULT 'emitida',
    created_at      timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_project ON public.project_invoices(project_id);

-- Presupuestos del Proyecto (Snapshots)
CREATE TABLE IF NOT EXISTS public.project_budgets (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid          REFERENCES public.projects(id) ON DELETE CASCADE,
    budget_number   text          NOT NULL,
    budget_date     date          DEFAULT CURRENT_DATE,
    subtotal        decimal(10,2) DEFAULT 0,
    iva_total       decimal(10,2) DEFAULT 0,
    total           decimal(10,2) DEFAULT 0,
    line_items      jsonb         DEFAULT '[]',
    status          text          DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'confirmado', 'denegado')),
    created_at      timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budgets_project ON public.project_budgets(project_id);

-- Pagos / Cobros del Proyecto
CREATE TABLE IF NOT EXISTS public.project_payments (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid          REFERENCES public.projects(id) ON DELETE CASCADE,
    invoice_id      uuid          REFERENCES public.project_invoices(id) ON DELETE SET NULL,
    payment_number  text          NOT NULL,
    payment_date    date          DEFAULT CURRENT_DATE,
    amount          decimal(10,2) NOT NULL DEFAULT 0,
    payment_method  text          NOT NULL DEFAULT 'transferencia', -- efectivo, tarjeta, transferencia, bizum, otro
    notes           text,
    created_by      uuid          REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_project ON public.project_payments(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.project_payments(invoice_id);


-- =============================================
-- 15. FUNCIONES RPC (Para crear proyectos de forma segura)
-- =============================================

-- Eliminar versiones antiguas para evitar conflictos de sobrecarga
DROP FUNCTION IF EXISTS public.create_project(text, text, text, text, int, uuid);
DROP FUNCTION IF EXISTS public.create_project(text, text, text, text, int, uuid, uuid[]);

-- =============================================
-- 15. FUNCIONES RPC (Limpieza y Creación)
-- =============================================

-- Borrar TODAS las posibles firmas anteriores para evitar el error de Schema Cache
DROP FUNCTION IF EXISTS public.create_project(text, text, text, text, int, uuid);
DROP FUNCTION IF EXISTS public.create_project(text, text, text, text, int, uuid, uuid[]);
DROP FUNCTION IF EXISTS public.create_project(text, text, text, text, int, uuid, uuid[], uuid[]);

-- Re-crear la función limpia
CREATE OR REPLACE FUNCTION create_project(
    p_name text,
    p_client text,
    p_description text,
    p_alias text,
    p_total_hours int,
    p_lead_id uuid,
    p_assigned_users uuid[] DEFAULT '{}',
    p_service_ids uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_project_id uuid;
    v_user_id uuid;
    v_assignee_id uuid;
    v_service_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    INSERT INTO public.projects (name, client, status, description, id_alias, total_hours, lead_id)
    VALUES (p_name, p_client, 'Pendiente', p_description, p_alias, p_total_hours, p_lead_id)
    RETURNING id INTO new_project_id;

    -- Creador es admin
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (new_project_id, v_user_id, 'admin') ON CONFLICT DO NOTHING;

    -- Otros miembros
    IF p_assigned_users IS NOT NULL AND array_length(p_assigned_users, 1) > 0 THEN
        FOREACH v_assignee_id IN ARRAY p_assigned_users LOOP
            INSERT INTO public.project_members (project_id, user_id, role)
            VALUES (new_project_id, v_assignee_id, 'editor') ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- Servicios
    IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
        FOREACH v_service_id IN ARRAY p_service_ids LOOP
            INSERT INTO public.project_services (project_id, service_id, unit_price, quantity, iva_percent)
            SELECT new_project_id, v_service_id, price, 1, 21
            FROM public.services
            WHERE id = v_service_id
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    IF p_lead_id IS NOT NULL THEN
        UPDATE public.leads SET status = 'ganado' WHERE id = p_lead_id;
    END IF;

    RETURN new_project_id;
END;
$$;

-- Permisos de ejecución actualizados
GRANT EXECUTE ON FUNCTION public.create_project(text, text, text, text, int, uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_project(text, text, text, text, int, uuid, uuid[], uuid[]) TO anon;

-- =============================================
-- 13. POLÍTICAS RLS - Proyectos
-- =============================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_payments ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas existentes
DROP POLICY IF EXISTS "projects_select_member" ON public.projects;
DROP POLICY IF EXISTS "projects_all_admin" ON public.projects;
DROP POLICY IF EXISTS "milestones_select_member" ON public.project_milestones;
DROP POLICY IF EXISTS "milestones_all_admin" ON public.project_milestones;
DROP POLICY IF EXISTS "tasks_select_member" ON public.project_tasks;
DROP POLICY IF EXISTS "tasks_all_admin" ON public.project_tasks;
DROP POLICY IF EXISTS "files_select_member" ON public.project_files;
DROP POLICY IF EXISTS "files_all_admin" ON public.project_files;

-- SELECT Projects: Miembros o Administradores Globales
DROP POLICY IF EXISTS "projects_select_member" ON public.projects;
CREATE POLICY "projects_select_member"
    ON public.projects FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = id AND pm.user_id = auth.uid()) 
        OR 
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
    );

-- ALL Projects: Admins
DROP POLICY IF EXISTS "projects_all_admin" ON public.projects;
CREATE POLICY "projects_all_admin"
    ON public.projects FOR ALL
    TO authenticated
    USING ( (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin' );

-- INSERT Projects: Cualquiera logueado
DROP POLICY IF EXISTS "projects_insert_authenticated" ON public.projects;
CREATE POLICY "projects_insert_authenticated"
    ON public.projects FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Miembros del Proyecto
DROP POLICY IF EXISTS "members_select" ON public.project_members;
CREATE POLICY "members_select" ON public.project_members FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "members_insert_self" ON public.project_members;
CREATE POLICY "members_insert_self" ON public.project_members FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "members_all_admin" ON public.project_members;
CREATE POLICY "members_all_admin" ON public.project_members FOR ALL TO authenticated USING (true);

-- Hitos, Tareas, Archivos y Servicios del Proyecto (Simplificado para evitar errores)
DROP POLICY IF EXISTS "milestones_select_member" ON public.project_milestones;
CREATE POLICY "milestones_select_member" ON public.project_milestones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "milestones_all_admin" ON public.project_milestones;
CREATE POLICY "milestones_all_admin" ON public.project_milestones FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "tasks_select_member" ON public.project_tasks;
CREATE POLICY "tasks_select_member" ON public.project_tasks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tasks_all_admin" ON public.project_tasks;
CREATE POLICY "tasks_all_admin" ON public.project_tasks FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "files_select_member" ON public.project_files;
CREATE POLICY "files_select_member" ON public.project_files FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "files_all_admin" ON public.project_files;
CREATE POLICY "files_all_admin" ON public.project_files FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "project_services_select" ON public.project_services;
CREATE POLICY "project_services_select" ON public.project_services FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "project_services_all" ON public.project_services;
CREATE POLICY "project_services_all" ON public.project_services FOR ALL TO authenticated USING (true);

-- Políticas para project_budget_lines
DROP POLICY IF EXISTS "budget_lines_select" ON public.project_budget_lines;
CREATE POLICY "budget_lines_select" ON public.project_budget_lines FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "budget_lines_all" ON public.project_budget_lines;
CREATE POLICY "budget_lines_all" ON public.project_budget_lines FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "project_budgets_select" ON public.project_budgets;
CREATE POLICY "project_budgets_select" ON public.project_budgets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "project_budgets_all" ON public.project_budgets;
CREATE POLICY "project_budgets_all" ON public.project_budgets FOR ALL TO authenticated USING (true);

-- Políticas para project_invoices
DROP POLICY IF EXISTS "invoices_select" ON public.project_invoices;
CREATE POLICY "invoices_select" ON public.project_invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "invoices_all" ON public.project_invoices;
CREATE POLICY "invoices_all" ON public.project_invoices FOR ALL TO authenticated USING (true);

-- Políticas para project_payments
DROP POLICY IF EXISTS "payments_select" ON public.project_payments;
CREATE POLICY "payments_select" ON public.project_payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "payments_all" ON public.project_payments;
CREATE POLICY "payments_all" ON public.project_payments FOR ALL TO authenticated USING (true);

-- Políticas para project_members
-- Limpiar políticas existentes de miembros
DROP POLICY IF EXISTS "members_select" ON public.project_members;
DROP POLICY IF EXISTS "members_insert_self" ON public.project_members;
DROP POLICY IF EXISTS "members_all_admin" ON public.project_members;

-- SELECT: Ver miembros si eres la propia persona o admin
CREATE POLICY "members_select" 
    ON public.project_members FOR SELECT 
    TO authenticated 
    USING (
        auth.uid() = user_id OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- INSERT: Permitir auto-asignación al crear proyecto
CREATE POLICY "members_insert_self" 
    ON public.project_members FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = user_id);

-- ALL: Admin gestiona todo
CREATE POLICY "members_all_admin" 
    ON public.project_members FOR ALL 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );


-- =============================================
-- 14. HABILITAR REALTIME (Actualizado v2)
-- =============================================

DO $$ 
BEGIN
    -- Tablas base
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'users') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'leads') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'services') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'service_segmentation') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.service_segmentation;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'funnel_flows') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.funnel_flows;
    END IF;
    
    -- Nuevas tablas de proyectos
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'projects') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'project_milestones') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.project_milestones;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'project_tasks') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tasks;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'project_services') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.project_services;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'project_budget_lines') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.project_budget_lines;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'project_invoices') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.project_invoices;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'project_payments') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.project_payments;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'project_budgets') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.project_budgets;
    END IF;
END $$;


-- Eliminar bloques antiguos y obsoletos
-- (Ya movidos a la seccion 15 y simplificados)

-- =============================================
-- 16. GRANT PERMISOS GLOBALES
-- =============================================
-- RLS controla QUÉ filas, pero GRANT controla EL ACCESO a la tabla.
GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- Permisos para Usuarios y Servicios (Vital para que aparezcan en listas)
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.services TO authenticated;
GRANT SELECT ON public.leads TO authenticated;

-- Permisos para Proyectos y sus componentes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_budget_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_budgets TO authenticated;

-- Función RPC create_project (8 parámetros)
GRANT EXECUTE ON FUNCTION public.create_project(text, text, text, text, int, uuid, uuid[], uuid[]) TO authenticated;
-- REMOVED: anon should NOT be able to create projects
-- GRANT EXECUTE ON FUNCTION public.create_project(...) TO anon;

-- Índice para búsquedas por lead_id
CREATE INDEX IF NOT EXISTS idx_projects_lead_id ON public.projects(lead_id);


-- =============================================
-- 18. GESTOR DE TAREAS — Subtareas y Comentarios
-- =============================================

-- Asegurar que project_tasks tiene los campos extendidos
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Subtareas de cada tarea (estilo Jira)
CREATE TABLE IF NOT EXISTS public.task_subtasks (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id    UUID        REFERENCES project_tasks(id) ON DELETE CASCADE NOT NULL,
    title      TEXT        NOT NULL,
    status     TEXT        DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentarios / Actividad de cada tarea
CREATE TABLE IF NOT EXISTS public.task_comments (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id    UUID        REFERENCES project_tasks(id) ON DELETE CASCADE NOT NULL,
    user_id    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_id   ON public.task_subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id   ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON public.project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned   ON public.project_tasks(assigned_to);

-- RLS
ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Auth users can manage subtasks" ON public.task_subtasks
        FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Auth users can manage comments" ON public.task_comments
        FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_subtasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments  TO authenticated;

-- =============================================
-- 19. HISTORIAL DE ESTADOS DE TAREAS
-- =============================================
-- Registra cada transición de estado con timestamp
-- Permite calcular: tiempo en cada estado, tiempo total hasta done, lead time, etc.

CREATE TABLE IF NOT EXISTS public.task_status_logs (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id     UUID        REFERENCES public.project_tasks(id) ON DELETE CASCADE NOT NULL,
    status      TEXT        NOT NULL,           -- nuevo estado al que transicionó
    changed_at  TIMESTAMPTZ DEFAULT NOW(),
    changed_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_status_logs_task ON public.task_status_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_status_logs_time ON public.task_status_logs(changed_at);

-- RLS
ALTER TABLE public.task_status_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Auth users can manage status logs" ON public.task_status_logs
        FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT ON public.task_status_logs TO authenticated;

-- =============================================
-- 20. SPRINTS (iteraciones tipo Jira)
-- =============================================
-- Los sprints son períodos de trabajo acotados (1-2 semanas).
-- Las tareas se asignan a sprints; los hitos son eventos de fecha independientes.

CREATE TABLE IF NOT EXISTS public.project_sprints (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id  UUID        REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    name        TEXT        NOT NULL,                       -- "Sprint 1", "MVP", etc.
    goal        TEXT,                                       -- objetivo del sprint
    start_date  DATE,
    end_date    DATE,
    status      TEXT        DEFAULT 'planning',             -- planning | active | completed
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Vincular tareas a sprints (NULL = Backlog)
ALTER TABLE public.project_tasks
    ADD COLUMN IF NOT EXISTS sprint_id UUID REFERENCES public.project_sprints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_sprints_project ON public.project_sprints(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_sprint    ON public.project_tasks(sprint_id);

-- RLS
ALTER TABLE public.project_sprints ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Auth users can manage sprints" ON public.project_sprints
        FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_sprints TO authenticated;


-- =============================================
-- 21. SECURITY HARDENING — Revocar accesos anónimos
-- =============================================
-- Solo el INSERT de leads debe estar accesible para anon
-- (formulario público del sitio web). Todo lo demás: solo authenticated.

REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.services FROM anon;
REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.project_members FROM anon;
REVOKE ALL ON public.project_milestones FROM anon;
REVOKE ALL ON public.project_tasks FROM anon;
REVOKE ALL ON public.project_files FROM anon;
REVOKE ALL ON public.project_services FROM anon;
REVOKE ALL ON public.project_budget_lines FROM anon;
REVOKE ALL ON public.project_invoices FROM anon;
REVOKE ALL ON public.project_payments FROM anon;
REVOKE ALL ON public.project_budgets FROM anon;
REVOKE ALL ON public.project_sprints FROM anon;
REVOKE ALL ON public.task_subtasks FROM anon;
REVOKE ALL ON public.task_comments FROM anon;
REVOKE ALL ON public.task_status_logs FROM anon;

-- Mantener acceso mínimo para anon:
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT ON public.leads TO anon;

-- Activar RLS en TODAS las tablas públicas (por si alguna se escapó)
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
    END LOOP;
END $$;


-- =============================================
-- 22. VERIFICACIÓN
-- =============================================
-- Ejecutar después de todo lo anterior para verificar:

-- Ver tablas creadas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Ver políticas activas
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public';

-- Ver GRANTs para anon (debería ser mínimo: solo INSERT leads)
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'anon' AND table_schema = 'public'
ORDER BY table_name;

-- Ver triggers (debe estar vacío para auth.users)
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'auth';

