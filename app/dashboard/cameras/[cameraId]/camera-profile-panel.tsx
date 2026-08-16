"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type {
  CameraProfileSummary,
  CameraProfileWorkspace,
  CameraProfileZoneSummary,
} from "@/src/lib/camera-profile-data";
import {
  analyzeCameraProfileAction,
  approveCameraProfileAction,
  saveCameraProfileDraftAction,
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

type EditableZone = {
  key: string;
  name: string;
  type: string;
  personRoleHint: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const zoneLabels: Record<string, string> = {
  entry: "Entrada",
  exit: "Saída",
  service: "Atendimento",
  restricted: "Restrita",
  ignore: "Ignorar",
  general: "Geral",
};

const roleLabels: Record<string, string> = {
  none: "Sem papel esperado",
  staff: "Funcionários",
  customer: "Clientes",
  delivery_person: "Entregadores",
  visitor: "Visitantes",
  shared: "Área compartilhada",
};

const operationalContextLabels: Record<string, string> = {
  commerce: "Comércio / atendimento",
  entrance: "Entrada / portaria",
  garage: "Garagem / estacionamento",
  street: "Rua / perímetro externo",
  corridor: "Corredor / escada / circulação",
  indoor: "Área interna",
  custom: "Personalizado",
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
  unknown: "Não informada",
};

function formatDate(value: string | null) {
  if (!value) return "não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function ActionMessage({
  state,
}: {
  state: CameraProfileActionState;
}) {
  if (
    state.status === "idle" ||
    !state.message
  ) {
    return null;
  }

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

function clamp(value: number) {
  return Math.max(
    0,
    Math.min(1, Number.isFinite(value) ? value : 0),
  );
}

function zoneToEditable(
  zone: CameraProfileZoneSummary,
  index: number,
): EditableZone {
  const xs = zone.polygon.map((point) => point.x);
  const ys = zone.polygon.map((point) => point.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, minX + 0.15);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, minY + 0.15);

  return {
    key: zone.id || `zone-${index}`,
    name: zone.name,
    type: zone.type,
    personRoleHint:
      zone.personRoleHint ?? "none",
    description: zone.description,
    x: clamp(minX),
    y: clamp(minY),
    width: Math.max(
      0.05,
      Math.min(1 - minX, maxX - minX),
    ),
    height: Math.max(
      0.05,
      Math.min(1 - minY, maxY - minY),
    ),
  };
}

function emptyZone(index: number): EditableZone {
  return {
    key: `new-${Date.now()}-${index}`,
    name: `Nova zona ${index + 1}`,
    type: "general",
    personRoleHint: "none",
    description: "",
    x: 0.1,
    y: 0.1,
    width: 0.3,
    height: 0.25,
  };
}

function rectanglePolygon(zone: EditableZone) {
  const x = Math.min(0.95, clamp(zone.x));
  const y = Math.min(0.95, clamp(zone.y));
  const right = clamp(
    Math.max(x + 0.03, x + zone.width),
  );
  const bottom = clamp(
    Math.max(y + 0.03, y + zone.height),
  );

  return [
    { x, y },
    { x: right, y },
    { x: right, y: bottom },
    { x, y: bottom },
  ];
}

function listText(values: string[]) {
  return values.join("\n");
}

function textList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ProfileDetails({
  profile,
}: {
  profile: CameraProfileSummary;
}) {
  return (
    <div className={styles.profileDetails}>
      <div className={styles.descriptionBlock}>
        <span>CONTEXTO OPERACIONAL</span>
        <p>
          {operationalContextLabels[
            profile.operationalContext
          ] ?? profile.operationalContext}
        </p>
      </div>

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
              {profile.ignoreInstructions.map(
                (instruction) => (
                  <li key={instruction}>
                    {instruction}
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className={styles.muted}>
              Nenhuma instrução adicional.
            </p>
          )}
        </div>
      </div>

      <div className={styles.zoneList}>
        <span>ZONAS CONFIGURADAS</span>
        <div>
          {profile.zones.map((zone) => (
            <article key={zone.id}>
              <strong>{zone.name}</strong>
              <div className={styles.zoneBadges}>
                <small>
                  {zoneLabels[zone.type] ?? zone.type}
                </small>
                <small data-role={zone.personRoleHint}>
                  {roleLabels[zone.personRoleHint] ??
                    zone.personRoleHint}
                </small>
              </div>
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
  const profile = workspace.latestProfile;
  const hasDraft = Boolean(
    profile && !profile.isActive,
  );

  const [analysisState, analysisAction, analysisPending] =
    useActionState(
      analyzeCameraProfileAction,
      initialCameraProfileActionState,
    );

  const [saveState, saveAction, savePending] =
    useActionState(
      saveCameraProfileDraftAction,
      initialCameraProfileActionState,
    );

  const [approvalState, approvalAction, approvalPending] =
    useActionState(
      approveCameraProfileAction,
      initialCameraProfileActionState,
    );

  const initialSourceId =
    profile?.sourceAssetId ??
    workspace.frame?.id ??
    workspace.referenceFrames[0]?.id ??
    "";

  const [selectedSourceId, setSelectedSourceId] =
    useState(initialSourceId);
  const [editing, setEditing] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [operationalContext, setOperationalContext] =
    useState<string>(
      profile?.operationalContext ?? "custom",
    );
  const [environmentDescription, setEnvironmentDescription] =
    useState(
      profile?.environmentDescription ?? "",
    );
  const [monitoringGoals, setMonitoringGoals] =
    useState(
      listText(profile?.monitoringGoals ?? []),
    );
  const [ignoreInstructions, setIgnoreInstructions] =
    useState(
      listText(profile?.ignoreInstructions ?? []),
    );
  const [zones, setZones] = useState<EditableZone[]>(
    (profile?.zones ?? []).map(zoneToEditable),
  );

  useEffect(() => {
    if (
      analysisState.status === "success" ||
      saveState.status === "success" ||
      approvalState.status === "success"
    ) {
      router.refresh();
    }
  }, [
    analysisState.status,
    analysisState.profileId,
    saveState.status,
    saveState.profileId,
    approvalState.status,
    approvalState.profileId,
    router,
  ]);

  useEffect(() => {
    if (!profile) return;

    setOperationalContext(
      profile.operationalContext,
    );
    setEnvironmentDescription(
      profile.environmentDescription,
    );
    setMonitoringGoals(
      listText(profile.monitoringGoals),
    );
    setIgnoreInstructions(
      listText(profile.ignoreInstructions),
    );
    setZones(
      profile.zones.map(zoneToEditable),
    );

    if (profile.sourceAssetId) {
      setSelectedSourceId(
        profile.sourceAssetId,
      );
    }
  }, [profile?.id]);

  const selectedFrame =
    workspace.referenceFrames.find(
      (frame) => frame.id === selectedSourceId,
    ) ??
    workspace.frame ??
    null;

  const profilePayload = useMemo(
    () =>
      JSON.stringify({
        operationalContext,
        environmentDescription,
        monitoringGoals:
          textList(monitoringGoals),
        ignoreInstructions:
          textList(ignoreInstructions),
        zones: zones.map((zone) => ({
          name: zone.name.trim(),
          type: zone.type,
          personRoleHint:
            zone.personRoleHint,
          description:
            zone.description.trim(),
          polygon: rectanglePolygon(zone),
        })),
        sceneType:
          profile?.sceneType === "indoor" ||
          profile?.sceneType === "outdoor" ||
          profile?.sceneType === "mixed"
            ? profile.sceneType
            : "unknown",
        fixedElements:
          profile?.fixedElements ?? [],
        privacyNotes:
          profile?.privacyNotes ?? [],
        imageQuality:
          profile?.imageQuality
            ? {
                overall: [
                  "good",
                  "usable",
                  "limited",
                  "poor",
                ].includes(
                  profile.imageQuality.overall,
                )
                  ? profile.imageQuality.overall
                  : "unknown",
                lighting:
                  profile.imageQuality.lighting,
                visibility:
                  profile.imageQuality.visibility,
                limitations:
                  profile.imageQuality.limitations,
              }
            : null,
        confidence:
          profile?.confidence ?? null,
        basedOnProfileId:
          profile?.id ?? null,
      }),
    [
      operationalContext,
      environmentDescription,
      monitoringGoals,
      ignoreInstructions,
      zones,
      profile,
    ],
  );

  const mayAnalyze =
    canManage && Boolean(selectedFrame);
  const maySave =
    canManage &&
    Boolean(selectedFrame) &&
    environmentDescription.trim().length >= 20 &&
    textList(monitoringGoals).length > 0 &&
    zones.length > 0;

  function updateZone(
    key: string,
    patch: Partial<EditableZone>,
  ) {
    setZones((current) =>
      current.map((zone) =>
        zone.key === key
          ? { ...zone, ...patch }
          : zone,
      ),
    );
  }

  return (
    <section className={styles.shell}>
      <div className={styles.heading}>
        <div>
          <span>PERFIL INTELIGENTE · V0.8.1</span>
          <h2>Contexto editável da câmera</h2>
          <p>
            Escolha a melhor imagem, oriente a IA e ajuste
            manualmente ambiente, objetivos e zonas. Cada
            mudança cria uma nova versão antes da aprovação.
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
            {selectedFrame ? (
              <>
                <img
                  src={selectedFrame.url}
                  alt="Imagem de referência selecionada"
                />

                {zones.length ? (
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-label="Zonas do perfil"
                  >
                    {zones.map((zone, index) => {
                      const polygon =
                        rectanglePolygon(zone);

                      return (
                        <g key={zone.key}>
                          <polygon
                            points={polygon
                              .map(
                                (point) =>
                                  `${point.x * 100},${point.y * 100}`,
                              )
                              .join(" ")}
                            data-zone={index + 1}
                            data-role={
                              zone.personRoleHint
                            }
                          />
                          <text
                            x={
                              (zone.x +
                                zone.width / 2) *
                              100
                            }
                            y={
                              (zone.y +
                                zone.height / 2) *
                              100
                            }
                            textAnchor="middle"
                          >
                            {index + 1}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                ) : null}

                <div className={styles.frameMeta}>
                  <span>
                    {selectedFrame.width ?? "?"} ×{" "}
                    {selectedFrame.height ?? "?"}
                  </span>
                  <span>
                    {formatDate(
                      selectedFrame.capturedAt,
                    )}
                  </span>
                </div>
              </>
            ) : (
              <div className={styles.noFrame}>
                <strong>
                  Nenhuma imagem disponível
                </strong>
                <p>
                  Aguarde o Agent formar um evento para que
                  novas imagens apareçam na galeria.
                </p>
              </div>
            )}
          </div>

          {workspace.referenceFrames.length ? (
            <div className={styles.frameGallery}>
              <div>
                <span>ESCOLHA A FOTO DE REFERÊNCIA</span>
                <small>
                  Frames do perfil e de eventos recentes
                </small>
              </div>

              <div className={styles.frameStrip}>
                {workspace.referenceFrames.map(
                  (frame) => (
                    <button
                      type="button"
                      key={frame.id}
                      className={
                        frame.id ===
                        selectedSourceId
                          ? styles.selectedFrame
                          : undefined
                      }
                      onClick={() =>
                        setSelectedSourceId(
                          frame.id,
                        )
                      }
                    >
                      <img src={frame.url} alt="" />
                      <span>
                        {formatDate(
                          frame.capturedAt,
                        )}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {profile ? (
            <div className={styles.summaryBar}>
              <div>
                <span>CENA</span>
                <strong>
                  {sceneLabels[
                    profile.sceneType
                  ] ?? profile.sceneType}
                </strong>
              </div>
              <div>
                <span>QUALIDADE</span>
                <strong>
                  {profile.imageQuality
                    ? qualityLabels[
                        profile.imageQuality
                          .overall
                      ] ??
                      profile.imageQuality
                        .overall
                    : "Não informada"}
                </strong>
              </div>
              <div>
                <span>CONFIANÇA</span>
                <strong>
                  {profile.confidence === null
                    ? "—"
                    : `${Math.round(
                        profile.confidence * 100,
                      )}%`}
                </strong>
              </div>
              <div>
                <span>HISTÓRICO</span>
                <strong>
                  {workspace.historyCount} versão(ões)
                </strong>
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.contentColumn}>
          {editing ? (
            <div className={styles.editor}>
              <div className={styles.editorHeading}>
                <div>
                  <span>EDIÇÃO MANUAL</span>
                  <h3>
                    Ajuste o perfil ao funcionamento real
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                >
                  Fechar edição
                </button>
              </div>

              <label>
                <span>Contexto operacional</span>
                <select
                  value={operationalContext}
                  onChange={(event) =>
                    setOperationalContext(
                      event.target.value,
                    )
                  }
                >
                  {Object.entries(
                    operationalContextLabels,
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Descrição do ambiente</span>
                <textarea
                  value={environmentDescription}
                  onChange={(event) =>
                    setEnvironmentDescription(
                      event.target.value,
                    )
                  }
                  rows={6}
                />
              </label>

              <div className={styles.editorColumns}>
                <label>
                  <span>
                    Objetivos — um por linha
                  </span>
                  <textarea
                    value={monitoringGoals}
                    onChange={(event) =>
                      setMonitoringGoals(
                        event.target.value,
                      )
                    }
                    rows={7}
                  />
                </label>

                <label>
                  <span>
                    Ignorar — um por linha
                  </span>
                  <textarea
                    value={ignoreInstructions}
                    onChange={(event) =>
                      setIgnoreInstructions(
                        event.target.value,
                      )
                    }
                    rows={7}
                  />
                </label>
              </div>

              <div className={styles.zoneEditor}>
                <div className={styles.zoneEditorHeading}>
                  <div>
                    <span>ZONAS E PAPÉIS</span>
                    <p>
                      Delimite as áreas que realmente têm
                      função diferente nesta câmera, como
                      rua, acesso, garagem, circulação,
                      atendimento ou área restrita.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setZones((current) => [
                        ...current,
                        emptyZone(current.length),
                      ])
                    }
                  >
                    Adicionar zona
                  </button>
                </div>

                <div className={styles.zoneEditorList}>
                  {zones.map((zone, index) => (
                    <article key={zone.key}>
                      <header>
                        <strong>
                          Zona {index + 1}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            setZones((current) =>
                              current.filter(
                                (item) =>
                                  item.key !==
                                  zone.key,
                              ),
                            )
                          }
                        >
                          Remover
                        </button>
                      </header>

                      <div className={styles.zoneFields}>
                        <label>
                          <span>Nome</span>
                          <input
                            value={zone.name}
                            onChange={(event) =>
                              updateZone(
                                zone.key,
                                {
                                  name:
                                    event.target
                                      .value,
                                },
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>Tipo</span>
                          <select
                            value={zone.type}
                            onChange={(event) =>
                              updateZone(
                                zone.key,
                                {
                                  type:
                                    event.target
                                      .value,
                                },
                              )
                            }
                          >
                            {Object.entries(
                              zoneLabels,
                            ).map(
                              ([value, label]) => (
                                <option
                                  key={value}
                                  value={value}
                                >
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>

                        <label>
                          <span>
                            Quem normalmente fica aqui?
                          </span>
                          <select
                            value={
                              zone.personRoleHint
                            }
                            onChange={(event) =>
                              updateZone(
                                zone.key,
                                {
                                  personRoleHint:
                                    event.target
                                      .value,
                                },
                              )
                            }
                          >
                            {Object.entries(
                              roleLabels,
                            ).map(
                              ([value, label]) => (
                                <option
                                  key={value}
                                  value={value}
                                >
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>

                      <label>
                        <span>Descrição</span>
                        <textarea
                          value={zone.description}
                          onChange={(event) =>
                            updateZone(zone.key, {
                              description:
                                event.target.value,
                            })
                          }
                          rows={2}
                        />
                      </label>

                      <div className={styles.sliders}>
                        {[
                          ["x", "Esquerda"],
                          ["y", "Topo"],
                          ["width", "Largura"],
                          ["height", "Altura"],
                        ].map(([field, label]) => (
                          <label key={field}>
                            <span>
                              {label}:{" "}
                              {Math.round(
                                zone[
                                  field as
                                    | "x"
                                    | "y"
                                    | "width"
                                    | "height"
                                ] * 100,
                              )}
                              %
                            </span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={Math.round(
                                zone[
                                  field as
                                    | "x"
                                    | "y"
                                    | "width"
                                    | "height"
                                ] * 100,
                              )}
                              onChange={(event) => {
                                const value =
                                  Number(
                                    event.target
                                      .value,
                                  ) / 100;

                                updateZone(
                                  zone.key,
                                  {
                                    [field]:
                                      value,
                                  } as Partial<EditableZone>,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <form action={saveAction}>
                <input
                  type="hidden"
                  name="camera_id"
                  value={cameraId}
                />
                <input
                  type="hidden"
                  name="source_asset_id"
                  value={selectedSourceId}
                />
                <input
                  type="hidden"
                  name="profile_payload"
                  value={profilePayload}
                />
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={
                    !maySave ||
                    savePending ||
                    analysisPending ||
                    approvalPending
                  }
                >
                  {savePending
                    ? "Salvando nova versão..."
                    : "Salvar como nova versão"}
                </button>
              </form>

              <ActionMessage state={saveState} />
            </div>
          ) : profile ? (
            <ProfileDetails profile={profile} />
          ) : (
            <div className={styles.emptyProfile}>
              <span>PRIMEIRA ANÁLISE</span>
              <h3>
                Escolha uma foto representativa
              </h3>
              <p>
                Prefira um frame que represente a função
                real da câmera: acesso, rua, garagem,
                corredor, área interna ou atendimento.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.aiGuidance}>
        <div>
          <span>NOVA ANÁLISE COM ORIENTAÇÃO</span>
          <h3>
            Explique o funcionamento do ambiente
          </h3>
          <p>
            Exemplo: “A rua fica na parte superior; carros
            que apenas passam devem ser ignorados. O portão
            e a rampa abaixo são a entrada da garagem.”
          </p>
        </div>

        <form action={analysisAction}>
          <input
            type="hidden"
            name="camera_id"
            value={cameraId}
          />
          <input
            type="hidden"
            name="source_asset_id"
            value={selectedSourceId}
          />
          <textarea
            name="user_guidance"
            value={guidance}
            onChange={(event) =>
              setGuidance(event.target.value)
            }
            maxLength={2000}
            placeholder="Descreva o que esta câmera realmente monitora, quais áreas são importantes, o que é movimento normal e o que deve ser ignorado."
          />
          <button
            type="submit"
            className={styles.secondaryButton}
            disabled={
              !mayAnalyze ||
              analysisPending ||
              savePending ||
              approvalPending
            }
          >
            {analysisPending
              ? "Analisando a foto..."
              : "Gerar nova análise com esta foto"}
          </button>
        </form>
      </div>

      <div className={styles.actions}>
        <div>
          <p className={styles.permissionNote}>
            Status da câmera: {cameraStatus}. A análise
            pode usar qualquer imagem ainda disponível na
            galeria; o Agent não precisa ser reiniciado.
          </p>
          <ActionMessage state={analysisState} />
          <ActionMessage state={approvalState} />
        </div>

        <div className={styles.actionButtons}>
          {profile ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() =>
                setEditing((current) => !current)
              }
              disabled={!canManage}
            >
              {editing
                ? "Voltar à visualização"
                : "Editar análise e zonas"}
            </button>
          ) : null}

          {hasDraft && profile ? (
            <form action={approvalAction}>
              <input
                type="hidden"
                name="camera_id"
                value={cameraId}
              />
              <input
                type="hidden"
                name="profile_id"
                value={profile.id}
              />
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={
                  !canManage ||
                  approvalPending ||
                  analysisPending ||
                  savePending
                }
              >
                {approvalPending
                  ? "Ativando..."
                  : "Aprovar esta versão"}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}
