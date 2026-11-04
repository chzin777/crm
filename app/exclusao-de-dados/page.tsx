import Link from 'next/link';

export const metadata = {
  title: 'Exclusão de Dados | CRM Óticas Brasil',
  description: 'Solicite a exclusão dos seus dados pessoais do CRM Óticas Brasil conforme a LGPD.',
};

export default function ExclusaoDeDadosPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#051647] text-white shadow-lg">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 text-sm text-[#C4D600] hover:text-white transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar ao início
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Exclusão de Dados do Usuário
          </h1>
          <p className="mt-2 text-slate-300">
            Última atualização: 22 de outubro de 2026
          </p>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="space-y-8 text-slate-700">

          {/* Introdução */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              1. Seu Direito à Exclusão
            </h2>
            <p className="leading-relaxed">
              Em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018), você tem o direito de solicitar a exclusão dos seus dados pessoais tratados pelo CRM Óticas Brasil. Esta página explica como exercer esse direito e o que acontece com suas informações após a solicitação.
            </p>
            <div className="mt-4 rounded-lg bg-blue-50 p-4 border-l-4 border-[#002187]">
              <p className="text-sm text-[#002187]">
                <strong>Importante:</strong> A exclusão de dados é irreversível. Uma vez processada, não será possível recuperar as informações excluídas.
              </p>
            </div>
          </section>

          {/* O que será excluído */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              2. Quais Dados Serão Excluídos
            </h2>
            <p className="mb-4 leading-relaxed">
              Ao solicitar a exclusão da sua conta, os seguintes dados serão permanentemente removidos de nossos sistemas:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Dados de perfil:</strong> nome, e-mail, telefone, foto de perfil e preferências pessoais.</li>
              <li><strong>Dados de acesso:</strong> histórico de login, tokens de sessão e registros de autenticação.</li>
              <li><strong>Conteúdo gerado:</strong> anotações pessoais, configurações de dashboard e preferências de interface.</li>
              <li><strong>Comunicações diretas:</strong> mensagens enviadas através do sistema de suporte ou feedback direto.</li>
            </ul>
          </section>

          {/* O que NÃO será excluído imediatamente */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              3. Dados Mantidos por Obrigação Legal
            </h2>
            <p className="mb-4 leading-relaxed">
              Alguns dados podem ser mantidos mesmo após a solicitação de exclusão, conforme permitido pelo Art. 16 da LGPD, nas seguintes hipóteses:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Cumprimento de obrigação legal ou regulatória:</strong> registros de transações financeiras e notas fiscais devem ser mantidos pelo prazo legal (geralmente 5 anos).</li>
              <li><strong>Estudo por órgão de pesquisa:</strong> dados anonimizados podem ser mantidos para fins estatísticos.</li>
              <li><strong>Transferência a terceiro:</strong> desde que respeitados os requisitos de tratamento de dados.</li>
              <li><strong>Uso exclusivo do controlador:</strong> para proteção de crédito ou exercício regular de direitos em processo judicial, administrativo ou arbitral.</li>
            </ul>
            <p className="mt-4 text-sm text-slate-600">
              Nestes casos, os dados serão mantidos em ambiente seguro e restrito, acessível apenas para as finalidades específicas permitidas por lei.
            </p>
          </section>

          {/* Dados de Negócios */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              4. Dados de Negócios e Clientes
            </h2>
            <p className="mb-4 leading-relaxed">
              Se você utiliza o CRM para gerenciar dados de clientes (contatos, oportunidades, histórico de compras), atenção:
            </p>
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 p-4 border-l-4 border-[#F7915E]">
                <p className="text-sm text-slate-700">
                  <strong className="text-[#F7915E]">Para Usuários Administradores:</strong> A exclusão da sua conta pessoal não exclui automaticamente os dados de negócios da empresa. Esses dados pertencem à organização e permanecerão acessíveis a outros usuários autorizados da mesma conta corporativa.
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 p-4 border-l-4 border-[#F7915E]">
                <p className="text-sm text-slate-700">
                  <strong className="text-[#F7915E]">Para Exclusão Total de Dados da Empresa:</strong> Se você é o único administrador e deseja encerrar completamente a conta da empresa, incluindo todos os dados de clientes, entre em contato conosco especificando essa solicitação.
                </p>
              </div>
            </div>
          </section>

          {/* Como Solicitar */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              5. Como Solicitar a Exclusão
            </h2>
            <p className="mb-4 leading-relaxed">
              Você pode solicitar a exclusão dos seus dados através dos seguintes canais:
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-2 font-semibold text-[#002187] flex items-center gap-2">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Por E-mail
                </h3>
                <p className="text-sm text-slate-600 mb-2">Envie uma solicitação para:</p>
                <code className="block rounded bg-slate-100 px-2 py-1 text-sm text-[#051647]">privacidade@oticasbrasil.com.br</code>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-2 font-semibold text-[#002187] flex items-center gap-2">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Pela Plataforma
                </h3>
                <p className="text-sm text-slate-600 mb-2">Acesse Configurações &gt; Conta &gt; Encerrar Conta</p>
                <span className="inline-block rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">Disponível para usuários logados</span>
              </div>
            </div>

            <div className="mt-6 rounded-lg bg-slate-50 p-4">
              <h4 className="mb-2 font-medium text-[#051647]">Informações necessárias na solicitação:</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                <li>Nome completo cadastrado</li>
                <li>E-mail associado à conta</li>
                <li>CPF ou CNPJ (para verificação de identidade)</li>
                <li>Declaração expressa de que deseja a exclusão dos dados</li>
              </ul>
            </div>
          </section>

          {/* Prazo */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              6. Prazo para Processamento
            </h2>
            <p className="leading-relaxed">
              Após recebermos sua solicitação verificada, temos o prazo de até <strong>15 dias corridos</strong> para:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>Confirmar o recebimento da solicitação.</li>
              <li>Verificar sua identidade para segurança dos dados.</li>
              <li>Processar a exclusão dos dados aplicáveis.</li>
              <li>Enviar um comprovante de conclusão da exclusão.</li>
            </ul>
            <p className="mt-4 text-sm text-slate-600">
              Em casos complexos ou que envolvam grande volume de dados, poderemos estender este prazo por mais 15 dias, mediante justificativa e comunicação prévia.
            </p>
          </section>

          {/* Consequências */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              7. Consequências da Exclusão
            </h2>
            <p className="mb-4 leading-relaxed">
              Ao solicitar a exclusão dos seus dados, esteja ciente de que:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Perda de acesso:</strong> você perderá imediatamente o acesso à sua conta e a todos os recursos associados.</li>
              <li><strong>Irreversibilidade:</strong> a ação não pode ser desfeita. Para voltar a usar o serviço, será necessário criar uma nova conta.</li>
              <li><strong>Dados de terceiros:</strong> se você inseriu dados de outras pessoas (clientes, leads), a responsabilidade pela obtenção de consentimento para exclusão desses dados é sua, conforme sua relação com esses titulares.</li>
              <li><strong>Faturamento:</strong> quaisquer faturas pendentes deverão ser quitadas antes ou durante o processo de exclusão.</li>
            </ul>
          </section>

          {/* Backup */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              8. Exportação de Dados (Portabilidade)
            </h2>
            <p className="mb-4 leading-relaxed">
              Antes de solicitar a exclusão, você pode querer baixar uma cópia dos seus dados. Conforme o direito de portabilidade da LGPD, oferecemos a possibilidade de exportar suas informações em formato estruturado (CSV ou JSON).
            </p>
            <p className="leading-relaxed">
              Para solicitar a exportação prévia, utilize o mesmo canal de contato da exclusão, especificando que deseja "Exportar meus dados antes da exclusão".
            </p>
          </section>

          {/* Contato DPO */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              9. Dúvidas ou Reclamações
            </h2>
            <p className="mb-4 leading-relaxed">
              Se você tiver dificuldades para exercer seu direito de exclusão ou acreditar que seus dados não foram tratados conforme esta política, entre em contato com nosso Encarregado de Proteção de Dados (DPO):
            </p>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="mb-2"><strong className="text-[#051647]">Canal de Privacidade</strong></p>
              <p className="text-sm mb-1"><strong>E-mail:</strong> privacidade@oticasbrasil.com.br</p>
              <p className="text-sm mb-1"><strong>Assunto do e-mail:</strong> "Solicitação de Exclusão de Dados - LGPD"</p>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Você também tem o direito de apresentar uma reclamação diretamente à Autoridade Nacional de Proteção de Dados (ANPD) caso considere que seus direitos foram violados.
            </p>
          </section>

        </div>

        {/* Footer CTA */}
        <div className="mt-12 rounded-xl bg-gradient-to-r from-[#051647] to-[#002187] p-8 text-center text-white shadow-lg">
          <h3 className="mb-3 text-2xl font-semibold">
            Pronto para solicitar?
          </h3>
          <p className="mb-6 text-slate-200">
            Envie um e-mail para nossa equipe de privacidade e cuidaremos do resto.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="mailto:privacidade@oticasbrasil.com.br?subject=Solicitação de Exclusão de Dados - LGPD"
              className="inline-flex items-center gap-2 rounded-lg bg-[#C4D600] px-6 py-3 font-semibold text-[#051647] shadow-md transition-all hover:bg-[#d4e600] hover:shadow-lg cursor-pointer"
            >
              Enviar E-mail de Solicitação
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </a>
            <Link
              href="/politica-de-privacidade"
              className="inline-flex items-center gap-2 rounded-lg border border-[#C4D600] px-6 py-3 font-semibold text-[#C4D600] transition-all hover:bg-[#C4D600] hover:text-[#051647] cursor-pointer"
            >
              Ler Política de Privacidade
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}