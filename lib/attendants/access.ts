import "server-only";
import { prisma } from "@/lib/prisma";
import { isAdminRole, resolveChatCapabilities } from "@/lib/permissions";

export async function canManageAttendanceAttributions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, banned: true, roleRef: { select: { permissions: true } } },
  });
  return !!user && !user.banned && (
    isAdminRole(user.role) || resolveChatCapabilities(user.role, user.roleRef?.permissions)["chat.viewAll"]
  );
}
