# Position Creation Flow (Meteora DLMM)

```mermaid
flowchart TD
  %% Legend
  classDef action fill:#E8F5E9,stroke:#2E7D32,color:#1B5E20
  classDef decision fill:#FFF8E1,stroke:#F57F17,color:#E65100
  classDef io fill:#E3F2FD,stroke:#1565C0,color:#0D47A1
  classDef sys fill:#F3E5F5,stroke:#6A1B9A,color:#4A148C

  %% Entry
  A[User selects pool → enter CREATE_POSITION_SCENE]:::io --> B[Load pool details via GetPoolDetailsUseCase]:::sys
  B --> C{Pool available?}:::decision
  C -- No --> CX[Show error and leave scene]
  C -- Yes --> D[Show Strategy Selection (1/8)]:::action

  %% Strategy
  D -->|Spot/Curve/Bid-Ask| E[Persist strategy in scene state]:::action --> F[Deposit Method (2/8)]:::action

  %% Deposit Method
  F --> G{Deposit method}:::decision
  G -- SOL Auto-convert --> L[Amount Selection (3/8)]:::action
  G -- Single-sided --> H[Token Selection]:::action

  %% Single-sided token selection
  H --> H1[Fetch token balances via GetTokenBalanceUseCase]:::sys --> I[Deposit Source (4/8)]:::action
  I --> I1{Source}:::decision
  I1 -- Convert from SOL --> L
  I1 -- From Token Balance --> J[Percentage Selection]:::action --> K[Price Change Coverage (5/8)]:::action --> M[Summary (7/8)]

  %% Auto-convert branch
  L --> L1[Validate SOL balance via GetBalanceUseCase]:::sys --> L2[Preset amounts or prompt for custom]:::action
  L2 --> N[Auto-rebalancing (7/8)]:::action

  %% Summary
  N --> M[Summary (7/8)]:::action
  K --> M

  %% Build Summary
  M --> M1[Calculate token distribution (50/50) via CalculateBalancedDistributionUseCase]:::sys
  M1 --> M2[Get price range via GetPriceRangeUseCase]:::sys
  M2 --> M3[Render position summary + Confirm button]:::action

  %% Execution
  M3 --> O{Confirm?}:::decision
  O -- No/Back --> P[Go back to previous step]:::action
  O -- Yes --> Q[Create Position via CreatePositionUseCase]:::sys
  Q --> Q1{Success?}:::decision
  Q1 -- Yes --> Q2[Show success + signature link]:::action
  Q1 -- No --> Q3[Show failure reason and leave]:::action
```

Notes:
- All external interactions (pool details, balances, quotes, price range, transaction) go through application use cases or adapters via the DI container.
- The scene only coordinates user input, state transitions, and message rendering.
