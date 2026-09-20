-- Durable purchase-event outbox consumed by the LAN-only kitchen kiosk.
-- The existing application is a single-household system, so household identity
-- remains the existing literal state id: 'household'.

create table if not exists public.kitchen_purchase_outbox (
  id uuid primary key default gen_random_uuid(),
  household_id text not null default 'household'
    check (household_id = 'household'),
  event_id uuid not null,
  ingredient_id text null,
  name text not null check (length(trim(name)) > 0),
  quantity numeric null check (quantity is null or quantity >= 0),
  unit text null,
  shopping_category_id text null,
  purchased_at timestamptz not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  acknowledged_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (household_id, event_id)
);

alter table public.kitchen_purchase_outbox enable row level security;
revoke all on table public.kitchen_purchase_outbox from public, anon, authenticated;
grant insert on table public.kitchen_purchase_outbox to authenticated;

drop policy if exists "authorized household may enqueue kitchen purchases"
  on public.kitchen_purchase_outbox;
create policy "authorized household may enqueue kitchen purchases"
  on public.kitchen_purchase_outbox
  for insert
  to authenticated
  with check (
    household_id = 'household'
    and created_by = auth.uid()
    and public.is_meal_planner_authorized()
  );

-- A dedicated high-entropy kiosk secret is stored only as a SHA-256 hash.
-- Provision it manually in the SQL editor after deployment; the plaintext
-- secret belongs only in the kiosk host's root-readable environment file.
create table if not exists public.kitchen_kiosk_access (
  id text primary key check (id = 'default'),
  secret_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kitchen_kiosk_access enable row level security;
revoke all on table public.kitchen_kiosk_access from public, anon, authenticated;

create or replace function public.kitchen_kiosk_secret_valid(kiosk_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    kiosk_secret is not null
    and length(kiosk_secret) >= 32
    and exists (
      select 1
      from public.kitchen_kiosk_access
      where id = 'default'
        and secret_hash = encode(extensions.digest(kiosk_secret, 'sha256'), 'hex')
    );
$$;

revoke all on function public.kitchen_kiosk_secret_valid(text) from public, anon, authenticated;

create or replace function public.fetch_kitchen_purchase_outbox(
  kiosk_secret text,
  limit_count integer default 100
)
returns table (
  id uuid,
  household_id text,
  event_id uuid,
  ingredient_id text,
  name text,
  quantity numeric,
  unit text,
  shopping_category_id text,
  purchased_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.kitchen_kiosk_secret_valid(kiosk_secret) then
    raise exception 'unauthorized kitchen kiosk';
  end if;

  return query
  select
    o.id,
    o.household_id,
    o.event_id,
    o.ingredient_id,
    o.name,
    o.quantity,
    o.unit,
    o.shopping_category_id,
    o.purchased_at
  from public.kitchen_purchase_outbox o
  where o.household_id = 'household'
    and o.acknowledged_at is null
  order by o.created_at asc
  limit greatest(1, least(coalesce(limit_count, 100), 200));
end;
$$;

create or replace function public.acknowledge_kitchen_purchase_outbox(
  kiosk_secret text,
  outbox_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  changed integer;
begin
  if not public.kitchen_kiosk_secret_valid(kiosk_secret) then
    raise exception 'unauthorized kitchen kiosk';
  end if;

  update public.kitchen_purchase_outbox
  set acknowledged_at = coalesce(acknowledged_at, now())
  where household_id = 'household'
    and id = any(coalesce(outbox_ids, array[]::uuid[]))
    and acknowledged_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.fetch_kitchen_purchase_outbox(text, integer) from public;
revoke all on function public.acknowledge_kitchen_purchase_outbox(text, uuid[]) from public;
grant execute on function public.fetch_kitchen_purchase_outbox(text, integer) to anon, authenticated;
grant execute on function public.acknowledge_kitchen_purchase_outbox(text, uuid[]) to anon, authenticated;

-- Provisioning example (run manually with a freshly generated 32+ character secret):
-- insert into public.kitchen_kiosk_access (id, secret_hash)
-- values ('default', encode(extensions.digest('REPLACE_WITH_RANDOM_SECRET', 'sha256'), 'hex'))
-- on conflict (id) do update
-- set secret_hash = excluded.secret_hash, updated_at = now();
