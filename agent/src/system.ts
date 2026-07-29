import os from "node:os";
import { statfs } from "node:fs/promises";

function cpuSnapshot() {
  return os.cpus().reduce(
    (accumulator, cpu) => {
      const total = Object.values(cpu.times).reduce(
        (sum, value) => sum + value,
        0,
      );

      return {
        idle: accumulator.idle + cpu.times.idle,
        total: accumulator.total + total,
      };
    },
    { idle: 0, total: 0 },
  );
}

export async function cpuPercent() {
  const before = cpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const after = cpuSnapshot();

  const total = after.total - before.total;
  const idle = after.idle - before.idle;
  if (total <= 0) return null;

  return Math.max(
    0,
    Math.min(
      100,
      Number(((1 - idle / total) * 100).toFixed(2)),
    ),
  );
}

export async function systemMetrics(
  directory: string,
  queuedEvents = 0,
) {
  let diskFreeBytes: number | null = null;

  try {
    const stats = await statfs(directory);
    diskFreeBytes =
      Number(stats.bavail) * Number(stats.bsize);
  } catch {
    diskFreeBytes = null;
  }

  return {
    cpuPercent: await cpuPercent(),
    memoryBytes: os.totalmem() - os.freemem(),
    diskFreeBytes,
    queuedEvents: Math.max(0, Math.floor(queuedEvents)),
  };
}

export function platformMetadata() {
  return {
    hostname: os.hostname(),
    osRelease: os.release(),
    osType: os.type(),
    uptimeSeconds: Math.round(os.uptime()),
  };
}
