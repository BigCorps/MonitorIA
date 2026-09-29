'use client';

import { useEffect, useState } from 'react';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  applyGoogleConsent,
} from '@/src/lib/analytics';
import { applyOpenAiAdsConsent } from '@/src/lib/openai-ads';
import { applyMetaAdsConsent } from '@/src/lib/meta-ads';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  // Celular: cartão compacto para não cobrir a primeira tela (Clarity mostrou
  // pouca rolagem e o aviso competindo com o botão principal).
  const [compacto, setCompacto] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 639px)');
    const atualizar = () => setCompacto(consulta.matches);
    atualizar();
    consulta.addEventListener('change', atualizar);
    return () => consulta.removeEventListener('change', atualizar);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    if (stored === 'granted') {
      applyGoogleConsent(true);
      applyOpenAiAdsConsent(true);
      applyMetaAdsConsent(true);
      return;
    }
    if (stored === 'denied') {
      applyGoogleConsent(false);
      applyOpenAiAdsConsent(false);
      applyMetaAdsConsent(false);
      return;
    }
    setVisible(true);
  }, []);

  function choose(granted: boolean) {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, granted ? 'granted' : 'denied');
    applyGoogleConsent(granted);
    applyOpenAiAdsConsent(granted);
    applyMetaAdsConsent(granted);
    setVisible(false);
  }

  if (!visible) return null;

  // Botões com 44px de altura (mínimo recomendado para toque) e o mesmo
  // tamanho para Aceitar e Recusar, como pede a LGPD.
  const botaoBase = {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    padding: '0 14px',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1,
    cursor: 'pointer',
  } as const;

  return (
    <div
      role="dialog"
      aria-label="Preferências de cookies"
      style={{
        position: 'fixed',
        left: compacto ? 12 : 16,
        right: compacto ? 12 : 16,
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${compacto ? 12 : 16}px)`,
        zIndex: 1000,
        maxWidth: 430,
        padding: compacto ? 12 : 16,
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: 16,
        background: 'rgba(7,17,31,.96)',
        color: '#f8fafc',
        boxShadow: '0 18px 50px rgba(0,0,0,.35)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <p style={{ margin: compacto ? '0 0 10px' : '0 0 12px', fontSize: 13, lineHeight: compacto ? 1.4 : 1.55, color: '#cbd5e1' }}>
        {compacto ? (
          <>
            Usamos cookies para melhorar sua experiência.{' '}
            <a href="/privacidade" style={{ color: '#58e2c7', fontWeight: 700 }}>
              Saiba mais
            </a>
          </>
        ) : (
          <>
            Usamos cookies de medição para entender a navegação, atribuir resultados de
            campanhas e melhorar o MonitorIA. Você pode aceitar ou recusar os cookies não
            essenciais. Veja a nossa{' '}
            <a href="/privacidade" style={{ color: '#58e2c7' }}>
              política de privacidade
            </a>
            .
          </>
        )}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => choose(true)}
          style={{ ...botaoBase, border: 0, background: '#f8fafc', color: '#07111f' }}
        >
          Aceitar
        </button>
        <button
          type="button"
          onClick={() => choose(false)}
          style={{ ...botaoBase, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: '#e2e8f0' }}
        >
          Recusar
        </button>
      </div>
    </div>
  );
}
