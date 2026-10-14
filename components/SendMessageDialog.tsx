"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, Send, Video, X } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";

const MAX_FILE_SIZE = 16 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPT = "image/*,video/*,application/pdf";

export interface OutgoingMessage {
  text: string;
  files: File[];
}

interface SendMessageDialogProps {
  recipientName: string;
  recipientPhone: string;
  onClose: () => void;
  onSend: (message: OutgoingMessage) => Promise<void>;
}

function isAllowed(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("video/") || file.type === "application/pdf";
}

function formatSize(bytes: number) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function FileIcon({ file }: { file: File }) {
  const className = "h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]";
  if (file.type.startsWith("image/")) return <ImageIcon className={className} />;
  if (file.type.startsWith("video/")) return <Video className={className} />;
  return <FileText className={className} />;
}

function Bubble({ children, time }: { children: React.ReactNode; time: string }) {
  return (
    <div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1 text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
      {children}
      <p className="px-1.5 pb-0.5 text-right text-[10px] text-[#667781] dark:text-[#8fb5ab]">{time} ✓✓</p>
    </div>
  );
}

function Caption({ text }: { text: string }) {
  if (!text) return null;
  return <p className="whitespace-pre-wrap break-words px-1.5 pt-1 text-[13px] leading-snug">{text}</p>;
}

function MediaPreview({ file, caption, time }: { file: File; caption: string; time: string }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <Bubble time={time}>
      {file.type.startsWith("image/") && url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.name} className="max-h-56 w-full rounded-md object-cover" />
      )}
      {file.type.startsWith("video/") && url && (
        <video src={url} controls preload="metadata" className="max-h-56 w-full rounded-md bg-black" />
      )}
      {file.type === "application/pdf" && (
        <div className="flex items-center gap-2.5 rounded-md bg-black/5 p-2.5 dark:bg-black/20">
          <FileText className="h-8 w-8 shrink-0 text-[#e53935]" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{file.name}</p>
            <p className="text-[11px] text-[#667781] dark:text-[#8fb5ab]">PDF · {formatSize(file.size)}</p>
          </div>
        </div>
      )}
      <Caption text={caption} />
    </Bubble>
  );
}

function ChatPreview({ text, files }: { text: string; files: File[] }) {
  const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const trimmed = text.trim();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-lg bg-[#efeae2] p-3 dark:bg-[#0b141a]" aria-label="Prévia da mensagem">
      {files.length === 0 && !trimmed && (
        <p className="m-auto text-center text-xs text-[#667781]">A prévia da mensagem aparece aqui, como o destinatário verá.</p>
      )}
      {files.length === 0 && trimmed && (
        <Bubble time={time}>
          <Caption text={trimmed} />
        </Bubble>
      )}
      {files.map((file, index) => (
        <MediaPreview key={`${file.name}-${index}`} file={file} caption={index === 0 ? trimmed : ""} time={time} />
      ))}
    </div>
  );
}

export function SendMessageDialog({ recipientName, recipientPhone, onClose, onSend }: SendMessageDialogProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const invalid = incoming.find((file) => !isAllowed(file));
    if (invalid) return setError(`"${invalid.name}" não é suportado. Envie imagem, vídeo ou PDF.`);
    const tooBig = incoming.find((file) => file.size > MAX_FILE_SIZE);
    if (tooBig) return setError(`"${tooBig.name}" excede o limite de 16 MB.`);
    if (files.length + incoming.length > MAX_FILES) return setError(`Máximo de ${MAX_FILES} anexos por mensagem.`);
    setError("");
    setFiles((current) => [...current, ...incoming]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    if (!text.trim() && files.length === 0) return setError("Escreva uma mensagem ou anexe um arquivo.");
    setSending(true);
    setError("");
    try {
      await onSend({ text: text.trim(), files });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  return (
    <EntityDialog
      titleId="send-message-title"
      title="Enviar mensagem"
      description={`Para ${recipientName}${recipientPhone ? ` · ${recipientPhone}` : ""}`}
      onClose={onClose}
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <ChatPreview text={text} files={files} />

        {files.length > 0 && (
          <ul className="max-h-20 shrink-0 space-y-1 overflow-y-auto">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1 text-xs dark:border-slate-700">
                <FileIcon file={file} />
                <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">{file.name}</span>
                <span className="text-slate-500">{formatSize(file.size)}</span>
                <button
                  type="button"
                  aria-label={`Remover ${file.name}`}
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  className="rounded p-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="flex shrink-0 flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          {files.length > 0 ? "Legenda" : "Mensagem"}
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={4096}
            placeholder={files.length > 0 ? "Adicione uma legenda..." : "Digite a mensagem..."}
            className="h-20 resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
          />
        </label>

        {error && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(event) => addFiles(event.target.files)} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
          >
            <Paperclip className="h-3.5 w-3.5" /> Anexar
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Cancelar</button>
            <button
              type="button"
              onClick={submit}
              disabled={sending}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3 text-xs font-bold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" /> {sending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </EntityDialog>
  );
}
