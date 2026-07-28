"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type {
  CameraProfileSummary,
  CameraProfileWorkspace,
} from "@/src/lib/camera-profile-data";
import {
  analyzeCameraProfileAction,
  approveCameraProfileAction,
} from "../profile-actions";
import {
  initialCameraProfileActionState,
  type CameraProfileActionState,
} from "../profile-action-state";
import styles from "./camera-profile-panel.module.css";

type Props = {
  cameraId: string;
  cameraStatus: string;
  canManage: boolean;
  workspace: CameraProfileWorkspace;
};

const zoneLabels: Record<string, string> = {
  entry: "Entrada",
  exit: "Saída",
  service: "Atendimento",
  restricted: "Restrita",
  ignore: "Ignorar",
  general: "Geral",
};

const sceneLabels: Record<string, string> = {
  indoor: "Ambiente interno",
  outdoor: "Ambiente externo",
  mixed: "Ambiente misto",
  unknown: "Não determinado",
};

const qualityLabels: Record<string, string> = {
  good: "Boa",
  usable: "Utilizável",
  limited: "Limitada",
  poor: "Ruim",
};

function formatDate(value: string | null) {
  if (!value) return "não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function ActionMessage({ state }: { state: CameraProfileActionState }) {
  if (state.status === "idle" || !state.message) return null;

  return (
    <p
      className={
        state.status === "success"
          ? styles.successMessage
          : styles.errorMessage
      }
    >
      {state.message}
    </p>
  );
}

function ProfileDetails({ profile }: { profile: CameraProfileSummary }) {
  return (
    <div className={styles.profileDetails}>
      <div className={styles.descriptionBlock}>
        <span>DESCRIÇÃO DO AMBIENTE</span>
        <p>{profile.environmentDescription}</p>
      </div>

      <div className={styles.detailColumns}>
        <div>
          <span>OBJETIVOS DE MONITORAMENTO</span>
          <ul>
            {profile.monitoringGoals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
        </div>

        <div>
          <span>IGNORAR NAS ANÁLISES</span>
          {profile.ignoreInstructions.length ? (
            <ul>
              {profile.ignoreInstructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Nenhuma instrução adicional.</p>
          )}
        </div>
      </div>

      <div className={styles.detailColumns}>
        <div>
          <span>ELEMENTOS FIXOS</span>
          <ul>
            {profile.fixedElements.map((element) => (
              <li key={element}>{element}</li>
            ))}
          </ul>
        </div>

        <div>
          <span>PRIVACIDADE E LIMITES</span>
          <ul>
            {profile.privacyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.zoneList}>
        <span>ZONAS SUGERIDAS</span>
        <div>
          {profile.zones.map((zone) => (
            <article key={zone.id}>
              <strong>{zone.name}</strong>
              <small>{zoneLabels[zone.type] ?? zone.type}</small>
              <p>{zone.description}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CameraProfilePanel({
  cameraId,
  cameraStatus,
  canManage,
  workspace,
}: Props) {
  const router = useRouter();
  const [analysisState, analysisAction, analysisPending] = useActionState(
    analyzeCameraProfileAction,
    initialCameraProfileActionState,
  );
  const [approvalState, approvalAction, approvalPending] = useActionState(
    approveCameraProfileAction,
    initialCameraProfileActionState,
  );

  useEffect(() => {
    if (
      analysisState.status === "success" ||
      approvalState.status === "success"
    ) {
      router.refresh();
    }
  }, [
    analysisState.status,
    analysisState.profileId,
    approvalState.status,
    approvalState.profileId,
    router,
  ]);

  const profile = workspace.latestProfile;
  const hasDraft = Boolean(profile && !profile.isActive);
  const mayAnalyze =
    canManage && Boolean(workspace.frame) && cameraStatus === "online";

  return (
    <section className={styles.shell}>
      <div className={styles.heading}>
        <div>
          <span>INTELIGÊNCIA VISUAL · V0.6</span>
          <h2>Perfil inteligente da câmera</h2>
          <p>
            A IA usa o primeiro frame como referência estável. O resultado só
            entra em produção depois da sua aprovação.
          </p>
        </div>

        <div
          className={
            profile?.isActive
              ? styles.activeBadge
              : profile
                ? styles.reviewBadge
                : styles.emptyBadge
          }
        >
          {profile?.isActive
            ? `Ativo · v${profile.version}`
            : profile
              ? `Revisão · v${profile.version}`
              : "Ainda não analisado"}
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.previewColumn}>
          <div className={styles.preview}>
            {workspace.frame ? (
              <>
                <img
                  src={workspace.frame.url}
                  alt="Primeiro frame capturado pela câmera"
                />
                {profile?.zones.length ? (
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-label="Zonas sugeridas pela inteligência visual"
                  >
                    {profile.zones.map((zone, index) => (
                      <polygon
                        key={zone.id}
                        points={zone.polygon
                          .map((point) => `${point.x * 100},${point.y * 100}`)
                          .join(" ")}
                        data-zone={index + 1}
                      />
                    ))}
                  </svg>
                ) : null}
                <div className={styles.frameMeta}>
                  <span>
                    {workspace.frame.width ?? "?"} ×{" "}
                    {workspace.frame.height ?? "?"}
                  </span>
                  <span>{formatDate(workspace.frame.capturedAt)}</span>
                </div>
              </>
            ) : (
              <div className={styles.noFrame}>
                <strong>Primeiro frame indisponível</strong>
                <p>
                  Mantenha o Agent ligado para que uma imagem de referência seja
                  enviada.
                </p>
              </div>
            )}
          </div>

          {profile ? (
            <div className={styles.summaryBar}>
              <div>
                <span>CENA</span>
                <strong>
                  {sceneLabels[profile.sceneType] ?? profile.sceneType}
                </strong>
              </div>
              <div>
                <span>QUALIDADE</span>
                <strong>
                  {profile.imageQuality
                    ? qualityLabels[profile.imageQuality.overall] ??
                      profile.imageQuality.overall
                    : "Não informada"}
                </strong>
              </div>
              <div>
                <span>CONFIANÇA</span>
                <strong>
                  {profile.confidence === null
                    ? "—"
                    : `${Math.round(profile.confidence * 100)}%`}
                </strong>
              </div>
              <div>
                <span>HISTÓRICO</span>
                <strong>{workspace.historyCount} versão(ões)</strong>
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.contentColumn}>
          {profile ? (
            <ProfileDetails profile={profile} />
          ) : (
            <div className={styles.emptyProfile}>
              <span>PRIMEIRA ANÁLISE</span>
              <h3>Transforme o frame em contexto permanente</h3>
              <p>
                O GPT-5 mini descreverá o ambiente, apontará zonas úteis,
                sugerirá objetivos e registrará limitações de privacidade.
              </p>
              <ol>
                <li>O frame é lido do bucket privado.</li>
                <li>A resposta volta em formato estruturado.</li>
                <li>Você revisa antes de ativar.</li>
              </ol>
            </div>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <div>
          {!canManage ? (
            <p className={styles.permissionNote}>
              Somente proprietários e administradores podem gerar ou aprovar
              perfis.
            </p>
          ) : !workspace.frame ? (
            <p className={styles.permissionNote}>
              Aguardando um frame disponível.
            </p>
          ) : cameraStatus !== "online" ? (
            <p className={styles.permissionNote}>
              A câmera precisa estar online para iniciar uma nova análise.
            </p>
          ) : (
            <p className={styles.permissionNote}>
              Cada nova análise cria uma versão separada e registra o consumo.
            </p>
          )}

          <ActionMessage state={analysisState} />
          <ActionMessage state={approvalState} />
        </div>

        <div className={styles.actionButtons}>
          <form action={analysisAction}>
            <input type="hidden" name="camera_id" value={cameraId} />
            <button
              type="submit"
              className={styles.secondaryButton}
              disabled={!mayAnalyze || analysisPending || approvalPending}
            >
              {analysisPending
                ? "Analisando o frame..."
                : profile
                  ? "Gerar nova versão"
                  : "Analisar primeiro frame"}
            </button>
          </form>

          {hasDraft && profile ? (
            <form action={approvalAction}>
              <input type="hidden" name="camera_id" value={cameraId} />
              <input type="hidden" name="profile_id" value={profile.id} />
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!canManage || approvalPending || analysisPending}
              >
                {approvalPending ? "Ativando..." : "Aprovar perfil"}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}
