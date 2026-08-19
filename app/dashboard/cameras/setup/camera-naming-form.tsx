"use client";

import { useActionState, useState } from "react";
import { DiscoveryPanel } from "../discovery/discovery-panel";
import {
  saveDiscoveredCameraNamesAction,
  type CameraNamingState,
} from "./actions";
import { CameraSetupPreview } from "./camera-setup-preview";
import styles from "./setup.module.css";

export type NamingCamera = {
  id: string;
  name: string;
  status: string;
  streamLabel?: string | null;
};

type Props = {
  cameras: NamingCamera[];
  onboarding?: boolean;
  hasAgent?: boolean;
  defaultCameraCount?: number;
};

const initialState: CameraNamingState = { status: "idle" };

export function CameraNamingForm({
  cameras,
  onboarding = false,
  hasAgent = true,
  defaultCameraCount = 4,
}: Props) {
  const [state, formAction, pending] = useActionState(
    saveDiscoveredCameraNamesAction,
    initialState,
  );
  const [retryDiscovery, setRetryDiscovery] = useState(false);

  if (onboarding && retryDiscovery) {
    return (
      <div className={styles.retryPanel}>
        <div className={styles.retryHeading}>
          <div>
            <strong>Procurar outras câmeras</strong>
            <p>
              As que já foram conectadas permanecem salvas. Faça outra busca
              para encontrar as que faltaram.
            </p>
          </div>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setRetryDiscovery(false)}
          >
            Voltar aos nomes
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

  return (
    <form action={formAction} className={styles.form}>
      <input
        type="hidden"
        name="flow"
        value={onboarding ? "onboarding" : "camera_setup"}
      />

      {state.status === "error" ? (
        <div className={styles.error}>{state.message}</div>
      ) : null}

      <div className={styles.grid}>
        {cameras.map((camera, index) => (
          <article className={styles.card} key={camera.id}>
            <div className={styles.number}>{index + 1}</div>

            <CameraSetupPreview
              cameraId={camera.id}
              cameraName={camera.name || `Câmera ${index + 1}`}
            />

            <div className={styles.info}>
              <span>
                {camera.status === "online"
                  ? "CÂMERA CONECTADA"
                  : "CÂMERA ENCONTRADA"}
              </span>
              <strong>
                {camera.streamLabel || camera.name || `Câmera ${index + 1}`}
              </strong>
              <small>
                Olhe a imagem ao lado e use um nome fácil: Entrada, Caixa,
                Estoque, Corredor 1…
              </small>
            </div>

            <label>
              <span>Como deseja chamar esta câmera?</span>
              <input
                type="text"
                name={`camera_${camera.id}`}
                placeholder={
                  index === 0 ? "Ex.: Entrada da loja" : `Ex.: Câmera ${index + 1}`
                }
                minLength={2}
                maxLength={160}
                required
              />
            </label>
          </article>
        ))}
      </div>

      {onboarding ? (
        <div className={styles.onboardingNotice}>
          <div>
            <strong>Está faltando alguma câmera?</strong>
            <span>
              Procure novamente antes de salvar os nomes. As câmeras já
              conectadas não são apagadas.
            </span>
          </div>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setRetryDiscovery(true)}
          >
            Procurar outras câmeras
          </button>
        </div>
      ) : (
        <div className={styles.notice}>
          <strong>Nenhum plano foi ativado ainda.</strong>
          <span>
            Depois de salvar os nomes, você seguirá para a configuração da câmera.
          </span>
        </div>
      )}

      <button className={styles.primary} type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar nomes e continuar"}
      </button>
    </form>
  );
}
