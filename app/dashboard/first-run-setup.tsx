import Link from "next/link";
import type {
  SetupCameraSummary,
  SiteSummary,
} from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "./dashboard-sidebar";
import { FirstRunWaiting } from "./first-run-waiting";
import { SitePairingCode } from "./site-pairing-code";
import { getFirstRunStatusAction } from "./first-run-status";
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
    { id: "connect", title: "Conectar o computador" },
    { id: "discover", title: "Procurar as câmeras" },
    { id: "name", title: "Dar nome às câmeras" },
    { id: "profile", title: "Explicar o ambiente" },
    { id: "commercial", title: "Ativar teste ou plano" },
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
              Local <strong>{site.name}</strong>. Cada passo só aparece quando o
              anterior realmente terminou.
            </p>
          </div>
        </header>

        {message ? <div className="dashboard-message">{message}</div> : null}

        <section className={styles.firstRunCard}>
          <div className={styles.firstRunProgress}>
            {phases.map((item, index) => {
              const done = index < currentIndex || phase === "done";
              return (
                <article key={item.id} data-complete={done}>
                  <span>{done ? "✓" : index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {done
                        ? "Concluído"
                        : index === currentIndex
                          ? "Faça agora"
                          : "Depois"}
                    </small>
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
                  O MonitorIA precisa de um computador ligado no mesmo roteador
                  das câmeras. É ele que encontra e acompanha as imagens.
                </p>
              </div>

              <ol className={styles.firstRunInstructions}>
                <li><span>1</span><div><strong>Baixe o MonitorIA nesse computador</strong><p>Confirme a solicitação de administrador do Windows.</p></div></li>
                <li><span>2</span><div><strong>Quando o instalador pedir, gere o código</strong><p>O código vale 15 minutos; gere apenas na hora de usar.</p></div></li>
                <li><span>3</span><div><strong>Digite o código e conclua</strong><p>Quando terminar, esta página avança sozinha.</p></div></li>
              </ol>

              <div className={styles.firstRunActions}>
                <a href="/api/installer/windows" className="panel-primary-action">
                  Baixar MonitorIA para Windows
                </a>
              </div>

              <SitePairingCode />
              <FirstRunWaiting
                stage={1}
                waitingFor="Esperando o computador da loja se conectar"
                detail="Assim que o instalador terminar, esta tela avança sozinha."
              />
            </div>
          ) : null}

          {phase === "discover" ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 2 DE 5</span>
                <h2>Agora vamos encontrar suas câmeras</h2>
                <p>
                  Ainda não pediremos nenhum nome. Primeiro o MonitorIA encontra
                  o que realmente existe na rede da loja.
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
                  Agora que sabemos quais câmeras existem, identifique cada uma
                  com um nome fácil de reconhecer, como Entrada, Caixa ou Estoque.
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
                  Primeiro aguardamos uma imagem real da câmera. Assim que ela
                  chegar, a tela de contexto é liberada automaticamente para você
                  explicar funcionários, clientes, caixa, entrada e o que deve ser
                  observado.
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
                detail="Depois da aprovação, você seguirá automaticamente para escolher entre teste grátis e contratação."
              />
            </div>
          ) : null}

          {phase === "commercial" ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 5 DE 5</span>
                <h2>Escolha como deseja começar</h2>
                <p>
                  A câmera está pronta, mas nenhuma análise contínua está
                  autorizada ainda. Escolha 24 horas grátis ou contrate um
                  plano. O teste só começa quando você confirmar.
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
