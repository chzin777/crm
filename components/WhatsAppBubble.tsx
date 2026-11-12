"use client";
import { ExternalLink, FileText, Image as ImageIcon, Phone, Reply } from "lucide-react";
import { fillTemplate } from "@/lib/chat/template-variables";

type Props = {
  /** URL da imagem; "" mostra o espaço reservado. */
  image?: string | null;
  /** Cabeçalho de vídeo ou documento, pelo nome do arquivo. */
  mediaLabel?: string | null;
  headerText?: string;
  headerValues?: string[];
  body: string;
  footer?: string;
  values?: string[];
  buttons?: { type: string; text: string }[];
};

export function WhatsAppBubble({ image, mediaLabel, headerText, headerValues = [], body, footer, values = [], buttons = [] }: Props) {
  const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return (
    <div className="rounded-lg bg-[#efeae2] p-3 dark:bg-[#0b141a]" aria-label="Prévia da mensagem">
      <div className="w-fit max-w-[92%]">
      <div className="rounded-lg rounded-tl-none bg-white p-1 text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
        {image === "" && (
          <div className="grid h-28 w-60 max-w-full place-items-center rounded-md bg-slate-200 text-slate-400 dark:bg-slate-700"><ImageIcon className="h-7 w-7" /></div>
        )}
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="Imagem do cabeçalho" className="max-h-44 w-full rounded-md object-cover" />
        )}
        {mediaLabel && (
          <div className="flex h-16 w-60 max-w-full items-center gap-2 rounded-md bg-slate-200 px-3 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-200"><FileText className="h-5 w-5 shrink-0" /><span className="truncate">{mediaLabel}</span></div>
        )}
        {headerText && <p className="whitespace-pre-wrap break-words px-1.5 pt-1 text-[13px] font-bold leading-snug">{fillTemplate(headerText, headerValues)}</p>}
        <p className="whitespace-pre-wrap break-words px-1.5 pt-1 text-[13px] leading-snug">{fillTemplate(body, values) || <span className="text-[#667781]">A mensagem aparece aqui.</span>}</p>
        {footer && <p className="px-1.5 pt-1 text-[11px] text-[#667781] dark:text-[#8696a0]">{footer}</p>}
        <p className="px-1.5 pb-0.5 text-right text-[10px] text-[#667781] dark:text-[#8696a0]">{time}</p>
      </div>
      {buttons.map((button, index) => (
        <div key={index} className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-[#00a5f4] shadow-sm dark:bg-[#202c33]">
          {button.type === "URL" && <ExternalLink className="h-3.5 w-3.5" />}
          {button.type === "PHONE_NUMBER" && <Phone className="h-3.5 w-3.5" />}
          {button.type === "QUICK_REPLY" && <Reply className="h-3.5 w-3.5" />}
          <span className="truncate">{button.text || "Botão"}</span>
        </div>
      ))}
      </div>
    </div>
  );
}
