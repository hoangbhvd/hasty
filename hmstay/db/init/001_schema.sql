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
  password_changed_at timestamptz not null default now(),  -- phiên cấp trước mốc này bị vô hiệu
  email_notifications boolean not null default true,
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
  emailed_at timestamptz,          -- đã (đang) gửi email
  email_attempts int not null default 0,
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

-- Nhãn trạng thái tiếng Việt cho thông báo
create function status_label(s booking_status) returns text
language sql immutable as $$
  select case s when 'quoted' then 'Báo giá' when 'holding' then 'Đang giữ chỗ'
                when 'deposit_reported' then 'Đã báo cọc' when 'confirmed' then 'Đã chốt'
                when 'cancelled' then 'Đã huỷ' else 'Hết hạn giữ' end;
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
  ctx text;
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
    select p.name || ' – ' || u.name into ctx
      from units u join properties p on p.id = u.property_id where u.id = b.unit_id;
    insert into notifications (user_id, booking_id, message)
    values (notify_uid, p_booking,
            format('%s (%s), nhận phòng %s: %s → %s%s', b.guest_name, ctx, b.check_in,
                   status_label(old_status), status_label(p_to),
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

-- ───────────── Quên mật khẩu ─────────────
-- Token ngẫu nhiên gửi qua email; DB chỉ lưu băm SHA-256. Bảng không có policy và không cấp
-- quyền cho app_user: chỉ truy cập qua 2 hàm security definer bên dưới.
create table password_resets (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on password_resets (user_id, created_at);
alter table password_resets enable row level security;

-- Trả về email + tên nếu tạo được token; null nếu không có user hoặc đã yêu cầu quá 3 lần/giờ.
create function create_password_reset(p_email text, p_token_hash text)
returns table (email text, full_name text)
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from users where users.email = lower(p_email);
  if uid is null then return; end if;
  if (select count(*) from password_resets where user_id = uid and created_at > now() - interval '1 hour') >= 3 then
    return;
  end if;
  update password_resets set used_at = now() where user_id = uid and used_at is null;  -- vô hiệu token cũ
  insert into password_resets (user_id, token_hash, expires_at) values (uid, p_token_hash, now() + interval '1 hour');
  return query select u.email, p.full_name from users u join profiles p on p.id = u.id where u.id = uid;
end $$;

-- Đặt mật khẩu mới nếu token còn hạn và chưa dùng. Trả về true/false.
create function consume_password_reset(p_token_hash text, p_new_password_hash text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare r password_resets;
begin
  select * into r from password_resets
   where token_hash = p_token_hash and used_at is null and expires_at > now() for update;
  if not found then return false; end if;
  update users set password_hash = p_new_password_hash, password_changed_at = now() where id = r.user_id;
  update password_resets set used_at = now() where user_id = r.user_id and used_at is null;
  return true;
end $$;

revoke all on function create_password_reset, consume_password_reset from public;
grant execute on function create_password_reset, consume_password_reset to app_user;

-- Phiên (JWT) còn hiệu lực nếu user còn tồn tại và được cấp (iat, tính bằng giây) không trước lần đổi mật khẩu gần nhất.
create function session_valid(p_uid uuid, p_iat bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users
                 where id = p_uid and date_trunc('second', password_changed_at) <= to_timestamp(p_iat));
$$;
revoke all on function session_valid from public;
grant execute on function session_valid to app_user;

-- ───────────── Thông báo qua email ─────────────
-- App gọi claim_notification_emails() sau mỗi thay đổi booking: "nhận" tối đa p_limit thông báo
-- chưa gửi (trong 2 ngày, tối đa 3 lần thử, user bật email) và trả về địa chỉ + nội dung.
-- Gửi lỗi thì release_notification_email() trả lại để lần sau thử tiếp.
create function claim_notification_emails(p_limit int default 20)
returns table (id bigint, email text, full_name text, message text, link_role text)
language sql security definer set search_path = public as $$
  with picked as (
    select n.id from notifications n join users u on u.id = n.user_id
     where n.emailed_at is null and n.email_attempts < 3
       and n.created_at > now() - interval '2 days' and u.email_notifications
     order by n.id limit p_limit for update of n skip locked
  ), upd as (
    update notifications n set emailed_at = now(), email_attempts = n.email_attempts + 1
      from picked where n.id = picked.id
    returning n.id, n.user_id, n.message, n.booking_id
  )
  select upd.id, u.email, p.full_name, upd.message,
         case when exists (select 1 from bookings b
                             join units un on un.id = b.unit_id
                             join properties pr on pr.id = un.property_id
                            where b.id = upd.booking_id and pr.owner_id = upd.user_id)
              then 'owner' else 'broker' end
    from upd join users u on u.id = upd.user_id join profiles p on p.id = upd.user_id;
$$;

create function release_notification_email(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update notifications set emailed_at = null where id = p_id;
$$;

create function set_email_notifications(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update users set email_notifications = p_on where id = app_uid();
$$;

revoke all on function claim_notification_emails, release_notification_email, set_email_notifications from public;
grant execute on function claim_notification_emails, release_notification_email, set_email_notifications to app_user;

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

-- ───────────── Hồ sơ cơ sở, giá theo mùa (migration 007) ─────────────
alter table properties
  add column area text,                                   -- khu vực / thành phố
  add column amenities text[] not null default '{}',      -- mã tiện nghi (xem lib/property.ts)
  add column checkin_time text not null default '14:00',
  add column checkout_time text not null default '12:00',
  add column cancel_policy text,
  add column house_rules text;

alter table units add column min_nights int not null default 1 check (min_nights between 1 and 60);

-- Giá net theo mùa/ngày lễ: đêm nào nằm trong [start_date, end_date] thì dùng giá này thay giá mặc định.
-- Nhiều mùa chồng nhau: mùa tạo sau thắng. Giá sàn vẫn lấy từ net_rates.
create table rate_seasons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  name text not null default '',
  start_date date not null,
  end_date date not null,
  weekday_price bigint not null check (weekday_price >= 0),
  weekend_price bigint not null check (weekend_price >= 0),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on rate_seasons (unit_id, start_date);
alter table rate_seasons enable row level security;
create policy seasons_owner on rate_seasons for all
  using (is_property_owner(unit_property(unit_id))) with check (is_property_owner(unit_property(unit_id)));
create policy seasons_broker on rate_seasons for select
  using (is_active_broker(unit_property(unit_id)));
grant select, insert, update, delete on rate_seasons to app_user;

-- ───────────── Xác minh email khi đăng ký ─────────────
-- Tài khoản mới chưa đăng nhập được cho đến khi bấm liên kết trong email (token ngẫu nhiên, DB chỉ lưu băm).
alter table users add column if not exists email_verified_at timestamptz;
update users set email_verified_at = coalesce(email_verified_at, created_at);  -- tài khoản có sẵn coi như đã xác minh

create table if not exists email_verifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_verifications_user_idx on email_verifications (user_id, created_at);
alter table email_verifications enable row level security;

-- Đăng ký: email đã có nhưng CHƯA xác minh thì ghi đè (tránh ai đó giữ chỗ email của người khác); đã xác minh thì lỗi trùng.
create or replace function register_user(p_email text, p_password_hash text, p_full_name text, p_phone text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid; verified timestamptz;
begin
  select id, email_verified_at into uid, verified from users where email = lower(p_email) for update;
  if uid is not null then
    if verified is not null then
      raise exception 'duplicate key value violates unique constraint "users_email_key"' using errcode = '23505';
    end if;
    update users set password_hash = p_password_hash, password_changed_at = now() where id = uid;
    update profiles set full_name = p_full_name, phone = p_phone where id = uid;
    return uid;
  end if;
  insert into users (email, password_hash) values (lower(p_email), p_password_hash) returning id into uid;
  insert into profiles (id, full_name, phone) values (uid, p_full_name, p_phone);
  return uid;
end $$;

drop function if exists find_user_for_login(text);
create function find_user_for_login(p_email text)
returns table (id uuid, password_hash text, verified boolean)
language sql stable security definer set search_path = public as $$
  select id, password_hash, email_verified_at is not null from users where email = lower(p_email);
$$;

-- Trả về email + tên nếu tạo được token; null nếu không có user, đã xác minh, hoặc đã yêu cầu quá 3 lần/giờ.
create or replace function create_email_verification(p_email text, p_token_hash text)
returns table (email text, full_name text)
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from users where users.email = lower(p_email) and email_verified_at is null;
  if uid is null then return; end if;
  if (select count(*) from email_verifications where user_id = uid and created_at > now() - interval '1 hour') >= 3 then
    return;
  end if;
  update email_verifications set used_at = now() where user_id = uid and used_at is null;
  insert into email_verifications (user_id, token_hash, expires_at) values (uid, p_token_hash, now() + interval '24 hours');
  return query select u.email, p.full_name from users u join profiles p on p.id = u.id where u.id = uid;
end $$;

create or replace function consume_email_verification(p_token_hash text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare r email_verifications;
begin
  select * into r from email_verifications
   where token_hash = p_token_hash and used_at is null and expires_at > now() for update;
  if not found then return false; end if;
  update users set email_verified_at = coalesce(email_verified_at, now()) where id = r.user_id;
  update email_verifications set used_at = now() where user_id = r.user_id and used_at is null;
  return true;
end $$;

-- Phiên chỉ hợp lệ với tài khoản đã xác minh
create or replace function session_valid(p_uid uuid, p_iat bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users
                 where id = p_uid and email_verified_at is not null
                   and date_trunc('second', password_changed_at) <= to_timestamp(p_iat));
$$;

revoke all on function register_user, find_user_for_login, create_email_verification, consume_email_verification, session_valid from public;
grant execute on function register_user, find_user_for_login, create_email_verification, consume_email_verification, session_valid to app_user;

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
