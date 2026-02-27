import { API_BASE_URL } from "../env";

export type RuntimeHealth = {
  status: "ok";
  timestamp: string;
  runtime: {
    pid: number;
    nodeVersion: string;
    uptimeSeconds: number;
    environment: string;
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    heapUsagePercent: number;
  };
  services: {
    database: "CONNECTED" | "UNAVAILABLE" | "NOT_CONFIGURED";
    databaseLatencyMs: number | null;
    realtime: "ENABLED";
  };
};

export async function getRuntimeHealth(): Promise<RuntimeHealth> {
  const res = await fetch(`${API_BASE_URL}/health`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  return (await res.json()) as RuntimeHealth;
}
