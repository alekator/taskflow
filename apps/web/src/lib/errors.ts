export type AppErrorDetails = {
  message: string;
  statusCode?: number;
};

function statusFallback(statusCode: number): string {
  if (statusCode === 401) return "Session expired. Please sign in again.";
  if (statusCode === 403) return "You do not have permission for this action.";
  if (statusCode === 404) return "Requested resource was not found.";
  if (statusCode === 409) return "Conflict detected. Refresh and try again.";
  if (statusCode === 412) return "Data version is stale. Reload and retry.";
  if (statusCode === 428) return "Precondition required. Missing If-Match header.";
  if (statusCode >= 500) return "Server error. Please try again later.";
  return `Request failed with status ${statusCode}.`;
}

export function getErrorDetails(error: unknown): AppErrorDetails {
  if (error instanceof Error) {
    return { message: error.message || "Unexpected error" };
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      statusCode?: unknown;
      message?: unknown;
      error?: unknown;
    };

    const statusCode =
      typeof candidate.statusCode === "number" ? candidate.statusCode : undefined;
    const message =
      typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.error === "string"
          ? candidate.error
          : statusCode
            ? statusFallback(statusCode)
            : "Unexpected error";

    return { message, statusCode };
  }

  return { message: "Unexpected error" };
}

