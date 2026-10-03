import styles from "@/src/components/landing/landing.module.css";
import vip from "@/app/vip/landing/vip-landing.module.css";
import local from "./assisted-closing.module.css";

export function VipAssistedClosing({
  companyName,
  alias,
  redeemed,
}: {
  companyName: string | null;
  alias: string;
  redeemed: boolean;
}) {
  return (
    <section
      className={`${styles.closingWrap} ${vip.closingWrap}`}
      id="contato"
    >
      <div className={`${styles.container} ${local.grid}`}>
        <div>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>VIP</span>
            <span>Apresentação acompanhada · {alias}</span>
          </p>
          <h2 className={styles.h2}>
            {redeemed ? "Vamos continuar de onde você parou." : "Está pronto? Vamos começar."}
          </h2>
          <p className={styles.lede}>
            {companyName ? `${companyName}: ` : ""}
            seu especialista continua com você na instalação, na preparação das
            câmeras e durante os mesmos 60 minutos do piloto.
          </p>

          <div className={local.steps}>
            <div><span>1</span><strong>Conta e Projeto</strong><small>O convite já leva os dados desta apresentação.</small></div>
            <div><span>2</span><strong>Instalação acompanhada</strong><small>O vendedor vê progresso e próxima ação, não suas credenciais.</small></div>
            <div><span>3</span><strong>Piloto de 60 minutos</strong><small>Cliente e especialista acompanham o mesmo relógio e os mesmos resultados.</small></div>
          </div>
        </div>

        <aside className={local.actionCard}>
          <span>{redeemed ? "IMPLANTAÇÃO EM ANDAMENTO" : "PRÓXIMA ETAPA"}</span>
          <strong>{redeemed ? "Continuar implantação VIP" : "Começar meu Projeto VIP"}</strong>
          <p>
            O relógio do piloto não começa ao clicar aqui. Ele só inicia depois
            que as câmeras escolhidas estiverem prontas e você confirmar o início.
          </p>
          <a className={vip.goldButton} href="/comecar">
            {redeemed ? "Continuar agora" : "Estou pronto. Vamos começar"}
          </a>
          <small>
            Nenhum formulário comercial adicional: este link já pertence à sua apresentação.
          </small>
        </aside>
      </div>
    </section>
  );
}
