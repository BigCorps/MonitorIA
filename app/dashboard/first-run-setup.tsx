import Link from "next/link";
import type {
  SetupCameraSummary,
  SiteSummary,
} from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "./dashboard-sidebar";
import { SitePairingCode } from "./site-pairing-code";
import styles from "./overview.module.css";

type Props = {
  organizationName: string;
  userEmail: string | null;
  site: SiteSummary;
  cameras: SetupCameraSummary[];
  agentPaired: boolean;
  message: string | null;
};

/**
 * Guia de primeiro acesso, na ordem em que as coisas realmente acontecem.
 *
 * A ordem anterior pedia os dados da câmera antes de qualquer outra coisa,
 * porque o código de pareamento nascia preso a uma câmera. Na prática isso
 * obrigava o dono do mercado a inventar o nome e o endereço de um aparelho
 * que ele ainda não sabia se estava na rede — e era onde a configuração
 * empacava.
 *
 * Agora: conecta o computador, procura as câmeras, confere o que veio.
 * Cada passo só existe porque o anterior terminou.
 */
export function FirstRunSetup({
  organizationName,
  userEmail,
  site,
  cameras,
  agentPaired,
  message,
}: Props) {
  const hasCameras = cameras.length > 0;
  const cameraOnline = cameras.some((camera) => camera.status === "online");

  const steps = [
    {
      title: "Conectar o computador",
      done: agentPaired,
      detail: agentPaired ? "Computador conectado" : "Comece por aqui",
    },
    {
      title: "Procurar as câmeras",
      done: hasCameras,
      detail: hasCameras
        ? `${cameras.length} ${cameras.length === 1 ? "câmera encontrada" : "câmeras encontradas"}`
        : "Depois do computador",
    },
    {
      title: "Conferir as câmeras",
      done: cameraOnline,
      detail: cameraOnline ? "Recebendo imagem" : "Por último",
    },
  ];

  const current = agentPaired ? (hasCameras ? 3 : 2) : 1;

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organizationName}
        userEmail={userEmail}
        active="overview"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">PRIMEIRO ACESSO</span>
            <h1>Três passos para o MonitorIA começar a olhar</h1>
            <p>
              Local <strong>{site.name}</strong>. Faça na ordem — cada passo
              depende do anterior.
            </p>
          </div>
        </header>

        {message ? <div className="dashboard-message">{message}</div> : null}

        <section className={styles.firstRunCard}>
          <div className={styles.firstRunProgress}>
            {steps.map((step, index) => (
              <article key={step.title} data-complete={step.done}>
                <span>{step.done ? "✓" : index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </div>
              </article>
            ))}
          </div>

          {current === 1 ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 1 DE 3</span>
                <h2>Conecte o computador da loja</h2>
                <p>
                  O MonitorIA funciona a partir de um computador que fica
                  ligado na loja, no mesmo roteador das câmeras. É ele que
                  encontra e acompanha as imagens.
                </p>
              </div>

              <ol className={styles.firstRunInstructions}>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Baixe o MonitorIA nesse computador</strong>
                    <p>Confirme a solicitação de administrador do Windows.</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Quando o instalador pedir, gere o código</strong>
                    <p>
                      Gere só nessa hora: ele vale 15 minutos, e o download
                      costuma levar mais tempo que isso.
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Digite o código e conclua</strong>
                    <p>
                      É a única coisa que o instalador pede. Termina em poucos
                      segundos.
                    </p>
                  </div>
                </li>
              </ol>

              <div className={styles.firstRunActions}>
                <a
                  href="/api/installer/windows"
                  className="panel-primary-action"
                >
                  Baixar MonitorIA para Windows
                </a>
              </div>

              <SitePairingCode />
            </div>
          ) : null}

          {current === 2 ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 2 DE 3</span>
                <h2>Agora vamos encontrar suas câmeras</h2>
                <p>
                  O computador está conectado. Ele procura sozinho as câmeras
                  que estão no mesmo roteador — você só responde quantas tem e
                  qual o usuário e a senha delas.
                </p>
              </div>

              <ol className={styles.firstRunInstructions}>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Deixe as câmeras ligadas</strong>
                    <p>
                      Elas precisam estar no mesmo roteador do computador. Só
                      são encontradas as que estiverem ligadas agora.
                    </p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Tenha o usuário e a senha em mãos</strong>
                    <p>
                      Vêm no manual, numa etiqueta do gravador ou no aplicativo
                      do fabricante. Costumam ser diferentes da senha do
                      aplicativo.
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Clique em procurar e acompanhe</strong>
                    <p>
                      A busca leva de um a cinco minutos, dependendo do tamanho
                      da rede. Você pode deixar a tela aberta.
                    </p>
                  </div>
                </li>
              </ol>

              <div className={styles.firstRunActions}>
                <Link
                  href="/dashboard/cameras/discovery"
                  className="panel-primary-action"
                >
                  Procurar câmeras
                </Link>
              </div>
            </div>
          ) : null}

          {current === 3 ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 3 DE 3</span>
                <h2>Confira as câmeras encontradas</h2>
                <p>
                  {cameraOnline
                    ? "A primeira imagem já chegou. Dê nomes que você reconheça e escolha o que cada câmera deve observar."
                    : "As câmeras foram salvas e a primeira imagem está a caminho. Enquanto isso, dê nomes que você reconheça."}
                </p>
              </div>

              <ol className={styles.firstRunInstructions}>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Dê um nome a cada câmera</strong>
                    <p>
                      "Caixa", "Estoque", "Entrada". É por esse nome que os
                      avisos vão chegar até você.
                    </p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Escolha o que ela deve observar</strong>
                    <p>
                      Cada câmera pode ter um objetivo diferente, e isso muda o
                      que o MonitorIA considera importante.
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Faltou alguma câmera?</strong>
                    <p>
                      Se alguma não apareceu, ligue o aparelho e procure de
                      novo. Câmeras com outra senha exigem uma busca separada.
                    </p>
                  </div>
                </li>
              </ol>

              <div className={styles.firstRunActions}>
                <Link
                  href="/dashboard/cameras"
                  className="panel-primary-action"
                >
                  Conferir minhas câmeras
                </Link>
                <Link
                  href="/dashboard/cameras/discovery"
                  className="panel-secondary-action"
                >
                  Procurar mais câmeras
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
