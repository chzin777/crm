"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro na página de campanhas:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f4f5f8] p-8 text-sm font-medium text-[#051647] dark:bg-[#030d29] dark:text-[#C4D600]">
      <h2 className="text-xl font-bold">Algo deu errado</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Ocorreu um erro ao carregar esta página. Abra o console do navegador (F12) para ver detalhes.
      </p>
      <pre className="mt-4 max-w-full overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-xs text-red-600 dark:border-slate-700 dark:bg-[#07194f] dark:text-red-400">
        {error.message}
      </pre>
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-[#051647] px-4 py-2 text-sm font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D]"
      >
        Tentar novamente
      </button>
    </div>
  );
}