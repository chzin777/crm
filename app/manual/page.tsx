import { Suspense } from "react";
import Link from "next/link";
import { Bullets, Chapter, Flow, Kbd, Note, Steps, Sub, Table, WhatsApp, type ManualChapter } from "@/components/manual/ManualParts";
import { ManualShell } from "@/components/manual/ManualShell";

export const metadata = {
  title: "Manual do Sistema | CRM Óticas Brasil",
  description: "Manual completo do CRM Óticas Brasil: atendimento, pipelines, segmentos, campanhas, NPS, permissões e configurações.",
};

const CHAPTERS: ManualChapter[] = [
  { id: "visao-geral", title: "Visão geral do CRM", sections: [
    { id: "o-que-e", title: "O que é o CRM Óticas Brasil" },
    { id: "pilares", title: "Pilares do sistema" },
    { id: "mapa-menu", title: "Mapa do menu" },
    { id: "horario-brasilia", title: "Horário de Brasília em todo o sistema" },
  ] },
  { id: "acesso", title: "Acesso, navegação e notificações", sections: [
    { id: "login", title: "Entrar e recuperar a senha" },
    { id: "abas", title: "Abas, tema e menu lateral" },
    { id: "notificacoes", title: "Central de notificações" },
    { id: "perfil", title: "Meu perfil" },
  ] },
  { id: "painel", title: "Painel de clientes e relacionamento", sections: [
    { id: "painel-filtros", title: "Filtros do painel" },
    { id: "painel-indicadores", title: "Indicadores" },
    { id: "painel-risco", title: "Clientes em risco" },
  ] },
  { id: "pipelines", title: "Pipelines de clientes", sections: [
    { id: "pipelines-etapas", title: "Os dois pipelines e suas etapas" },
    { id: "pipelines-sync", title: "Sincronização automática" },
    { id: "pipelines-criterios", title: "Editar critérios de uma etapa" },
    { id: "pipelines-deals", title: "Cards, deals e observações" },
    { id: "pipelines-envio", title: "Envio de mensagem em massa pela etapa" },
  ] },
  { id: "contatos", title: "Contatos e clientes", sections: [
    { id: "contatos-base", title: "Base de contatos" },
    { id: "contatos-ficha", title: "Ficha do cliente" },
    { id: "contatos-novo", title: "Cadastrar um contato" },
    { id: "contatos-telefone", title: "Telefones e números repetidos" },
  ] },
  { id: "segmentos", title: "Segmentos de público", sections: [
    { id: "segmentos-conceito", title: "Para que servem" },
    { id: "segmentos-criar", title: "Criar um segmento" },
    { id: "segmentos-criterios", title: "Tabela de critérios" },
    { id: "segmentos-planilha", title: "Importar contatos por planilha" },
    { id: "segmentos-dicas", title: "Boas práticas" },
  ] },
  { id: "lojas", title: "Lojas", sections: [
    { id: "lojas-cadastro", title: "Cadastro da loja" },
    { id: "lojas-raio", title: "Público da loja e raio de atendimento" },
  ] },
  { id: "modelos", title: "Modelos de mensagem do WhatsApp", sections: [
    { id: "modelos-oque", title: "Por que modelos existem" },
    { id: "modelos-criar", title: "Criar um modelo" },
    { id: "modelos-aprovacao", title: "Aprovação, edição e exclusão" },
    { id: "modelos-notificacao", title: "Enviar notificação avulsa" },
  ] },
  { id: "campanhas", title: "Campanhas e disparos", sections: [
    { id: "campanhas-criar", title: "Criar e disparar uma campanha" },
    { id: "campanhas-regras", title: "Regras de envio" },
    { id: "campanhas-acompanhar", title: "Acompanhar o disparo" },
    { id: "campanhas-resultados", title: "Resultados e vendas no ERP" },
    { id: "campanhas-atribuicao", title: "Como uma venda é atribuída" },
    { id: "campanhas-respostas", title: "Respostas de campanha no atendimento" },
    { id: "campanhas-ia", title: "Criar campanha com IA" },
    { id: "campanhas-meta", title: "Aprovação do modelo na Meta" },
    { id: "campanhas-dedup", title: "Vários segmentos sem mensagem repetida" },
  ] },
  { id: "atendimento", title: "Atendimento (inbox do WhatsApp)", sections: [
    { id: "atendimento-tela", title: "A tela de atendimento" },
    { id: "atendimento-abas", title: "Abas e filtros" },
    { id: "atendimento-estados", title: "Estados da conversa" },
    { id: "atendimento-janela", title: "Janela de 24 horas" },
    { id: "atendimento-escrever", title: "Escrever, anexar e gravar áudio" },
    { id: "atendimento-acoes", title: "Ações da conversa" },
    { id: "atendimento-agenda", title: "Mensagens agendadas e lembretes" },
    { id: "atendimento-cliente", title: "Painel do cliente" },
    { id: "atendimento-nova", title: "Iniciar uma nova conversa" },
    { id: "atendimento-transcricao", title: "Transcrição automática de áudios" },
  ] },
  { id: "filas", title: "Filas e equipe de atendimento", sections: [
    { id: "filas-papel", title: "O papel das filas" },
    { id: "filas-equipe", title: "Equipe, limite e pausa" },
    { id: "filas-espera", title: "Clientes aguardando" },
    { id: "filas-respostas", title: "Respostas prontas" },
    { id: "filas-bloqueados", title: "Números bloqueados" },
  ] },
  { id: "menu", title: "Menu automático e avisos", sections: [
    { id: "menu-como", title: "Como o menu funciona" },
    { id: "menu-opcoes", title: "Opções e ações" },
    { id: "menu-fechamento", title: "Fora das opções e fechamento" },
    { id: "menu-silencio", title: "Silêncio do cliente" },
    { id: "menu-despedida", title: "Despedida e pesquisa de satisfação" },
    { id: "menu-horario", title: "Horário de atendimento" },
    { id: "menu-robo", title: "Respostas automáticas de outros robôs" },
  ] },
  { id: "satisfacao", title: "NPS e métricas de atendimento", sections: [
    { id: "nps-pesquisas", title: "Monitor de satisfação (NPS)" },
    { id: "metricas-indicadores", title: "TME, TMA e TMR" },
    { id: "metricas-graficos", title: "Ranking, termos e regiões" },
  ] },
  { id: "seguranca", title: "Usuários, cargos e permissões", sections: [
    { id: "seguranca-usuarios", title: "Usuários" },
    { id: "seguranca-cargos", title: "Cargos" },
    { id: "seguranca-modulos", title: "Permissões por tela" },
    { id: "seguranca-chat", title: "Ações no atendimento" },
  ] },
  { id: "configuracoes", title: "Configurações", sections: [
    { id: "config-tabela", title: "Tabela de configurações" },
    { id: "config-whatsapp", title: "Conta do WhatsApp Business" },
  ] },
  { id: "ia", title: "Estúdio de IA", sections: [
    { id: "ia-config", title: "Configuração simplificada" },
    { id: "ia-transbordo", title: "Quando a IA passa para uma pessoa" },
    { id: "ia-conhecimento", title: "Regras, Skills e Base de Conhecimento" },
    { id: "ia-simulador", title: "Simulador e consumo" },
  ] },
  { id: "automacoes", title: "Automações", sections: [
    { id: "auto-canvas", title: "O canvas visual" },
    { id: "auto-ia", title: "Criar automação com IA" },
    { id: "auto-gatilhos", title: "Gatilhos (incluindo ERP VMSet)" },
    { id: "auto-nos", title: "Passos (nós) do fluxo" },
    { id: "auto-roleta", title: "Roleta de vendedores" },
    { id: "auto-webhook", title: "Webhooks de entrada" },
    { id: "auto-metricas", title: "Métricas por nó" },
  ] },
  { id: "clientes-vip", title: "Clientes VIP, Lead Score e RFV-P", sections: [
    { id: "vip-score", title: "Lead Score" },
    { id: "vip-niveis", title: "Níveis Diamante, Ouro, Prata e Bronze" },
    { id: "vip-rfvp", title: "Matriz RFV-P (555-5)" },
    { id: "vip-segmentos", title: "Segmentos RFV-P e uso no dia a dia" },
  ] },
  { id: "guias", title: "Guias passo a passo por perfil", sections: [
    { id: "guia-atendente", title: "O dia a dia do atendente" },
    { id: "guia-supervisor", title: "O dia a dia do supervisor" },
    { id: "guia-marketing", title: "O dia a dia do marketing" },
    { id: "guia-admin", title: "O dia a dia do administrador" },
  ] },
  { id: "faq", title: "Glossário e perguntas frequentes", sections: [
    { id: "glossario", title: "Glossário" },
    { id: "perguntas", title: "Perguntas frequentes" },
  ] },
];

const printCss = `
@media print {
  body * { visibility: hidden !important; }
  #manual, #manual * { visibility: visible !important; }
  #manual { position: absolute; inset: 0 auto auto 0; width: 100%; }
  #manual .manual-toc { display: none !important; }
  #manual .manual-chapter { break-inside: auto; box-shadow: none; border: 0; }
}`;

export default function ManualPage() {
  return (
    <div id="manual" className="mx-auto w-full max-w-7xl px-4 pb-16 pt-2 sm:px-6">
      <style>{printCss}</style>

      <Suspense>
        <ManualShell chapters={CHAPTERS} guide={<>
          {/* 1 */}
          <Chapter number={1} id="visao-geral" title="Visão geral do CRM" description="O que o sistema resolve, como ele se organiza e de onde vêm os dados." tags={["visao-geral", "erp", "whatsapp"]}>
            <Sub id="o-que-e" number="1.1" title="O que é o CRM Óticas Brasil">
              <p>
                O CRM é a central de relacionamento da rede Óticas Brasil. Ele junta, num só lugar, o <Kbd>atendimento pelo WhatsApp</Kbd> (API oficial da Meta),
                a <Kbd>base de clientes</Kbd> com o histórico de compras vindo do ERP das lojas, as <Kbd>campanhas de marketing</Kbd> com o retorno em vendas
                e as <Kbd>pesquisas de satisfação</Kbd>.
              </p>
              <p>O objetivo é simples: saber quem é o cliente, falar com ele no momento certo e medir se isso virou venda.</p>
            </Sub>
            <Sub id="pilares" number="1.2" title="Pilares do sistema">
              <Table
                head={["Pilar", "O que entrega"]}
                rows={[
                  ["Atendimento", "Inbox compartilhada do WhatsApp com filas, menu automático, transferência, notas internas, agendamentos e pesquisa de satisfação."],
                  ["Relacionamento", "Pipelines que classificam os clientes sozinhos (novo lead, pós-venda, recompra, reativação) a partir das compras no ERP."],
                  ["Segmentação", "Públicos montados por regras (comprou ontem, aniversário, loja, ticket, NPS etc.) ou por seleção manual e planilha."],
                  ["Campanhas", "Disparos em massa com modelos aprovados pela Meta, custo estimado, funil (entregue, lido, respondeu) e vendas atribuídas."],
                  ["Gestão", "Painel da carteira, métricas de atendimento, NPS, cargos e permissões por tela."],
                ]}
              />
            </Sub>
            <Sub id="mapa-menu" number="1.3" title="Mapa do menu">
              <p>O menu lateral mostra apenas as telas liberadas para o seu cargo.</p>
              <Table
                head={["Grupo", "Telas"]}
                rows={[
                  ["Início", "Painel (visão de clientes e relacionamento)"],
                  ["Vendas", "Pipelines · Atendimento · Filas · Métricas de Atendimento"],
                  ["Marketing", "Contatos & Clientes · Segmentos · Campanhas e disparos · Modelos WhatsApp · Pesquisas NPS · Automações · Clientes VIP & Pontuação"],
                  ["Gestão", "Lojas · Usuários · Cargos · Permissões"],
                  ["Sistema", "Inteligência Artificial · Configurações · Manual do sistema (este documento, com vídeos de treinamento)"],
                ]}
              />
            </Sub>
            <Sub id="horario-brasilia" number="1.4" title="Horário de Brasília em todo o sistema">
              <p>
                Todas as datas e horas do CRM seguem o horário de Brasília, em qualquer computador. Isso vale para “compraram hoje/ontem”, para o horário de
                atendimento, para mensagens agendadas e para os horários mostrados na tela. Um agendamento para 09:00 sai às 09:00 de Brasília mesmo que o
                computador de quem agendou esteja em outro fuso.
              </p>
              <Note>O “dia” do sistema vira à meia-noite de Brasília. Uma compra feita às 22h conta como compra de hoje, e não de amanhã.</Note>
            </Sub>
          </Chapter>

          {/* 2 */}
          <Chapter number={2} id="acesso" title="Acesso, navegação e notificações" description="Como entrar no sistema e se movimentar entre as telas." tags={["login", "abas", "notificacoes"]}>
            <Sub id="login" number="2.1" title="Entrar e recuperar a senha">
              <Steps items={[
                "Acesse o endereço do CRM e informe e-mail e senha.",
                <>Esqueceu a senha? Clique em <Kbd>Esqueci minha senha</Kbd>, informe o e-mail e siga o link recebido para criar uma nova.</>,
                "Usuários bloqueados pelo administrador não conseguem entrar até serem desbloqueados.",
              ]} />
              <Note kind="warn">A senha precisa ter no mínimo 12 caracteres. Nunca compartilhe o seu acesso: tudo o que é feito no atendimento fica registrado com o nome de quem fez.</Note>
            </Sub>
            <Sub id="abas" number="2.2" title="Abas, tema e menu lateral">
              <Bullets items={[
                "Cada tela aberta vira uma aba no topo, como em um navegador. Assim dá para alternar entre o atendimento e um segmento sem perder o que estava fazendo.",
                "O botão de tema no topo alterna entre o modo claro e o modo escuro.",
                "O menu lateral pode ser recolhido para ganhar espaço; passe o mouse sobre um ícone para ver o nome da tela.",
                "No rodapé do menu fica o seu perfil, com as opções Meu Perfil e Sair.",
              ]} />
            </Sub>
            <Sub id="notificacoes" number="2.3" title="Central de notificações">
              <p>O sino no topo reúne os avisos do sistema. Exemplos:</p>
              <Bullets items={[
                "Lembrete de retorno vencido (aviso único para o atendente que agendou).",
                "Fila no limite: as conversas abertas chegaram à capacidade somada da equipe da fila (para supervisores).",
                "Mudanças de status de campanhas e campanhas concluídas.",
                "Novos contatos e avaliações de satisfação baixas, conforme ligado em Configurações.",
              ]} />
              <p>O atendimento também pode tocar som e mostrar alerta do navegador quando chega mensagem; o navegador pede permissão no primeiro clique.</p>
            </Sub>
            <Sub id="perfil" number="2.4" title="Meu perfil">
              <p>Em <Kbd>Meu Perfil</Kbd> você confere e atualiza seu nome e dados de acesso. O primeiro nome aparece para o cliente quando a mensagem usa a variável <code>{"{atendente}"}</code>.</p>
            </Sub>
          </Chapter>

          {/* 3 */}
          <Chapter number={3} id="painel" title="Painel de clientes e relacionamento" description="A fotografia da carteira: quem compra, quem parou de comprar e quem está insatisfeito." tags={["painel", "indicadores", "churn"]}>
            <Sub id="painel-filtros" number="3.1" title="Filtros do painel">
              <Table
                head={["Filtro", "Para que serve"]}
                rows={[
                  ["Período", "Intervalo analisado (por exemplo, últimos 30 dias)."],
                  ["Comparar com", "Período anterior para mostrar a variação de cada indicador."],
                  ["Considerar inativo após", "Quantos dias sem compra tornam o cliente inativo."],
                  ["Loja e Vendedor", "Restringem os números a uma loja ou a um vendedor do ERP."],
                ]}
              />
            </Sub>
            <Sub id="painel-indicadores" number="3.2" title="Indicadores">
              <Table
                head={["Indicador", "Como é calculado"]}
                rows={[
                  ["Base de clientes", "Contatos únicos cadastrados no CRM (filtra pela loja do cadastro)."],
                  ["Compraram no período", "Clientes distintos com pedido de venda no ERP dentro do período."],
                  ["Inativos", "Clientes que já compraram e estão sem recompra no fim do período."],
                  ["Índice de insatisfação", "Avaliações de atendimento com nota 1, 2 ou 3 sobre o total respondido no período."],
                  ["Ticket médio por pedido", "Faturamento das notas do período (sem serviços) dividido pela quantidade de pedidos, a mesma conta do BI."],
                  ["Faturamento", "Soma das vendas do ERP no período, sem itens de serviço."],
                ]}
              />
              <p>Os gráficos mostram a saúde da carteira (composição entre ativos e inativos), a satisfação no período e a evolução de compradores contra inativos.</p>
            </Sub>
            <Sub id="painel-risco" number="3.3" title="Clientes em risco">
              <p>
                A lista <Kbd>Clientes em risco · ação rápida</Kbd> traz os clientes de maior valor histórico (LTV) que estão perto de virar inativos ou que deram nota baixa.
                Em cada linha há o botão para <Kbd>adicionar à etapa Reativação</Kbd> do pipeline de relacionamento, para que a equipe faça o contato.
              </p>
            </Sub>
          </Chapter>

          {/* 4 */}
          <Chapter number={4} id="pipelines" title="Pipelines de clientes" description="Quadros (kanban) que organizam cada cliente na etapa certa da jornada." tags={["pipeline", "kanban", "relacionamento"]}>
            <Sub id="pipelines-etapas" number="4.1" title="Os dois pipelines e suas etapas">
              <Table
                head={["Pipeline", "Etapa", "Objetivo"]}
                rows={[
                  ["Novos clientes", "Novo lead", "Aguardando qualificação."],
                  ["Novos clientes", "Em atendimento", "Levantar necessidade e orçamento."],
                  ["Novos clientes", "Fechamento", "Pronto para a primeira compra."],
                  ["Relacionamento", "Pós-venda", "Acompanhamento e satisfação depois da compra."],
                  ["Relacionamento", "Recompra", "Reposição e novas necessidades."],
                  ["Relacionamento", "Reativação", "Retomar clientes inativos."],
                ]}
              />
            </Sub>
            <Sub id="pipelines-sync" number="4.2" title="Sincronização automática">
              <p>O botão <Kbd>Atualizar pipeline</Kbd> reclassifica a base a partir das compras do ERP e das regras de cada etapa.</p>
              <Bullets items={[
                "Cada contato aparece uma única vez por pipeline, na etapa mais avançada para a qual se qualifica.",
                "Contatos excluídos manualmente da pipeline não voltam na próxima sincronização. Eles ficam em “Contatos excluídos da pipeline”, de onde podem ser restaurados.",
                "O limite de cards por etapa e a liga/desliga geral da sincronização ficam em Configurações.",
              ]} />
            </Sub>
            <Sub id="pipelines-criterios" number="4.3" title="Editar critérios de uma etapa">
              <Steps items={[
                <>Clique no lápis (<Kbd>Editar etapa</Kbd>) no cabeçalho da coluna.</>,
                "Ajuste nome, descrição, posição e prazo máximo na etapa.",
                "Defina os filtros: quantidade de compras (mínimo e máximo), total gasto, dias sem compra e categorias do contato (cliente, lead, NPS, inativo).",
                "Ligue ou desligue a sincronização automática daquela etapa e salve.",
              ]} />
            </Sub>
            <Sub id="pipelines-deals" number="4.4" title="Cards, deals e observações">
              <Bullets items={[
                <>Arraste um card entre colunas ou use <Kbd>Enviar para etapa</Kbd>.</>,
                <><Kbd>Adicionar deal</Kbd> cria uma oportunidade com contato vinculado, título (ex.: “Orçamento de lentes”) e valor.</>,
                "Ao abrir o card você vê os dados do cliente, o negócio atual, os dias na etapa e as compras do ERP.",
                "Observações registram anotações e anexos sobre o cliente.",
                "Pelos atalhos do card é possível ligar, abrir o WhatsApp ou enviar mensagem.",
                <>No atendimento, a ação <Kbd>Criar oportunidade</Kbd> abre esta tela já com o contato preenchido.</>,
              ]} />
            </Sub>
            <Sub id="pipelines-envio" number="4.5" title="Envio de mensagem em massa pela etapa">
              <Steps items={[
                <>No cabeçalho da etapa, clique em <Kbd>Enviar mensagem</Kbd>.</>,
                "Selecione os contatos (ou Selecionar todos). Só entram contatos com telefone válido.",
                "Escolha um modelo aprovado ou mensagem livre e preencha as variáveis.",
                "Confira o resumo (contatos válidos e custo estimado) e conclua.",
              ]} />
              <p>O envio roda no servidor; o andamento aparece no indicador flutuante de envios em massa e também na lista de Campanhas.</p>
              <Note>Precisa do acesso “Disparos pelo pipeline” no cargo.</Note>
            </Sub>
          </Chapter>

          {/* 5 */}
          <Chapter number={5} id="contatos" title="Contatos e clientes" description="A base única de pessoas do CRM, com compras do ERP e comunicações." tags={["contatos", "clientes", "erp"]}>
            <Sub id="contatos-base" number="5.1" title="Base de contatos">
              <p>A lista mostra nome, telefone, nascimento, compras, total gasto e última compra. Busque por nome, telefone ou e-mail e filtre por categoria (cliente, lead, NPS, inativo).</p>
              <Note>Clientes do ERP entram na base automaticamente. Pedidos novos aparecem conforme o ERP os envia, em lotes ao longo do dia.</Note>
            </Sub>
            <Sub id="contatos-ficha" number="5.2" title="Ficha do cliente">
              <Bullets items={[
                "Dados pessoais, categoria, segmento, último contato e data de cadastro.",
                "Compras e total gasto, última compra e validade estimada da receita (pela última compra de lentes de grau).",
                "Histórico de compras do ERP, pedido a pedido.",
                "Comunicações: mensagens de campanha enviadas, respostas recebidas pelo WhatsApp e e-mails.",
              ]} />
            </Sub>
            <Sub id="contatos-novo" number="5.3" title="Cadastrar um contato">
              <Steps items={[
                "Clique em Novo contato.",
                "Informe nome completo e telefone no formato brasileiro com DDD, por exemplo (11) 91234-5678.",
                "Escolha a categoria e um segmento existente.",
                "Revise e confirme.",
              ]} />
            </Sub>
            <Sub id="contatos-telefone" number="5.4" title="Telefones e números repetidos">
              <p>
                O sistema reconhece o mesmo número escrito de formas diferentes: “(62) 99618-3309”, “62996183309” e “556296183309” são o mesmo telefone.
                O 9º dígito é acrescentado apenas em números de celular. Quando o cadastro tem o mesmo número em dois contatos, o atendimento usa o contato
                que já tem conversa aberta.
              </p>
            </Sub>
          </Chapter>

          {/* 6 */}
          <Chapter number={6} id="segmentos" title="Segmentos de público" description="Públicos reutilizáveis para campanhas, montados por regras ou por seleção." tags={["segmentos", "publico", "criterios"]}>
            <Sub id="segmentos-conceito" number="6.1" title="Para que servem">
              <p>
                Um segmento é uma lista de pessoas definida por <Kbd>critérios</Kbd> (ex.: “compraram nos últimos 30 dias na LJ 12”) ou por <Kbd>contatos escolhidos</Kbd>.
                Segmentos por critério se atualizam sozinhos: quem passa a atender às regras entra; quem deixa de atender sai.
              </p>
            </Sub>
            <Sub id="segmentos-criar" number="6.2" title="Criar um segmento">
              <Steps items={[
                <><Kbd>Identificação</Kbd>: dê um nome claro (ex.: “Clientes VIP de Goiânia”) e uma descrição.</>,
                <><Kbd>Público</Kbd>: escolha Usar critérios ou Escolher contatos.</>,
                "Adicione os critérios. O contato entra quando atende a todos eles. O total de pessoas é recalculado na hora.",
                "Na seleção manual, também é possível refinar a lista com critérios.",
                <><Kbd>Revisão</Kbd>: confira e salve. O segmento nasce sem campanhas vinculadas.</>,
              ]} />
              <p>Na biblioteca, cada segmento mostra pessoas, critérios, data de atualização e campanhas. O atalho <Kbd>Criar campanha</Kbd> já abre a campanha com esse público.</p>
            </Sub>
            <Sub id="segmentos-criterios" number="6.3" title="Tabela de critérios">
              <Table
                head={["Critério", "Opções"]}
                rows={[
                  ["Comprou no ERP", "Hoje, ontem, nos últimos N dias ou entre datas; pode filtrar loja e frequência e incluir ou excluir."],
                  ["Última compra (ERP)", "Nos últimos N dias, há mais de N dias, antes de, depois de, entre datas ou nunca ocorreu."],
                  ["Quantidade de pedidos, Ticket médio, Total gasto (LTV)", "Igual, maior, menor ou entre valores."],
                  ["Campanha", "Converteram após receber, ou receberam e não compraram."],
                  ["Idade e aniversário", "Aniversário hoje, nesta semana, neste mês, em um mês escolhido ou idade entre."],
                  ["NPS", "Nota recebida e se respondeu ao NPS."],
                  ["Localização", "Cidade, bairro, estado (UF) e DDD do telefone."],
                  ["Cadastro", "Categoria, gênero, profissão, segmento do contato, etapa atual do pipeline, tag do atendimento e se tem telefone ou e-mail."],
                  ["Loja", "Clientes da loja (quem comprou nela e, com raio, quem mora perto). Busque por “LJ 12”."],
                ]}
              />
              <Note>Em Critérios salvos, os padrões do sistema só podem ser ligados ou desligados. Um critério desligado some das novas seleções, mas continua valendo nos segmentos que já o usam.</Note>
            </Sub>
            <Sub id="segmentos-planilha" number="6.4" title="Importar contatos por planilha">
              <p>Na seleção de contatos é possível importar uma planilha (.xlsx ou .csv), como as listas de clientes por loja exportadas do ERP.</p>
              <Steps items={[
                <>Em <Kbd>Novo segmento</Kbd>, escolha <Kbd>Importar por planilha</Kbd> e selecione o arquivo.</>,
                "O sistema reconhece sozinho as colunas de nome, CPF/CNPJ, celular, loja e última compra (e repõe os zeros do CPF que o Excel apaga).",
                "Quem já existe no CRM é localizado pelo CPF/CNPJ e, na falta dele, pelo celular. Quem não existe é cadastrado na hora e também entra no segmento.",
                "Pode importar várias planilhas no mesmo segmento: as listas são somadas sem repetir pessoas.",
              ]} />
              <Note kind="tip">O resumo da importação mostra quantos foram encontrados por CPF, por telefone, quantos foram cadastrados e o total acumulado. Critérios adicionados depois filtram somente dentro da lista importada.</Note>
            </Sub>
            <Sub id="segmentos-dicas" number="6.5" title="Boas práticas">
              <Bullets items={[
                "Prefira critérios a listas fixas: o público se mantém atualizado sem retrabalho.",
                "Antes de uma campanha, abra o segmento e confira o número de pessoas.",
                "Use “receberam e não compraram” para uma segunda onda de comunicação mais direcionada.",
              ]} />
            </Sub>
          </Chapter>

          {/* 7 */}
          <Chapter number={7} id="lojas" title="Lojas" description="Cadastro das lojas da rede e do público de cada uma." tags={["lojas", "raio", "bairros"]}>
            <Sub id="lojas-cadastro" number="7.1" title="Cadastro da loja">
              <Steps items={[
                "Informe o número e o nome (ex.: “LJ 12 Centro”). O número liga a loja às vendas do ERP.",
                "Preencha o endereço, a cidade e o bairro.",
                "Defina o raio de atendimento (ou “Só o bairro”).",
                "Deixe a loja ativa. Lojas inativas não aparecem como critério de segmentação.",
              ]} />
            </Sub>
            <Sub id="lojas-raio" number="7.2" title="Público da loja e raio de atendimento">
              <p>
                Cada loja recebe automaticamente os clientes que compraram nela. O raio é opcional: com ele, contatos de bairros dentro da distância também entram,
                mas apenas quando aquela loja é a mais próxima do contato. Ao salvar com raio, os bairros dos contatos são localizados no mapa.
              </p>
              <p>O nome cadastrado aparece nos pedidos convertidos das campanhas. Se a loja não estiver cadastrada, aparece “LJ código”.</p>
            </Sub>
          </Chapter>

          {/* 8 */}
          <Chapter number={8} id="modelos" title="Modelos de mensagem do WhatsApp" description="Mensagens pré-aprovadas pela Meta, obrigatórias para iniciar conversas e fazer campanhas." tags={["modelos", "meta", "templates"]}>
            <Sub id="modelos-oque" number="8.1" title="Por que modelos existem">
              <p>
                Pela regra da Meta, a empresa só pode mandar texto livre dentro da janela de 24 horas após a última mensagem do cliente.
                Fora dela, como em campanhas, primeiro contato ou retorno depois de dias, é obrigatório usar um <Kbd>modelo aprovado</Kbd>.
              </p>
              <Table
                head={["Categoria", "Uso", "Custo de referência por mensagem"]}
                rows={[
                  ["Marketing", "Promoções, campanhas, convites.", "R$ 0,34 (ajustável em Configurações)"],
                  ["Utilidade", "Confirmações, avisos de pedido pronto, atendimento.", "R$ 0,04 (ajustável em Configurações)"],
                ]}
              />
            </Sub>
            <Sub id="modelos-criar" number="8.2" title="Criar um modelo">
              <Steps items={[
                "Nome (letras minúsculas e sublinhado, ex.: confirmacao_atendimento) e categoria.",
                "Texto, imagem de cabeçalho opcional e variáveis {{1}}, {{2}}… inseridas pelos atalhos (nome, primeiro nome, loja etc.).",
                "Botões opcionais: resposta rápida, abrir link ou ligação (até 2 de link e 1 de ligação).",
                "Revise a prévia e envie para aprovação.",
              ]} />
              <WhatsApp lines={[{ from: "empresa", text: "Olá, Maria! Seus óculos já estão prontos na Óticas Brasil Centro. 😊" }, { from: "cliente", text: "Oba! Passo aí amanhã." }]} />
            </Sub>
            <Sub id="modelos-aprovacao" number="8.3" title="Aprovação, edição e exclusão">
              <Bullets items={[
                "A biblioteca mostra o status de cada modelo na Meta (em análise, aprovado, rejeitado).",
                "Só modelos aprovados aparecem em campanhas e no atendimento.",
                "Cada edição salva consome uma das edições permitidas pela Meta e bloqueia nova edição daquele modelo por 24 horas.",
              ]} />
              <Note kind="warn">Excluir um modelo na Meta não pode ser desfeito. Envios e campanhas que usam esse modelo deixam de funcionar.</Note>
            </Sub>
            <Sub id="modelos-notificacao" number="8.4" title="Enviar notificação avulsa">
              <p>Pelo botão <Kbd>Enviar notificação</Kbd> do modelo é possível mandá-lo para um único telefone, útil para testar como a mensagem chega.</p>
            </Sub>
          </Chapter>

          {/* 9 */}
          <Chapter number={9} id="campanhas" title="Campanhas e disparos" description="Envios em massa com acompanhamento ao vivo e retorno medido em vendas do ERP." tags={["campanhas", "disparos", "roi"]}>
            <Sub id="campanhas-criar" number="9.1" title="Criar e disparar uma campanha">
              <Flow steps={["Identificação", "Público", "Mensagem", "Disparo"]} />
              <Steps items={[
                <><Kbd>Nova campanha</Kbd>: dê um nome fácil de encontrar.</>,
                "Público: selecione um ou mais segmentos salvos.",
                "Mensagem: escolha o modelo aprovado, preencha as variáveis (clique para inserir) e, se quiser, anexe imagens, vídeos ou PDFs.",
                "Disparo: confira campanha, segmento, mensagem e o custo estimado. Clique em Confirmar disparo.",
              ]} />
              <Note kind="tip">O envio roda no servidor. Você pode fechar a página e voltar depois para acompanhar.</Note>
            </Sub>
            <Sub id="campanhas-regras" number="9.2" title="Regras de envio">
              <Table
                head={["Regra", "Como funciona"]}
                rows={[
                  ["Um disparo por vez", "Os disparos entram numa fila e saem em sequência, nunca em paralelo."],
                  ["Descanso entre campanhas", "Quem recebeu qualquer campanha nos últimos 7 dias é pulado. A opção “Ignorar intervalo mínimo de envio” desliga essa trava naquele disparo. Envios em massa do pipeline não contam."],
                  ["Sem repetição", "Quem já recebeu a campanha nunca recebe de novo, nem ao retomar."],
                  ["Cadência", "Há um intervalo com variação entre os envios. Se a Meta acusar limite, o sistema espera cada vez mais (5 s, 10 s, 20 s…) e tenta de novo."],
                  ["Pausa automática", "Problemas de pagamento ou de autenticação na conta da Meta pausam o disparo com o motivo, para retomar depois."],
                ]}
              />
            </Sub>
            <Sub id="campanhas-acompanhar" number="9.3" title="Acompanhar o disparo">
              <Bullets items={[
                "A lista mostra enviados, entregues, lidos e respostas, atualizando ao vivo.",
                "Ações: Disparar agora, Pausar, Retomar, Cancelar e Reenviar falhas (cria um lote só com quem falhou).",
                "Em Ver detalhes ficam a configuração, o conteúdo enviado, os arquivos e o registro de destinatários com o motivo de cada falha.",
              ]} />
            </Sub>
            <Sub id="campanhas-resultados" number="9.4" title="Resultados e vendas no ERP">
              <Table
                head={["Indicador", "Significado"]}
                rows={[
                  ["Gasto (R$)", "Mensagens de modelo entregues × preço da categoria."],
                  ["Vendido (R$)", "Soma dos pedidos do ERP atribuídos à campanha, já descontadas as devoluções. Exibido como “24 clientes (30 pedidos)”."],
                  ["Retorno financeiro (%)", "(Vendido − Gasto) ÷ Gasto."],
                  ["Conversão de leads", "Clientes que compraram ÷ destinatários únicos."],
                  ["Ticket médio", "Vendido ÷ pedidos (também mostrado por cliente)."],
                  ["Funil", "Enviados → Entregues → Lidos → Respostas → Clientes que compraram."],
                ]}
              />
              <p>Em <Kbd>Ver conversões</Kbd> aparecem os pedidos convertidos com o cliente, a loja da venda, o valor, a linha do tempo do disparo até a venda e o atalho para o chat.</p>
              <p>No topo de /campanhas, o total geral soma todos os disparos sem contar duas vezes o mesmo pedido ou cliente.</p>
            </Sub>
            <Sub id="campanhas-atribuicao" number="9.5" title="Como uma venda é atribuída">
              <Steps items={[
                "A compra precisa acontecer entre o dia do disparo e o fim da janela de conversão (padrão em Configurações, em dias).",
                "Compra no mesmo dia do disparo só conta se apareceu no ERP depois do envio. Quem comprou de manhã e recebeu à tarde não conta.",
                "Se o cliente recebeu mais de uma campanha, o pedido fica só com a última entregue antes da compra (último toque).",
                "Itens devolvidos no ERP saem do valor vendido.",
              ]} />
            </Sub>
            <Sub id="campanhas-respostas" number="9.6" title="Respostas de campanha no atendimento">
              <p>
                O disparo fica gravado na conversa do contato. Quando o cliente responde, a conversa aparece na aba <Kbd>Campanhas</Kbd> do atendimento,
                identificada com o nome da campanha.
              </p>
              <Bullets items={[
                "Saudações automáticas do WhatsApp Business do cliente (“Olá, obrigado por entrar em contato…”) não abrem menu nem contam como resposta.",
                "Se um robô respondeu, o administrador pode excluir a conversa com o motivo “Não é resposta da campanha”: a resposta sai das métricas e novas mensagens daquele contato não contam.",
              ]} />
            </Sub>
            <Sub id="campanhas-ia" number="9.7" title="Criar campanha com IA">
              <p>No primeiro passo da <Kbd>Nova campanha</Kbd> há o bloco <Kbd>Criar campanha com IA</Kbd>. Descreva o objetivo em uma frase e a IA monta o rascunho completo.</p>
              <Steps items={[
                "Escreva o pedido, por exemplo: “recuperar clientes que não compram há 1 ano, com oferta de exame de vista”.",
                "A IA preenche nome, objetivo, categoria do modelo (Marketing ou Utilidade), os segmentos do público e, quando fizer sentido, filtros adicionais (última compra, nível VIP, segmento RFV-P, etapa do pipeline ou tag).",
                "Ela também redige o texto do modelo com variáveis e botões. Tudo fica editável antes de salvar.",
                "No passo Mensagem, o botão Gerar mensagem cria só o texto, usando o nome e o público já escolhidos.",
              ]} />
              <Note>Os filtros adicionais refinam a união dos segmentos: só recebe quem está em algum segmento e atende a todos os filtros. Use Remover filtros para desfazer.</Note>
            </Sub>
            <Sub id="campanhas-meta" number="9.8" title="Aprovação do modelo na Meta">
              <p>Um texto novo criado pela IA vira um modelo que precisa ser aprovado pela Meta antes do envio.</p>
              <Table
                head={["Status", "O que fazer"]}
                rows={[
                  ["Aguardando aprovação Meta", "Nada: o disparo fica bloqueado até a Meta responder (normalmente minutos)."],
                  ["Pronta para envio", "Modelo aprovado. A campanha pode ser disparada."],
                  ["Rejeitada pela Meta", "O motivo aparece nos detalhes. Use Gerar nova versão, revise e clique em Aprovar e reenviar para análise."],
                  ["Falha na submissão", "A integração não conseguiu enviar o modelo. Confira a conta do WhatsApp e reenvie."],
                ]}
              />
            </Sub>
            <Sub id="campanhas-dedup" number="9.9" title="Vários segmentos sem mensagem repetida">
              <p>Ao escolher dois ou mais segmentos, o sistema une os públicos e garante que cada cliente receba <Kbd>no máximo uma mensagem</Kbd>, mesmo estando em vários segmentos ou com cadastros repetidos com o mesmo celular.</p>
              <Bullets items={[
                "No passo Público aparece o resumo: soma dos segmentos, destinatários únicos que vão receber e quantos foram unificados por estarem em mais de um segmento.",
                "Cada segmento mostra quantos contatos tem e quantos são só dele.",
                "Um alerta laranja avisa quando um segmento está 100% contido nos outros e não acrescenta ninguém novo.",
                "A fila de disparo no servidor também remove repetidos, e o acompanhamento do envio informa quantos foram unificados.",
              ]} />
            </Sub>
          </Chapter>

          {/* 10 */}
          <Chapter number={10} id="atendimento" title="Atendimento (inbox do WhatsApp)" description="Onde a equipe conversa com os clientes, com o histórico completo e os dados do ERP ao lado." tags={["chat", "whatsapp", "inbox"]}>
            <Sub id="atendimento-tela" number="10.1" title="A tela de atendimento">
              <Bullets items={[
                "Esquerda: lista de conversas com abas, busca e filtros.",
                "Centro: a conversa, com mensagens, status de entrega (enviando, enviada, entregue, lida, falha) e a caixa de escrita.",
                "Direita: painel do cliente (abre e fecha pelo botão no topo da conversa).",
              ]} />
            </Sub>
            <Sub id="atendimento-abas" number="10.2" title="Abas e filtros">
              <Table
                head={["Aba", "O que mostra"]}
                rows={[
                  ["Todas", "Todas as conversas abertas que você pode ver."],
                  ["Não lidas", "Conversas com mensagens novas do cliente."],
                  ["Minhas", "Conversas atribuídas a você."],
                  ["Campanhas", "Clientes que responderam a uma campanha ou disparo."],
                  ["Aguardando", "Conversas na fila esperando um atendente. A cor indica a espera: até 10 min normal, até 20 min em alerta, acima disso fora do prazo."],
                  ["Lembretes", "Conversas com retorno agendado; o contador fica vermelho quando há lembrete vencido."],
                  ["Encerradas", "Atendimentos finalizados."],
                ]}
              />
              <p>Também é possível filtrar por fila e por prioridade (baixa, normal, alta, urgente).</p>
            </Sub>
            <Sub id="atendimento-estados" number="10.3" title="Estados da conversa">
              <Flow steps={["No menu", "Na fila", "Em atendimento", "Encerrada"]} />
              <Table
                head={["Estado", "Situação"]}
                rows={[
                  ["No menu", "O cliente está navegando no menu automático, sem atendente."],
                  ["Na fila", "Aguardando alguém da fila assumir."],
                  ["Em atendimento", "Uma pessoa assumiu e está respondendo."],
                  ["Encerrada", "Finalizada. Se o cliente escrever de novo, começa um novo atendimento."],
                ]}
              />
              <Note>Quem responde uma conversa sem dono a assume automaticamente. Conversa com dono nunca recebe resposta do robô.</Note>
            </Sub>
            <Sub id="atendimento-janela" number="10.4" title="Janela de 24 horas">
              <p>
                O indicador <Kbd>Janela de 24h aberta</Kbd> mostra se é possível mandar texto livre. A janela abre a cada mensagem do cliente e dura 24 horas.
                Fechada, só é possível enviar um modelo aprovado. Ao responder, o cliente reabre a janela.
              </p>
            </Sub>
            <Sub id="atendimento-escrever" number="10.5" title="Escrever, anexar e gravar áudio">
              <Bullets items={[
                "Texto, emojis e figurinhas. Para citar uma mensagem, passe o mouse sobre ela e responda.",
                <><Kbd>Respostas prontas</Kbd>: textos padrão da equipe, com variáveis como {"{cliente}"}, {"{atendente}"}, {"{fila}"} e {"{saudacao}"}.</>,
                "Anexos: imagens, vídeos, áudios e documentos. Arquivos fora das regras de imagem e vídeo da Meta seguem como documento.",
                "Gravar áudio: grave, ouça e envie, ou descarte.",
                <><Kbd>Nota interna</Kbd>: mensagem visível só para a equipe, nunca para o cliente.</>,
                <><Kbd>Agendar envio</Kbd>: a mensagem sai sozinha no horário escolhido.</>,
              ]} />
            </Sub>
            <Sub id="atendimento-acoes" number="10.6" title="Ações da conversa">
              <Table
                head={["Ação", "O que faz"]}
                rows={[
                  ["Assumir atendimento", "Passa a conversa para você e muda o estado para Em atendimento."],
                  ["Transferir conversa", "Envia para outra fila, com ou sem pessoa definida e com motivo. O histórico vai junto. A pessoa precisa estar ativa e abaixo do limite."],
                  ["Agendar retorno", "Cria um lembrete com data, hora e motivo (ex.: “retorno do orçamento multifocal”)."],
                  ["Criar oportunidade", "Abre um deal no pipeline com o contato preenchido."],
                  ["Marcar como não lida", "Devolve a conversa para a aba Não lidas."],
                  ["Finalizar atendimento", "Encerra, envia a despedida e a pesquisa de satisfação (se ligadas)."],
                  ["Reabrir atendimento", "Reabre uma conversa encerrada."],
                  ["Excluir conversa", "Somente administradores, com motivo."],
                ]}
              />
            </Sub>
            <Sub id="atendimento-agenda" number="10.7" title="Mensagens agendadas e lembretes">
              <Bullets items={[
                "A mensagem agendada sai pelo sistema com as permissões de quem agendou, como se a pessoa tivesse clicado em Enviar, e precisa estar dentro da janela de 24 horas do cliente.",
                "O atalho “Amanhã 9h” pula sábado e domingo.",
                "O lembrete de retorno avisa uma vez quem agendou quando vence e aparece na aba Lembretes.",
                "Tudo usa o horário de Brasília.",
              ]} />
            </Sub>
            <Sub id="atendimento-cliente" number="10.8" title="Painel do cliente">
              <Bullets items={[
                "Dados do cadastro, etiquetas da conversa (adicionar com Enter) e notas internas do contato.",
                "Dados do ERP: CPF, loja, compras, total gasto, últimos pedidos, últimas lentes de grau e validade estimada da receita, com o aviso de renovação.",
                "Campanhas recebidas e se o cliente respondeu.",
                "Conversas anteriores e o atalho Ver ficha completa.",
              ]} />
            </Sub>
            <Sub id="atendimento-nova" number="10.9" title="Iniciar uma nova conversa">
              <Steps items={[
                <>Clique em <Kbd>Nova conversa</Kbd> e busque o contato por nome ou telefone.</>,
                "Se ele já tem conversa aberta, o sistema oferece abrir a existente.",
                "Sem janela de 24 horas, escolha um modelo aprovado e preencha as variáveis. Com janela aberta, pode escrever texto livre.",
                "Revise a prévia e envie.",
              ]} />
            </Sub>
            <Sub id="atendimento-transcricao" number="10.10" title="Transcrição automática de áudios">
              <p>Todo áudio enviado pelo cliente é transcrito automaticamente. O texto aparece logo abaixo do player, na própria conversa.</p>
              <Bullets items={[
                "Dá para ler o pedido do cliente sem ouvir o áudio, por exemplo no meio de outro atendimento.",
                "A IA de atendimento usa a transcrição para entender e responder áudios.",
                "Cada áudio é transcrito uma única vez. Se a transcrição falhar, o áudio original continua disponível normalmente.",
              ]} />
            </Sub>
          </Chapter>

          {/* 11 */}
          <Chapter number={11} id="filas" title="Filas e equipe de atendimento" description="Quem atende o quê, quanta carga cada um aguenta e quem está esperando." tags={["filas", "equipe", "capacidade"]}>
            <Sub id="filas-papel" number="11.1" title="O papel das filas">
              <p>
                Uma fila agrupa assuntos (ex.: Vendas, Pós-venda, Financeiro) e as pessoas que atendem cada um. O menu automático e as transferências enviam
                conversas para as filas. Cada fila mostra quantos estão esperando agora, a maior espera, quem está online e a carga.
              </p>
              <Note kind="warn">Uma fila sem membros só é vista por quem tem a permissão “Ver todas as conversas”. Só é possível arquivar uma fila sem conversas abertas.</Note>
            </Sub>
            <Sub id="filas-equipe" number="11.2" title="Equipe, limite e pausa">
              <Table
                head={["Ajuste", "Efeito"]}
                rows={[
                  ["Limite simultâneo", "Máximo de conversas abertas por pessoa. Atingido o limite, a pessoa não recebe transferências."],
                  ["Limite 0", "A pessoa fica fora do atendimento."],
                  ["Pausada", "Não recebe conversas novas (intervalo, reunião)."],
                  ["Fila no limite", "Quando as conversas abertas chegam à capacidade somada da fila, os supervisores recebem um aviso."],
                ]}
              />
              <p>Para incluir alguém, use <Kbd>Adicionar pessoas</Kbd> (várias de uma vez). Quem não tem acesso ao Atendimento no cargo aparece sinalizado.</p>
            </Sub>
            <Sub id="filas-espera" number="11.3" title="Clientes aguardando">
              <p>Mostra os clientes por ordem de chegada, com o tempo total de espera e o tempo na posição atual, atualizando sozinho. Com o aviso ligado, o cliente é informado quando avança na fila:</p>
              <WhatsApp lines={[{ from: "empresa", text: "Você avançou na fila: agora é o 2º da fila Vendas. Obrigado por aguardar." }]} />
            </Sub>
            <Sub id="filas-respostas" number="11.4" title="Respostas prontas">
              <p>
                Cadastre título e texto (com variações). Uma resposta pode responder automaticamente a gatilhos (palavras, uma por linha). Sem gatilho, ela
                vale como saudação. As respostas ficam disponíveis no botão de respostas prontas da caixa de escrita.
              </p>
            </Sub>
            <Sub id="filas-bloqueados" number="11.5" title="Números bloqueados">
              <p>Bloqueie um telefone (com DDI, ex.: 5562999999999) informando o motivo. Número bloqueado não recebe mensagens. A equipe ainda pode registrar notas internas na conversa.</p>
            </Sub>
          </Chapter>

          {/* 12 */}
          <Chapter number={12} id="menu" title="Menu automático e avisos" description="O robô que recebe o cliente, direciona para a fila certa e cuida do silêncio e da despedida." tags={["ura", "menu", "automacao"]}>
            <Sub id="menu-como" number="12.1" title="Como o menu funciona">
              <p>Com o menu ligado, quem escreve recebe a saudação com a lista de opções, em lista interativa do WhatsApp (até 10 opções por nível) ou em texto numerado.</p>
              <WhatsApp lines={[
                { from: "cliente", text: "Oi" },
                { from: "empresa", text: "Olá, Maria! Como podemos ajudar?\n\n1. Comprar óculos\n2. Meu pedido\n3. Financeiro\n\nResponda com o número da opção." },
                { from: "cliente", text: "1" },
                { from: "empresa", text: "Certo! Já vou te passar para a equipe de Vendas." },
              ]} />
              <p>O menu pode ser editado em lista ou no <Kbd>fluxograma</Kbd>, que mostra visualmente os caminhos. Opções sem destino aparecem com o aviso “Falta ajustar”.</p>
            </Sub>
            <Sub id="menu-opcoes" number="12.2" title="Opções e ações">
              <Table
                head={["Ação", "O que acontece"]}
                rows={[
                  ["Responder", "Envia um texto e continua no menu."],
                  ["Abrir submenu", "Mostra outra lista de opções (com “0. Voltar”)."],
                  ["Enviar à fila", "Encerra o menu e passa para a equipe da fila."],
                  ["Atribuir a alguém", "Entrega a conversa a uma pessoa. Se ela estiver indisponível, a conversa cai na fila."],
                  ["Etiqueta ou segmento", "Aplica ou remove uma etiqueta (na conversa) ou um segmento (no contato) e continua."],
                  ["Encerrar", "Envia a mensagem final e fecha."],
                ]}
              />
            </Sub>
            <Sub id="menu-fechamento" number="12.3" title="Fora das opções e fechamento">
              <Bullets items={[
                "Mensagem fora das opções: aviso enviado quando o cliente escreve algo que não está na lista (ex.: “Não entendi essa opção…”).",
                "Frase de fechamento: depois de responder uma opção, o sistema espera (padrão de 60 segundos) e pergunta “Posso ajudar em mais alguma coisa?”. Se o cliente escrever antes, a frase não é enviada.",
                "Repetir a lista junto: mostra as opções de novo com a frase.",
              ]} />
            </Sub>
            <Sub id="menu-silencio" number="12.4" title="Silêncio do cliente">
              <Steps items={[
                "Se o cliente parar de responder no menu (padrão de 10 minutos), o sistema pergunta se ele ainda está ali.",
                "Sem resposta no tempo seguinte (padrão de 3 minutos), a conversa é encerrada com a despedida padrão ou uma mensagem própria.",
                "Se ele voltar depois, começa uma conversa nova.",
              ]} />
              <WhatsApp lines={[{ from: "empresa", text: "Você ainda está por aí? Se não responder, encerro esta conversa em 3 minutos." }]} />
            </Sub>
            <Sub id="menu-despedida" number="12.5" title="Despedida e pesquisa de satisfação">
              <p>Ao finalizar o atendimento, o cliente recebe a despedida e, em seguida, a pesquisa de 1 a 5:</p>
              <Table
                head={["Nota", "Rótulo"]}
                rows={[["1", "Muito insatisfeito 😡"], ["2", "Insatisfeito 🙁"], ["3", "Neutro 😐"], ["4", "Satisfeito 🙂"], ["5", "Muito satisfeito 🤩"]]}
              />
              <Bullets items={[
                "Notas 4 e 5 recebem o agradecimento logo em seguida.",
                "Notas 1, 2 e 3 recebem a pergunta de melhoria. O que o cliente escrever nos 5 minutos seguintes vira o comentário da avaliação.",
                "A nota fica na conversa encerrada e não abre novo atendimento. A pesquisa só é enviada quando um atendente encerrou a conversa.",
              ]} />
            </Sub>
            <Sub id="menu-horario" number="12.6" title="Horário de atendimento">
              <p>
                Defina os horários da semana (padrão de segunda a sexta das 8h às 18h e sábado das 8h às 12h) para todas as filas ou um horário próprio por fila.
                Fora do horário, o cliente recebe a mensagem de ausência com o horário e a conversa espera na fila, sem menu.
                O aviso se repete para o mesmo cliente no máximo a cada 12 horas.
              </p>
            </Sub>
            <Sub id="menu-robo" number="12.7" title="Respostas automáticas de outros robôs">
              <p>
                Mensagens de ausência ou saudação do WhatsApp Business do próprio cliente, e respostas que chegam poucos segundos depois de um disparo,
                são reconhecidas como automáticas. Elas ficam no histórico, mas não abrem o menu, o que evita um ciclo de robô respondendo robô.
              </p>
            </Sub>
          </Chapter>

          {/* 13 */}
          <Chapter number={13} id="satisfacao" title="NPS e métricas de atendimento" description="Medir a qualidade e a velocidade do atendimento." tags={["nps", "tme", "tma"]}>
            <Sub id="nps-pesquisas" number="13.1" title="Monitor de satisfação (NPS)">
              <Bullets items={[
                "Pesquisa de satisfação no WhatsApp: média, clientes satisfeitos, taxa de resposta, distribuição das notas e últimas avaliações, por período e atendente.",
                "Pesquisas de loja e produto (escala de 0 a 10): pontuação NPS, promotores (9–10), neutros (7–8) e detratores (0–6), evolução semanal e comentários recentes.",
                "Registrar resposta NPS: lança manualmente uma avaliação recebida por outro canal.",
              ]} />
            </Sub>
            <Sub id="metricas-indicadores" number="13.2" title="TME, TMA e TMR">
              <Table
                head={["Sigla", "Nome", "Cálculo"]}
                rows={[
                  ["TME", "Tempo médio de espera", "Da primeira mensagem do cliente até a primeira resposta de um atendente."],
                  ["TMA", "Tempo médio de atendimento", "Da primeira resposta do atendente até o encerramento."],
                  ["TMR", "Tempo médio de resposta", "Tempo para responder cada mensagem do cliente."],
                  ["Volume", "Atendimentos", "Iniciados e encerrados no período."],
                ]}
              />
              <p>Filtre por período, fila e atendente. Conversas que só guardam envios de campanha sem resposta não entram nas contas.</p>
            </Sub>
            <Sub id="metricas-graficos" number="13.3" title="Ranking, termos e regiões">
              <Bullets items={[
                "Atendimentos por dia: barras de iniciados e linha de encerrados.",
                "Ranking de atendentes: desempenho individual.",
                "Termos mais frequentes: palavras mais usadas pelos clientes, sem palavras comuns.",
                "Atendimentos por região: estado e DDD de quem iniciou o atendimento.",
              ]} />
            </Sub>
          </Chapter>

          {/* 14 */}
          <Chapter number={14} id="seguranca" title="Usuários, cargos e permissões" description="Quem acessa o quê. Todo usuário tem um cargo, e o cargo define as telas e ações liberadas." tags={["usuarios", "cargos", "permissoes"]}>
            <Sub id="seguranca-usuarios" number="14.1" title="Usuários">
              <Steps items={[
                "Em Usuários, clique em Novo Usuário.",
                "Informe nome completo, e-mail e senha (mínimo de 12 caracteres).",
                "Selecione o cargo.",
                "Para suspender o acesso sem apagar o histórico, use Bloquear acesso.",
              ]} />
            </Sub>
            <Sub id="seguranca-cargos" number="14.2" title="Cargos">
              <p>Crie cargos com nome e descrição (ex.: “Supervisor Regional”, “Vendedor”). O cargo <Kbd>admin</Kbd> tem acesso total, sempre. As telas de cada cargo são liberadas em Permissões.</p>
            </Sub>
            <Sub id="seguranca-modulos" number="14.3" title="Permissões por tela">
              <Table
                head={["Grupo", "Módulos"]}
                rows={[
                  ["Geral", "Painel · Configurações"],
                  ["Vendas", "Pipelines · Contatos & Clientes · Segmentos · Atendimento · Filas de Atendimento · Métricas de Atendimento"],
                  ["Marketing", "Campanhas · Disparos pelo pipeline · Modelos WhatsApp · Pesquisas NPS"],
                  ["Gestão", "Lojas · Usuários · Cargos · Permissões"],
                ]}
              />
              <Note>Quem tem “Disparos pelo pipeline” também abre a tela de Campanhas, onde ficam todos os envios.</Note>
            </Sub>
            <Sub id="seguranca-chat" number="14.4" title="Ações no atendimento">
              <Table
                head={["Ação", "Libera"]}
                rows={[
                  ["Ver todas as conversas", "Supervisão de todas as filas, inclusive filas sem membros."],
                  ["Assumir e responder", "Assumir conversas e escrever ao cliente. Sem ela, a pessoa vê, mas não responde."],
                  ["Transferir", "Passar conversas para outra fila ou pessoa."],
                  ["Encerrar", "Encerrar e reabrir conversas."],
                  ["Gerenciar filas", "Filas, equipe, menu, horários, bloqueados e respostas prontas."],
                ]}
              />
              <Note kind="info">Sem “Ver todas as conversas”, a pessoa vê apenas as conversas das filas de que participa e as atribuídas a ela.</Note>
            </Sub>
          </Chapter>

          {/* 15 */}
          <Chapter number={15} id="configuracoes" title="Configurações" description="Parâmetros gerais do CRM. As alterações valem depois de salvar." tags={["configuracoes", "parametros"]}>
            <Sub id="config-tabela" number="15.1" title="Tabela de configurações">
              <Table
                head={["Grupo", "Parâmetro", "Efeito"]}
                rows={[
                  ["Automações e NPS", "Enviar NPS de atendimento após (minutos)", "Intervalo para a pesquisa de atendimento."],
                  ["Automações e NPS", "Enviar pesquisa de produto após (dias)", "Prazo após a compra para a pesquisa de produto."],
                  ["Automações e NPS", "Considerar cliente inativo após (dias)", "Define quando um cliente passa a ser inativo."],
                  ["Notificações", "Novos contatos · Campanhas · Avaliações NPS baixas", "Quais eventos geram aviso no sino."],
                  ["Automação do Pipeline", "Habilitar sincronização automática", "Desligada, o botão de atualizar pipeline não reclassifica."],
                  ["Automação do Pipeline", "Limite de cards por etapa", "Máximo de cards exibidos por coluna."],
                  ["Custos e conversão", "Modelo de marketing (R$ por mensagem)", "Base do custo das campanhas de marketing (referência R$ 0,34)."],
                  ["Custos e conversão", "Modelo de utilidade (R$ por mensagem)", "Base do custo dos modelos de utilidade (referência R$ 0,04)."],
                  ["Custos e conversão", "Janela de conversão (dias após o envio)", "Prazo para atribuir uma venda do ERP à campanha."],
                ]}
              />
              <Note>Mensagens livres, dentro da janela de 24 horas, não são cobradas pela Meta. Menu, horários, despedida e pesquisa do atendimento ficam em Filas › Menu e avisos e Filas › Horário de atendimento.</Note>
            </Sub>
            <Sub id="config-whatsapp" number="15.2" title="Conta do WhatsApp Business">
              <p>Mostra a conta oficial conectada ao CRM para envio e recebimento de mensagens. A conexão é feita pela equipe técnica. Problemas de pagamento ou de autenticação nessa conta pausam os disparos automaticamente.</p>
            </Sub>
          </Chapter>

          {/* 16 */}
          <Chapter number={16} id="ia" title="Estúdio de IA" description="A assistente que atende no WhatsApp como consultora de vendas: o que ela sabe, como fala e quando chama uma pessoa." tags={["ia", "regras", "skills", "conhecimento"]}>
            <Sub id="ia-config" number="16.1" title="Configuração simplificada">
              <p>Em <Kbd>/ia</Kbd>, a aba <Kbd>Geral &amp; Identidade</Kbd> reúne tudo o que muda o comportamento da IA, em blocos curtos:</p>
              <Table
                head={["Bloco", "Para que serve"]}
                rows={[
                  ["Identidade e tom", "Nome da assistente e jeito de falar com o cliente."],
                  ["Atendimento, horário e transbordo", "Atendimento autônomo ligado ou não, horários próprios e quando passar para uma pessoa."],
                  ["Instruções e restrições", "Orientações extras e o que a IA nunca deve fazer."],
                  ["Estilo das respostas", "Responder em vários balões, agrupar automaticamente mensagens picadas do cliente e enviar a foto do produto encontrado."],
                ]}
              />
              <Note kind="tip">A IA age como consultora: busca produtos e estoque na hora, sem pedir permissão, e só oferece modelos disponíveis na cidade do cliente.</Note>
            </Sub>
            <Sub id="ia-transbordo" number="16.2" title="Quando a IA passa para uma pessoa">
              <p>Em <Kbd>A IA passa para uma pessoa quando</Kbd>, marque as situações que devem ir para um atendente:</p>
              <Bullets items={[
                "Intenção de compra ou orçamento.",
                "Reclamação ou cliente irritado.",
                "O cliente enviar receita ou comprovante.",
                "A IA não tiver certeza da resposta.",
                "Fora do horário de atendimento (ou sempre, se preferir que a IA só faça a triagem).",
              ]} />
              <p>A conversa vai para a fila com o resumo do que já foi conversado. Esse transbordo também pode disparar uma automação (gatilho <Kbd>IA transferiu o atendimento</Kbd>).</p>
            </Sub>
            <Sub id="ia-conhecimento" number="16.3" title="Regras, Skills e Base de Conhecimento">
              <Table
                head={["Aba", "O que cadastrar", "Exemplo"]}
                rows={[
                  ["Regras da Empresa", "Políticas fixas que a IA sempre segue. Podem ser ligadas ou desligadas.", "Prazo de troca, formas de pagamento, garantia."],
                  ["Skills da IA", "Protocolos passo a passo usados quando a conversa bate com um gatilho (palavras-chave ou intenção).", "“Agendamento de exame”: quando o cliente pergunta como agendar."],
                  ["Base de Conhecimento", "Documentos de consulta (colados ou enviados em arquivo de até 10 MB). A IA busca o trecho relevante a cada pergunta.", "Tabela de lentes 2026, programa de indicação."],
                ]}
              />
              <Steps items={[
                <>Abra a aba e clique em <Kbd>Nova regra</Kbd>, <Kbd>Nova skill</Kbd> ou <Kbd>Adicionar conhecimento</Kbd>.</>,
                "Preencha no modal o título, o conteúdo e, nas skills, quando a IA deve usá-la.",
                "Salve e confira no Simulador se a IA responde como esperado.",
              ]} />
              <Note>Na Base de Conhecimento, o teste de busca mostra quais trechos seriam usados. “Nenhum trecho relevante” significa que a IA responderia sem consultar os documentos.</Note>
            </Sub>
            <Sub id="ia-simulador" number="16.4" title="Simulador e consumo">
              <Bullets items={[
                "Simulador: converse como se fosse o cliente (texto, imagem, áudio ou documento) antes de mudar algo em produção. “Começar outra conversa” limpa o contexto.",
                "Consumo & Limites: gasto de hoje e do mês, custo médio por conversa, atendimentos da IA no mês e gasto por função.",
                "Conexão & Credenciais: chaves e conexão com o provedor de IA.",
              ]} />
            </Sub>
          </Chapter>

          {/* 17 */}
          <Chapter number={17} id="automacoes" title="Automações" description="Fluxos visuais que reagem a eventos do WhatsApp, do pipeline e do ERP VMSet e trabalham sozinhos." tags={["automacoes", "fluxos", "vmset", "webhook"]}>
            <Sub id="auto-canvas" number="17.1" title="O canvas visual">
              <p>Cada automação é um desenho: um <Kbd>gatilho</Kbd> no início e <Kbd>passos</Kbd> ligados por setas. Arraste os blocos da barra lateral para o canvas e ligue as saídas.</p>
              <Steps items={[
                <>Em <Kbd>/automacoes</Kbd>, crie uma automação (do zero, por modelo pronto ou com IA).</>,
                "Escolha o gatilho e adicione os passos. Clique em um bloco para configurar.",
                "Use Testar fluxo para simular com um contato real: regras e condições são avaliadas de verdade, as esperas são puladas, nenhuma mensagem é enviada e nada é gravado.",
                "Salve como Rascunho enquanto ajusta e clique em Ativar para colocar no ar.",
              ]} />
              <Note kind="warn">Antes de ativar, o editor aponta passos incompletos (ex.: roleta sem vendedores, mensagem sem texto). Corrija os avisos para liberar a ativação.</Note>
            </Sub>
            <Sub id="auto-ia" number="17.2" title="Criar automação com IA">
              <p>Clique em <Kbd>Criar com IA</Kbd> e descreva o fluxo em português, por exemplo: “quando o cliente comprar no VMSet, esperar 7 dias e mandar pesquisa de satisfação; se não responder em 2 dias, avisar a loja”.</p>
              <p>A IA monta o rascunho no canvas usando apenas os passos que o sistema realmente executa. Revise cada bloco, ajuste textos e ative.</p>
            </Sub>
            <Sub id="auto-gatilhos" number="17.3" title="Gatilhos (incluindo ERP VMSet)">
              <Table
                head={["Grupo", "Gatilhos"]}
                rows={[
                  ["WhatsApp & Atendimento", "Mensagem recebida (qualquer uma ou com palavra-chave), clicou em link rastreado, IA transferiu o atendimento."],
                  ["CRM & Pipeline", "Webhook recebido, novo lead, lead entrou na etapa, oportunidade movida para Ganho, tag adicionada, pontuação atingiu X pontos, mudou de nível (tier), mudança na matriz RFV-P, aniversário do cliente, receita cadastrada."],
                  ["ERP VMSet — Vendas", "Comprou no VMSet (venda faturada, primeira compra ou recompra, por loja ou produto), tempo após a venda (pós-venda), OS pronta para retirada."],
                  ["ERP VMSet — Financeiro & Ciclo de vida", "Parcela prestes a vencer, pagamento identificado, quitou o carnê/crediário, cliente adimplente ou inadimplente há X, cliente sem comprar há X (reativação)."],
                ]}
              />
            </Sub>
            <Sub id="auto-nos" number="17.4" title="Passos (nós) do fluxo">
              <Table
                head={["Categoria", "Passos disponíveis"]}
                rows={[
                  ["Mensagens & Tempo", "Enviar WhatsApp (texto, modelo ou nota de voz, com “digitando/gravando” antes e links rastreados), Aguardar, Aguardar resposta do cliente (com prazo e saída para “Não respondeu”), Esperar até horário útil."],
                  ["CRM & Funil", "Criar oportunidade, Mover etapa no pipeline, Adicionar/Remover tag, Atualizar campo do contato, Adicionar observação, Alterar pontuação (Lead Score), Atribuir atendente/fila, Roleta de vendedores, Notificar usuário/equipe, Marcar opt-out."],
                  ["Lógica & Webhooks", "Condição (se/senão) por tag, etapa, fila, cidade, RFV-P, nível e campos; Teste A/B; Requisição HTTP; Ir para outra automação; Encerrar."],
                  ["Inteligência Artificial", "Acionar agente de IA com um objetivo (ex.: qualificar o lead) e seguir conforme o resultado."],
                ]}
              />
              <Note kind="tip">Mensagens podem usar variáveis do contato, como {"{{nome}}"}, {"{{loja}}"} e {"{{rfvp.segmento}}"}.</Note>
            </Sub>
            <Sub id="auto-roleta" number="17.5" title="Roleta de vendedores">
              <p>O passo <Kbd>Roleta de vendedores</Kbd> distribui leads entre a equipe automaticamente.</p>
              <Bullets items={[
                "Distribuir entre: os membros de uma fila/loja ou vendedores escolhidos.",
                "Regra: Rodízio (um para cada, em ordem) ou Menor carga ativa (quem tem menos atendimentos abertos).",
                "Opções: só vendedores online e não pausados, respeitar o turno da fila, limite de atendimentos simultâneos e registrar o vendedor na oportunidade do pipeline.",
                "Quando ninguém está disponível, o fluxo segue pela saída “Sem vendedor disponível” (ex.: mandar para a fila geral ou avisar o gerente).",
              ]} />
            </Sub>
            <Sub id="auto-webhook" number="17.6" title="Webhooks de entrada">
              <p>Uma automação pode começar quando outro sistema envia dados ao CRM: Meta Ads, Google Ads, Typeform, landing pages, Zapier ou Make.</p>
              <Steps items={[
                <>Escolha o gatilho <Kbd>Webhook recebido</Kbd> e copie o endereço exclusivo mostrado no bloco.</>,
                "Cole esse endereço na ferramenta de origem (formulário, anúncio ou integração).",
                <>Clique em <Kbd>Escutar evento de teste</Kbd> e envie um teste pela origem: o CRM mostra os campos recebidos.</>,
                "Indique quais campos são nome, telefone, e-mail e origem/UTM (o sistema sugere sozinho) e marque se deve criar o contato quando o telefone ainda não existir.",
              ]} />
              <Note kind="warn">O endereço do webhook funciona como uma senha. Não publique em lugares abertos.</Note>
            </Sub>
            <Sub id="auto-metricas" number="17.7" title="Métricas por nó">
              <p>Com a automação ativa, cada bloco do canvas mostra um selo com os números daquele passo, e o topo do editor traz o resumo do fluxo.</p>
              <Table
                head={["Métrica", "Significado"]}
                rows={[
                  ["Entraram / concluíram / erros", "Quantos contatos passaram pelo bloco e quantos tiveram falha."],
                  ["Enviadas / entregues / respondidas", "Resultado das mensagens enviadas naquele passo."],
                  ["Vendas e receita", "Compras no VMSet de quem passou pelo fluxo, dentro da janela de atribuição."],
                  ["Resumo do fluxo", "Leads, execuções ativas, concluídas e com falha, entregues, respostas, vendas e receita."],
                ]}
              />
            </Sub>
          </Chapter>

          {/* 18 */}
          <Chapter number={18} id="clientes-vip" title="Clientes VIP, Lead Score e RFV-P" description="Quem são os melhores clientes, quem está esfriando e quem paga em dia, em números simples." tags={["vip", "lead-score", "rfvp", "tier"]}>
            <Sub id="vip-score" number="18.1" title="Lead Score">
              <p>Cada contato tem uma <Kbd>pontuação</Kbd> que sobe ou desce conforme o relacionamento: compras, respostas, cliques e regras das automações (passo Alterar pontuação).</p>
              <Bullets items={[
                "A ficha do cliente (aba Pontuação, em /clientes-vip e /contatos) mostra o score, o progresso para o próximo nível e o histórico de cada movimentação com o motivo.",
                "Na mesma aba há o ajuste manual de pontos, sempre com justificativa registrada no histórico.",
                "Uma automação pode reagir quando a pontuação atinge um valor (gatilho Pontuação atingiu X pontos).",
              ]} />
            </Sub>
            <Sub id="vip-niveis" number="18.2" title="Níveis Diamante, Ouro, Prata e Bronze">
              <Table
                head={["Nível", "Faixa padrão de pontos"]}
                rows={[
                  ["Diamante", "700 ou mais"],
                  ["Ouro", "300 a 699"],
                  ["Prata", "100 a 299"],
                  ["Bronze", "Abaixo de 100"],
                ]}
              />
              <p>As faixas são ajustáveis em <Kbd>Parametrizar RFV-P &amp; Níveis</Kbd> (aba Níveis). Ao salvar, todos os contatos são reclassificados. A mudança de nível pode disparar uma automação (gatilho Mudou de nível).</p>
            </Sub>
            <Sub id="vip-rfvp" number="18.3" title="Matriz RFV-P (555-5)">
              <p>O RFV-P dá uma nota de 1 a 5 para quatro pilares, calculados com as vendas e o crediário do VMSet:</p>
              <Table
                head={["Pilar", "O que mede"]}
                rows={[
                  ["R — Recência", "Dias desde a última compra concluída."],
                  ["F — Frequência", "Quantas compras na janela de análise."],
                  ["V — Valor", "Total gasto (ou ticket médio) na janela."],
                  ["P — Pontualidade", "Parcelas de carnê, boleto e crédito interno pagas em dia."],
                ]}
              />
              <p>O código junta as notas: <Kbd>555-5</Kbd> é o cliente ideal (comprou há pouco, compra sempre, gasta bem e paga em dia). O recálculo é automático todo dia às 6h, e o botão <Kbd>Recalcular RFV-P</Kbd> atualiza na hora. As faixas de cada nota são editáveis em Parametrizar RFV-P &amp; Níveis, com a opção de restaurar o padrão recomendado.</p>
            </Sub>
            <Sub id="vip-segmentos" number="18.4" title="Segmentos RFV-P e uso no dia a dia">
              <Table
                head={["Segmento", "Quem é", "Ação sugerida"]}
                rows={[
                  ["Campeões Pagadores", "Compram muito, recentemente, gastam bem e pagam em dia.", "Lançamentos e convites exclusivos."],
                  ["Fiéis em Dia", "Compram com frequência e pagam em dia.", "Programa de indicação e pós-venda."],
                  ["Novos Promissores", "Compraram há pouco, ainda com poucas compras.", "Boas-vindas e segunda compra."],
                  ["Alto Valor com Risco", "Gastam bem, mas atrasam ou têm parcela em aberto.", "Cobrança cuidadosa, sem oferta agressiva."],
                  ["Em Risco / Hibernando", "Compravam com frequência, mas sumiram.", "Reativação com oferta ou exame de vista."],
                  ["Regulares", "Compraram no último semestre, sem destaque.", "Campanhas sazonais."],
                  ["Inadimplentes", "Pontualidade baixa ou título vencido há muito tempo.", "Fluxo de cobrança (financeiro)."],
                  ["Inativos / Perdidos", "Sem compras recentes ou nunca compraram.", "Reconquista com baixo custo."],
                ]}
              />
              <Bullets items={[
                "Em /clientes-vip: KPIs por nível, segmentos clicáveis, busca, filtros por nível, segmento e nota de cada pilar. Clique na linha para abrir a ficha completa.",
                "O badge RFV-P aparece também no /chat e em /contatos.",
                "Segmentos de público e filtros de campanha aceitam condições de RFV-P; automações têm o gatilho Mudança na matriz RFV-P e variáveis {{rfvp.*}}.",
              ]} />
            </Sub>
          </Chapter>

          {/* 19 */}
          <Chapter number={19} id="guias" title="Guias passo a passo por perfil" description="Rotinas recomendadas para cada função." tags={["rotina", "boas-praticas"]}>
            <Sub id="guia-atendente" number="19.1" title="O dia a dia do atendente">
              <Steps items={[
                "Ao chegar, abra o Atendimento e confira a aba Lembretes (vencidos em vermelho).",
                "Atenda a aba Aguardando pela ordem, priorizando as conversas em alerta (mais de 10 min).",
                "Responda as Não lidas das suas conversas (Minhas).",
                "Antes de responder, consulte o painel do cliente: compras, receita e campanhas.",
                "Fora da janela de 24 horas, use um modelo aprovado.",
                "Combine retornos com Agendar retorno e registre detalhes em nota interna.",
                "Ao terminar, use Finalizar atendimento para que o cliente receba a pesquisa.",
                "Saindo para intervalo, peça ao supervisor para pausar sua distribuição.",
              ]} />
            </Sub>
            <Sub id="guia-supervisor" number="19.2" title="O dia a dia do supervisor">
              <Steps items={[
                "Acompanhe em Filas quem está esperando, a maior espera e a carga de cada pessoa.",
                "Ajuste limites e pausas conforme a escala do dia.",
                "Transfira conversas para equilibrar a carga.",
                "Fique atento aos avisos de Fila no limite no sino.",
                "Revise semanalmente as Métricas de Atendimento (TME, TMA, ranking) e as avaliações baixas no NPS.",
                "Mantenha respostas prontas e o menu atualizados.",
              ]} />
            </Sub>
            <Sub id="guia-marketing" number="19.3" title="O dia a dia do marketing">
              <Steps items={[
                "Monte o público em Segmentos, preferindo critérios.",
                "Crie ou confirme um modelo aprovado em Modelos WhatsApp.",
                "Crie a campanha, confira o custo estimado e dispare.",
                "Acompanhe entregues, lidos e respostas ao vivo e reenvie falhas quando fizer sentido.",
                "Após a janela de conversão, avalie Vendido, ROI e conversões e crie a segunda onda com “receberam e não compraram”.",
                "Use os segmentos RFV-P de /clientes-vip para campanhas certeiras (ex.: reativar “Em Risco / Hibernando”) e confira no passo Público quantos clientes únicos vão receber.",
              ]} />
            </Sub>
            <Sub id="guia-admin" number="19.4" title="O dia a dia do administrador">
              <Steps items={[
                "Cadastre usuários e atribua cargos. Bloqueie acessos de quem saiu.",
                "Revise em Permissões as telas e ações de cada cargo.",
                "Mantenha as lojas cadastradas com número correto, bairro e raio.",
                "Revise em Configurações os preços da Meta e a janela de conversão.",
                "Configure filas, horário de atendimento e menu automático.",
                "Mantenha atualizadas as Regras, Skills e a Base de Conhecimento da IA e acompanhe o consumo em /ia.",
                "Revise as métricas por nó das automações ativas e publique vídeos de treinamento para novos colaboradores.",
              ]} />
            </Sub>
          </Chapter>

          {/* 20 */}
          <Chapter number={20} id="faq" title="Glossário e perguntas frequentes" description="Termos usados no sistema e respostas para as dúvidas mais comuns." tags={["glossario", "faq", "suporte"]}>
            <Sub id="glossario" number="20.1" title="Glossário">
              <Table
                head={["Termo", "Significado"]}
                rows={[
                  ["ERP", "Sistema de vendas das lojas. Fonte dos pedidos, valores e lojas."],
                  ["Janela de 24h", "Período após a última mensagem do cliente em que é permitido enviar texto livre."],
                  ["Modelo (template)", "Mensagem pré-aprovada pela Meta, obrigatória fora da janela."],
                  ["Segmento", "Público definido por critérios ou seleção de contatos."],
                  ["Disparo / lote", "Envio em massa de uma campanha ou de uma etapa do pipeline."],
                  ["Último toque", "Regra que dá o pedido à última campanha entregue antes da compra."],
                  ["LTV", "Total gasto pelo cliente ao longo do tempo."],
                  ["TME / TMA / TMR", "Tempos médios de espera, atendimento e resposta."],
                  ["NPS", "Pesquisa de satisfação (1 a 5 no atendimento; 0 a 10 em loja e produto)."],
                  ["Nota interna", "Mensagem visível só para a equipe."],
                  ["Fila", "Grupo de assunto e pessoas que atendem conversas."],
                  ["Lead Score", "Pontuação de relacionamento do contato, que define o nível (Bronze, Prata, Ouro, Diamante)."],
                  ["RFV-P", "Notas de 1 a 5 para Recência, Frequência, Valor e Pontualidade. Ex.: 555-5."],
                  ["Automação", "Fluxo visual com gatilho e passos que roda sozinho."],
                  ["Roleta", "Distribuição automática de leads entre vendedores."],
                  ["Webhook", "Endereço que recebe dados de outro sistema (anúncios, formulários) e inicia uma automação."],
                  ["Skill", "Protocolo que a IA segue quando a conversa trata de um assunto específico."],
                ]}
              />
            </Sub>
            <Sub id="perguntas" number="20.2" title="Perguntas frequentes">
              <div className="space-y-4">
                {[
                  { q: "Não consigo responder um cliente: aparece que só posso enviar modelo.", a: "A janela de 24 horas está fechada. Envie um modelo aprovado; quando o cliente responder, a janela reabre e o texto livre volta a ser permitido." },
                  { q: "Uma tela não aparece no meu menu.", a: "Seu cargo não tem acesso a ela. Peça ao administrador para liberar em Permissões." },
                  { q: "Consigo ver a conversa, mas não escrever.", a: "Falta a ação “Assumir e responder” no seu cargo, ou a conversa está encerrada (use Reabrir atendimento)." },
                  { q: "Não consigo transferir para um colega.", a: "Ele pode estar pausado, com limite 0 ou já no limite de conversas. Transfira só para a fila ou ajuste o limite em Filas › Equipe." },
                  { q: "A campanha pulou alguns contatos.", a: "Eles receberam outra campanha nos últimos 7 dias, já tinham recebido esta, ou não têm telefone válido. Para ignorar o descanso, marque “Ignorar intervalo mínimo de envio”." },
                  { q: "Uma venda não entrou na campanha.", a: "Confira se a compra foi dentro da janela de conversão, se não aconteceu antes do envio no mesmo dia e se o cliente não recebeu outra campanha depois (último toque). Pedidos do ERP chegam em lotes; aguarde a próxima atualização." },
                  { q: "O menu não respondeu o cliente.", a: "A conversa pode ter dono (o robô não responde conversas atribuídas), estar fora do horário (vai direto para a fila) ou a mensagem foi reconhecida como resposta automática." },
                  { q: "A mensagem ficou com “Falha no envio”.", a: "Passe o mouse no aviso para ver o motivo. Os motivos mais comuns são número inválido, janela fechada ou arquivo fora do formato aceito pela Meta." },
                  { q: "O total geral de campanhas é diferente da soma que eu fiz.", a: "O total não conta duas vezes o mesmo pedido ou cliente. Cada pedido pertence a uma única campanha, a última entregue antes da compra." },
                  { q: "Escolhi dois segmentos e o total de destinatários é menor que a soma.", a: "Quem está nos dois segmentos (ou tem dois cadastros com o mesmo celular) recebe uma única mensagem. O resumo no passo Público mostra quantos foram unificados." },
                  { q: "A campanha criada com IA não deixa disparar.", a: "O modelo novo está aguardando aprovação da Meta. Assim que for aprovado, a campanha fica Pronta para envio. Se for rejeitado, gere nova versão e reenvie." },
                  { q: "A IA respondeu algo errado sobre uma política da loja.", a: "Cadastre ou corrija a informação em /ia › Regras da Empresa (ou na Base de Conhecimento) e teste no Simulador." },
                  { q: "O RFV-P de um cliente está desatualizado.", a: "O cálculo roda todo dia às 6h com os dados do VMSet. Para atualizar na hora, use Recalcular RFV-P em /clientes-vip." },
                  { q: "Onde estão os vídeos de treinamento?", a: "No topo do manual, troque para Vídeos & Treinamentos. As aulas tocam em sequência com a reprodução automática ligada. Administradores publicam, editam, reordenam e excluem pelo botão Adicionar vídeo e pelo menu “...” de cada aula." },
                  { q: "Minha automação não está disparando.", a: "Confira se ela está Ativa (não em Rascunho), se o gatilho e os filtros batem com o contato e veja as métricas por nó para saber onde os contatos param. Use Testar fluxo para simular." },
                ].map((item) => (
                  <div key={item.q} className="rounded-xl border border-[#e2e6ee] p-4 dark:border-slate-800">
                    <p className="font-semibold text-[#051647] dark:text-white"><span className="mr-1.5 text-[#F7915E]">P:</span>{item.q}</p>
                    <p className="mt-1.5"><span className="mr-1.5 font-semibold text-[#002187] dark:text-[#C4D600]">R:</span>{item.a}</p>
                  </div>
                ))}
              </div>
            </Sub>
          </Chapter>

          <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>CRM Óticas Brasil · Manual do sistema</span>
            <span className="flex gap-5">
              <a href="#manual" className="cursor-pointer font-medium text-[#002187] hover:underline dark:text-[#C4D600]">Voltar ao topo</a>
              <Link href="/" className="cursor-pointer font-medium text-[#002187] hover:underline dark:text-[#C4D600]">Ir para o CRM</Link>
            </span>
          </footer>
        </>} />
      </Suspense>
    </div>
  );
}
