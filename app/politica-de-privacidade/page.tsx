import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidade | CRM Óticas Brasil',
  description: 'Política de Privacidade do CRM Óticas Brasil - saiba como coletamos, usamos e protegemos seus dados.',
};

export default function PoliticaDePrivacidadePage() {
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
            Política de Privacidade
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
              1. Introdução
            </h2>
            <p className="leading-relaxed">
              O CRM Óticas Brasil ("nós", "nosso" ou "a plataforma") está comprometido com a proteção da sua privacidade. Esta Política de Privacidade explica como coletamos, usamos, armazenamos e protegemos suas informações pessoais quando você utiliza nossa plataforma de gestão de relacionamento com clientes (CRM).
            </p>
            <p className="mt-4 leading-relaxed">
              Ao acessar e utilizar o CRM Óticas Brasil, você concorda com os termos desta Política de Privacidade. Se você não concordar com estes termos, por favor, não utilize nossos serviços.
            </p>
          </section>

          {/* Informações Coletadas */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              2. Informações que Coletamos
            </h2>

            <h3 className="mb-3 text-lg font-medium text-[#002187]">
              2.1 Informações Fornecidas por Você
            </h3>
            <ul className="mb-4 list-disc space-y-2 pl-6">
              <li><strong>Dados de conta:</strong> nome, endereço de e-mail, senha e informações de perfil.</li>
              <li><strong>Dados de contato:</strong> informações de clientes gerenciados no CRM, incluindo nomes, telefones, e-mails e endereços.</li>
              <li><strong>Dados de negócios:</strong> informações sobre oportunidades de venda, pipelines, segmentos e campanhas de marketing.</li>
              <li><strong>Comunicações:</strong> mensagens trocadas através da plataforma, incluindo integrações com WhatsApp.</li>
            </ul>

            <h3 className="mb-3 text-lg font-medium text-[#002187]">
              2.2 Informações Coletadas Automaticamente
            </h3>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Dados de uso:</strong> páginas visitadas, recursos utilizados, tempo gasto na plataforma e ações realizadas.</li>
              <li><strong>Dados técnicos:</strong> endereço IP, tipo de navegador, sistema operacional, identificadores de dispositivo e cookies.</li>
              <li><strong>Logs de atividade:</strong> registros de login, alterações de dados e interações com o sistema.</li>
            </ul>
          </section>

          {/* Como Usamos */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              3. Como Usamos Suas Informações
            </h2>
            <p className="mb-4 leading-relaxed">
              Utilizamos as informações coletadas para os seguintes fins:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Fornecimento do serviço:</strong> operar, manter e melhorar a plataforma CRM.</li>
              <li><strong>Personalização:</strong> adaptar a experiência do usuário às suas necessidades e preferências.</li>
              <li><strong>Comunicação:</strong> enviar notificações importantes, atualizações de segurança e informações sobre novos recursos.</li>
              <li><strong>Análise e melhoria:</strong> entender como a plataforma é utilizada para otimizar funcionalidades e desempenho.</li>
              <li><strong>Segurança:</strong> detectar, prevenir e responder a fraudes, abusos e ameaças à segurança.</li>
              <li><strong>Conformidade legal:</strong> cumprir obrigações legais e regulatórias aplicáveis.</li>
            </ul>
          </section>

          {/* Compartilhamento */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              4. Compartilhamento de Informações
            </h2>
            <p className="mb-4 leading-relaxed">
              Não vendemos, alugamos ou comercializamos suas informações pessoais com terceiros. Podemos compartilhar informações nas seguintes circunstâncias:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Prestadores de serviço:</strong> com empresas que nos auxiliam na operação da plataforma (hospedagem, processamento de pagamentos, análises), sob contratos de confidencialidade.</li>
              <li><strong>Integrações de terceiros:</strong> com serviços que você escolher integrar ao CRM (ex: WhatsApp Business API, Meta Platforms).</li>
              <li><strong>Obrigações legais:</strong> quando exigido por lei, ordem judicial ou processo legal.</li>
              <li><strong>Proteção de direitos:</strong> para proteger nossos direitos, propriedade ou segurança, ou de nossos usuários.</li>
              <li><strong>Transferências empresariais:</strong> em caso de fusão, aquisição ou venda de ativos, suas informações podem ser transferidas como parte do negócio.</li>
            </ul>
          </section>

          {/* Armazenamento e Segurança */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              5. Armazenamento e Segurança dos Dados
            </h2>

            <h3 className="mb-3 text-lg font-medium text-[#002187]">
              5.1 Armazenamento
            </h3>
            <p className="mb-4 leading-relaxed">
              Seus dados são armazenados em servidores seguros localizados em infraestrutura cloud protegida. Mantemos suas informações pelo tempo necessário para fornecer nossos serviços e cumprir obrigações legais.
            </p>

            <h3 className="mb-3 text-lg font-medium text-[#002187]">
              5.2 Medidas de Segurança
            </h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>Criptografia de dados em trânsito (TLS/SSL) e em repouso.</li>
              <li>Controles de acesso baseados em funções e autenticação segura.</li>
              <li>Monitoramento contínuo de atividades suspeitas.</li>
              <li>Backups regulares e procedimentos de recuperação de desastres.</li>
              <li>Auditorias de segurança periódicas e testes de vulnerabilidade.</li>
            </ul>
            <p className="mt-4 leading-relaxed text-sm text-slate-600">
              <strong>Importante:</strong> Embora implementemos medidas robustas de segurança, nenhum método de transmissão ou armazenamento eletrônico é 100% seguro. Não podemos garantir segurança absoluta.
            </p>
          </section>

          {/* Seus Direitos */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              6. Seus Direitos (LGPD)
            </h2>
            <p className="mb-4 leading-relaxed">
              De acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem os seguintes direitos em relação aos seus dados pessoais:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Confirmação e acesso:</strong> confirmar se tratamos seus dados e solicitar acesso a eles.</li>
              <li><strong>Correção:</strong> solicitar a correção de dados incompletos, inexatos ou desatualizados.</li>
              <li><strong>Eliminação:</strong> solicitar a exclusão de dados tratados com seu consentimento, exceto quando houver base legal para manutenção.</li>
              <li><strong>Portabilidade:</strong> solicitar a transferência de seus dados a outro fornecedor de serviço.</li>
              <li><strong>Revogação do consentimento:</strong> revogar o consentimento a qualquer momento, sem afetar a licitude do tratamento anterior.</li>
              <li><strong>Informação:</strong> obter informações sobre entidades públicas e privadas com as quais compartilhamos dados.</li>
              <li><strong>Oposição:</strong> opor-se ao tratamento de dados em caso de descumprimento da LGPD.</li>
            </ul>
            <p className="mt-4 leading-relaxed">
              Para exercer qualquer desses direitos, entre em contato conosco através do e-mail indicado na seção "Contato".
            </p>
          </section>

          {/* Cookies */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              7. Cookies e Tecnologias Similares
            </h2>
            <p className="mb-4 leading-relaxed">
              Utilizamos cookies e tecnologias similares para melhorar sua experiência na plataforma. Os cookies são pequenos arquivos de texto armazenados no seu dispositivo.
            </p>

            <h3 className="mb-3 text-lg font-medium text-[#002187]">
              Tipos de Cookies Utilizados
            </h3>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Cookies essenciais:</strong> necessários para o funcionamento básico da plataforma (autenticação, segurança).</li>
              <li><strong>Cookies de preferência:</strong> lembram suas configurações e preferências.</li>
              <li><strong>Cookies analíticos:</strong> nos ajudam a entender como você utiliza a plataforma para melhorá-la.</li>
            </ul>
            <p className="mt-4 leading-relaxed">
              Você pode gerenciar suas preferências de cookies através das configurações do seu navegador. Note que desabilitar cookies essenciais pode afetar o funcionamento da plataforma.
            </p>
          </section>

          {/* Retenção de Dados */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              8. Retenção de Dados
            </h2>
            <p className="leading-relaxed">
              Mantemos suas informações pessoais pelo tempo necessário para:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>Fornecer nossos serviços e manter sua conta ativa.</li>
              <li>Cumprir obrigações legais e regulatórias.</li>
              <li>Resolver disputas e fazer cumprir nossos termos.</li>
              <li>Fins legítimos de negócios, como análise e melhoria de serviços.</li>
            </ul>
            <p className="mt-4 leading-relaxed">
              Quando seus dados não forem mais necessários, serão excluídos ou anonimizados de forma segura.
            </p>
          </section>

          {/* Transferência Internacional */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              9. Transferência Internacional de Dados
            </h2>
            <p className="leading-relaxed">
              Seus dados podem ser processados e armazenados em servidores localizados fora do Brasil. Quando isso ocorrer, garantimos que:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>Os países destinatários proporcionem grau de proteção de dados adequado conforme a LGPD.</li>
              <li>Medidas contratuais e técnicas apropriadas sejam implementadas para proteger seus dados.</li>
              <li>Cláusulas contratuais padrão ou mecanismos equivalentes sejam utilizados quando necessário.</li>
            </ul>
          </section>

          {/* Alterações */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              10. Alterações nesta Política
            </h2>
            <p className="leading-relaxed">
              Podemos atualizar esta Política de Privacidade periodicamente para refletir mudanças em nossas práticas ou por razões operacionais, legais ou regulatórias. A versão mais recente estará sempre disponível nesta página, com a data de atualização indicada no topo.
            </p>
            <p className="mt-4 leading-relaxed">
              Recomendamos que você revise esta política regularmente. O uso continuado da plataforma após alterações constitui aceitação da nova versão.
            </p>
          </section>

          {/* Contato */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              11. Contato
            </h2>
            <p className="mb-4 leading-relaxed">
              Se você tiver dúvidas, preocupações ou solicitações relacionadas a esta Política de Privacidade ou ao tratamento de seus dados pessoais, entre em contato conosco:
            </p>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="mb-2">
                <strong className="text-[#051647]">CRM Óticas Brasil</strong>
              </p>
              <p className="mb-1 text-sm">
                <strong>E-mail:</strong> privacidade@oticasbrasil.com.br
              </p>
              <p className="text-sm">
                <strong>Endereço:</strong> [Endereço da empresa]
              </p>
            </div>
            <p className="mt-4 leading-relaxed text-sm text-slate-600">
              Nosso Encarregado de Proteção de Dados (DPO) responderá sua solicitação no prazo máximo de 15 dias, conforme estabelecido pela LGPD.
            </p>
          </section>

          {/* Disposições Finais */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-[#051647]">
              12. Disposições Finais
            </h2>
            <p className="leading-relaxed">
              Esta Política de Privacidade é regida pelas leis da República Federativa do Brasil. Qualquer disputa relacionada a esta política será submetida à jurisdição dos tribunais brasileiros competentes.
            </p>
            <p className="mt-4 leading-relaxed">
              Se qualquer disposição desta política for considerada inválida ou inexequível, as demais disposições permanecerão em pleno vigor e efeito.
            </p>
          </section>
        </div>

        {/* Footer CTA */}
        <div className="mt-12 rounded-xl bg-gradient-to-r from-[#051647] to-[#002187] p-8 text-center text-white shadow-lg">
          <h3 className="mb-3 text-2xl font-semibold">
            Tem dúvidas sobre sua privacidade?
          </h3>
          <p className="mb-6 text-slate-200">
            Nossa equipe está pronta para ajudar você a entender como protegemos seus dados.
          </p>
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
      </main>
    </div>
  );
}