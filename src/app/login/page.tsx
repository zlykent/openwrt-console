import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getPublicDeviceDefaults } from "@/lib/config";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const sp = await searchParams;
  return (
    <LoginForm
      defaults={getPublicDeviceDefaults()}
      expired={sp.expired === "1"}
      next={sp.next}
    />
  );
}
