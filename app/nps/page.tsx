"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Award, Bell, CalendarDays, Check, MessageSquare, Pencil, RefreshCw, Star, TrendingUp, Users, X } from "lucide-react";
import { useCrmData } from "@/hooks/useCrmData";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { useToast } from "@/components/ToastProvider";

type SurveyKey = "atendimento" | "produto";

interface SurveyDefinition {
  key: SurveyKey;
  title: string;
  timing: string;
  color: string;
  description: string;
}

interface Feedback {
  id: string;
  nome: string;
  survey: string;
  rating: number;
  comment: string;
  date: string;
}

const surveys: SurveyDefinition[] = [
  { key: "atendimento", title: "Atendimento", timing: "30 minutos após a compra", color: "#002187", description: "Pesquisa enviada após o atendimento na loja." },
  { key: "produto", title: "Produto & lentes", timing: "30 dias após a compra", color: "#C4D600", description: "Acompanhamento da adaptação ao produto." },
];

const initialMessages: Record<SurveyKey, string> = {
  atendimento: "Olá, {{nome}}! Como foi sua experiência com nosso atendimento? De 0 a 10, quanto você recomendaria nossa loja? Sua opinião nos ajuda a melhorar.",
  produto: "Olá, {{nome}}! Já faz 30 dias que está usando suas lentes. Como está sendo a adaptação? De 0 a 10, como avalia sua experiência?",
};

interface NpsResponse {
  id: string;
  surveyKey: SurveyKey;
  rating: number;
  comment: string | null;
  createdAt: string;
  contact: { name: string } | null;
}

interface NpsConfig {
  messages: Record<SurveyKey, string>;
}

interface NpsContact {
  id: string;
  nome: string;
}

const getMetrics = (ratings: number[]) => {
  const promoters = ratings.filter((rating) => rating >= 9).length;
  const detractors = ratings.filter((rating) => rating <= 6).length;
  const passives = ratings.length - promoters - detractors;
  return {
    count: ratings.length,
    nps: ratings.length ? Math.round(((promoters - detractors) / ratings.length) * 100) : 0,
    average: ratings.length ? (ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(1) : "0.0",
    promoters,
    passives,
    detractors,
    promoterPercent: ratings.length ? Math.round((promoters / ratings.length) * 100) : 0,
    passivePercent: ratings.length ? Math.round((passives / ratings.length) * 100) : 0,
    detractorPercent: ratings.length ? Math.round((detractors / ratings.length) * 100) : 0,
  };
};

const getLinePoints = (values: number[]) =>
  values.map((value, index) => `${42 + index * 106},${102 - value * 0.72}`).join(" ");

export default function NpsPage() {
  const { isDark, toggleTheme } = useCrmTheme();
  const toast = useToast();
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const { data: npsConfig, setData: setNpsConfig, isSaving: configSaving, error: configError } = useCrmData<NpsConfig>("nps", { messages: initialMessages });
  const messages = npsConfig.messages ?? initialMessages;
  const [responses, setResponses] = useState<NpsResponse[]>([]);
  const [responsesError, setResponsesError] = useState("");
  const [responsesLoading, setResponsesLoading] = useState(true);
  const [contacts, setContacts] = useState<NpsContact[]>([]);
  const [isResponseFormOpen, setIsResponseFormOpen] = useState(false);
  const [responseDraft, setResponseDraft] = useState({ surveyKey: "atendimento" as SurveyKey, contactId: "", rating: "", comment: "" });
  const [responseFormError, setResponseFormError] = useState("");
  const [editingSurvey, setEditingSurvey] = useState<SurveyKey | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageError, setMessageError] = useState("");

  const reloadResponses = useCallback(async () => {
    setResponsesLoading(true);
    setResponsesError("");
    try {
      const response = await fetch("/api/nps");
      const result = await response.json() as { data?: NpsResponse[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as respostas.");
      setCurrentDate(new Date());
      setResponses(result.data ?? []);
    } catch (error: unknown) {
      setResponsesError(error instanceof Error ? error.message : "Não foi possível carregar as respostas.");
    } finally {
      setResponsesLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/contacts/search?limit=50")
      .then(async (response) => {
        const result = await response.json() as { data?: NpsContact[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar os contatos.");
        if (active) setContacts(result.data ?? []);
      })
      .catch((error: unknown) => {
        if (active) setResponseFormError(error instanceof Error ? error.message : "Não foi possível carregar os contatos.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/nps")
      .then(async (response) => {
        const result = await response.json() as { data?: NpsResponse[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar as respostas.");
        if (active) {
          setCurrentDate(new Date());
          setResponses(result.data ?? []);
        }
      })
      .catch((error: unknown) => {
        if (active) setResponsesError(error instanceof Error ? error.message : "Não foi possível carregar as respostas.");
      })
      .finally(() => { if (active) setResponsesLoading(false); });
    return () => { active = false; };
  }, []);

  const scores: Record<SurveyKey, number[]> = {
    atendimento: responses.filter((response) => response.surveyKey === "atendimento").map((response) => response.rating),
    produto: responses.filter((response) => response.surveyKey === "produto").map((response) => response.rating),
  };
  const metrics = {
    atendimento: getMetrics(scores.atendimento),
    produto: getMetrics(scores.produto),
  };
  const allScores = responses.map((response) => response.rating);
  const overallMetrics = getMetrics(allScores);
  const feedbacks: Feedback[] = responses.map((response) => ({
    id: response.id,
    nome: response.contact?.name ?? "Contato removido",
    survey: surveys.find((survey) => survey.key === response.surveyKey)?.title ?? response.surveyKey,
    rating: response.rating,
    comment: response.comment ?? "",
    date: new Date(response.createdAt).toLocaleString("pt-BR"),
  }));
  const weeklyTrend = currentDate ? Array.from({ length: 6 }, (_, index) => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - (5 - index) * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const withinWeek = responses.filter((response) => {
      const date = new Date(response.createdAt);
      return date >= start && date < end;
    });
    return {
      week: start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      atendimento: getMetrics(withinWeek.filter((item) => item.surveyKey === "atendimento").map((item) => item.rating)).nps,
      produto: getMetrics(withinWeek.filter((item) => item.surveyKey === "produto").map((item) => item.rating)).nps,
      respostas: withinWeek.length,
    };
  }) : [];
  const openMessageEditor = (survey: SurveyKey) => {
    setMessageDraft(messages[survey]);
    setMessageError("");
    setEditingSurvey(survey);
  };
  const saveMessage = () => {
    if (!editingSurvey || !messageDraft.trim()) return;
    const updatedMessages = { ...messages, [editingSurvey]: messageDraft.trim() };
    setNpsConfig((current) => ({ ...current, messages: updatedMessages }));
    setEditingSurvey(null);
    setMessageError("");
    toast.success("Mensagem atualizada", "A mensagem da pesquisa foi salva.");
  };
  const saveResponse = async () => {
    const rating = Number(responseDraft.rating);
    if (!Number.isInteger(rating) || rating < 0 || rating > 10) {
      setResponseFormError("Informe uma nota inteira de 0 a 10.");
      return;
    }
    try {
      const response = await fetch("/api/nps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyKey: responseDraft.surveyKey,
          contactId: responseDraft.contactId || undefined,
          rating,
          comment: responseDraft.comment.trim() || undefined,
        }),
      });
      const result = await response.json() as { data?: NpsResponse; error?: string };
      const savedResponse = result.data;
      if (!response.ok || !savedResponse) throw new Error(result.error || "Não foi possível salvar a avaliação.");
      setResponses((current) => [savedResponse, ...current]);
      setResponseDraft({ surveyKey: "atendimento", contactId: "", rating: "", comment: "" });
      setResponseFormError("");
      setIsResponseFormOpen(false);
      toast.success("Avaliação adicionada", "A resposta NPS foi registrada.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar a avaliação.";
      setResponseFormError(message);
      toast.error("Erro ao salvar avaliação", message);
    }
  };
  const editedSurvey = surveys.find((survey) => survey.key === editingSurvey);

  if (responsesLoading) {
    return <LoadingSpinner fullScreen label="Carregando avaliações..." size={96} />;
  }

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] text-slate-800 transition-colors dark:bg-[#030d29] dark:text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mx-4 mt-4 flex h-16 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 shadow-sm dark:border-slate-800 dark:bg-[#051647]">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            Workspace <span className="text-slate-300 dark:text-slate-600">/</span> <strong className="text-slate-900 dark:text-white">Pesquisas NPS</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" aria-label="Alertas" title="Alertas" className="topbar-icon-button bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer">
              <Bell className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void reloadResponses()} disabled={responsesLoading} aria-label="Atualizar lista" title="Atualizar lista" className="topbar-icon-button bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${responsesLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        <main className="space-y-6 p-6 sm:p-8">
          {(configError || responsesError) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{configError || responsesError}</p>}
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Monitor de Satisfação do Cliente (NPS)</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Acompanhe avaliações, tendências e comentários das pesquisas.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><CalendarDays className="h-3.5 w-3.5" />Últimas 6 semanas · {overallMetrics.count} respostas registradas</span>
              <button type="button" onClick={() => { setResponseFormError(""); setIsResponseFormOpen(true); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] cursor-pointer hover:cursor-pointer">
                <Check className="h-3.5 w-3.5" />Registrar resposta
              </button>
            </div>
          </div>
          {configSaving && <LoadingSpinner label="Salvando configuração no banco..." size={32} />}
          {messageError && !editingSurvey && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{messageError}</p>}
          {responseFormError && !isResponseFormOpen && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{responseFormError}</p>}

          <section aria-label="Indicadores gerais de NPS" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Avaliações recebidas", value: overallMetrics.count, detail: "nas duas pesquisas", icon: MessageSquare, color: "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]" },
              { label: "NPS geral", value: overallMetrics.count ? overallMetrics.nps : "—", detail: "promotores menos detratores", icon: Award, color: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
              { label: "Nota média", value: overallMetrics.count ? `${overallMetrics.average}/10` : "—", detail: "média das notas recebidas", icon: Star, color: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300" },
              { label: "Promotores", value: overallMetrics.count ? `${overallMetrics.promoterPercent}%` : "—", detail: "notas 9 e 10", icon: TrendingUp, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{metric.value}</p><p className="mt-1 text-[10px] text-slate-400">{metric.detail}</p></div>
                    <span className={`grid h-9 w-9 place-items-center rounded-lg ${metric.color}`}><Icon className="h-4 w-4" /></span>
                  </div>
                </article>
              );
            })}
          </section>

          <section aria-label="Indicadores por pesquisa" className="grid gap-4 xl:grid-cols-2">
            {surveys.map((survey) => {
              const result = metrics[survey.key];
              return (
                <article key={survey.key} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">NPS {survey.title}</p><p className="mt-1 text-[11px] text-slate-400">{survey.timing}</p></div>
                    <button type="button" onClick={() => openMessageEditor(survey.key)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-[#002187] hover:bg-[#002187]/5 hover:text-[#002187] dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer">
                      <Pencil className="h-3.5 w-3.5" />Editar mensagem
                    </button>
                  </div>
                  <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
                    <div><p className="text-3xl font-extrabold text-slate-900 dark:text-white">{result.nps}</p><p className="text-[10px] font-semibold uppercase text-slate-400">Pontuação NPS</p></div>
                    <div><p className="text-lg font-bold text-slate-800 dark:text-slate-100">{result.count ? <>{result.average}<span className="text-xs font-normal text-slate-400"> / 10</span></> : "—"}</p><p className="text-[10px] text-slate-400">Nota média · {result.count} respostas</p></div>
                    <div className="min-w-36 flex-1"><div className="mb-1.5 flex justify-between text-[10px] text-slate-400"><span>Promotores</span><span>{result.promoterPercent}%</span></div><div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><span style={{ width: `${result.promoterPercent}%`, backgroundColor: survey.color }} /><span className="bg-amber-400" style={{ width: `${result.passivePercent}%` }} /><span className="bg-[#F7915E]" style={{ width: `${result.detractorPercent}%` }} /></div></div>
                  </div>
                  <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-[10px] dark:border-slate-800">
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: survey.color }} />Promotores {result.promoters}</span>
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="h-2 w-2 rounded-full bg-amber-400" />Neutros {result.passives}</span>
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="h-2 w-2 rounded-full bg-[#F7915E]" />Detratores {result.detractors}</span>
                  </div>
                  <p className="line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{messages[survey.key]}</p>
                </article>
              );
            })}
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Evolução do NPS</h2><p className="mt-1 text-[11px] text-slate-400">Pontuação semanal nos últimos 30 dias</p></div>
                <div className="flex gap-3 text-[10px]">
                  {surveys.map((survey) => <span key={survey.key} className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: survey.color }} />{survey.title}</span>)}
                </div>
              </div>
              <div role="img" aria-label="Gráfico de linhas comparando a evolução semanal do NPS de atendimento e produto" className="w-full overflow-hidden">
                <svg viewBox="0 0 620 205" className="h-52 w-full" preserveAspectRatio="none">
                  {[30, 70, 110, 150].map((y) => <line key={y} x1="36" x2="590" y1={y} y2={y} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />)}
                  {[-100, -50, 0, 50, 100].map((value) => <text key={value} x="2" y={102 - value * 0.72} className="fill-slate-400" fontSize="9">{value}</text>)}
                  <polyline points={getLinePoints(weeklyTrend.map((item) => item.atendimento))} fill="none" stroke="#002187" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={getLinePoints(weeklyTrend.map((item) => item.produto))} fill="none" stroke="#C4D600" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  {weeklyTrend.map((item, index) => <g key={item.week}><circle cx={42 + index * 106} cy={174 - item.atendimento * 1.45} r="3.5" fill="#002187" /><circle cx={42 + index * 106} cy={174 - item.produto * 1.45} r="3.5" fill="#C4D600" /><text x={42 + index * 106} y="198" textAnchor="middle" className="fill-slate-400" fontSize="9">{item.week}</text></g>)}
                </svg>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
              <div className="mb-4"><h2 className="text-sm font-bold text-slate-900 dark:text-white">Distribuição das notas</h2><p className="mt-1 text-[11px] text-slate-400">Avaliações recebidas por nota, de 0 a 10</p></div>
              <div role="img" aria-label="Gráfico de barras com a distribuição de notas recebidas">
                <div className="flex h-40 items-end gap-1.5 border-b border-slate-200 px-1 dark:border-slate-700">
                  {Array.from({ length: 11 }, (_, rating) => {
                    const count = allScores.filter((score) => score === rating).length;
                    const height = allScores.length ? Math.max(5, (count / allScores.length) * 100) : 0;
                    const color = rating >= 9 ? "bg-[#C4D600]" : rating >= 7 ? "bg-[#002187]" : "bg-[#F7915E]";
                    return <div key={rating} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="text-[9px] text-slate-400">{count}</span><div className={`w-full max-w-6 rounded-t ${color}`} style={{ height: `${height}%` }} /><span className="pb-1 text-[9px] text-slate-400">{rating}</span></div>;
                  })}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F7915E]" />Detratores 0–6</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#002187]" />Neutros 7–8</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#C4D600]" />Promotores 9–10</span>
              </div>
            </article>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:px-5">
              <div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Avaliações recentes</h2><p className="mt-1 text-[11px] text-slate-400">Comentários associados às últimas respostas</p></div>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-400"><Users className="h-3.5 w-3.5" />{feedbacks.length} de {overallMetrics.count}</span>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {responsesLoading ? (
                <li className="grid min-h-48 place-items-center px-5">
                  <LoadingSpinner label="Carregando avaliações..." className="w-full justify-center" />
                </li>
              ) : feedbacks.length === 0 ? (
                <li className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma avaliação com comentário encontrada.</li>
              ) : feedbacks.map((feedback) => (
                <li key={feedback.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="min-w-32"><p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{feedback.nome}</p><p className="mt-0.5 text-[10px] text-slate-400">{feedback.survey} · {feedback.date}</p></div>
                  <p className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-300">{feedback.comment}</p>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#C4D600]/20 px-2.5 py-1 text-[10px] font-bold text-[#051647] dark:text-[#C4D600]"><Star className="h-3 w-3 fill-current" />{feedback.rating}/10</span>
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>

      {editingSurvey && editedSurvey && (
        <EntityDialog
          titleId="nps-message-title"
          title={`Mensagem NPS · ${editedSurvey.title}`}
          description={`Edite o texto enviado ${editedSurvey.timing.toLocaleLowerCase("pt-BR")}.`}
          onClose={() => setEditingSurvey(null)}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                Texto da pesquisa <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span>
                <textarea
                  rows={7}
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  className="min-h-36 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                />
              </label>
              <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Variáveis disponíveis: <code className="font-semibold text-[#002187] dark:text-[#C4D600]">{"{{nome}}"}</code>, <code className="font-semibold text-[#002187] dark:text-[#C4D600]">{"{{email}}"}</code> e <code className="font-semibold text-[#002187] dark:text-[#C4D600]">{"{{telefone}}"}</code>.
              </div>
              {messageError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{messageError}</p>}
            </div>
            <footer className="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" onClick={() => setEditingSurvey(null)} className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Cancelar</button>
              <button type="button" disabled={!messageDraft.trim()} onClick={saveMessage} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer hover:cursor-pointer"><Check className="h-3.5 w-3.5" />Salvar mensagem</button>
              <button type="button" onClick={() => setEditingSurvey(null)} aria-label="Fechar edição da mensagem" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"><X className="h-4 w-4" /></button>
            </footer>
          </div>
        </EntityDialog>
      )}
      {isResponseFormOpen && (
        <EntityDialog
          titleId="nps-response-dialog-title"
          title="Registrar resposta NPS"
          description="Salve uma avaliação recebida para atualizar os indicadores."
          onClose={() => setIsResponseFormOpen(false)}
        >
          <div className="space-y-4">
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Pesquisa
              <select value={responseDraft.surveyKey} onChange={(event) => setResponseDraft((current) => ({ ...current, surveyKey: event.target.value as SurveyKey }))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {surveys.map((survey) => <option key={survey.key} value={survey.key}>{survey.title}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Contato (opcional)
              <select value={responseDraft.contactId} onChange={(event) => setResponseDraft((current) => ({ ...current, contactId: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="">Sem contato associado</option>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.nome}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Nota (0 a 10)
              <input type="number" min="0" max="10" step="1" value={responseDraft.rating} onChange={(event) => setResponseDraft((current) => ({ ...current, rating: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Comentário (opcional)
              <textarea rows={3} value={responseDraft.comment} onChange={(event) => setResponseDraft((current) => ({ ...current, comment: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            {responseFormError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{responseFormError}</p>}
            <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" onClick={() => setIsResponseFormOpen(false)} className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 cursor-pointer hover:cursor-pointer">Cancelar</button>
              <button type="button" onClick={saveResponse} className="h-9 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] cursor-pointer hover:cursor-pointer">Salvar resposta</button>
            </footer>
          </div>
        </EntityDialog>
      )}
    </div>
  );
}
