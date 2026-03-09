import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BENCH_BASE_URL || 'http://localhost:3001/api';

export const options = {
  vus: Number(__ENV.BENCH_K6_VUS || 20),
  duration: __ENV.BENCH_K6_DURATION || '45s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function run() {
  const health = http.get(`${baseUrl}/health`);
  check(health, {
    'health status 200': (res) => res.status === 200,
  });

  const metrics = http.get(`${baseUrl}/metrics`);
  check(metrics, {
    'metrics status 200': (res) => res.status === 200,
    'metrics has taskflow prefix': (res) =>
      res.body && res.body.includes('taskflow_http_requests_total'),
  });

  sleep(0.25);
}
