"use client";

import { useEffect, useRef } from "react";
import { API_ORIGIN } from "../env";

type EventPayload = {
  type: string;
  projectId: string;
  payload: unknown;
  timestamp: string;
};

function toEventPayload(value: unknown): EventPayload | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<EventPayload>;
  if (
    typeof candidate.type !== "string" ||
    typeof candidate.projectId !== "string" ||
    typeof candidate.timestamp !== "string"
  ) {
    return null;
  }

  return {
    type: candidate.type,
    projectId: candidate.projectId,
    payload: candidate.payload,
    timestamp: candidate.timestamp,
  };
}

export function useProjectRealtime(
  projectId: string | undefined,
  onProjectEvent: (event: EventPayload) => void,
  onTaskEvent: (event: EventPayload) => void,
) {
  const onProjectEventRef = useRef(onProjectEvent);
  const onTaskEventRef = useRef(onTaskEvent);

  useEffect(() => {
    onProjectEventRef.current = onProjectEvent;
  }, [onProjectEvent]);

  useEffect(() => {
    onTaskEventRef.current = onTaskEvent;
  }, [onTaskEvent]);

  useEffect(() => {
    if (!projectId) return;

    let active = true;
    let cleanup: (() => void) | undefined;

    const connect = async () => {
      const ioClient = await import("socket.io-client");
      if (!active) return;

      const socket = ioClient.io(`${API_ORIGIN}/realtime`, {
        transports: ["websocket"],
        withCredentials: true,
      });

      socket.emit("project:join", { projectId });

      const handleProjectEvent = (event: unknown) => {
        const parsed = toEventPayload(event);
        if (!parsed) return;
        onProjectEventRef.current(parsed);
      };

      const handleTaskEvent = (event: unknown) => {
        const parsed = toEventPayload(event);
        if (!parsed) return;
        onTaskEventRef.current(parsed);
      };

      socket.on("project:event", handleProjectEvent);
      socket.on("task:event", handleTaskEvent);

      cleanup = () => {
        socket.emit("project:leave", { projectId });
        socket.off("project:event", handleProjectEvent);
        socket.off("task:event", handleTaskEvent);
        socket.disconnect();
      };
    };

    void connect();

    return () => {
      active = false;
      cleanup?.();
    };
  }, [projectId]);
}
