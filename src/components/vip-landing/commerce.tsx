import type { VipPlanCatalogEntry } from "@/src/vip/types";
import {
  vipAssistantExamples,
  vipAssistantIncludes,
  vipBoundaries,
  vipFaq,
  vipPlanPositioning,
  vipTrialFacts,
} from "@/src/lib/vip-landing-content";
import { requestVipContactAction } from "@/app/vip/landing/actions";
import styles from "@/src/components/landing/landing.module.css";
import vip from "@/app/vip/landing/vip-landing.module.css";

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

export function VipAssistant() {
  return (
    <section
      className={`${styles.section} ${styles.sectionDeep} ${vip.vipSection}`}
    >
      <div
        className={`${styles.container} ${styles.assistant} ${styles.reveal} ${styles.recede}`}
      >
        <div>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Pesquisa IA</span>
          </p>
          <h2 className={styles.h2}>
            Pergunte à operação inteira com as suas palavras.
          </h2>
          <p className={styles.lede}>
            Em vez de escolher uma câmera e começar a procurar, comece pela
            dúvida. O MonitorIA cruza o contexto estruturado do Projeto e
            devolve horários, resumo e evidências para você continuar a
            investigação.
          </p>

          <div className={`${styles.includes} ${vip.includes}`}>
            <p className={styles.tableCaption}>Perguntas de uma operação VIP</p>
            <ul className={`${styles.includesList} ${vip.includesList}`}>
              {vipAssistantExamples.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <div className={`${styles.quotaCard} ${vip.assistantCard}`}>
            <p className={vip.assistantKicker}>MOTOR MÁXIMO 2.0</p>
            <p className={vip.assistantHeadline}>O Projeto inteiro</p>
            <p className={styles.quotaCaption}>
              A Pesquisa IA trabalha com o contexto de câmeras, locais,
              acontecimentos e saúde operacional — não com uma conversa
              isolada em cima de um vídeo.
            </p>
            <p className={styles.scaleNote}>
              O caminho determinístico resolve o que já está estruturado e o
              modelo de IA entra somente quando realmente agrega interpretação.
            </p>
          </div>

          <div className={`${styles.includes} ${vip.includes}`}>
            <p className={styles.tableCaption}>O que entra na consulta</p>
            <ul className={`${styles.includesList} ${vip.includesList}`}>
              {vipAssistantIncludes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function VipPlans({
  plans,
}: {
  plans: VipPlanCatalogEntry[];
}) {
  return (
    <section
      className={`${styles.section} ${vip.vipSection}`}
      id="planos"
    >
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Pacotes VIP</span>
          </p>
          <h2 className={styles.h2}>
            Um contrato por Projeto. Capacidade para crescer sem transformar
            cada câmera em uma assinatura separada.
          </h2>
          <p className={styles.lede}>
            Todas as câmeras VIP trabalham no nível técnico Intensive. O pacote
            define a capacidade incluída e o valor de cada câmera excedente.
          </p>
        </div>

        <div className={`${styles.planGrid} ${styles.stagger}`}>
          {plans.map((plan) => {
            const positioning = vipPlanPositioning[plan.code];

            return (
              <article
                className={`${styles.planCard} ${vip.planCard} ${
                  plan.code === "vip50" ? vip.featuredPlan : ""
                }`}
                key={plan.code}
              >
                <span className={`${styles.planCode} ${vip.planCode}`}>
                  {positioning.badge}
                </span>
                <h3 className={styles.planName}>
                  {plan.displayName.replace("MonitorIA ", "")}
                </h3>

                <p className={styles.planPrice}>
                  <b className={`${styles.mono} ${vip.goldText}`}>
                    {brl(plan.monthlyAmountCents)}
                  </b>
                  <span>/ mês</span>
                </p>

                <p className={styles.planSummary}>
                  {positioning.summary}
                </p>

                <ul className={styles.planSpecs}>
                  <li>
                    {positioning.idealFor}
                    <span>Todas em modo Intensive</span>
                  </li>
                  <li>
                    {brl(plan.annualAmountCents)} no anual
                    <span>Base anual pré-paga</span>
                  </li>
                  <li>
                    {brl(plan.excessCameraMonthlyCents)} por excedente
                    <span>Valor mensal por câmera acima do pacote</span>
                  </li>
                </ul>

                <a
                  className={`${styles.btn} ${vip.planButton}`}
                  href="#contato"
                  data-vip-event={`plan_${plan.code}`}
                >
                  Avaliar este pacote
                </a>
              </article>
            );
          })}
        </div>

        <div className={`${styles.includes} ${styles.reveal} ${vip.includes}`}>
          <p className={styles.tableCaption}>Incluído no MonitorIA VIP</p>
          <ul className={`${styles.includesList} ${vip.includesList}`}>
            <li>Pesquisa IA com contexto do Projeto</li>
            <li>Inteligência entre câmeras</li>
            <li>Saúde histórica das câmeras</li>
            <li>Rotinas e processos configurados</li>
            <li>Gravações locais em projetos científicos</li>
            <li>Implantação acompanhada</li>
            <li>Vários locais e vários usuários</li>
            <li>Laboratório VIP de recursos avançados</li>
          </ul>
        </div>

        <p className={`${styles.scaleNote} ${vip.planNote}`}>
          O especialista compara o tamanho da operação com os pacotes antes da
          proposta. O sistema pode sugerir uma faixa mais econômica, mas nunca
          troca seu pacote silenciosamente.
        </p>
      </div>
    </section>
  );
}

export function VipTrial() {
  return (
    <section
      className={`${styles.section} ${styles.sectionDeep} ${vip.vipSection}`}
    >
      <div className={`${styles.container} ${styles.recede}`}>
        <div
          className={`${styles.trial} ${styles.reveal} ${vip.trial}`}
        >
          <div>
            <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
              <span className={styles.eyebrowTime}>00:00</span>
              <span>Piloto acompanhado</span>
            </p>
            <h2 className={styles.h2}>
              Veja o MonitorIA VIP trabalhando na sua própria operação antes
              de decidir.
            </h2>
            <p className={styles.lede}>
              O especialista prepara o Projeto, conecta e valida as câmeras e
              só então libera o início. Assim os 60 minutos medem análise real,
              não tempo gasto configurando.
            </p>
          </div>

          <div className={`${styles.trialFacts} ${styles.stagger}`}>
            {vipTrialFacts.map((fact) => (
              <div
                className={`${styles.trialFact} ${vip.trialFact}`}
                key={fact.label}
              >
                <b className={`${styles.mono} ${vip.goldText}`}>
                  {fact.value}
                </b>
                <span>{fact.label}</span>
              </div>
            ))}
          </div>

          <div>
            <div className={styles.actions}>
              <a
                className={`${styles.btn} ${vip.goldButton}`}
                href="#contato"
                data-vip-event="trial_contact"
              >
                Solicitar avaliação VIP
              </a>
            </div>
            <p className={styles.trialNote}>
              O formulário não cria conta e não inicia relógio. Primeiro o
              especialista valida se o cenário faz sentido para o VIP.
            </p>
          </div>
        </div>

        <div className={`${styles.includes} ${styles.reveal} ${vip.includes}`}>
          <p className={styles.tableCaption}>Sem surpresas</p>
          <div className={`${styles.boundaryGrid} ${styles.stagger}`}>
            {vipBoundaries.map((item) => (
              <p className={`${styles.boundaryItem} ${vip.boundaryItem}`} key={item}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14" strokeLinecap="round" />
                </svg>
                {item}
              </p>
            ))}
          </div>
          <p className={styles.scaleNote}>
            Você não precisa criar conta agora. A conta e o onboarding só
            aparecem depois que o Projeto foi avaliado e o convite individual
            foi enviado.
          </p>
        </div>
      </div>
    </section>
  );
}

export function VipFaq() {
  return (
    <section
      className={`${styles.section} ${vip.vipSection}`}
      id="duvidas"
    >
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Dúvidas</span>
          </p>
          <h2 className={styles.h2}>
            O que uma operação maior precisa saber antes de avançar.
          </h2>
        </div>

        <div className={`${styles.faqList} ${styles.stagger}`}>
          {vipFaq.map((item) => (
            <details
              className={`${styles.faqItem} ${vip.faqItem}`}
              key={item.q}
            >
              <summary>{item.q}</summary>
              <p className={styles.faqAnswer}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function VipClosing({
  query,
}: {
  query: Record<string, string | string[] | undefined>;
}) {
  const sent = first(query.contato) === "enviado";
  const failed = first(query.contato) === "erro";
  const errorMessage = first(query.mensagem);
  const startedAt = Date.now();

  return (
    <section
      className={`${styles.closingWrap} ${vip.closingWrap}`}
      id="contato"
    >
      <div className={`${styles.container} ${vip.contactGrid}`}>
        <div className={vip.contactCopy}>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>VIP</span>
            <span>Próximo passo</span>
          </p>

          <h2 className={styles.h2}>
            Suas câmeras já veem a operação. Faça a informação trabalhar por
            você.
          </h2>

          <p className={styles.lede}>
            Conte quantas câmeras existem e o que você precisa enxergar melhor.
            O especialista usa esse contexto para avaliar o Projeto e preparar
            um piloto que realmente responda à sua operação.
          </p>

          <div className={vip.contactProof}>
            <span>A partir de 10 câmeras</span>
            <span>Piloto real de 60 minutos</span>
            <span>Até 6 câmeras no teste</span>
            <span>Sem cartão no piloto</span>
          </div>
        </div>

        <div className={vip.formShell}>
          {sent ? (
            <div className={vip.formSuccess}>
              <p className={styles.tableCaption}>INTERESSE REGISTRADO</p>
              <h3 className={styles.h3}>
                Seu Projeto entrou na fila VIP.
              </h3>
              <p>
                O especialista recebe o contexto que você informou e pode
                continuar a conversa sem pedir tudo novamente.
              </p>
              <a
                className={`${styles.btn} ${styles.btnGhost} ${vip.goldGhost}`}
                href="/"
              >
                Voltar ao início
              </a>
            </div>
          ) : (
            <form action={requestVipContactAction} className={vip.form}>
              {failed ? (
                <div className={vip.formError}>
                  {errorMessage ??
                    "Revise os dados e tente novamente."}
                </div>
              ) : null}

              <input
                className={vip.honeypot}
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
              <input type="hidden" name="started_at" value={String(startedAt)} />
              <input
                type="hidden"
                name="utm_source"
                value={first(query.utm_source) ?? ""}
              />
              <input
                type="hidden"
                name="utm_medium"
                value={first(query.utm_medium) ?? ""}
              />
              <input
                type="hidden"
                name="utm_campaign"
                value={first(query.utm_campaign) ?? ""}
              />
              <input
                type="hidden"
                name="utm_content"
                value={first(query.utm_content) ?? ""}
              />
              <input
                type="hidden"
                name="referrer"
                value={first(query.ref) ?? ""}
              />

              <div className={vip.formGrid}>
                <label>
                  <span>Seu nome</span>
                  <input
                    name="lead_name"
                    type="text"
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <label>
                  <span>Empresa / projeto</span>
                  <input
                    name="company_name"
                    type="text"
                    minLength={2}
                    maxLength={160}
                    required
                  />
                </label>
                <label>
                  <span>E-mail profissional</span>
                  <input
                    name="lead_email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
                <label>
                  <span>WhatsApp / telefone</span>
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    minLength={8}
                    maxLength={40}
                    required
                  />
                </label>
                <label>
                  <span>Tipo de projeto</span>
                  <select name="project_kind" defaultValue="enterprise">
                    <option value="enterprise">Grande empresa</option>
                    <option value="large_monitoring">
                      Empresa / central de segurança
                    </option>
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
                  placeholder="Ex.: acompanhar várias unidades, reduzir revisão manual, pesquisar ocorrências entre câmeras ou analisar um experimento."
                />
              </label>

              <button
                type="submit"
                className={vip.goldButton}
                data-vip-event="lead_submit"
              >
                Solicitar avaliação do especialista
              </button>

              <small>
                Ao enviar, você não cria conta nem inicia cobrança. Seus dados
                são usados somente para avaliar e conduzir o Projeto VIP.
              </small>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
