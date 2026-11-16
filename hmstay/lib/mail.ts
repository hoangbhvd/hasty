import nodemailer from "nodemailer";

/** Gửi email qua SMTP. Chưa cấu hình SMTP: dev thì in ra console, production thì ném lỗi (để bên gọi xử lý/thử lại). */
export async function sendMail(to: string, subject: string, text: string, html: string) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP_HOST chưa cấu hình, không gửi được email");
    }
    console.log(`\n[mail:dev] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host, port,
    secure: port === 465, // 465 = SSL ngay; 587 = STARTTLS
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to, subject, text, html });
}
