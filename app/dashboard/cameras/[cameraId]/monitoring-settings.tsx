"use client";

import { useActionState } from "react";
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

export function MonitoringSettings({
  camera,
  canManage,
}: Props) {
  const [state, action, pending] = useActionState(
    updateMonitoringSettingsAction,
    initialMonitoringActionState,
  );

  const schedule = scheduleDefaults(camera.monitoringSchedule);
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
