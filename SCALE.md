# Scale Plan

To support 10,000 Requests Per Second (RPS), the system architecture must evolve from a single-node SQLite backend to a horizontally scalable distributed system. 

- **Data model/indexes:**
  - Migrate from SQLite to a highly available distributed database (e.g., PostgreSQL with read replicas, or DynamoDB/Cassandra for pure horizontal scale).
  - Crucial indexes: `idempotency_key` (UNIQUE constraint for atomic idempotency) and `(user_id, created_at DESC)` for fast retrieval in `GET /signals`.
  
- **Idempotency across instances:**
  - Storing idempotency keys in the primary database can create a write bottleneck. 
  - Instead, use Redis as a high-speed idempotency store. We can set a key (`idem:{key}`) using `SET NX EX 86400` (expires in 24 hours). If `SET NX` returns 1, we process the request. If 0, the request is a duplicate and we can return the cached response.

- **Rate limiting across instances:**
  - The current in-memory `Map` must be replaced, as it does not share state across multiple Node.js instances.
  - Implement a Redis-based rate limiter using a Lua script to atomically evaluate the sliding window or token bucket algorithm. This ensures perfect concurrency control across distributed instances.

- **Observability (logs/metrics/alerts):**
  - Implement structured JSON logging (already started with Fastify logger) shipped to a centralized aggregator (e.g., Datadog, ELK).
  - Export metrics (Prometheus) tracking HTTP response codes, latency percentiles (p50, p95, p99), and rate limit rejections.
  - Set alerts for elevated 5xx error rates, database connection pool exhaustion, and CPU/memory limits.

- **Failure modes (DB down / partial outages / retries):**
  - If the DB is down, the current exponential backoff and retry helps smooth over transient hiccups (like `SQLITE_BUSY`). 
  - For prolonged outages, implement a Circuit Breaker pattern to fail fast and shed load, returning `503` immediately rather than holding open thousands of connections.
  - To prevent data loss, we can use a message queue (Kafka or AWS SQS) as a buffer. The API immediately writes the incoming signal to the queue and returns `202 Accepted`, while background workers reliably write to the database.

- **10k RPS design sketch (infra & cost ballpark):**
  - **Load Balancer:** AWS ALB or NGINX ingress routing traffic across containers.
  - **Compute:** Auto-scaling group of stateless Node.js containers (e.g., AWS ECS/EKS). Around 15-20 instances (assuming 500-700 RPS per Node container).
  - **Cache & Rate Limit:** Elasticache Redis cluster (multi-AZ) for rate-limiting and idempotency checks.
  - **Database:** Amazon Aurora PostgreSQL or DynamoDB.
  - **Cost:** ~$1,000 - $3,000/month depending on compute density and data retention policies.
