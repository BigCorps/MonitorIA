import {
  assistantExamples,
  assistantFree,
  boundaries,
  compatibility,
  primaryCta,
  secondaryCta,
  trialCta,
  trialIsLive,
  trialNote,
  discountTiers,
  faq,
  integration,
  invoiceExample,
  landingPlans,
  planIncludes,
  trialFacts,
} from "@/src/lib/landing-content";
import { CtaLink } from "./cta-link";
import styles from "./landing.module.css";

export function Plans() {
  return (
    <section className={styles.section} id="planos">
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Planos</span>
          </p>
          <h2 className={styles.h2}>Você escolhe câmera a câmera.</h2>
          <p className={styles.lede}>
            Não existe mensalidade por conta, por empresa nem por local. Você paga só pelas
            câmeras ativas e escolhe o plano de cada uma. Uma fatura por empresa.
          </p>
        </div>

        <div className={`${styles.planGrid} ${styles.stagger}`}>
          {landingPlans.map((plan) => (
            <article
              className={styles.planCard}
              key={plan.code}
              data-featured={plan.code === "standard"}
            >
              {/* Antes este selo repetia o nome do plano ("Câmera Atenta" com
                  "Atenta" logo abaixo). Agora carrega o posicionamento. */}
              <span className={styles.planCode}>{plan.badge}</span>
              <h3 className={styles.planName}>{plan.name}</h3>
              <p className={styles.planPrice}>
                <b className={styles.mono}>R$ {plan.price}</b>
                <span>por câmera / mês</span>
              </p>
              <p className={styles.planSummary}>{plan.summary}</p>

              <ul className={styles.planSpecs}>
                <li>
                  {plan.history} de histórico
                  <span>Tudo pesquisável</span>
                </li>
                <li>
                  {plan.images}
                  <span>{plan.imageDetail}</span>
                </li>
                <li>
                  {plan.clip ?? "Sem clipe de vídeo"}
                  {plan.clip ? <span>Guardado à parte das imagens</span> : null}
                </li>
              </ul>
            </article>
          ))}
        </div>

        <div className={`${styles.includes} ${styles.reveal}`}>
          <p className={styles.tableCaption}>Incluído em todos os planos</p>
          <ul className={styles.includesList}>
            {planIncludes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Desconto e fatura no mesmo bloco: a régua explica a regra, a fatura
            prova a regra. Antes eram dois argumentos soltos em sequência. */}
        <div className={`${styles.discount} ${styles.reveal}`}>
          <div className={styles.tierTable}>
            <p className={styles.tableCaption}>Cada câmera nova entra mais barata</p>
            {discountTiers.map((tier) => (
              <div className={styles.tierRow} key={tier.range}>
                <span>{tier.range}</span>
                <b className={styles.mono}>{tier.off}</b>
              </div>
            ))}
            <p className={styles.scaleNote}>
              O desconto vale para a posição, não para a conta inteira. Cada câmera nova
              entra na faixa seguinte e mantém o preço dela.
            </p>
          </div>

          <div className={styles.invoiceTable}>
            <p className={styles.tableCaption}>Exemplo de fatura · 4 câmeras</p>
            {invoiceExample.lines.map((line, index) => (
              <div className={styles.invoiceRow} key={`${line.label}-${index}`}>
                <span>{line.label}</span>
                <b className={styles.mono}>{line.value}</b>
              </div>
            ))}
            <div className={styles.invoiceRow}>
              <span className={styles.dim}>Subtotal</span>
              <b className={`${styles.mono} ${styles.dim}`}>{invoiceExample.subtotal}</b>
            </div>
            <div className={styles.invoiceRow}>
              <span className={styles.dim}>Desconto</span>
              <b className={`${styles.mono} ${styles.dim}`}>− {invoiceExample.discount}</b>
            </div>
            <div className={`${styles.invoiceRow} ${styles.invoiceTotal}`}>
              <span>Total no mês</span>
              <b className={styles.mono}>{invoiceExample.total}</b>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Assistente.
 *
 * Invertido: antes a seção abria explicando o limite de uso — vendia a
 * fatura, não o produto. Agora a capacidade vem primeiro, a cota mensal
 * desceu para nota de rodapé do cartão da direita, e a integração com
 * ChatGPT e Claude entrou aqui em vez de virar uma seção própria.
 */
export function Assistant() {
  return (
    <section className={`${styles.section} ${styles.sectionDeep}`}>
      <div className={`${styles.container} ${styles.assistant} ${styles.reveal} ${styles.recede}`}>
        <div>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Assistente</span>
          </p>
          <h2 className={styles.h2}>Pergunte com as suas palavras.</h2>
          <p className={styles.lede}>
            Você escreve como falaria com um funcionário. Ele responde com o horário, um
            resumo e as imagens que serviram de prova — e daí você abre aquele minuto no
            seu equipamento.
          </p>

          <div className={styles.includes}>
            <p className={styles.tableCaption}>Perguntas que ele responde</p>
            <ul className={styles.includesList}>
              {assistantExamples.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <p className={styles.tableCaption} style={{ marginTop: "26px" }}>
            Não gasta pergunta
          </p>
          <ul className={styles.freeList}>
            {assistantFree.map((item) => (
              <li key={item}>
                <span className={styles.freeTag}>livre</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className={styles.quotaCard}>
            <p className={`${styles.quotaNumber} ${styles.mono}`}>90</p>
            <p className={styles.quotaCaption}>
              perguntas por mês, por empresa — não por usuário e não por câmera.
            </p>
            <p className={styles.scaleNote}>
              A conta renova quando a fatura é confirmada e não acumula. Pergunta que
              falhou não conta. Se acabar, o Assistente é bloqueado com uma oferta de
              pacote extra — nunca vira cobrança surpresa.
            </p>
          </div>

          <div className={styles.includes}>
            <p className={styles.tableCaption}>{integration.title}</p>
            <ul className={styles.includesList}>
              {integration.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Teste grátis.
 *
 * Absorveu a antiga seção <Boundaries />. Os limites declarados continuam na
 * página — e num lugar melhor: encostados no botão, onde respondem a última
 * objeção em vez de interromper a narrativa no meio.
 */
export function Trial() {
  return (
    <section className={styles.section}>
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.trial} ${styles.reveal}`}>
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowTime}>00:00</span>
              <span>Teste grátis</span>
            </p>
            <h2 className={styles.h2}>Uma câmera, um dia real.</h2>
            <p className={styles.lede}>
              {trialIsLive
                ? "O teste começa quando a primeira câmera estiver ligada e você clicar em iniciar — não quando você se cadastra. Assim as 24 horas contam análise de verdade, e não tempo de instalação."
                : "Será assim: o teste começa quando a primeira câmera estiver ligada e você clicar em iniciar — não quando você se cadastra. Assim as 24 horas contam análise de verdade, e não tempo de instalação."}
            </p>
          </div>

          <div className={`${styles.trialFacts} ${styles.stagger}`}>
            {trialFacts.map((fact) => (
              <div className={styles.trialFact} key={fact.label}>
                <b className={styles.mono}>{fact.value}</b>
                <span>{fact.label}</span>
              </div>
            ))}
          </div>

          <div>
            <div className={styles.actions}>
              <CtaLink cta={trialCta} variant="primary" />
            </div>
            <p className={styles.trialNote}>{trialNote}</p>
          </div>
        </div>

        <div className={`${styles.includes} ${styles.reveal}`}>
          <p className={styles.tableCaption}>Sem surpresas</p>
          <div className={`${styles.boundaryGrid} ${styles.stagger}`}>
            {boundaries.map((item) => (
              <p className={styles.boundaryItem} key={item}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14" strokeLinecap="round" />
                </svg>
                {item}
              </p>
            ))}
          </div>
          <p className={styles.scaleNote}>{compatibility.exception}</p>
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section className={`${styles.section} ${styles.sectionDeep}`} id="duvidas">
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Dúvidas</span>
          </p>
          <h2 className={styles.h2}>As perguntas que sempre chegam.</h2>
        </div>

        <div className={`${styles.faqList} ${styles.stagger}`}>
          {faq.map((item) => (
            <details className={styles.faqItem} key={item.q}>
              <summary>{item.q}</summary>
              <p className={styles.faqAnswer}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Closing() {
  return (
    <section className={styles.closingWrap}>
      <div className={`${styles.container} ${styles.closing}`}>
        <div>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>19:47</span>
            <span>Depois do fechamento</span>
          </p>
          <h2 className={styles.h2}>Suas câmeras já gravam. Falta alguém lembrar.</h2>
        </div>
        <div className={styles.actions}>
          <CtaLink cta={primaryCta} variant="primary" />
          <CtaLink cta={secondaryCta} variant="ghost" />
        </div>
      </div>
    </section>
  );
}
