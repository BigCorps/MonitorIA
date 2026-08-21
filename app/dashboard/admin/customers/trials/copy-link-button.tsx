"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./trials.module.css";

type Props = {
  value: string;
};

export function CopyLinkButton({ value }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2200);
  }

  return (
    <button
      type="button"
      className={styles.copyButton}
      onClick={copyLink}
      aria-label="Copiar link da demonstração"
    >
      {copied ? "✓ Copiado" : "Copiar link"}
    </button>
  );
}
