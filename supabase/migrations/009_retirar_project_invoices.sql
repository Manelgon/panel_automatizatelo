-- =============================================================================
-- MIGRACIÓN 009 — RETIRAR project_invoices
-- =============================================================================
-- El baseline (000) crea `project_invoices`: el facturador antiguo, con las
-- líneas en un jsonb, numeración de texto libre, sin cliente y sin Veri*factu.
--
-- En la base de datos real esa tabla YA NO EXISTE — se retiró a mano al pasar a
-- `facturas`, y las columnas `invoice_id` de project_services,
-- project_budget_lines y project_payments se repuntaron a `facturas`. El código
-- del panel tampoco la menciona ya en ningún sitio.
--
-- Esta migración deja constancia de ese cambio para que el repositorio y la base
-- de datos digan lo mismo:
--
--   · sobre la base de datos actual  → no encuentra nada que borrar, no hace nada
--   · sobre una base de datos limpia → 000 la crea y aquí desaparece
--
-- En ambos casos el estado final es el mismo. Es re-ejecutable.
--
-- Lo que NO toca: project_budgets, project_budget_lines y project_payments
-- siguen existiendo. Su sustitución por presupuestos con líneas de verdad es la
-- fase 2 de docs/AUDITORIA-PANEL.md, y es otra conversación.
-- =============================================================================

-- 1. Fuera la tabla. CASCADE se lleva por delante políticas, índices y la FK de
--    project_payments.invoice_id si todavía apuntase aquí.
drop table if exists public.project_invoices cascade;


-- 2. Las columnas invoice_id tienen que apuntar a `facturas`.
--    Se añade la clave foránea solo si no está ya puesta.
do $$
declare
    r record;
begin
    for r in
        select * from (values
            ('project_services',     'project_services_invoice_id_fkey'),
            ('project_budget_lines', 'project_budget_lines_invoice_id_fkey'),
            ('project_payments',     'project_payments_invoice_id_fkey')
        ) as t(tabla, restriccion)
    loop
        -- ¿existe la tabla y tiene la columna?
        if to_regclass('public.' || r.tabla) is null then
            raise notice 'OMITIDA: public.% no existe', r.tabla;
            continue;
        end if;

        if not exists (
            select 1 from information_schema.columns
             where table_schema = 'public' and table_name = r.tabla and column_name = 'invoice_id'
        ) then
            raise notice 'OMITIDA: public.%.invoice_id no existe', r.tabla;
            continue;
        end if;

        -- ¿ya tiene la clave foránea?
        if exists (
            select 1 from information_schema.table_constraints
             where table_schema = 'public' and table_name = r.tabla and constraint_name = r.restriccion
        ) then
            continue;
        end if;

        execute format(
            'alter table public.%I add constraint %I
                foreign key (invoice_id) references public.facturas(id) on delete set null',
            r.tabla, r.restriccion
        );
        raise notice 'AÑADIDA: %.% -> facturas.id', r.tabla, r.restriccion;
    end loop;
end;
$$;
