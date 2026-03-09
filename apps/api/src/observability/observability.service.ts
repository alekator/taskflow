import { Injectable } from '@nestjs/common';

type HttpMetricKey = string;

type HttpSnapshot = {
  total: number;
  errors: number;
  byStatusClass: Record<string, number>;
  latency: {
    avgMs: number;
    p95Ms: number;
    maxMs: number;
  };
};

@Injectable()
export class ObservabilityService {
  private totalRequests = 0;
  private totalErrors = 0;
  private totalDurationMs = 0;
  private maxDurationMs = 0;
  private readonly durationWindow: number[] = [];
  private readonly durationWindowLimit = 2000;
  private readonly byStatusClass = new Map<string, number>();
  private readonly byRoute = new Map<HttpMetricKey, number>();

  recordHttpRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  }) {
    this.totalRequests += 1;
    this.totalDurationMs += input.durationMs;
    this.maxDurationMs = Math.max(this.maxDurationMs, input.durationMs);

    if (input.statusCode >= 500) {
      this.totalErrors += 1;
    }

    const statusClass = `${Math.floor(input.statusCode / 100)}xx`;
    this.byStatusClass.set(
      statusClass,
      (this.byStatusClass.get(statusClass) ?? 0) + 1,
    );

    const routeKey = `${input.method.toUpperCase()} ${input.route}`;
    this.byRoute.set(routeKey, (this.byRoute.get(routeKey) ?? 0) + 1);

    this.durationWindow.push(input.durationMs);
    if (this.durationWindow.length > this.durationWindowLimit) {
      this.durationWindow.shift();
    }
  }

  getHttpSnapshot(): HttpSnapshot {
    const avgMs =
      this.totalRequests > 0 ? this.totalDurationMs / this.totalRequests : 0;

    const sorted = [...this.durationWindow].sort((a, b) => a - b);
    const p95Index = sorted.length > 0 ? Math.floor(sorted.length * 0.95) : 0;
    const p95Ms = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, p95Index)] : 0;

    return {
      total: this.totalRequests,
      errors: this.totalErrors,
      byStatusClass: Object.fromEntries(this.byStatusClass.entries()),
      latency: {
        avgMs: Math.round(avgMs * 10) / 10,
        p95Ms: Math.round(p95Ms * 10) / 10,
        maxMs: Math.round(this.maxDurationMs * 10) / 10,
      },
    };
  }

  renderPrometheusMetrics() {
    const lines: string[] = [];
    lines.push('# HELP taskflow_http_requests_total Total HTTP requests');
    lines.push('# TYPE taskflow_http_requests_total counter');
    lines.push(`taskflow_http_requests_total ${this.totalRequests}`);
    lines.push('');

    lines.push(
      '# HELP taskflow_http_request_errors_total Total HTTP 5xx responses',
    );
    lines.push('# TYPE taskflow_http_request_errors_total counter');
    lines.push(`taskflow_http_request_errors_total ${this.totalErrors}`);
    lines.push('');

    lines.push(
      '# HELP taskflow_http_request_duration_avg_ms Average request duration in milliseconds',
    );
    lines.push('# TYPE taskflow_http_request_duration_avg_ms gauge');
    lines.push(
      `taskflow_http_request_duration_avg_ms ${this.getHttpSnapshot().latency.avgMs}`,
    );
    lines.push('');

    lines.push(
      '# HELP taskflow_http_request_duration_p95_ms P95 request duration in milliseconds',
    );
    lines.push('# TYPE taskflow_http_request_duration_p95_ms gauge');
    lines.push(
      `taskflow_http_request_duration_p95_ms ${this.getHttpSnapshot().latency.p95Ms}`,
    );
    lines.push('');

    lines.push(
      '# HELP taskflow_http_requests_by_route_total Request count by method and route',
    );
    lines.push('# TYPE taskflow_http_requests_by_route_total counter');
    for (const [key, value] of this.byRoute.entries()) {
      const split = key.indexOf(' ');
      const method = key.slice(0, split);
      const route = key.slice(split + 1).replace(/"/g, '\\"');
      lines.push(
        `taskflow_http_requests_by_route_total{method="${method}",route="${route}"} ${value}`,
      );
    }

    return lines.join('\n');
  }
}
