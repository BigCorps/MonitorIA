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
  "Mostre situações com objetos movimentados no balcão.",
  "Compare o movimento de hoje com ontem.",
  "Quais veículos ficaram próximos à entrada?",
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

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="6" width="16" height="13" rx="4" />
      <path d="M12 3v3M8 11h.01M16 11h.01M8 15h8" />
    </svg>
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
          <img
            src={`/api/storage-assets/${event.thumbnailAssetId}`}
            alt=""
          />
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
  const [threadId, setThreadId] = useState(
    initialWorkspace.selectedThreadId,
  );
  const [messages, setMessages] = useState(
    initialWorkspace.messages,
  );
  const [evidence, setEvidence] = useState(
    initialWorkspace.evidence,
  );
  const [message, setMessage] = useState("");
  const [siteId, setSiteId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setThreadId(initialWorkspace.selectedThreadId);
    setMessages(initialWorkspace.messages);
    setEvidence(initialWorkspace.evidence);
  }, [initialWorkspace]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, pending]);

  const filteredCameras = useMemo(
    () =>
      siteId
        ? cameras.filter((camera) => camera.siteId === siteId)
        : cameras,
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
        | QueryResponse
        | { ok: false; error: string };

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
        ...Object.fromEntries(
          data.evidence.map((item) => [item.id, item]),
        ),
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
    router.push("/dashboard/search");
  }

  const hasFilters = Boolean(
    siteId || cameraId || fromDate || toDate,
  );

  return (
    <section className={styles.workspace}>
      <aside className={styles.threadPanel}>
        <button
          type="button"
          className={styles.newThreadButton}
          onClick={startNewConversation}
        >
          <span>＋</span>
          Nova pesquisa
        </button>

        <div className={styles.threadHeading}>
          <span>CONVERSAS RECENTES</span>
        </div>

        <nav className={styles.threadList}>
          {initialWorkspace.threads.length ? (
            initialWorkspace.threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/dashboard/search?thread=${thread.id}`}
                className={
                  thread.id === threadId
                    ? styles.activeThread
                    : undefined
                }
              >
                <span>{thread.title}</span>
                <small>
                  {formatDate(thread.lastMessageAt, timeZone)}
                </small>
              </Link>
            ))
          ) : (
            <p className={styles.noThreads}>
              Suas pesquisas aparecerão aqui.
            </p>
          )}
        </nav>
      </aside>

      <div className={styles.chatPanel}>
        <div className={styles.chatHeader}>
          <div className={styles.botBadge}>
            <BotIcon />
          </div>
          <div>
            <strong>Assistente MonitorIA</strong>
            <span>
              Consulta eventos, períodos e indicadores visuais
            </span>
          </div>
          <button
            type="button"
            className={
              hasFilters
                ? styles.filtersActive
                : styles.filterToggle
            }
            onClick={() => setShowFilters((current) => !current)}
          >
            {hasFilters ? "Filtros ativos" : "Definir período"}
          </button>
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
                O Assistente calcula indicadores no Supabase e usa
                somente os eventos relevantes para responder. Aparições
                são estimativas e não representam pessoas únicas.
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
                        <small className={styles.caution}>
                          {item.caution}
                        </small>
                      ) : null}
                    </div>

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

                    {item.role === "assistant" &&
                    item.suggestions.length ? (
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
              rows={2}
              disabled={pending}
              placeholder="Pergunte sobre clientes, atendimentos, entregas, objetos, veículos ou períodos..."
            />
            <button
              type="submit"
              disabled={pending || message.trim().length < 2}
              aria-label="Enviar pergunta"
            >
              ↑
            </button>
          </div>
          <small>
            Enter envia · Shift + Enter cria uma nova linha
          </small>
        </form>
      </div>
    </section>
  );
}
