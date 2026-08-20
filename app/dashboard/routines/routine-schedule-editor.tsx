"use client";

import { useMemo, useState } from "react";
import {
  clearRoutineScheduleAction,
  saveRoutineScheduleAction,
} from "./actions";
import {
  ROUTINE_WEEKDAY_LABELS,
  routineMinuteToTime,
} from "@/src/lib/routine-intelligence-labels";
import type {
  RoutineDeclaredSchedule,
  RoutineScheduleException,
} from "@/src/lib/routine-intelligence-data";
import styles from "./routines.module.css";

type Props = {
  cameraId: string;
  cameraName: string;
  sensitivity: string;
  schedule: RoutineDeclaredSchedule;
};

type EditableException = RoutineScheduleException & { key: string };

function initialExceptions(values: RoutineScheduleException[]): EditableException[] {
  return values.map((item, index) => ({
    ...item,
    key: `${item.date}:${index}`,
  }));
}

export function RoutineScheduleEditor({
  cameraId,
  cameraName,
  sensitivity,
  schedule,
}: Props) {
  const [exceptions, setExceptions] = useState<EditableException[]>(
    initialExceptions(schedule.exceptions),
  );

  const workingDays = schedule.configured
    ? schedule.workingDays
    : [1, 2, 3, 4, 5];

  const serializedExceptions = useMemo(
    () =>
      JSON.stringify(
        exceptions.map(({ key: _key, ...item }) => item),
      ),
    [exceptions],
  );

  return (
    <details className={styles.scheduleEditor}>
      <summary>
        <span>Configurar horários</span>
        <small>{schedule.configured ? "Horário informado" : "Opcional"}</small>
      </summary>

      <div className={styles.scheduleEditorBody}>
        {!schedule.configured ? (
          <p className={styles.scheduleHint}>
            Nenhum horário foi informado para esta câmera. Os valores abaixo
            são apenas uma sugestão inicial e só passam a valer quando você
            clicar em salvar.
          </p>
        ) : null}

        <form action={saveRoutineScheduleAction}>
          <input type="hidden" name="camera_id" value={cameraId} />
          <input type="hidden" name="exceptions_json" value={serializedExceptions} />

          <div className={styles.scheduleFormGrid}>
            <fieldset className={styles.weekdays}>
              <legend>Dias de funcionamento</legend>
              <div>
                {ROUTINE_WEEKDAY_LABELS.map((label, day) => (
                  <label key={label}>
                    <input
                      type="checkbox"
                      name="working_days"
                      value={day}
                      defaultChecked={workingDays.includes(day)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label>
              <span>Abertura esperada</span>
              <input
                type="time"
                name="open_time"
                defaultValue={
                  schedule.openMinute === null
                    ? "08:00"
                    : routineMinuteToTime(schedule.openMinute)
                }
              />
            </label>

            <label>
              <span>Fechamento esperado</span>
              <input
                type="time"
                name="close_time"
                defaultValue={
                  schedule.closeMinute === null
                    ? "18:00"
                    : routineMinuteToTime(schedule.closeMinute)
                }
              />
            </label>

            <label>
              <span>Tolerância</span>
              <select name="sensitivity" defaultValue={sensitivity}>
                <option value="conservative">Mais tolerante</option>
                <option value="balanced">Equilibrada</option>
                <option value="sensitive">Mais rigorosa</option>
              </select>
            </label>
          </div>

          <div className={styles.exceptionHeader}>
            <div>
              <strong>Feriados e horários especiais</strong>
              <p>Informe somente as datas que fogem da semana normal.</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setExceptions((current) => [
                  ...current,
                  {
                    key: `new:${Date.now()}`,
                    date: "",
                    closed: true,
                    openMinute: null,
                    closeMinute: null,
                  },
                ])
              }
            >
              + Adicionar data
            </button>
          </div>

          {exceptions.length ? (
            <div className={styles.exceptionList}>
              {exceptions.map((item) => (
                <div className={styles.exceptionRow} key={item.key}>
                  <input
                    type="date"
                    aria-label="Data especial"
                    value={item.date}
                    onChange={(event) =>
                      setExceptions((current) =>
                        current.map((candidate) =>
                          candidate.key === item.key
                            ? { ...candidate, date: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                  />

                  <label className={styles.closedToggle}>
                    <input
                      type="checkbox"
                      checked={item.closed}
                      onChange={(event) =>
                        setExceptions((current) =>
                          current.map((candidate) =>
                            candidate.key === item.key
                              ? {
                                  ...candidate,
                                  closed: event.target.checked,
                                  openMinute: event.target.checked
                                    ? null
                                    : candidate.openMinute ?? 480,
                                  closeMinute: event.target.checked
                                    ? null
                                    : candidate.closeMinute ?? 1080,
                                }
                              : candidate,
                          ),
                        )
                      }
                    />
                    <span>Fechado</span>
                  </label>

                  {!item.closed ? (
                    <>
                      <input
                        type="time"
                        aria-label="Abertura especial"
                        value={routineMinuteToTime(item.openMinute ?? 480)}
                        onChange={(event) => {
                          const [hour, minute] = event.target.value.split(":").map(Number);
                          setExceptions((current) =>
                            current.map((candidate) =>
                              candidate.key === item.key
                                ? { ...candidate, openMinute: hour * 60 + minute }
                                : candidate,
                            ),
                          );
                        }}
                      />
                      <input
                        type="time"
                        aria-label="Fechamento especial"
                        value={routineMinuteToTime(item.closeMinute ?? 1080)}
                        onChange={(event) => {
                          const [hour, minute] = event.target.value.split(":").map(Number);
                          setExceptions((current) =>
                            current.map((candidate) =>
                              candidate.key === item.key
                                ? { ...candidate, closeMinute: hour * 60 + minute }
                                : candidate,
                            ),
                          );
                        }}
                      />
                    </>
                  ) : (
                    <span className={styles.exceptionClosedText}>
                      Sem funcionamento esperado
                    </span>
                  )}

                  <button
                    type="button"
                    className={styles.removeException}
                    aria-label="Remover data especial"
                    onClick={() =>
                      setExceptions((current) =>
                        current.filter((candidate) => candidate.key !== item.key),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.scheduleActions}>
            <button type="submit" className={styles.saveSchedule}>
              Salvar horários de {cameraName}
            </button>
          </div>
        </form>

        {schedule.configured ? (
          <form action={clearRoutineScheduleAction}>
            <input type="hidden" name="camera_id" value={cameraId} />
            <button type="submit" className={styles.clearSchedule}>
              Usar apenas o padrão aprendido
            </button>
          </form>
        ) : null}

        <small className={styles.scheduleFootnote}>
          O horário informado não altera o que o MonitorIA aprendeu. Os dois
          ficam separados para comparar o esperado com o comportamento observado.
        </small>
      </div>
    </details>
  );
}
