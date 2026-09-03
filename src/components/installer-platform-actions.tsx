"use client";

import { useEffect, useState } from "react";
import styles from "./installer-platform-actions.module.css";

type DeviceKind =
  | "loading"
  | "windows"
  | "linux-x64"
  | "linux-arm64"
  | "mobile"
  | "apple"
  | "other";

type Props = { compact?: boolean };

const MICROSOFT_STORE_URL =
  "https://apps.microsoft.com/store/detail/XPDC2BLXQ99DTG";

function detectDevice(): DeviceKind {
  if (typeof navigator === "undefined") return "loading";
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;

  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac) return "mobile";
  if (/Windows/i.test(ua) || /Win/i.test(platform)) return "windows";
  if (/Linux/i.test(ua) || /Linux/i.test(platform)) {
    return /aarch64|arm64/i.test(`${ua} ${platform}`)
      ? "linux-arm64"
      : "linux-x64";
  }
  if (/Macintosh|Mac OS X|MacIntel/i.test(`${ua} ${platform}`)) return "apple";
  return "other";
}

function platformLabel(device: DeviceKind) {
  if (device === "windows") return "Windows 64 bits detectado";
  if (device === "linux-x64") return "Linux x86_64 detectado";
  if (device === "linux-arm64") return "Linux ARM64 detectado";
  return "";
}

export function InstallerPlatformActions({ compact = false }: Props) {
  const [device, setDevice] = useState<DeviceKind>("loading");
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setDevice(detectDevice()), []);

  async function copyInstallPage() {
    const url = `${window.location.origin}/instalar`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  async function shareInstallPage() {
    const url = `${window.location.origin}/instalar`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Instalar MonitorIA",
          text: "Abra este link no computador que ficará ligado na mesma rede das câmeras.",
          url,
        });
        return;
      } catch {
        return;
      }
    }
    await copyInstallPage();
  }

  function otherPlatformsButton() {
    return (
      <button
        type="button"
        className={styles.otherPlatforms}
        onClick={() => setShowAllPlatforms(true)}
      >
        Precisa de outra plataforma?
      </button>
    );
  }

  if (device === "loading") {
    return (
      <div className={styles.root}>
        <div className={styles.status}>Identificando este dispositivo…</div>
      </div>
    );
  }

  if (showAllPlatforms) {
    return (
      <div className={styles.root}>
        <div className={styles.status}>Escolha a plataforma deste computador</div>

        <div className={styles.platformOptions}>
          <div className={styles.platformOption}>
            <strong>Windows 10/11 · 64 bits</strong>
            <p>Versão 24/7 para computador dedicado.</p>
            <a className={styles.primary} href="/api/download-agent/windows">
              Baixar MonitorIA 24/7
            </a>
          </div>

          <div className={styles.platformOption}>
            <strong>Linux · x86_64</strong>
            <p>Para computadores Linux com processador Intel ou AMD 64 bits.</p>
            <a className={styles.primary} href="/api/download-agent/linux-x64">
              Baixar Linux x64
            </a>
          </div>

          <div className={styles.platformOption}>
            <strong>Linux · ARM64</strong>
            <p>Para computadores e dispositivos Linux ARM64.</p>
            <a className={styles.primary} href="/api/download-agent/linux-arm64">
              Baixar Linux ARM64
            </a>
          </div>
        </div>

        <button
          type="button"
          className={styles.otherPlatforms}
          onClick={() => setShowAllPlatforms(false)}
        >
          Voltar para a opção detectada
        </button>
      </div>
    );
  }

  if (device === "mobile") {
    return (
      <div className={styles.root}>
        <div className={styles.mobileCard}>
          <strong>Você está no celular</strong>
          <p>
            O Agent deve ser instalado em um computador que fique ligado e
            esteja na mesma rede local das câmeras, DVR ou NVR. Envie o link
            abaixo para esse computador.
          </p>
          <div className={styles.shareRow}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void shareInstallPage()}
            >
              Compartilhar link
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void copyInstallPage()}
            >
              {copied ? "Link copiado" : "Copiar link"}
            </button>
          </div>
        </div>
        {otherPlatformsButton()}
      </div>
    );
  }

  if (device === "apple" || device === "other") {
    return (
      <div className={styles.root}>
        <div className={styles.unsupportedCard}>
          <strong>Esta plataforma ainda não é compatível</strong>
          <p>
            O MonitorIA Agent precisa rodar continuamente no computador da loja.
            Hoje estão disponíveis Windows e Linux.
          </p>
        </div>
        {otherPlatformsButton()}
      </div>
    );
  }

  if (device === "windows") {
    return (
      <div className={styles.root}>
        <div className={styles.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          {platformLabel(device)}
        </div>

        <div className={styles.windowsOptions}>
          <div className={styles.windowsOption}>
            <div className={styles.optionHeading}>
              <strong>MonitorIA 24/7</strong>
              <span className={styles.recommended}>RECOMENDADO</span>
            </div>
            <p>
              Para computador dedicado. Continua monitorando mesmo sem usuário
              conectado.
            </p>
            <a className={styles.primary} href="/api/download-agent/windows">
              Baixar MonitorIA 24/7
            </a>
          </div>

          <div className={styles.windowsOption}>
            <div className={styles.optionHeading}>
              <strong>Microsoft Store</strong>
            </div>
            <p>
              Para computador de uso normal. O MonitorIA inicia após o login no
              Windows.
            </p>
            <a
              className={styles.store}
              href={MICROSOFT_STORE_URL}
              target="_blank"
              rel="noreferrer"
            >
              Abrir na Microsoft Store
            </a>
          </div>
        </div>

        <div className={styles.samePairing}>
          O pareamento é igual nas duas opções.
        </div>
        {otherPlatformsButton()}
      </div>
    );
  }

  const linuxArm = device === "linux-arm64";
  return (
    <div className={styles.root}>
      <div className={styles.status}>
        <span className={styles.statusDot} aria-hidden="true" />
        {platformLabel(device)}
      </div>
      <a
        className={styles.primary}
        href={
          linuxArm
            ? "/api/download-agent/linux-arm64"
            : "/api/download-agent/linux-x64"
        }
      >
        {linuxArm ? "Baixar MonitorIA para Linux ARM64" : "Baixar MonitorIA para Linux x64"}
      </a>
      {otherPlatformsButton()}
    </div>
  );
}
