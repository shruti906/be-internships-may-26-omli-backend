# Signals API (Node.js + Fastify)

A production-leaning, minimal service designed to ingest and retrieve high-volume signals. The API is built with **Node.js, Fastify, and better-sqlite3**, heavily focusing on concurrency safety, idempotency, and database resilience.

---

## 🌟 Core Features & Implementation Details

### 1. Atomic Idempotency
To prevent identical requests from generating duplicate entries, the service relies on an **atomic database-level `UNIQUE` constraint** on the `idempotency_key` column rather than a vulnerable check-then-insert pattern. 
- **How it works:** When a request with an existing `Idempotency-Key` arrives, the initial `INSERT` triggers a `SQLITE_CONSTRAINT_UNIQUE` error. We cleanly catch this exact error code, bypass the insertion, and return the previously stored resource. This guarantees 100% safety against duplicate records under high concurrent load.

### 2. Burst-Safe Rate Limiting
The service limits requests to a default `RATE_LIMIT_PER_MIN` (5 per minute) per `userId` to protect against abuse.
- **How it works:** The initial naive memory counter was replaced with a robust **Sliding Window Log** algorithm. It accurately tracks timestamp arrays for each user and actively filters out requests older than a 60-second window, making it safe against burst traffic and window-boundary circumvention.
- **Memory Safety:** To prevent the `Map` from causing long-term memory leaks, an active background process (`setInterval`) periodically sweeps and removes stale users.

### 3. Database Failure Resilience
To handle partial outages or transient database locks (simulated via the `DB_FAIL_RATE` environment variable), the database layer is wrapped in a robust `withRetry` asynchronous execution block.
- **How it works:** If a transient `SQLITE_BUSY` error occurs, the wrapper catches it and pauses execution using **Exponential Backoff with Jitter**. It automatically retries the operation up to 5 times before failing over, smoothing out traffic spikes and maximizing availability without dropping data.

### 4. Comprehensive Concurrency Testing
To mathematically prove the concurrency resilience of the backend, the test suite actively attacks the endpoints.
- **How it works:** The tests use `Promise.all` to launch completely parallel, simultaneous requests against the idempotency layer and the rate limiter. It explicitly verifies that the DB doesn't lock up, identical requests correctly resolve to the exact same database row, and the rate limiter perfectly cuts off at the absolute limit without racing. Additionally, dedicated isolated test databases are generated to prevent separate test files from interfering with each other's locks.

### 5. Scale Plan (10k RPS)
A concrete architectural roadmap (`SCALE.md`) is provided to outline the evolution from a single-node SQLite backend to a horizontally scalable distributed system.
- **How it works:** It addresses migrating from SQLite to a highly available DB (e.g., PostgreSQL), extracting the in-memory rate limiter / idempotency cache into a Redis cluster, and utilizing message queues (e.g., Kafka) to instantly buffer ingested signals before database writes to handle massive load spikes seamlessly.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation
Clone the repository and install the required dependencies:
```bash
npm install
```

### Running the Server
To start the Fastify server locally on port 8080 (or the port defined in your `.env`):
```bash
npm run dev
```

### Running the Test Suite
The project uses the native `node:test` runner. The test suites simulate extreme concurrent parallel conditions to verify idempotency and rate-limiting integrity. It also provisions isolated SQLite databases for each test to prevent cross-test file locks.
```bash
npm test
```

### Load Testing
You can benchmark the system's performance using `autocannon`:
```bash
npm run bench
```

---

## 📖 API Documentation

### `POST /v1/signals`
Ingest a new signal into the system.
**Headers:**
- `X-API-Key` (Required): Authentication key.
- `Idempotency-Key` (Optional): A unique string to guarantee duplicate requests return the same resource.

**Body:**
```json
{
  "userId": "string",
  "type": "string",
  "payload": "string"
}
```

### `GET /v1/signals`
Retrieve an ordered list of recent signals for a specific user.
**Headers:**
- `X-API-Key` (Required): Authentication key.

**Query Parameters:**
- `userId` (Required): The ID of the user.
- `limit` (Optional): The number of records to return (default 20, max 100).

### `GET /healthz`
Lightweight health-check endpoint for load balancers. Does not require API Key authentication.
