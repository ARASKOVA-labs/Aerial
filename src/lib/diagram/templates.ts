// ── Starter diagrams offered in the studio ───────────────────────────────────

/**
 * Standard, production software & cloud architecture templates.
 * Zero proprietary secrets, zero weapon/internal codenames.
 */
export const ARASKOVA_DIAGRAM_TEMPLATES = [
  {
    id: 'microservices',
    name: 'Cloud Microservices',
    desc: 'API Gateway, Auth, Order & Inventory microservices with Kafka event bus',
    type: 'Flowchart',
    code: `graph TD
    classDef edge stroke:#3f3f46,stroke-width:1.5px;
    classDef accent stroke:#e73f07,stroke-width:2px;
    classDef storage stroke:#3f3f46,stroke-width:1.5px;

    subgraph CLIENT_TIER ["// Client Layer"]
        A[Web Frontend] --> G[API Gateway]
        B[Mobile Client] --> G
    end

    subgraph SERVICES ["// Microservices Mesh"]
        G -->|JWT AUTH| S1[Auth Service]:::accent
        G -->|REST / gRPC| S2[Order Service]:::accent
        G -->|CATALOG| S3[Product Service]:::accent
    end

    subgraph EVENT_BUS ["// Async Event Streaming"]
        S2 -->|ORDER_CREATED| K[Kafka Broker]
        K --> S4[Notification Service]
        K --> S5[Inventory Sync]
    end

    subgraph STORAGE ["// Persistence Layer"]
        S1 --> D1[(User Auth DB)]:::storage
        S2 --> D2[(Order Store)]:::storage
        S3 --> D3[(Redis Cache)]:::storage
    end`,
  },
  {
    id: 'event_stream',
    name: 'Real-Time Event Stream',
    desc: 'Multi-source stream ingestion, Apache Flink compute, and analytics sinks',
    type: 'Architecture',
    code: `graph LR
    subgraph INGESTION ["// Ingestion Sources"]
        IOT[IoT Edge Sensors] -->|MQTT| GW[Stream Gateway]
        APP[Web App Telemetry] -->|HTTP / JSON| GW
        CDC[Database CDC Logs] -->|Debezium| GW
    end

    subgraph STREAM_PROCESSOR ["// Real-Time Compute"]
        GW -->|PARTITIONED TOPIC| TOPIC[Kafka Event Cluster]
        TOPIC --> FLINK[Apache Flink Engine]
        FLINK -->|AGGREGATED METRICS| AN[Anomaly Detector]
    end

    subgraph SINKS ["// Data Destinations"]
        AN -->|ALERTS| SLACK[Incident Webhook]
        FLINK -->|TIMESERIES| TSDB[(ClickHouse Storage)]
        FLINK -->|RAW ARCHIVE| S3[(Object Storage / S3)]
    end`,
  },
  {
    id: 'oauth2_pkce',
    name: 'OAuth2 & PKCE Auth Flow',
    desc: 'Modern Single Page Application authorization with PKCE and JWT exchange',
    type: 'Sequence',
    code: `sequenceDiagram
    autonumber
    actor User as User Agent
    actor App as Single Page App (SPA)
    actor Auth as Identity Provider
    actor API as Resource Server

    Note over User,API: OAuth 2.0 Authorization Code Flow with PKCE
    App->>App: Generate code_verifier & code_challenge
    User->>App: Click 'Sign In'
    App->>Auth: GET /authorize?code_challenge=xyz&response_type=code
    Auth-->>User: Present Login & Consent Screen
    User->>Auth: Submit Credentials & Consent
    Auth-->>App: Redirect with authorization code
    App->>Auth: POST /oauth/token with code & code_verifier
    Auth-->>App: Return ID Token & Access Token (JWT)
    App->>API: GET /api/v1/profile with Bearer JWT
    API-->>App: Return 200 OK + User Profile JSON`,
  },
  {
    id: 'order_state',
    name: 'Order Lifecycle State Machine',
    desc: 'E-commerce transactional transitions from payment to delivery & return',
    type: 'State Diagram',
    code: `stateDiagram-v2
    [*] --> Draft: Cart Checkout
    Draft --> PendingPayment: Place Order
    PendingPayment --> PaymentFailed: Card Declined
    PaymentFailed --> PendingPayment: Retry Payment
    PaymentFailed --> Cancelled: Timeout (30m)
    PendingPayment --> Processing: Payment Authorized
    Processing --> Shipped: Package Dispatched
    Shipped --> Delivered: Carrier Confirmed
    Processing --> Refunded: Customer Cancellation
    Delivered --> Refunded: Return Accepted
    Delivered --> [*]
    Cancelled --> [*]
    Refunded --> [*]`,
  },
  {
    id: 'domain_entities',
    name: 'E-Commerce Domain Entities',
    desc: 'Standard clean domain architecture for customers, orders, and payment items',
    type: 'Class Diagram',
    code: `classDiagram
    class Customer {
        +UUID customer_id
        +String email
        +String full_name
        +get_order_history() List
    }
    class Order {
        +UUID order_id
        +DateTime created_at
        +Decimal total_amount
        +OrderStatus status
        +calculate_tax() Decimal
    }
    class LineItem {
        +UUID item_id
        +String sku
        +Int quantity
        +Decimal unit_price
    }
    class PaymentMethod {
        +UUID payment_id
        +String provider
        +String masked_pan
        +is_valid() Boolean
    }
    Customer "1" *-- "0..*" Order
    Order "1" *-- "1..*" LineItem
    Customer "1" o-- "1..*" PaymentMethod`,
  },
];
