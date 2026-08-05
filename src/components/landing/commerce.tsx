import {
  assistantFree,
  primaryCta,
  secondaryCta,
  trialCta,
  trialIsLive,
  trialNote,
  discountTiers,
  faq,
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
            Não existe mensalidade por conta, por empresa nem por local. A cobrança é somente
            por câmera ativa, e o plano é definido em cada câmera. Uma fatura por empresa.
          </p>
        </div>

        <div className={`${styles.planGrid} ${styles.stagger}`}>
          {landingPlans.map((plan) => (
            <article
              className={styles.planCard}
              key={plan.code}
              data-featured={plan.code === "standard"}
            >
              <span className={styles.planCode}>Câmera {plan.name}</span>
              <h3 className={styles.planName}>{plan.name}</h3>
              <p className={styles.planPrice}>
                <b className={styles.mono}>R$ {plan.price}</b>
                <span>por câmera / mês</span>
              </p>
              <p className={styles.planSummary}>{plan.summary}</p>

              <ul className={styles.planSpecs}>
                <li>
                  {plan.history} de histórico
                  <span>Metadados pesquisáveis</span>
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

        <div className={`${styles.discount} ${styles.reveal}`}>
          <div className={styles.tierTable}>
            <p className={styles.tableCaption}>Desconto por câmera adicional</p>
            {discountTiers.map((tier) => (
              <div className={styles.tierRow} key={tier.range}>
                <span>{tier.range}</span>
                <b className={styles.mono}>{tier.off}</b>
              </div>
            ))}
            <p className={styles.scaleNote}>
              O desconto vale para a posição, não para a conta inteira. Cada câmera nova entra
              na faixa seguinte e mantém o preço dela.
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
              <span className={styles.dim}>Desconto progressivo</span>
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

export function Assistant() {
  return (
    <section className={`${styles.section} ${styles.sectionDeep}`}>
      <div className={`${styles.container} ${styles.assistant} ${styles.reveal} ${styles.recede}`}>
        <div>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Assistente IA</span>
          </p>
          <h2 className={styles.h2}>Perguntar custa. Procurar, não.</h2>
          <p className={styles.lede}>
            A franquia só é consumida quando você faz uma pergunta ao Assistente e ela é
            respondida. Todo o resto do produto — pesquisa, filtro, gráfico, exportação — é
            ilimitado e não desconta nada.
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

        <div className={styles.quotaCard}>
          <p className={`${styles.quotaNumber} ${styles.mono}`}>90</p>
          <p className={styles.quotaCaption}>
            interações por mês, por empresa — não por usuário e não por câmera.
          </p>
          <p className={styles.scaleNote}>
            A franquia renova na confirmação da fatura e não acumula. Uma resposta que falhou
            não consome. Se acabar, o Assistente é bloqueado com uma oferta de pacote extra —
            nunca vira cobrança surpresa.
          </p>
        </div>
      </div>
    </section>
  );
}

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
                ? "O teste só começa quando o Agent estiver pareado, a câmera online e o primeiro quadro recebido — e quando você clicar em iniciar. Assim as 24 horas contam tempo de análise de verdade, não tempo de instalação."
                : "Será assim: o teste só começa depois que o Agent estiver pareado, a câmera online e o primeiro quadro recebido — e quando você clicar em iniciar. Assim as 24 horas contam tempo de análise de verdade, não tempo de instalação."}
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
