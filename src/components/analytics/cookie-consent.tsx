'use client';

import { useEffect, useState } from 'react';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  applyGoogleConsent,
} from '@/src/lib/analytics';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    if (stored === 'granted') {
      applyGoogleConsent(true);
      return;
    }
    if (stored === 'denied') {
      applyGoogleConsent(false);
      return;
    }
    setVisible(true);
  }, []);

  function choose(granted: boolean) {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, granted ? 'granted' : 'denied');
    applyGoogleConsent(granted);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Preferências de cookies"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 1000,
        maxWidth: 430,
        padding: 16,
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: 16,
        background: 'rgba(7,17,31,.96)',
        color: '#f8fafc',
        boxShadow: '0 18px 50px rgba(0,0,0,.35)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.55, color: '#cbd5e1' }}>
        Usamos cookies de medição para entender a navegação e melhorar o MonitorIA. Você pode aceitar ou recusar os cookies não essenciais.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => choose(true)}
          style={{ flex: 1, border: 0, borderRadius: 999, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' }}
        >
          Aceitar
        </button>
        <button
          type="button"
          onClick={() => choose(false)}
          style={{ flex: 1, border: '1px solid rgba(255,255,255,.2)', borderRadius: 999, padding: '10px 14px', fontWeight: 800, cursor: 'pointer', background: 'transparent', color: '#e2e8f0' }}
        >
          Recusar
        </button>
      </div>
    </div>
  );
}
