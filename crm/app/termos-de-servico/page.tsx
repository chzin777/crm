import Link from 'next/link';

export const metadata = {
  title: 'Termos de Serviço | CRM Óticas Brasil',
  description: 'Termos de Serviço do CRM Óticas Brasil - conheça as regras de uso da plataforma.',
};

export default function TermosDeServicoPage() {
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
            Termos de Serviço
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
              1. Aceitação dos Termos
            </h2>
            <p className="leading-relaxed">
              Bem-vindo ao CRM Óticas Brasil. Ao acessar ou utilizar nossa plataforma ("Serviço"), você concorda em cumprir e estar vinculado a estes Termos de Serviço ("Termos"). Se você não concordar com qualquer parte destes Termos, não poderá utilizar o Serviço.
            </p>
            <p className="mt-4 leading-relaxed">
              Estes Termos constituem um acordo legal entre você ("Usuário", "você") e o CRM Óticas Brasil ("nós", "nosso", "a plataforma"). Recomendamos que você leia atentamente todas as disposições antes de utilizar nossos serviços.
            </p>
          </section>

          {/* Descrição do Serviço */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              2. Descrição do Serviço
            </h2>
            <p className="mb-4 leading-relaxed">
              O CRM Óticas Brasil é uma plataforma de gestão de relacionamento com clientes (CRM) desenvolvida especificamente para o setor ótico, oferecendo funcionalidades como:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Gestão de contatos e clientes.</li>
              <li>Pipelines de vendas e oportunidades.</li>
              <li>Segmentação de audiência e campanhas de marketing.</li>
              <li>Integração com WhatsApp Business API para comunicação.</li>
              <li>Relatórios, dashboards e métricas de desempenho.</li>
              <li>Gestão de lojas, NPS e feedback de clientes.</li>
            </ul>
            <p className="mt-4 leading-relaxed">
              Reservamo-nos o direito de modificar, suspender ou descontinuar qualquer aspecto do Serviço a qualquer momento, incluindo disponibilidade, recursos e preços, mediante aviso prévio quando aplicável.
            </p>
          </section>

          {/* Contas de Usuário */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              3. Contas de Usuário
            </h2>
            <h3 className="mb-3 text-lg font-medium text-[#002187]">
              3.1 Registro
            </h3>
            <p className="mb-4 leading-relaxed">
              Para utilizar determinadas funcionalidades do Serviço, pode ser necessário criar uma conta. Você concorda em fornecer informações precisas, completas e atualizadas durante o processo de registro.
            </p>
            <h3 className="mb-3 text-lg font-medium text-[#002187]">
              3.2 Segurança da Conta
            </h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>Você é responsável por manter a confidencialidade de suas credenciais de acesso.</li>
              <li>Você é responsável por todas as atividades que ocorram sob sua conta.</li>
              <li>Você deve nos notificar imediatamente sobre qualquer uso não autorizado ou violação de segurança.</li>
              <li>Não nos responsabilizamos por perdas decorrentes do uso não autorizado da sua conta.</li>
            </ul>
            <h3 className="mb-3 mt-4 text-lg font-medium text-[#002187]">
              3.3 Elegibilidade
            </h3>
            <p className="leading-relaxed">
              Você declara ter pelo menos 18 anos de idade ou possuir consentimento legal de um responsável para utilizar o Serviço. Empresas e organizações devem ser representadas por pessoa autorizada a aceitar estes Termos em seu nome.
            </p>
          </section>

          {/* Uso Aceitável */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              4. Uso Aceitável
            </h2>
            <p className="mb-4 leading-relaxed">
              Você concorda em utilizar o Serviço apenas para fins lícitos e de acordo com estes Termos. É expressamente proibido:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Violar qualquer lei ou regulamento aplicável.</li>
              <li>Infringir direitos de propriedade intelectual de terceiros.</li>
              <li>Transmitir material difamatório, obsceno, ofensivo ou ilegal.</li>
              <li>Enviar spam, mensagens não solicitadas ou conteúdo promocional não autorizado.</li>
              <li>Tentar obter acesso não autorizado a sistemas, redes ou contas de outros usuários.</li>
              <li>Interferir no funcionamento do Serviço ou sobrecarregar sua infraestrutura.</li>
              <li>Utilizar robôs, scrapers ou meios automatizados para acessar o Serviço sem autorização.</li>
              <li>Fazer engenharia reversa, descompilar ou tentar extrair o código-fonte do Serviço.</li>
              <li>Utilizar o Serviço para fins de mineração de dados, benchmarking competitivo não autorizado ou construção de produto concorrente.</li>
            </ul>
          </section>

          {/* Conteúdo do Usuário */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              5. Conteúdo do Usuário
            </h2>
            <h3 className="mb-3 text-lg font-medium text-[#002187]">
              5.1 Propriedade
            </h3>
            <p className="mb-4 leading-relaxed">
              Você mantém todos os direitos de propriedade sobre o conteúdo que carrega, publica ou armazena no Serviço ("Conteúdo do Usuário"), incluindo dados de clientes, contatos, oportunidades e comunicações.
            </p>
            <h3 className="mb-3 text-lg font-medium text-[#002187]">
              5.2 Licença
            </h3>
            <p className="mb-4 leading-relaxed">
              Ao utilizar o Serviço, você nos concede uma licença limitada, não exclusiva e revogável para hospedar, armazenar, processar e exibir seu Conteúdo do Usuário exclusivamente para fins de operação e fornecimento do Serviço.
            </p>
            <h3 className="mb-3 text-lg font-medium text-[#002187]">
              5.3 Responsabilidade
            </h3>
            <p className="leading-relaxed">
              Você é o único responsável pelo Conteúdo do Usuário e garante que possui todos os direitos e consentimentos necessários para utilizá-lo no Serviço, incluindo conformidade com a LGPD para dados pessoais de terceiros.
            </p>
          </section>

          {/* Propriedade Intelectual */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              6. Propriedade Intelectual
            </h2>
            <p className="mb-4 leading-relaxed">
              O Serviço, incluindo seu design, logotipos, textos, gráficos, código-fonte e demais elementos, é protegido por leis de propriedade intelectual e pertence ao CRM Óticas Brasil ou a seus licenciadores.
            </p>
            <p className="leading-relaxed">
              Nenhuma disposição destes Termos concede a você qualquer direito de usar marcas, logotipos ou conteúdo protegido do CRM Óticas Brasil sem autorização prévia e por escrito.
            </p>
          </section>

          {/* Planos e Pagamentos */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              7. Planos, Assinaturas e Pagamentos
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Cobrança:</strong> determinados recursos podem exigir assinatura paga. Os valores serão informados previamente na plataforma.</li>
              <li><strong>Renovação:</strong> assinaturas são renovadas automaticamente ao final de cada período, salvo cancelamento antecipado.</li>
              <li><strong>Reajustes:</strong> podemos alterar preços mediante aviso prévio de pelo menos 30 dias.</li>
              <li><strong>Impostos:</strong> os valores não incluem impostos, taxas ou encargos aplicáveis, que são de responsabilidade do usuário.</li>
              <li><strong>Inadimplência:</strong> o não pagamento pode resultar em suspensão ou encerramento do acesso ao Serviço.</li>
              <li><strong>Reembolsos:</strong> políticas de reembolso, quando aplicáveis, serão comunicadas no momento da contratação.</li>
            </ul>
          </section>

          {/* Integrações de Terceiros */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              8. Integrações com Serviços de Terceiros
            </h2>
            <p className="mb-4 leading-relaxed">
              O Serviço pode se integrar a plataformas de terceiros, como WhatsApp Business API, Meta Platforms, provedores de e-mail e outros. Ao utilizar essas integrações, você também estará sujeito aos termos de serviço e políticas de privacidade desses terceiros.
            </p>
            <p className="leading-relaxed">
              Não nos responsabilizamos pelo funcionamento, disponibilidade, conteúdo ou práticas de privacidade de serviços de terceiros. Qualquer problema relacionado a essas integrações deve ser tratado diretamente com o respectivo provedor.
            </p>
          </section>

          {/* Disponibilidade e SLA */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              9. Disponibilidade do Serviço
            </h2>
            <p className="mb-4 leading-relaxed">
              Empregamos esforços comercialmente razoáveis para manter o Serviço disponível, mas não garantimos acesso ininterrupto ou livre de erros. O Serviço pode ficar indisponível temporariamente devido a:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>Manutenções programadas, comunicadas previamente sempre que possível.</li>
              <li>Falhas técnicas, ataques cibernéticos ou eventos fora do nosso controle.</li>
              <li>Problemas em serviços de terceiros dos quais dependemos (cloud, APIs, etc.).</li>
            </ul>
          </section>

          {/* Limitação de Responsabilidade */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              10. Limitação de Responsabilidade
            </h2>
            <p className="mb-4 leading-relaxed">
              Na máxima extensão permitida pela lei aplicável, o CRM Óticas Brasil não será responsável por quaisquer danos indiretos, incidentais, especiais, consequenciais ou punitivos, incluindo lucros cessantes, perda de dados ou interrupção de negócios, decorrentes do uso ou da impossibilidade de uso do Serviço.
            </p>
            <p className="leading-relaxed">
              Nossa responsabilidade total, por qualquer reclamação relacionada a estes Termos, limita-se ao valor pago por você nos 12 meses anteriores ao evento que deu origem à reclamação, ou R$ 100,00, o que for maior.
            </p>
          </section>

          {/* Indenização */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              11. Indenização
            </h2>
            <p className="leading-relaxed">
              Você concorda em indenizar, defender e isentar o CRM Óticas Brasil, seus diretores, funcionários e parceiros de qualquer reclamação, dano, perda, custo ou despesa (incluindo honorários advocatícios) decorrente do seu uso do Serviço, violação destes Termos ou infração de direitos de terceiros.
            </p>
          </section>

          {/* Suspensão e Encerramento */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              12. Suspensão e Encerramento
            </h2>
            <p className="mb-4 leading-relaxed">
              Podemos suspender ou encerrar seu acesso ao Serviço, total ou parcialmente, a qualquer momento e sem aviso prévio, caso:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>Você viole estes Termos ou a legislação aplicável.</li>
              <li>Haja suspeita de fraude, abuso ou atividade ilícita.</li>
              <li>Ocorra inadimplência no pagamento de assinaturas.</li>
              <li>Seja necessário por razões técnicas, operacionais ou legais.</li>
            </ul>
            <p className="mt-4 leading-relaxed">
              Você pode encerrar sua conta a qualquer momento através das configurações da plataforma. Após o encerramento, seu acesso será interrompido e seus dados serão tratados conforme nossa Política de Privacidade.
            </p>
          </section>

          {/* Alterações dos Termos */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              13. Alterações destes Termos
            </h2>
            <p className="leading-relaxed">
              Podemos revisar estes Termos periodicamente. A versão mais recente estará sempre disponível nesta página, com a data de atualização indicada no topo. Alterações materiais serão comunicadas com antecedência razoável por e-mail ou aviso na plataforma.
            </p>
            <p className="mt-4 leading-relaxed">
              O uso continuado do Serviço após a publicação das alterações constitui aceitação dos novos Termos. Caso não concorde, você deverá encerrar sua conta antes da entrada em vigor das mudanças.
            </p>
          </section>

          {/* Lei Aplicável e Foro */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              14. Lei Aplicável e Foro
            </h2>
            <p className="leading-relaxed">
              Estes Termos são regidos e interpretados de acordo com as leis da República Federativa do Brasil, sem considerar conflitos de princípios legais.
            </p>
            <p className="mt-4 leading-relaxed">
              Fica eleito o foro da comarca de São Paulo/SP para dirimir quaisquer controvérsias oriundas destes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja, salvo quando a legislação consumerista determinar foro diverso.
            </p>
          </section>

          {/* Disposições Gerais */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              15. Disposições Gerais
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Acordo integral:</strong> estes Termos, juntamente com nossa Política de Privacidade, constituem o acordo integral entre você e o CRM Óticas Brasil.</li>
              <li><strong>Divisibilidade:</strong> se qualquer disposição for considerada inválida, as demais permanecerão em pleno vigor.</li>
              <li><strong>Renúncia:</strong> a falta de exercício de qualquer direito não constitui renúncia a esse direito.</li>
              <li><strong>Cessão:</strong> você não pode ceder estes Termos sem nosso consentimento prévio. Podemos ceder livremente em caso de fusão, aquisição ou reorganização.</li>
              <li><strong>Sobrevivência:</strong> as disposições que, por sua natureza, devam sobreviver ao encerramento continuarão válidas.</li>
            </ul>
          </section>

          {/* Contato */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              16. Contato
            </h2>
            <p className="mb-4 leading-relaxed">
              Se você tiver dúvidas, preocupações ou solicitações relacionadas a estes Termos de Serviço, entre em contato conosco:
            </p>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="mb-2">
                <strong className="text-[#051647]">CRM Óticas Brasil</strong>
              </p>
              <p className="mb-1 text-sm">
                <strong>E-mail:</strong> contato@oticasbrasil.com.br
              </p>
              <p className="mb-1 text-sm">
                <strong>Suporte:</strong> suporte@oticasbrasil.com.br
              </p>
              <p className="text-sm">
                <strong>Endereço:</strong> [Endereço da empresa]
              </p>
            </div>
          </section>
        </div>

        {/* Footer CTA */}
        <div className="mt-12 rounded-xl bg-gradient-to-r from-[#051647] to-[#002187] p-8 text-center text-white shadow-lg">
          <h3 className="mb-3 text-2xl font-semibold">
            Dúvidas sobre os Termos?
          </h3>
          <p className="mb-6 text-slate-200">
            Nossa equipe está pronta para esclarecer qualquer questão sobre o uso da plataforma.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/politica-de-privacidade"
              className="inline-flex items-center gap-2 rounded-lg border border-[#C4D600] px-6 py-3 font-semibold text-[#C4D600] transition-all hover:bg-[#C4D600] hover:text-[#051647] cursor-pointer"
            >
              Política de Privacidade
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-[#C4D600] px-6 py-3 font-semibold text-[#051647] shadow-md transition-all hover:bg-[#d4e600] hover:shadow-lg cursor-pointer"
            >
              Voltar ao CRM
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}