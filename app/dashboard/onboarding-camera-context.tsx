"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { CameraProfileWorkspace } from "@/src/lib/camera-profile-data";
import { CameraProfilePanel } from "./cameras/[cameraId]/camera-profile-panel";
import { DiscoveryPanel } from "./cameras/discovery/discovery-panel";
import {
  saveOnboardingCameraNameAction,
  type OnboardingCameraNameState,
} from "./onboarding-camera-context-actions";
import styles from "./onboarding-camera-context.module.css";

type Props = {
  camera: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
    setupNamedAt: string | null;
  };
  workspace: CameraProfileWorkspace;
  canManage: boolean;
  cameraIndex: number;
  cameraTotal: number;
  hasAgent: boolean;
  defaultCameraCount: number;
};

const initialNameState: OnboardingCameraNameState = {
  status: "idle",
};

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function waitState(seconds: number, agentConnected: boolean) {
  if (!agentConnected) {
    return {
      title: "O computador da loja não está conectado",
      text:
        "A primeira imagem depende do Agent. Reconecte o computador e esta tela continuará verificando automaticamente.",
      label: "Aguardando o Agent reconectar",
      warning: true,
    };
  }

  if (seconds < 60) {
    return {
      title: "Preparando a primeira imagem",
      text:
        "A câmera já foi encontrada. O MonitorIA está aguardando o primeiro snapshot enviado pelo Agent, sem processamento de IA.",
      label: "Câmera conectada · aguardando primeiro snapshot",
      warning: false,
    };
  }

  if (seconds < 3 * 60) {
    return {
      title: "Aguardando o primeiro ciclo de captura",
      text:
        "Com o Agent 1.0.0, a primeira imagem normalmente aparece entre 3 e 5 minutos. Você pode deixar esta tela aberta; ela atualiza sozinha.",
      label: "Agent ativo · verificando a chegada da imagem",
      warning: false,
    };
  }

  if (seconds <= 5 * 60) {
    return {
      title: "A imagem deve chegar em breve",
      text:
        "Estamos dentro do tempo normal de 3 a 5 minutos observado no Agent 1.0.0. A página continua consultando o servidor automaticamente.",
      label: "Recebimento em andamento · atualização automática",
      warning: false,
    };
  }

  return {
    title: "Está levando mais do que o normal",
    text:
      "Já passaram mais de 5 minutos nesta tela. Continuamos verificando, mas você também pode conferir a câmera ou executar uma nova busca sem apagar as já cadastradas.",
    label: "Continuamos verificando em segundo plano",
    warning: true,
  };
}

function profileWasCreatedAfterName(
  workspace: CameraProfileWorkspace,
  setupNamedAt: string | null,
) {
  if (!setupNamedAt || !workspace.latestProfile?.isActive) return false;

  const namedAt = Date.parse(setupNamedAt);
  const profileCreatedAt = Date.parse(workspace.latestProfile.createdAt);

  return (
    Number.isFinite(namedAt) &&
    Number.isFinite(profileCreatedAt) &&
    profileCreatedAt >= namedAt
  );
}

export function OnboardingCameraContext({
  camera,
  workspace,
  canManage,
  cameraIndex,
  cameraTotal,
  hasAgent,
  defaultCameraCount,
}: Props) {
  const router = useRouter();
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [nameState, nameAction, namePending] = useActionState(
    saveOnboardingCameraNameAction,
    initialNameState,
  );

  const frame = workspace.frame ?? workspace.referenceFrames[0] ?? null;
  const hasFrame = Boolean(frame);
  const named = Boolean(camera.setupNamedAt);
  const profileReadyForCurrentName = profileWasCreatedAfterName(
    workspace,
    camera.setupNamedAt,
  );

  useEffect(() => {
    if (profileReadyForCurrentName) {
      const timer = window.setTimeout(() => {
        router.refresh();
      }, 900);
      return () => window.clearTimeout(timer);
    }

    if (hasFrame) return;

    const clock = window.setInterval(() => {
      setWaitSeconds((value) => value + 1);
    }, 1_000);

    const polling = window.setInterval(() => {
      router.refresh();
    }, 5_000);

    return () => {
      window.clearInterval(clock);
      window.clearInterval(polling);
    };
  }, [hasFrame, profileReadyForCurrentName, router]);

  useEffect(() => {
    if (nameState.status === "success") {
      const timer = window.setTimeout(() => router.refresh(), 500);
      return () => window.clearTimeout(timer);
    }
  }, [nameState.status, router]);

  const wait = useMemo(
    () => waitState(waitSeconds, hasAgent),
    [waitSeconds, hasAgent],
  );

  const visualProgress = Math.min(
    94,
    Math.max(8, Math.round((waitSeconds / (5 * 60)) * 92)),
  );

  if (showDiscovery) {
    return (
      <div className={styles.discoveryWrap}>
        <div className={styles.discoveryHeading}>
          <div>
            <strong>Procurar câmeras novamente</strong>
            <span>
              As câmeras já cadastradas permanecem salvas. Use isto para encontrar
              uma câmera que reiniciou, mudou de IP ou não apareceu na busca anterior.
            </span>
          </div>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setShowDiscovery(false)}
          >
            Voltar ao contexto
          </button>
        </div>

        <DiscoveryPanel
          onboarding
          hasAgent={hasAgent}
          defaultCameraCount={defaultCameraCount}
        />
      </div>
    );
  }

  if (!hasFrame) {
    return (
      <div className={styles.shell}>
        <div className={styles.cameraProgress}>
          <div>
            <strong>Preparando {camera.name}</strong>
            <span>
              Primeiro recebemos uma imagem real; depois você identifica a câmera
              e configura o contexto.
            </span>
          </div>
          <span className={styles.cameraCount}>
            {cameraIndex} de {cameraTotal}
          </span>
        </div>

        <section className={styles.waitingCard}>
          {wait.warning ? (
            <div className={styles.warningIcon} aria-hidden="true">!</div>
          ) : (
            <div className={styles.spinner} aria-hidden="true" />
          )}

          <div className={styles.waitingCopy}>
            <span>PRIMEIRA IMAGEM</span>
            <h3>{wait.title}</h3>
            <p>{wait.text}</p>
          </div>

          <div className={styles.loadingPanel}>
            <div className={styles.loadingTopline}>
              <strong>{wait.label}</strong>
              <span>{formatElapsed(waitSeconds)}</span>
            </div>
            <div
              className={styles.loadingTrack}
              role="progressbar"
              aria-label="Aguardando primeira imagem"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={visualProgress}
            >
              <span style={{ width: `${visualProgress}%` }} />
            </div>
            <div className={styles.loadingSteps}>
              <span data-active="true">Câmera encontrada</span>
              <span data-active={hasAgent}>Agent conectado</span>
              <span data-active="true">Aguardando snapshot</span>
              <span>Imagem recebida</span>
            </div>
            <small>
              Tempo normal observado: <strong>3 a 5 minutos</strong>. Esta tela
              consulta o servidor a cada 5 segundos; não é necessário recarregar.
            </small>
          </div>

          <div className={styles.waitingActions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => router.refresh()}
            >
              Verificar agora
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setShowDiscovery(true)}
            >
              Procurar câmeras novamente
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!named) {
    return (
      <div className={styles.shell}>
        <div className={styles.cameraProgress}>
          <div>
            <strong>Imagem recebida</strong>
            <span>Agora identifique esta câmera antes de configurar o contexto.</span>
          </div>
          <span className={styles.cameraCount}>
            {cameraIndex} de {cameraTotal}
          </span>
        </div>

        <section className={styles.nameCard}>
          <div className={styles.preview}>
            <img src={frame?.url} alt={`Imagem captada por ${camera.name}`} />
            <span>Imagem real captada</span>
          </div>

          <form action={nameAction} className={styles.nameForm}>
            <input type="hidden" name="camera_id" value={camera.id} />
            <div>
              <h3>Como deseja chamar esta câmera?</h3>
              <p>
                Use a imagem ao lado para saber exatamente qual câmera está
                configurando e escolha um nome fácil de reconhecer.
              </p>
            </div>

            {nameState.status === "error" ? (
              <p className={styles.error}>{nameState.message}</p>
            ) : null}
            {nameState.status === "success" ? (
              <p className={styles.success}>{nameState.message}</p>
            ) : null}

            <label>
              Nome da câmera
              <input
                type="text"
                name="camera_name"
                defaultValue=""
                placeholder="Ex.: Entrada da loja"
                minLength={2}
                maxLength={160}
                required
                autoFocus
              />
            </label>

            <button type="submit" className={styles.primary} disabled={namePending}>
              {namePending ? "Salvando…" : "Salvar nome e configurar contexto"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  if (profileReadyForCurrentName) {
    return (
      <div className={styles.shell}>
        <div className={styles.cameraProgress}>
          <div>
            <strong>{camera.name} concluída</strong>
            <span>Nome e contexto aprovados.</span>
          </div>
          <span className={styles.cameraCount}>
            {cameraIndex} de {cameraTotal}
          </span>
        </div>

        <div className={styles.contextReady} role="status">
          <div>
            <strong>Contexto configurado</strong>
            <span>
              {cameraIndex < cameraTotal
                ? "Abrindo a próxima câmera do onboarding…"
                : "Todas as câmeras estão prontas. Indo para a etapa Ativar…"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.cameraProgress}>
        <div>
          <strong>Configure o contexto de {camera.name}</strong>
          <span>
            Todas as funções atuais de análise, zonas, edição manual e aprovação
            continuam disponíveis abaixo.
          </span>
        </div>
        <span className={styles.cameraCount}>
          {cameraIndex} de {cameraTotal}
        </span>
      </div>

      <div className={styles.readyActions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setShowDiscovery(true)}
        >
          Procurar outras câmeras
        </button>
      </div>

      <CameraProfilePanel
        cameraId={camera.id}
        cameraStatus={camera.status}
        canManage={canManage}
        workspace={workspace}
      />
    </div>
  );
}
