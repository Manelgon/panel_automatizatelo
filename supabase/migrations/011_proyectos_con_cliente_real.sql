-- =============================================================================
-- MIGRACIÓN 011 — FASE 2 (B): LOS PROYECTOS PASAN A TENER CLIENTE DE VERDAD
-- =============================================================================
-- La 010 rellenó `projects.client_id` de los proyectos que se pudieron casar por
-- nombre. Aquí se corta el grifo del texto libre: `create_project` deja de
-- recibir un nombre escrito a mano y pasa a recibir el cliente.
--
-- Sin esto, cada proyecto nuevo vuelve a nacer sin client_id y sin poder
-- facturarse. Ver docs/AUDITORIA-PANEL.md §4.2.
--
-- Es re-ejecutable.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. `projects.client` deja de ser obligatoria
-- -----------------------------------------------------------------------------
-- Se queda como etiqueta legible (aparece en listados y PDF sin tener que
-- hacer join), pero la verdad pasa a ser client_id. La rellena el trigger de
-- abajo a partir del cliente, así que ya no puede desincronizarse.
-- -----------------------------------------------------------------------------
alter table public.projects alter column client drop not null;


-- -----------------------------------------------------------------------------
-- 2. La etiqueta se mantiene sola
-- -----------------------------------------------------------------------------
create or replace function public.projects_sincronizar_etiqueta_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_nombre text;
begin
    if new.client_id is null then
        return new;
    end if;

    select coalesce(
               nullif(trim(c.company_name), ''),
               trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
           )
      into v_nombre
      from public.clients c
     where c.id = new.client_id;

    if v_nombre is not null and trim(v_nombre) <> '' then
        new.client := v_nombre;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_projects_etiqueta_cliente on public.projects;
create trigger trg_projects_etiqueta_cliente
    before insert or update of client_id on public.projects
    for each row
    execute function public.projects_sincronizar_etiqueta_cliente();

-- Poner al día las etiquetas de lo que ya existe
update public.projects p
   set client_id = p.client_id     -- dispara el trigger sin cambiar nada
 where p.client_id is not null;


-- -----------------------------------------------------------------------------
-- 3. create_project pasa a recibir el cliente, no su nombre
-- -----------------------------------------------------------------------------
-- La versión anterior recibía `p_client text` y nunca escribía client_id, que es
-- lo que exige facturar. Se sustituye por completo.
--
-- Sigue haciendo lo mismo que antes desde el punto de vista del panel: crea el
-- proyecto, apunta a los miembros del equipo y engancha los servicios del
-- catálogo, todo en la misma transacción.
-- -----------------------------------------------------------------------------
drop function if exists public.create_project(text, text, text, text, integer, uuid, uuid[], uuid[]);
drop function if exists public.create_project(text, uuid, text, text, integer, uuid, uuid[], uuid[]);

create or replace function public.create_project(
    p_name           text,
    p_client_id      uuid,
    p_description    text    default '',
    p_alias          text    default null,
    p_total_hours    integer default 0,
    p_lead_id        uuid    default null,
    p_assigned_users uuid[]  default '{}',
    p_service_ids    uuid[]  default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_project_id uuid;
    v_alias      text;
begin
    if not public.is_admin() then
        raise exception 'Se requiere rol de administrador para crear proyectos';
    end if;

    if p_name is null or trim(p_name) = '' then
        raise exception 'El proyecto necesita un nombre';
    end if;

    if p_client_id is null then
        raise exception 'El proyecto necesita un cliente. Sin cliente no se puede facturar.';
    end if;

    if not exists (select 1 from public.clients where id = p_client_id) then
        raise exception 'El cliente indicado no existe';
    end if;

    -- Alias: el que venga, o uno generado. Si choca, se reintenta.
    v_alias := nullif(trim(coalesce(p_alias, '')), '');
    if v_alias is null then
        v_alias := 'PR-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    end if;
    while exists (select 1 from public.projects where id_alias = v_alias) loop
        v_alias := 'PR-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    end loop;

    insert into public.projects (name, client_id, description, id_alias, total_hours, lead_id, status)
    values (trim(p_name), p_client_id, coalesce(p_description, ''), v_alias,
            coalesce(p_total_hours, 0), p_lead_id, 'Pendiente')
    returning id into v_project_id;

    -- Equipo asignado. El propio creador entra siempre.
    insert into public.project_members (project_id, user_id, role)
    select v_project_id, u, 'editor'
      from unnest(coalesce(p_assigned_users, '{}')) as u
     where u is not null
    on conflict (project_id, user_id) do nothing;

    if auth.uid() is not null then
        insert into public.project_members (project_id, user_id, role)
        values (v_project_id, auth.uid(), 'admin')
        on conflict (project_id, user_id) do nothing;
    end if;

    -- Servicios del catálogo, con su precio actual congelado en la línea
    insert into public.project_services (project_id, service_id, unit_price, quantity, iva_percent)
    select v_project_id, s.id, coalesce(s.price, 0), 1, 21
      from public.services s
     where s.id = any (coalesce(p_service_ids, '{}'));

    return v_project_id;
end;
$$;

grant execute on function public.create_project(text, uuid, text, text, integer, uuid, uuid[], uuid[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. ¿Se puede exigir ya que todo proyecto tenga cliente?
-- -----------------------------------------------------------------------------
-- Solo si no queda ninguno suelto. Si quedan, se listan y no se fuerza nada:
-- asígnalos desde el panel y vuelve a lanzar esta migración.
-- -----------------------------------------------------------------------------
do $$
declare
    v_huerfanos integer;
    r record;
begin
    select count(*) into v_huerfanos from public.projects where client_id is null;

    if v_huerfanos = 0 then
        alter table public.projects alter column client_id set not null;
        raise notice 'client_id es ahora obligatorio en projects.';
    else
        raise notice '--------------------------------------------------------';
        raise notice 'NO se fuerza client_id obligatorio: hay % proyectos sin cliente.', v_huerfanos;
        raise notice 'Asignaselo desde el panel y vuelve a lanzar esta migracion.';
        for r in select name, client from public.projects where client_id is null order by name loop
            raise notice '  · % — cliente escrito: "%"', r.name, coalesce(r.client, '(vacio)');
        end loop;
        raise notice '--------------------------------------------------------';
    end if;
end;
$$;
