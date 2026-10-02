"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CameraProfileWorkspace } from "@/src/lib/camera-profile-data";
import {
  analyzeCameraProfileAction,
  approveCameraProfileAction,
} from "./profile-actions";
import {
  initialCameraProfileActionState,
} from "./profile-action-state";
import { CameraProfilePanel } from "./[cameraId]/camera-profile-panel";
import styles from "./guided-camera-profile.module.css";

export function GuidedCameraProfile({
  cameraId,
  cameraName,
  cameraStatus,
  canManage,
  workspace,
}: {
  cameraId: string;
  cameraName: string;
  cameraStatus: string;
  canManage: boolean;
  workspace: CameraProfileWorkspace;
}) {
  const router = useRouter();
  const frame = workspace.frame ?? workspace.referenceFrames[0] ?? null;
  const profile = workspace.latestProfile;
  const [analysisState, analysisAction, analysisPending] = useActionState(
    analyzeCameraProfileAction,
    initialCameraProfileActionState,
  );
  const [approvalState, approvalAction, approvalPending] = useActionState(
    approveCameraProfileAction,
    initialCameraProfileActionState,
  );
  const analysisFormRef = useRef<HTMLFormElement>(null);
  const [autoRequested, setAutoRequested] = useState(false);

  useEffect(() => {
    if (
      autoRequested ||
      !canManage ||
      !frame ||
      profile ||
      analysisPending ||
      analysisState.status === "error"
    ) {
      return;
    }

    setAutoRequested(true);
    const timer = window.setTimeout(() => {
      analysisFormRef.current?.requestSubmit();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    analysisPending,
    analysisState.status,
    autoRequested,
    canManage,
    frame,
    profile,
  ]);

  useEffect(() => {
    if (
      analysisState.status !== "success" &&
      approvalState.status !== "success"
    ) {
      return;
    }

    const timer = window.setTimeout(() => router.refresh(), 350);
    return () => window.clearTimeout(timer);
  }, [
    analysisState.status,
    analysisState.profileId,
    approvalState.status,
    approvalState.profileId,
    router,
  ]);

  if (!frame) {
    return (
      <section className={styles.card}>
        <span className={styles.kicker}>PERFIL INTELIGENTE</span>
        <h3>Aguardando uma imagem real da câmera</h3>
        <p>
          Assim que a primeira imagem chegar, o MonitorIA prepara uma sugestão
          de perfil automaticamente. Você não precisa procurar outra tela.
        </p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className={styles.card}>
        <div className={styles.previewGrid}>
          <div className={styles.preview}>
            <img src={frame.url} alt={`Imagem real de ${cameraName}`} />
            <span>Imagem recebida ✓</span>
          </div>

          <div className={styles.copy}>
            <span className={styles.kicker}>PERFIL INTELIGENTE</span>
            <h3>
              {analysisPending || autoRequested
                ? "Criando o perfil inteligente…"
                : "Vamos preparar o perfil desta câmera"}
            </h3>
            <p>
              O MonitorIA usa esta imagem para sugerir o ambiente, os objetivos
              e as áreas importantes. Depois você só aprova ou edita.
            </p>

            <form ref={analysisFormRef} action={analysisAction}>
              <input type="hidden" name="camera_id" value={cameraId} />
              <input type="hidden" name="source_asset_id" value={frame.id} />
              <input type="hidden" name="user_guidance" value="" />
              <button
                type="submit"
                className={styles.primary}
                disabled={!canManage || analysisPending}
              >
                {analysisPending ? "Analisando a imagem…" : "Criar perfil agora"}
              </button>
            </form>

            {analysisPending || (autoRequested && analysisState.status === "idle") ? (
              <div className={styles.progress} role="status" aria-live="polite">
                <i />
                <span>Identificando ambiente, objetivos e zonas…</span>
              </div>
            ) : null}

            {analysisState.status === "error" ? (
              <div className={styles.error}>
                <strong>Não conseguimos gerar a sugestão agora.</strong>
                <span>{analysisState.message}</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (profile.isActive) {
    return (
      <section className={`${styles.card} ${styles.successCard}`}>
        <span className={styles.kicker}>MONITORAMENTO</span>
        <h3>Perfil inteligente aprovado ✓</h3>
        <p>
          O contexto desta câmera está ativo. O MonitorIA usa esta versão na
          configuração enviada ao computador responsável.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.reviewGrid}>
        <div className={styles.preview}>
          <img src={frame.url} alt={`Imagem real de ${cameraName}`} />
          <span>Sugestão pronta</span>
        </div>

        <div className={styles.copy}>
          <span className={styles.kicker}>SUGESTÃO DA MONITORIA</span>
          <h3>Confira e comece a monitorar</h3>
          <p className={styles.environment}>{profile.environmentDescription}</p>

          <div className={styles.suggestionFacts}>
            <div>
              <strong>{profile.monitoringGoals.length}</strong>
              <span>objetivo(s) sugerido(s)</span>
            </div>
            <div>
              <strong>{profile.zones.length}</strong>
              <span>zona(s) detectada(s)</span>
            </div>
            <div>
              <strong>v{profile.version}</strong>
              <span>versão preparada</span>
            </div>
          </div>

          {profile.monitoringGoals.length ? (
            <ul className={styles.goals}>
              {profile.monitoringGoals.slice(0, 4).map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          ) : null}

          <form action={approvalAction}>
            <input type="hidden" name="camera_id" value={cameraId} />
            <input type="hidden" name="profile_id" value={profile.id} />
            <button
              type="submit"
              className={styles.primary}
              disabled={!canManage || approvalPending}
            >
              {approvalPending
                ? "Ativando monitoramento…"
                : "Aprovar e iniciar monitoramento"}
            </button>
          </form>

          {approvalState.status === "error" ? (
            <div className={styles.error}>
              <strong>Não foi possível ativar.</strong>
              <span>{approvalState.message}</span>
            </div>
          ) : null}

          <details className={styles.advanced}>
            <summary>Editar configuração avançada</summary>
            <p>
              Zonas, objetivos, instruções para ignorar e outros ajustes ficam
              aqui. Eles não são necessários para aprovar a sugestão inicial.
            </p>
            <CameraProfilePanel
              cameraId={cameraId}
              cameraStatus={cameraStatus}
              canManage={canManage}
              workspace={workspace}
            />
          </details>
        </div>
      </div>
    </section>
  );
}
