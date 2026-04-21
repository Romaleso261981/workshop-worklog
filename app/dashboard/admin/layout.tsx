import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

export default async function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.role !== UserRole.ADMIN) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
