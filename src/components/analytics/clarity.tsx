import Script from "next/script";

/**
 * Microsoft Clarity.
 *
 * REGRA: este componente NUNCA pode ser montado em `app/layout.tsx` nem em
 * qualquer rota sob `/dashboard`. O Clarity grava sessão, e uma gravação do
 * painel capturaria keyframes de câmeras de clientes saindo do domínio.
 * Use apenas em páginas públicas de marketing.
 *
 * `lazyOnload` mantém o script fora do caminho crítico: não afeta LCP.
 * Sem `NEXT_PUBLIC_CLARITY_PROJECT_ID` definido, nada é carregado.
 */
export function ClarityScript() {
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim();
  if (!projectId) return null;

  return (
    <Script id="ms-clarity" strategy="lazyOnload">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${projectId}");`}
    </Script>
  );
}
