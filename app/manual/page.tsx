import Link from "next/link";
import { BookOpen, ListChecks, Settings2, UsersRound } from "lucide-react";
import { Bullets, Chapter, Flow, Kbd, Note, Steps, Sub, Table, WhatsApp, type ManualChapter } from "@/components/manual/ManualParts";
import { ManualToc } from "@/components/manual/ManualToc";

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

      <header className="relative overflow-hidden rounded-2xl bg-[#051647] px-6 py-8 text-white shadow-sm sm:px-10 sm:py-10">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4D600]/15" aria-hidden />
        <div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-[#F7915E]/15" aria-hidden />
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#C4D600]"><BookOpen className="h-4 w-4" /> Manual do sistema</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">Manual completo do CRM Óticas Brasil</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
          Tudo o que o sistema faz, tela por tela: atendimento no WhatsApp, filas e menu automático, pipelines, contatos, segmentos,
          campanhas com retorno em vendas do ERP, pesquisas de satisfação, permissões e configurações. Use o sumário para ir direto ao assunto.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <a href="#visao-geral" className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#C4D600] px-4 py-2 text-sm font-semibold text-[#051647] transition hover:bg-[#d4e400]"><BookOpen className="h-4 w-4" /> Iniciar leitura</a>
          <a href="#config-tabela" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"><Settings2 className="h-4 w-4" /> Tabela de configurações</a>
          <a href="#guias" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"><UsersRound className="h-4 w-4" /> Guia por perfil</a>
          <a href="#perguntas" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"><ListChecks className="h-4 w-4" /> Perguntas frequentes</a>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="manual-toc lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <div className="rounded-2xl border border-[#e2e6ee] bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#07194f]/60">
            <ManualToc chapters={CHAPTERS} />
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
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
                  ["Marketing", "Contatos & Clientes · Segmentos · Campanhas e disparos · Modelos WhatsApp · Pesquisas NPS"],
                  ["Gestão", "Lojas · Usuários · Cargos · Permissões"],
                  ["Sistema", "Configurações · Manual do sistema (este documento)"],
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
              <p>Na seleção de contatos é possível importar uma planilha (nome e telefone). O sistema localiza os contatos pelo telefone e cria os que ainda não existem.</p>
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
          <Chapter number={16} id="guias" title="Guias passo a passo por perfil" description="Rotinas recomendadas para cada função." tags={["rotina", "boas-praticas"]}>
            <Sub id="guia-atendente" number="16.1" title="O dia a dia do atendente">
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
            <Sub id="guia-supervisor" number="16.2" title="O dia a dia do supervisor">
              <Steps items={[
                "Acompanhe em Filas quem está esperando, a maior espera e a carga de cada pessoa.",
                "Ajuste limites e pausas conforme a escala do dia.",
                "Transfira conversas para equilibrar a carga.",
                "Fique atento aos avisos de Fila no limite no sino.",
                "Revise semanalmente as Métricas de Atendimento (TME, TMA, ranking) e as avaliações baixas no NPS.",
                "Mantenha respostas prontas e o menu atualizados.",
              ]} />
            </Sub>
            <Sub id="guia-marketing" number="16.3" title="O dia a dia do marketing">
              <Steps items={[
                "Monte o público em Segmentos, preferindo critérios.",
                "Crie ou confirme um modelo aprovado em Modelos WhatsApp.",
                "Crie a campanha, confira o custo estimado e dispare.",
                "Acompanhe entregues, lidos e respostas ao vivo e reenvie falhas quando fizer sentido.",
                "Após a janela de conversão, avalie Vendido, ROI e conversões e crie a segunda onda com “receberam e não compraram”.",
              ]} />
            </Sub>
            <Sub id="guia-admin" number="16.4" title="O dia a dia do administrador">
              <Steps items={[
                "Cadastre usuários e atribua cargos. Bloqueie acessos de quem saiu.",
                "Revise em Permissões as telas e ações de cada cargo.",
                "Mantenha as lojas cadastradas com número correto, bairro e raio.",
                "Revise em Configurações os preços da Meta e a janela de conversão.",
                "Configure filas, horário de atendimento e menu automático.",
              ]} />
            </Sub>
          </Chapter>

          {/* 17 */}
          <Chapter number={17} id="faq" title="Glossário e perguntas frequentes" description="Termos usados no sistema e respostas para as dúvidas mais comuns." tags={["glossario", "faq", "suporte"]}>
            <Sub id="glossario" number="17.1" title="Glossário">
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
                ]}
              />
            </Sub>
            <Sub id="perguntas" number="17.2" title="Perguntas frequentes">
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
                ].map((item) => (
                  <div key={item.q} className="rounded-xl border border-[#e2e6ee] p-4 dark:border-slate-800">
                    <p className="font-semibold text-[#051647] dark:text-white"><span className="mr-1.5 text-[#F7915E]">P:</span>{item.q}</p>
                    <p className="mt-1.5"><span className="mr-1.5 font-semibold text-[#002187] dark:text-[#C4D600]">R:</span>{item.a}</p>
                  </div>
                ))}
              </div>
            </Sub>
          </Chapter>

          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#051647] px-6 py-4 text-sm text-slate-300">
            <span>CRM Óticas Brasil · Manual do sistema</span>
            <span className="flex gap-4">
              <a href="#manual" className="cursor-pointer text-[#C4D600] hover:text-white">Voltar ao topo</a>
              <Link href="/" className="cursor-pointer text-[#C4D600] hover:text-white">Ir para o CRM</Link>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
