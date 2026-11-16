-- HMStay (self-hosted Postgres). Chạy tự động lần đầu khi container db khởi tạo volume trống.
-- Vai trò: một user có thể vừa là chủ vừa là broker -> không có cột role.
--   chủ    = sở hữu >= 1 property
--   broker = có broker_links status 'active'
--
-- Bảo mật: app kết nối bằng role `app_user` (không superuser, không BYPASSRLS) và trong MỖI
-- transaction gọi:  select set_config('app.user_id', '<uuid>', true);
-- RLS dựa vào app_uid(). Quên set => app_uid() = null => không thấy dữ liệu nào.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ───────────── Role cho ứng dụng ─────────────
do $$ begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    -- Mật khẩu thật được đặt ở 002_roles.sh từ biến môi trường
    create role app_user login password 'change-me' nosuperuser nobypassrls;
  end if;
end $$;

create function app_uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

-- ───────────── Tài khoản ─────────────
-- users: chứa mật khẩu băm, KHÔNG ai ngoài chính mình đọc được qua RLS.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- profiles: thông tin công khai trong hệ thống (tên, sđt để liên hệ)
create table profiles (
  id uuid primary key references users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

-- ───────────── Cơ sở lưu trú ─────────────
create type property_type as enum ('homestay', 'hotel');
-- room: bán theo từng phòng; whole: bán nguyên căn
create type rental_mode as enum ('room', 'whole');

create table properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  type property_type not null default 'homestay',
  rental_mode rental_mode not null default 'room',
  address text,
  description text,
  created_at timestamptz not null default now()
);

-- Đơn vị bán được: 1 phòng, hoặc nguyên căn (rental_mode = 'whole' -> chỉ 1 unit)
create table units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,
  capacity int not null default 2,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ảnh: file nằm trên đĩa/volume (hoặc R2); DB chỉ giữ khoá file.
-- unit_id null = ảnh chung của cơ sở.
create table property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  unit_id uuid references units(id) on delete cascade,
  storage_key text not null unique,      -- vd: properties/<id>/<uuid>.webp
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on property_images (property_id, sort_order);

-- ───────────── Hợp tác chủ <-> broker ─────────────
create type link_status as enum ('pending', 'active', 'rejected', 'revoked');

create table broker_links (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  broker_id uuid not null references profiles(id) on delete cascade,
  status link_status not null default 'pending',
  commission_note text,               -- thoả thuận hoa hồng / giá sàn
  created_at timestamptz not null default now(),
  unique (property_id, broker_id)
);

-- ───────────── Giá net chủ đưa cho broker ─────────────
-- broker_id null = giá mặc định cho mọi broker đã duyệt; có broker_id = giá riêng.
create table net_rates (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  broker_id uuid references profiles(id) on delete cascade,
  weekday_price bigint not null check (weekday_price >= 0),  -- VND/đêm (CN-Th5)
  weekend_price bigint not null check (weekend_price >= 0),  -- VND/đêm (Th6-Th7)
  min_sell_price bigint,                                     -- giá sàn (tuỳ chọn)
  unique nulls not distinct (unit_id, broker_id)
);

-- ───────────── Booking ─────────────
-- quoted: báo giá, chưa giữ chỗ | holding: khách đồng ý cọc, giữ chỗ có hạn
-- deposit_reported: broker báo đã nhận cọc | confirmed: chủ chốt | cancelled / expired
create type booking_status as enum
  ('quoted', 'holding', 'deposit_reported', 'confirmed', 'cancelled', 'expired');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id),
  broker_id uuid references profiles(id),       -- null = chủ tự nhập / khoá lịch
  guest_name text not null,
  guest_phone text,
  guests int,
  check_in date not null,
  check_out date not null,
  net_total bigint not null default 0,          -- chủ thấy
  sell_total bigint not null default 0,         -- giá broker bán cho khách
  deposit_amount bigint not null default 0,
  status booking_status not null default 'quoted',
  hold_expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  check (check_out > check_in),
  -- Chặn trùng lịch ở tầng DB: chỉ các trạng thái đang chiếm phòng
  exclude using gist (
    unit_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('holding', 'deposit_reported', 'confirmed'))
);
create index on bookings (unit_id, check_in);
create index on bookings (broker_id);

create table booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references bookings(id) on delete cascade,
  actor_id uuid references profiles(id),
  from_status booking_status,
  to_status booking_status not null,
  note text,
  created_at timestamptz not null default now()
);

create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, read_at);

-- ───────────── Helper cho RLS (security definer: bỏ qua RLS để tránh đệ quy) ─────────────
create function is_property_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from properties where id = pid and owner_id = app_uid());
$$;

create function is_active_broker(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from broker_links
                 where property_id = pid and broker_id = app_uid() and status = 'active');
$$;

create function unit_property(uid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select property_id from units where id = uid;
$$;

-- ───────────── RLS ─────────────
alter table users            enable row level security;
alter table profiles         enable row level security;
alter table properties       enable row level security;
alter table units            enable row level security;
alter table property_images  enable row level security;
alter table broker_links     enable row level security;
alter table net_rates        enable row level security;
alter table bookings         enable row level security;
alter table booking_events   enable row level security;
alter table notifications    enable row level security;

-- users: chỉ thấy chính mình (đăng nhập/đăng ký đi qua hàm bên dưới)
create policy users_self on users for select using (id = app_uid());

-- profiles: thấy tên/sđt người khác để liên hệ; chỉ sửa của mình
create policy profiles_read  on profiles for select using (app_uid() is not null);
create policy profiles_write on profiles for update using (id = app_uid()) with check (id = app_uid());

-- properties & ảnh: người đã đăng nhập xem được (để broker tìm cơ sở xin hợp tác); chỉ chủ sửa
create policy properties_read  on properties for select using (app_uid() is not null);
create policy properties_owner on properties for all
  using (owner_id = app_uid()) with check (owner_id = app_uid());

create policy images_read  on property_images for select using (app_uid() is not null);
create policy images_owner on property_images for all
  using (is_property_owner(property_id)) with check (is_property_owner(property_id));

-- units: chỉ chủ và broker đã duyệt
create policy units_read on units for select
  using (is_property_owner(property_id) or is_active_broker(property_id));
create policy units_owner on units for all
  using (is_property_owner(property_id)) with check (is_property_owner(property_id));

-- broker_links: broker tự xin (pending); chủ duyệt/thu hồi
create policy links_read on broker_links for select
  using (broker_id = app_uid() or is_property_owner(property_id));
create policy links_request on broker_links for insert
  with check (broker_id = app_uid() and status = 'pending');
create policy links_owner on broker_links for update
  using (is_property_owner(property_id)) with check (is_property_owner(property_id));

-- net_rates: chủ toàn quyền; broker chỉ thấy giá mặc định hoặc giá riêng của mình
create policy rates_owner on net_rates for all
  using (is_property_owner(unit_property(unit_id)))
  with check (is_property_owner(unit_property(unit_id)));
create policy rates_broker on net_rates for select
  using (is_active_broker(unit_property(unit_id))
         and (broker_id is null or broker_id = app_uid()));

-- bookings: chủ thấy hết của cơ sở mình; broker chỉ thấy của mình
create policy bookings_read on bookings for select
  using (is_property_owner(unit_property(unit_id)) or broker_id = app_uid());
create policy bookings_broker_insert on bookings for insert
  with check (broker_id = app_uid() and status = 'quoted'
              and is_active_broker(unit_property(unit_id)));
create policy bookings_owner_insert on bookings for insert
  with check (broker_id is null and is_property_owner(unit_property(unit_id)));
-- Đổi trạng thái chỉ qua advance_booking(); không cho UPDATE trực tiếp.

create policy events_read on booking_events for select
  using (exists (select 1 from bookings b where b.id = booking_id
         and (b.broker_id = app_uid() or is_property_owner(unit_property(b.unit_id)))));

create policy notif_own on notifications for select using (user_id = app_uid());
create policy notif_mark_read on notifications for update
  using (user_id = app_uid()) with check (user_id = app_uid());

-- ───────────── Đăng ký / đăng nhập (chạy trước khi biết user) ─────────────
create function register_user(p_email text, p_password_hash text, p_full_name text, p_phone text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  insert into users (email, password_hash) values (lower(p_email), p_password_hash)
  returning id into uid;
  insert into profiles (id, full_name, phone) values (uid, p_full_name, p_phone);
  return uid;
end $$;

-- App so khớp mật khẩu bằng argon2/bcrypt ở phía server
create function find_user_for_login(p_email text)
returns table (id uuid, password_hash text)
language sql stable security definer set search_path = public as $$
  select id, password_hash from users where email = lower(p_email);
$$;

-- ───────────── Lịch bận cho broker ─────────────
-- Broker không đọc được booking của broker khác, nhưng cần biết phòng nào bận.
-- Chỉ trả khoảng ngày, không lộ khách/giá.
create function unit_busy_ranges(p_unit uuid, p_from date, p_to date)
returns table (check_in date, check_out date)
language sql stable security definer set search_path = public as $$
  select b.check_in, b.check_out
  from bookings b
  where b.unit_id = p_unit
    and b.status in ('holding', 'deposit_reported', 'confirmed')
    and b.check_in < p_to and b.check_out > p_from
    and (is_property_owner(unit_property(p_unit)) or is_active_broker(unit_property(p_unit)));
$$;

-- ───────────── Chuyển trạng thái booking ─────────────
-- broker: quoted -> holding -> deposit_reported (hoặc cancelled)
-- chủ   : holding/deposit_reported -> confirmed | cancelled ; quoted, confirmed -> cancelled
create function advance_booking(p_booking uuid, p_to booking_status, p_note text default null)
returns bookings
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  old_status booking_status;
  is_owner boolean;
  is_broker boolean;
  prop uuid;
  owner_uid uuid;
  notify_uid uuid;
begin
  if app_uid() is null then raise exception 'not authenticated'; end if;

  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'booking not found'; end if;

  old_status := b.status;
  prop := unit_property(b.unit_id);
  is_owner  := is_property_owner(prop);
  is_broker := b.broker_id = app_uid();
  select owner_id into owner_uid from properties where id = prop;

  if not (
    (is_broker and ((old_status = 'quoted'  and p_to in ('holding', 'cancelled'))
                 or (old_status = 'holding' and p_to in ('deposit_reported', 'cancelled'))))
    or (is_owner and old_status in ('holding', 'deposit_reported') and p_to in ('confirmed', 'cancelled'))
    or (is_owner and old_status in ('quoted', 'confirmed') and p_to = 'cancelled')
  ) then
    raise exception 'transition % -> % not allowed', old_status, p_to;
  end if;

  -- Exclusion constraint chặn trùng lịch tại đây (lỗi 23P01)
  update bookings
     set status = p_to,
         hold_expires_at = case when p_to = 'holding' then now() + interval '12 hours'
                                else hold_expires_at end
   where id = p_booking returning * into b;

  insert into booking_events (booking_id, actor_id, from_status, to_status, note)
  values (p_booking, app_uid(), old_status, p_to, p_note);

  notify_uid := case when is_owner then b.broker_id else owner_uid end;
  if notify_uid is not null and notify_uid <> app_uid() then
    insert into notifications (user_id, booking_id, message)
    values (notify_uid, p_booking,
            format('Booking %s (nhận phòng %s): %s -> %s%s', b.guest_name, b.check_in, old_status, p_to,
                   coalesce(' – ' || nullif(p_note, ''), '')));
  end if;

  return b;
end $$;

-- Hết hạn giữ chỗ. Image postgres không có pg_cron, nên service `expirer` gọi hàm này mỗi 5 phút.
create function expire_holds() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update bookings set status = 'expired'
   where status = 'holding' and hold_expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ───────────── Quyền cho app_user ─────────────
grant usage on schema public to app_user;
grant select, insert, update, delete on
  properties, units, property_images, broker_links, net_rates to app_user;
grant select, insert on bookings, booking_events to app_user;
grant select, update on notifications, profiles to app_user;
grant select on users to app_user;
grant usage on all sequences in schema public to app_user;
-- Hàm security definer mặc định EXECUTE cho PUBLIC; thu lại rồi chỉ cấp cho app_user.
revoke all on function register_user, find_user_for_login, unit_busy_ranges,
  advance_booking, expire_holds from public;
grant execute on function register_user, find_user_for_login, unit_busy_ranges,
  advance_booking, app_uid to app_user;
-- expire_holds chỉ chủ DB (service expirer) chạy, app_user không gọi được.
