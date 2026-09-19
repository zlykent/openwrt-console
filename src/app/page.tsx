import { redirect } from "next/navigation";

/** The console lives under /dashboard; the app shell handles auth gating. */
export default function RootPage() {
  redirect("/dashboard");
}
