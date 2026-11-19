-- Cơ sở broker tự quản lý. Chạy trên DB đang chạy (hoặc ./update.sh):
--   docker compose exec -T db psql -U hmstay_admin -d hmstay < db/migrations/009_broker_self_managed.sql

-- ───────────── Cơ sở broker tự quản lý ─────────────
-- Tách riêng khỏi properties/units (cơ sở của chủ): broker tự nhập cơ sở, phòng (chữ tự do) và booking của mình.
-- Không liên quan đến duyệt hợp tác, không kiểm tra trùng lịch (phòng nhập tay).
create table if not exists broker_properties (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  address text,
  rooms text[] not null default '{}',   -- danh sách phòng gợi ý khi tạo booking
  created_at timestamptz not null default now()
);
create index if not exists broker_properties_broker_idx on broker_properties (broker_id);

create table if not exists broker_bookings (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references profiles(id) on delete cascade,
  property_id uuid not null references broker_properties(id) on delete cascade,
  rooms text,                            -- nhập tay, VD "2 phòng đơn"
  check_in date not null,
  check_out date not null,
  guest_name text not null,
  guest_phone text,
  nightly_price bigint not null default 0 check (nightly_price >= 0),
  total bigint not null default 0 check (total >= 0),
  deposit bigint not null default 0 check (deposit >= 0),
  note text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  check (check_out > check_in)
);
create index if not exists broker_bookings_idx on broker_bookings (broker_id, check_in);

alter table broker_properties enable row level security;
alter table broker_bookings enable row level security;
drop policy if exists bprops_own on broker_properties;
create policy bprops_own on broker_properties for all
  using (broker_id = app_uid()) with check (broker_id = app_uid());
drop policy if exists bbook_own on broker_bookings;
create policy bbook_own on broker_bookings for all
  using (broker_id = app_uid())
  with check (broker_id = app_uid()
    and exists (select 1 from broker_properties p where p.id = property_id and p.broker_id = app_uid()));
grant select, insert, update, delete on broker_properties, broker_bookings to app_user;
