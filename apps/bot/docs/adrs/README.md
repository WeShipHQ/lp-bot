# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Meteora Liquidity Bot. ADRs document significant architectural decisions, their context, alternatives considered, and consequences.

## What is an ADR?

An Architecture Decision Record (ADR) captures a decision that affects the structure, design, or implementation of the system. Each ADR documents:

- **Context:** The problem or situation requiring a decision
- **Decision:** The solution chosen
- **Alternatives:** Other options considered
- **Consequences:** Positive and negative impacts of the decision
- **Status:** Proposed, Accepted, Deprecated, or Superseded

## ADR Index

| ID | Title | Status | Date | Related Work |
|----|-------|--------|------|--------------|
| [001](./001-error-handling-classification.md) | Error Handling & Classification Strategy | Proposed | 2025-01-XX | Position flows, worker infrastructure |
| [002](./002-lp-strategy-abstraction.md) | LP Strategy Abstraction Pattern | Proposed | 2025-01-XX | Create position scene, use cases |
| [003](./003-state-machine-position-flow.md) | State Management & State Machine Approach | Proposed | 2025-01-XX | Wizard flows, position status |
| [004](./004-transaction-safety-idempotency.md) | Transaction Safety Guarantees & Idempotency | Proposed | 2025-01-XX | All position flows, workers |

## ADR Lifecycle

```
Proposed → Accepted → Implemented
   ↓
Deprecated / Superseded (when replaced)
```

- **Proposed:** Decision is documented but not yet implemented
- **Accepted:** Decision has been reviewed and approved by the team
- **Implemented:** Decision has been coded and deployed
- **Deprecated:** Decision no longer applies (kept for historical context)
- **Superseded:** Replaced by a newer ADR (link to replacement)

## Baseline Audit Context

These ADRs were created as part of the **Baseline Position Flow Audit** (January 2025) to address technical debt identified in the CREATE, CLAIM, CLOSE, and REBALANCE position lifecycle flows.

### Critical Issues Addressed

1. **ADR-001:** Inconsistent error handling across layers, no domain error classification
2. **ADR-002:** Strategy logic scattered, incomplete single-sided deposits
3. **ADR-003:** Ad-hoc state management, complex wizard navigation
4. **ADR-004:** No idempotency guarantees, weak transaction safety

### Related Documentation

- [Enhancement Specification](../positions/enhancement-specification.md) - Comprehensive technical debt analysis
- [Position Flow Documentation](../positions/) - Current state audit for each flow
- [PRD](../PRD.md) - Product requirements and success metrics
- [System Design](../SystemDesign.md) - High-level architecture

## How to Create a New ADR

1. **Copy the template** from `template.md` (to be created)
2. **Assign next sequential number** (e.g., `005-title.md`)
3. **Fill in all sections:**
   - Context and Problem Statement
   - Decision Drivers
   - Considered Options
   - Decision
   - Consequences
   - Implementation Plan (if applicable)
4. **Mark status as "Proposed"**
5. **Submit PR for review**
6. **Update this index** with new entry

## Review Process

1. **Author** creates ADR in `Proposed` state
2. **Team Review** during architecture sync meeting
3. **Approval** by tech leads moves ADR to `Accepted`
4. **Implementation** tracked in linked issues/PRs
5. **Verification** during code review
6. **Status Update** to `Implemented` when complete

## Questions?

- For questions about specific ADRs, see the "References" section at the bottom of each ADR
- For general ADR process questions, consult the engineering team lead
- For implementation guidance, refer to the linked issues and enhancement specifications

---

**Last Updated:** 2025-01-XX  
**Maintained By:** Engineering Team
