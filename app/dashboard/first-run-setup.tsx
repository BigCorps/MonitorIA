import Link from "next/link";
import type {
  SetupCameraSummary,
  SiteSummary,
} from "@/src/lib/dashboard-data";
import { CameraSetupForm } from "./cameras/camera-setup-form";
import { PairingCodeGenerator } from "./cameras/pairing-code-generator";
import { DashboardSidebar } from "./dashboard-sidebar";
import styles from "./overview.module.css";

type Props = {
  organizationName: string;
  userEmail: string | null;
  site: SiteSummary;
  cameras: SetupCameraSummary[];
  agentsOnline: number;
  message: string | null;
};

export function FirstRunSetup({
  organizationName,
  userEmail,
  site,
  cameras,
  agentsOnline,
  message,
}: Props) {
  const camera = cameras[0] ?? null;
  const cameraSaved = Boolean(camera);
  const codeAccepted = camera?.pairingStatus === "paired";
  const cameraOnline = camera?.status === "online";
  const progress = [true, cameraSaved, codeAccepted, cameraOnline];

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
            <h1>Vamos colocar sua primeira câmera para funcionar</h1>
            <p>
              Conclua os passos abaixo. O restante do painel aparecerá quando
              a primeira imagem chegar ao MonitorIA.
            </p>
          </div>
        </header>

        {message ? <div className="dashboard-message">{message}</div> : null}

        <section className={styles.firstRunCard}>
          <div className={styles.firstRunProgress}>
            {[
              ["Local salvo", site.name],
              ["Câmera salva", camera?.name ?? "Cadastre abaixo"],
              ["Código aceito", codeAccepted ? "Computador pareado" : "Pendente"],
              ["Imagem recebida", cameraOnline ? "Câmera online" : "Pendente"],
            ].map(([title, text], index) => (
              <article key={title} data-complete={progress[index]}>
                <span>{progress[index] ? "✓" : index + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </div>
              </article>
            ))}
          </div>

          {!camera ? (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>PASSO 2</span>
                <h2>Cadastre a primeira câmera</h2>
                <p>
                  O local já foi salvo. Informe somente os dados da câmera —
                  o usuário e a senha você preenche depois, aqui no painel.
                </p>
              </div>
              <CameraSetupForm sites={[site]} />
            </div>
          ) : cameraOnline ? null : (
            <div className={styles.firstRunBody}>
              <div className={styles.firstRunHeading}>
                <span>{codeAccepted ? "ÚLTIMO PASSO" : "PASSOS 3 E 4"}</span>
                <h2>
                  {codeAccepted
                    ? "O computador foi pareado. Aguarde a primeira imagem"
                    : "Baixe o MonitorIA e use o código no instalador"}
                </h2>
                <p>
                  {codeAccepted
                    ? "Não é necessário cadastrar a câmera novamente. Mantenha o computador ligado e clique em Procurar câmeras para encontrar o vídeo."
                    : "Faça tudo nesta ordem para o código não expirar durante o download."}
                </p>
              </div>

              <ol className={styles.firstRunInstructions}>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Baixe e abra o MonitorIA no computador da loja</strong>
                    <p>Confirme a solicitação de administrador do Windows.</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Quando o instalador pedir, gere o código abaixo</strong>
                    <p>Copie o código e cole no instalador. Ele vale 15 minutos.</p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Volte aqui e clique em "Procurar câmeras"</strong>
                    <p>
                      Você informa o usuário e a senha das câmeras nesta tela,
                      e acompanha a busca sem sair do painel.
                    </p>
                  </div>
                </li>
              </ol>

              <div className={styles.firstRunActions}>
                <a href="/api/installer/windows" className="panel-primary-action">
                  Baixar MonitorIA para Windows
                </a>
                <Link href="/dashboard" className="panel-secondary-action">
                  Atualizar situação
                </Link>
                {codeAccepted ? (
                  <Link
                    href={`/dashboard/cameras/${camera.id}`}
                    className="panel-secondary-action"
                  >
                    Usar outro computador
                  </Link>
                ) : null}
              </div>

              {!codeAccepted ? (
                <PairingCodeGenerator cameraId={camera.id} paired={false} />
              ) : (
                <div className="form-alert info">
                  Código aceito e computador {agentsOnline > 0 ? "online" : "ainda iniciando"}.
                  A tela será liberada assim que um quadro real da câmera for recebido.
                </div>
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
