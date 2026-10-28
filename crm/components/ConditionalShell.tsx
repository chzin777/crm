"use client";
import { usePathname } from "next/navigation";
import { CrmShell } from "@/components/CrmShell";

const PUBLIC_ROUTES = ["/login", "/exclusao-de-dados", "/politica-de-privacidade", "/termos-de-servico"];

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
  if (isPublic) return <>{children}</>;
  return <CrmShell>{children}</CrmShell>;
}