"use client";
import { useState } from "react";
import { PreviewBubble, PreviewFrame, PreviewHint, PreviewListBubble, PreviewListSheet, PreviewNote, type PreviewRow } from "@/components/chat/ChatPreview";
import { NPS_SCORE_LABELS, npsPrompt, npsScoreTitle, type ChatMenuSettings } from "@/lib/chat/settings";
import { fillVariables } from "@/lib/chat/text";

const SURVEY_BUTTON = "Avaliar atendimento";
const ROWS: PreviewRow[] = NPS_SCORE_LABELS.map((label, index) => ({ id: String(index + 1), title: npsScoreTitle(label, index) }));

/** Encerramento como o cliente vê: despedida, pesquisa e o agradecimento depois da nota. */
export function ClosingSimulator({ settings }: { settings: ChatMenuSettings }) {
  const [answer, setAnswer] = useState<PreviewRow | null>(null);
  const [open, setOpen] = useState(false);
  const [commented, setCommented] = useState(false);

  const reset = () => {
    setAnswer(null);
    setOpen(false);
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
  const askComment = settings.npsCommentText.trim();
  // Nota 1, 2 ou 3 com pergunta configurada: o agradecimento espera o comentário.
  const waitsComment = !!answer && Number(answer.id) < 4 && !!askComment;
  const thanksNow = !!answer && (!waitsComment || commented);

  const footer = !settings.npsEnabled ? (
    <PreviewHint text="Pesquisa desligada: o cliente recebe só a despedida." />
  ) : waitsComment && !commented ? (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="text-xs text-slate-500 dark:text-slate-400">Aguarda o comentário por 5 min.</span>
      <button type="button" onClick={() => setCommented(true)} className="h-8 shrink-0 cursor-pointer rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">Simular comentário</button>
    </div>
  ) : answer ? (
    <PreviewHint text={`Nota ${answer.id}${commented ? " e comentário gravados" : " gravada"} no painel de NPS.`} />
  ) : (
    <PreviewHint text={`Toque em “${SURVEY_BUTTON}” para simular a nota.`} />
  );

  return (
    <PreviewFrame
      onReset={reset}
      scrollKey={`${answer?.id ?? ""}${commented}${signature}`}
      footer={footer}
      overlay={open && <PreviewListSheet title={SURVEY_BUTTON} rows={ROWS} onPick={(row) => { setOpen(false); setAnswer(row); }} onClose={() => setOpen(false)} />}
    >
      <PreviewBubble from="customer" text="Obrigada, era só isso!" />
      <PreviewNote text="Ana encerrou a conversa" />
      {farewell ? <PreviewBubble from="bot" text={farewell} /> : <PreviewNote text="Despedida desligada" />}
      {settings.npsEnabled && (
        <>
          <PreviewListBubble body={npsPrompt(settings)} button={SURVEY_BUTTON} active={!answer} onOpen={() => setOpen(true)} />
          {answer && <PreviewBubble from="customer" text={answer.title} />}
          {waitsComment && <PreviewBubble from="bot" text={askComment} />}
          {commented && <PreviewBubble from="customer" text="Demoraram um pouco para me responder." />}
          {thanksNow && (thanks ? <PreviewBubble from="bot" text={thanks} /> : <PreviewNote text="Sem agradecimento: a nota é gravada em silêncio" />)}
        </>
      )}
    </PreviewFrame>
  );
}
