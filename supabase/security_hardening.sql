-- =============================================
-- SECURITY HARDENING - Panel Automatizatelo
-- =============================================
-- ⚠️ EJECUTAR EN EL SQL EDITOR DE SUPABASE
-- Fecha: 2026-02-20
-- =============================================

-- =============================================
-- 1. REVOCAR ACCESO ANÓNIMO A SERVICIOS
-- =============================================
-- PROBLEMA: Cualquier persona sin login podía ver todos tus servicios y precios
-- SOLUCIÓN: Solo usuarios autenticados pueden ver servicios

-- Eliminar la política que permite acceso anónimo
DROP POLICY IF EXISTS "services_select_public" ON public.services;

-- Crear nueva política solo para autenticados
CREATE POLICY "services_select_authenticated"
    ON public.services FOR SELECT
    TO authenticated
    USING (true);

-- Revocar el GRANT de SELECT para anon en services
REVOKE SELECT ON public.services FROM anon;


-- =============================================
-- 2. PROTEGER LA FUNCIÓN create_project
-- =============================================
-- PROBLEMA: Un usuario anónimo podía ejecutar create_project y crear proyectos
-- SOLUCIÓN: Revocar el permiso de ejecución para anon

REVOKE EXECUTE ON FUNCTION public.create_project(text, text, text, text, int, uuid, uuid[], uuid[]) FROM anon;


-- =============================================
-- 3. RESTRINGIR INSERT DE LEADS (Anti-Spam)
-- =============================================
-- NOTA: Mantenemos el INSERT para anon porque es necesario para el formulario
-- público del sitio web. PERO añadimos restricciones:

-- La política de insert para anon ya existe, la mantenemos pero
-- el formulario web ya tiene rate limiting (cooldown de 5 min en frontend).
-- Para protección extra en backend, podemos limitar campos:

-- Política que solo permite insertar campos específicos desde anon
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;
CREATE POLICY "leads_insert_anon"
    ON public.leads FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        -- Campos obligatorios deben tener contenido
        first_name IS NOT NULL AND length(first_name) > 0 AND length(first_name) < 100
        AND last_name IS NOT NULL AND length(last_name) > 0 AND length(last_name) < 100
        AND email IS NOT NULL AND length(email) > 3 AND length(email) < 255
        AND phone IS NOT NULL AND length(phone) > 5 AND length(phone) < 30
        -- Score no puede ser manipulado desde fuera
        AND (score IS NULL OR score = 0)
        -- Status no puede ser manipulado desde fuera
        AND (status IS NULL OR status = 'pendiente')
    );


-- =============================================
-- 4. VERIFICAR QUE TODAS LAS TABLAS TIENEN RLS
-- =============================================
-- Verifica que RLS está activo en TODAS las tablas

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
-- 5. REVOCAR ACCESOS ANÓNIMOS INNECESARIOS
-- =============================================
-- Aseguramos que anon NO tiene acceso a ninguna tabla sensible

REVOKE ALL ON public.users FROM anon;
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

-- Mantener solo INSERT de leads para anon (formulario web) 
-- y USAGE en schema (necesario para que la conexión funcione)
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT ON public.leads TO anon;


-- =============================================
-- 6. VERIFICACIÓN FINAL
-- =============================================

-- Ver todas las políticas RLS activas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Ver GRANTs para anon (debería ser mínimo)
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'anon' AND table_schema = 'public'
ORDER BY table_name;

-- Ver GRANTs para authenticated
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'authenticated' AND table_schema = 'public'
ORDER BY table_name;
