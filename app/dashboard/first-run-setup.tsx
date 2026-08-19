import Link from "next/link";
import type {
  SetupCameraSummary,
  SiteSummary,
} from "@/src/lib/dashboard-data";
import { InstallerPlatformActions } from "@/src/components/installer-platform-actions";
import { DashboardSidebar } from "./dashboard-sidebar";
import { FirstRunWaiting } from "./first-run-waiting";
import { SitePairingCode } from "./site-pairing-code";
import { getFirstRunStatusAction } from "./first-run-status";
import styles from "./first-run.module.css";

type Props = {
  organizationName: string;
  userEmail: string | null;
  site: SiteSummary;
  cameras: SetupCameraSummary[];
  agentPaired: boolean;
  stage: 1 | 2 | 3 | 4 | 5;
  message: string | null;
};

export async function FirstRunSetup({
  organizationName,
  userEmail,
  site,
  cameras,
  message,
}: Props) {
  const firstRun = await getFirstRunStatusAction();
  const phase = firstRun.phase;
  const firstCameraId =
    firstRun.firstCameraId ??
    cameras.find((camera) => camera.status === "online")?.id ??
    cameras[0]?.id ??
    null;

  const phases = [
    { id: "connect", title: "Conectar" },
    { id: "discover", title: "Procurar" },
    { id: "name", title: "Nomear" },
    { id: "profile", title: "Explicar" },
    { id: "commercial", title: "Ativar" },
  ] as const;

  const currentIndex = Math.max(
    0,
    phases.findIndex((item) => item.id === phase),
  );

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
            <h1>Vamos configurar sem pular nenhuma etapa</h1>
            <p>
              Local <strong>{site.name}</strong>. Você só precisa seguir o passo
              destacado agora.
            </p>
          </div>
        </header>

        {message ? <div className="dashboard-message">{message}</div> : null}

        <section className={styles.firstRunCard}>
          <div className={styles.firstRunProgress} aria-label="Etapas do primeiro acesso">
            {phases.map((item, index) => {
              const done = index < currentIndex || phase === "done";
              const current = index === currentIndex && phase !== "done";

              return (
                <article
                  key={item.id}
                  data-complete={done}
                  data-current={current}
                >
                  <span>{done ? "✓" : index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{done ? "Concluído" : current ? "Agora" : "Depois"}</small>
                  </div>
                </article>
              );
            })}
          </div>

          {phase === "connect" ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 1 DE 5</span>
                <h2>Conecte o computador da loja</h2>
                <p>
                  O Agent deve ficar em um computador ligado na mesma rede local
                  das câmeras, DVR ou NVR. Ele é a ponte contínua entre a loja e o MonitorIA.
                </p>
              </div>

              <div className={styles.connectGrid}>
                <div className={styles.connectMain}>
                  <ol className={styles.firstRunInstructions}>
                    <li>
                      <span>1</span>
                      <div>
                        <strong>Instale no computador da rede das câmeras</strong>
                        <p>Ele precisa estar conectado ao mesmo roteador ou rede local do DVR, NVR ou câmeras IP.</p>
                      </div>
                    </li>
                    <li>
                      <span>2</span>
                      <div>
                        <strong>Mantenha esse computador ligado</strong>
                        <p>O MonitorIA depende dele enquanto o monitoramento estiver ativo.</p>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <strong>Gere o código somente quando o instalador pedir</strong>
                        <p>O código vale 15 minutos. Depois do pareamento, a tela avança automaticamente.</p>
                      </div>
                    </li>
                  </ol>

                  <div className={styles.networkNote}>
                    <strong>Importante:</strong> se você está fazendo este cadastro
                    pelo celular, compartilhe o link de instalação com o computador
                    que ficará ligado na loja. Não é necessário instalar o Agent no celular.
                  </div>
                </div>

                <aside className={styles.connectAside}>
                  <div className={styles.asideTitle}>
                    <strong>1. Baixe e instale</strong>
                    <span>Mostramos a opção adequada para este dispositivo.</span>
                  </div>
                  <InstallerPlatformActions />

                  <div className={styles.asideTitle}>
                    <strong>2. Pareie com este local</strong>
                    <span>Gere o código quando o instalador estiver aberto.</span>
                  </div>
                  <SitePairingCode />
                </aside>
              </div>
            </div>
          ) : null}

          {phase === "discover" ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 2 DE 5</span>
                <h2>Agora vamos encontrar suas câmeras</h2>
                <p>
                  Primeiro o MonitorIA encontra o que realmente existe na rede.
                  Os nomes serão escolhidos somente depois.
                </p>
              </div>
              <div className={styles.firstRunActions}>
                <Link href="/dashboard/cameras/discovery" className="panel-primary-action">
                  Procurar câmeras
                </Link>
              </div>
              <FirstRunWaiting
                stage={2}
                waitingFor="Nenhuma câmera encontrada ainda"
                detail="Depois da busca, você dará um nome para cada câmera encontrada."
              />
            </div>
          ) : null}

          {phase === "name" ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 3 DE 5</span>
                <h2>Dê um nome para cada câmera encontrada</h2>
                <p>
                  Use nomes fáceis de reconhecer, como Entrada, Caixa ou Estoque.
                </p>
              </div>
              <div className={styles.firstRunActions}>
                <Link href="/dashboard/cameras/setup" className="panel-primary-action">
                  Nomear {cameras.length === 1 ? "a câmera" : "as câmeras"}
                </Link>
              </div>
            </div>
          ) : null}

          {phase === "profile" ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 4 DE 5</span>
                <h2>Explique o que a câmera está vendo</h2>
                <p>
                  Quando chegar uma imagem real, explique funcionários, clientes,
                  caixa, entrada e o que deve ser observado.
                </p>
              </div>
              <div className={styles.firstRunActions}>
                {firstCameraId ? (
                  <Link
                    href={`/dashboard/cameras/${firstCameraId}?onboarding=1`}
                    className="panel-primary-action"
                  >
                    Configurar contexto da câmera
                  </Link>
                ) : null}
              </div>
              <FirstRunWaiting
                stage={4}
                waitingFor="Esperando o contexto da câmera ser aprovado"
                detail="Depois da aprovação, você seguirá para escolher teste grátis ou contratação."
              />
            </div>
          ) : null}

          {phase === "commercial" ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 5 DE 5</span>
                <h2>Escolha como deseja começar</h2>
                <p>
                  Escolha 24 horas grátis ou contrate um plano. O teste só começa
                  quando você confirmar.
                </p>
              </div>
              <div className={styles.firstRunActions}>
                <Link href="/dashboard/commercial-choice" className="panel-primary-action">
                  Escolher teste ou plano
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
