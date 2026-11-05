"use client";

import { useEffect, useMemo } from "react";
import { FileText } from "lucide-react";

export function formatFileSize(bytes: number) {
 return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function Bubble({ children, time }: { children: React.ReactNode; time: string }) {
 return (
 <div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1 text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
 {children}
 <p className="px-1.5 pb-0.5 text-right text-[10px] text-[#667781] dark:text-[#8fb5ab]">{time} ✓✓</p>
 </div>
 );
}

export function Caption({ text }: { text: string }) {
 if (!text) return null;
 return <p className="whitespace-pre-wrap break-words px-1.5 pt-1 text-[13px] leading-snug">{text}</p>;
}

export function MediaPreview({ file, caption, time }: { file: File; caption: string; time: string }) {
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
 <p className="text-[11px] text-[#667781] dark:text-[#8fb5ab]">PDF · {formatFileSize(file.size)}</p>
 </div>
 </div>
 )}
 <Caption text={caption} />
 </Bubble>
 );
}

export function ChatPreview({ text, files }: { text: string; files: File[] }) {
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