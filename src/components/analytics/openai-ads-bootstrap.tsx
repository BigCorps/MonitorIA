import Script from 'next/script';

const PRODUCTION_HOSTS = ['monitoria.cam', 'www.monitoria.cam'];

function serializeForInlineScript(value: unknown) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

/**
 * Carrega cedo para preservar o oppref da landing antes de qualquer navegação.
 * O código cliente em src/lib/openai-ads.ts mantém consentimento e eventos.
 */
export function OpenAiAdsBootstrap() {
  const pixelId = process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID?.trim();
  if (!pixelId) return null;

  const debug = process.env.NEXT_PUBLIC_OPENAI_ADS_DEBUG === 'true';
  const hosts = serializeForInlineScript(PRODUCTION_HOSTS);
  const id = serializeForInlineScript(pixelId);

  const bootstrap = `
    (function (w, d, s, u, hosts, pixelId, debug) {
      if (!hosts.includes(w.location.hostname.toLowerCase())) return;

      if (!w.oaiq) {
        var q = function () { q.q.push(arguments); };
        q.q = [];
        w.oaiq = q;

        var js = d.createElement(s);
        js.id = "monitoria-openai-ads-pixel";
        js.async = true;
        js.src = u;
        var first = d.getElementsByTagName(s)[0];
        first.parentNode.insertBefore(js, first);
      }

      var granted = false;
      try {
        granted = w.localStorage.getItem("monitoria_cookie_consent") === "granted";
      } catch (_) {}

      w.oaiq("consent", granted);
      w.oaiq("init", debug ? { pixelId: pixelId, debug: true } : { pixelId: pixelId });
      w.__monitoriaOpenAiAdsPixelId = pixelId;
    })(
      window,
      document,
      "script",
      "https://bzrcdn.openai.com/sdk/oaiq.min.js",
      ${hosts},
      ${id},
      ${debug}
    );
  `;

  return (
    <Script
      id="monitoria-openai-ads-bootstrap"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: bootstrap }}
    />
  );
}
