-- Circles a user owns
create table if not exists circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  recitation text not null,
  target_count int,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now()
);

-- Memberships (who is in which circle)
create table if not exists circle_memberships (
  circle_id uuid not null references circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz default now(),
  primary key (circle_id, user_id)
);

-- Zikr entries (tap/manual)
create table if not exists zikr_entries (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  count int not null check (count > 0),
  method text default 'tap',
  noted_at timestamptz default now()
);

-- Indexes
create index if not exists idx_circles_owner on circles(owner_id);
create index if not exists idx_entries_circle on zikr_entries(circle_id);
create index if not exists idx_entries_user on zikr_entries(user_id);

-- RLS
alter table circles enable row level security;
alter table circle_memberships enable row level security;
alter table zikr_entries enable row level security;

-- Policies
create policy "owner_full_access" on circles
for all using (auth.uid() = owner_id);

create policy "members_read_circles" on circles
for select using (
  exists (
    select 1 from circle_memberships m
    where m.circle_id = circles.id and m.user_id = auth.uid()
  )
);

create policy "membership_select" on circle_memberships
for select using (
  user_id = auth.uid()
  or exists (select 1 from circles c where c.id = circle_memberships.circle_id and c.owner_id = auth.uid())
);

create policy "membership_self_insert" on circle_memberships
for insert with check (user_id = auth.uid());

create policy "entries_insert_self" on zikr_entries
for insert with check (user_id = auth.uid());

create policy "entries_read_self_or_circle" on zikr_entries
for select using (
  user_id = auth.uid()
  or exists (
    select 1 from circle_memberships m
    where m.circle_id = zikr_entries.circle_id and m.user_id = auth.uid()
  )
);
