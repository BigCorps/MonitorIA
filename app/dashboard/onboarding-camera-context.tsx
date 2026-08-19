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

function elapsedSince(value: string) {
  const started = new Date(value).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

function waitingText(elapsed: number, agentConnected: boolean) {
  if (!agentConnected) {
    return {
      title: "O computador da loja não está conectado",
      text:
        "A primeira imagem depende do Agent. Reconecte o computador e esta tela continuará verificando automaticamente.",
      slow: true,
    };
  }

  if (elapsed < 60) {
    return {
      title: "Aguardando a primeira imagem",
      text:
        "A câmera já foi encontrada. Agora aguardamos o primeiro JPEG enviado pelo Agent, sem análise de IA.",
      slow: false,
    };
  }

  if (elapsed < 5 * 60) {
    return {
      title: "A primeira imagem pode levar alguns minutos",
      text:
        "O Agent 1.0.0 verifica as câmeras periodicamente. Não é processamento de IA: assim que o primeiro frame chegar, o nome e o contexto aparecem aqui automaticamente.",
      slow: false,
    };
  }

  return {
    title: "Está levando mais do que o esperado",
    text:
      "Continuamos verificando automaticamente. Se a câmera tiver sido reiniciada ou mudado de rede, você também pode procurar novamente sem apagar as que já foram cadastradas.",
    slow: true,
  };
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
  const [elapsed, setElapsed] = useState(() => elapsedSince(camera.createdAt));
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [nameState, nameAction, namePending] = useActionState(
    saveOnboardingCameraNameAction,
    initialNameState,
  );

  const frame = workspace.frame ?? workspace.referenceFrames[0] ?? null;
  const hasFrame = Boolean(frame);
  const profileReady = Boolean(workspace.latestProfile?.isActive);
  const named = Boolean(camera.setupNamedAt);

  useEffect(() => {
    if (profileReady) {
      const timer = window.setTimeout(() => {
        router.refresh();
      }, 900);
      return () => window.clearTimeout(timer);
    }

    if (hasFrame) return;

    const clock = window.setInterval(() => {
      setElapsed(elapsedSince(camera.createdAt));
    }, 1_000);

    const polling = window.setInterval(() => {
      router.refresh();
    }, 5_000);

    return () => {
      window.clearInterval(clock);
      window.clearInterval(polling);
    };
  }, [camera.createdAt, hasFrame, profileReady, router]);

  useEffect(() => {
    if (nameState.status === "success") {
      const timer = window.setTimeout(() => router.refresh(), 500);
      return () => window.clearTimeout(timer);
    }
  }, [nameState.status, router]);

  const wait = useMemo(
    () => waitingText(elapsed, hasAgent),
    [elapsed, hasAgent],
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

  if (profileReady) {
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

  if (!hasFrame) {
    return (
      <div className={styles.shell}>
        <div className={styles.cameraProgress}>
          <div>
            <strong>Preparando {camera.name}</strong>
            <span>
              Primeiro recebemos uma imagem real; depois você dá o nome e configura o contexto.
            </span>
          </div>
          <span className={styles.cameraCount}>
            {cameraIndex} de {cameraTotal}
          </span>
        </div>

        <section className={styles.waitingCard}>
          {wait.slow ? (
            <div className={styles.warningIcon} aria-hidden="true">!</div>
          ) : (
            <div className={styles.spinner} aria-hidden="true" />
          )}

          <div className={styles.waitingCopy}>
            <span>PRIMEIRA IMAGEM</span>
            <h3>{wait.title}</h3>
            <p>{wait.text}</p>
            <small>
              Esta tela verifica o servidor a cada 5 segundos. Quando o primeiro
              snapshot chegar, a imagem e o campo de nome aparecem automaticamente.
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
                Use a imagem para escolher um nome fácil de reconhecer no dia a dia.
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

  return (
    <div className={styles.shell}>
      <div className={styles.cameraProgress}>
        <div>
          <strong>Configure o contexto de {camera.name}</strong>
          <span>
            Todas as funções atuais de análise, zonas, edição manual e aprovação continuam disponíveis abaixo.
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
