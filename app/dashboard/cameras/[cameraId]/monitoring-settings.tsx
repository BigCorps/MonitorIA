"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { CameraSummary } from "@/src/lib/dashboard-data";
import { CAMERA_ANALYSIS_PLANS } from "@/src/lib/analysis-plans";
import { updateMonitoringSettingsAction } from "../monitoring-actions";
import { initialMonitoringActionState } from "../monitoring-action-state";
import styles from "./monitoring-settings.module.css";

type Props = {
  camera: CameraSummary;
  canManage: boolean;
};

const weekdays = [
  ["1", "Seg"],
  ["2", "Ter"],
  ["3", "Qua"],
  ["4", "Qui"],
  ["5", "Sex"],
  ["6", "Sáb"],
  ["0", "Dom"],
];

function scheduleDefaults(value: Record<string, unknown>) {
  const weekly = Array.isArray(value.weekly)
    ? (value.weekly as Array<Record<string, unknown>>)
    : [];

  const first = weekly[0];

  return {
    mode: value.mode === "weekly" ? "weekly" : "always",
    start: String(first?.start ?? "08:00"),
    end: String(first?.end ?? "18:00"),
    days: new Set(
      weekly.map((entry) => String(entry.day ?? "")),
    ),
    outsideMode:
      value.outsideMode === "significant_only"
        ? "significant_only"
        : "off",
  };
}

function operationalAccessDefaults(value: Record<string, unknown>) {
  const raw =
    value.operationalAccess &&
    typeof value.operationalAccess === "object" &&
    !Array.isArray(value.operationalAccess)
      ? (value.operationalAccess as Record<string, unknown>)
      : {};

  const openingTime = String(raw.openingTime ?? "08:00");
  const closingTime = String(raw.closingTime ?? "18:00");

  return {
    enabled: raw.enabled === true,
    openingTime: /^\d{2}:\d{2}$/.test(openingTime)
      ? openingTime
      : "08:00",
    closingTime: /^\d{2}:\d{2}$/.test(closingTime)
      ? closingTime
      : "18:00",
  };
}

export function MonitoringSettings({
  camera,
  canManage,
}: Props) {
  const [state, action, pending] = useActionState(
    updateMonitoringSettingsAction,
    initialMonitoringActionState,
  );

  const schedule = scheduleDefaults(camera.monitoringSchedule);
  const operationalDefaults = operationalAccessDefaults(
    camera.monitoringSchedule,
  );
  const [operationalAccessEnabled, setOperationalAccessEnabled] =
    useState(operationalDefaults.enabled);

  const plan =
    CAMERA_ANALYSIS_PLANS[
      camera.planCode as keyof typeof CAMERA_ANALYSIS_PLANS
    ] ?? CAMERA_ANALYSIS_PLANS.basic;

  return (
    <section className={styles.shell}>
      <div className={styles.heading}>
        <div>
          <span>OBSERVAÇÃO LOCAL</span>
          <h2>Segmentação e agenda</h2>
          <p>
            O Agent calibra o ruído localmente e só envia acontecimentos
            que ultrapassam os limites efetivos da câmera.
          </p>
        </div>

        <Link href="/dashboard/plans">
          Alterar plano da câmera →
        </Link>
      </div>

      <form action={action}>
        <input type="hidden" name="camera_id" value={camera.id} />

        <div className={styles.grid}>
          <div>
            <span>Plano atual</span>
            <strong>{plan.label}</strong>
            <small>{plan.description}</small>
          </div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              name="adaptive"
              defaultChecked={camera.motionAdaptiveEnabled}
              disabled={!canManage || pending}
            />
            <span>
              <strong>Calibração adaptativa</strong>
              <small>
                Mede o piso de ruído e eleva os limiares automaticamente.
              </small>
            </span>
          </label>

          <label>
            <span>Relógio ou sobreposição</span>
            <select
              name="overlay_mask"
              defaultValue={camera.motionOverlayMask}
              disabled={!canManage || pending}
            >
              <option value="auto">Detectar automaticamente</option>
              <option value="none">Não ignorar canto</option>
              <option value="top-left">Canto superior esquerdo</option>
              <option value="top-right">Canto superior direito</option>
              <option value="bottom-left">Canto inferior esquerdo</option>
              <option value="bottom-right">Canto inferior direito</option>
            </select>
          </label>
        </div>

        <fieldset disabled={!canManage || pending}>
          <legend>Abertura e fechamento do local</legend>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              name="operational_access_enabled"
              checked={operationalAccessEnabled}
              onChange={(event) =>
                setOperationalAccessEnabled(event.target.checked)
              }
            />
            <span>
              <strong>
                Usar esta câmera como referência de abertura e fechamento
              </strong>
              <small>
                Ative somente quando a porta, portão, grade, cancela ou
                persiana que define o acesso estiver realmente visível.
              </small>
            </span>
          </label>

          <div className={styles.grid}>
            <label>
              <span>Horário aproximado de abertura</span>
              <input
                type="time"
                name="operational_opening_time"
                defaultValue={operationalDefaults.openingTime}
                required={operationalAccessEnabled}
              />
              <small>
                Serve como janela de atenção. A imagem continua sendo a prova.
              </small>
            </label>

            <label>
              <span>Horário aproximado de fechamento</span>
              <input
                type="time"
                name="operational_closing_time"
                defaultValue={operationalDefaults.closingTime}
                required={operationalAccessEnabled}
              />
              <small>
                Fechar mais cedo ou mais tarde continua sendo detectável.
              </small>
            </label>

            <div>
              <span>Comportamento</span>
              <strong>
                {operationalAccessEnabled
                  ? "Monitoramento 24 horas"
                  : "Desativado para esta câmera"}
              </strong>
              <small>
                Uma câmera de referência por local. As demais câmeras online
                continuam ajudando a corroborar mudanças visuais.
              </small>
            </div>
          </div>
        </fieldset>

        <fieldset
          disabled={
            !canManage ||
            pending ||
            operationalAccessEnabled
          }
        >
          <legend>Agenda</legend>

          {operationalAccessEnabled ? (
            <p>
              A agenda semanal fica desativada enquanto esta câmera for a
              referência de abertura/fechamento. Ela precisa continuar
              observando inclusive antes da abertura e depois do fechamento.
            </p>
          ) : null}

          <div className={styles.scheduleMode}>
            <label>
              <input
                type="radio"
                name="schedule_mode"
                value="always"
                defaultChecked={schedule.mode === "always"}
              />
              Sempre monitorar
            </label>

            <label>
              <input
                type="radio"
                name="schedule_mode"
                value="weekly"
                defaultChecked={schedule.mode === "weekly"}
              />
              Usar horário semanal
            </label>
          </div>

          <div className={styles.weekdays}>
            {weekdays.map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  name="weekday"
                  value={value}
                  defaultChecked={schedule.days.has(value)}
                />
                {label}
              </label>
            ))}
          </div>

          <div className={styles.grid}>
            <label>
              <span>Início</span>
              <input
                type="time"
                name="schedule_start"
                defaultValue={schedule.start}
              />
            </label>

            <label>
              <span>Fim</span>
              <input
                type="time"
                name="schedule_end"
                defaultValue={schedule.end}
              />
            </label>

            <label>
              <span>Fora do horário</span>
              <select
                name="outside_mode"
                defaultValue={schedule.outsideMode}
              >
                <option value="off">Não formar eventos</option>
                <option value="significant_only">
                  Somente movimento significativo
                </option>
              </select>
            </label>
          </div>
        </fieldset>

        <div className={styles.footer}>
          <div>
            {state.message ? (
              <p
                className={
                  state.status === "success"
                    ? styles.success
                    : styles.error
                }
              >
                {state.message}
              </p>
            ) : (
              <p>
                O vídeo contínuo permanece local. A troca de plano é
                feita na página Planos e não pode ser contornada por
                esta configuração técnica.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canManage || pending}
          >
            {pending ? "Salvando..." : "Salvar configuração"}
          </button>
        </div>
      </form>
    </section>
  );
}
