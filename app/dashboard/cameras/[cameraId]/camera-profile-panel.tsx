"use client";

import {
  type PointerEvent as ReactPointerEvent,
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

type Point = {
  x: number;
  y: number;
};

type EditableZone = {
  key: string;
  name: string;
  type: string;
  personRoleHint: string;
  description: string;
  polygon: Point[];
};

type DrawingState = {
  replaceZoneKey: string | null;
  points: Point[];
} | null;

type DraggingVertex = {
  zoneKey: string;
  pointIndex: number;
} | null;

const zoneLabels: Record<string, string> = {
  entry: "Entrada",
  exit: "Saída",
  service: "Atendimento / operação",
  restricted: "Restrita",
  ignore: "Ignorar",
  general: "Geral",
};

const zoneBehaviorLabels: Record<string, string> = {
  general: "IA interpreta pela descrição",
  entry: "Entrada",
  exit: "Saída",
  ignore: "Ignorar esta área",
  restricted: "Área restrita",
  service: "Atendimento / operação",
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
  if (state.status === "idle" || !state.message) {
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

function sanitizePolygon(polygon: Point[]): Point[] {
  return polygon
    .filter(
      (point) =>
        Number.isFinite(point.x) && Number.isFinite(point.y),
    )
    .slice(0, 50)
    .map((point) => ({
      x: clamp(point.x),
      y: clamp(point.y),
    }));
}

function zoneToEditable(
  zone: CameraProfileZoneSummary,
  index: number,
): EditableZone {
  return {
    key: zone.id || `zone-${index}`,
    name: zone.name,
    type: zone.type,
    personRoleHint: zone.personRoleHint ?? "none",
    description: zone.description,
    polygon: sanitizePolygon(zone.polygon),
  };
}

function centroid(polygon: Point[]) {
  if (!polygon.length) return { x: 0.5, y: 0.5 };

  const total = polygon.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / polygon.length,
    y: total.y / polygon.length,
  };
}

function polygonPoints(polygon: Point[]) {
  return polygon
    .map((point) => `${point.x * 100},${point.y * 100}`)
    .join(" ");
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

function pointFromPointer(
  event: ReactPointerEvent<SVGSVGElement>,
): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width),
    y: clamp((event.clientY - rect.top) / rect.height),
  };
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
          {operationalContextLabels[profile.operationalContext] ??
            profile.operationalContext}
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
              {profile.ignoreInstructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
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
          {profile.zones.map((zone, index) => (
            <article key={zone.id}>
              <strong>
                {index + 1}. {zone.name}
              </strong>
              <div className={styles.zoneBadges}>
                <small>{zoneLabels[zone.type] ?? zone.type}</small>
                <small data-role={zone.personRoleHint}>
                  {roleLabels[zone.personRoleHint] ?? zone.personRoleHint}
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
  const hasDraft = Boolean(profile && !profile.isActive);

  const [analysisState, analysisAction, analysisPending] =
    useActionState(
      analyzeCameraProfileAction,
      initialCameraProfileActionState,
    );
  const [saveState, saveAction, savePending] = useActionState(
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
    useState<string>(profile?.operationalContext ?? "custom");
  const [environmentDescription, setEnvironmentDescription] =
    useState(profile?.environmentDescription ?? "");
  const [monitoringGoals, setMonitoringGoals] = useState(
    listText(profile?.monitoringGoals ?? []),
  );
  const [ignoreInstructions, setIgnoreInstructions] = useState(
    listText(profile?.ignoreInstructions ?? []),
  );
  const [zones, setZones] = useState<EditableZone[]>(
    (profile?.zones ?? []).map(zoneToEditable),
  );
  const [selectedZoneKey, setSelectedZoneKey] = useState<
    string | null
  >(profile?.zones[0]?.id ?? null);
  const [drawing, setDrawing] = useState<DrawingState>(null);
  const [draggingVertex, setDraggingVertex] =
    useState<DraggingVertex>(null);

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

    setOperationalContext(profile.operationalContext);
    setEnvironmentDescription(profile.environmentDescription);
    setMonitoringGoals(listText(profile.monitoringGoals));
    setIgnoreInstructions(listText(profile.ignoreInstructions));

    const nextZones = profile.zones.map(zoneToEditable);
    setZones(nextZones);
    setSelectedZoneKey(nextZones[0]?.key ?? null);
    setDrawing(null);
    setDraggingVertex(null);

    if (profile.sourceAssetId) {
      setSelectedSourceId(profile.sourceAssetId);
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
        monitoringGoals: textList(monitoringGoals),
        ignoreInstructions: textList(ignoreInstructions),
        zones: zones.map((zone) => ({
          name: zone.name.trim(),
          type: zone.type,
          personRoleHint: zone.personRoleHint,
          description: zone.description.trim(),
          polygon: sanitizePolygon(zone.polygon),
        })),
        sceneType:
          profile?.sceneType === "indoor" ||
          profile?.sceneType === "outdoor" ||
          profile?.sceneType === "mixed"
            ? profile.sceneType
            : "unknown",
        fixedElements: profile?.fixedElements ?? [],
        privacyNotes: profile?.privacyNotes ?? [],
        imageQuality: profile?.imageQuality
          ? {
              overall: [
                "good",
                "usable",
                "limited",
                "poor",
              ].includes(profile.imageQuality.overall)
                ? profile.imageQuality.overall
                : "unknown",
              lighting: profile.imageQuality.lighting,
              visibility: profile.imageQuality.visibility,
              limitations: profile.imageQuality.limitations,
            }
          : null,
        confidence: profile?.confidence ?? null,
        basedOnProfileId: profile?.id ?? null,
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

  const mayAnalyze = canManage && Boolean(selectedFrame);
  const maySave =
    canManage &&
    Boolean(selectedFrame) &&
    environmentDescription.trim().length >= 20 &&
    textList(monitoringGoals).length > 0 &&
    zones.length > 0 &&
    zones.every(
      (zone) =>
        zone.name.trim().length > 0 &&
        zone.description.trim().length > 0 &&
        zone.polygon.length >= 3 &&
        zone.polygon.length <= 50,
    );

  function updateZone(
    key: string,
    patch: Partial<EditableZone>,
  ) {
    setZones((current) =>
      current.map((zone) =>
        zone.key === key ? { ...zone, ...patch } : zone,
      ),
    );
  }

  function beginNewZone() {
    setDrawing({ replaceZoneKey: null, points: [] });
    setSelectedZoneKey(null);
    setDraggingVertex(null);
  }

  function beginRedraw(zoneKey: string) {
    setDrawing({ replaceZoneKey: zoneKey, points: [] });
    setSelectedZoneKey(zoneKey);
    setDraggingVertex(null);
  }

  function cancelDrawing() {
    setDrawing(null);
    setDraggingVertex(null);
  }

  function undoDrawingPoint() {
    setDrawing((current) =>
      current
        ? {
            ...current,
            points: current.points.slice(0, -1),
          }
        : null,
    );
  }

  function finishDrawing() {
    if (!drawing || drawing.points.length < 3) return;

    const polygon = sanitizePolygon(drawing.points);

    if (drawing.replaceZoneKey) {
      updateZone(drawing.replaceZoneKey, { polygon });
      setSelectedZoneKey(drawing.replaceZoneKey);
    } else {
      const key = `new-${Date.now()}-${zones.length}`;
      setZones((current) => [
        ...current,
        {
          key,
          name: `Nova zona ${current.length + 1}`,
          type: "general",
          personRoleHint: "none",
          description: "",
          polygon,
        },
      ]);
      setSelectedZoneKey(key);
    }

    setDrawing(null);
  }

  function removeZone(zoneKey: string) {
    setZones((current) =>
      current.filter((zone) => zone.key !== zoneKey),
    );
    setSelectedZoneKey((current) =>
      current === zoneKey ? null : current,
    );
    if (drawing?.replaceZoneKey === zoneKey) {
      setDrawing(null);
    }
  }

  function handleCanvasPointerDown(
    event: ReactPointerEvent<SVGSVGElement>,
  ) {
    if (!editing || !drawing) return;
    if (drawing.points.length >= 50) return;

    const point = pointFromPointer(event);
    setDrawing((current) =>
      current
        ? {
            ...current,
            points: [...current.points, point],
          }
        : null,
    );
  }

  function handleCanvasPointerMove(
    event: ReactPointerEvent<SVGSVGElement>,
  ) {
    if (!editing || !draggingVertex || drawing) return;

    const point = pointFromPointer(event);
    setZones((current) =>
      current.map((zone) => {
        if (zone.key !== draggingVertex.zoneKey) return zone;

        return {
          ...zone,
          polygon: zone.polygon.map((existing, pointIndex) =>
            pointIndex === draggingVertex.pointIndex
              ? point
              : existing,
          ),
        };
      }),
    );
  }

  function stopDragging() {
    setDraggingVertex(null);
  }

  return (
    <section className={styles.shell}>
      <div className={styles.heading}>
        <div>
          <span>PERFIL INTELIGENTE · V0.8.2</span>
          <h2>Contexto editável da câmera</h2>
          <p>
            A IA sugere o perfil e as zonas. Quando precisar
            corrigir, desenhe diretamente sobre a imagem e
            explique em linguagem natural o que acontece em
            cada área.
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
              <div className={styles.imageStage}>
                <img
                  src={selectedFrame.url}
                  alt="Imagem de referência selecionada"
                />

                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-label="Zonas do perfil"
                  className={
                    editing
                      ? styles.zoneCanvasInteractive
                      : styles.zoneCanvas
                  }
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={stopDragging}
                  onPointerCancel={stopDragging}
                  onPointerLeave={stopDragging}
                >
                  {zones.map((zone, index) => {
                    const center = centroid(zone.polygon);
                    const isSelected =
                      selectedZoneKey === zone.key;

                    return (
                      <g key={zone.key}>
                        <polygon
                          points={polygonPoints(zone.polygon)}
                          data-zone={index + 1}
                          data-role={zone.personRoleHint}
                          data-type={zone.type}
                          data-selected={
                            isSelected ? "true" : "false"
                          }
                          onPointerDown={(event) => {
                            if (!editing || drawing) return;
                            event.stopPropagation();
                            setSelectedZoneKey(zone.key);
                          }}
                        />
                        <text
                          x={center.x * 100}
                          y={center.y * 100}
                          textAnchor="middle"
                        >
                          {index + 1}
                        </text>

                        {editing &&
                        isSelected &&
                        !drawing
                          ? zone.polygon.map((point, pointIndex) => (
                              <circle
                                key={`${zone.key}-${pointIndex}`}
                                cx={point.x * 100}
                                cy={point.y * 100}
                                r="1.7"
                                className={styles.vertexHandle}
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  setDraggingVertex({
                                    zoneKey: zone.key,
                                    pointIndex,
                                  });
                                }}
                              />
                            ))
                          : null}
                      </g>
                    );
                  })}

                  {drawing && drawing.points.length ? (
                    <g className={styles.drawingPreview}>
                      {drawing.points.length >= 3 ? (
                        <polygon
                          points={polygonPoints(drawing.points)}
                        />
                      ) : (
                        <polyline
                          points={polygonPoints(drawing.points)}
                        />
                      )}
                      {drawing.points.map((point, pointIndex) => (
                        <circle
                          key={`draft-${pointIndex}`}
                          cx={point.x * 100}
                          cy={point.y * 100}
                          r="1.6"
                        />
                      ))}
                    </g>
                  ) : null}
                </svg>

                {editing ? (
                  <div className={styles.zoneToolbar}>
                    {drawing ? (
                      <>
                        <strong>
                          {drawing.replaceZoneKey
                            ? "Redesenhando zona"
                            : "Nova zona"}
                        </strong>
                        <span>
                          Toque ou clique nos cantos da área.
                          Use pelo menos 3 pontos.
                        </span>
                        <div>
                          <button
                            type="button"
                            onClick={undoDrawingPoint}
                            disabled={!drawing.points.length}
                          >
                            Desfazer ponto
                          </button>
                          <button
                            type="button"
                            onClick={cancelDrawing}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className={styles.finishButton}
                            onClick={finishDrawing}
                            disabled={drawing.points.length < 3}
                          >
                            Concluir zona
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <strong>Editor visual de zonas</strong>
                        <span>
                          Toque em uma zona para mover os pontos
                          ou desenhe uma nova área livremente.
                        </span>
                        <button
                          type="button"
                          className={styles.finishButton}
                          onClick={beginNewZone}
                        >
                          + Desenhar nova zona
                        </button>
                      </>
                    )}
                  </div>
                ) : null}

                <div className={styles.frameMeta}>
                  <span>
                    {selectedFrame.width ?? "?"} ×{" "}
                    {selectedFrame.height ?? "?"}
                  </span>
                  <span>{formatDate(selectedFrame.capturedAt)}</span>
                </div>
              </div>
            ) : (
              <div className={styles.noFrame}>
                <strong>Nenhuma imagem disponível</strong>
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
                <small>Frames do perfil e de eventos recentes</small>
              </div>

              <div className={styles.frameStrip}>
                {workspace.referenceFrames.map((frame) => (
                  <button
                    type="button"
                    key={frame.id}
                    className={
                      frame.id === selectedSourceId
                        ? styles.selectedFrame
                        : undefined
                    }
                    onClick={() => setSelectedSourceId(frame.id)}
                  >
                    <img src={frame.url} alt="" />
                    <span>{formatDate(frame.capturedAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {profile ? (
            <div className={styles.summaryBar}>
              <div>
                <span>CONTEXTO</span>
                <strong>
                  {operationalContextLabels[
                    profile.operationalContext
                  ] ?? profile.operationalContext}
                </strong>
              </div>
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
            </div>
          ) : null}
        </div>

        <div className={styles.contentColumn}>
          {editing ? (
            <div className={styles.editor}>
              <div className={styles.editorHeading}>
                <div>
                  <span>EDIÇÃO SIMPLIFICADA</span>
                  <h3>Ajuste somente o que estiver errado</h3>
                  <p>
                    A IA continua usando o nome, a explicação e
                    o desenho de cada zona. Os controles técnicos
                    ficam escondidos em Opções avançadas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDrawing(null);
                    setDraggingVertex(null);
                  }}
                >
                  Fechar edição
                </button>
              </div>

              <label>
                <span>Contexto operacional</span>
                <select
                  value={operationalContext}
                  onChange={(event) =>
                    setOperationalContext(event.target.value)
                  }
                >
                  {Object.entries(operationalContextLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                <span>Descrição do ambiente</span>
                <textarea
                  value={environmentDescription}
                  onChange={(event) =>
                    setEnvironmentDescription(event.target.value)
                  }
                  rows={5}
                />
              </label>

              <div className={styles.editorColumns}>
                <label>
                  <span>Objetivos — um por linha</span>
                  <textarea
                    value={monitoringGoals}
                    onChange={(event) =>
                      setMonitoringGoals(event.target.value)
                    }
                    rows={6}
                  />
                </label>

                <label>
                  <span>Ignorar — um por linha</span>
                  <textarea
                    value={ignoreInstructions}
                    onChange={(event) =>
                      setIgnoreInstructions(event.target.value)
                    }
                    rows={6}
                  />
                </label>
              </div>

              <div className={styles.zoneEditor}>
                <div className={styles.zoneEditorHeading}>
                  <div>
                    <span>ZONAS DESENHADAS NA IMAGEM</span>
                    <p>
                      Selecione uma zona na imagem ou abaixo.
                      Dê um nome simples e explique o que ocorre
                      ali. O MonitorIA usa essa explicação nas
                      análises.
                    </p>
                  </div>
                  <button type="button" onClick={beginNewZone}>
                    + Desenhar zona
                  </button>
                </div>

                <div className={styles.zoneEditorList}>
                  {zones.map((zone, index) => {
                    const isSelected = selectedZoneKey === zone.key;

                    return (
                      <article
                        key={zone.key}
                        data-selected={
                          isSelected ? "true" : "false"
                        }
                        onClick={() => setSelectedZoneKey(zone.key)}
                      >
                        <header>
                          <div>
                            <strong>Zona {index + 1}</strong>
                            <small>
                              {zoneBehaviorLabels[zone.type] ??
                                zone.type}
                            </small>
                          </div>
                          <div className={styles.zoneCardActions}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                beginRedraw(zone.key);
                              }}
                            >
                              Redesenhar
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeZone(zone.key);
                              }}
                            >
                              Remover
                            </button>
                          </div>
                        </header>

                        <div className={styles.zoneSimpleFields}>
                          <label>
                            <span>Nome da zona</span>
                            <input
                              value={zone.name}
                              placeholder="Ex.: Entrada da garagem"
                              onFocus={() =>
                                setSelectedZoneKey(zone.key)
                              }
                              onChange={(event) =>
                                updateZone(zone.key, {
                                  name: event.target.value,
                                })
                              }
                            />
                          </label>

                          <label>
                            <span>O que acontece aqui?</span>
                            <textarea
                              value={zone.description}
                              placeholder="Ex.: Carros que entram pela rampa devem ser registrados. Carros apenas passando na rua não pertencem a esta zona."
                              rows={3}
                              onFocus={() =>
                                setSelectedZoneKey(zone.key)
                              }
                              onChange={(event) =>
                                updateZone(zone.key, {
                                  description: event.target.value,
                                })
                              }
                            />
                          </label>

                          <label>
                            <span>Como tratar esta área?</span>
                            <select
                              value={zone.type}
                              onFocus={() =>
                                setSelectedZoneKey(zone.key)
                              }
                              onChange={(event) =>
                                updateZone(zone.key, {
                                  type: event.target.value,
                                })
                              }
                            >
                              {Object.entries(zoneBehaviorLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                            <small className={styles.fieldHelp}>
                              Se deixar “IA interpreta pela descrição”,
                              o texto acima será a principal orientação.
                            </small>
                          </label>
                        </div>

                        <details className={styles.advancedZone}>
                          <summary>Opções avançadas</summary>
                          <label>
                            <span>
                              Quem normalmente fica nesta área?
                            </span>
                            <select
                              value={zone.personRoleHint}
                              onChange={(event) =>
                                updateZone(zone.key, {
                                  personRoleHint: event.target.value,
                                })
                              }
                            >
                              {Object.entries(roleLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <p>
                            Os {zone.polygon.length} pontos do
                            contorno são salvos automaticamente.
                            Para alterar a forma, arraste os pontos
                            na imagem ou use “Redesenhar”.
                          </p>
                        </details>
                      </article>
                    );
                  })}
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
                    approvalPending ||
                    Boolean(drawing)
                  }
                >
                  {savePending
                    ? "Salvando nova versão..."
                    : "Salvar como nova versão"}
                </button>
              </form>

              {!maySave ? (
                <p className={styles.validationHint}>
                  Para salvar, cada zona precisa de nome, uma
                  explicação simples e pelo menos 3 pontos no
                  desenho.
                </p>
              ) : null}

              <ActionMessage state={saveState} />
            </div>
          ) : profile ? (
            <ProfileDetails profile={profile} />
          ) : (
            <div className={styles.emptyProfile}>
              <span>PRIMEIRA ANÁLISE</span>
              <h3>Escolha uma foto representativa</h3>
              <p>
                Prefira um frame que represente a função real
                da câmera: acesso, rua, garagem, corredor, área
                interna ou atendimento.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.aiGuidance}>
        <div>
          <span>NOVA ANÁLISE COM ORIENTAÇÃO</span>
          <h3>Deixe a IA criar as zonas por você</h3>
          <p>
            Explique o ambiente normalmente. A IA cria o perfil
            e desenha as zonas. Depois você só corrige o contorno
            na imagem se alguma área não ficar certa.
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
            onChange={(event) => setGuidance(event.target.value)}
            maxLength={2000}
            placeholder="Ex.: Esta câmera mostra a rua e a entrada da garagem. Ignore carros que apenas passam e registre quem realmente entra, sai ou permanece no acesso."
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
              : "Gerar perfil com IA"}
          </button>
        </form>
      </div>

      <div className={styles.actions}>
        <div>
          <p className={styles.permissionNote}>
            Status da câmera: {cameraStatus}. As zonas são
            salvas no perfil e o Agent não precisa ser
            reiniciado.
          </p>
          <ActionMessage state={analysisState} />
          <ActionMessage state={approvalState} />
        </div>

        <div className={styles.actionButtons}>
          {profile ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setEditing((current) => !current);
                setDrawing(null);
                setDraggingVertex(null);
              }}
              disabled={!canManage}
            >
              {editing
                ? "Voltar à visualização"
                : "Editar perfil e desenhar zonas"}
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
