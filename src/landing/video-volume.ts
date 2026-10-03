export type VideoVolume = {
  cameraCount: number;
  hoursPerDay: number;
  dailyHours: number;
  monthlyHours: number;
  workdaysForOneDay: number;
};

function clampInteger(value: number, min: number, max: number) {
  const normalized = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, normalized));
}

export function calculateVideoVolume(
  cameraCount: number,
  hoursPerDay: number,
): VideoVolume {
  const cameras = clampInteger(cameraCount, 1, 100000);
  const hours = clampInteger(hoursPerDay, 1, 24);
  const dailyHours = cameras * hours;

  return {
    cameraCount: cameras,
    hoursPerDay: hours,
    dailyHours,
    monthlyHours: dailyHours * 30,
    workdaysForOneDay: dailyHours / 8,
  };
}
