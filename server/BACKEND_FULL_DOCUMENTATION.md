# Backend Full Technical Documentation
**Project:** crypto-wallet-server  
**Generated:** 2026-04-15  
**Analyzed By:** Full codebase deep-read (server/ directory)

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [Project Structure Overview](#2-project-structure-overview)
3. [Runtime Architecture](#3-runtime-architecture)
4. [Environment and Configuration](#4-environment-and-configuration)
5. [Authentication and Authorization](#5-authentication-and-authorization)
6. [Global Middleware and Security](#6-global-middleware-and-security)
7. [Database Layer](#7-database-layer)
8. [Complete API Inventory](#8-complete-api-inventory)
9. [End-to-End Data Flows](#9-end-to-end-data-flows)
10. [Wallet System Deep Dive](#10-wallet-system-deep-dive)
11. [Chain Adapter Architecture](#11-chain-adapter-architecture)
12. [Chain-by-Chain Documentation](#12-chain-by-chain-documentation)
13. [Balance System](#13-balance-system)
14. [Deposit System](#14-deposit-system)
15. [Withdrawal System](#15-withdrawal-system)
16. [Transaction System](#16-transaction-system)
17. [Validation Layer](#17-validation-layer)
18. [Security Review](#18-security-review)
19. [Risk Register / Weak Areas](#19-risk-register--weak-areas)
20. [Frontend-to-Backend Contract Summary](#20-frontend-to-backend-contract-summary)
21. [Glossary](#21-glossary)
22. [Final System Summary](#22-final-system-summary)

---

## 1. Executive Overview

### What This Backend Does
This is a **custodial/semi-custodial multi-chain cryptocurrency wallet backend**. It allows users to:
- Create anonymous sessions (no email/password)
- Create and import HD (BIP39) wallets across 15 blockchain networks
- Send, receive, and track transactions
- View balances, transaction history, and QR codes
- Receive real-time transaction notifications via Socket.IO
- Deposit (receive) and withdraw (send) cryptocurrency

### Main Business Purpose
A cryptocurrency wallet + exchange service starter platform. The backend enables a mobile/web frontend to manage multi-chain crypto wallets without users needing to handle private keys directly — the server encrypts and stores mnemonics.

### Main Capabilities
- **15-chain support:** XRP, Solana, BNB, AVAX, Polygon, ETH, Arbitrum, BTC, ADA/Cardano, LTC, SUI, Aptos, TON, HBAR/Hedera, TRON
- **Custodial custody:** Mnemonics AES-encrypted server-side
- **HD Wallet provisioning:** One mnemonic → wallets on all enabled chains
- **Multi-network:** mainnet/testnet support per chain
- **Background jobs:** Deposit watching, withdrawal status polling, balance sync, session cleanup, treasury reconciliation
- **Real-time updates:** Socket.IO for live transaction events
- **Webhook support:** TRON and BTC webhook endpoints for event-driven tx processing
- **Superadmin dashboard:** Full administrative visibility into users, wallets, transactions, deposits, withdrawals
- **Notification system:** Server-sent events (SSE) + in-app notifications
- **Fee system:** Platform fee + network fee calculation per transaction
- **Internal transfer:** Detect platform-to-platform transfers, settle locally without blockchain if configured

### Main Architecture Style
- **Node.js + Express** REST API (no framework abstraction layer like NestJS)
- **Module-per-domain** folder structure (accounts, auth, wallet, transaction, etc.)
- **Adapter pattern** for multi-chain support (chain adapter per blockchain)
- **MongoDB** via Mongoose ODM
- **Background job scheduler** (in-process `setInterval`-based, no Redis/BullMQ)
- **Socket.IO** for real-time events

### Main Technology Stack
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js 4.x |
| Database | MongoDB (Mongoose 8.x) |
| JWT | jsonwebtoken |
| Crypto | bcrypt, ethers.js, bitcoinjs-lib, xrpl, @hashgraph/sdk, @solana/web3.js, tronweb, @mysten/sui, @aptos-labs/ts-sdk, @ton/ton, bip39, bip32, ed25519-hd-key |
| Real-time | Socket.IO 4.x |
| QR | qrcode |
| Config | dotenv |

---

## 2. Project Structure Overview

```
server/
├── index.js                    ← Entry point / HTTP server bootstrap / middleware chain
├── package.json                ← Dependencies
├── .env                        ← Environment variables (NOT committed)
├── .env.example                ← Template
│
├── config/                     ← Static configuration modules (loaded at startup)
│   ├── app.js                  ← App-level config (port, CORS, body limit, fee toggle)
│   ├── chains.js               ← Complete chain configuration manifest (ALL 15 chains)
│   ├── database.js             ← MongoDB connection + index bootstrapping
│   ├── databaseIndexes.js      ← Additional index definitions
│   ├── envValidation.js        ← Strict env variable validation at startup
│   ├── fees.js                 ← Fee policy configuration
│   ├── marketAssets.js         ← Market asset definitions
│   ├── notificationPolicy.js   ← Notification policy config
│   ├── operations.js           ← Operational tuning (sync cooldowns, concurrency)
│   ├── queue.js                ← Job scheduler flags and intervals
│   ├── redis.js                ← Redis config (stub; not actively used in main flows)
│   ├── security.js             ← JWT secrets, rate limit values, bcrypt rounds
│   ├── solana.js               ← Solana-specific config
│   ├── tokens.js               ← ERC20/TRC20/SPL token registry
│   ├── transactions.js         ← Settlement mode config
│   ├── treasury.js             ← Treasury config
│   └── xrpl.js                 ← XRPL-specific config
│
├── Modules/                    ← Feature modules (each = controller + service + model + validator + routes)
│   ├── accounts/               ← Account management (HD wallet account containers)
│   ├── auth/                   ← User session auth (no email/password — anonymous sessions)
│   ├── balance/                ← Balance fetch + caching + portfolio snapshots
│   ├── chainAdapters/          ← All 15 blockchain adapters + registry + factory + contract
│   │   ├── ada/                ← Cardano adapter
│   │   ├── aptos/              ← Aptos adapter
│   │   ├── arbitrum/           ← Arbitrum (EVM) adapter
│   │   ├── avax/               ← Avalanche (EVM) adapter
│   │   ├── bnb/                ← BNB Smart Chain (EVM) adapter
│   │   ├── btc/                ← Bitcoin adapter
│   │   ├── common/             ← Shared adapter utilities (EVM base, UTXO base)
│   │   ├── eth/                ← Ethereum (EVM) adapter
│   │   ├── hbar/               ← Hedera adapter
│   │   ├── ltc/                ← Litecoin adapter
│   │   ├── polygon/            ← Polygon (EVM) adapter
│   │   ├── solana/             ← Solana adapter
│   │   ├── sui/                ← Sui adapter
│   │   ├── template/           ← Stub/template adapter (not in manifest)
│   │   ├── ton/                ← TON adapter
│   │   ├── tron/               ← TRON adapter
│   │   ├── utxo/               ← UTXO shared logic (BTC/LTC/ADA reconciliation)
│   │   ├── xrp/                ← XRP Ledger adapter
│   │   ├── contract.js         ← Adapter interface contract / validation
│   │   ├── factory.js          ← Adapter factory (createChainAdapter helper)
│   │   ├── manifest.js         ← List of all registered adapters
│   │   ├── metadata.js         ← Metadata builder
│   │   ├── pending.js          ← Pending tx tracking helpers
│   │   └── registry.js         ← Runtime adapter registry (Map-based)
│   ├── deposit/                ← Deposit tracking model + service + routes
│   ├── destinationTag/         ← Destination tag management (XRP routing)
│   ├── health/                 ← Health check routes
│   ├── market/                 ← Market price data service
│   ├── notification/           ← In-app notifications + SSE stream
│   ├── security/               ← Session management, seed vault, mnemonic service
│   │   ├── session.service.js
│   │   ├── seedVault.service.js  ← AES-256-GCM encryption/decryption of mnemonics
│   │   ├── mnemonic.service.js   ← BIP39 mnemonic generation + validation
│   │   └── walletCreationSession.model.js
│   ├── superadmin/             ← Admin dashboard read-only API
│   ├── superadmin-auth/        ← Superadmin login/session management
│   ├── transaction/            ← Core transaction module (send, preview, history)
│   ├── treasury/               ← Treasury wallet tracking
│   ├── user/                   ← User profile + admin management
│   ├── wallet/                 ← Wallet CRUD, provisioning, QR, receive
│   └── webhook/                ← Incoming webhooks (TRON, BTC only)
│
├── middleware/                 ← Express middleware
│   ├── auditLogger.js          ← HTTP request audit logging (conditional)
│   ├── errorHandler.js         ← Global Express error handler
│   ├── idempotency.js          ← In-memory idempotency key deduplication
│   ├── rateLimiter.js          ← In-memory token-bucket rate limiter
│   ├── requestContext.js       ← Assigns requestId + requestStartedAt to each request
│   ├── sanitizeRequest.js      ← Deep-sanitizes body/params/query
│   ├── securityHeaders.js      ← Sets security HTTP headers
│   ├── validateRequest.js      ← Schema-based request validation + role enforcement
│   ├── verifySuperadminToken.js ← Superadmin JWT verification middleware
│   └── verifyToken.js          ← User JWT verification + session check middleware
│
├── helpers/                    ← Pure utility functions
│   ├── errors.js               ← AppError class factory (structured errors)
│   ├── pagination.js           ← Mongoose paginate helper
│   ├── redact.js               ← Object redaction (remove sensitive fields from logs)
│   ├── sanitize.js             ← Input sanitization functions
│   ├── transforms.js           ← Primitive conversions
│   └── validators.js           ← Custom validator class (rule engine)
│
├── common/                     ← Shared domain utilities
│   ├── classes/                ← Model base class (ajModel wrapper)
│   ├── constants/              ← Error codes, status codes
│   ├── lib/                    ← Shared library code
│   └── utils/                  ← Chain, asset, explorer, amount, hash, logger utils
│
├── services/                   ← Application-level services
│   ├── cache/                  ← In-memory caches
│   ├── chainRuntime.service.js ← Runtime chain initialization
│   ├── health.service.js       ← Health check payload builder
│   ├── integrations/           ← External integrations
│   ├── notifications/          ← Notification emission service
│   ├── queue/                  ← Transaction queue service
│   └── runtimeState.js         ← Global runtime state tracker
│
├── lib/
│   └── socket.js               ← Socket.IO server initialization + event emitters
│
├── jobs/                       ← Background job definitions
│   ├── index.js                ← Job scheduler (setInterval-based)
│   ├── depositWatcher.job.js   ← Poll all wallets for deposits (30s interval)
│   ├── withdrawalStatus.job.js ← Poll pending withdrawals for status (60s interval)
│   ├── transactionStatus.job.js ← Poll pending transactions for status (60s interval)
│   ├── balanceSync.job.js      ← Sync balances for all wallets (5min interval)
│   ├── sessionCleanup.job.js   ← Expire old user sessions (1h interval)
│   ├── superadminSessionCleanup.job.js ← Expire superadmin sessions
│   ├── syncQueueWorker.job.js  ← Process queued sync jobs (15s interval)
│   ├── treasuryReconcile.job.js ← Reconcile treasury balances (24h interval)
│   └── utxoWalletSync.job.js   ← Sync UTXO wallet addresses (3min interval)
│
└── scripts/
    └── superadmin/
        └── bootstrapSuperadmin.js  ← One-time superadmin account creation script
```

**Critical runtime folders:** `Modules/`, `config/`, `middleware/`, `jobs/`, `lib/`

---

## 3. Runtime Architecture

### Server Startup Sequence (`index.js` → `startServer()`)

```
1. validateEnvironment()         ← Validates all required env vars; throws on failure
2. initializeRuntimeChains()     ← Determines which chains are active vs disabled at runtime
3. connectDB()                   ← Connects to MongoDB, creates indexes
4. jobScheduler.startAll()       ← Starts background jobs (if QUEUE_ENABLED=true)
5. app.listen(PORT)              ← HTTP server begins accepting connections
6. socket.initializeSocket(server) ← Socket.IO initialized on same HTTP server
7. SIGINT/SIGTERM handlers →     gracefulShutdown()
```

### Request Processing Pipeline

Every inbound HTTP request passes through this chain (in order):

```
CORS check
→ express.json() body parser (limit: BODY_LIMIT)
→ express.urlencoded()
→ sanitizeRequest    ← Deep-sanitizes body/params/query (strips dangerous chars)
→ requestContext     ← Assigns requestId (UUID-like), requestStartedAt timestamp
→ securityHeaders    ← Sets X-Content-Type-Options, X-Frame-Options, CSP, etc.
→ rateLimiter        ← Global rate limit (120 req/min per IP+path by default)
→ idempotency        ← Checks/records Idempotency-Key header for mutation requests
→ auditLogger        ← Logs completed requests if REQUEST_LOGGING_ENABLED=true
→ [module routes]
  → verifyToken / verifySuperadminToken  ← JWT verification + session check
  → allowRoles()                          ← Role enforcement (if needed)
  → validateRequest(rules)                ← Schema validation + body whitelist
  → controller method
    → service layer
      → model/adapter
        → MongoDB / blockchain RPC
→ errorHandler       ← Catches all errors, formats AppError responses
```

### Domain Layer Architecture

```
Route (routes.js) 
  → Middleware (verifyToken, validateRequest)
  → Controller (controller.js)       ← HTTP request/response handling only
    → Service (service.js)           ← Business logic
      → Model (model.js)            ← Mongoose schema + DB operations
      → Chain Adapter (chainAdapters/<chain>/index.js)  ← Blockchain operations
      → other services (balance, fee, notification, etc.)
```

---

## 4. Environment and Configuration

### Core Required Variables (Server WILL NOT start without these)

| Variable | Purpose | Notes |
|----------|---------|-------|
| `APP_NAME` | Application name shown in logs and health | minLength: 1 |
| `DEFAULT_CHAIN` | Default chain assigned to new users | Must be a configured chain code |
| `JWT_SECRET` | User JWT signing secret | minLength: 32, should be ≥64 bytes |
| `ENCRYPTION_KEY` | AES key for mnemonic encryption | minLength: 32, should be ≥64 bytes; must differ from JWT_SECRET |
| `DB_URI` | MongoDB connection URI | Must start with `mongodb://` or `mongodb+srv://` |
| `NODE_ENV` | `development` or `production` | Controls stack traces in error responses |
| `PORT` | HTTP server port | 1-65535 |
| `BODY_LIMIT` | Max request body size | e.g. `1mb` |
| `API_PREFIX` | Route prefix for all modules | e.g. `/api/v1` |
| `REQUEST_LOGGING_ENABLED` | Toggle HTTP audit logging | `true` or `false` |
| `QUEUE_ENABLED` | Enable background job scheduler | `true` or `false` |
| `CORS_ORIGIN` | Comma-separated allowed origins | Must be exact origins (no wildcards) |

### Security-Critical Variables

| Variable | Purpose | Risk if Missing |
|----------|---------|----------------|
| `JWT_SECRET` | Signs user access tokens | Token forgery |
| `ENCRYPTION_KEY` | Encrypts stored mnemonics | Database breach = mnemonic exposure |
| `SUPERADMIN_JWT_SECRET` | Signs superadmin tokens (falls back to JWT_SECRET if missing) | Privilege escalation if same as JWT_SECRET |

### Recommended Variables

| Variable | Purpose |
|----------|---------|
| `SUPERADMIN_JWT_SECRET` | Separate secret for superadmin sessions |
| `PLATFORM_TRANSFER_SETTLEMENT_MODE` | `metadata_only`, `onchain`, or `local_internal` |

### Job Control Variables (Optional)

| Variable | Default | Purpose |
|----------|---------|---------|
| `JOBS_ENABLED` | false | Primary toggle (takes precedence over QUEUE_ENABLED) |
| `DEPOSIT_WATCHER_ENABLED` | inherits global | Enable deposit watcher job |
| `DEPOSIT_WATCHER_INTERVAL_MS` | 30000 | Deposit poll interval |
| `WITHDRAWAL_STATUS_ENABLED` | inherits global | Enable withdrawal status job |
| `WITHDRAWAL_STATUS_INTERVAL_MS` | 60000 | Withdrawal poll interval |
| `BALANCE_SYNC_ENABLED` | inherits global | Enable balance sync job |
| `BALANCE_SYNC_INTERVAL_MS` | 300000 | Balance sync interval |
| `SESSION_CLEANUP_ENABLED` | inherits global | Clean expired sessions |
| `SESSION_CLEANUP_INTERVAL_MS` | 3600000 | Session cleanup interval |
| `TREASURY_RECONCILE_ENABLED` | inherits global | Treasury reconciliation |
| `TREASURY_RECONCILE_INTERVAL_MS` | 86400000 | Treasury reconcile interval |
| `UTXO_WALLET_SYNC_ENABLED` | inherits global | UTXO address sync |
| `SYNC_QUEUE_WORKER_ENABLED` | inherits global | Process sync queue |

### Rate Limit Variables (Optional, with defaults)

| Variable | Default | Purpose |
|----------|---------|---------|
| `RATE_LIMIT_WINDOW_MS` | 60000 | Global rate window |
| `RATE_LIMIT_MAX_REQUESTS` | 120 | Max requests per window globally |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | 10 | Max auth attempts per window |
| `TRANSACTION_RATE_LIMIT_MAX_REQUESTS` | 30 | Max tx requests per window |
| `WALLET_MUTATION_RATE_LIMIT_MAX_REQUESTS` | 10 | Max wallet creates/imports |

### Token/Session Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ACCESS_TOKEN_EXPIRES_IN` | `1d` | User access token lifetime |
| `REFRESH_TOKEN_TTL_MS` | 30 days | Refresh token lifetime |
| `SUPERADMIN_ACCESS_TOKEN_EXPIRES_IN` | `15m` | Superadmin access token lifetime |
| `SUPERADMIN_REFRESH_TOKEN_TTL_MS` | 7 days | Superadmin refresh token lifetime |
| `IDEMPOTENCY_TTL_MS` | 15min | Idempotency cache TTL |

### Fee Variables

| Variable | Purpose |
|----------|---------|
| `SYSTEM_FEE_ENABLED` | Master toggle for platform fees |
| `PLATFORM_FEE_ENABLED` | Must also be `true` for fees to be charged |
| `PLATFORM_FEE_TYPE` | `fixed` or `percentage` |
| `PLATFORM_FEE_VALUE` | Amount (fixed) or rate (percentage) |
| `SYSTEM_WALLET_ADDRESS` | Address to receive platform fees |
| `SYSTEM_WALLET_SECRET` | Private key/mnemonic for the system wallet |

### Chain-Specific Variables

Each enabled chain has its own set. Examples:

| Chain | Variables |
|-------|----------|
| XRP | `XRPL_DEFAULT_NETWORK`, `XRPL_MAINNET_URL` (WSS), `XRPL_TESTNET_URL` |
| ETH | `ETH_RPC_HTTP`, `ETH_RPC_WSS`, `ETH_CHAIN_ID`, `ETH_EXPLORER_API_URL`, `ETH_EXPLORER_API_KEY` |
| BNB | `BNB_RPC_HTTP`, `BNB_RPC_WSS`, `BNB_CHAIN_ID` |
| AVAX | `AVAX_RPC_HTTP`, `AVAX_RPC_WSS`, `AVAX_CHAIN_ID` |
| Polygon | `POLYGON_RPC_HTTP`, `POLYGON_RPC_WSS`, `POLYGON_CHAIN_ID` |
| Arbitrum | `ARBITRUM_RPC_HTTP`, `ARBITRUM_RPC_WSS`, `ARBITRUM_CHAIN_ID` |
| BTC | `BTC_DEFAULT_NETWORK`, `BTC_MAINNET_API_URL`, `BTC_TESTNET_API_URL` |
| ADA | `ADA_DEFAULT_NETWORK`, `ADA_MAINNET_API_URL`, `ADA_MAINNET_PROJECT_ID`, `ADA_PREPROD_API_URL`, `ADA_PREPROD_PROJECT_ID` |
| LTC | `LTC_DEFAULT_NETWORK`, `LTC_MAINNET_API_URL` |
| Solana | `SOLANA_DEFAULT_NETWORK`, `SOLANA_MAINNET_URL`, `SOLANA_TESTNET_URL` |
| SUI | `SUI_DEFAULT_NETWORK`, `SUI_MAINNET_RPC_URL` |
| Aptos | `APTOS_DEFAULT_NETWORK`, `APTOS_MAINNET_URL`, `APTOS_TESTNET_URL`, `APTOS_DEVNET_URL` |
| TON | `TON_DEFAULT_NETWORK`, `TON_MAINNET_RPC_URL`, `TON_MAINNET_API_KEY` (optional) |
| HBAR | `HBAR_DEFAULT_NETWORK`, `HBAR_MAINNET_MIRROR_API_URL`, `HBAR_TESTNET_MIRROR_API_URL`, optional: operator keys for auto-provisioning |
| TRON | `TRON_DEFAULT_NETWORK`, `TRON_MAINNET_URL`, `TRON_MAINNET_FALLBACKS` |


---

## 5. Authentication and Authorization

### User Auth Flow

**This system has NO email/password.** Authentication is anonymous — each session creates/reuses a User document.

#### POST `/api/v1/auth/session` (Create Session)
1. No credentials required
2. Calls `authService.createSession(payload)`
3. Creates a `User` document (status: `active`, role: `user`)
4. Ensures a default `Account` document exists for that user
5. Creates a `Session` document (refresh token stored hashed)
6. Returns: `{ token, accessToken, refreshToken, sessionId, userId, expiresIn, user }`

#### Access Token Format
JWT payload:
```json
{ "userId": "...", "sessionId": "...", "tokenType": "access" }
```
Signed with `JWT_SECRET`, expires per `ACCESS_TOKEN_EXPIRES_IN` (default: 1 day).

#### `verifyToken` Middleware (applied to all user routes)
1. Extracts `Authorization: Bearer <token>` header
2. `jwt.verify(token, jwtSecret)` — validates signature + expiry
3. Checks `tokenType === "access"` — rejects refresh tokens used as access tokens
4. Loads `User.findById(decoded.userId)` — excludes `seedCipherText`
5. Checks `user.status === "active"` — rejects locked/archived users
6. Calls `sessionService.assertSessionIsActive(sessionId, userId)` — validates session is not revoked
7. Attaches `req.user = { _id, publicAddress, role, status, primaryChain }`

#### Token Refresh
- `POST /api/v1/auth/refresh` with `{ refreshToken }` in body
- Rotates refresh token (old invalidated, new issued)
- Returns new access token + refresh token pair

#### Logout
- `POST /api/v1/auth/logout` — revokes current session or all sessions (`revokeAll: true`)

### Superadmin Auth Flow

**Superadmin uses email + password.**

#### POST `/api/v1/superadmin-auth/login`
1. Accepts `{ email, password }` in body
2. Looks up `Superadmin` document by email
3. `bcrypt.compare(password, superadmin.passwordHash)`
4. Creates superadmin session, signs with `SUPERADMIN_JWT_SECRET`
5. Token payload: `{ superadminId, sessionId, subjectType: "superadmin", tokenType: "superadmin_access" }`

#### `verifySuperadminToken` Middleware
1. Extracts Bearer token
2. Verifies with `superadminJwtSecret`
3. Checks `subjectType === "superadmin"` AND `tokenType === "superadmin_access"`
4. Loads `Superadmin` document
5. Checks `superadmin.status === "active"` and `role` is in `superadminRoles`
6. Validates session is active

### Role System

| Role | Applies To | Access |
|------|-----------|--------|
| `user` | Regular users | Own wallets, transactions, balances |
| `admin` | Users with admin role | User list, user update/delete |
| `superadmin` | Superadmin users (separate collection) | Full read access via /superadmin/* |

**`allowRoles(["admin", "superadmin"])` middleware** enforces role in user routes.  
All `/api/v1/superadmin/*` routes use `verifySuperadminToken` (different token type + secret).

### Session Management

- Both user sessions and superadmin sessions are stored in MongoDB (separate collections)
- Sessions have explicit TTL and revocation support
- Sessions cleaned up by background jobs
- Superadmin: max 5 concurrent sessions (`SUPERADMIN_MAX_CONCURRENT_SESSIONS`)

### Security Weaknesses in Auth

- ⚠️ **No email/password for users** — any client can create an anonymous session, no identity binding
- ⚠️ **SUPERADMIN_JWT_SECRET falls back to JWT_SECRET** — if not set separately, a compromised user token secret also affects superadmin
- ⚠️ **Session validation is DB-query per request** — no caching; scalability concern at volume
- ✅ Token type enforcement prevents refresh tokens being used as access tokens
- ✅ Separate secrets and token subjects for user vs superadmin

---

## 6. Global Middleware and Security

### CORS (`index.js`)
- Custom CORS origin check against allowlist from `CORS_ORIGIN` env
- No wildcard allowed when credentials are enabled
- Origins validated at startup time (format, protocol, no trailing slash)
- Credentials mode enabled

### Security Headers (`securityHeaders.js`)
Applied to all responses:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```
- ✅ Strong CSP — server API responses reject all content embedding
- ❌ Missing `Strict-Transport-Security` (HSTS) — relies on infrastructure (nginx/proxy) to handle
- ❌ Missing `X-XSS-Protection` (legacy but often requested)
- ❌ No Helmet integration — custom implementation covering basics

### Rate Limiting (`rateLimiter.js`)
- **In-memory token bucket** per IP+method+path combination
- **Not shared across processes/servers** — ineffective in multi-instance deployments
- Key format: `${ip}:${method}:${path}[:keySuffix]`

| Limiter | Window | Max Requests | Applies To |
|---------|--------|-------------|------------|
| Global | 60s | 120 | All routes |
| Auth | 60s | 10 | /auth/session, /auth/refresh |
| Superadmin Auth | 60s | 10 | /superadmin-auth/login |
| Transaction | 60s | 30 | /transaction/* mutations |
| Wallet Mutation | 60s | 10 | Wallet create/import |

Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Idempotency (`idempotency.js`)
- Checks `Idempotency-Key` header on POST/PUT/PATCH/DELETE
- Stores key in-memory Map with TTL (default 15 minutes)
- Returns `409 IDEMPOTENCY_CONFLICT` if key seen within TTL window
- ❌ In-memory only — does not persist across restarts or work across instances

### Input Sanitization (`sanitizeRequest.js` + `helpers/sanitize.js`)
- Applied globally before routing
- Deep-sanitizes body, params, query
- `validateRequest(rules)` middleware additionally strips all body/params/query keys NOT in the rules object (whitelist approach)

### Request Logging (`auditLogger.js`)
- Conditional on `REQUEST_LOGGING_ENABLED=true`
- Logs on `res.finish`: method, path, statusCode, durationMs, userId

### Error Handling (`errorHandler.js`)
- Global Express error handler (4-arg middleware)
- In development: full error messages + stack traces
- In production: 5xx errors return generic "Internal server error"; 4xx errors return full message
- Uses `AppError` structured errors with status codes and error codes

### Anti-Abuse Protections
- Rate limiters on auth, transactions, wallet mutations
- Idempotency key deduplication
- CORS allowlist enforcement
- Body size limits

---

## 7. Database Layer

### Technology
- **MongoDB** via Mongoose 8.x
- `autoIndex: false` in production (indexes managed explicitly)
- Connection established before HTTP server starts (`await connectDB()`)
- Custom index bootstrap called for `transactions` and `withdrawals` on startup

### Collections / Models

| Collection | Model File | Purpose |
|------------|-----------|---------|
| `users` | `Modules/user/model.js` | User profiles |
| `sessions` | `Modules/security/session.model.js` | User sessions |
| `superadmins` | `Modules/superadmin/model.js` | Superadmin accounts |
| `superadminsessions` | `Modules/superadmin-auth/session.model.js` | Superadmin sessions |
| `accounts` | `Modules/accounts/model.js` | HD wallet account containers |
| `wallets` | `Modules/wallet/model.js` | Individual chain wallets |
| `walletaddresses` | `Modules/wallet/address.model.js` | Managed addresses (UTXO/HBAR) |
| `walletcreationsessions` | `Modules/security/walletCreationSession.model.js` | In-progress wallet creation sessions |
| `transactions` | `Modules/transaction/model.js` | All transactions (send/receive) |
| `syncjobs` | `Modules/transaction/syncJob.model.js` | Sync job queue |
| `ledgerentries` | `Modules/transaction/ledgerEntry.model.js` | Internal balance ledger |
| `deposits` | `Modules/deposit/model.js` | Deposit tracking records |
| `withdrawals` | `Modules/withdrawal/model.js` | Withdrawal tracking records |
| `notifications` | Notifications module | In-app notifications |
| `balancesnapshots` | `Modules/balance/snapshot.model.js` | Persisted balance snapshots |
| `portfoliosnapshots` | `Modules/balance/portfolioSnapshot.model.js` | Portfolio-level balance cache |
| `treasurywallet` | `Modules/treasury/model.js` | Treasury wallet tracking |

### Key Schema Details

#### User Schema
```
primaryChain:  String (enum: configured chain codes)
status:        "pending_mnemonic_confirmation" | "active" | "locked" | "archived"
role:          "superadmin" | "admin" | "user"
publicAddress: String (sparse unique index)
publicKey:     String
seedCipherText: String (excluded from default selects)
seedFingerprint: String (sparse unique index)
mnemonicConfirmedAt: Date
confirmationSample: [{position, wordHash}]
signingPolicy: "system_custody" | "external_custody"
mfaEnabled:    Boolean
lastAccessAt:  Date
metadata:      Mixed
```

#### Wallet Schema
```
userId:      ObjectId → User
accountId:   ObjectId → Account
chain:       String (enum of configured chains)
address:     String
publicKey:   String
network:     String (validated against chain's supported networks)
asset:       String (defaults to chain's native asset symbol)
label:       String
sourceType:  "created" | "imported"
isImported:  Boolean
encryptedRecoveryPhrase:
  { algorithm, cipherText (select:false), iv (select:false), authTag (select:false), keyVersion }
metadata:    Mixed (rich metadata: balance, provisioning, routing, walletState, explorer, etc.)
```
**Critical indexes:**
- `{ address, network, chain }` — unique (prevents duplicate wallets)
- `{ walletId, isSystemManaged, chainTimestamp, confirmedAt, createdAt }` — primary sort for history

#### Transaction Schema
```
userId, accountId, walletId: ObjectIds
chain, network: String
fromAddress, toAddress: String
amount, amountBaseUnits, currency, asset, assetType, standard, contractAddress
networkFee, networkFeeBaseUnits
platformFee, platformFeeBaseUnits
totalDebit, totalDebitBaseUnits
recipientGets, recipientGetsBaseUnits
txHash: String (indexed, partial unique on non-null)
confirmations, ledgerIndex, validated, succeeded
chainTimestamp, chainStatus, systemStatus
status: "pending" | "success" | "failed"
transactionType: "internal" | "external"
direction: "incoming" | "outgoing"
type: "transfer" | "deposit" (default "transfer")
isSystemManaged: Boolean
rawRequest, rawResponse: Mixed
metadata: Mixed
relatedTransactionId: ObjectId → Transaction
```

#### Deposit Schema
```
userId, accountId, walletId: ObjectIds
chain, network, asset, address, txHash, vout
amount, confirmations, status
transactionId: ObjectId → Transaction
chainStatus
confirmedAt, confirmed_at, block_time
metadata
```
**Unique index:** `{ walletId, txHash, vout }` — prevents duplicate deposit records per output

#### Withdrawal Schema
```
userId, accountId, walletId: ObjectIds
chain, network, asset
amount, destinationAddress, executionParams
status (created→processing→completed|failed)
reference: String (required; used as idempotency key)
transactionId: ObjectId → Transaction
txHash, chainStatus, systemStatus
confirmedAt, confirmed_at, block_time, failedAt
metadata
```
**Unique index:** `{ transactionId }` (sparse) — one withdrawal per transaction

---

## 8. Complete API Inventory

Base path: `${API_PREFIX}/{module}` (e.g., `/api/v1/auth`)

### Auth Module (`/api/v1/auth`)

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| POST | `/session` | None | Auth (10/min) | Create anonymous user session |
| POST | `/refresh` | None | Auth (10/min) | Rotate refresh token |
| POST | `/logout` | User JWT | — | Revoke current or all sessions |
| GET | `/sessions` | User JWT | — | List user's active sessions |
| POST | `/sessions/:sessionId/revoke` | User JWT | — | Revoke specific session |

**POST /session** Request Body:
```json
{
  "deviceId": "string (optional)",
  "deviceLabel": "string (optional)",
  "platform": "string (optional)",
  "appVersion": "string (optional)",
  "biometricCapable": false,
  "metadata": {}
}
```
Response: `{ token, accessToken, refreshToken, sessionId, userId, expiresIn, user: { _id, primaryChain, status, role } }`

**POST /refresh** Request Body:
```json
{ "refreshToken": "string (required)" }
```

**POST /logout** Request Body:
```json
{ "revokeAll": false }
```

---

### Wallet Module (`/api/v1/wallet`)

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| GET | `/` | User JWT | — | List user wallets |
| GET | `/supported-chains` | User JWT | — | List all supported chains |
| GET | `/:walletId` | User JWT | — | Get wallet details |
| GET | `/:walletId/receive` | User JWT | — | Get receive payload (address + QR data) |
| GET | `/:walletId/receive/qr` | User JWT | — | Generate QR image |
| POST | `/create/init` | User JWT | Wallet (10/min) | Start wallet creation (returns mnemonic) |
| POST | `/` | User JWT | Wallet (10/min) | Direct wallet create (alias for init) |
| POST | `/create/confirm` | User JWT | Wallet (10/min) | Confirm mnemonic + provision wallets |
| POST | `/import` | User JWT | Wallet (10/min) | Import existing mnemonic |

**GET /** Query Params:
```
page, limit, search, accountId, chain, network, includeHidden, includeArchived
```

**GET /:walletId/receive** Query Params:
```
amount (optional), asset (optional), executionParams (optional), qrParams (optional)
```

**POST /create/init** Request Body:
```json
{
  "chain": "string",
  "network": "string",
  "label": "string (optional)",
  "accountId": "string (optional)",
  "targets": [{ "chain": "...", "network": "..." }]
}
```
Response: `{ sessionId, recoveryPhrase (12-24 words), chain, network, expiresAt }`

**POST /create/confirm** Request Body:
```json
{
  "sessionId": "string (required)",
  "mnemonic": "string (required - must match phrase from init)",
  "chain": "string",
  "network": "string",
  "label": "string (optional)",
  "accountId": "string (optional)"
}
```
Response: `{ walletId, address, chain, network, provisionedWallets, provisionedWalletCount }`

**POST /import** Request Body:
```json
{
  "mnemonic": "string (required - 12-24 BIP39 words)",
  "chain": "string",
  "network": "string",
  "label": "string (optional)",
  "accountId": "string (optional)",
  "targets": [...]
}
```

---

### Transaction Module (`/api/v1/transaction`)

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| GET | `/` | User JWT | — | List all user transactions |
| GET | `/wallet/:walletId` | User JWT | — | List wallet-specific transactions |
| GET | `/:transactionId` | User JWT | — | Get transaction details |
| POST | `/validate-destination` | User JWT | Tx (30/min) | Validate destination address |
| POST | `/preview` | User JWT | Tx (30/min) | Preview transaction + fee quote |
| POST | `/send` | User JWT | Tx (30/min) | Execute transaction |
| POST | `/wallet/:walletId/sync` | User JWT | — | Trigger wallet history sync |

**GET /** Query Params:
```
page, limit, status, chain, direction, search, walletId, startDate, endDate
```

**POST /validate-destination** Request Body:
```json
{
  "walletId": "string (required)",
  "destinationAddress": "string (required)",
  "executionParams": { "destinationTag": 12345 }
}
```
Response: `{ walletId, destinationAddress, isValid, isInternal, isSamePlatform, chain, network, executionParams }`

**POST /preview** Request Body:
```json
{
  "walletId": "string (required)",
  "destinationAddress": "string (required)",
  "amount": "string (required)",
  "asset": "string (optional - for tokens)",
  "executionParams": {},
  "sendMax": false
}
```
Response: `{ amount, networkFee, platformFee, totalDebit, recipientGets, canSubmit, ... }`

**POST /send** Request Body:
```json
{
  "walletId": "string (required)",
  "destinationAddress": "string (required)",
  "amount": "string (required)",
  "asset": "string (optional)",
  "executionParams": {},
  "sendMax": false
}
```
Response: `{ transactionId, txHash, status, chain, amount, ... }`

---

### Deposit Module (`/api/v1/deposit`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | User JWT | List user's deposits |

**GET /** Query Params: `page, limit, status, chain, walletId`

---

### Withdrawal Module (`/api/v1/withdrawal`)

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| GET | `/` | User JWT | — | List user withdrawals |
| POST | `/` | User JWT | Tx (30/min) | Create/request withdrawal |

**POST /** Request Body:
```json
{
  "walletId": "string (required)",
  "destinationAddress": "string (required)",
  "amount": "string (required)",
  "asset": "string (optional)",
  "executionParams": {}
}
```
Response: `{ withdrawalId, reference, status, amount, destinationAddress }`

---

### User Module (`/api/v1/user`)

| Method | Path | Auth | Role | Purpose |
|--------|------|------|------|---------|
| GET | `/me` | User JWT | Any | Get own profile |
| GET | `/` | User JWT | admin/superadmin | List all users |
| PATCH | `/:id` | User JWT | admin/superadmin | Update user |
| DELETE | `/:id` | User JWT | admin/superadmin | Delete user |

---

### Accounts Module (`/api/v1/accounts`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | User JWT | List user accounts |
| POST | `/` | User JWT | Create new account |
| POST | `/import` | User JWT | Import account from mnemonic |
| GET | `/:accountId` | User JWT | Get account details |
| PATCH | `/:accountId` | User JWT | Update account |
| DELETE | `/:accountId` | User JWT | Archive account |

---

### Balance Module (`/api/v1/balance`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | User JWT | Get all wallet balances |
| GET | `/:walletId` | User JWT | Get single wallet balance |

---

### Notification Module (`/api/v1/notification`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/stream` | User JWT | SSE event stream |
| GET | `/` | User JWT | List notifications |
| GET | `/unread-count` | User JWT | Get unread count |
| PATCH | `/read-all` | User JWT | Mark all as read |
| PATCH | `/:notificationId/read` | User JWT | Mark single as read |
| DELETE | `/clear-all` | User JWT | Delete all notifications |

---

### Superadmin Auth Module (`/api/v1/superadmin-auth`)

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| POST | `/login` | None | SA Auth (10/min) | Superadmin login |
| POST | `/refresh` | None | SA Auth (10/min) | Superadmin token refresh |
| POST | `/logout` | SA JWT | — | Superadmin logout |
| GET | `/me` | SA JWT | — | Get superadmin profile |

---

### Superadmin Module (`/api/v1/superadmin`) — All require SA JWT

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/overview` | Platform stats overview |
| GET | `/users` | List all users |
| GET | `/users/:userId` | User details |
| GET | `/accounts` | List all accounts |
| GET | `/accounts/:accountId` | Account details |
| GET | `/wallets` | List all wallets |
| GET | `/wallets/:walletId` | Wallet details |
| GET | `/transactions` | List all transactions |
| GET | `/transactions/:transactionId` | Transaction details |
| GET | `/deposits` | List all deposits |
| GET | `/deposits/:depositId` | Deposit details |
| GET | `/withdrawals` | List all withdrawals |
| GET | `/withdrawals/:withdrawalId` | Withdrawal details |
| GET | `/sessions` | List user sessions |
| GET | `/sessions/:sessionId` | Session details |
| GET | `/audit` | List audit events |
| GET | `/audit/:auditId` | Audit event details |
| GET | `/treasury` | List treasury wallets |
| GET | `/treasury/:treasuryId` | Treasury details |
| GET | `/chains` | List configured chains |
| GET | `/chains/:chainId` | Chain details |
| GET | `/jobs` | List background jobs and status |
| GET | `/jobs/:jobName` | Job details |
| GET | `/settings` | Platform settings |

---

### Webhook Module (`/api/v1/webhook`) — No Auth

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/tron` | None | TRON transaction webhook |
| POST | `/btc` | None | BTC transaction webhook |

> ⚠️ **CRITICAL RISK:** These endpoints have NO authentication whatsoever.

---

### Health & Root

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | None | Server health / version |
| GET | `/health` | None | Detailed health payload |

---

### Destination Tag Module (`/api/v1/destinationTag`)

*(Routes exist for XRP destination tag management — used for routing payments to specific wallets via shared XRP addresses)*

---

### Security Module (`/api/v1/security`)

*(Handles security-related operations — session management, potentially wallet creation sessions)*

---

### Market Module (`/api/v1/market`)

*(Market price data endpoints)*

---

### Treasury Module (`/api/v1/treasury`)

*(Treasury wallet management)*

---

## 9. End-to-End Data Flows

### Flow 1: User Signup / Session Creation

```
Frontend sends: POST /api/v1/auth/session { deviceId, platform, ... }

Backend:
1. sanitizeRequest → sanitize body
2. rateLimiter → check auth rate limit (10/min per IP)
3. validateRequest(createSessionRules) → validate body
4. controller.createSession → authService.createSession(payload)
5. authService:
   a. cleanupLegacyNullUniqueFields() → remove null sparse fields from old docs
   b. User.create({ primaryChain: DEFAULT_CHAIN, status: "active", role: "user" })
   c. accountService.ensureDefaultAccountForUser(userId)
      → creates Account + generates random mnemonic for it
   d. sessionService.createRefreshSession({ userId, ...deviceInfo })
      → Session.create({ userId, refreshToken: hashedToken, expiresAt, ... })
   e. signAccessToken({ userId, sessionId }) → JWT
6. Returns: { token, accessToken, refreshToken, sessionId, userId, user }

DB effects: Creates User, Account, Session documents
```

### Flow 2: Wallet Create (Two-Step)

**Step 1: Init**
```
POST /api/v1/wallet/create/init { chain, network, label, accountId }

1. verifyToken → authenticate user
2. walletMutationRateLimiter → check wallet mutation rate limit
3. validateRequest(createWalletRules)
4. controller.createInit → walletService.generateRecoveryPhrase(userId, input)
5. walletService:
   a. assertChainFeature(chain, network, "create") → verify chain supports creation
   b. ensureValidAccountId(userId, accountId)
   c. Check walletCreationInitInFlight Map (dedup concurrent requests)
   d. findReusablePendingCreationSession() → reuse if exists and not expired
   e. If no reusable: mnemonicService.generateMnemonic() → BIP39 random mnemonic
   f. seedVault.encryptSeed(mnemonic) → AES-256-GCM encrypt
   g. WalletCreationSession.create({ userId, chain, network, encryptedRecoveryPhrase, expiresAt })
6. Returns: { sessionId, recoveryPhrase, chain, network, expiresAt }

DB effects: Creates WalletCreationSession document
Security: Mnemonic displayed to user ONCE here; after confirm, only stored encrypted
```

**Step 2: Confirm**
```
POST /api/v1/wallet/create/confirm { sessionId, mnemonic, chain, network, label, accountId }

1. verifyToken, rateLimiter, validateRequest
2. controller.confirmCreate → walletService.confirmWalletCreation(userId, input)
3. walletService:
   a. WalletCreationSession.findOne({ _id: sessionId, userId, status: "pending", not expired })
   b. seedVault.decryptSeed(session.encryptedRecoveryPhrase) → original mnemonic
   c. mnemonicService.validateMnemonic(input.mnemonic) → normalize BIP39
   d. Compare normalized original vs input → throw if mismatch
   e. provisioningService.provisionSupportedWalletsForUser({
        userId, accountId, mnemonic, primaryTarget: {chain, network}, targets
      })
      → For each target:
         i. getChainContext(chain) → get adapter
         ii. adapter.wallet.generateWalletFromMnemonic(mnemonic, network)
             → returns { address, publicKey, derivationPath, metadata }
         iii. Wallet.create({ userId, accountId, chain, network, address, publicKey,
                              encryptedRecoveryPhrase, sourceType: "created", ... })
         iv. assignManagedExecutionParams() → e.g., destinationTag for XRP
         v. persistManagedWalletAddress() → for UTXO chains
         vi. registerProvisionedWatchAddresses() → for chains with address watching (BTC)
   f. session.status = "confirmed" → session.save()
   g. deferProvisionedWalletSetSync() → schedule background balance sync
4. Returns: { walletId, address, chain, network, provisionedWallets }

DB effects: Creates Wallet documents for each chain; updates WalletCreationSession
Blockchain: No blockchain tx, just offline key derivation
```

### Flow 3: Wallet Import

```
POST /api/v1/wallet/import { mnemonic, chain, network, label, accountId, targets }

1. Validate mnemonic: BIP39 validation (12-24 words)
2. mnemonicService.validateMnemonic() → normalize
3. seedVault.encryptSeed() → encrypt
4. provisioningService.provisionSupportedWalletsForUser() → same as confirm above
   - Mode = "imported" → upserts existing wallets if same address found
5. deferProvisionedWalletSetSync()
6. Returns provisioned wallet set

Note: Import defers ADA full account discovery with status "pending_recovery"
```

### Flow 4: Balance Fetch

```
GET /api/v1/balance/:walletId

1. verifyToken
2. balanceService.getWalletBalance(userId, walletId, options)
3. Load wallet from DB (must belong to user)
4. shouldUsePersistedBalanceRead(wallet) → check if recent cached balance exists
   - If yes and not forced and not HBAR/Aptos: return buildCachedWalletBalance() (no blockchain call)
5. shouldSkipRecentBalanceSync(wallet) → check cooldown (default 60s for most chains)
6. If not skip: withBalanceSyncDedup() → deduplicate concurrent calls
7. context.adapter.balance.fetchBalance({ address, network })
   → Each chain's adapter makes RPC call to blockchain
8. Persist sync result to wallet.metadata.balance
9. resolveInternalBalanceDeltaBaseUnits() → compute ledger credit/debit delta
10. Return formatted balance: { onChainBalance, availableBalance, tokenBalances, ... }
```

### Flow 5: Transaction Preview

```
POST /api/v1/transaction/preview { walletId, destinationAddress, amount, executionParams }

1. verifyToken, transactionRateLimiter, validateRequest
2. transactionService.preview(userId, input)
3. getWalletOrFail(userId, walletId)
4. assertChainFeature(chain, network, "send")
5. resolveTransferAsset(wallet, requestedAsset) → native or token descriptor
6. resolveInternalTransferRecipient() → check if destination is same-platform wallet
7. balanceService.getWalletBalance() → fetch balance (needed for validation)
8. feeService.quoteTransfer() →
   a. getFeePolicy(context, transactionType) → load fee policy
   b. calculatePlatformFeeAmount() → fixed or percentage platform fee
   c. context.adapter.transaction.estimateTransfer({ amount, from, to, mnemonic: null })
      → chain RPC call for gas/fee estimation
   d. Compute totalDebit = amount + platformFee + networkFee
9. Check availableBalance >= totalDebit
10. Build preview response with mapTransactionPreview()
Returns: { amount, networkFee, platformFee, totalDebit, recipientGets, canSubmit, explorerUrl }
```

### Flow 6: Send Transaction

```
POST /api/v1/transaction/send { walletId, destinationAddress, amount, executionParams }

1. All same validation as preview
2. getWalletOrFail(userId, walletId, includeRecoveryPhrase: true)
   → loads wallet WITH encryptedRecoveryPhrase
3. seedVault.decryptSeed(wallet.encryptedRecoveryPhrase) → plaintext mnemonic
4. resolveInternalTransferRecipient() → check platform internal vs external
5. shouldUseLocalInternalSettlement() →
   - If local_internal settlement: internalTransferService handles (DB only, no blockchain)
   - If external/onchain: continue to blockchain submit
6. feeService.quoteTransfer() with real mnemonic (for accurate fee estimation)
7. context.adapter.transaction.transferFunds({
     fromAddress, toAddress, amount, mnemonic, executionParams, ...
   }) → BLOCKCHAIN TX SUBMISSION
8. Receive { txHash, succeeded, validated, chainStatus }
9. Transaction.create({ userId, walletId, fromAddress, toAddress, amount, txHash, status, ... })
10. consistencyService.upsertWithdrawalFromTransaction() → sync to withdrawals collection
11. Socket.IO: emitTransactionNew(transaction)
12. notificationService.createAndEmitNotification() → in-app notification
13. Return transaction record

Mnemonic lifecycle: Decrypted in memory for signing, never stored post-signing
```

### Flow 7: Deposit Detection (Background Job)

```
depositWatcher.job.js runs every 30 seconds:

1. withJobLock("depositWatcher") → skip if already running
2. ensureDepositIndexes() → self-healing index migration on startup
3. Wallet.find(withRuntimeChainNetworkFilter({})) → all wallets
4. Process in batches of 10 with 1s rate-limit delay between batches
5. For each wallet:
   a. context.adapter.deposit.watchDeposits({ network, address, limit: 50 })
      → chain-specific: queries blockchain for incoming tx to this address
   b. For each returned entry:
      i. extractTxHash(entry)
      ii. context.adapter.deposit.matchDepositToWallet(entry, network)
          → verify entry belongs to this wallet (address/destinationTag match)
      iii. upsertDepositRecord() → Deposit.findOne + updateOne/create
      iv. upsertDepositTransaction() → Transaction.findOne + updateOne/create
           - isSystemManaged: true for deposit-watcher-created transactions
      v. Link Deposit.transactionId = Transaction._id
      vi. If new deposit: notificationService → "Payment received" notification
      vii. socket.emitTransactionNew(transaction)
   c. For chains in HISTORY_DEPOSIT_FALLBACK_CHAINS (ETH, EVM, TRON):
      also call transactionService.syncWalletTransactions() for extra reconciliation
```

### Flow 8: Withdrawal Execution

```
POST /api/v1/withdrawal { walletId, destinationAddress, amount, executionParams }

1. Internal flow: same as transaction/send but creates a Withdrawal record
   - withdrawalService.request() or processor handles
2. Direct path: Delegates to transactionService.send() which:
   a. Decrypts mnemonic
   b. Submits to blockchain
   c. Creates Transaction record
   d. Calls consistencyService.upsertWithdrawalFromTransaction()

Background: withdrawalStatus.job.js polls pending withdrawals every 60s for confirmation
```

### Flow 9: QR Generation

```
GET /api/v1/wallet/:walletId/receive/qr [?amount=&asset=]

1. verifyToken
2. walletService.generateReceiveQr(userId, input)
3. getReceivePayload() → full receive data including qr payload object
4. assertChainFeature(chain, network, "qr")
5. chainContext.adapter.qr.buildQrPayload({ address, amount, executionParams, ... })
   → chain-specific URI format (e.g., "bitcoin:address?amount=0.001")
6. qrService.generateWalletQr({ payload: qr })
   → qrcode.toDataURL() → base64 PNG
7. Returns: { address, qrCode (base64), qrValue (URI string), ... }
```

### Flow 10: Transaction History Sync

```
POST /api/v1/transaction/wallet/:walletId/sync

1. verifyToken
2. transactionService.syncWalletTransactions(userId, walletId, options)
3. getWalletOrFail(userId, walletId)
4. shouldSkipRecentHistorySync → check cooldown
5. withHistorySyncDedup → prevent concurrent syncs
6. context.adapter.transaction.getTransactionHistory({ network, address, limit })
   → chain RPC call for full history
7. For each returned transaction:
   a. findExistingHistoryTransaction() → Phase 1: exact txHash match
      → Phase 2: semantic reconciliation (direction + amount + toAddress + asset within time window)
   b. If found existing: merge/update status
   c. If not found: Transaction.create()
   d. consistencyService.upsertDepositFromTransaction() for incoming EVM/TRON txs
8. Mark wallet.metadata.historySync.completedAt
9. Return sync stats
```

---

## 10. Wallet System Deep Dive

### Architecture
The wallet system is **custodial**: private keys and mnemonics are stored server-side, encrypted.

### Sigining Policy
Field `signingPolicy` on User model:
- `system_custody`: Server holds encrypted mnemonic, signs transactions server-side
- `external_custody`: Conceptual flag; actual external custody not implemented (inferred)

### Wallet Creation Flow Detail
1. User calls `POST /wallet/create/init` — backend generates mnemonic (BIP39, 15+ words)
2. Mnemonic encrypted with AES-256-GCM using `ENCRYPTION_KEY`
3. Stored in `WalletCreationSession` with TTL
4. Mnemonic displayed to user — **THIS IS THE ONLY TIME IT'S VISIBLE**
5. User confirms by re-entering mnemonic via `POST /wallet/create/confirm`
6. Backend validates match, provisions wallet(s) across chains
7. Each wallet gets encrypted mnemonic stored in `Wallet.encryptedRecoveryPhrase`

### Secret Handling
```
Mnemonic (plaintext)
  → seedVault.encryptSeed(mnemonic)
    → AES-256-GCM with ENCRYPTION_KEY
    → { algorithm: "aes-256-gcm", cipherText, iv, authTag, keyVersion }
  → Stored in Wallet.encryptedRecoveryPhrase (fields are select: false by default)

At transaction time:
  getWalletOrFail(userId, walletId, includeRecoveryPhrase: true)
    → explicit .select("+encryptedRecoveryPhrase.*")
  seedVault.decryptSeed(encryptedRecoveryPhrase)
    → AES-256-GCM decrypt
  mnemonic used for signing
  mnemonic discarded from memory
```

### What Is Stored
- ✅ Encrypted mnemonic (in Wallet document, select: false fields)
- ✅ Public key and address
- ✅ Wallet metadata (balance cache, provisioning state, routing params)
- ❌ Private key (never stored; derived from mnemonic when needed)
- ❌ Plaintext mnemonic (never persisted after encryption)

### Address Generation
- Each chain adapter implements `wallet.generateWalletFromMnemonic(mnemonic, network)`
- Uses chain-specific HD derivation paths (BIP44 standard where applicable)
- Returns `{ address, publicKey, derivationPath, metadata }`

### HBAR Special Case
- HBAR accounts require on-network creation (Account ID ≠ public key)
- If operator keys configured (`HBAR_OPERATOR_*`), can auto-create on-chain
- If no operator: wallet gets a pending EVM address (0x format) stored; canonical 0.0.XXXXXX assigned after first transaction or manual activation

### Multi-Wallet Provisioning
- When creating/importing, multiple "targets" (chain+network pairs) can be specified
- `provisioningService.provisionSupportedWalletsForUser()` processes all targets
- Ordered: primary target first, then by priority, then alphabetical
- Concurrency controlled by `PROVISIONING_CONCURRENCY_LIMIT` (from config/operations.js)

---

## 11. Chain Adapter Architecture

### Pattern
Each chain adapter is a frozen object with these sections:

```javascript
{
  metadata: { code, label, capabilities, ... },
  client:   { getClient(network), ... },
  amount:   { toBaseUnits, fromBaseUnits, normalizeDisplayAmount },
  wallet:   { generateWalletFromMnemonic, validateAddress, resolveAddressFromSecret,
               assignManagedReceiveExecutionParams, resolveManagedReceiveExecutionParams,
               resolveReceiveAddress, findWalletByManagedExecutionParam },
  balance:  { fetchBalance },
  transaction: { estimateTransfer, transferFunds, getTransactionHistory,
                  normalizeExecutionParams, assertPreviewTransferAllowed },
  deposit:  { watchDeposits, matchDepositToWallet, registerWatchAddress },
  withdrawal: { ... },
  qr:       { buildQrPayload },
  mapper:   { mapTransaction }
}
```

### Registry
`chainAdapters/registry.js`:
- Singleton `Map<chainCode, adapter>`
- `registerAdapter(adapter)` — validates against contract, prevents duplicates
- `getAdapter(chain)` — retrieves by code; throws if not found
- `getAdapterOrNull(chain)` — safe retrieve
- `hasAdapter(chain)` — check existence

### Manifest
`chainAdapters/manifest.js` — list of 15 `require()` calls. Only adapters here are registered:
```
xrp, solana, bnb, avax, polygon, eth, arbitrum, btc, ada, ltc, sui, aptos, ton, hbar, tron
```
Note: `template/` folder exists but is NOT in the manifest (it's a development stub).

### Factory
`chainAdapters/factory.js` → `createChainAdapter(code, sections)`:
- Merges metadata, assigns default capabilities
- Returns frozen adapter object

### Contract (`contract.js`)
Validates adapter at registration time:
- Checks required sections and methods exist
- Prevents runtime failures from incomplete adapters

### Runtime Chain Resolution
`services/chainRuntime.service.js` + `services/runtimeState.js`:
- At startup, reads chain configs + env vars
- Determines which chains are "active" vs "disabled" (missing env vars)
- `withRuntimeChainNetworkFilter(query)` — DB filter that includes only active chain/network pairs
- Used in balance syncs, deposit watching, history queries

---

## 12. Chain-by-Chain Documentation

### XRP (xrp)
- **Family:** xrp | **Decimals:** 6 | **Base unit:** drop
- **Networks:** mainnet, testnet
- **SDK:** `xrpl` npm package
- **RPC:** WebSocket (`XRPL_MAINNET_URL` / `XRPL_TESTNET_URL`)
- **Address:** Classic addresses (rXXX format)
- **Wallet:** BIP39 mnemonic → BIP44 derived keypair → XRP address
- **Special:** Supports `destinationTag` — critical for routing payments (shared address pools)
- **Explorer:** https://livenet.xrpl.org, https://testnet.xrpl.org
- **Balance:** `account_info` RPC call; drops converted to XRP
- **History:** `account_tx` RPC
- **Deposit:** watchDeposits queries account_tx; matchDepositToWallet checks destinationTag for routing
- **QR:** `xrpl:address?dt=TAG&amount=AMOUNT` format
- **autoProvision:** Yes

### Solana (solana)
- **Family:** solana | **Decimals:** 9 | **Base unit:** lamport
- **Networks:** mainnet, testnet
- **SDK:** `@solana/web3.js`
- **RPC:** HTTP/HTTPS (`SOLANA_MAINNET_URL` / `SOLANA_TESTNET_URL`)
- **Address:** Base58 encoded 32-byte Ed25519 pubkey
- **Wallet:** BIP39 mnemonic → ed25519-hd-key derivation (m/44'/501'/0'/0')
- **Balance:** `getBalance()` + `getTokenAccountsByOwner()` for SPL tokens
- **Deposit:** Account history query via RPC
- **QR:** `solana:address?amount=X`
- **Explorer:** https://explorer.solana.com/tx/HASH (mainnet) or `?cluster=testnet`
- **autoProvision:** Yes

### EVM Chains (BNB, AVAX, Polygon, ETH, Arbitrum)
- **Family:** evm | **Decimals:** 18 | **Base unit:** wei
- **SDK:** `ethers.js 6.x`
- **Address:** 0x Ethereum format (checksummed)
- **Wallet:** BIP44 m/44'/60'/0'/0/0 derivation from mnemonic
- **Networks:** mainnet only (all 5 EVM chains)
- **Shared EVM adapter code** in `chainAdapters/common/`
- **Balance:** `eth_getBalance` + ERC20 `balanceOf()` for tokens
- **Send:** `eth_sendRawTransaction`
- **Fee:** `eth_estimateGas` + `eth_gasPrice`/EIP1559
- **History:** Explorer API (Etherscan-compatible) OR `eth_getLogs`
- **Token support:** ERC20 via `config/tokens.js` registry
- **QR:** `ethereum:address` or EIP681 format
- **Explorers:**
  - BNB: BSCScan
  - AVAX: Snowtrace
  - Polygon: PolygonScan
  - ETH: Etherscan
  - Arbitrum: Arbiscan
- **internalTransfer:** Disabled for ETH/Polygon/Arbitrum/AVAX (partially from chain config)
- **ETH has fallback RPC support** (`ETH_RPC_HTTP_FALLBACKS`)

### Bitcoin (btc)
- **Family:** bitcoin | **Decimals:** 8 | **Base unit:** satoshi
- **Networks:** mainnet, testnet
- **SDK:** `bitcoinjs-lib`, `ecpair`, `tiny-secp256k1`
- **RPC:** Blockstream API (`BTC_MAINNET_API_URL`, `BTC_TESTNET_API_URL`)
- **Address:** SegWit native (bech32 p2wpkh), P2SH, Legacy P2PKH supported
- **Wallet:** BIP84 / BIP44 HD derivation from mnemonic
- **UTXO model:** Multiple addresses per wallet (receive + change)
- **Managed addresses:** Stored in `walletaddresses` collection
- **Deposit:** Blockstream API to scan UTXOs for all managed addresses
- **Withdraw:** PSBT (Partially Signed Bitcoin Transaction) creation
- **internalTransfer:** Disabled (UTXO complexity)

### Cardano (ada)
- **Family:** cardano | **Decimals:** 6 | **Base unit:** lovelace
- **Networks:** mainnet, preprod
- **SDK:** `@emurgo/cardano-serialization-lib-nodejs`
- **RPC:** Blockfrost-compatible API `ADA_MAINNET_API_URL` + `ADA_MAINNET_PROJECT_ID`
- **Address:** Shelley-era bech32 addresses (addr1…)
- **Wallet:** BIP39+BIP32 derivation, staking key derivation
- **Special:** ADA uses account discovery on import (`ADA_INITIAL_IMPORT_DISCOVERY_OPTIONS`). Deferred initially for performance.
- **UTXO model:** Similar to BTC but extended
- **Deposit:** Blockfrost transaction history query

### Litecoin (ltc)
- **Family:** btc | **Decimals:** 8 | **Base unit:** litoshi
- **Networks:** mainnet only
- **Similar to BTC** using UTXO architecture and `bitcoinjs-lib`
- **API:** `LTC_MAINNET_API_URL`
- **Explorer:** litecoinspace.org


### Aptos (aptos)
- **Family:** aptos | **Decimals:** 8 | **Base unit:** octa
- **Networks:** mainnet, testnet, devnet (3 networks supported!)
- **SDK:** `@aptos-labs/ts-sdk`
- **RPC:** `APTOS_MAINNET_URL` / `APTOS_TESTNET_URL` / `APTOS_DEVNET_URL`
- **Address:** 0x hex format (32-byte address)
- **Wallet:** BIP39 mnemonic → Ed25519
- **Special:** `autoProvisionImport: true` (wallet address = public key, no separate creation needed)
- **Explorer:** explorer.aptoslabs.com (configurable base URLs)
- **internalTransfer:** Enabled

### TON (ton)
- **Family:** ton | **Decimals:** 9 | **Base unit:** nanoton
- **Networks:** mainnet only
- **SDK:** `@ton/ton`, `@ton/core`, `@ton/crypto`
- **RPC:** `TON_MAINNET_RPC_URL`, optional `TON_MAINNET_API_KEY`
- **Address:** UQ/EQ format (user-friendly bounceable/non-bounceable)
- **Explorer:** tonviewer.com
- **internalTransfer:** Disabled

### Hedera/HBAR (hbar)
- **Family:** hedera | **Decimals:** 8 | **Base unit:** tinybar
- **Networks:** mainnet, testnet
- **SDK:** `@hashgraph/sdk`
- **API:** Mirror node (`HBAR_MAINNET_MIRROR_API_URL`, `HBAR_TESTNET_MIRROR_API_URL`)
- **Address:** 0.0.XXXXXX account ID format (canonical) OR 0x EVM address (alias)
- **Wallet:** BIP39 mnemonic → HBAR ED25519 key pair
- **Special provisioning:**
  - `autoProvision: false` — HBAR accounts must be created on-chain
  - If operator keys set: auto-creates account with initial balance (`HBAR_ACCOUNT_CREATE_INITIAL_BALANCE`)
  - If no operator: stores EVM-compatible alias address in "pending" status
  - `autoProvisionImport: true` — import resolves existing account from key
- **Memo support:** `addressExtras.memo = true`
- **Explorer:** hashscan.io

### TRON (tron)
- **Family:** tron | **Decimals:** 6 | **Base unit:** sun
- **Networks:** mainnet, testnet (Nile testnet)
- **SDK:** `tronweb`
- **RPC:** `TRON_MAINNET_URL` (HTTP), supports fallbacks (`TRON_MAINNET_FALLBACKS`)
- **Address:** Base58Check T-prefixed addresses
- **Wallet:** BIP39 → secp256k1 derivation (same curve as ETH)
- **Token support:** TRC20 tokens via token registry
- **Explorer:** tronscan.org
- **Webhook support:** `/api/v1/webhook/tron` for event-driven updates
- **internalTransfer:** Disabled

---

## 13. Balance System

### Balance Fetch Priority

```
Request: GET /api/v1/balance/:walletId

1. shouldUsePersistedBalanceRead(wallet)?
   - No if: HBAR or Aptos (always live)
   - No if: force=true
   - Yes if: wallet.metadata.balance.lastSyncedAt exists and recent
   → Return: buildCachedWalletBalance() from wallet metadata (no RPC call)
   → source: "cached_recent"

2. shouldSkipRecentBalanceSync(wallet)?
   - Yes if: lastSyncedAt < BALANCE_SYNC_COOLDOWN_MS ago
   → Return: buildPersistedWalletBalance() (reads from DB wallet metadata)
   → source: "persisted_wallet"

3. withBalanceSyncDedup(userId, walletId, callback)
   - Prevents concurrent syncs for same wallet
   
4. context.adapter.balance.fetchBalance({ address, network })
   → LIVE BLOCKCHAIN RPC CALL
   → Returns: { baseUnitBalance, availableBaseUnits, exists, confirmed, tokenBalances }

5. resolveInternalBalanceDeltaBaseUnits(wallet)
   → Reads LedgerEntry collection (credits - debits)
   → Uses cached summary in wallet.metadata.balance.internalDeltaSummary if fresh
   → Otherwise: recomputes from LedgerEntry cursor

6. Persist result to wallet.metadata.balance.*
7. Return formatted balance
```

### Internal Balance Delta
The balance system maintains a ledger of platform-internal transactions (internal transfers). This `internalDeltaBaseUnits` adjusts the displayed balance to reflect pending platform transfers that aren't yet on-chain.

### Balance List (All Wallets)
- Uses in-memory `balanceListCache` with TTL (`BALANCE_LIST_CACHE_TTL_MS`)
- Cache keyed by userId + wallet fingerprint (wallet updatedAt timestamps)
- Portfolio snapshot persisted to `portfoliosnapshots` collection (`PORTFOLIO_SNAPSHOT_TTL_MS`)

### Known Balance Risks
- ⚠️ HBAR and Aptos always do live reads — no caching; potential RPC latency
- ⚠️ Balance cache is in-memory, lost on restart
- ⚠️ Portfolio snapshot can be stale; TTL configurable but defaults unknown without `.env`
- ⚠️ `internalDeltaSummary` marked stale must be recomputed from full LedgerEntry scan (cursor-based, O(n))

---

## 14. Deposit System

### Detection Architecture
Two parallel mechanisms:

**1. Background Deposit Watcher (`depositWatcher.job.js`)**
- Runs on interval (default: 30s)
- Queries ALL wallets for incoming transactions
- Chain adapter `watchDeposits()` is chain-specific (REST or RPC)
- Creates `Deposit` record + `Transaction` record
- Links them: `Deposit.transactionId = Transaction._id`
- Emits Socket.IO `transaction:new` or `transaction:update` events

**2. Webhook-Based (for TRON and BTC)**
- `POST /api/v1/webhook/tron` or `/btc`
- Receives `{ txHash, amount, address, block_time, ... }`
- Looks up existing outgoing tx by txHash → if found: confirm withdrawal
- If not found: treat as deposit

**3. History Sync Fallback (EVM/TRON chains)**
- `consistencyService.shouldBackfillDepositFromHistory()` returns true for ETH/EVM/TRON
- `transactionService.syncWalletTransactions()` called within deposit watcher
- Creates deposits from transaction history sync for EVM chains

### Deposit Deduplication
- Primary unique index: `{ walletId, txHash, vout }` — prevents duplicate deposits per UTXO output
- Secondary: `{ txHash, chain }` unique sparse — across chains (inferred)
- `upsertDepositRecord()` uses findOne+updateOne pattern (upsert)

### Transaction Reconciliation (Critical Logic)
When a deposit arrives via history sync or watcher and a matching pending transaction already exists (e.g., created at submission time):

```
Phase 1: Exact txHash match (fastest, most reliable)
Phase 2: Semantic reconciliation:
  - Match by: walletId + status:pending + direction + asset + amountBaseUnits
  - Bounded by: time window (HISTORY_PENDING_RECONCILIATION_WINDOW_MS)
  - Plus absolute stale cutoff (PENDING_STALE_THRESHOLD_MS)
  - Outgoing: does NOT match fromAddress (UTXO change addresses differ)
  - Incoming: DOES match fromAddress (precise discrimination)
```

### Deposit Risks
- ⚠️ **No webhook authentication** on `/webhook/tron` and `/webhook/btc` — anyone can send fake deposit events
- ⚠️ Duplicate processing guardeded only by DB unique index — index collision = silently ignored (ok for idempotency, but error handling is `11000` code catch)
- ⚠️ Watcher processes ALL wallets in sequence — at scale, 30s interval may not be enough
- ✅ `isSystemManaged: true` flags watcher-created transactions (prevents user from seeing them as their own initiations)

---

## 15. Withdrawal System

### Flow
1. User calls `POST /api/v1/withdrawal` or `POST /api/v1/transaction/send`
2. Transaction service decrypts mnemonic, submits to blockchain
3. `Transaction` record created with status: `pending`
4. `consistencyService.upsertWithdrawalFromTransaction()` creates/updates `Withdrawal` record
5. Background: `withdrawalStatus.job.js` polls pending withdrawals every 60s

### Withdrawal Status Derivation
From `consistencyService.deriveWithdrawalStatus()`:
```
transaction.status === "failed"  → "failed"
transaction.status === "success" → "completed"
transaction.txHash exists        → "processing"
default                          → "created"
```

### Security Considerations
- ✅ Mnemonic decrypted only in-process at signing time
- ✅ Reference field (`tx:${transactionId}` or `txhash:hash`) used for idempotency in upsert
- ⚠️ No separate withdrawal approval flow — any authenticated user can withdraw all their funds immediately
- ⚠️ No daily withdrawal limits or velocity checks implemented
- ⚠️ `withdrawalStatus.job.js` polling can miss brief confirmation windows between polls

---

## 16. Transaction System

### Transaction Service Architecture
`Modules/transaction/service.js` is the central class (`TransactionService`). Key methods:

| Method | Purpose |
|--------|---------|
| `preview(userId, input)` | Generate fee quote + validation without submitting |
| `send(userId, input)` | Execute transaction on blockchain |
| `validateDestination(userId, input)` | Check address validity + internal/external classification |
| `listTransactions(userId, query)` | Paginated transaction history from DB |
| `getTransactionDetails(userId, transactionId)` | Single transaction with refresh logic |
| `syncWalletTransactions(userId, walletId, options)` | Sync history from blockchain |
| `handleDeposit(input)` | Process deposit event (webhook/watcher) |
| `handleWithdrawal(input)` | Process withdrawal confirmation event |

### Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Transaction created/submitted, awaiting confirmation |
| `success` | Transaction confirmed on-chain |
| `failed` | Transaction failed or rejected |

### Chain Status (`chainStatus` field)
Normalized chain-specific status, e.g.:
- `"submitted"`, `"pending"`, `"confirmed"`, `"not_submitted"`, `"deposit_pending"`, `"deposit_confirmed"`

### System Status (`systemStatus` field)
Platform-level status, e.g.:
- `"created"`, `"deposit_pending"`, `"deposit_confirmed"`

### Transaction Types
- `transactionType: "external"` — on-chain transaction with real blockchain tx
- `transactionType: "internal"` — platform-internal transfer (DB only, no blockchain)
- `direction: "outgoing"` — sent by this wallet
- `direction: "incoming"` — received by this wallet

### Fee Calculation
```
1. getFeePolicy(context, transactionType)
   → Merges default policy + chain-specific policy
2. calculatePlatformFeeAmount()
   → Fixed: absolute amount
   → Percentage: (amount * rate / 100)
3. estimateNetworkFee()
   → adapter.transaction.estimateTransfer()
   → Chain-specific: eth_estimateGas, getRecentBlockhash+fee, etc.
4. totalDebitBaseUnits = amountBaseUnits + platformFeeBaseUnits + networkFeeBaseUnits
   (for tokens: networkFee is separate asset, not added to token totalDebit)
5. compositeDebit: for tokens, shows breakdown of token amount + native fee
```

### Internal Transfer Settlement
Configurable via `PLATFORM_TRANSFER_SETTLEMENT_MODE`:
- `"metadata_only"`: No actual transaction, only DB metadata updated
- `"onchain"`: Submit real blockchain transaction even for same-platform sends
- `"local_internal"`: DB-only record, no blockchain call

Recipient classification:
- `"self"`: Same wallet, same user
- `"same_user"`: Different wallet, same user
- `"platform_user"`: Different user, but both on this platform
- `"external"`: Unknown destination (not in platform DB)

### Explorer URL Generation
`common/utils/explorer.js` + `buildTransactionExplorerUrl(chain, network, txHash)`:
- Reads explorer config from `config/chains.js` per chain/network
- Appends `txHash` or `address` to base URL
- Returns `null` if chain has `explorer.supported: false`

### Response Mapping (`response.mapper.js`)
All transaction responses go through `mapTransactionCore()`:
- Normalizes direction, status, timestamps
- Builds explorer URLs
- Normalizes execution params
- Adds `normalizedDirection` (internal = "internal" even if stored as outgoing)

---

## 17. Validation Layer

### Custom Validator (`helpers/validators.js`)
Rule engine that supports rule strings like:
- `"required"` — field must exist and be non-empty
- `"string"` — must be string
- `"number"` — must be number
- `"mongoid"` — must be valid MongoDB ObjectId
- `"boolean"` — must be boolean
- `"email"` — basic email format
- `"array"` — must be array
- `"optional"` — field is optional

### `validateRequest(rules)` Middleware Behavior
1. Resolves rules (can be function or object)
2. **Whitelist strips**: removes ALL keys from body/params/query not in rules
3. Merges body + params + query into one object for validation
4. Runs validator rules
5. Throws AppError.validation on failure

### Per-Module Validators

**Auth:**
- `createSessionRules`: Optional deviceId, platform, appVersion, biometricCapable, metadata
- `refreshRules`: Required refreshToken
- `logoutRules`: Optional revokeAll
- `revokeSessionRules`: Required sessionId

**Wallet:**
- `createWalletRules`: Optional chain, network, label, accountId, targets
- `confirmWalletRules`: Required sessionId, mnemonic; optional chain, network, label, accountId
- `importWalletRules`: Required mnemonic; optional chain, network, label, targets, accountId
- `listWalletRules`: Optional page, limit, search, accountId, chain, network, includeHidden, includeArchived
- `receivePayloadRules`: Required walletId; optional amount, asset, executionParams, qrParams

**Transaction:**
- `previewRules`: Required walletId, destinationAddress, amount; optional asset, executionParams, sendMax
- `sendRules`: Same as preview
- `validateDestinationRules`: Required walletId, destinationAddress; optional executionParams
- `transactionListRules`: Optional page, limit, status, chain, direction, search

**Superadmin:**
- List rules: page, limit, search, status, chain, etc. per collection

### Missing Validations / Weak Spots
- ⚠️ Mnemonic format: only basic word count (12-24) and character set (`[a-zA-Z\s]+`) checked — no BIP39 wordlist validation until `mnemonicService.validateMnemonic()` is called
- ⚠️ `destinationAddress` format: delegated to chain adapter; if adapter has a weak `validateAddress`, invalid addresses may pass through to preview
- ⚠️ Webhook endpoint: no body validation at all beyond `!txHash || !amount || !address`
- ⚠️ `amount` is a string throughout — no max/min amount validation at the API layer
- ⚠️ Execution params are passed through with minimal sanitization

---

## 18. Security Review

### What Is Secure ✅

| Area | Assessment |
|------|-----------|
| Mnemonic storage | AES-256-GCM encryption; select:false for cipher fields; never logged |
| Password hashing | bcrypt with configurable rounds (default: 10) |
| CORS | Strict allowlist; no wildcard; validated at startup |
| CSP | Strict `default-src 'none'` — excellent for API |
| Token type checking | Prevents refresh tokens being used as access tokens |
| Superadmin separation | Separate JWT secret, token type, session collection |
| Rate limiting | Applied per-use-case (auth, tx, wallet) |
| Input whitelist | `validateRequest` strips all unknown fields |
| Session revocation | Sessions tracked in DB; can be revoked individually or all |
| Error info leakage | Production mode: 5xx returns generic message |

### Moderately Secure ⚠️

| Area | Issue |
|------|-------|
| Rate limiting | In-memory only; not distributed; easy to work around with multiple IPs |
| Idempotency | In-memory; lost on restart; not cross-instance |
| SUPERADMIN_JWT_SECRET | Falls back to JWT_SECRET if not set; should be mandatory |
| Session inactivity | `SESSION_INACTIVITY_TIMEOUT_MS` config exists but implementation unclear |
| Amount validation | Strings used throughout; no server-side max amount cap |

### Weak / Missing 🔴

| Area | Severity | Detail |
|------|---------|--------|
| **Webhook auth** | CRITICAL | `/webhook/tron` and `/webhook/btc` have NO authentication; anyone can forge deposit/withdrawal confirmations |
| **Anonymous users** | HIGH | Any client can create a session; no identity binding; no CAPTCHA |
| **No withdrawal limits** | HIGH | No daily limits, velocity checks, or cooling-off periods |
| **In-memory rate limiter** | HIGH | Can be bypassed with distributed requests; useless in multi-server deployment |
| **Socket.IO CORS** | MEDIUM | Socket.IO initialized with `origin: "*"` — bypasses CORS restrictions |
| **Replay attacks** | MEDIUM | If JWT_SECRET is compromised, old tokens may still work if session not expired |
| **Mnemonic in preview** | MEDIUM | Fee preview requires loading mnemonic for some chains; mnemonic decrypted even for read operations |
| **No HSTS** | MEDIUM | Server doesn't set Strict-Transport-Security |
| **Missing audit trail** | MEDIUM | Withdrawals have no separate approval audit; only transaction log |
| **System wallet secret in env** | MEDIUM | SYSTEM_WALLET_SECRET in plaintext env file; compromise = fee collection wallet theft |

---

## 19. Risk Register / Weak Areas

### 🔴 Critical

| # | Title | Area | Impact | Fix |
|---|-------|------|--------|-----|
| C1 | Unauthenticated Webhook Endpoints | `/webhook/tron`, `/webhook/btc` | Attacker can forge deposit confirmations → credit balances falsely; or confirm withdrawals they don't control | Add webhook signature verification (HMAC secret, IP allowlist, or API key header) |
| C2 | Socket.IO CORS Bypass | `lib/socket.js` | Real-time events visible to any origin; potential data exposure | Set Socket.IO cors origin to same allowlist as HTTP CORS |

### 🟠 High

| # | Title | Area | Impact | Fix |
|---|-------|------|--------|-----|
| H1 | No Withdrawal Rate Limiting (amount) | Withdrawal | User can drain wallet instantly; no velocity protection | Add per-user daily/hourly withdrawal amount limits |
| H2 | In-Memory Rate Limiter | middleware/rateLimiter.js | Ineffective in production multi-instance deployments; DDoS possible | Replace with Redis-backed rate limiting (e.g., rate-limiter-flexible) |
| H3 | SUPERADMIN_JWT_SECRET Falls Back to JWT_SECRET | config/security.js | If JWT_SECRET compromised, superadmin access also at risk | Make SUPERADMIN_JWT_SECRET required; fail startup if same as JWT_SECRET |
| H4 | Anonymous Session Creation | auth/service.js | Any bot can create millions of users; DB bloat; no accountability | Add CAPTCHA or device fingerprinting; add session creation limits per IP |
| H5 | Double-Credit Risk (Webhook + Watcher) | deposit system | Same deposit could be processed by watcher AND webhook if not properly de-duped | Ensure DB unique index covers webhook path; test idempotency under race conditions |

### 🟡 Medium

| # | Title | Area | Impact | Fix |
|---|-------|------|--------|-----|
| M1 | Mnemonic Decrypted for Preview | transaction/service.js | Some chain adapters need mnemonic even for fee estimation (estimateTransfer with mnemonic) | Separate fee estimation from signing; only decrypt for actual send |
| M2 | SYSTEM_WALLET_SECRET in .env | config/app.js | Secret compromise = fee wallet theft | Use secrets manager (AWS Secrets Manager, Vault) |
| M3 | No HSTS Header | securityHeaders.js | HTTPS not enforced by server; downgrade attacks possible | Add Strict-Transport-Security header |
| M4 | In-Memory Idempotency Cache | middleware/idempotency.js | Lost on restart; not distributed | Replace with Redis-backed store |
| M5 | Missing Max Amount Validation | transaction validators | No server-side cap; dependent on balance check only | Add configurable max transaction amount per chain |
| M6 | Webhook Body Minimal Validation | Modules/webhook/controller.js | Only checks txHash, amount, address — other fields unvalidated | Add strict schema validation and type checking |
| M7 | ADA Initial Discovery Deferred | provisioning.service.js | ADA wallets start in "pending_recovery"; balance/history may be wrong until sync | Trigger ADA discovery immediately on creation or document clearly |

### 🟢 Low

| # | Title | Area | Impact | Fix |
|---|-------|------|--------|-----|
| L1 | `autoIndex: false` in production | config/database.js | Index creation skipped; must be managed manually | Document index migration process; add migration scripts |
| L2 | No request body logging | auditLogger.js | Hard to debug production issues | Optionally log sanitized request bodies in dev mode |
| L3 | Hardcoded job intervals in two places | jobs/index.js + config/queue.js | Config drift; some jobs read from one, some from other | Consolidate to a single source of truth |
| L4 | `template/` adapter not in manifest | chainAdapters/manifest.js | Risk of accidental inclusion during development | Add lint check for manifest integrity |

---

## 20. Frontend-to-Backend Contract Summary

### Main Response Envelope
All API responses follow:
```json
{
  "success": true,
  "message": "...",
  "data": { ... },
  "requestId": "..."
}
```
Errors:
```json
{
  "success": false,
  "message": "...",
  "errorCode": "VALIDATION_ERROR",
  "errors": { "field": "message" },
  "requestId": "..."
}
```

### Key Fragile Contracts

1. **Auth tokens as `token` AND `accessToken`**: Both fields returned; frontend should use `accessToken` field for consistency but legacy code may use `token`

2. **Wallet response uses `walletId` not `id`**: The primary identifier field for wallets is `walletId` (= `_id`), not `id`

3. **Transaction amounts are strings**: All amount fields (`amount`, `networkFee`, `totalDebit`, etc.) are strings representing decimal numbers. Frontend must NOT convert to float directly.

4. **`baseUnits` fields**: Many amounts have both display (`"0.001"`) and base unit (`"100000"` satoshis) variants. Frontend should prefer display fields for showing users.

5. **Timestamps**: Multiple timestamp fields per transaction (`chainTimestamp`, `confirmedAt`, `createdAt`). The `displayTimestamp` field is the normalized "best" timestamp to show.

6. **`provisionedWallets` array**: After wallet creation/import, returns array of ALL provisioned wallets across chains, not just the requested one.

7. **Wallet `chain` field**: Lowercase chain codes (e.g., `"hbar"`, `"xrp"`, `"eth"`). Frontend should normalize for display using `chainLabel`.

8. **`executionParams`**: For XRP, contains `destinationTag`; for HBAR, `memo`. Frontend must handle per-chain param requirements.

9. **Balance `source` field**: `"live_read"`, `"cached_recent"`, `"persisted_wallet"` — indicates freshness of balance data.

10. **`isSystemManaged: true`** transactions: Internal system transactions (deposit-watcher-created). Frontends should typically hide these or show with different UI treatment.

### Inconsistent Patterns
- Some responses use `_id`, some use `id`, some use specific ID fields (`walletId`, `transactionId`)
- `Deposit` vs `Transaction` records both exist for the same on-chain event; frontend should consume `Transaction` for history display
- Withdrawal `status` is different vocabulary than Transaction `status` (completed/processing/created vs success/pending/failed)

---

## 21. Glossary

| Term | Definition |
|------|-----------|
| **Account** | Container for a set of wallets derived from a single mnemonic. One user can have multiple accounts. |
| **Adapter** | Chain-specific implementation of the common wallet/balance/transaction interface |
| **AES-256-GCM** | Symmetric encryption algorithm used to encrypt mnemonics at rest |
| **amountBaseUnits** | Amount expressed in the smallest denomination (satoshi, drop, wei, lamport, etc.) |
| **autoProvision** | Whether wallet creation on a chain is supported by the server |
| **BIP39** | Bitcoin Improvement Proposal defining mnemonic word lists (12-24 words) |
| **BIP44** | HD wallet derivation path standard (m/44'/coin_type'/account'/change/index) |
| **baseUnitName** | Name of the smallest denomination (satoshi, drop, wei, etc.) |
| **chainStatus** | Chain-level transaction status (submitted, pending, confirmed, etc.) |
| **compositDebit** | For token transfers: breakdown showing token amount + separate native gas fee |
| **consistencyService** | Service that synchronizes Transaction records into Deposit/Withdrawal collections |
| **DEFAULT_CHAIN** | The chain assigned to new users; determines primary wallet chain |
| **depositWatcher** | Background job that polls all wallets for incoming transactions |
| **destinationTag** | XRP-specific routing integer identifying recipient within shared address |
| **direction** | incoming (received) or outgoing (sent) |
| **encryptedRecoveryPhrase** | AES-256-GCM encrypted mnemonic stored in wallet document |
| **executionParams** | Chain-specific extra parameters (destinationTag, memo, etc.) |
| **historySync** | Process of fetching historical transactions from blockchain into DB |
| **internalDeltaBaseUnits** | Net balance adjustment from platform-internal transfers (credits - debits) |
| **isSystemManaged** | Flag on Transaction: true = created by server jobs, not user-initiated |
| **ledgerEntry** | Platform-internal double-entry bookkeeping record for balance tracking |
| **mnemonic** | 12-24 BIP39 words that deterministically generate all private keys |
| **network** | Blockchain network variant (mainnet, testnet, devnet, preprod) |
| **platformFee** | Application-layer fee charged on top of network fee |
| **pending_recovery** | ADA/HBAR wallet state: provisioned but history/address discovery not yet complete |
| **portfolio snapshot** | Persisted summary of all wallet balances for a user |
| **provisioning** | Process of deriving + saving wallet addresses for a given mnemonic |
| **recipientGets** | Amount the recipient actually receives (amount - platformFee) |
| **reference** | Unique withdrawal idempotency key (format: `tx:${transactionId}`) |
| **runtimeState** | In-memory server state (started, chains active, jobs status) |
| **select: false** | Mongoose field option: excludes from default queries; must be explicitly requested |
| **seedVault** | Module responsible for encrypting/decrypting mnemonics |
| **seedFingerprint** | HMAC of mnemonic used as unique identifier (prevents importing same seed twice) |
| **settlement mode** | How platform-internal transfers are settled: metadata_only, onchain, local_internal |
| **sparse index** | MongoDB index that only indexes documents where the field exists |
| **superadmin** | Administrative user in separate collection; login via email+password |
| **systemStatus** | Platform-level transaction status (created, deposit_pending, deposit_confirmed) |
| **TRON / TRC20** | TRON blockchain and its token standard (similar to ERC20) |
| **UTXO** | Unspent Transaction Output model (BTC, LTC, ADA) — multiple inputs/outputs per tx |
| **wallet creation session** | Temporary document holding encrypted mnemonic during 2-step wallet creation |
| **walletState** | Metadata flags: isPrimary, isDefaultForChain, hidden, archived |
| **withRuntimeChainNetworkFilter** | Mongoose query filter to exclude disabled chains |

---

## 22. Final System Summary

### How The Server Behaves Overall
This is a well-structured, custodial multi-chain cryptocurrency wallet backend built with Node.js and Express. The core architecture is clean — module-by-domain organization, chain adapter pattern, service/controller separation, and comprehensive chain support across 15 blockchains. The system handles the full lifecycle from anonymous user creation through wallet provisioning, transaction sending, deposit detection, and backend job processing.

### What Is Well Built ✅
- **Chain adapter pattern** is elegant: `registry.js` → `manifest.js` → `factory.js` → adapter object. New chains can be added as adapters without touching core logic.
- **Mnemonic encryption** is properly implemented: AES-256-GCM, select:false fields, explicit decryption only when needed for signing.
- **Transaction reconciliation** is sophisticated: dual-phase matching (exact txHash + semantic fallback) prevents duplicates.
- **Auth token system** is properly separated: user tokens vs superadmin tokens have different secrets, types, and session stores.
- **Env validation at startup** prevents misconfigured deployments.
- **Balance caching** with freshness control is thoughtful (cooldowns, dedup, portfolio snapshots).
- **Request whitelist** via `validateRequest` is a solid input protection pattern.
- **Graceful shutdown** is implemented (SIGTERM/SIGINT handlers, job stop, DB close).

### What Is Confusing 🤔
- **Deposit/Transaction duality**: Both `Deposit` and `Transaction` records exist for the same received payment. The relationship is `Deposit.transactionId → Transaction`, but frontend and admin UIs need to understand which to use where.
- **Multiple timestamp fields**: `chainTimestamp`, `confirmedAt`, `confirmed_at`, `block_time` — legacy naming causes confusion.
- **Balance delta ledger**: The `internalDeltaBaseUnits` / `LedgerEntry` system is powerful but complex. It adjusts the displayed balance but the triggering conditions (when entries are written vs read) are spread across multiple services.
- **Job enablement flags**: `JOBS_ENABLED` vs `QUEUE_ENABLED` vs per-job flags — two places define job config (`config/queue.js` and `jobs/index.js`).
- **ADA pending_recovery status**: Cardano wallets require deferred discovery, creating a temporarily inconsistent state that's hard to reason about.

### What Should Be Improved First 🔧

1. **Webhook authentication** (Critical) — Add HMAC signatures or API key verification immediately
2. **Distributed rate limiting** (High) — Redis-backed rate limiter for production scalability
3. **Socket.IO CORS** (High) — Restrict to same origin allowlist
4. **SUPERADMIN_JWT_SECRET mandatory** (High) — Fail startup if same as JWT_SECRET
5. **Withdrawal velocity limits** (High) — Daily/hourly per-user limits
6. **Idempotency persistence** (Medium) — Move from in-memory Map to Redis
7. **Mnemonic in fee estimation** (Medium) — Separate read-only estimation from signing operations
8. **Response ID consistency** (Low) — Standardize to always use `id` field in responses

### Areas Needing Refactoring / More Documentation 📋
1. **Balance system** — The three-layer caching (in-memory, wallet.metadata, portfolioSnapshot) with internal delta ledger needs architectural documentation
2. **Deposit reconciliation logic** — `findExistingHistoryTransaction()` is critical safety code; deserves unit tests + documentation
3. **ADA provisioning** — Deferred discovery flow is complex and should be unit tested
4. **HBAR activation flow** — The pending alias → canonical account ID upgrade path needs explicit documentation
5. **Job configuration** — Consolidate `config/queue.js` and `jobs/index.js` JOB_CONFIG into one source of truth
6. **Internal transfer settlement** — The three settlement modes and their edge cases need formal documentation with example flows

---

## Analysis Summary

| Metric | Count |
|--------|-------|
| **Files analyzed** | ~95+ source files |
| **API endpoints documented** | ~55 endpoints across all modules |
| **Chains documented** | 15 chains (XRP, SOL, BNB, AVAX, Polygon, ETH, Arbitrum, BTC, ADA, LTC, SUI, Aptos, TON, HBAR, TRON) |
| **Background jobs documented** | 8 jobs |
| **Middleware documented** | 10 middleware modules |
| **MongoDB models documented** | 16 collections |
| **Known risks filed** | 16 (2 Critical, 5 High, 7 Medium, 4 Low) |

### Top 10 Risks

| Rank | Risk | Severity |
|------|------|---------|
| 1 | Unauthenticated webhook endpoints (`/webhook/tron`, `/webhook/btc`) | 🔴 Critical |
| 2 | Socket.IO wildcard CORS | 🔴 Critical |
| 3 | No withdrawal velocity/amount limits | 🟠 High |
| 4 | In-memory rate limiter (useless in production multi-instance) | 🟠 High |
| 5 | SUPERADMIN_JWT_SECRET falls back to JWT_SECRET | 🟠 High |
| 6 | Anonymous session creation without anti-bot protection | 🟠 High |
| 7 | Double-credit risk via webhook + watcher race condition | 🟠 High |
| 8 | Mnemonic decrypted at preview time for some chains | 🟡 Medium |
| 9 | SYSTEM_WALLET_SECRET in plaintext env file | 🟡 Medium |
| 10 | No HSTS header on server | 🟡 Medium |
