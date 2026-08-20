import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const reviewCount = await db.reviewItem.count({ where: { status: "PENDING" } });
  return (
    <AppShell user={{ id: user.id, name: user.name, email: user.email, role: user.role }} reviewCount={reviewCount}>
      {children}
    </AppShell>
  );
}
