import { AuthForm } from "@/components/auth-form";
import { loginAction } from "../actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  return <AuthForm mode="login" action={loginAction} next={next} notice={reset === "1" ? "Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới." : undefined} />;
}
