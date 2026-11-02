-- Base de datos de GeoReyno en Supabase: perfiles, resultados y clasificación.
-- Cómo usarlo: Supabase → tu proyecto → SQL Editor → New query → pega este archivo → Run.
-- Se puede ejecutar una sola vez en un proyecto nuevo.

-- Perfiles públicos (solo el nombre de usuario; el correo queda en auth.users, que no es público).
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null check (char_length(username) between 3 and 20),
  created_at timestamptz not null default now()
);
create unique index profiles_username_unico on public.profiles (lower(username));

-- Un resultado por usuario, modo y día.
create table public.results (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('street', 'municipio', 'palabra', 'escudos', 'pregunta')),
  day date not null,
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and total <= 25000 and score <= total),
  label text check (char_length(label) <= 30),
  grid text check (char_length(grid) <= 80),
  created_at timestamptz not null default now(),
  unique (user_id, mode, day)
);
create index results_dia on public.results (day, mode);

alter table public.profiles enable row level security;
alter table public.results enable row level security;

-- Todo el mundo puede ver nombres y resultados (para la clasificación).
create policy "perfiles visibles" on public.profiles for select using (true);
create policy "resultados visibles" on public.results for select using (true);
-- Cada usuario solo puede cambiar su nombre y subir sus propios resultados, y solo de fechas
-- cercanas a hoy (no se pueden inventar partidas antiguas ni futuras). No se pueden editar ni borrar.
create policy "editar mi perfil" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "subir mis resultados" on public.results for insert
  with check (auth.uid() = user_id and day between current_date - 2 and current_date + 1);

-- Al registrarse se crea el perfil con el nombre elegido (si está cogido, se le añade un número).
create function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  nombre text;
  n int := 0;
begin
  base := left(coalesce(nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ_.-]', '', 'g'), ''), 'jugador'), 16);
  if char_length(base) < 3 then base := base || '_nv'; end if;
  nombre := base;
  while exists (select 1 from profiles where lower(username) = lower(nombre)) loop
    n := n + 1;
    nombre := base || n;
  end loop;
  insert into profiles (id, username) values (new.id, nombre);
  return new;
end $$;

create trigger al_registrarse after insert on auth.users
  for each row execute function public.crear_perfil();

-- Clasificación. p_mode = modo concreto (suma sus puntos) o null (todos los modos, con cada
-- partida normalizada a 1000 puntos para que valgan lo mismo). Desde la fecha p_desde.
create function public.ranking(p_mode text default null, p_desde date default current_date - 6)
returns table (username text, puntos bigint, partidas bigint)
language sql stable security definer set search_path = public as $$
  select p.username,
         sum(case when p_mode is null then round(1000.0 * r.score / r.total) else r.score end)::bigint as puntos,
         count(*) as partidas
  from results r
  join profiles p on p.id = r.user_id
  where r.day >= p_desde and (p_mode is null or r.mode = p_mode)
  group by p.username
  order by puntos desc, partidas asc
  limit 50
$$;
grant execute on function public.ranking(text, date) to anon, authenticated;

-- Borrar mi cuenta (derecho de supresión): borra el usuario y, en cascada, perfil y resultados.
create function public.borrar_mi_cuenta() returns void
language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;
revoke execute on function public.borrar_mi_cuenta() from anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;
