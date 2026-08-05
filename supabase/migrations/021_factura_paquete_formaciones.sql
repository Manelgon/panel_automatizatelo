-- =============================================================================
-- 021 — UNA FACTURA PUEDE CUBRIR VARIAS FORMACIONES (paquete)
-- =============================================================================
-- Decisión de Manel: cuando un cliente contrata varias formaciones a la vez
-- (p. ej. alfabetización + un troncal), las formaciones se crean SEPARADAS
-- (certificados y contenidos limpios) pero se cobran JUNTAS en una única
-- factura con una línea por módulo.
--
-- El enlace vive en la línea: cada línea de factura puede apuntar a su
-- formación. `facturas.formacion_id` se mantiene como la formación principal
-- del paquete (y para las facturas de una sola formación, como siempre).
--
-- Re-ejecutable sin miedo.
-- =============================================================================

alter table public.factura_lineas
    add column if not exists formacion_id uuid references public.formaciones(id) on delete set null;

create index if not exists idx_factura_lineas_formacion
    on public.factura_lineas (formacion_id);
