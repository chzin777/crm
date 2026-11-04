"use client";
import { useEffect, useState } from "react";
import type { ModuleAccess } from "@/lib/permissions";

type PermissionsState = { isLoading: boolean; modules: ModuleAccess | null };

let cached: Promise<ModuleAccess | null> | null = null;

const loadPermissions = () => {
  cached ??= fetch("/api/me/permissions")
    .then(async (res) => (res.ok ? (((await res.json()) as { data: { modules: ModuleAccess } }).data.modules) : null))
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
