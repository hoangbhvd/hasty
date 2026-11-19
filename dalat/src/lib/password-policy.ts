/** Chính sách mật khẩu: dài 8–128, không phổ biến, không chứa SĐT/email của chính tài khoản, không chỉ toàn số (trừ khi rất dài). */
const COMMON = new Set([
  "12345678", "123456789", "1234567890", "11111111", "00000000", "12341234", "87654321", "123123123", "qwertyui", "qwerty123",
  "password", "password1", "password123", "matkhau123", "matkhau1", "abc12345", "abcd1234", "admin123", "iloveyou", "letmein123",
  "dalat1234", "homestay123", "welcome123", "a1234567", "1q2w3e4r", "1qaz2wsx",
]);

export type PolicyContext = { phone?: string | null; email?: string | null; name?: string | null };

export function validatePassword(pw: string, ctx: PolicyContext = {}): string | null {
  if (pw.length < 8) return "Mật khẩu tối thiểu 8 ký tự";
  if (pw.length > 128) return "Mật khẩu tối đa 128 ký tự";
  const low = pw.toLowerCase();
  if (COMMON.has(low)) return "Mật khẩu quá phổ biến, hãy chọn mật khẩu khác";
  if (/^(.)\1+$/.test(pw)) return "Mật khẩu không được lặp một ký tự";
  if (/^\d+$/.test(pw) && pw.length < 12) return "Mật khẩu không được chỉ gồm số (hoặc dùng từ 12 chữ số)";

  const digits = pw.replace(/\D/g, "");
  const phone = ctx.phone?.replace(/\D/g, "");
  if (phone && phone.length >= 6 && (digits.includes(phone) || phone.includes(digits) && digits.length >= 6)) return "Mật khẩu không được chứa số điện thoại của bạn";
  const local = ctx.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && low.includes(local) && !/^\d+$/.test(local)) return "Mật khẩu không được chứa email của bạn";
  return null;
}
