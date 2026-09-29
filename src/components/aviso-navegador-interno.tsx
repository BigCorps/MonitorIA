'use client';

// src/components/aviso-navegador-interno.tsx
//
// Aparece no lugar do botão "Continuar com Google" quando a página está no
// navegador interno de um app (ver src/lib/navegador-interno.ts). Explica o
// motivo, oferece abrir no navegador de verdade e aponta para o e-mail,
// que funciona normalmente aqui dentro.

import { useState } from 'react';
import { linkAbrirNoChrome, type NavegadorInterno } from '@/src/lib/navegador-interno';

type Cores = {
  texto: string;
  textoSuave: string;
  borda: string;
  fundo: string;
  botao: string;
  botaoTexto: string;
};

export default function AvisoNavegadorInterno({
  info,
  cores,
  grande = false,
}: {
  info: NavegadorInterno;
  cores: Cores;
  /** Letras e botões maiores. */
  grande?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  const fonteTitulo = grande ? 21 : 14;
  const fonteTexto = grande ? 19 : 13;
  const alturaBotao = grande ? 64 : 44;

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt('Copie o link:', window.location.href);
    }
  }

  const estiloBotao = {
    minHeight: alturaBotao,
    width: '100%',
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: fonteTexto,
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
  } as const;

  return (
    <div
      role="note"
      style={{
        border: `1px solid ${cores.borda}`,
        background: cores.fundo,
        borderRadius: grande ? 16 : 12,
        padding: grande ? 18 : 14,
        display: 'grid',
        gap: grande ? 12 : 10,
      }}
    >
      <p style={{ margin: 0, fontSize: fonteTitulo, fontWeight: 700, color: cores.texto, lineHeight: 1.35 }}>
        Você está no navegador do {info.app}
      </p>
      <p style={{ margin: 0, fontSize: fonteTexto, color: cores.textoSuave, lineHeight: 1.5 }}>
        O Google não permite entrar com a conta Google aqui dentro.
        {' '}<strong style={{ color: cores.texto }}>Use seu e-mail logo abaixo</strong>
        {info.android
          ? ', ou abra esta página no Chrome para usar o Google.'
          : ', ou toque em ··· no canto da tela e escolha “Abrir no navegador” para usar o Google.'}
      </p>

      {info.android ? (
        <a
          href={linkAbrirNoChrome()}
          style={{ ...estiloBotao, background: cores.botao, color: cores.botaoTexto, border: 0 }}
        >
          Abrir no Chrome
        </a>
      ) : null}

      <button
        type="button"
        onClick={copiarLink}
        style={{ ...estiloBotao, background: 'transparent', color: cores.texto, border: `1px solid ${cores.borda}` }}
      >
        {copiado ? 'Link copiado ✓' : 'Copiar link da página'}
      </button>
    </div>
  );
}
