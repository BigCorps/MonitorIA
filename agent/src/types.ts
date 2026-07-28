export type RemoteCamera = {
  id: string;
  name: string;
  description: string;
  status: string;
  plan: string;
  captureIntervalSeconds: number;
  consolidationIntervalSeconds: number;
  motionStartThreshold: number;
  motionContinueThreshold: number;
  eventCloseAfterSeconds: number;
  monitoringGoals: string[];
};

export type PairResponse = {
  ok: true;
  agent: {
    id: string;
    token: string;
  };
  camera: Omit<RemoteCamera, "description" | "status"> & {
    organizationId: string;
    siteId: string;
  };
};

export type ConfigResponse = {
  ok: true;
  agent: {
    id: string;
    name: string;
  };
  cameras: RemoteCamera[];
  serverTime: string;
};

export type ProtectedCameraConfig = {
  protectedRtsp: string;
  configuredAt: string;
  lastSnapshotUploadedAt?: string;
};

export type StoredAgentConfig = {
  schemaVersion: 1;
  apiBaseUrl: string;
  agentId: string;
  agentName: string;
  protectedAgentToken: string;
  pairedAt: string;
  cameras: Record<string, ProtectedCameraConfig>;
};

export type CapturedFrame = {
  path: string;
  width: number | null;
  height: number | null;
  byteSize: number;
  capturedAt: string;
};
