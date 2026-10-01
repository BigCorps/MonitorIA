"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "./vip-onboarding.module.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type QueryResponse = {
  ok: true;
  threadId: string;
  userMessage: Message;
  assistantMessage: Message & { suggestions?: string[] };
};

const starterQuestions = [
  "O que merece atenção agora?",
  "Qual câmera teve mais atividade?",
  "Alguma câmera apresentou problema?",
  "Houve atividade depois do fechamento?",
  "Compare as câmeras do piloto.",
  "Resuma o que aconteceu nos últimos 30 minutos.",
];

export function VipAssistantPanel({
  initialRemaining,
  trialFinished = false,
}: {
  initialRemaining: number;
  trialFinished?: boolean;
}) {
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [remaining, setRemaining] = useState(initialRemaining);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function ask(raw: string) {
    const value = raw.trim();
    if (value.length < 2 || pending || remaining <= 0) return;

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
          fromDate: null,
          toDate: null,
          cameraId: null,
          siteId: null,
        }),
      });

      const data = (await response.json()) as
        | QueryResponse
        | { ok: false; error: string };

      if (!response.ok || !data.ok) {
        const code = "error" in data ? data.error : "unknown";
        if (code === "too_many_requests") {
          throw new Error("Muitas perguntas em sequência. Aguarde um minuto e tente novamente.");
        }
        throw new Error("A Pesquisa IA não conseguiu concluir esta pergunta agora.");
      }

      setThreadId(data.threadId);
      setMessages((current) => [
        ...current,
        { ...data.userMessage, role: "user" },
        { ...data.assistantMessage, role: "assistant" },
      ]);
      setRemaining((current) => Math.max(0, current - 1));
      window.setTimeout(() => router.refresh(), 700);
    } catch (caught) {
      setMessage(value);
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar a pergunta.");
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(message);
  }

  return (
    <section className={styles.vipAssistant}>
      <header className={styles.vipAssistantHeader}>
        <div>
          <span>PESQUISA IA · MOTOR MÁXIMO</span>
          <h3>{trialFinished ? "Continue explorando o que foi capturado" : "Pergunte à sua própria operação"}</h3>
          <p>
            {trialFinished
              ? "A captura terminou, mas a inteligência continua consultando os dados já registrados durante o período de exploração."
              : "Use linguagem natural enquanto o piloto acontece. As respostas usam os dados reais que o MonitorIA está estruturando."}
          </p>
        </div>
        <strong>{remaining} pergunta(s) disponível(is)</strong>
      </header>

      {!messages.length ? (
        <div className={styles.vipAssistantSuggestions}>
          {starterQuestions.map((question) => (
            <button key={question} type="button" onClick={() => void ask(question)} disabled={pending || remaining <= 0}>
              {question}
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.vipAssistantMessages}>
          {messages.map((item) => (
            <article key={item.id} data-role={item.role}>
              <span>{item.role === "assistant" ? "MonitorIA" : "Você"}</span>
              <p>{item.content}</p>
            </article>
          ))}
          {pending ? <div className={styles.vipAssistantThinking}>Consultando os dados do piloto…</div> : null}
        </div>
      )}

      {remaining <= 0 ? (
        <div className={styles.vipAssistantLimit}>
          A franquia de perguntas deste piloto foi utilizada. Os resultados já gerados continuam disponíveis.
        </div>
      ) : (
        <form className={styles.vipAssistantComposer} onSubmit={submit}>
          {error ? <p>{error}</p> : null}
          <div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2000}
              rows={2}
              disabled={pending}
              placeholder="Ex.: O que merece atenção neste momento?"
            />
            <button type="submit" disabled={pending || message.trim().length < 2}>
              {pending ? "Consultando…" : "Perguntar"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
