"use client";

import { useEffect, useState } from "react";
import styles from "./installer-platform-actions.module.css";

type DeviceKind = "loading" | "windows" | "linux-x64" | "linux-arm64" | "mobile" | "apple" | "other";
type Props = { compact?: boolean };

const MICROSOFT_STORE_URL = "https://apps.microsoft.com/store/detail/XPDC2BLXQ99DTG";

function detectDevice(): DeviceKind {
  if (typeof navigator === "undefined") return "loading";
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac) return "mobile";
  if (/Windows/i.test(ua) || /Win/i.test(platform)) return "windows";
  if (/Linux/i.test(ua) || /Linux/i.test(platform)) {
    return /aarch64|arm64/i.test(`${ua} ${platform}`) ? "linux-arm64" : "linux-x64";
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

function downloadHref(device: DeviceKind) {
  if (device === "windows") return "/api/download-agent/windows";
  if (device === "linux-x64") return "/api/download-agent/linux-x64";
  if (device === "linux-arm64") return "/api/download-agent/linux-arm64";
  return null;
}

function downloadLabel(device: DeviceKind) {
  if (device === "linux-x64") return "Baixar MonitorIA para Linux x64";
  if (device === "linux-arm64") return "Baixar MonitorIA para Linux ARM64";
  return "Baixar MonitorIA";
}

export function InstallerPlatformActions({ compact = false }: Props) {
  const [device, setDevice] = useState<DeviceKind>("loading");
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

  if (device === "loading") {
    return <div className={styles.root}><div className={styles.status}>Identificando este dispositivo…</div></div>;
  }

  if (device === "mobile") {
    return (
      <div className={styles.root}>
        <div className={styles.mobileCard}>
          <strong>Você está no celular</strong>
          <p>O Agent deve ser instalado em um computador que fique ligado e esteja na mesma rede local das câmeras, DVR ou NVR. Envie o link abaixo para esse computador.</p>
          <div className={styles.shareRow}>
            <button type="button" className={styles.primary} onClick={() => void shareInstallPage()}>Compartilhar link</button>
            <button type="button" className={styles.secondary} onClick={() => void copyInstallPage()}>{copied ? "Link copiado" : "Copiar link"}</button>
          </div>
        </div>
        {!compact ? <a className={styles.otherPlatforms} href="/instalar">Ver plataformas disponíveis</a> : null}
      </div>
    );
  }

  if (device === "apple" || device === "other") {
    return (
      <div className={styles.root}>
        <div className={styles.unsupportedCard}>
          <strong>Esta plataforma ainda não é compatível</strong>
          <p>O MonitorIA Agent precisa rodar continuamente no computador da loja. Hoje estão disponíveis:</p>
          <ul className={styles.platformList}>
            <li>Windows 10/11 · 64 bits</li>
            <li>Linux · x86_64</li>
            <li>Linux · ARM64</li>
          </ul>
        </div>
        <a className={styles.otherPlatforms} href="/instalar">Abrir página de instalação</a>
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
            <p>Para computador dedicado. Continua monitorando mesmo sem usuário conectado.</p>
            <a className={styles.primary} href="/api/download-agent/windows">Baixar MonitorIA 24/7</a>
          </div>

          <div className={styles.windowsOption}>
            <div className={styles.optionHeading}><strong>Microsoft Store</strong></div>
            <p>Para computador de uso normal. O MonitorIA inicia após o login no Windows.</p>
            <a className={styles.store} href={MICROSOFT_STORE_URL} target="_blank" rel="noreferrer">Abrir na Microsoft Store</a>
          </div>
        </div>

        <div className={styles.samePairing}>O pareamento é igual nas duas opções.</div>
        <a className={styles.otherPlatforms} href="/instalar">Precisa de outra plataforma?</a>
      </div>
    );
  }

  const href = downloadHref(device);
  return (
    <div className={styles.root}>
      <div className={styles.status}><span className={styles.statusDot} aria-hidden="true" />{platformLabel(device)}</div>
      {href ? <a className={styles.primary} href={href}>{downloadLabel(device)}</a> : null}
      <a className={styles.otherPlatforms} href="/instalar">Precisa de outra plataforma?</a>
    </div>
  );
}
