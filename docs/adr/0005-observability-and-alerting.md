# ADR 0005: Prometheus-first observability and alerting pack

- Status: Accepted
- Date: 2026-03-09

## Context

The project requires production-grade operational signals, not only dashboards. Recent hardening added:

- `/api/metrics` endpoint with service-level and DB/latency/job metrics.
- Prometheus scrape config and rule groups for incidents.
- Alertmanager provisioning for routing and grouping.
- Grafana dashboard provisioning.

## Decision

Standardize on Prometheus/OpenMetrics pipeline as default observability stack:

- API exports metrics in Prometheus text format.
- Prometheus evaluates alert rules:
  - API down
  - 5xx spike
  - High p95 latency
  - Failed async jobs
  - DB degraded state
- Alertmanager handles grouping/routing.
- Grafana provides operator-facing dashboards from provisioned datasource.

## Consequences

### Positive

- Fast local and CI-friendly observability setup via code/provisioning.
- Alerting behavior is versioned with repository changes.
- Improves production-readiness and interview signal for operations maturity.

### Trade-offs

- Metrics and alerts still require environment tuning for real traffic baselines.
- More moving parts in ops compose profile.
- Potential for noisy alerts until thresholds are calibrated.

## Alternatives considered

- Dashboard-only observability without alerting rules.
  - Rejected due to weak incident response posture.
- SaaS-first APM/monitoring only.
  - Deferred; open stack keeps local reproducibility and zero vendor lock-in.
