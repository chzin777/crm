"use client";
import { useState } from "react";
import { PreviewBubble, PreviewFrame, PreviewHint, PreviewNote } from "@/components/chat/ChatPreview";
import { npsCommentPrompt, npsPrompt, type ChatMenuSettings } from "@/lib/chat/settings";
import { fillVariables } from "@/lib/chat/text";
import { NPS_BANDS, NPS_BAND_BADGE, NPS_LIST_BUTTON, buildNpsList, npsBand, npsListText } from "@/lib/nps-scale";

const SCORES = Array.from({ length: 11 }, (_, index) => index);

/** Encerramento como o cliente vê: despedida, pesquisa de 0 a 10, convite ao comentário e agradecimento. */
export function ClosingSimulator({ settings }: { settings: ChatMenuSettings }) {
  const [answer, setAnswer] = useState<number | null>(null);
  const [commented, setCommented] = useState(false);

  const reset = () => {
    setAnswer(null);
    setCommented(false);
  };

  // Texto novo no formulário: a simulação volta ao início para mostrar a versão atual.
  const signature = JSON.stringify([settings.farewellText, settings.npsEnabled, settings.npsPromptText, settings.npsThanksText, settings.npsCommentText]);
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    reset();
  }

  const farewell = fillVariables(settings.farewellText, { customer: "Maria Silva", agent: "Ana" }).trim();
  const thanks = settings.npsThanksText.trim();
  const askComment = npsCommentPrompt(settings);
  // Qualquer nota com convite configurado: o agradecimento espera o comentário.
  const waitsComment = answer !== null && !!askComment;
  const thanksNow = answer !== null && (!waitsComment || commented);

  const footer = !settings.npsEnabled ? (
    <PreviewHint text="Pesquisa desligada: o cliente recebe só a despedida." />
  ) : answer === null ? (
    <div className="space-y-1.5 px-1">
      <span className="block text-center text-xs text-slate-500 dark:text-slate-400">Toque numa nota para simular a resposta</span>
      <div className="flex flex-wrap justify-center gap-1" role="group" aria-label="Simular nota">
        {SCORES.map((score) => <button key={score} type="button" onClick={() => setAnswer(score)} className={`h-7 w-7 cursor-pointer rounded-md text-xs font-bold ${NPS_BAND_BADGE[npsBand(score)]}`}>{score}</button>)}
      </div>
    </div>
  ) : waitsComment && !commented ? (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="text-xs text-slate-500 dark:text-slate-400">Aguarda o comentário por 10 min.</span>
      <button type="button" onClick={() => setCommented(true)} className="h-8 shrink-0 cursor-pointer rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">Simular comentário</button>
    </div>
  ) : (
    <PreviewHint text={`Nota ${answer} (${NPS_BANDS[npsBand(answer)].label.toLowerCase()})${commented ? " e comentário gravados" : " gravada"} no painel de NPS.`} />
  );

  return (
    <PreviewFrame onReset={reset} scrollKey={`${answer ?? ""}${commented}${signature}`} footer={footer}>
      <PreviewBubble from="customer" text="Obrigada, era só isso!" />
      <PreviewNote text="Ana encerrou a conversa" />
      {farewell ? <PreviewBubble from="bot" text={farewell} /> : <PreviewNote text="Despedida desligada" />}
      {settings.npsEnabled && (
        <>
          <PreviewBubble from="bot" text={npsListText(buildNpsList("ATENDIMENTO", "Maria", npsPrompt(settings)))} />
          <PreviewNote text={`Botão “${NPS_LIST_BUTTON}”: notas de 10 a 1 na lista; 0 digitado`} />
          {answer !== null && <PreviewBubble from="customer" text={String(answer)} />}
          {waitsComment && <PreviewBubble from="bot" text={askComment} />}
          {commented && <PreviewBubble from="customer" text={answer !== null && answer >= 9 ? "A vendedora foi muito atenciosa, adorei!" : "Demoraram um pouco para me responder."} />}
          {thanksNow && (thanks ? <PreviewBubble from="bot" text={thanks} /> : <PreviewNote text="Sem agradecimento: a nota é gravada em silêncio" />)}
        </>
      )}
    </PreviewFrame>
  );
}
