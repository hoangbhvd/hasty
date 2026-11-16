-- Quên mật khẩu (token qua email). Chạy trên DB đang chạy:
--   docker compose exec -T db psql -U hmstay_admin -d hmstay < db/migrations/003_password_reset.sql

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
  update users set password_hash = p_new_password_hash where id = r.user_id;
  update password_resets set used_at = now() where user_id = r.user_id and used_at is null;
  return true;
end $$;

revoke all on function create_password_reset, consume_password_reset from public;
grant execute on function create_password_reset, consume_password_reset to app_user;
