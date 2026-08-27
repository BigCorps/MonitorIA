import styles from "./smartscreen-notice.module.css";

/**
 * Aviso da edição instalada diretamente pelo site/painel.
 *
 * A mensagem evita prometer que SmartScreen ou antivírus nunca analisarão o
 * arquivo. Também não orienta o cliente a desativar proteção do Windows.
 */
export function SmartScreenNotice({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  if (variant === "compact") {
    return (
      <aside className={`${styles.notice} ${styles.compact}`}>
        <p className={styles.title}>O Windows pode pedir uma confirmação</p>
        <p className={styles.text}>
          A edição 24/7 é instalada diretamente pelo MonitorIA e trabalha em
          segundo plano. O SmartScreen ou seu antivírus pode analisar o arquivo
          ou pedir uma confirmação. Use somente o instalador baixado pelo site
          ou painel oficial do MonitorIA e confira o editor antes de continuar.
        </p>
      </aside>
    );
  }

  return (
    <aside className={styles.notice}>
      <p className={styles.eyebrow}>Antes de instalar</p>
      <h3 className={styles.title}>
        O Windows ou seu antivírus pode analisar o instalador
      </h3>

      <p className={styles.text}>
        Isso pode acontecer com programas instalados diretamente no Windows,
        especialmente quando trabalham continuamente em segundo plano. Uma
        análise ou confirmação de segurança não significa, por si só, que o
        arquivo esteja com problema.
      </p>

      <div className={styles.steps}>
        <p className={styles.stepsTitle}>Antes de continuar:</p>
        <ol className={styles.list}>
          <li>
            Confirme que o arquivo foi baixado pelo <strong>site ou painel
            oficial do MonitorIA</strong>.
          </li>
          <li>
            Nas propriedades do arquivo, confira a aba <strong>Assinaturas
            Digitais</strong> e o editor BIGCORPS TECNOLOGIA.
          </li>
          <li>
            Se o Windows mostrar uma confirmação adicional, leia a mensagem e
            confirme somente se o arquivo e o editor estiverem corretos.
          </li>
        </ol>
      </div>

      <p className={styles.text}>
        Não é necessário desativar o antivírus nem reduzir a proteção do
        computador para usar o MonitorIA. Se uma ferramenta de segurança
        bloquear o arquivo, mantenha a proteção ativa e fale com o suporte para
        conferirmos o instalador e a assinatura.
      </p>

      <p className={styles.footnote}>
        A edição pela Microsoft Store usa outro processo de instalação e tende
        a ter menos atrito nessa etapa, mas o Windows e ferramentas de segurança
        continuam livres para analisar o aplicativo normalmente.
      </p>

      <p className={styles.help}>
        Ficou em dúvida? Fale com a gente antes de instalar.
      </p>
    </aside>
  );
}
