"use client";

import { useMemo, useState } from "react";
import type { OperationalProcessDashboardDefinition } from "@/src/lib/operational-process-data";
import {
  PROCESS_OBSERVATION_OPTIONS,
  processObservationLabel,
} from "@/src/lib/operational-process-labels";
import { saveProcessDefinitionAction } from "./actions";
import styles from "./processes.module.css";

type SimpleSite = { id: string; name: string };
type SimpleCamera = { id: string; name: string; siteId: string };

type EditableStep = {
  key: string;
  stepCode: string;
  name: string;
  required: boolean;
  repeatable: boolean;
  terminal: boolean;
  acceptedChapterTypes: string[];
};

type Props = {
  definition: OperationalProcessDashboardDefinition;
  sites: SimpleSite[];
  cameras: SimpleCamera[];
};

function slug(value: string, index: number) {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return base.length >= 2 ? base : `etapa_${index + 1}`;
}

function inferObservation(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/(fech|encerra|tranca)/.test(normalized)) return "closing_step";
  if (/(abert|abrir|destranca)/.test(normalized)) return "opening_step";
  if (/(chega|entra|entrada)/.test(normalized)) return "arrival";
  if (/(esper|aguarda|fila)/.test(normalized)) return "waiting";
  if (/(atend|servic)/.test(normalized)) return "service_started";
  if (/(caixa|terminal|computador|pagamento)/.test(normalized)) {
    return "terminal_activity";
  }
  if (/(entreg|retir|objeto|produto)/.test(normalized)) {
    return "object_handoff";
  }
  if (/(sai|saida|deixa)/.test(normalized)) return "departure";
  if (/(equip|maquina|motor)/.test(normalized)) return "equipment_activity";
  if (/(restrit|acesso)/.test(normalized)) return "restricted_access";
  if (/(permane|presen)/.test(normalized)) return "presence";
  return "state_change";
}

function fromDefinition(
  definition: OperationalProcessDashboardDefinition,
): EditableStep[] {
  return definition.steps.map((step, index) => ({
    key: `${step.id}:${index}`,
    stepCode: step.stepCode,
    name: step.name,
    required:
      definition.source === "system"
        ? step.recommendedRequired
        : step.required,
    repeatable: step.repeatable,
    terminal: step.terminal,
    acceptedChapterTypes:
      step.acceptedChapterTypes.length > 0
        ? step.acceptedChapterTypes
        : ["state_change"],
  }));
}

export function ProcessDefinitionEditor({
  definition,
  sites,
  cameras,
}: Props) {
  const [steps, setSteps] = useState<EditableStep[]>(
    fromDefinition(definition),
  );
  const [scope, setScope] = useState(
    definition.source === "system" ? "organization" : definition.source,
  );
  const [scopeId, setScopeId] = useState(
    definition.source === "site"
      ? definition.siteId ?? ""
      : definition.source === "camera"
        ? definition.cameraId ?? ""
        : "",
  );
  const [descriptionText, setDescriptionText] = useState("");

  const serialized = useMemo(
    () =>
      JSON.stringify(
        steps.map((step, index) => ({
          stepCode: step.stepCode || slug(step.name, index),
          name: step.name,
          required: step.required,
          repeatable: step.repeatable,
          terminal: index === steps.length - 1 ? step.terminal : false,
          acceptedChapterTypes: step.acceptedChapterTypes,
        })),
      ),
    [steps],
  );

  function move(index: number, direction: -1 | 1) {
    setSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function transformDescription() {
    const lines = descriptionText
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 20);

    if (!lines.length) return;

    setSteps(
      lines.map((name, index) => ({
        key: `described:${Date.now()}:${index}`,
        stepCode: slug(name, index),
        name,
        required: true,
        repeatable: false,
        terminal: index === lines.length - 1,
        acceptedChapterTypes: [inferObservation(name)],
      })),
    );
  }

  return (
    <details className={styles.editor}>
      <summary>Configurar este processo</summary>

      <div className={styles.editorBody}>
        <div className={styles.describeProcess}>
          <div>
            <strong>Descreva as etapas em linguagem simples</strong>
            <p>
              Uma etapa por linha. O MonitorIA sugere o tipo de observação;
              você revisa antes de salvar.
            </p>
          </div>
          <textarea
            value={descriptionText}
            onChange={(event) => setDescriptionText(event.target.value)}
            placeholder={
              "Abrir o portão\nLigar as luzes\nConfirmar presença no balcão"
            }
            rows={4}
          />
          <button type="button" onClick={transformDescription}>
            Transformar em etapas
          </button>
        </div>

        <form action={saveProcessDefinitionAction}>
          <input type="hidden" name="process_code" value={definition.processCode} />
          <input type="hidden" name="session_type" value={definition.sessionType} />
          <input type="hidden" name="steps_json" value={serialized} />

          <div className={styles.editorFields}>
            <label>
              <span>Nome do processo</span>
              <input name="name" defaultValue={definition.name} minLength={3} required />
            </label>
            <label>
              <span>Como aplicar</span>
              <select
                name="scope"
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value);
                  setScopeId("");
                }}
              >
                <option value="organization">Toda a empresa</option>
                <option value="site">Somente um local</option>
                <option value="camera">Somente uma câmera</option>
              </select>
            </label>

            {scope === "site" ? (
              <label>
                <span>Local</span>
                <select
                  name="scope_id"
                  value={scopeId}
                  onChange={(event) => setScopeId(event.target.value)}
                  required
                >
                  <option value="">Escolha</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {scope === "camera" ? (
              <label>
                <span>Câmera</span>
                <select
                  name="scope_id"
                  value={scopeId}
                  onChange={(event) => setScopeId(event.target.value)}
                  required
                >
                  <option value="">Escolha</option>
                  {cameras.map((camera) => (
                    <option key={camera.id} value={camera.id}>{camera.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {scope === "organization" ? (
              <input type="hidden" name="scope_id" value="" />
            ) : null}

            <label>
              <span>Rigor da sequência</span>
              <select
                name="strictness"
                defaultValue={
                  definition.source === "system"
                    ? "balanced"
                    : definition.strictness
                }
              >
                <option value="flexible">Mais flexível</option>
                <option value="balanced">Equilibrado</option>
                <option value="strict">Mais rigoroso</option>
              </select>
            </label>
          </div>

          <label className={styles.descriptionField}>
            <span>Descrição para sua equipe</span>
            <textarea
              name="description"
              defaultValue={definition.description}
              rows={2}
              maxLength={500}
            />
          </label>

          <div className={styles.stepEditorHeader}>
            <div>
              <strong>Etapas acompanhadas</strong>
              <p>
                “Obrigatória” significa que a ausência de confirmação poderá
                aparecer como atenção. O MonitorIA nunca assume que algo não
                aconteceu só porque a câmera não viu.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSteps((current) => [
                  ...current,
                  {
                    key: `new:${Date.now()}`,
                    stepCode: `etapa_${current.length + 1}`,
                    name: "Nova etapa",
                    required: false,
                    repeatable: false,
                    terminal: false,
                    acceptedChapterTypes: ["state_change"],
                  },
                ])
              }
            >
              + Adicionar etapa
            </button>
          </div>

          <div className={styles.stepEditorList}>
            {steps.map((step, index) => (
              <div className={styles.stepEditorRow} key={step.key}>
                <div className={styles.stepOrder}>
                  <strong>{index + 1}</strong>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Mover etapa para cima"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Mover etapa para baixo"
                  >
                    ↓
                  </button>
                </div>

                <label>
                  <span>Etapa</span>
                  <input
                    value={step.name}
                    onChange={(event) =>
                      setSteps((current) =>
                        current.map((candidate) =>
                          candidate.key === step.key
                            ? {
                                ...candidate,
                                name: event.target.value,
                                stepCode: slug(event.target.value, index),
                              }
                            : candidate,
                        ),
                      )
                    }
                  />
                </label>

                <label>
                  <span>O que observar</span>
                  <select
                    value={step.acceptedChapterTypes[0] ?? "state_change"}
                    onChange={(event) =>
                      setSteps((current) =>
                        current.map((candidate) =>
                          candidate.key === step.key
                            ? {
                                ...candidate,
                                acceptedChapterTypes: [event.target.value],
                              }
                            : candidate,
                        ),
                      )
                    }
                  >
                    {PROCESS_OBSERVATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {step.acceptedChapterTypes.length > 1 ? (
                    <small>
                      Modelo original também aceita:{" "}
                      {step.acceptedChapterTypes
                        .slice(1)
                        .map(processObservationLabel)
                        .join(", ")}
                    </small>
                  ) : null}
                </label>

                <label className={styles.requiredToggle}>
                  <input
                    type="checkbox"
                    checked={step.required}
                    onChange={(event) =>
                      setSteps((current) =>
                        current.map((candidate) =>
                          candidate.key === step.key
                            ? { ...candidate, required: event.target.checked }
                            : candidate,
                        ),
                      )
                    }
                  />
                  <span>Obrigatória</span>
                </label>

                <button
                  type="button"
                  className={styles.removeStep}
                  disabled={steps.length <= 1}
                  onClick={() =>
                    setSteps((current) =>
                      current.filter((candidate) => candidate.key !== step.key),
                    )
                  }
                  aria-label="Remover etapa"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className={styles.saveRow}>
            <button type="submit">Salvar como nova versão</button>
            <small>
              A versão atual fica preservada no histórico e os períodos
              relacionados serão recalculados em segundo plano.
            </small>
          </div>
        </form>
      </div>
    </details>
  );
}
