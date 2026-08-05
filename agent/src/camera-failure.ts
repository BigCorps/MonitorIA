/**
 * Tradução de falhas de câmera para linguagem de lojista.
 *
 * O log de produção mostrou o problema: o painel recebia
 * "method DESCRIBE failed: 401 (Unauthorized) [in#0 @ 0x...]" — texto que não
 * diz a ninguém o que fazer. As três causas mais comuns em campo exigem ações
 * completamente diferentes, e sem distingui-las o suporte fica no escuro:
 *
 *   401  trocar a senha da câmera
 *   404  o caminho do stream está errado
 *   453  fechar o aplicativo do DVR no celular
 *
 * O `describeStatusMessage` do módulo de descoberta já fazia isso, mas só
 * rodava na varredura. O monitoramento contínuo ficou de fora.
 */

export type CameraFailure = {
  /** Código estável, gravado em camera_status para consulta e métrica. */
  code: string;
  /** Texto exibido ao lojista. */
  message: string;
  /** false quando repetir com a mesma configuração não pode dar certo. */
  retryable: boolean;
};

const PATTERNS: Array<{
  test: RegExp;
  code: string;
  message: string;
  retryable: boolean;
}> = [
  {
    test: /401|unauthorized|authorization failed/i,
    code: "rtsp_unauthorized",
    message:
      "A câmera recusou o usuário e a senha. Confira as credenciais no painel " +
      "da câmera — em muitos modelos o acesso de vídeo usa uma conta separada " +
      "da conta do aplicativo.",
    retryable: false,
  },
  {
    test: /\b403\b|forbidden/i,
    code: "rtsp_forbidden",
    message:
      "O usuário informado existe, mas não tem permissão para ver o vídeo. " +
      "Habilite o acesso de streaming para essa conta na câmera.",
    retryable: false,
  },
  {
    test: /\b404\b|not found|stream not found/i,
    code: "rtsp_path_not_found",
    message:
      "O endereço do vídeo não existe neste aparelho. O usuário e a senha " +
      "podem estar certos, mas o caminho do stream está errado.",
    retryable: false,
  },
  {
    test: /\b453\b|not enough bandwidth|maximum connections/i,
    code: "rtsp_too_many_clients",
    message:
      "A câmera atingiu o limite de conexões simultâneas. Feche o aplicativo " +
      "do DVR no celular ou no computador e aguarde alguns instantes.",
    retryable: true,
  },
  {
    test: /connection refused|econnrefused/i,
    code: "rtsp_refused",
    message:
      "A câmera recusou a conexão. Confirme se o serviço RTSP está habilitado " +
      "e se a porta está correta.",
    retryable: true,
  },
  {
    test: /timed out|timeout|etimedout|no route to host|ehostunreach/i,
    code: "rtsp_unreachable",
    message:
      "Não foi possível alcançar a câmera na rede. Verifique se ela está " +
      "ligada e na mesma rede deste computador.",
    retryable: true,
  },
  {
    test: /invalid data found|could not find codec|decoder not found/i,
    code: "rtsp_unsupported_stream",
    message:
      "A câmera respondeu, mas o formato de vídeo não pôde ser lido. " +
      "Tente selecionar o substream ou o formato H.264 na configuração dela.",
    retryable: false,
  },
];

export function classifyCameraFailure(raw: string): CameraFailure {
  for (const pattern of PATTERNS) {
    if (pattern.test.test(raw)) {
      return {
        code: pattern.code,
        message: pattern.message,
        retryable: pattern.retryable,
      };
    }
  }

  return {
    code: "rtsp_capture_failed",
    message:
      "Não foi possível abrir o vídeo desta câmera. " +
      "Verifique o endereço, o usuário e a senha informados.",
    retryable: true,
  };
}

/**
 * Espaçamento entre novas tentativas de uma câmera que falhou.
 *
 * Falha de credencial não melhora com repetição: o log de produção registrou
 * oito tentativas idênticas em oito minutos, cada uma reiniciando a
 * calibração do zero. Com credencial errada o intervalo sobe rápido e satura
 * em 15 minutos; falha transitória volta a tentar logo.
 */
export function retryDelayMs(failure: CameraFailure, attempts: number) {
  const base = failure.retryable ? [15_000, 30_000, 60_000, 120_000] : [60_000, 300_000, 900_000];
  const index = Math.min(attempts, base.length - 1);
  return base[index] ?? 900_000;
}
