import Link from "next/link";
import type {
  SetupCameraSummary,
  SiteSummary,
} from "@/src/lib/dashboard-data";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
} from "@/src/lib/dashboard-data";
import { getCameraProfileWorkspace } from "@/src/lib/camera-profile-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { InstallerPlatformActions } from "@/src/components/installer-platform-actions";
import { DashboardSidebar } from "./dashboard-sidebar";
import { SitePairingCode } from "./site-pairing-code";
import { DiscoveryPanel } from "./cameras/discovery/discovery-panel";
import { OnboardingCameraContext } from "./onboarding-camera-context";
import { getFirstRunStatusAction } from "./first-run-status";
import styles from "./first-run.module.css";

type Props = {
  organizationName: string;
  userEmail: string | null;
  site: SiteSummary;
  cameras: SetupCameraSummary[];
  agentPaired: boolean;
  defaultCameraCount: number;
  stage: 1 | 2 | 3 | 4 | 5;
  message: string | null;
};

function trialDurationLabel(minutes: number) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  return `${minutes} minutos`;
}

export async function FirstRunSetup({
  organizationName,
  userEmail,
  site,
  cameras,
  agentPaired,
  defaultCameraCount,
  message,
}: Props) {
  const firstRun = await getFirstRunStatusAction();
  const phase = firstRun.phase;

  const phases = [
    { id: "connect", title: "Começar" },
    { id: "discover", title: "Preparar" },
    { id: "context", title: "Contexto" },
    { id: "commercial", title: "Ativar" },
  ] as const;

  const currentIndex = Math.max(
    0,
    phases.findIndex((item) => item.id === phase),
  );

  let context: {
    camera: {
      id: string;
      name: string;
      status: string;
      createdAt: string;
      setupNamedAt: string | null;
      sourceKind: "live_camera" | "local_recording";
    };
    workspace: Awaited<ReturnType<typeof getCameraProfileWorkspace>>;
    canManage: boolean;
    cameraIndex: number;
  } | null = null;

  let salesTrial: {
    durationMinutes: number;
    maxCameras: number;
  } | null = null;

  if (phase === "context" && firstRun.firstCameraId) {
    const user = await requireAuthenticatedUser();
    const organization = await getCurrentOrganization(user.id);

    if (organization) {
      const admin = createAdminClient();
      const cameraId = firstRun.firstCameraId;

      const [cameraResult, workspace] = await Promise.all([
        admin
          .from("cameras")
          .select("id,name,status,source_kind,created_at,setup_named_at")
          .eq("id", cameraId)
          .eq("organization_id", organization.id)
          .maybeSingle(),
        getCameraProfileWorkspace(organization.id, cameraId),
      ]);

      if (cameraResult.data) {
        const row = cameraResult.data as {
          id: string;
          name: string;
          status: string | null;
          source_kind: string | null;
          created_at: string;
          setup_named_at: string | null;
        };

        context = {
          camera: {
            id: String(row.id),
            name: String(row.name),
            status: String(row.status ?? "pending"),
            createdAt: String(row.created_at),
            setupNamedAt: row.setup_named_at ? String(row.setup_named_at) : null,
            sourceKind:
              row.source_kind === "local_recording"
                ? "local_recording"
                : "live_camera",
          },
          workspace,
          canManage: ["owner", "admin"].includes(organization.role),
          cameraIndex: Math.max(
            1,
            cameras.findIndex((camera) => camera.id === cameraId) + 1,
          ),
        };
      }
    }
  }

  if (phase === "commercial") {
    const user = await requireAuthenticatedUser();
    const organization = await getCurrentOrganization(user.id);

    if (organization) {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("trial_runs")
        .select("duration_minutes,max_cameras")
        .eq("organization_id", organization.id)
        .eq("trial_mode", "sales_assisted")
        .in("status", ["draft", "ready"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(
          "Falha ao identificar demonstração comercial no onboarding:",
          error.message,
        );
      } else if (data) {
        salesTrial = {
          durationMinutes: Number(data.duration_minutes ?? 60),
          maxCameras: Number(data.max_cameras ?? 6),
        };
      }
    }
  }

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
            <h1>Vamos colocar o MonitorIA para funcionar</h1>
            <p>
              Local <strong>{site.name}</strong>. Você pode testar primeiro com
              uma gravação ou conectar suas câmeras quando quiser.
            </p>
          </div>
        </header>

        {message ? <div className="dashboard-message">{message}</div> : null}

        <section className={styles.firstRunCard}>
          <div
            className={styles.firstRunProgress}
            style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
            aria-label="Etapas do primeiro acesso"
          >
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
                <span>PASSO 1 DE 4</span>
                <h2>Escolha como quer começar</h2>
                <p>
                  Para conhecer o MonitorIA mais rápido, teste com um vídeo que
                  você já tem. Se preferir, conecte suas câmeras agora para o
                  acompanhamento contínuo.
                </p>
              </div>

              <div className={styles.recordingStartCard}>
                <div>
                  <span>MAIS RÁPIDO PARA TESTAR</span>
                  <h3>Teste agora com uma gravação</h3>
                  <p>
                    Escolha um vídeo do celular ou computador e veja o MonitorIA
                    organizar os acontecimentos importantes. Você não precisa
                    configurar suas câmeras agora e pode testar até 6 ambientes
                    durante as 24 horas grátis.
                  </p>
                </div>

                <Link
                  href="/dashboard/recordings"
                  className="panel-primary-action"
                >
                  Testar com uma gravação
                </Link>
              </div>

              <div className={styles.connectOptionTitle}>
                <span>OU, SE PREFERIR</span>
                <h3>Conecte suas câmeras</h3>
                <p>
                  Faça a configuração completa para acompanhar sua empresa
                  continuamente.
                </p>
              </div>

              <div className={styles.connectGrid}>
                <div className={styles.connectMain}>
                  <ol className={styles.firstRunInstructions}>
                    <li>
                      <span>1</span>
                      <div>
                        <strong>Abra o MonitorIA no computador da loja</strong>
                        <p>
                          Esse computador deve estar na mesma rede das suas câmeras,
                          DVR ou NVR.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>2</span>
                      <div>
                        <strong>Deixe esse computador ligado</strong>
                        <p>
                          Assim o acompanhamento continua funcionando durante todo o período configurado.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <strong>Use o código quando for solicitado</strong>
                        <p>
                          O código vale 15 minutos. Depois da conexão, a tela avança automaticamente.
                        </p>
                      </div>
                    </li>
                  </ol>

                  <div className={styles.networkNote}>
                    <strong>Importante:</strong> se você está fazendo este cadastro
                    pelo celular, compartilhe o link de instalação com o computador
                    que ficará ligado na loja.
                  </div>

                 </div>

                <aside className={styles.connectAside}>
                  <div className={styles.asideTitle}>
                    <strong>1. Abra no computador da loja</strong>
                    <span>Mostramos a opção adequada para o computador que será usado.</span>
                  </div>
                  <InstallerPlatformActions />

                  <div className={styles.asideTitle}>
                    <strong>2. Conecte este local</strong>
                    <span>Gere o código quando o MonitorIA solicitar.</span>
                  </div>
                  <SitePairingCode />
                </aside>
              </div>
            </div>
          ) : null}

          {phase === "discover" ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 2 DE 4</span>
                <h2>Agora vamos encontrar suas câmeras</h2>
                <p>
                  A busca acontece aqui mesmo. Se faltar alguma câmera, o
                  MonitorIA orienta o que testar antes de continuar.
                </p>
              </div>

              <DiscoveryPanel
                onboarding
                hasAgent={agentPaired}
                defaultCameraCount={defaultCameraCount}
              />
            </div>
          ) : null}

          {phase === "context" ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 3 DE 4</span>
                <h2>Nome e contexto da câmera</h2>
                <p>
                  Primeiro aguardamos uma imagem real. Depois você identifica a
                  câmera e configura o ambiente, as zonas e o que deve ser observado,
                  tudo sem sair do onboarding.
                </p>
              </div>

              {context ? (
                context.camera.sourceKind === "local_recording" ? (
                  <div className={styles.waitingBox}>
                    <div>
                      <strong>Continue com sua gravação</strong>
                      <p>
                        Abra Gravações para confirmar o ambiente e iniciar o teste.
                      </p>
                      <div className={styles.firstRunActions}>
                        <Link
                          href={`/dashboard/recordings?source=${context.camera.id}`}
                          className="panel-primary-action"
                        >
                          Continuar com a gravação
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <OnboardingCameraContext
                    camera={context.camera}
                    workspace={context.workspace}
                    canManage={context.canManage}
                    cameraIndex={context.cameraIndex}
                    cameraTotal={cameras.length}
                    hasAgent={agentPaired}
                    defaultCameraCount={defaultCameraCount}
                  />
                )
              ) : (
                <div className={styles.waitingBox}>
                  <span className={styles.waitingSpinner} aria-hidden="true" />
                  <div>
                    <strong>Preparando a câmera para configurar</strong>
                    <p>A página será atualizada assim que os dados estiverem disponíveis.</p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {phase === "commercial" ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 4 DE 4</span>
                {salesTrial ? (
                  <>
                    <h2>Ative sua demonstração de {trialDurationLabel(salesTrial.durationMinutes)}</h2>
                    <p>
                      Seu convite comercial já está aplicado. Escolha até{" "}
                      {salesTrial.maxCameras} câmera(s) para o teste. O relógio só
                      começa depois que todas estiverem prontas e você confirmar.
                    </p>
                  </>
                ) : (
                  <>
                    <h2>Escolha como deseja começar</h2>
                    <p>
                      Escolha 24 horas grátis ou contrate um plano. O teste só começa
                      quando você confirmar.
                    </p>
                  </>
                )}
              </div>
              <div className={styles.firstRunActions}>
                <Link
                  href={salesTrial ? "/dashboard/trial/sales" : "/dashboard/commercial-choice"}
                  className="panel-primary-action"
                >
                  {salesTrial
                    ? `Preparar demonstração de ${trialDurationLabel(salesTrial.durationMinutes)}`
                    : "Escolher teste ou plano"}
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
