export type CameraSelectionOption = {
  id: string;
  name: string;
};

function rawValues(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values.flatMap((entry) =>
    entry
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function parseCameraSelection(
  value: string | string[] | undefined,
  cameras: CameraSelectionOption[],
) {
  const allowed = new Set(cameras.map((camera) => camera.id));
  const selected = [...new Set(rawValues(value))].filter((id) => allowed.has(id));

  // Sem seleção explícita significa "todas". Se todas forem marcadas,
  // normalizamos para o mesmo estado para manter URLs curtas e previsíveis.
  if (!selected.length || selected.length === cameras.length) return [];
  return selected;
}

export function cameraSelectionCsv(ids: string[]) {
  return ids.join(",");
}

export function cameraSelectionLabel(
  ids: string[],
  cameras: CameraSelectionOption[],
) {
  if (!ids.length || ids.length === cameras.length) return "Todas as câmeras";

  const names = cameras
    .filter((camera) => ids.includes(camera.id))
    .map((camera) => camera.name);

  if (names.length <= 2) return names.join(" + ");
  return `${names.length} câmeras selecionadas`;
}

export function selectedCameraSet(ids: string[]) {
  return ids.length ? new Set(ids) : null;
}
