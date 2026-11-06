"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const MIME_TYPES = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const MIN_SECONDS = 1;
const MIN_BYTES = 1200;

export function useRecorder(onError: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const release = useCallback(() => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
    setRecording(false);
    setSeconds(0);
  }, []);

  useEffect(() => release, [release]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Este navegador não permite gravar áudio.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Sem acesso ao microfone. Libere a permissão no cadeado da barra de endereço e tente de novo.");
      return;
    }
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const instance = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    instance.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    instance.start();
    recorder.current = instance;
    startedAt.current = Date.now();
    setRecording(true);
    setSeconds(0);
    timer.current = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
  };

  const discard = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    release();
  };

  /** Encerra e devolve o arquivo; gravação curta demais costuma ser clique acidental. */
  const finish = () =>
    new Promise<File | null>((resolve) => {
      const instance = recorder.current;
      if (!instance) return resolve(null);
      const duration = (Date.now() - startedAt.current) / 1000;
      instance.onstop = () => {
        const type = instance.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        release();
        if (duration < MIN_SECONDS || blob.size < MIN_BYTES) {
          onError("Gravação muito curta. Segure por pelo menos 1 segundo.");
          return resolve(null);
        }
        const extension = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        resolve(new File([blob], `audio-${Date.now()}.${extension}`, { type }));
      };
      instance.stop();
    });

  return { recording, seconds, start, discard, finish };
}
