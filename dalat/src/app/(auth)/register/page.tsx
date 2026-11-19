import { AuthForm } from "@/components/auth-form";
import { registerAction } from "../actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="register" action={registerAction} next={next} />;
}
