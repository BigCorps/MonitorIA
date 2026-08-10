import styles from "./smartscreen-notice.module.css";

/**
 * Aviso sobre a mensagem de segurança do Windows.
 *
 * Aparece em dois lugares: na página que baixa o instalador
 * (app/dashboard/installer/page.tsx) e na etapa do onboarding em que o
 * cliente baixa o programa pela primeira vez.
 *
 * Por que existe: o certificado do MonitorIA é OV. A assinatura é válida e
 * o editor aparece verificado, mas o SmartScreen só deixa de avisar depois
 * de acumular histórico de downloads. Nas primeiras semanas a mensagem
 * ainda pode surgir.
 *
 * O texto foi escrito para não assustar e não mentir: explica o que a
 * mensagem é, o que fazer, e por que ela vai desaparecer. Sem jargão —
 * nada de "Authenticode", "reputação de binário" ou "OV".
 *
 * `variant="compact"` é para o onboarding, onde o espaço é curto.
 */
export function SmartScreenNotice({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  if (variant === "compact") {
    return (
      <aside className={`${styles.notice} ${styles.compact}`}>
        <p className={styles.title}>
          O Windows pode mostrar um aviso azul
        </p>
        <p className={styles.text}>
          Se aparecer, clique em <strong>Mais informações</strong> e depois em{" "}
          <strong>Executar assim mesmo</strong>. O programa é assinado pela
          BIGCORPS TECNOLOGIA e verificado por uma autoridade de certificação
          — o aviso é só porque ele é recente.
        </p>
      </aside>
    );
  }

  return (
    <aside className={styles.notice}>
      <p className={styles.eyebrow}>Antes de instalar</p>
      <h3 className={styles.title}>
        O Windows pode mostrar um aviso. É esperado.
      </h3>

      <p className={styles.text}>
        Ao abrir o instalador, o Windows pode exibir uma tela azul dizendo que
        não reconhece o programa. Isso não significa que há algo errado com o
        arquivo.
      </p>

      <div className={styles.steps}>
        <p className={styles.stepsTitle}>Se a mensagem aparecer:</p>
        <ol className={styles.list}>
          <li>
            Clique em <strong>Mais informações</strong>
          </li>
          <li>
            Clique em <strong>Executar assim mesmo</strong>
          </li>
        </ol>
      </div>

      <p className={styles.text}>
        O instalador é assinado digitalmente pela{" "}
        <strong>BIGCORPS TECNOLOGIA</strong> e essa identidade foi verificada
        por uma autoridade de certificação. Você pode confirmar isso a
        qualquer momento: clique com o botão direito no arquivo, abra{" "}
        <strong>Propriedades</strong> e veja a aba{" "}
        <strong>Assinaturas Digitais</strong>.
      </p>

      <p className={styles.footnote}>
        O Windows aprende a confiar em um programa conforme mais pessoas o
        instalam. Como o MonitorIA é recente, esse histórico ainda está sendo
        formado, e por isso o aviso pode surgir nas primeiras semanas. Ele
        desaparece sozinho, sem que você precise fazer nada.
      </p>

      <p className={styles.help}>
        Ficou em dúvida? Fale com a gente antes de instalar. Preferimos tirar
        a dúvida a deixar você desconfortável.
      </p>
    </aside>
  );
}
