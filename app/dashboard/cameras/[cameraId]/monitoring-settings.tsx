"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { CameraSummary } from "@/src/lib/dashboard-data";
import { updateMonitoringSettingsAction } from "../monitoring-actions";
import { initialMonitoringActionState } from "../monitoring-action-state";
import styles from "./monitoring-settings.module.css";

type Props = {
  camera: CameraSummary;
  canManage: boolean;
};

const plans = [
  {
    code: "basic",
    name: "Econômico",
    detail: "1 quadro · GPT-5 nano · menor custo",
  },
  {
    code: "standard",
    name: "Equilibrado",
    detail: "até 3 quadros · nano com escalonamento",
  },
  {
    code: "intensive",
    name: "Detalhado",
    detail: "até 4 quadros · GPT-5 mini",
  },
];

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

export function MonitoringSettings({
  camera,
  canManage,
}: Props) {
  const [state, action, pending] = useActionState(
    updateMonitoringSettingsAction,
    initialMonitoringActionState,
  );

  const schedule = scheduleDefaults(camera.monitoringSchedule);

  return (
    <section className={styles.shell}>
      <div className={styles.heading}>
        <div>
          <span>CALIBRAÇÃO · V0.7.3</span>
          <h2>Modo e segmentação</h2>
          <p>
            O Agent calibra o ruído localmente e só envia acontecimentos
            que ultrapassam os limites efetivos da câmera.
          </p>
        </div>

        <Link href="/dashboard/vision-tests">
          Comparar nano × mini →
        </Link>
      </div>

      <form action={action}>
        <input type="hidden" name="camera_id" value={camera.id} />

        <fieldset disabled={!canManage || pending}>
          <legend>Modo visual</legend>
          <div className={styles.plans}>
            {plans.map((plan) => (
              <label key={plan.code}>
                <input
                  type="radio"
                  name="plan"
                  value={plan.code}
                  defaultChecked={camera.planCode === plan.code}
                />
                <span>
                  <strong>{plan.name}</strong>
                  <small>{plan.detail}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.grid}>
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
          <legend>Agenda</legend>

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
                O vídeo contínuo permanece local. Os limites efetivos
                aparecem nos logs após a calibração.
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
