"use client";

import { useEffect, useState } from "react";
import { Bell, Plus, Search, Store as StoreIcon, Trash2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { SearchableSelect } from "@/components/SearchableSelect";
import Stepper, { Step } from "@/components/Stepper";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useCrmTheme } from "@/hooks/useCrmTheme";

interface StoreRecord {
  id: string;
  number: number;
  name: string;
  address: string;
  addressNumber: string;
  complement: string;
  postalCode: string;
  city: string;
  state: string;
  neighborhoods: string[];
  active: boolean;
  kind: string;
  startDate: string;
  radiusKm: number;
}

const BRAZIL_STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

const emptyForm = {
  number: "",
  name: "",
  address: "",
  addressNumber: "",
  complement: "",
  postalCode: "",
  city: "",
  state: "",
  neighborhoods: [] as string[],
  radiusKm: "20",
  active: true,
};
const RADIUS_PRESETS = [5, 10, 20, 30, 50];
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-[#051647] dark:text-white";

export default function LojasPage() {
  const { isDark, toggleTheme } = useCrmTheme();
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [editing, setEditing] = useState<StoreRecord | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>([]);
  const [neighborhoodsLoading, setNeighborhoodsLoading] = useState(false);

  const loadCounts = async (list: StoreRecord[]) => {
    const groups = Object.fromEntries(list.map((store) => [String(store.number), [{ id: `store-${store.number}`, nome: `Loja ${store.number}`, tipo: "loja" }]]));
    const response = await fetch("/api/segments/audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups }),
    });
    const result = await response.json().catch(() => ({})) as { counts?: Record<string, number> };
    if (response.ok && result.counts) setCounts(result.counts);
  };

  useEffect(() => {
    let active = true;
    fetch("/api/stores")
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as { data?: StoreRecord[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar as lojas.");
        const list = result.data ?? [];
        if (!active) return;
        setStores(list);
        await loadCounts(list).catch(() => undefined);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar as lojas."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const loadLocations = (type: "cities" | "neighborhoods", params: Record<string, string>, apply: (names: string[]) => void, setLoading: (value: boolean) => void, isActive: () => boolean) => {
    setLoading(true);
    fetch(`/api/stores/locations?${new URLSearchParams({ type, ...params })}`)
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as { data?: string[] };
        if (isActive()) apply(response.ok ? result.data ?? [] : []);
      })
      .catch(() => { if (isActive()) apply([]); })
      .finally(() => { if (isActive()) setLoading(false); });
  };

  const isFormOpen = editing !== null;
  useEffect(() => {
    if (!isFormOpen || !form.state) return;
    let active = true;
    loadLocations("cities", { state: form.state }, setCities, setCitiesLoading, () => active);
    return () => { active = false; };
  }, [isFormOpen, form.state]);

  useEffect(() => {
    if (!isFormOpen || !form.city) return;
    let active = true;
    loadLocations("neighborhoods", { state: form.state, city: form.city }, setNeighborhoodOptions, setNeighborhoodsLoading, () => active);
    return () => { active = false; };
  }, [isFormOpen, form.state, form.city]);

  const withCurrent = (options: string[], current: string) => (current && !options.includes(current) ? [current, ...options] : options);

  const openForm = (store: StoreRecord | "new") => {
    setEditing(store);
    setForm(store === "new" ? {
      ...emptyForm,
      number: String(Math.max(0, ...stores.map((item) => item.number)) + 1),
    } : {
      number: String(store.number),
      name: store.name,
      address: store.address,
      addressNumber: store.addressNumber,
      complement: store.complement,
      postalCode: store.postalCode,
      city: store.city,
      state: store.state,
      neighborhoods: store.neighborhoods.slice(0, 1),
      radiusKm: String(store.radiusKm),
      active: store.active,
    });
    setFormError("");
    setCities([]);
    setNeighborhoodOptions([]);
  };

  const updateStoreNumber = (value: string) => setForm((current) => ({ ...current, number: value }));

  const closeForm = () => setEditing(null);

  const saveStore = async () => {
    const number = Number(form.number);
    if (!Number.isInteger(number) || number < 1) return setFormError("Informe o número da loja.");
    if (!form.name.trim()) return setFormError("Informe o nome da loja.");
    setIsSaving(true);
    try {
      const isNew = editing === "new";
      const response = await fetch("/api/stores", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNew ? {} : { id: (editing as StoreRecord).id }),
          number,
          name: form.name,
          address: form.address,
          addressNumber: form.addressNumber,
          complement: form.complement,
          postalCode: form.postalCode,
          city: form.city,
          state: form.state,
          neighborhoods: form.neighborhoods,
          radiusKm: Number(form.radiusKm.replace(",", ".")) || 0,
          active: form.active,
        }),
      });
      const result = await response.json().catch(() => ({})) as { data?: StoreRecord; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error || "Não foi possível salvar a loja.");
      const saved = result.data;
      const next = [...stores.filter((store) => store.id !== saved.id), saved].sort((a, b) => a.number - b.number);
      setStores(next);
      if (saved.radiusKm > 0) {
        setProgress("Localizando bairros...");
        let located = true;
        for (let attempt = 0; attempt < 400; attempt += 1) {
          const step = await fetch("/api/stores/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: saved.id }),
          });
          const data = await step.json().catch(() => ({})) as { pending?: number; storeLocated?: boolean; error?: string };
          if (!step.ok) throw new Error(data.error || "Não foi possível calcular o raio de atendimento.");
          located = data.storeLocated !== false;
          if (!data.pending) break;
          setProgress(`Localizando bairros dos contatos... ${data.pending.toLocaleString("pt-BR")} restantes`);
        }
        if (!located) setError("Não foi possível localizar o bairro da loja no mapa; o raio não será aplicado.");
      }
      closeForm();
      await loadCounts(next).catch(() => undefined);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível salvar a loja.");
    } finally {
      setProgress("");
      setIsSaving(false);
    }
  };

  const removeStore = async (store: StoreRecord) => {
    if (!window.confirm(`Remover a loja ${store.number} - ${store.name}?`)) return;
    const response = await fetch(`/api/stores?id=${encodeURIComponent(store.id)}`, { method: "DELETE" });
    if (response.ok) {
      setStores((current) => current.filter((item) => item.id !== store.id));
      closeForm();
    } else setError("Não foi possível remover a loja.");
  };

  const term = search.trim().toLocaleLowerCase("pt-BR");
  const visibleStores = stores.filter((store) =>
    `${store.number} ${store.name} ${store.address} ${store.city} ${store.neighborhoods.join(" ")}`.toLocaleLowerCase("pt-BR").includes(term));
  const totalPages = Math.max(1, Math.ceil(visibleStores.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedStores = visibleStores.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const validateStoreStep = (step: number) => {
    if (step === 1) {
      const number = Number(form.number);
      if (!Number.isInteger(number) || number < 1) return setFormError("Informe o número da loja."), false;
      if (!form.name.trim()) return setFormError("Informe o nome da loja."), false;
    }
    if (step === 2 && (!form.state || !form.city || !form.neighborhoods[0])) {
      setFormError("Selecione a UF, a cidade e o bairro da loja para continuar.");
      return false;
    }
    setFormError("");
    return true;
  };

  const identityFields = (
    <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Número
        <input type="number" min={1} value={form.number} onChange={(event) => updateStoreNumber(event.target.value)} className={`${inputClass} mt-1`} />
      </label>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Nome
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Loja Centro" className={`${inputClass} mt-1`} />
      </label>
    </div>
  );

  const addressFields = (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Endereço
          <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Rua ou avenida" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Nº
          <input value={form.addressNumber} onChange={(event) => setForm({ ...form, addressNumber: event.target.value })} className={`${inputClass} mt-1`} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Complemento
          <input value={form.complement} onChange={(event) => setForm({ ...form, complement: event.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">CEP
          <input inputMode="numeric" maxLength={9} value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} className={`${inputClass} mt-1`} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-[100px_1fr]">
        <SearchableSelect label="UF" value={form.state} options={BRAZIL_STATES} placeholder="UF" onChange={(state) => setForm({ ...form, state, city: "", neighborhoods: [] })} />
        <SearchableSelect label="Cidade" value={form.city} options={withCurrent(cities, form.city)} isLoading={citiesLoading} disabled={!form.state} placeholder={form.state ? "Selecione a cidade" : "Selecione a UF primeiro"} onChange={(city) => setForm({ ...form, city, neighborhoods: [] })} />
      </div>
      <SearchableSelect label="Bairro da loja" value={form.neighborhoods[0] ?? ""} options={withCurrent(neighborhoodOptions, form.neighborhoods[0] ?? "")} isLoading={neighborhoodsLoading} disabled={!form.city} placeholder={form.city ? "Selecione o bairro" : "Selecione a cidade primeiro"} onChange={(neighborhood) => setForm({ ...form, neighborhoods: [neighborhood] })} />
    </>
  );

  const radiusPill = (selected: boolean) => `h-8 cursor-pointer rounded-full px-3 text-xs font-semibold transition-colors hover:cursor-pointer ${selected ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`;

  const radiusField = (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Raio de atendimento</p>
          <p className="mt-1 text-[11px] text-slate-500">Contatos de bairros dentro deste raio entram no público dela somente quando ela é a loja mais próxima do contato.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#C4D600]/20 px-3 py-1.5 text-[#051647] dark:text-[#C4D600]">
          <input
            type="number"
            min={0}
            max={200}
            aria-label="Raio de atendimento em quilômetros"
            value={form.radiusKm}
            onChange={(event) => setForm({ ...form, radiusKm: event.target.value })}
            className="w-12 bg-transparent text-right text-lg font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-xs font-semibold">km</span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        aria-label="Raio de atendimento"
        value={Math.min(100, Number(form.radiusKm) || 0)}
        onChange={(event) => setForm({ ...form, radiusKm: event.target.value })}
        className="mt-4 h-2 w-full cursor-pointer accent-[#002187] dark:accent-[#C4D600]"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {RADIUS_PRESETS.map((preset) => (
          <button key={preset} type="button" aria-pressed={Number(form.radiusKm) === preset} onClick={() => setForm({ ...form, radiusKm: String(preset) })} className={radiusPill(Number(form.radiusKm) === preset)}>{preset} km</button>
        ))}
        <button type="button" aria-pressed={Number(form.radiusKm) === 0} onClick={() => setForm({ ...form, radiusKm: "0" })} className={radiusPill(Number(form.radiusKm) === 0)}>Só o bairro</button>
      </div>
    </div>
  );

  const activeToggle = (
    <button type="button" role="switch" aria-checked={form.active} onClick={() => setForm({ ...form, active: !form.active })} className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:cursor-pointer dark:border-slate-700">
      <span><span className="block text-sm font-semibold text-slate-900 dark:text-white">Loja ativa</span><span className="block text-xs text-slate-500">Lojas inativas não aparecem como critério de segmentação.</span></span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.active ? "bg-[#002187]" : "bg-slate-300 dark:bg-slate-600"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${form.active ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] text-slate-800 transition-colors dark:bg-[#030d29] dark:text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mx-4 mt-4 flex h-16 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 shadow-sm dark:border-slate-800 dark:bg-[#051647]">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            Workspace <span className="text-slate-300 dark:text-slate-600">/</span> <strong className="text-slate-900 dark:text-white">Lojas</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" aria-label="Alertas" title="Alertas" className="topbar-icon-button cursor-pointer bg-slate-100 text-slate-500 hover:cursor-pointer hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700">
              <Bell className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => openForm("new")} className="topbar-action-button cursor-pointer bg-[#051647] text-white hover:cursor-pointer hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D]">
              <Plus className="h-4 w-4" /> Cadastrar loja
            </button>
          </div>
        </header>

        <main className="space-y-6 p-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Lojas</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Cada loja recebe automaticamente os clientes que compraram nela. Cadastrar bairros é opcional e inclui também clientes próximos.</p>
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <label className="relative block max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por número, nome, endereço, cidade ou bairro" className={`${inputClass} pl-9`} />
          </label>

          <section aria-label="Lojas cadastradas" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-400 dark:bg-slate-800/40">
                  <tr>
                    <th className="px-5 py-3">Loja</th>
                    <th className="px-4 py-3">Cidade</th>
                    <th className="px-4 py-3">Bairro / raio</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Contatos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading && (
                    <tr><td colSpan={5} className="px-5 py-8">
                      <LoadingSpinner label="Carregando lojas..." className="w-full justify-center" />
                    </td></tr>
                  )}
                  {!isLoading && pagedStores.map((store) => (
                    <tr
                      key={store.id}
                      tabIndex={0}
                      aria-label={`Abrir detalhes da loja ${store.number}`}
                      onClick={() => openForm(store)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openForm(store);
                        }
                      }}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/80 focus-visible:outline-2 focus-visible:outline-[#002187] dark:hover:bg-slate-800/30 dark:focus-visible:outline-[#C4D600]"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><StoreIcon className="h-4 w-4" /></span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-slate-900 group-hover:text-[#002187] dark:text-white dark:group-hover:text-[#C4D600]">
                              Loja {store.number}{store.name !== `Loja ${store.number}` ? ` · ${store.name}` : ""}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-slate-400">{store.kind || "Loja"}{store.startDate ? ` · Desde ${store.startDate}` : ""}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">{store.city ? `${store.city}${store.state ? `/${store.state}` : ""}` : "—"}</td>
                      <td className="max-w-64 truncate px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">{store.neighborhoods.length > 0 ? `${store.neighborhoods[0]}${store.radiusKm > 0 ? ` · raio ${store.radiusKm} km` : ""}` : "Clientes vinculados pelas vendas"}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${store.active ? "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{store.active ? "Ativa" : "Inativa"}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {counts[String(store.number)] === undefined ? "…" : counts[String(store.number)].toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && visibleStores.length === 0 && <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-500">Nenhuma loja encontrada.</td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400 dark:border-slate-800">
              <label className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span>Itens por página:</span>
                <select
                  value={pageSize}
                  onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
                  className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {[15, 30, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <div className="flex items-center gap-3">
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:cursor-pointer hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Anterior</button>
                <span>Página {currentPage} de {totalPages} ({visibleStores.length} lojas)</span>
                <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:cursor-pointer hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Próxima</button>
              </div>
            </footer>
          </section>
        </main>
      </div>

      {editing && (
        <EntityDialog titleId="store-dialog-title" title={editing === "new" ? "Cadastrar loja" : `Editar loja ${editing.number}`} description="Clientes que compraram nesta loja entram automaticamente; o bairro da loja também traz clientes da mesma região." onClose={closeForm} size="lg">
          {editing === "new" ? (
            <Stepper
              initialStep={1}
              onStepChange={() => setFormError("")}
              onFinalStepCompleted={saveStore}
              backButtonText="Voltar"
              nextButtonText="Continuar"
              completeButtonText={isSaving ? (progress || "Salvando...") : "Salvar loja"}
              indicator="numbers"
              orientation="horizontal"
              transition="slide"
              linear={false}
              disableStepIndicators={false}
              showFooter
              theme={isDark ? "dark" : "light"}
              accentColor="#C4D600"
              frame={false}
              radius={16}
              width="100%"
              className="min-h-0 flex-1"
              validateStep={validateStoreStep}
            >
              <Step title="Identificação" description="Número e nome">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Identifique a loja</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Clientes que compraram nesta loja entram automaticamente no público dela.</p>
                  </div>
                  {identityFields}
                  {activeToggle}
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
              <Step title="Localização" description="Endereço da loja">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Onde fica a loja</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">O bairro é a referência para calcular quais clientes estão por perto.</p>
                  </div>
                  {addressFields}
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
              <Step title="Atendimento" description="Raio de atendimento">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Defina o raio</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Distância máxima, a partir do bairro da loja, para considerar um cliente como dela.</p>
                  </div>
                  {radiusField}
                </div>
              </Step>
              <Step title="Revisão" description="Confira antes de salvar">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Revise a loja</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ao salvar com raio, os bairros dos contatos são localizados no mapa.</p>
                  </div>
                  <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Loja</dt><dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">Loja {form.number} · {form.name || "Sem nome"}{form.active ? "" : " (inativa)"}</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Endereço</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{[[form.address, form.addressNumber].filter(Boolean).join(", "), form.complement, form.neighborhoods[0], [form.city, form.state].filter(Boolean).join("/"), form.postalCode].filter(Boolean).join(" · ") || "Não informado"}</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Raio de atendimento</dt><dd className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{Number(form.radiusKm) > 0 ? `${Number(form.radiusKm)} km` : "Somente o bairro da loja"}</dd></div>
                  </dl>
                  {isSaving && progress && <p role="status" className="text-xs font-medium text-slate-600 dark:text-slate-300">{progress}</p>}
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
            </Stepper>
          ) : (
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {identityFields}
              {addressFields}
              {radiusField}
              {activeToggle}
            </div>
            <footer className="mt-4 flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => removeStore(editing)} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-600 hover:cursor-pointer hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /> Excluir</button>
                <p role="alert" className="text-xs text-red-600">{formError}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={closeForm} className="h-10 cursor-pointer rounded-lg border border-slate-200 px-4 text-sm font-semibold hover:cursor-pointer dark:border-slate-700">Cancelar</button>
                <button type="button" disabled={isSaving} onClick={saveStore} className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:cursor-pointer hover:bg-[#002187] disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647]">{isSaving ? (progress || "Salvando...") : "Salvar loja"}</button>
              </div>
            </footer>
          </div>
          )}
        </EntityDialog>
      )}
    </div>
  );
}
