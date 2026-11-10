"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AtSign,
  BadgeCheck,
  CalendarClock,
  Briefcase,
  Kanban,
  Layers,
  MapPin,
  MapPinned,
  MessageSquareHeart,
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
import { getRuleField, splitRuleList, validateRule, type SegmentRule } from "@/lib/segment-rules";

type FieldId =
  | "lastPurchase" | "avgTicket" | "totalSpent" | "purchases"
  | "ddd" | "state" | "city" | "neighborhood" | "tag" | "phone" | "email" | "gender" | "occupation"
  | "pipelineStage" | "category" | "npsAnswered" | "npsRating" | "segment";

type EditorKind = "days" | "money" | "count" | "number" | "chips" | "text" | "presence" | "select";

type CardDef = { id: FieldId; title: string; description: string; icon: LucideIcon; editor: EditorKind; chipHint?: string };

type GroupDef = { id: string; label: string; description: string; icon: LucideIcon; cards: CardDef[] };

export const CRITERION_GROUPS: GroupDef[] = [
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

function Editor(props: EditorProps) {
  switch (props.card.editor) {
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
export function CriterionBuilder({ rules, onChange }: { rules: SegmentRule[]; onChange: (rules: SegmentRule[]) => void }) {
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
      <div role="tablist" aria-label="Grupos de critérios" className="grid gap-2 sm:grid-cols-3">
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

/** Contagem ao vivo do público: só regras completas entram; responde ~0,5 s após a última alteração. */
export function useAudiencePreview(rules: SegmentRule[]) {
  const [state, setState] = useState<{ loading: boolean; count: number | null; error: string }>({ loading: false, count: null, error: "" });
  const valid = rules.filter((rule) => !validateRule(rule));
  const signature = JSON.stringify(valid);
  useEffect(() => {
    const current = JSON.parse(signature) as SegmentRule[];
    if (current.length === 0) {
      setState({ loading: false, count: null, error: "" });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    const timer = setTimeout(() => {
      fetch("/api/segments/audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: { preview: [{ id: "preview", nome: "Prévia", tipo: "geral", regras: current }] } }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as { counts?: Record<string, number>; error?: string } | null;
          if (!response.ok) throw new Error(body?.error ?? "Não foi possível calcular o público.");
          setState({ loading: false, count: body?.counts?.preview ?? 0, error: "" });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setState({ loading: false, count: null, error: error instanceof Error ? error.message : "Não foi possível calcular o público." });
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [signature]);
  return { ...state, incomplete: rules.length - valid.length };
}

export function AudienceCounter({ rules }: { rules: SegmentRule[] }): ReactNode {
  const preview = useAudiencePreview(rules);
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
