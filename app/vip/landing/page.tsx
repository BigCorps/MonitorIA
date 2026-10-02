import Link from "next/link";
import { ClarityScript } from "@/src/components/analytics/clarity";
import { getVipPlanCatalog } from "@/src/vip/server";
import { vipConfig } from "@/src/vip/config";
import { requestVipContactAction } from "./actions";
import styles from "./vip-landing.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "MonitorIA VIP — Inteligência operacional para grandes sistemas de câmeras",
  description:
    "Monitoramento com IA para operações a partir de 10 câmeras, implantação assistida, Pesquisa IA, projetos multiambiente e piloto real de 60 minutos.",
  alternates: { canonical: vipConfig.url },
  openGraph: {
    title: "MonitorIA VIP",
    description:
      "Transforme grandes sistemas de câmeras em uma operação pesquisável e acompanhada por IA.",
    url: vipConfig.url,
    type: "website",
  },
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function planLabel(code: string) {
  return code.replace("vip", "VIP ");
}

export default async function VipLandingPage({ searchParams }: Props) {
  const [plans, query] = await Promise.all([
    getVipPlanCatalog(),
    searchParams,
  ]);

  const sent = first(query.contato) === "enviado";
  const failed = first(query.contato) === "erro";
  const errorMessage = first(query.mensagem);
  const startedAt = Date.now();

  return (
    <main className={styles.page}>
      <ClarityScript />

      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          Monitor<span>IA</span><b>VIP</b>
        </Link>
        <nav>
          <a href="#como-funciona">Como funciona</a>
          <a href="#projetos">Para quem é</a>
          <a href="#planos">Pacotes</a>
          <a href="#contato">Falar com especialista</a>
        </nav>
        <a
          className={styles.clientLink}
          href="https://monitoria.cam/login?next=%2Fvip%2Fdashboard"
          data-vip-event="client_login"
        >
          Já sou cliente VIP
        </a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>MONITORIA VIP · 10+ CÂMERAS</span>
          <h1>
            Sua operação inteira.
            <em> Pesquisável.</em>
          </h1>
          <p>
            Para empresas, centrais de monitoramento e projetos científicos que
            precisam entender o que aconteceu em dezenas ou centenas de câmeras
            sem depender de alguém assistindo tudo.
          </p>

          <div className={styles.heroActions}>
            <a
              className={styles.primary}
              href="#contato"
              data-vip-event="hero_contact"
            >
              Solicitar avaliação VIP
            </a>
            <a
              className={styles.secondary}
              href="#como-funciona"
              data-vip-event="hero_how_it_works"
            >
              Ver como funciona
            </a>
          </div>

          <div className={styles.heroFacts}>
            <div>
              <strong>60 min</strong>
              <span>de piloto real acompanhado</span>
            </div>
            <div>
              <strong>Até 6</strong>
              <span>câmeras no piloto</span>
            </div>
            <div>
              <strong>Intensive</strong>
              <span>em todas as câmeras VIP</span>
            </div>
          </div>
        </div>

        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.commandCard}>
            <span>OPERAÇÃO · AGORA</span>
            <strong>“O que aconteceu depois do fechamento?”</strong>
            <div className={styles.commandResult}>
              <i />
              <p>
                3 ocorrências relevantes em 2 locais. Uma sequência atravessou
                duas câmeras e 1 item precisa de revisão humana.
              </p>
            </div>
          </div>
          <div className={styles.gridPreview}>
            {["Entrada", "Pátio", "Expedição", "Interna 04"].map((name, index) => (
              <div key={name}>
                <span>CAM {index + 1}</span>
                <strong>{name}</strong>
                <small>{index === 2 ? "atenção" : "operando"}</small>
              </div>
            ))}
          </div>
          <div className={styles.goldLine} />
        </div>
      </section>

      <section className={styles.trustStrip}>
        <span>Não é um “chat em cima da câmera”.</span>
        <strong>
          O MonitorIA estrutura acontecimentos, saúde, continuidade, rotinas e
          processos antes de responder.
        </strong>
      </section>

      <section id="projetos" className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>PARA OPERAÇÕES QUE JÁ PASSARAM DA FASE DE TESTAR UMA CÂMERA</span>
          <h2>Um Projeto VIP organiza escala, contexto e responsabilidade.</h2>
        </div>

        <div className={styles.useCases}>
          <article>
            <b>01</b>
            <h3>Grandes empresas</h3>
            <p>
              Lojas, fábricas, centros logísticos, escritórios e redes com
              múltiplos ambientes que precisam consultar fatos sem varrer horas
              de vídeo.
            </p>
          </article>
          <article>
            <b>02</b>
            <h3>Centrais de monitoramento</h3>
            <p>
              Operações que precisam comparar câmeras, acompanhar continuidade,
              identificar pontos de atenção e transformar vídeo em contexto
              operacional.
            </p>
          </article>
          <article>
            <b>03</b>
            <h3>Projetos científicos</h3>
            <p>
              Estudos que usam câmeras ao vivo ou gravações locais e precisam
              consultar períodos, ambientes, eventos e comportamento observável
              com rastreabilidade.
            </p>
          </article>
        </div>
      </section>

      <section id="como-funciona" className={`${styles.section} ${styles.deep}`}>
        <div className={styles.sectionTitle}>
          <span>IMPLANTAÇÃO ASSISTIDA</span>
          <h2>O relógio do piloto só começa quando tudo estiver pronto.</h2>
          <p>
            O VIP não joga você em um painel vazio. Um especialista acompanha a
            preparação e o teste usa as câmeras da própria operação.
          </p>
        </div>

        <div className={styles.timeline}>
          <article>
            <strong>1</strong>
            <div>
              <span>DIAGNÓSTICO</span>
              <h3>Entendemos o projeto</h3>
              <p>
                Quantidade de câmeras, locais, objetivo, infraestrutura e o que
                realmente precisa ser demonstrado.
              </p>
            </div>
          </article>
          <article>
            <strong>2</strong>
            <div>
              <span>PRONTIDÃO</span>
              <h3>Agent, câmeras e contexto</h3>
              <p>
                Instalação, conexão, perfis e calibração são concluídos antes do
                cronômetro. O progresso fica salvo.
              </p>
            </div>
          </article>
          <article>
            <strong>3</strong>
            <div>
              <span>PILOTO REAL</span>
              <h3>60 minutos · até 6 câmeras</h3>
              <p>
                Todas em modo Intensive, com acontecimentos, Pesquisa IA e
                inteligência entre câmeras disponíveis durante a demonstração.
              </p>
            </div>
          </article>
          <article>
            <strong>4</strong>
            <div>
              <span>PROVA DE VALOR</span>
              <h3>Resultado, proposta e ativação</h3>
              <p>
                O cliente vê o que foi encontrado, escolhe mensal ou anual e o
                mesmo Projeto segue para produção sem refazer a configuração.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.intelligence}>
        <div>
          <span>PESQUISA IA · MOTOR MÁXIMO 2.0</span>
          <h2>Pergunte à operação, não a uma câmera isolada.</h2>
          <p>
            “Quando este veículo apareceu pela primeira vez?”, “qual câmera ficou
            indisponível ontem?”, “houve movimento depois do fechamento?” e
            consultas de continuidade entre ambientes usam o contexto já
            estruturado pelo MonitorIA.
          </p>
        </div>
        <div className={styles.queryList}>
          <span>Saúde histórica das câmeras</span>
          <span>Continuidade entre câmeras</span>
          <span>Rotinas e processos configurados</span>
          <span>Pesquisa por período, local e contexto</span>
          <span>Gravações locais em projetos científicos</span>
        </div>
      </section>

      <section id="planos" className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>PACOTES VIP</span>
          <h2>Capacidade contratada por Projeto, não uma assinatura por câmera.</h2>
          <p>
            Todos os pacotes usam o mesmo nível técnico Intensive. O que muda é
            a escala incluída e o valor por câmera excedente.
          </p>
        </div>

        <div className={styles.plans}>
          {plans.map((plan) => (
            <article key={plan.code}>
              <div className={styles.planTop}>
                <span>{planLabel(plan.code)}</span>
                <strong>{plan.includedCameras} câmeras</strong>
              </div>
              <p>{plan.shortDescription}</p>
              <div className={styles.priceBlock}>
                <span>Mensal</span>
                <strong>{brl(plan.monthlyAmountCents)}</strong>
              </div>
              <div className={styles.priceBlock}>
                <span>Base anual</span>
                <strong>{brl(plan.annualAmountCents)}</strong>
              </div>
              <div className={styles.excess}>
                Excedente: <strong>{brl(plan.excessCameraMonthlyCents)}/mês</strong>
              </div>
              <a href="#contato" data-vip-event={`plan_${plan.code}`}>
                Avaliar este pacote
              </a>
            </article>
          ))}
        </div>

        <p className={styles.pricingNote}>
          No anual, a base é pré-paga. Câmeras excedentes continuam mensais e
          acompanham a quantidade ativa. O especialista confirma o melhor pacote
          antes da proposta; nenhuma troca é feita automaticamente.
        </p>
      </section>

      <section className={`${styles.section} ${styles.boundaries}`}>
        <div className={styles.sectionTitle}>
          <span>EXPECTATIVA CORRETA DESDE O PRIMEIRO CLIQUE</span>
          <h2>O VIP é acompanhado. O teste não começa no cadastro.</h2>
        </div>
        <div className={styles.boundaryGrid}>
          <div>
            <strong>Você não precisa criar conta agora.</strong>
            <p>
              Primeiro avaliamos o projeto. Se fizer sentido, o especialista
              envia um convite individual que conduz pelo acesso e onboarding.
            </p>
          </div>
          <div>
            <strong>Senha não é obrigatória.</strong>
            <p>
              Quem já tem conta deve usar o mesmo método de acesso usado antes:
              Google, senha, passkey ou link por e-mail.
            </p>
          </div>
          <div>
            <strong>O piloto não é um relógio correndo enquanto instala.</strong>
            <p>
              Os 60 minutos começam somente quando as câmeras selecionadas
              estiverem prontas e o cliente confirmar.
            </p>
          </div>
        </div>
      </section>

      <section id="contato" className={styles.contact}>
        <div className={styles.contactCopy}>
          <span>AVALIAÇÃO VIP</span>
          <h2>Conte o tamanho e o objetivo da operação.</h2>
          <p>
            O especialista usa essas informações para avaliar o cenário antes de
            criar o Projeto e o convite. Nenhum teste é iniciado por este formulário.
          </p>
          <ul>
            <li>A partir de 10 câmeras</li>
            <li>Implantação assistida</li>
            <li>Piloto real de 60 minutos</li>
            <li>Sem cartão no piloto</li>
          </ul>
        </div>

        <div className={styles.formShell}>
          {sent ? (
            <div className={styles.formSuccess}>
              <span>INTERESSE REGISTRADO</span>
              <h3>Seu projeto entrou na fila VIP.</h3>
              <p>
                O especialista receberá o contexto que você informou e poderá
                preparar a próxima etapa sem pedir tudo novamente.
              </p>
              <a href="/">Voltar ao início</a>
            </div>
          ) : (
            <form action={requestVipContactAction} className={styles.form}>
              {failed ? (
                <div className={styles.formError}>
                  {errorMessage ?? "Revise os dados e tente novamente."}
                </div>
              ) : null}

              <input
                className={styles.honeypot}
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
              <input type="hidden" name="started_at" value={String(startedAt)} />
              <input type="hidden" name="utm_source" value={first(query.utm_source) ?? ""} />
              <input type="hidden" name="utm_medium" value={first(query.utm_medium) ?? ""} />
              <input type="hidden" name="utm_campaign" value={first(query.utm_campaign) ?? ""} />
              <input type="hidden" name="utm_content" value={first(query.utm_content) ?? ""} />
              <input type="hidden" name="referrer" value={first(query.ref) ?? ""} />

              <div className={styles.formGrid}>
                <label>
                  <span>Seu nome</span>
                  <input name="lead_name" type="text" minLength={2} maxLength={120} required />
                </label>
                <label>
                  <span>Empresa / projeto</span>
                  <input name="company_name" type="text" minLength={2} maxLength={160} required />
                </label>
                <label>
                  <span>E-mail profissional</span>
                  <input name="lead_email" type="email" autoComplete="email" required />
                </label>
                <label>
                  <span>WhatsApp / telefone</span>
                  <input name="phone" type="tel" autoComplete="tel" minLength={8} maxLength={40} required />
                </label>
                <label>
                  <span>Tipo de projeto</span>
                  <select name="project_kind" defaultValue="enterprise">
                    <option value="enterprise">Grande empresa</option>
                    <option value="large_monitoring">Central / operação de monitoramento</option>
                    <option value="scientific">Projeto científico</option>
                    <option value="other">Outro projeto especial</option>
                  </select>
                </label>
                <label>
                  <span>Quantidade aproximada de câmeras</span>
                  <input
                    name="expected_camera_count"
                    type="number"
                    min={10}
                    max={100000}
                    defaultValue={10}
                    required
                  />
                </label>
              </div>

              <label>
                <span>O que você precisa enxergar ou investigar melhor?</span>
                <textarea
                  name="objective"
                  rows={5}
                  maxLength={2000}
                  placeholder="Ex.: acompanhar 4 unidades, pesquisar ocorrências entre câmeras e reduzir tempo de revisão manual."
                />
              </label>

              <button type="submit" data-vip-event="lead_submit">
                Solicitar avaliação do especialista
              </button>
              <small>
                Ao enviar, você não cria conta nem inicia cobrança. Seus dados são
                usados para avaliar e conduzir o Projeto VIP.
              </small>
            </form>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <Link className={styles.brand} href="/">
            Monitor<span>IA</span><b>VIP</b>
          </Link>
          <p>Desenvolvido por BigCorps · Tecnologia MonitorIA.</p>
        </div>
        <nav>
          <a href="https://monitoria.cam/privacidade">Privacidade</a>
          <a href="https://monitoria.cam/termos">Termos</a>
          <a href="https://monitoria.cam/seguranca-e-privacidade">Segurança</a>
        </nav>
      </footer>

      <a
        href="#contato"
        className={styles.mobileCta}
        data-vip-event="mobile_sticky_contact"
      >
        Falar com especialista
      </a>
    </main>
  );
}
