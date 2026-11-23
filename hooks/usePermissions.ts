"use client";
import { useEffect, useState } from "react";
import type { ModuleAccess } from "@/lib/permissions";

type PermissionsState = { isLoading: boolean; modules: ModuleAccess | null };

let cached: Promise<ModuleAccess | null> | null = null;

const loadPermissions = () => {
  cached ??= fetch("/api/me/permissions")
    .then(async (res) => {
      if (res.ok) return ((await res.json()) as { data: { modules: ModuleAccess } }).data.modules;
      // Senha provisória: nenhuma tela do CRM abre antes de criar a senha definitiva.
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      if (body?.code === "MUST_CHANGE_PASSWORD") window.location.replace("/primeiro-acesso");
      return null;
    })
    .catch(() => null);
  return cached;
};

export function usePermissions(): PermissionsState {
  const [state, setState] = useState<PermissionsState>({ isLoading: true, modules: null });

  useEffect(() => {
    let active = true;
    void loadPermissions().then((modules) => {
      if (!active) return;
      if (!modules) cached = null;
      setState({ isLoading: false, modules });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
