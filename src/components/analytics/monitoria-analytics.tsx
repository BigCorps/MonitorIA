'use client';

import { useEffect } from 'react';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  applyGoogleConsent,
  ensureGtag,
  trackEvent,
  trackEventOnce,
} from '@/src/lib/analytics';

const GTM_ID = 'GTM-MXQX5Z8X';
const PRODUCTION_HOSTS = new Set(['monitoria.cam', 'www.monitoria.cam']);

function normalize(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function parseBrl(value: string) {
  const match = value.match(/R\$\s*([0-9.]+(?:,[0-9]{2})?)/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function loadGtm() {
  if (document.getElementById('monitoria-gtm-script')) return;

  const granted = localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === 'granted';
  ensureGtag();
  applyGoogleConsent(granted, 'default');

  const script = document.createElement('script');
  script.id = 'monitoria-gtm-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(script);
}

function inspectState() {
  const text = normalize(document.body?.innerText);
  const url = new URL(window.location.href);

  if (text.includes('Teste iniciado. O MonitorIA já pode começar a receber e analisar as imagens.')) {
    trackEventOnce('trial:start', 'trial_start', {
      product: 'monitoria',
      trial_type: 'self_service_24h',
    });
  }

  const invoiceId = url.searchParams.get('invoice');
  const billingPage = url.pathname.includes('/dashboard/billing');
  if (billingPage && invoiceId) {
    const pixSection = Array.from(document.querySelectorAll('section')).find((section) =>
      normalize(section.textContent).includes('PAGAMENTO PIX BIGCORPS'),
    );
    const sectionText = normalize(pixSection?.textContent);
    const value = parseBrl(sectionText);

    trackEventOnce(`checkout:${invoiceId}`, 'begin_checkout', {
      product: 'monitoria',
      currency: 'BRL',
      value: value ?? undefined,
      transaction_id: invoiceId,
    });

    if (sectionText.includes('Pagamento confirmado')) {
      trackEventOnce(`purchase:${invoiceId}`, 'purchase', {
        product: 'monitoria',
        currency: 'BRL',
        value: value ?? undefined,
        transaction_id: invoiceId,
      });
    }
  }
}

export function MonitoriaAnalytics() {
  useEffect(() => {
    if (!PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase())) return;

    loadGtm();

    const clickHandler = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const anchor = target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href') || '';
      const label = normalize(anchor.textContent);
      if (href.includes('/login?criar=1') || /começar o teste grátis/i.test(label)) {
        trackEvent('trial_cta_click', {
          product: 'monitoria',
          link_url: href,
        });
      }
    };

    document.addEventListener('click', clickHandler, true);

    let queued = false;
    const inspect = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        inspectState();
      });
    };

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      document.removeEventListener('click', clickHandler, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
