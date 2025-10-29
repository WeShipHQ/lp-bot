# Monitoring & Observability Guide

## Table of Contents
- [Overview](#overview)
- [Key Metrics](#key-metrics)
- [Dashboards](#dashboards)
- [Alerting](#alerting)
- [Log Aggregation](#log-aggregation)
- [Tracing](#tracing)
- [Health Checks](#health-checks)
- [Operational Runbook](#operational-runbook)

## Overview

This guide explains how to monitor the Meteora Liquidity Bot in production, including metrics, dashboards, alerting, log aggregation, tracing, and health checks. Use this document to ensure the system meets reliability targets and to respond quickly to incidents.

### Monitoring Objectives

1. **Detect Issues Early**: Identify service degradation before users are impacted
2. **Understand System Health**: Monitor key components (bot, workers, DB, Redis, RPC)
3. **Ensure Transaction Security**: Track flow success/failure rates
4. **Support Troubleshooting**: Provide visibility into logs, metrics, and traces

## Key Metrics

### Flow Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `flow_success_rate` | Completed flows / total flows | > 95% |
| `flow_failure_rate` | Failed flows / total flows | < 5% |
| `flow_duration_seconds` | Time from INITIATED → COMPLETED | p95 < 60s |
| `flow_retry_count` | Average retries per flow | < 1 |
| `flow_stale_count` | Flows stuck > timeout | 0 |

**Prometheus Example:**
```typescript
import { Counter, Histogram } from 'prom-client';

export const flowSuccessCounter = new Counter({
  name: 'flow_success_total',
  help: 'Total number of successful flows',
  labelNames: ['flow_type'],
});

export const flowFailureCounter = new Counter({
  name: 'flow_failure_total',
  help: 'Total number of failed flows',
  labelNames: ['flow_type', 'error_code'],
});

export const flowDurationHistogram = new Histogram({
  name: 'flow_duration_seconds',
  help: 'Flow duration in seconds',
  labelNames: ['flow_type', 'status'],
  buckets: [5, 10, 20, 30, 60, 120, 300],
});
```

### Transaction Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `transaction_simulation_failures` | Simulation failure count | < 2% |
| `tx_confirmation_time_seconds` | RPC confirmation time | p95 < 30s |
| `tx_priority_fee_lamports` | Priority fee used | Monitor trend |
| `tx_retry_count` | Transaction retries per flow | < 3 |

### Queue Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `queue_waiting_jobs` | Jobs waiting in queue | < 100 |
| `queue_processing_time` | Job processing duration | p95 < 5s |
| `queue_failed_jobs` | Failed jobs per queue | 0 critical |
| `queue_stalled_jobs` | Jobs stalled in queue | 0 |

### Infrastructure Metrics

| Component | Metric | Target |
|-----------|--------|--------|
| **API/Bot** | CPU usage | < 70% |
| | Memory usage | < 75% |
| | Request latency | p95 < 1s |
| **Workers** | Job throughput | > 50 jobs/min |
| | Error rate | < 1% |
| **Database** | Query latency | p95 < 200ms |
| | Connections used | < 70% |
| **Redis** | Memory usage | < 80% |
| **RPC** | Response time | p95 < 500ms |

### Business Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `positions_created` | Count per day | 50+ |
| `fees_claimed_usd` | Total USD claimed | Track trend |
| `rebalance_triggered` | Rebalance events per day | Track trend |
| `active_users` | Daily active users | 200+ |

## Dashboards

### Flow Dashboard

- Active flows by state
- Flow success/failure rate (segmented by type)
- Flow duration heatmap
- Stale flows over time
- Retry rate per flow type

### Transaction Dashboard

- Simulation failure rate
- Confirmation time distribution
- Transaction fees (priority + base)
- RPC latency and error rate
- Transaction throughput

### Queue Dashboard

- Job counts by queue (waiting, active, completed, failed)
- Job processing time per queue
- Worker CPU/memory
- Stalled job alerts
- Retry counts per job type

### Infrastructure Dashboard

- API request rate and latency
- Worker health (up/down, CPU, memory)
- Database connections and query time
- Redis memory and commands/sec
- RPC health and response time

### Business Dashboard

- Positions created (daily/weekly)
- Fees claimed (USD)
- Rebalance events
- Portfolio value (TVL)
- Active users

## Alerting

### Critical Alerts (PagerDuty)
- Flow failure rate > 10% for 5 minutes
- Transaction confirmation time > 60s for 10 minutes
- Queue stalled jobs > 10
- Database unavailable
- RPC failures > 50% of requests
- Worker job failure rate > 5%

### Warning Alerts (Slack)
- Flow duration p95 > 120s
- Queue waiting jobs > 200
- Redis memory > 85%
- CPU > 80% for 20 minutes
- Transaction simulation failures > 5%

### Info Alerts (Email)
- Daily summary of key metrics
- SLA compliance report
- Weekly trend analysis

### Alert Configuration Example (Better Stack)

```bash
# Flow Failure Rate Alert
Metric: flow_failure_total / (flow_success_total + flow_failure_total)
Condition: > 0.1
Duration: 5 minutes
Severity: Critical
Notification: PagerDuty, Slack #alerts

# Transaction Confirmation Alert
Metric: tx_confirmation_time_seconds
Condition: p95 > 60
Duration: 10 minutes
Severity: Critical
Notification: PagerDuty
```

## Log Aggregation

### Pino + Better Stack / Datadog

Pino logs are structured JSON. Set up forwarders to log aggregation service:

```json
{
  "level": "info",
  "time": 1732728923456,
  "service": "bot",
  "flowId": "uuid",
  "flowType": "CREATE_POSITION",
  "state": "TX_CONFIRMING",
  "message": "Flow state transition"
}
```

### Log Categories
- `FlowStateMachine` - Flow transitions and errors
- `TransactionConfirmWorker` - RPC polling, confirmations
- `QueueWorker` - Job processing, errors
- `DexAdapter` - DEX-specific actions
- `WalletService` - Transaction submission, signing

### Log Aggregation Queries

**Find failed flows:**
```
service:bot AND level:error AND flowId:* AND message:"Flow failed"
```

**Monitor RPC issues:**
```
service:worker AND message:"RPC error" | count by rpcEndpoint
```

**Track swap failures:**
```
service:worker AND message:"Swap failed" | timeline avg(duration)
```

## Tracing

### Flow Tracing

Use correlation IDs:
- `flowId` - Unique flow identifier
- `userId` - Masked or hashed user ID
- `traceId` - Request or job identifier

**Trace Example:**
1. `Flow started` (FlowStateMachine)
2. `Transaction submitted` (WalletService)
3. `Transaction confirmed` (TransactionConfirmWorker)
4. `Persistence completed` (PositionPersistenceService)
5. `Notifications sent` (NotificationService)

### OpenTelemetry (Optional)
- Instrument HTTP requests
- Instrument queue job processing
- Trace Flow execution
- Export to Jaeger/Tempo/Datadog

## Health Checks

### Endpoint `/health`

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T12:34:56.789Z",
  "checks": {
    "database": true,
    "redis": true,
    "telegram": true,
    "solana": true,
    "dexAdapters": {
      "meteora": true,
      "saros": true,
      "orca": true
    }
  }
}
```

### Readiness vs Liveness
- **Liveness**: Is process running? (always return 200 if up)
- **Readiness**: Are dependencies healthy? (return 503 if dependencies down)

### Synthetic Transactions

Schedule synthetic flows to test system end-to-end:
- Create small position on devnet
- Claim fees from devnet position
- Close devnet position

Monitor success/failure of synthetic flows.

## Operational Runbook

### 1. Check Flow Health
```bash
# List active flows
node scripts/inspect-flows.js --status PROCESSING --limit 20

# View specific flow
node scripts/inspect-flow.js --id {flowId}
```

### 2. Monitor Workers
```bash
# Check worker status via PM2
pm2 status bot-worker
pm2 logs bot-worker

# Restart worker
pm2 restart bot-worker
```

### 3. Monitor Queues
```bash
node scripts/queue-inspect.js --queue position-monitor
```

### 4. Monitor RPC Health
```bash
curl https://status.solana.com/api/getStatus
curl -I https://api.mainnet-beta.solana.com
```

### 5. Respond to Alert
1. Check logs for context
2. Inspect relevant flows/jobs
3. Identify root cause
4. Apply fix or mitigation
5. Update incident doc (if major)
6. Post-mortem after resolution

## References
- [Troubleshooting Manual](./troubleshooting.md)
- [Queue Management Guide](./queue-management.md)
- [Log Interpretation Guide](./log-interpretation.md)
- [Transaction Safety Guide](./transaction-safety.md)
- [System Design - Monitoring](../apps/bot/docs/SystemDesign.md#monitoring--observability)

---

**Last Updated**: January 2025  
**Version**: 2.0
