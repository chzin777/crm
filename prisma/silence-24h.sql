-- Silêncio do cliente: "ainda está por aí?" 24 h depois da última mensagem da equipe e encerramento 24 h depois dele.
-- Só atualiza valores curtos (abaixo de 1 h) e o texto padrão antigo; configurações personalizadas maiores ficam como estão.
UPDATE "ChatSettings"
SET menu = jsonb_set(menu::jsonb, '{silenceAskMinutes}', '1440'::jsonb)
WHERE id = 'default' AND (menu ? 'silenceAskMinutes') AND (menu->>'silenceAskMinutes')::int < 60;

UPDATE "ChatSettings"
SET menu = jsonb_set(menu::jsonb, '{silenceCloseMinutes}', '1440'::jsonb)
WHERE id = 'default' AND (menu ? 'silenceCloseMinutes') AND (menu->>'silenceCloseMinutes')::int < 60;

UPDATE "ChatSettings"
SET menu = jsonb_set(menu::jsonb, '{silenceAskText}', to_jsonb('Oi! Passando para saber se ainda posso te ajudar com alguma coisa. Se não tiver retorno, este atendimento será encerrado em {tempo}, mas é só mandar uma mensagem quando quiser.'::text))
WHERE id = 'default' AND menu->>'silenceAskText' = 'Você ainda está por aí? Em caso de inatividade, este atendimento será encerrado automaticamente em {minutos} minutos.';
