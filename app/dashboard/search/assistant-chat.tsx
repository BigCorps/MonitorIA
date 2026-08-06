"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { AssistantChartSpec } from "@/src/assistant/contracts";
import type {
  AssistantEvidence,
  AssistantMessageView,
  AssistantWorkspace,
} from "@/src/lib/assistant-data";
import styles from "./search.module.css";

type SiteOption = {
  id: string;
  name: string;
  timezone: string;
};

type CameraOption = {
  id: string;
  name: string;
  siteId: string;
};

type Props = {
  initialWorkspace: AssistantWorkspace;
  sites: SiteOption[];
  cameras: CameraOption[];
  timeZone: string;
};

type QueryResponse = {
  ok: true;
  threadId: string;
  userMessage: AssistantMessageView;
  assistantMessage: AssistantMessageView;
  evidence: AssistantEvidence[];
};

const suggestions = [
  "Quantas aparições de clientes tivemos hoje?",
  "Houve entregas ou pacotes pela manhã?",
  "Em quais horários houve mais movimento?",
  "Gere um gráfico de linhas do movimento por hora de ontem e hoje.",
  "Compare o movimento de hoje com ontem.",
  "O comércio foi aberto e fechado na hora correta?",
];

const chartColors = [
  "#22b394",
  "#4b79c9",
  "#e39a32",
  "#9a6bd1",
  "#df6682",
  "#4aa8b5",
  "#7b8c9f",
];

function todayInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="6" width="16" height="13" rx="4" />
      <path d="M12 3v3M8 11h.01M16 11h.01M8 15h8" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" />
      <path d="M4 4v4.6h4.6M12 8v4l2.6 1.7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function AssistantChart({ chart }: { chart: AssistantChartSpec }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = 760;
  const height = 320;
  const margin = { top: 28, right: 24, bottom: 58, left: 48 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(
    1,
    ...chart.series.flatMap((series) => series.values),
  );
  const roundedMaximum = Math.max(1, Math.ceil(maximum * 1.1));
  const labelStep = Math.max(1, Math.ceil(chart.labels.length / 12));
  const xPosition = (index: number) =>
    chart.labels.length === 1
      ? margin.left + plotWidth / 2
      : margin.left + (index / (chart.labels.length - 1)) * plotWidth;
  const yPosition = (value: number) =>
    margin.top + plotHeight - (value / roundedMaximum) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => roundedMaximum * ratio);

  function downloadSvg() {
    const element = svgRef.current;
    if (!element) return;

    const clone = element.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));

    const source = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([source], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "monitoria-grafico.svg";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={styles.chartCard}>
      <header className={styles.chartHeader}>
        <div>
          <span>VISUALIZAÇÃO</span>
          <strong>{chart.title}</strong>
        </div>
        <button type="button" onClick={downloadSvg}>
          Baixar SVG
        </button>
      </header>

      <div className={styles.chartViewport}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={chart.title}
        >
          <rect width={width} height={height} fill="#ffffff" />

          {ticks.map((tick) => {
            const y = yPosition(tick);
            return (
              <g key={tick}>
                <line
                  x1={margin.left}
                  y1={y}
                  x2={width - margin.right}
                  y2={y}
                  stroke="#e7edf2"
                  strokeWidth="1"
                />
                <text
                  x={margin.left - 9}
                  y={y + 4}
                  textAnchor="end"
                  fill="#8191a3"
                  fontSize="10"
                >
                  {compactNumber(tick)}
                </text>
              </g>
            );
          })}

          {chart.type === "line"
            ? chart.series.map((series, seriesIndex) => {
                const points = series.values
                  .map(
                    (value, index) => `${xPosition(index)},${yPosition(value)}`,
                  )
                  .join(" ");
                const color = chartColors[seriesIndex % chartColors.length];

                return (
                  <g key={series.name}>
                    <polyline
                      points={points}
                      fill="none"
                      stroke={color}
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {series.values.map((value, index) => (
                      <g key={`${series.name}-${index}`}>
                        <circle
                          cx={xPosition(index)}
                          cy={yPosition(value)}
                          r="4"
                          fill="#ffffff"
                          stroke={color}
                          strokeWidth="2.5"
                        />
                        <title>
                          {chart.labels[index]} · {series.name}: {value}
                        </title>
                      </g>
                    ))}
                  </g>
                );
              })
            : chart.labels.map((label, labelIndex) => {
                const groupWidth = plotWidth / chart.labels.length;
                const availableWidth = Math.min(42, groupWidth * 0.72);
                const barWidth = Math.max(
                  4,
                  availableWidth / chart.series.length,
                );
                const groupStart =
                  margin.left +
                  labelIndex * groupWidth +
                  (groupWidth - barWidth * chart.series.length) / 2;

                return chart.series.map((series, seriesIndex) => {
                  const value = series.values[labelIndex] ?? 0;
                  const y = yPosition(value);
                  const color = chartColors[seriesIndex % chartColors.length];

                  return (
                    <g key={`${label}-${series.name}`}>
                      <rect
                        x={groupStart + seriesIndex * barWidth}
                        y={y}
                        width={Math.max(3, barWidth - 2)}
                        height={margin.top + plotHeight - y}
                        rx="3"
                        fill={color}
                      />
                      <title>
                        {label} · {series.name}: {value}
                      </title>
                    </g>
                  );
                });
              })}

          {chart.labels.map((label, index) =>
            index % labelStep === 0 ? (
              <text
                key={label}
                x={
                  chart.type === "bar"
                    ? margin.left +
                      ((index + 0.5) / chart.labels.length) * plotWidth
                    : xPosition(index)
                }
                y={height - margin.bottom + 22}
                textAnchor="middle"
                fill="#6f8194"
                fontSize="10"
              >
                {label.length > 15 ? `${label.slice(0, 14)}…` : label}
              </text>
            ) : null,
          )}

          {chart.yLabel ? (
            <text
              x="14"
              y={margin.top + plotHeight / 2}
              transform={`rotate(-90 14 ${margin.top + plotHeight / 2})`}
              textAnchor="middle"
              fill="#8291a3"
              fontSize="10"
            >
              {chart.yLabel}
            </text>
          ) : null}
        </svg>
      </div>

      <div className={styles.chartLegend}>
        {chart.series.map((series, index) => (
          <span key={series.name}>
            <i
              style={{
                background: chartColors[index % chartColors.length],
              }}
            />
            {series.name}
          </span>
        ))}
      </div>

      {chart.note ? <small>{chart.note}</small> : null}
    </section>
  );
}

function EvidenceCard({
  event,
  timeZone,
}: {
  event: AssistantEvidence;
  timeZone: string;
}) {
  return (
    <Link
      href={`/dashboard/events/${event.id}`}
      className={styles.evidenceCard}
    >
      <div className={styles.evidenceImage}>
        {event.thumbnailAssetId ? (
          <img src={`/api/storage-assets/${event.thumbnailAssetId}`} alt="" />
        ) : (
          <img src="/favicon.svg" alt="" />
        )}
      </div>
      <div>
        <span>
          {event.siteName} · {event.cameraName}
        </span>
        <strong>{event.headline}</strong>
        <small>
          {formatDate(event.startedAt, timeZone)} ·{" "}
          {Math.round(event.confidence * 100)}%
        </small>
      </div>
      <i aria-hidden="true">›</i>
    </Link>
  );
}

export function AssistantChat({
  initialWorkspace,
  sites,
  cameras,
  timeZone,
}: Props) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [threadId, setThreadId] = useState(initialWorkspace.selectedThreadId);
  const [messages, setMessages] = useState(initialWorkspace.messages);
  const [evidence, setEvidence] = useState(initialWorkspace.evidence);
  const [message, setMessage] = useState("");
  const [siteId, setSiteId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setThreadId(initialWorkspace.selectedThreadId);
    setMessages(initialWorkspace.messages);
    setEvidence(initialWorkspace.evidence);
    setShowThreads(false);
  }, [initialWorkspace]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, pending]);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setShowThreads(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const filteredCameras = useMemo(
    () =>
      siteId ? cameras.filter((camera) => camera.siteId === siteId) : cameras,
    [cameras, siteId],
  );

  async function sendMessage(text: string) {
    const value = text.trim();
    if (!value || pending) return;

    setPending(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: value,
          threadId,
          fromDate: fromDate || null,
          toDate: toDate || null,
          cameraId: cameraId || null,
          siteId: siteId || null,
        }),
      });

      const data = (await response.json()) as
        QueryResponse | { ok: false; error: string };

      if (!response.ok || !data.ok) {
        const code = "error" in data ? data.error : "unknown";
        if (code === "too_many_requests") {
          throw new Error(
            "Muitas mensagens em sequência. Aguarde um minuto e tente novamente.",
          );
        }
        throw new Error(
          "O Assistente não conseguiu concluir a pesquisa agora.",
        );
      }

      setThreadId(data.threadId);
      setMessages((current) => [
        ...current,
        data.userMessage,
        data.assistantMessage,
      ]);
      setEvidence((current) => ({
        ...current,
        ...Object.fromEntries(data.evidence.map((item) => [item.id, item])),
      }));

      if (!threadId) {
        router.replace(`/dashboard/search?thread=${data.threadId}`);
      }
    } catch (caught) {
      setMessage(value);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível enviar a pergunta.",
      );
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(message);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(message);
    }
  }

  function startNewConversation() {
    setThreadId(null);
    setMessages([]);
    setEvidence({});
    setMessage("");
    setError("");
    setShowThreads(false);
    router.push("/dashboard/search");
  }

  const hasFilters = Boolean(siteId || cameraId || fromDate || toDate);

  return (
    <section className={styles.workspace}>
      <button
        type="button"
        className={`${styles.threadBackdrop} ${
          showThreads ? styles.threadBackdropVisible : ""
        }`}
        aria-label="Fechar conversas recentes"
        tabIndex={showThreads ? 0 : -1}
        onClick={() => setShowThreads(false)}
      />

      <aside
        className={`${styles.threadPanel} ${
          showThreads ? styles.threadPanelOpen : ""
        }`}
        aria-hidden={!showThreads}
      >
        <div className={styles.threadPanelHeader}>
          <div>
            <span>HISTÓRICO</span>
            <strong>Conversas recentes</strong>
          </div>
          <button
            type="button"
            aria-label="Fechar histórico"
            onClick={() => setShowThreads(false)}
          >
            <CloseIcon />
          </button>
        </div>

        <button
          type="button"
          className={styles.newThreadButton}
          onClick={startNewConversation}
        >
          <span>＋</span>
          Nova pesquisa
        </button>

        <nav className={styles.threadList}>
          {initialWorkspace.threads.length ? (
            initialWorkspace.threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/dashboard/search?thread=${thread.id}`}
                onClick={() => setShowThreads(false)}
                className={
                  thread.id === threadId ? styles.activeThread : undefined
                }
              >
                <span>{thread.title}</span>
                <small>{formatDate(thread.lastMessageAt, timeZone)}</small>
              </Link>
            ))
          ) : (
            <p className={styles.noThreads}>Suas pesquisas aparecerão aqui.</p>
          )}
        </nav>
      </aside>

      <div className={styles.chatPanel}>
        <div className={styles.chatHeader}>
          <div className={styles.botBadge}>
            <BotIcon />
          </div>
          <div className={styles.chatIdentity}>
            <strong>Assistente MonitorIA</strong>
            <span>Consulta eventos, períodos e indicadores visuais</span>
          </div>
          <div className={styles.chatHeaderActions}>
            <button
              type="button"
              className={styles.historyToggle}
              aria-expanded={showThreads}
              onClick={() => setShowThreads((current) => !current)}
            >
              <HistoryIcon />
              <span>Conversas</span>
              {initialWorkspace.threads.length ? (
                <i>{initialWorkspace.threads.length}</i>
              ) : null}
            </button>
            <button
              type="button"
              className={
                hasFilters ? styles.filtersActive : styles.filterToggle
              }
              onClick={() => setShowFilters((current) => !current)}
            >
              {hasFilters ? "Filtros ativos" : "Definir período"}
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className={styles.filterPanel}>
            <label>
              <span>De</span>
              <input
                type="date"
                value={fromDate}
                max={toDate || todayInZone(timeZone)}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>
            <label>
              <span>Até</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                max={todayInZone(timeZone)}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
            <label>
              <span>Local</span>
              <select
                value={siteId}
                onChange={(event) => {
                  setSiteId(event.target.value);
                  setCameraId("");
                }}
              >
                <option value="">Todos os locais</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Câmera</span>
              <select
                value={cameraId}
                onChange={(event) => setCameraId(event.target.value)}
              >
                <option value="">Todas as câmeras</option>
                {filteredCameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setSiteId("");
                setCameraId("");
              }}
            >
              Limpar
            </button>
          </div>
        ) : null}

        <div className={styles.messages}>
          {!messages.length ? (
            <div className={styles.welcome}>
              <div className={styles.welcomeIcon}>
                <BotIcon />
              </div>
              <span>PESQUISA CONVERSACIONAL</span>
              <h2>O que deseja saber sobre o seu negócio?</h2>
              <p>
                O Assistente calcula indicadores no Supabase e usa somente os
                eventos relevantes para responder. Ele também entende período,
                local e câmera escritos diretamente na pergunta. Aparições são
                estimativas e não representam pessoas únicas.
              </p>

              <div className={styles.suggestions}>
                {suggestions.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => void sendMessage(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((item) => {
              const itemEvidence = item.evidenceEventIds.flatMap((id) => {
                const event = evidence[id];
                return event ? [event] : [];
              });

              return (
                <article
                  key={item.id}
                  className={
                    item.role === "assistant"
                      ? styles.assistantMessage
                      : styles.userMessage
                  }
                >
                  {item.role === "assistant" ? (
                    <div className={styles.messageAvatar}>
                      <BotIcon />
                    </div>
                  ) : null}

                  <div className={styles.messageContent}>
                    <div className={styles.messageBubble}>
                      {item.periodLabel ? (
                        <span className={styles.periodLabel}>
                          {item.periodLabel}
                        </span>
                      ) : null}
                      <p>{item.content}</p>
                      {item.caution ? (
                        <small className={styles.caution}>{item.caution}</small>
                      ) : null}
                    </div>

                    {item.chart ? <AssistantChart chart={item.chart} /> : null}

                    {itemEvidence.length ? (
                      <div className={styles.evidenceList}>
                        <span>EVENTOS USADOS COMO EVIDÊNCIA</span>
                        {itemEvidence.map((event) => (
                          <EvidenceCard
                            key={event.id}
                            event={event}
                            timeZone={timeZone}
                          />
                        ))}
                      </div>
                    ) : null}

                    {item.role === "assistant" && item.suggestions.length ? (
                      <div className={styles.followUps}>
                        {item.suggestions.map((suggestion) => (
                          <button
                            type="button"
                            key={suggestion}
                            onClick={() => void sendMessage(suggestion)}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}

          {pending ? (
            <article className={styles.assistantMessage}>
              <div className={styles.messageAvatar}>
                <BotIcon />
              </div>
              <div className={styles.thinking}>
                <i />
                <i />
                <i />
                Consultando os eventos
              </div>
            </article>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form className={styles.composer} onSubmit={submit}>
          {error ? <p>{error}</p> : null}
          <div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={2000}
              rows={1}
              disabled={pending}
              placeholder="Pergunte sobre clientes, atendimentos, entregas, objetos, veículos, gráficos ou períodos..."
            />
            <button
              type="submit"
              disabled={pending || message.trim().length < 2}
              aria-label="Enviar pergunta"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>
          </div>
          <small>Enter envia · Shift + Enter cria uma nova linha</small>
        </form>
      </div>
    </section>
  );
}
