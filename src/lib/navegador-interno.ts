'use client';

// src/lib/navegador-interno.ts
//
// Detecta quando a página está aberta dentro do navegador interno de um app
// (Instagram, Facebook, Messenger, Threads, TikTok, LinkedIn ou um WebView
// Android genérico). O Google bloqueia login com conta Google nesses
// navegadores ("Erro 403: disallowed_useragent"), então quem vem de anúncio
// da Meta e toca em "Continuar com Google" cai numa tela de erro.
//
// O Chrome, o Safari e o app instalado pela loja não são afetados.

import { useEffect, useState } from 'react';

export type NavegadorInterno = {
  /** Nome do app para exibir no aviso. */
  app: string;
  android: boolean;
  ios: boolean;
};

export function detectarNavegadorInterno(userAgent?: string): NavegadorInterno | null {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return null;

  let app: string | null = null;
  if (/Instagram/i.test(ua)) app = 'Instagram';
  else if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|FBDV/i.test(ua)) app = 'Facebook';
  else if (/Messenger/i.test(ua)) app = 'Messenger';
  else if (/Barcelona/i.test(ua)) app = 'Threads';
  else if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) app = 'TikTok';
  else if (/LinkedInApp/i.test(ua)) app = 'LinkedIn';
  else if (/Android/i.test(ua) && /; wv\)/i.test(ua)) app = 'aplicativo';

  if (!app) return null;
  return {
    app,
    android: /Android/i.test(ua),
    ios: /iPhone|iPad|iPod/i.test(ua),
  };
}

/** null no servidor e no primeiro render; preenchido depois de montar. */
export function useNavegadorInterno(): NavegadorInterno | null {
  const [info, setInfo] = useState<NavegadorInterno | null>(null);
  useEffect(() => {
    setInfo(detectarNavegadorInterno());
  }, []);
  return info;
}

/** Link que pede ao Android para abrir a página atual no Chrome. */
export function linkAbrirNoChrome(): string {
  const { host, pathname, search, hash, href } = window.location;
  return (
    `intent://${host}${pathname}${search}${hash}` +
    `#Intent;scheme=https;package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(href)};end`
  );
}
