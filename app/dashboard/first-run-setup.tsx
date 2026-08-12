import Link from "next/link";
import type {
  SetupCameraSummary,
  SiteSummary,
} from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "./dashboard-sidebar";
import { FirstRunWaiting } from "./first-run-waiting";
import { SitePairingCode } from "./site-pairing-code";
import styles from "./overview.module.css";

type Props = {
  organizationName: string;
  userEmail: string | null;
  site: SiteSummary;
  cameras: SetupCameraSummary[];
  agentPaired: boolean;
  stage: 1 | 2 | 3 | 4 | 5;
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
  stage,
  message,
}: Props) {
  const hasCameras = cameras.length > 0;
  const cameraOnline = cameras.some((camera) => camera.status === "online");
  const firstCameraId =
    cameras.find((camera) => camera.status === "online")?.id ??
    cameras[0]?.id ??
    null;

  const steps = [
    {
      title: "Conectar o computador",
      done: stage > 1,
      detail: stage > 1 ? "Computador conectado" : "Comece por aqui",
    },
    {
      title: "Procurar as câmeras",
      done: stage > 2,
      detail: hasCameras
        ? `${cameras.length} ${cameras.length === 1 ? "câmera encontrada" : "câmeras encontradas"}`
        : "Depois do computador",
    },
    {
      title: "Receber a imagem",
      done: stage > 3,
      detail: cameraOnline ? "Imagem chegando" : "Automático",
    },
    {
      title: "Explicar o ambiente",
      done: stage > 4,
      detail: stage === 4 ? "Falta só isso" : "Por último",
    },
  ];

  const current = stage;

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
            <h1>Quatro passos para o MonitorIA começar a olhar</h1>
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
                <span>PASSO 1 DE 4</span>
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

              <FirstRunWaiting
                stage={1}
                waitingFor="Esperando o computador da loja se conectar"
                detail="Assim que o instalador terminar, esta tela avança sozinha. Você não precisa atualizar a página."
              />
            </div>
          ) : null}

          {current === 2 ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 2 DE 4</span>
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

              <FirstRunWaiting
                stage={2}
                waitingFor="Nenhuma câmera cadastrada ainda"
                detail="Se você já fez a busca em outra aba, esta tela avança sozinha quando a primeira câmera entrar."
              />
            </div>
          ) : null}

          {current === 3 ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 3 DE 4</span>
                <h2>A primeira imagem está a caminho</h2>
                <p>
                  {cameras.length === 1
                    ? "A câmera foi salva. O computador da loja está buscando o primeiro quadro dela."
                    : `${cameras.length} câmeras foram salvas. O computador da loja está buscando o primeiro quadro.`}
                </p>
              </div>

              <FirstRunWaiting
                stage={3}
                waitingFor="Esperando a primeira imagem chegar"
                detail="Costuma levar até um minuto. Esta tela avança sozinha — não precisa atualizar."
              />

              <div className={styles.firstRunActions}>
                <Link
                  href="/dashboard/cameras"
                  className="panel-secondary-action"
                >
                  Ver as câmeras salvas
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

          {current === 4 ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 4 DE 4</span>
                <h2>Explique o que a câmera está vendo</h2>
                <p>
                  A imagem já está chegando. Falta contar ao MonitorIA o que
                  ele está olhando — onde ficam funcionários, clientes, caixa e
                  entrada. Sem isso ele avisa sobre coisas que não importam e
                  deixa passar as que importam.
                </p>
              </div>

              <ol className={styles.firstRunInstructions}>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Escolha uma foto representativa</strong>
                    <p>
                      De preferência com a loja em funcionamento normal, porta
                      aberta e balcão visível.
                    </p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Descreva o ambiente em uma frase</strong>
                    <p>
                      "Funcionários ficam atrás do balcão e clientes na área da
                      frente." É o bastante para começar.
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Aprove a análise</strong>
                    <p>
                      Depois disso o monitoramento começa e você acompanha
                      tudo em Monitoramento.
                    </p>
                  </div>
                </li>
              </ol>

              <div className={styles.firstRunActions}>
                {firstCameraId ? (
                  <Link
                    href={`/dashboard/cameras/${firstCameraId}`}
                    className="panel-primary-action"
                  >
                    Explicar o que essa câmera vê
                  </Link>
                ) : null}
                <Link
                  href="/dashboard/cameras"
                  className="panel-secondary-action"
                >
                  Ver todas as câmeras
                </Link>
              </div>

              <FirstRunWaiting
                stage={4}
                waitingFor="Esperando a primeira análise ser aprovada"
                detail="Quando você aprovar, esta tela dá lugar ao painel completo."
              />
            </div>
          ) : null}

        </section>
      </section>
    </main>
  );
}
