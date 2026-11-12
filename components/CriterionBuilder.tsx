"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AtSign,
  BadgeCheck,
  Cake,
  CalendarClock,
  Briefcase,
  Kanban,
  Layers,
  MapPin,
  MapPinned,
  Megaphone,
  MessageSquareHeart,
  ShoppingCart,
  TrendingUp,
  Phone,
  PhoneCall,
  Receipt,
  Repeat,
  ShoppingBag,
  Star,
  Tag,
  Users,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { getRuleField, splitRuleList, validateRule, type RuleMatch, type SegmentRule } from "@/lib/segment-rules";
import { formatPhone } from "@/lib/chat/phone";
import { MONTH_NAMES } from "@/lib/birthday";

type FieldId =
  | "birthday" | "erpPurchase" | "campaignConversion"
  | "lastPurchase" | "avgTicket" | "totalSpent" | "purchases"
  | "ddd" | "state" | "city" | "neighborhood" | "tag" | "phone" | "email" | "gender" | "occupation"
  | "pipelineStage" | "category" | "npsAnswered" | "npsRating" | "segment";

type EditorKind = "days" | "money" | "count" | "number" | "chips" | "text" | "presence" | "select" | "purchase" | "campaign" | "birthday";

type CardDef = { id: FieldId; title: string; description: string; icon: LucideIcon; editor: EditorKind; chipHint?: string };

type GroupDef = { id: string; label: string; description: string; icon: LucideIcon; cards: CardDef[] };

export const CRITERION_GROUPS: GroupDef[] = [
  {
    id: "vendas",
    label: "Vendas e campanhas",
    description: "Compras recentes no ERP e conversão de disparos.",
    icon: TrendingUp,
    cards: [
      { id: "erpPurchase", title: "Compra recente no ERP", description: "Comprou hoje, ontem, nos últimos dias ou num período.", icon: ShoppingCart, editor: "purchase" },
      { id: "campaignConversion", title: "Conversão em campanha", description: "Comprou (ou não) depois de receber um disparo.", icon: Megaphone, editor: "campaign" },
    ],
  },
  {
    id: "compras",
    label: "Histórico de compras",
    description: "Pedidos do ERP (VMSet), só vendas e sem serviços.",
    icon: ShoppingBag,
    cards: [
      { id: "lastPurchase", title: "Janela da última compra", description: "Comprou recentemente ou está sem comprar há um tempo.", icon: CalendarClock, editor: "days" },
      { id: "avgTicket", title: "Ticket médio", description: "Valor médio por pedido do cliente.", icon: Receipt, editor: "money" },
      { id: "totalSpent", title: "Total gasto acumulado (LTV)", description: "Soma de tudo o que o cliente já comprou.", icon: Wallet, editor: "money" },
      { id: "purchases", title: "Frequência de pedidos", description: "Quantas vezes o cliente já comprou.", icon: Repeat, editor: "count" },
    ],
  },
  {
    id: "contato",
    label: "Contato e localização",
    description: "Telefone, região e marcações do atendimento.",
    icon: MapPin,
    cards: [
      { id: "birthday", title: "Idade e aniversário", description: "Aniversariantes do dia, semana ou mês, ou faixa de idade.", icon: Cake, editor: "birthday" },
      { id: "ddd", title: "DDDs", description: "Região pelo DDD do telefone.", icon: PhoneCall, editor: "chips", chipHint: "Digite o DDD e tecle Enter (ex.: 62)" },
      { id: "state", title: "Estados (UF)", description: "Estado do cadastro do cliente.", icon: MapPinned, editor: "chips", chipHint: "Digite a UF e tecle Enter (ex.: GO)" },
      { id: "city", title: "Cidades", description: "Cidade do cadastro do cliente.", icon: MapPin, editor: "chips", chipHint: "Digite a cidade e tecle Enter" },
      { id: "tag", title: "Tags do atendimento", description: "Tags aplicadas nas conversas do WhatsApp.", icon: Tag, editor: "chips", chipHint: "Digite a tag e tecle Enter" },
      { id: "neighborhood", title: "Bairro", description: "Bairro do cadastro.", icon: MapPin, editor: "text" },
      { id: "phone", title: "Telefone", description: "Tem ou não telefone no cadastro.", icon: Phone, editor: "presence" },
      { id: "email", title: "E-mail", description: "Tem ou não e-mail no cadastro.", icon: AtSign, editor: "presence" },
      { id: "gender", title: "Gênero", description: "Gênero informado no cadastro.", icon: UserRound, editor: "select" },
      { id: "occupation", title: "Profissão", description: "Profissão informada no cadastro.", icon: Briefcase, editor: "text" },
    ],
  },
  {
    id: "crm",
    label: "Comportamento e CRM",
    description: "Pipeline, categoria e satisfação.",
    icon: Kanban,
    cards: [
      { id: "pipelineStage", title: "Etapa do pipeline", description: "Onde o cliente está agora no funil.", icon: Kanban, editor: "select" },
      { id: "category", title: "Categoria do contato", description: "Cliente, lead, NPS ou inativo.", icon: BadgeCheck, editor: "select" },
      { id: "npsAnswered", title: "Respondeu ao NPS", description: "Se já respondeu alguma pesquisa.", icon: MessageSquareHeart, editor: "select" },
      { id: "npsRating", title: "Nota de NPS", description: "Nota dada na pesquisa de satisfação.", icon: Star, editor: "number" },
      { id: "segment", title: "Segmento do contato", description: "Segmento gravado no cadastro.", icon: Layers, editor: "text" },
    ],
  },
];

const ALL_CARDS = CRITERION_GROUPS.flatMap((group) => group.cards);

function defaultRule(card: CardDef): SegmentRule {
  switch (card.editor) {
    case "days": return { campo: card.id, operador: "within_days", valor: "90" };
    case "money": return { campo: card.id, operador: "gte", valor: "" };
    case "count": return { campo: card.id, operador: "gte", valor: "2" };
    case "number": return { campo: card.id, operador: "gte", valor: "" };
    case "chips": return { campo: card.id, operador: "in", valor: "" };
    case "text": return { campo: card.id, operador: "contains", valor: "" };
    case "presence": return { campo: card.id, operador: "filled" };
    case "select": return { campo: card.id, operador: "eq", valor: getRuleField(card.id)?.options?.[0]?.value ?? "" };
    case "purchase": return { campo: card.id, operador: "yesterday" };
    case "campaign": return { campo: card.id, operador: "converted", valor: "" };
    case "birthday": return { campo: card.id, operador: "this_month" };
  }
}

/* ---------- Controles básicos ---------- */

const pillBase = "inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors cursor-pointer";
const pillOn = "border-[#002187] bg-[#002187] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]";
const pillOff = "border-slate-200 bg-white text-slate-600 hover:border-[#002187]/50 hover:text-[#051647] dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-300 dark:hover:border-[#C4D600]/60 dark:hover:text-white";
const fieldClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/10 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-100 dark:focus:border-[#C4D600] dark:focus:ring-[#C4D600]/15";

function Pills<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T | null; onChange: (value: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)} className={`${pillBase} ${value === option.value ? pillOn : pillOff}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

const toNumber = (text: string) => {
  const clean = text.replace(/[^\d,]/g, "").replace(",", ".");
  return clean === "" || clean === "." ? "" : String(Number(clean));
};
const formatMoney = (value: string | undefined) => {
  if (value === undefined || value === "" || !Number.isFinite(Number(value))) return "";
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Campo em reais: mostra "2.000,00" e grava "2000" na regra. */
function MoneyInput({ value, onChange, label }: { value: string | undefined; onChange: (value: string) => void; label: string }) {
  const [text, setText] = useState(formatMoney(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(formatMoney(value));
  }, [value, focused]);
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">R$</span>
      <input
        value={text}
        inputMode="decimal"
        placeholder="0,00"
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setText(formatMoney(value)); }}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d.,]/g, "");
          setText(next);
          onChange(toNumber(next.replace(/\./g, "")));
        }}
        className={`${fieldClass} pl-10 tabular-nums`}
      />
    </label>
  );
}

function NumberInput({ value, onChange, label, suffix, placeholder = "0" }: { value: string | undefined; onChange: (value: string) => void; label: string; suffix?: string; placeholder?: string }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <input value={value ?? ""} inputMode="numeric" placeholder={placeholder} onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))} className={`${fieldClass} tabular-nums ${suffix ? "pr-14" : ""}`} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">{suffix}</span>}
    </label>
  );
}

/* ---------- Editores por tipo de critério ---------- */

type EditorProps = { card: CardDef; rule: SegmentRule; update: (patch: Partial<SegmentRule>) => void };

const DAY_PRESETS = [30, 60, 90, 180, 365];

function DaysEditor({ rule, update }: EditorProps) {
  const mode = rule.operador === "older_days" ? "older_days" : rule.operador === "empty" ? "empty" : ["before", "after", "between"].includes(rule.operador) ? "dates" : "within_days";
  const preset = DAY_PRESETS.find((days) => String(days) === rule.valor);
  return (
    <div className="space-y-3">
      <Pills
        label="Tipo de janela"
        value={mode}
        onChange={(next) => {
          if (next === "dates") update({ operador: "between", valor: "", valor2: "" });
          else if (next === "empty") update({ operador: "empty", valor: "", valor2: "" });
          else update({ operador: next, valor: mode === "within_days" || mode === "older_days" ? rule.valor : "90", valor2: "" });
        }}
        options={[
          { value: "within_days", label: "Comprou nos últimos" },
          { value: "older_days", label: "Sem comprar há mais de" },
          { value: "empty", label: "Nunca comprou" },
          { value: "dates", label: "Entre datas" },
        ]}
      />
      {(mode === "within_days" || mode === "older_days") && (
        <div className="flex flex-wrap items-center gap-1.5">
          {DAY_PRESETS.map((days) => (
            <button key={days} type="button" aria-pressed={preset === days} onClick={() => update({ valor: String(days) })} className={`${pillBase} ${preset === days ? pillOn : pillOff}`}>
              {days === 365 ? "1 ano" : `${days}d`}
            </button>
          ))}
          <div className="w-36"><NumberInput label="Dias personalizados" value={preset ? "" : rule.valor} onChange={(value) => update({ valor: value })} suffix="dias" placeholder="Outro" /></div>
        </div>
      )}
      {mode === "dates" && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="Data inicial" value={rule.valor ?? ""} onChange={(event) => update({ operador: "between", valor: event.target.value })} className={`${fieldClass} w-auto`} />
          <span className="text-xs text-slate-400">até</span>
          <input type="date" aria-label="Data final" value={rule.valor2 ?? ""} onChange={(event) => update({ operador: "between", valor2: event.target.value })} className={`${fieldClass} w-auto`} />
        </div>
      )}
    </div>
  );
}

function RangeEditor({ rule, update, money }: EditorProps & { money: boolean }) {
  const operator = rule.operador === "between" ? "between" : rule.operador === "lt" || rule.operador === "lte" ? "lt" : rule.operador === "eq" ? "eq" : "gte";
  const Input = ({ value, onChange, label }: { value: string | undefined; onChange: (value: string) => void; label: string }) =>
    money ? <MoneyInput value={value} onChange={onChange} label={label} /> : <NumberInput value={value} onChange={onChange} label={label} />;
  return (
    <div className="space-y-3">
      <Pills
        label="Condição"
        value={operator}
        onChange={(next) => update({ operador: next, valor2: next === "between" ? rule.valor2 ?? "" : "" })}
        options={[
          { value: "gte", label: "Maior ou igual a" },
          { value: "lt", label: "Menor que" },
          ...(money ? [] : [{ value: "eq" as const, label: "Igual a" }]),
          { value: "between", label: "Entre valores" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        {Input({ value: rule.valor, onChange: (value) => update({ valor: value }), label: operator === "between" ? "Valor mínimo" : "Valor" })}
        {operator === "between" && (
          <>
            <span className="text-xs text-slate-400">e</span>
            {Input({ value: rule.valor2, onChange: (value) => update({ valor2: value }), label: "Valor máximo" })}
          </>
        )}
      </div>
    </div>
  );
}

function CountEditor(props: EditorProps) {
  const { rule, update } = props;
  const preset = rule.operador === "eq" && rule.valor === "1" ? "one"
    : rule.operador === "between" && rule.valor === "2" && rule.valor2 === "5" ? "few"
    : rule.operador === "gte" && rule.valor === "5" ? "many" : "custom";
  const [custom, setCustom] = useState(preset === "custom");
  return (
    <div className="space-y-3">
      <Pills
        label="Frequência"
        value={custom ? "custom" : preset}
        onChange={(next) => {
          setCustom(next === "custom");
          if (next === "one") update({ operador: "eq", valor: "1", valor2: "" });
          if (next === "few") update({ operador: "between", valor: "2", valor2: "5" });
          if (next === "many") update({ operador: "gte", valor: "5", valor2: "" });
        }}
        options={[
          { value: "one", label: "Comprou 1 vez" },
          { value: "few", label: "2 a 5 vezes" },
          { value: "many", label: "5 ou mais" },
          { value: "custom", label: "Personalizar" },
        ]}
      />
      {custom && <RangeEditor {...props} money={false} />}
    </div>
  );
}

function ChipsEditor({ card, rule, update }: EditorProps) {
  const [draft, setDraft] = useState("");
  const items = splitRuleList(rule.valor);
  const exclude = rule.operador === "not_in" || rule.operador === "neq";
  const normalize = (value: string) => (card.id === "ddd" ? value.replace(/\D/g, "").slice(0, 2) : card.id === "state" ? value.trim().toUpperCase().slice(0, 2) : value.trim());
  const commit = (raw: string) => {
    const additions = raw.split(/[,;\n]/).map(normalize).filter(Boolean);
    if (additions.length === 0) return;
    update({ operador: exclude ? "not_in" : "in", valor: [...new Set([...items, ...additions])].join(",") });
    setDraft("");
  };
  return (
    <div className="space-y-3">
      <Pills
        label="Incluir ou excluir"
        value={exclude ? "not_in" : "in"}
        onChange={(next) => update({ operador: next, valor: items.join(",") })}
        options={[{ value: "in", label: "É um destes" }, { value: "not_in", label: "Não é nenhum destes" }]}
      />
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 focus-within:border-[#002187] focus-within:ring-2 focus-within:ring-[#002187]/10 dark:border-slate-700 dark:bg-[#07194f] dark:focus-within:border-[#C4D600]">
        {items.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 rounded-full bg-[#002187]/10 py-1 pl-2.5 pr-1 text-xs font-semibold text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">
            {item}
            <button type="button" aria-label={`Remover ${item}`} onClick={() => update({ valor: items.filter((value) => value !== item).join(",") })} className="grid h-4 w-4 place-items-center rounded-full hover:bg-[#002187]/20 dark:hover:bg-[#C4D600]/25 cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          inputMode={card.id === "ddd" ? "numeric" : "text"}
          aria-label={card.title}
          placeholder={items.length ? "Adicionar..." : card.chipHint}
          onChange={(event) => {
            const value = event.target.value;
            if (/[,;]$/.test(value)) commit(value);
            else setDraft(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); commit(draft); }
            if (event.key === "Backspace" && !draft && items.length) update({ valor: items.slice(0, -1).join(",") });
          }}
          onBlur={() => commit(draft)}
          className="h-7 min-w-[10rem] flex-1 bg-transparent px-1 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
      </div>
    </div>
  );
}

function TextEditor({ rule, update }: EditorProps) {
  const needsValue = rule.operador !== "filled" && rule.operador !== "empty";
  return (
    <div className="space-y-3">
      <Pills
        label="Condição"
        value={(["contains", "eq", "neq", "filled", "empty"].includes(rule.operador) ? rule.operador : "contains") as "contains" | "eq" | "neq" | "filled" | "empty"}
        onChange={(next) => update({ operador: next })}
        options={[
          { value: "contains", label: "Contém" },
          { value: "eq", label: "É igual a" },
          { value: "neq", label: "É diferente de" },
          { value: "filled", label: "Preenchido" },
          { value: "empty", label: "Vazio" },
        ]}
      />
      {needsValue && <input value={rule.valor ?? ""} onChange={(event) => update({ valor: event.target.value })} placeholder="Digite o valor" className={fieldClass} />}
    </div>
  );
}

function PresenceEditor({ rule, update }: EditorProps) {
  return (
    <Pills
      label="Condição"
      value={rule.operador === "empty" ? "empty" : "filled"}
      onChange={(next) => update({ operador: next })}
      options={[{ value: "filled", label: "Tem cadastrado" }, { value: "empty", label: "Não tem" }]}
    />
  );
}

function SelectEditor({ card, rule, update }: EditorProps) {
  const options = getRuleField(card.id)?.options ?? [];
  return (
    <div className="space-y-3">
      <Pills label="Condição" value={rule.operador === "neq" ? "neq" : "eq"} onChange={(next) => update({ operador: next })} options={[{ value: "eq", label: "É" }, { value: "neq", label: "Não é" }]} />
      <Pills label={card.title} value={rule.valor ?? null} onChange={(next) => update({ valor: next })} options={options.map((option) => ({ value: option.value, label: option.label }))} />
    </div>
  );
}

const filterLabelClass = "mb-1.5 block truncate whitespace-nowrap text-xs font-medium leading-none text-slate-500 dark:text-slate-400";

function PurchaseEditor({ rule, update }: EditorProps) {
  const mode = (["today", "yesterday", "within_days", "between"].includes(rule.operador) ? rule.operador : "yesterday") as "today" | "yesterday" | "within_days" | "between";
  const filters = rule.filtros ?? {};
  const setFilter = (patch: Partial<NonNullable<SegmentRule["filtros"]>>) => {
    const next = { ...filters, ...patch };
    const clean = Object.fromEntries(Object.entries(next).filter(([, value]) => value)) as NonNullable<SegmentRule["filtros"]>;
    update({ filtros: Object.keys(clean).length ? clean : undefined });
  };
  return (
    <div className="space-y-3">
      <Pills
        label="Quando comprou"
        value={mode}
        onChange={(next) => update({ operador: next, valor: next === "within_days" ? "7" : "", valor2: "" })}
        options={[
          { value: "today", label: "Hoje" },
          { value: "yesterday", label: "Ontem" },
          { value: "within_days", label: "Nos últimos" },
          { value: "between", label: "Entre datas" },
        ]}
      />
      {mode === "within_days" && (
        <div className="w-36"><NumberInput label="Quantidade de dias" value={rule.valor} onChange={(value) => update({ valor: value })} suffix="dias" placeholder="7" /></div>
      )}
      {mode === "between" && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="Data inicial" value={rule.valor ?? ""} onChange={(event) => update({ valor: event.target.value })} className={`${fieldClass} w-auto`} />
          <span className="text-xs text-slate-400">até</span>
          <input type="date" aria-label="Data final" value={rule.valor2 ?? ""} onChange={(event) => update({ valor2: event.target.value })} className={`${fieldClass} w-auto`} />
        </div>
      )}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Filtros adicionais (opcionais)</p>
        {/* items-end: mesmo que um rótulo quebre linha em tela estreita, as caixas ficam niveladas pela base. */}
        <div className="grid items-end gap-2 sm:grid-cols-3">
          <label className="flex min-w-0 flex-col justify-end">
            <span className={filterLabelClass}>Loja</span>
            <input value={filters.loja ?? ""} onChange={(event) => setFilter({ loja: event.target.value })} placeholder="Ex.: 12" className={fieldClass} />
          </label>
          <div className="flex min-w-0 flex-col justify-end">
            <span className={filterLabelClass} aria-hidden="true">Valor mínimo</span>
            <MoneyInput label="Valor mínimo do pedido" value={filters.valorMin} onChange={(value) => setFilter({ valorMin: value })} />
          </div>
          <label className="flex min-w-0 flex-col justify-end">
            <span className={filterLabelClass}>Produto / Categoria</span>
            <input value={filters.produto ?? ""} onChange={(event) => setFilter({ produto: event.target.value })} placeholder="Ex.: lente, armação" className={fieldClass} />
          </label>
        </div>
      </div>
    </div>
  );
}

type CampaignOption = { id: string; nome: string; enviadaEm: string; enviados: number };
let campaignOptionsRequest: Promise<CampaignOption[]> | null = null;
const loadCampaignOptions = () => {
  campaignOptionsRequest ??= fetch("/api/segments/campaigns", { cache: "no-store" })
    .then(async (response) => {
      const body = (await response.json().catch(() => null)) as { data?: CampaignOption[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível carregar as campanhas.");
      return body?.data ?? [];
    })
    .catch((error: unknown) => { campaignOptionsRequest = null; throw error; });
  return campaignOptionsRequest;
};
const sentLabel = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function CampaignEditor({ rule, update }: EditorProps) {
  const [options, setOptions] = useState<CampaignOption[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    loadCampaignOptions().then((data) => { if (active) setOptions(data); }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar as campanhas."); });
    return () => { active = false; };
  }, []);
  return (
    <div className="space-y-3">
      <Pills
        label="Resultado"
        value={rule.operador === "not_converted" ? "not_converted" : "converted"}
        onChange={(next) => update({ operador: next })}
        options={[{ value: "converted", label: "Converteram após receber" }, { value: "not_converted", label: "Receberam e não compraram" }]}
      />
      <select
        aria-label="Campanha"
        value={rule.valor ?? ""}
        disabled={!options}
        onChange={(event) => {
          const option = options?.find((item) => item.id === event.target.value);
          update({ valor: event.target.value, valor2: option ? `${option.nome} (${sentLabel(option.enviadaEm)})` : "" });
        }}
        className={`${fieldClass} cursor-pointer`}
      >
        <option value="">{options ? (options.length ? "Selecione a campanha" : "Nenhum disparo enviado ainda") : "Carregando campanhas..."}</option>
        {options?.map((option) => (
          <option key={option.id} value={option.id}>{option.nome} · {sentLabel(option.enviadaEm)} · {option.enviados.toLocaleString("pt-BR")} enviados</option>
        ))}
      </select>
      {error && <p className="text-[11px] font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p>}
      <p className="text-[11px] text-slate-400">Mesma regra das métricas da campanha: compra no ERP depois do envio e dentro da janela de conversão. Só contam mensagens entregues.</p>
    </div>
  );
}

function BirthdayEditor({ rule, update }: EditorProps) {
  const isAge = rule.operador === "age";
  const when = (["today", "this_week", "this_month", "month"].includes(rule.operador) ? rule.operador : "this_month") as "today" | "this_week" | "this_month" | "month";
  return (
    <div className="space-y-3">
      <Pills
        label="Tipo de critério"
        value={isAge ? "age" : "birthday"}
        onChange={(next) => update(next === "age" ? { operador: "age", valor: "40", valor2: "" } : { operador: "this_month", valor: "", valor2: "" })}
        options={[{ value: "birthday", label: "Aniversariantes" }, { value: "age", label: "Faixa etária" }]}
      />
      {!isAge && (
        <div className="flex flex-wrap items-center gap-2">
          <Pills
            label="Quando faz aniversário"
            value={when}
            onChange={(next) => update({ operador: next, valor: next === "month" ? String(new Date().getMonth() + 1) : "", valor2: "" })}
            options={[
              { value: "today", label: "Hoje" },
              { value: "this_week", label: "Esta semana" },
              { value: "this_month", label: "Este mês" },
              { value: "month", label: "Mês específico" },
            ]}
          />
          {when === "month" && (
            <select aria-label="Mês do aniversário" value={rule.valor ?? ""} onChange={(event) => update({ valor: event.target.value })} className={`${fieldClass} w-40 cursor-pointer`}>
              {MONTH_NAMES.map((name, index) => <option key={name} value={String(index + 1)}>{name}</option>)}
            </select>
          )}
        </div>
      )}
      {isAge && (
        <div className="grid grid-cols-2 items-end gap-3">
          <div className="flex min-w-0 flex-col justify-end">
            <span className={filterLabelClass} aria-hidden="true">Idade mínima</span>
            <NumberInput label="Idade mínima" value={rule.valor} onChange={(value) => update({ valor: value.slice(0, 3) })} suffix="anos" placeholder="Ex.: 40" />
          </div>
          <div className="flex min-w-0 flex-col justify-end">
            <span className={filterLabelClass} aria-hidden="true">Idade máxima</span>
            <NumberInput label="Idade máxima" value={rule.valor2} onChange={(value) => update({ valor2: value.slice(0, 3) })} suffix="anos" placeholder="Sem limite" />
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-400">Usa a data de nascimento do cadastro; contatos sem data ficam de fora.</p>
    </div>
  );
}

function Editor(props: EditorProps) {
  switch (props.card.editor) {
    case "birthday": return <BirthdayEditor {...props} />;
    case "purchase": return <PurchaseEditor {...props} />;
    case "campaign": return <CampaignEditor {...props} />;
    case "days": return <DaysEditor {...props} />;
    case "money": return <RangeEditor {...props} money />;
    case "count": return <CountEditor {...props} />;
    case "number": return <RangeEditor {...props} money={false} />;
    case "chips": return <ChipsEditor {...props} />;
    case "text": return <TextEditor {...props} />;
    case "presence": return <PresenceEditor {...props} />;
    case "select": return <SelectEditor {...props} />;
  }
}

/* ---------- Card com toggle ---------- */

function CriterionCard({ card, rule, onToggle, update }: { card: CardDef; rule: SegmentRule | undefined; onToggle: (on: boolean) => void; update: (patch: Partial<SegmentRule>) => void }) {
  const active = Boolean(rule);
  const Icon = card.icon;
  const error = rule ? validateRule(rule) : null;
  return (
    <article className={`rounded-2xl border transition-all duration-200 ${active ? "border-[#002187]/40 bg-white shadow-sm ring-1 ring-[#002187]/10 dark:border-[#C4D600]/40 dark:bg-[#07194f] dark:ring-[#C4D600]/10" : "border-slate-200 bg-white/60 hover:border-slate-300 dark:border-slate-700/80 dark:bg-[#07194f]/40 dark:hover:border-slate-600"}`}>
      <button type="button" role="switch" aria-checked={active} onClick={() => onToggle(!active)} className="flex w-full items-center gap-3 p-4 text-left cursor-pointer">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${active ? "bg-[#002187] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900 dark:text-white">{card.title}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{card.description}</span>
        </span>
        <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${active ? "bg-[#002187] dark:bg-[#C4D600]" : "bg-slate-300 dark:bg-slate-600"}`}>
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${active ? "translate-x-5 dark:bg-[#051647]" : ""}`} />
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          {rule && (
            <div className="space-y-2 border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-800">
              <Editor card={card} rule={rule} update={update} />
              {error && <p className="text-[11px] font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ---------- Construtor ---------- */

/**
 * Construtor de critérios: um card por campo, agrupado por tema. Ligar o card cria a regra; desligar remove.
 * Regras antigas de campos sem card continuam preservadas e são listadas no fim.
 */
export function CriterionBuilder({ rules, onChange, match = "all", onMatchChange }: { rules: SegmentRule[]; onChange: (rules: SegmentRule[]) => void; match?: RuleMatch; onMatchChange?: (match: RuleMatch) => void }) {
  const [groupId, setGroupId] = useState(CRITERION_GROUPS[0].id);
  const group = CRITERION_GROUPS.find((item) => item.id === groupId) ?? CRITERION_GROUPS[0];
  const ruleFor = (id: FieldId) => rules.find((rule) => rule.campo === id);
  const toggle = (card: CardDef, on: boolean) => onChange(on ? [...rules, defaultRule(card)] : rules.filter((rule) => rule.campo !== card.id));
  const update = (id: FieldId, patch: Partial<SegmentRule>) => {
    const index = rules.findIndex((rule) => rule.campo === id);
    if (index >= 0) onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };
  const others = rules.filter((rule) => !ALL_CARDS.some((card) => card.id === rule.campo));

  return (
    <div className="space-y-4">
      {onMatchChange && rules.length >= 2 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-[#07194f]/60">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Combinar os {rules.length} filtros:</span>
          <Pills
            label="Como combinar os filtros"
            value={match}
            onChange={onMatchChange}
            options={[{ value: "all", label: "Todos (E)" }, { value: "any", label: "Qualquer um (OU)" }]}
          />
        </div>
      )}
      <div role="tablist" aria-label="Grupos de critérios" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {CRITERION_GROUPS.map((item) => {
          const Icon = item.icon;
          const count = item.cards.filter((card) => ruleFor(card.id)).length;
          const selected = item.id === group.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setGroupId(item.id)}
              className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors cursor-pointer ${selected ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-[#07194f]/60 dark:hover:border-slate-600"}`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#002187] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  {item.label}
                  {count > 0 && <span className="rounded-full bg-[#C4D600] px-1.5 text-[10px] font-bold text-[#051647]">{count}</span>}
                </span>
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{item.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={group.label} className="grid gap-3 lg:grid-cols-2">
        {group.cards.map((card) => (
          <CriterionCard key={card.id} card={card} rule={ruleFor(card.id)} onToggle={(on) => toggle(card, on)} update={(patch) => update(card.id, patch)} />
        ))}
      </div>

      {others.length > 0 && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          Este critério também tem {others.length} regra(s) de versões anteriores, mantidas como estão.
        </p>
      )}
    </div>
  );
}

export type AudienceSample = { id: string; nome: string; telefone: string; ultimaCompra: string | null; valorUltimaCompra: number | null };
export type AudiencePreview = { loading: boolean; count: number | null; error: string; sample: AudienceSample[]; incomplete: number };

const PREVIEW_SAMPLE = 8;

/** Contagem ao vivo do público (com amostra dos primeiros contatos): só regras completas entram; responde ~0,5 s após a última alteração. */
export function useAudiencePreview(rules: SegmentRule[], match: RuleMatch = "all"): AudiencePreview {
  const [state, setState] = useState<{ loading: boolean; count: number | null; error: string; sample: AudienceSample[] }>({ loading: false, count: null, error: "", sample: [] });
  const valid = rules.filter((rule) => !validateRule(rule));
  const signature = JSON.stringify({ valid, match });
  useEffect(() => {
    const current = JSON.parse(signature) as { valid: SegmentRule[]; match: RuleMatch };
    if (current.valid.length === 0) {
      setState({ loading: false, count: null, error: "", sample: [] });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    const timer = setTimeout(() => {
      fetch("/api/segments/audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: { preview: [{ id: "preview", nome: "Prévia", tipo: "geral", regras: current.valid, combinar: current.match }] }, sample: PREVIEW_SAMPLE }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as { counts?: Record<string, number>; samples?: Record<string, AudienceSample[]>; error?: string } | null;
          if (!response.ok) throw new Error(body?.error ?? "Não foi possível calcular o público.");
          setState({ loading: false, count: body?.counts?.preview ?? 0, error: "", sample: body?.samples?.preview ?? [] });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setState({ loading: false, count: null, error: error instanceof Error ? error.message : "Não foi possível calcular o público.", sample: [] });
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [signature]);
  return { ...state, incomplete: rules.length - valid.length };
}

const dayBr = (day: string) => day.split("-").reverse().join("/");
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Primeiros contatos do público, para conferir na hora se o filtro pegou as pessoas certas. */
export function AudiencePreviewList({ preview }: { preview: AudiencePreview }): ReactNode {
  if (preview.count === null && !preview.loading) return null;
  return (
    <section aria-label="Prévia do público" className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#07194f]">
      <header className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Prévia do público</h3>
        <span className={`text-xs text-slate-500 dark:text-slate-400 ${preview.loading ? "opacity-50" : ""}`}>
          <b className="tabular-nums text-slate-900 dark:text-white">{preview.count === null ? "…" : preview.count.toLocaleString("pt-BR")}</b> clientes encontrados
        </span>
      </header>
      {preview.sample.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400">{preview.loading ? "Buscando contatos..." : "Nenhum contato atende aos filtros."}</p>
      ) : (
        <ul className={`divide-y divide-slate-100 transition-opacity dark:divide-slate-800 ${preview.loading ? "opacity-50" : ""}`}>
          {preview.sample.map((contact) => (
            <li key={contact.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <p className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{contact.nome}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">{contact.telefone ? formatPhone(contact.telefone) : "sem telefone"}</span>
              </p>
              <p className="shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {contact.ultimaCompra ? <>Última compra {dayBr(contact.ultimaCompra)}{contact.valorUltimaCompra ? <> · <span className="font-semibold text-emerald-600 dark:text-emerald-400">{brl(contact.valorUltimaCompra)}</span></> : null}</> : "Sem compra no ERP"}
              </p>
            </li>
          ))}
        </ul>
      )}
      {preview.count !== null && preview.count > preview.sample.length && preview.sample.length > 0 && (
        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800">Amostra de {preview.sample.length} de {preview.count.toLocaleString("pt-BR")} contatos.</p>
      )}
    </section>
  );
}

export function AudienceCounter({ preview }: { preview: AudiencePreview }): ReactNode {
  return (
    <div role="status" aria-live="polite" className="flex min-w-0 items-center gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${preview.count !== null ? "bg-[#C4D600] text-[#051647]" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
        <Users className={`h-5 w-5 ${preview.loading ? "animate-pulse" : ""}`} />
      </span>
      <span className="min-w-0">
        {preview.error ? (
          <span className="block text-sm font-medium text-[#9a3d12] dark:text-[#F7915E]">{preview.error}</span>
        ) : preview.count === null && !preview.loading ? (
          <span className="block text-sm text-slate-500 dark:text-slate-400">Ative um filtro para ver o tamanho do público.</span>
        ) : (
          <span className="block text-sm text-slate-700 dark:text-slate-200">
            <b className={`text-base font-bold tabular-nums text-[#051647] transition-opacity dark:text-white ${preview.loading ? "opacity-50" : ""}`}>{preview.count === null ? "…" : preview.count.toLocaleString("pt-BR")}</b>{" "}
            contatos encontrados com os critérios atuais
          </span>
        )}
        {preview.incomplete > 0 && <span className="block text-[11px] text-slate-400">{preview.incomplete} filtro(s) incompleto(s) fora da contagem</span>}
      </span>
    </div>
  );
}
