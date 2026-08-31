'use client';

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;
export const ANALYTICS_CONSENT_STORAGE_KEY = 'monitoria_cookie_consent';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function layer() {
  if (typeof window === 'undefined') return null;
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

export function ensureGtag() {
  const target = layer();
  if (!target || typeof window === 'undefined') return null;
  if (!window.gtag) window.gtag = (...args: unknown[]) => target.push(args);
  return window.gtag;
}

export function applyGoogleConsent(granted: boolean, mode: 'default' | 'update' = 'update') {
  const gtag = ensureGtag();
  if (!gtag) return;
  gtag('consent', mode, {
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: granted ? 'granted' : 'denied',
    ad_user_data: granted ? 'granted' : 'denied',
    ad_personalization: granted ? 'granted' : 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: mode === 'default' ? 500 : undefined,
  });
}

export function trackEvent(event: string, params: AnalyticsParams = {}) {
  const target = layer();
  if (!target) return;
  target.push({
    event,
    ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)),
  });
}

export function trackEventOnce(key: string, event: string, params: AnalyticsParams = {}) {
  if (typeof window === 'undefined') return false;
  const storageKey = `monitoria_analytics:${key}`;
  try {
    if (localStorage.getItem(storageKey) === '1') return false;
    trackEvent(event, params);
    localStorage.setItem(storageKey, '1');
    return true;
  } catch {
    trackEvent(event, params);
    return true;
  }
}
