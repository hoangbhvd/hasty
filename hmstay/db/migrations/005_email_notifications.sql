-- Thông báo qua email + thông báo booking bằng tiếng Việt. Chạy trên DB đang chạy:
--   docker compose exec -T db psql -U hmstay_admin -d hmstay < db/migrations/005_email_notifications.sql

alter table users add column email_notifications boolean not null default true;
alter table notifications add column emailed_at timestamptz;
alter table notifications add column email_attempts int not null default 0;
-- Thông báo cũ coi như đã gửi, tránh gửi dồn một loạt email cũ khi mới bật tính năng
update notifications set emailed_at = now();

create function status_label(s booking_status) returns text
language sql immutable as $$
  select case s when 'quoted' then 'Báo giá' when 'holding' then 'Đang giữ chỗ'
                when 'deposit_reported' then 'Đã báo cọc' when 'confirmed' then 'Đã chốt'
                when 'cancelled' then 'Đã huỷ' else 'Hết hạn giữ' end;
$$;

create or replace function advance_booking(p_booking uuid, p_to booking_status, p_note text default null)
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
