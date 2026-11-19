import { AuthForm } from "@/components/auth-form";
import { loginAction } from "../actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="login" action={loginAction} next={next} />;
}
