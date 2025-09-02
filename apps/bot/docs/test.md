flowchart TD
    A[Start: Enter Scene] --> B[Load Pool Data]
    B --> C{Pool Data Valid?}
    C -->|No| D[Show Error & Exit]
    C -->|Yes| E["Step 0: Strategy Selection<br/>🎯 Choose Strategy<br/>• Spot<br/>• Curve<br/>• Bid-ask"]
    
    E --> F{Strategy Selected}
    F --> G["Step 1: Deposit Method<br/>💰 Choose Deposit Method<br/>• Deposit SOL (Auto-convert)<br/>• Single-sided Token Deposit"]
    
    G --> H{Deposit Method}
    H -->|SOL Auto-convert| I["Step 2a: SOL Amount<br/>💰 Choose SOL Amount<br/>• 0.1 SOL<br/>• 1 SOL<br/>• 5 SOL<br/>• Custom SOL"]
    H -->|Single-sided| J["Step 2b: Token Selection<br/>🪙 Choose Token<br/>• Token A<br/>• Token B"]
    
    J --> K{Token Selected}
    K --> L["Step 3: Deposit Source<br/>📊 Choose Deposit Source<br/>• Convert from SOL (0.1, 1, 5, Custom)<br/>• Deposit from Token Balance"]
    
    L --> M{Deposit Source}
    M -->|Convert from SOL| N["SOL Amount Selection<br/>💰 Choose SOL Amount<br/>• 0.1 SOL<br/>• 1 SOL<br/>• 5 SOL<br/>• Custom SOL"]
    M -->|From Token Balance| O["Token Balance Selection<br/>📊 Choose Token Percentage<br/>• 25% of balance<br/>• 50% of balance<br/>• 100% of balance<br/>• Custom amount"]
    
    I --> P{Amount Type}
    N --> P
    P -->|Preset Amount| Q[Validate SOL Balance]
    P -->|Custom| R["Request Custom SOL Input<br/>📝 Enter custom SOL amount"]
    
    O --> S{Token Percentage}
    S -->|Preset %| T[Calculate Token Amount]
    S -->|Custom| U["Request Custom Token Input<br/>📝 Enter custom token amount"]
    
    R --> V["Wait for SOL Text Input<br/>⌨️ User types SOL amount"]
    V --> W{Valid SOL Amount?}
    W -->|No| X[Show SOL Error Message]
    X --> V
    W -->|Yes| Q
    
    U --> Y["Wait for Token Text Input<br/>⌨️ User types token amount"]
    Y --> Z{Valid Token Amount?}
    Z -->|No| AA[Show Token Error Message]
    AA --> Y
    Z -->|Yes| T
    
    Q --> BB{Sufficient SOL Balance?}
    BB -->|No| CC[Show Insufficient SOL Balance Error]
    CC --> DD{Previous Step}
    DD -->|SOL Auto-convert| I
    DD -->|Single-sided SOL| N
    BB -->|Yes| EE["Step 4: Auto-rebalancing<br/>⚖️ Enable auto-rebalancing?<br/>• Yes<br/>• No"]
    
    T --> FF{Sufficient Token Balance?}
    FF -->|No| GG[Show Insufficient Token Balance Error]
    GG --> O
    FF -->|Yes| EE
    
    EE --> HH{Rebalancing Choice}
    HH -->|Yes/No| II["Step 5: Position Summary<br/>📋 Show final details<br/>• Pool info<br/>• Strategy<br/>• Deposit method<br/>• Amount & token allocation<br/>• Auto-rebalancing status"]
    
    II --> JJ{Confirm Creation?}
    JJ -->|No Back| KK[Go Back to Previous Step]
    JJ -->|Yes| LL["Step 6: Execute Position<br/>⏳ Creating position..."]
    
    LL --> MM[Call Position Service]
    MM --> NN{Creation Success?}
    NN -->|Yes| OO["🎉 Success Message<br/>Show transaction ID"]
    NN -->|No| PP["❌ Error Message<br/>Show error details"]
    
    OO --> QQ[Exit Scene]
    PP --> QQ
    
    %% Cancel/Back flows
    E --> RR[Cancel]
    G --> SS[Cancel/Back]
    I --> TT[Cancel/Back]
    J --> UU[Cancel/Back]
    L --> VV[Cancel/Back]
    N --> WW[Cancel/Back]
    O --> XX[Cancel/Back]
    EE --> YY[Cancel/Back]
    II --> ZZ[Cancel/Back]
    
    RR --> QQ
    SS --> AAA{Back Action}
    TT --> BBB{Back Action}
    UU --> CCC{Back Action}
    VV --> DDD{Back Action}
    WW --> EEE{Back Action}
    XX --> FFF{Back Action}
    YY --> GGG{Back Action}
    ZZ --> HHH{Back Action}
    
    AAA -->|Back| E
    AAA -->|Cancel| QQ
    BBB -->|Back| G
    BBB -->|Cancel| QQ
    CCC -->|Back| G
    CCC -->|Cancel| QQ
    DDD -->|Back| J
    DDD -->|Cancel| QQ
    EEE -->|Back| L
    EEE -->|Cancel| QQ
    FFF -->|Back| L
    FFF -->|Cancel| QQ
    GGG -->|Back| III{Deposit Method}
    GGG -->|Cancel| QQ
    HHH -->|Back| EE
    HHH -->|Cancel| QQ
    
    III -->|SOL Auto-convert| I
    III -->|Single-sided SOL| N
    III -->|Single-sided Token| O
    
    KK --> JJJ{Current Step}
    JJJ -->|From Summary| EE
    JJJ -->|From Rebalancing| KKK{Deposit Path}
    KKK -->|SOL Auto-convert| I
    KKK -->|Single-sided SOL| N
    KKK -->|Single-sided Token| O
    JJJ -->|From Amount| LLL{Deposit Method}
    LLL -->|SOL Auto-convert| G
    LLL -->|Single-sided| L
    JJJ -->|From Token Selection| G
    JJJ -->|From Deposit Method| E
    
    style A fill:#e1f5fe
    style E fill:#f3e5f5
    style G fill:#f3e5f5
    style I fill:#f3e5f5
    style J fill:#f3e5f5
    style L fill:#f3e5f5
    style N fill:#f3e5f5
    style O fill:#f3e5f5
    style EE fill:#f3e5f5
    style II fill:#f3e5f5
    style LL fill:#fff3e0
    style OO fill:#e8f5e8
    style PP fill:#ffebee
    style QQ fill:#fafafa