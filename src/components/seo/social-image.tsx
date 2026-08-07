import { ImageResponse } from "next/og";
import { appConfig } from "@/src/lib/app-config";

export const socialImageSize = { width: 1200, height: 630 };

/**
 * Arte de compartilhamento (WhatsApp, LinkedIn, X).
 *
 * A composição segue a linguagem da landing: régua de tempo à esquerda,
 * horário em destaque, título estreito e pesado, sem gradiente decorativo.
 *
 * NOTA SOBRE A FONTE: o Satori (motor do next/og) não enxerga o next/font.
 * Para renderizar em Archivo é preciso embutir o arquivo .ttf e passá-lo em
 * `fonts`. Enquanto isso não é feito, a arte usa a fonte padrão do Satori,
 * que é uma grotesca próxima o bastante. Instruções no fim do arquivo.
 */
export function createSocialImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#07111f",
          color: "#f2f7fd",
          fontFamily: "sans-serif",
        }}
      >
        {/* grade fina, mesma da cena de câmera */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.1,
            backgroundImage:
              "linear-gradient(rgba(88,226,199,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(88,226,199,.35) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* régua de tempo */}
        <div
          style={{
            position: "absolute",
            left: 64,
            top: 0,
            bottom: 0,
            width: 2,
            display: "flex",
            background: "rgba(148,172,200,.16)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 64,
            top: 0,
            height: 430,
            width: 2,
            display: "flex",
            background: "#58e2c7",
          }}
        />

        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
            padding: "64px 76px 64px 108px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 26,
                height: 26,
                display: "flex",
                borderRadius: 999,
                border: "5px solid #58e2c7",
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: "-1.5px",
              }}
            >
              <span>Monitor</span>
              <span style={{ color: "#58e2c7" }}>IA</span>
              <span>.cam</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                fontSize: 20,
                letterSpacing: "3px",
                color: "#63788f",
              }}
            >
              <span style={{ color: "#58e2c7" }}>09:18:42</span>
              <span>OBJETO RETIRADO DO BALCÃO</span>
            </div>

            <div
              style={{
                maxWidth: 900,
                display: "flex",
                fontSize: 82,
                lineHeight: 1,
                letterSpacing: "-5px",
                fontWeight: 800,
              }}
            >
              {appConfig.slogan}
            </div>

            <div
              style={{
                maxWidth: 780,
                display: "flex",
                fontSize: 27,
                color: "#9db0c6",
                lineHeight: 1.35,
              }}
            >
              Pergunte o que aconteceu na sua loja e receba o horário exato. Sem trocar de
              câmera, sem rebobinar gravação.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 21,
              paddingTop: 28,
              borderTop: "1px solid rgba(148,172,200,.16)",
            }}
          >
            <span style={{ color: "#58e2c7" }}>{appConfig.domain}</span>
            <span style={{ color: "#63788f" }}>
              R$ 39,90 por câmera · 365 dias de histórico · sem cartão
            </span>
          </div>
        </div>
      </div>
    ),
    socialImageSize,
  );
}

/*
 * Para renderizar em Archivo, quando quiser:
 *
 * 1. Baixe Archivo-Bold.ttf e Archivo-Regular.ttf de
 *    https://fonts.google.com/specimen/Archivo e coloque em
 *    src/components/seo/fonts/.
 * 2. Troque a assinatura por `export async function createSocialImage()`.
 * 3. Carregue os arquivos e passe no segundo argumento:
 *
 *    const bold = await fetch(new URL("./fonts/Archivo-Bold.ttf", import.meta.url))
 *      .then((r) => r.arrayBuffer());
 *
 *    return new ImageResponse(<...>, {
 *      ...socialImageSize,
 *      fonts: [{ name: "Archivo", data: bold, weight: 700, style: "normal" }],
 *    });
 *
 * 4. Ajuste opengraph-image.tsx e twitter-image.tsx para `async` + `await`.
 *
 * Não deixei isso pronto porque o build quebra se o .ttf não estiver no
 * repositório, e você está rodando o build agora.
 */
