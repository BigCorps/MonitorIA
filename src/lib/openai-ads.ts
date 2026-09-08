'use client';

import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/src/lib/analytics';

const OPENAI_ADS_SDK_URL = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';
const OPENAI_ADS_SCRIPT_ID = 'monitoria-openai-ads-pixel';
const OPENAI_ADS_STORAGE_PREFIX = 'monitoria_openai_ads:';

type OpenAiAdsQueue = ((...args: unknown[]) => void) & {
  q: IArguments[];
};

declare global {
  interface Window {
    oaiq?: OpenAiAdsQueue;
    __monitoriaOpenAiAdsPixelId?: string;
  }
}

const measuredEvents = new Set<string>();

function configuredPixelId() {
  return process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID?.trim() || null;
}

function ensureOpenAiAdsQueue() {
  if (typeof window === 'undefined') return null;
  if (window.oaiq) return window.oaiq;

  const queue = (function () {
    queue.q.push(arguments);
  }) as OpenAiAdsQueue;
  queue.q = [];

  window.oaiq = queue;
  return queue;
}

function analyticsConsentGranted() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Inicializa o pixel com consentimento negado por padrão. A atribuição só é
 * habilitada quando a pessoa já aceitou os cookies de medição.
 */
export function initializeOpenAiAdsPixel() {
  const pixelId = configuredPixelId();
  if (!pixelId || typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const oaiq = ensureOpenAiAdsQueue();
  if (!oaiq) return false;

  oaiq('consent', analyticsConsentGranted());

  if (window.__monitoriaOpenAiAdsPixelId !== pixelId) {
    const debug = process.env.NEXT_PUBLIC_OPENAI_ADS_DEBUG === 'true';
    oaiq('init', debug ? { pixelId, debug: true } : { pixelId });
    window.__monitoriaOpenAiAdsPixelId = pixelId;
  }

  if (!document.getElementById(OPENAI_ADS_SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = OPENAI_ADS_SCRIPT_ID;
    script.async = true;
    script.src = OPENAI_ADS_SDK_URL;
    document.head.appendChild(script);
  }

  return true;
}

export function applyOpenAiAdsConsent(granted: boolean) {
  if (!configuredPixelId()) return false;
  const oaiq = ensureOpenAiAdsQueue();
  if (!oaiq) return false;
  oaiq('consent', granted);
  return true;
}

/**
 * Envia a conversão padrão da OpenAI apenas após o início real das 24 horas.
 * Não envia e-mail, nome, ID de usuário, ID de organização ou dados de câmera.
 */
export function measureOpenAiAdsTrialStartedOnce() {
  if (!analyticsConsentGranted() || !initializeOpenAiAdsPixel()) return false;

  const eventKey = 'trial_started:self_service_24h';
  const storageKey = `${OPENAI_ADS_STORAGE_PREFIX}${eventKey}`;

  if (measuredEvents.has(eventKey)) return false;
  try {
    if (localStorage.getItem(storageKey) === '1') return false;
  } catch {
    // A deduplicação em memória continua ativa quando o storage está bloqueado.
  }

  const oaiq = ensureOpenAiAdsQueue();
  if (!oaiq) return false;

  measuredEvents.add(eventKey);
  oaiq('measure', 'trial_started', {
    type: 'plan_enrollment',
    plan_id: 'monitoria_self_service_24h',
  });

  try {
    localStorage.setItem(storageKey, '1');
  } catch {
    // Nada a fazer: o Set acima evita repetição durante esta navegação.
  }

  return true;
}
