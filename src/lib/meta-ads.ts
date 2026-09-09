'use client';

import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/src/lib/analytics';

const DEFAULT_META_PIXEL_ID = '2531880573994524';
const META_PIXEL_SCRIPT_ID = 'monitoria-meta-pixel';
const META_STORAGE_PREFIX = 'monitoria_meta_ads:';

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
    __monitoriaMetaPixelId?: string;
  }
}

const measuredEvents = new Set<string>();
let pageViewSent = false;

function configuredPixelId() {
  return process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || DEFAULT_META_PIXEL_ID;
}

function analyticsConsentGranted() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === 'granted';
  } catch {
    return false;
  }
}

function ensureFbq() {
  if (typeof window === 'undefined') return null;
  if (window.fbq) return window.fbq;

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else (fbq.queue ||= []).push(args);
  } as Fbq;

  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  window.fbq = fbq;
  window._fbq = fbq;
  return fbq;
}

function loadMetaScript() {
  if (typeof document === 'undefined') return false;
  if (document.getElementById(META_PIXEL_SCRIPT_ID)) return true;

  const script = document.createElement('script');
  script.id = META_PIXEL_SCRIPT_ID;
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) firstScript.parentNode.insertBefore(script, firstScript);
  else document.head.appendChild(script);
  return true;
}

/**
 * Inicializa o Meta Pixel apenas após consentimento de medição.
 * Nenhum dado de identificação é enviado por correspondência avançada aqui.
 */
export function initializeMetaAdsPixel() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (!analyticsConsentGranted()) return false;

  const pixelId = configuredPixelId();
  if (!pixelId) return false;

  const fbq = ensureFbq();
  if (!fbq) return false;

  if (window.__monitoriaMetaPixelId !== pixelId) {
    fbq('init', pixelId);
    window.__monitoriaMetaPixelId = pixelId;
  }

  loadMetaScript();

  if (!pageViewSent) {
    fbq('track', 'PageView');
    pageViewSent = true;
  }

  return true;
}

/**
 * O Meta Pixel não é carregado enquanto o consentimento estiver negado.
 * Ao aceitar, inicializa imediatamente e registra PageView na página atual.
 */
export function applyMetaAdsConsent(granted: boolean) {
  if (!granted) return true;
  return initializeMetaAdsPixel();
}

function measureOnce(eventKey: string, eventName: string, params?: Record<string, unknown>) {
  if (!analyticsConsentGranted() || !initializeMetaAdsPixel()) return false;

  const storageKey = `${META_STORAGE_PREFIX}${eventKey}`;
  if (measuredEvents.has(eventKey)) return false;

  try {
    if (localStorage.getItem(storageKey) === '1') return false;
  } catch {
    // Deduplicação em memória continua ativa se o storage estiver indisponível.
  }

  const fbq = ensureFbq();
  if (!fbq) return false;

  measuredEvents.add(eventKey);
  fbq('track', eventName, params || {});

  try {
    localStorage.setItem(storageKey, '1');
  } catch {
    // Nada a fazer.
  }

  return true;
}

export function measureMetaAdsTrialStartedOnce() {
  return measureOnce('trial_started:self_service_24h', 'StartTrial', {
    content_name: 'MonitorIA - teste gratis 24h',
    content_category: 'monitoria',
  });
}

export function measureMetaAdsBeginCheckoutOnce(invoiceId: string, value?: number | null) {
  return measureOnce(`checkout:${invoiceId}`, 'InitiateCheckout', {
    content_name: 'MonitorIA',
    content_category: 'monitoria',
    currency: 'BRL',
    value: value ?? undefined,
  });
}

export function measureMetaAdsPurchaseOnce(invoiceId: string, value?: number | null) {
  return measureOnce(`purchase:${invoiceId}`, 'Purchase', {
    content_name: 'MonitorIA',
    content_category: 'monitoria',
    currency: 'BRL',
    value: value ?? undefined,
  });
}
