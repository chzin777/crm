"use client";

import { ChevronDown } from "lucide-react";
import { FloatingMenu } from "@/components/chat/FloatingMenu";
import { PRIORITY_LABELS, type ChatPriority } from "@/lib/chat/types";

const DOT_STYLES: Record<ChatPriority, string> = {
  low: "bg-sky-500",
  normal: "bg-emerald-500",
  high: "bg-[#F7915E]",
  urgent: "bg-red-500",
};

const PILL_CLASS = "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-2.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300";

const Dot = ({ priority }: { priority: ChatPriority }) => <span className={`h-2 w-2 rounded-full ${DOT_STYLES[priority]}`} />;

type Props = {
  priority: ChatPriority;
  onChange?: (priority: ChatPriority) => void;
};

export function PriorityPill({ priority, onChange }: Props) {
  if (!onChange) {
    return (
      <span title={`Prioridade: ${PRIORITY_LABELS[priority]}`} className={PILL_CLASS}>
        <Dot priority={priority} />
        {PRIORITY_LABELS[priority]}
      </span>
    );
  }

  return (
    <FloatingMenu
      label={`Prioridade: ${PRIORITY_LABELS[priority]}`}
      widthClassName="w-40"
      triggerClassName={`${PILL_CLASS} cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-white/10`}
      trigger={(
        <>
          <Dot priority={priority} />
          {PRIORITY_LABELS[priority]}
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </>
      )}
      items={(Object.keys(PRIORITY_LABELS) as ChatPriority[]).map((key) => ({
        label: PRIORITY_LABELS[key],
        icon: <Dot priority={key} />,
        checked: key === priority,
        onSelect: () => {
          if (key !== priority) onChange(key);
        },
      }))}
    />
  );
}
