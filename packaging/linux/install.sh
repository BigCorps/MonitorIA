#!/usr/bin/env bash
#
# Instalador do MonitorIA Agent para Linux.
#
# Equivalente do MonitorIA-Setup.exe. Sem assinatura de código e sem
# SmartScreen: em Linux a confiança vem do canal de distribuição, não de um
# certificado, o que torna esta plataforma bem mais barata de lançar.
#
#   sudo ./install.sh                    instala e pergunta o código
#   sudo ./install.sh --code 12345678    instala e pareia direto
#   sudo ./install.sh --uninstall        remove completamente o MonitorIA

set -euo pipefail

PREFIX="/opt/monitoria"
STATE_DIR="/var/lib/monitoria"
SERVICE_USER="monitoria"
UNIT_NAME="monitoria-agent.service"
UNIT_PATH="/etc/systemd/system/${UNIT_NAME}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PAIRING_CODE=""
UNINSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --code) PAIRING_CODE="${2:-}"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "Opção desconhecida: $1" >&2; exit 2 ;;
  esac
done

die() { echo "Erro: $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "Execute com sudo."
command -v systemctl >/dev/null 2>&1 || die "Este instalador requer systemd."

if [[ "$UNINSTALL" -eq 1 ]]; then
  systemctl stop "$UNIT_NAME" 2>/dev/null || true
  systemctl disable "$UNIT_NAME" 2>/dev/null || true
  rm -f "$UNIT_PATH"
  systemctl daemon-reload
  systemctl reset-failed "$UNIT_NAME" 2>/dev/null || true
  rm -rf "$PREFIX"
  rm -rf "$STATE_DIR"

  if id -u "$SERVICE_USER" >/dev/null 2>&1; then
    userdel "$SERVICE_USER" 2>/dev/null || true
  fi

  echo "MonitorIA removido completamente."
  echo "Uma nova instalação exigirá novo pareamento."
  exit 0
fi

for required in monitoria-agent ffmpeg ffprobe "$UNIT_NAME"; do
  [[ -e "${SOURCE_DIR}/${required}" ]] || die "Arquivo ausente no pacote: ${required}"
done

# Usuário de sistema sem shell e sem home: o serviço não precisa de nenhum
# dos dois, e negar por padrão limita o estrago de uma falha.
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  echo "Usuário de serviço ${SERVICE_USER} criado."
fi

echo "Instalando em ${PREFIX}..."
install -d -m 0755 "$PREFIX" "${PREFIX}/ffmpeg"
install -m 0755 "${SOURCE_DIR}/monitoria-agent" "${PREFIX}/monitoria-agent"
install -m 0755 "${SOURCE_DIR}/ffmpeg" "${PREFIX}/ffmpeg/ffmpeg"
install -m 0755 "${SOURCE_DIR}/ffprobe" "${PREFIX}/ffmpeg/ffprobe"

for extra in LICENSE.txt FFMPEG-ORIGEM.txt; do
  [[ -f "${SOURCE_DIR}/${extra}" ]] && install -m 0644 "${SOURCE_DIR}/${extra}" "${PREFIX}/ffmpeg/${extra}"
done

install -d -m 0700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$STATE_DIR"

install -m 0644 "${SOURCE_DIR}/${UNIT_NAME}" "$UNIT_PATH"
systemctl daemon-reload
systemctl enable --now "$UNIT_NAME"

# O serviço precisa estar no ar antes do pareamento: quem pareia é ele, pelo
# canal local. O instalador só repassa o código.
for _ in $(seq 1 20); do
  systemctl is-active --quiet "$UNIT_NAME" && break
  sleep 0.5
done

systemctl is-active --quiet "$UNIT_NAME" ||
  die "O serviço não iniciou. Veja: journalctl -u ${UNIT_NAME} -n 50"

echo "Serviço ativo."

if [[ -z "$PAIRING_CODE" ]]; then
  echo
  echo "Abra a câmera no painel do MonitorIA e gere o código de pareamento."
  echo "Ele vale 15 minutos. Deixe em branco para parear depois."
  read -r -p "Código de pareamento: " PAIRING_CODE || true
fi

if [[ -z "$PAIRING_CODE" ]]; then
  echo
  echo "Instalado e aguardando pareamento. Quando tiver o código:"
  echo "  sudo -u ${SERVICE_USER} ${PREFIX}/monitoria-agent pair --code SEUCODIGO"
  exit 0
fi

if sudo -u "$SERVICE_USER" "${PREFIX}/monitoria-agent" pair --code "$PAIRING_CODE"; then
  echo
  echo "Pareado. Para localizar as câmeras da rede:"
  echo "  sudo -u ${SERVICE_USER} ${PREFIX}/monitoria-agent discover"
else
  # Falha de pareamento não desfaz a instalação: o serviço está no ar e o
  # lojista tenta de novo sem repetir o download.
  echo
  echo "O pareamento falhou — código expirado ou sem internet." >&2
  echo "O MonitorIA está instalado. Tente de novo com:" >&2
  echo "  sudo -u ${SERVICE_USER} ${PREFIX}/monitoria-agent pair --code SEUCODIGO" >&2
  exit 1
fi
