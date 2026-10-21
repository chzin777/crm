"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useCrmData<T>(resource: string, fallback: T, options: { autoSave?: boolean } = {}) {
  const autoSave = options.autoSave ?? true;
  const [data, setData] = useState<T>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const loadedRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveVersionRef = useRef(0);
  const revisionRef = useRef<string | null>(null);
  const skipAutoSaveRef = useRef(false);

  useEffect(() => {
    let active = true;
    let loaded = false;
    fetch(`/api/crm/${resource}`)
      .then(async (response) => {
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error(`Resposta inválida da API (${response.status}). Verifique se o servidor está rodando.`);
        }
        const result = await response.json() as { data?: T; revision?: string | null; error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar os dados.");
        if (active && result.data !== undefined) {
          revisionRef.current = result.revision ?? null;
          skipAutoSaveRef.current = true;
          setData(result.data);
          loaded = true;
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os dados.");
      })
      .finally(() => {
        if (active) {
          loadedRef.current = loaded;
          setIsLoading(false);
        }
      });
    return () => { active = false; };
  }, [resource]);

  const reloadData = useCallback(async () => {
    const response = await fetch(`/api/crm/${resource}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Resposta inválida da API (${response.status}). Verifique se o servidor está rodando.`);
    }
    const result = await response.json() as { data?: T; revision?: string | null; error?: string };
    if (!response.ok) throw new Error(result.error || "Não foi possível atualizar os dados.");
    if (result.data !== undefined) {
      revisionRef.current = result.revision ?? null;
      skipAutoSaveRef.current = true;
      setData(result.data);
      loadedRef.current = true;
      setError("");
      return result.data;
    }
    throw new Error("A resposta não contém os dados atualizados.");
  }, [resource]);

  const saveData = useCallback(async (value: T) => {
    const version = ++saveVersionRef.current;
    setIsSaving(true);
    const saveRequest = saveQueueRef.current.then(async () => {
      const response = await fetch(`/api/crm/${resource}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: value, revision: revisionRef.current }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Resposta inválida da API (${response.status}). Verifique se o servidor está rodando.`);
      }
      const result = await response.json() as { revision?: string | null; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar os dados.");
      revisionRef.current = result.revision ?? null;
    });
    saveQueueRef.current = saveRequest.catch(() => undefined);
    try {
      await saveRequest;
      if (version === saveVersionRef.current) setError("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível salvar os dados.";
      if (version === saveVersionRef.current) setError(message);
      throw new Error(message);
    } finally {
      if (version === saveVersionRef.current) setIsSaving(false);
    }
  }, [resource]);

  useEffect(() => {
    if (!autoSave) return;
    // Data that just came from the server is already persisted.
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    if (!loadedRef.current) return;
    const timeout = window.setTimeout(() => {
      void saveData(data).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [autoSave, data, saveData]);

  return { data, setData, isLoading, isSaving, error, saveData, reloadData };
}
