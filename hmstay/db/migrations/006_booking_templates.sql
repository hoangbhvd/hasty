-- Mẫu xác nhận booking. Chạy trên DB đang chạy:
--   docker compose exec -T db psql -U hmstay_admin -d hmstay < db/migrations/006_booking_templates.sql

-- ───────────── Mẫu xác nhận booking (do người dùng tự tạo) ─────────────
-- html/css lấy từ trình soạn thảo kéo thả; project là JSON của trình soạn thảo để sửa lại sau.
-- Mỗi người chỉ thấy mẫu của mình.
create table booking_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  html text not null default '' check (length(html) < 3000000),
  css text not null default '' check (length(css) < 1000000),
  project jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on booking_templates (owner_id, updated_at desc);
alter table booking_templates enable row level security;
create policy templates_own on booking_templates for all
  using (owner_id = app_uid()) with check (owner_id = app_uid());
grant select, insert, update, delete on booking_templates to app_user;
