-- Xác minh email khi đăng ký. Chạy trên DB đang chạy:
--   docker compose exec -T db psql -U hmstay_admin -d hmstay < db/migrations/008_email_verification.sql

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
