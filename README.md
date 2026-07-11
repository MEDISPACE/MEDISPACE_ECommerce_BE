# MediSpace E-Commerce Backend

Backend API and realtime gateway for MediSpace, a digital pharmacy platform that connects e-commerce, prescription workflows, pharmacist consultation, AI assistance, search, recommendations, loyalty, coupons, community features, and video health events.

This repository is the main orchestration layer for the MediSpace system. It exposes REST APIs, Socket.IO chat, background jobs, integrations with Python AI services, MongoDB persistence, Redis caching, Typesense search, payment gateways, shipping providers, and LiveKit video infrastructure.

## Overview

```text
Frontend / Admin / Pharmacist
        |
        v
Express API + Socket.IO
        |
        +-- MongoDB: users, products, orders, prescriptions, chats, loyalty, community
        +-- Redis: cache, rate limiting, realtime support
        +-- Typesense: product/article search and RAG index
        +-- OCR Service: prescription image extraction
        +-- ML Service: product recommendation algorithms
        +-- Chat AI Service: Gemma-based AI assistant with RAG and guardrails
        +-- Payment: VNPay, PayOS
        +-- Shipping: GHN, GHTK, Ahamove, mock return carrier
        +-- LiveKit: video health events
```

## Main Features

- Authentication and user management: email/password, Google OAuth, JWT access/refresh tokens, email verification, password reset, roles, and profile data.
- Product catalog: categories, brands, products, media, product details, inventory, search indexing, and admin CRUD.
- Cart and checkout: cart lifecycle, checkout, orders, payment transactions, order status management, and order benefits.
- Payment integrations: VNPay and PayOS providers with return/callback handling.
- Shipping integrations: GHN, GHTK, Ahamove, shipping fee estimation, provider selection, and return pickup support.
- Prescription workflow: upload prescriptions, OCR scan proxy, pending verification queue, pharmacist verification, and prescription status tracking.
- Chat: customer-pharmacist conversations, AI chat proxy, image support, Socket.IO realtime messaging, read state, assignment, stale requeue, and feedback.
- AI Chat integration: proxies requests to Python Chat AI service, enriches history/context, rate-limits AI usage, and stores AI replies.
- Search: Typesense collections for products, articles, brands, categories, query suggestions, and optional embedding fields for hybrid search/RAG.
- Recommendation: backend facade for ML recommendation service with circuit breaker, policy filtering, fallback, attribution tokens, and metrics.
- Loyalty and coupons: configurable point earning/redemption, coupon redemption, campaigns, and indexes for safe accounting.
- Reviews and moderation: customer reviews, review AI scoring, community moderation, admin moderation workflows, reports, and appeals.
- Community: rooms, threads, replies, reactions, join requests, read state, reports, appeals, and admin management.
- Video events: community video event registration, event chat, LiveKit join token generation, participant diagnostics, and moderation controls.
- Notifications and reports: customer/admin notifications, dashboards, reports export, and scheduled maintenance jobs.

## Tech Stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js 20 |
| API | Express 5, TypeScript |
| Realtime | Socket.IO |
| Database | MongoDB |
| Cache | Redis / ioredis |
| Search | Typesense |
| Jobs | Agenda, node-cron, scheduler services |
| Payments | VNPay, PayOS |
| Shipping | GHN, GHTK, Ahamove |
| Media | AWS S3, local upload fallback |
| Video | LiveKit Server SDK |
| Testing | Vitest, Supertest, mongodb-memory-server |
| Deployment | Multi-stage Dockerfile, Docker Compose |

## Source Structure

```text
src/
├── index.ts                         # Express app, route registration, Socket.IO, scheduler startup
├── routes/                          # REST route definitions
├── controllers/                     # HTTP request handlers
├── services/                        # Business logic and integrations
├── sockets/                         # Socket.IO chat gateway
├── middlewares/                     # Auth, role checks, validators, rate limits, error handling
├── models/schemas/                  # MongoDB schema classes and domain objects
├── models/requests/                 # Request DTOs
├── utils/                           # JWT, S3, validation, handlers, moderation helpers
├── scripts/                         # Seed, migration, search sync, maintenance scripts
└── tests/                           # Unit/integration tests
```

## API Surface

| Base Path | Purpose |
| --- | --- |
| `/users` | Auth, user profile, OAuth, tokens, password/email flows |
| `/products`, `/categories`, `/brands` | Product catalog and taxonomy |
| `/cart`, `/orders`, `/payment` | Cart, checkout, order, payment lifecycle |
| `/prescriptions` | Prescription upload, scan, list, pharmacist verification |
| `/pharmacist` | Pharmacist dashboard, patients, prescriptions, orders, settings |
| `/chats` | Conversations, messages, AI chat, AI stream, feedback |
| `/articles`, `/health-categories` | HealthHub articles and categories |
| `/search` | Typesense-backed search and suggestions |
| `/recommendations` | Related, bought-together, trending, for-you, replenishment, metrics |
| `/coupons`, `/loyalty`, `/campaigns` | Promotion, coupon, and reward-point logic |
| `/community`, `/admin/community`, `/admin/moderation` | Community rooms, threads, moderation, reports, video events |
| `/reviews`, `/notifications`, `/returns`, `/shipping`, `/ghn`, `/medias` | Supporting commerce and operational flows |
| `/internal/flush-recommendation-cache` | Internal ML webhook to invalidate recommendation cache |

## Service Integrations

| Integration | Env / Service | Notes |
| --- | --- | --- |
| MongoDB | `DB_NAME`, `DB_*_COLLECTION`, Mongo connection credentials | Primary data store |
| Redis | `REDIS_URL` | Cache, AI rate limit, recommendation cache, Socket.IO support |
| Typesense | `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_API_KEY` | Search index and optional embedding-based hybrid search |
| OCR Service | `OCR_SERVICE_URL`, `PRESCRIPTION_OCR_MODE`, scan timeout/retry vars | Prescription image extraction proxy |
| ML Service | `ML_SERVICE_URL`, `ML_SERVICE_TOKEN` | Product recommendation service with circuit breaker/fallback |
| Chat AI Service | `CHAT_AI_URL`, `CHAT_AI_TIMEOUT_MS`, `CHAT_AI_IMAGE_TIMEOUT_MS` | Gemma-based AI assistant proxy |
| Self-hosted LLM | `CUSTOM_LLM_BASE_URL`, `CUSTOM_LLM_MODEL`, `CUSTOM_LLM_API_KEY` | Used by moderation or AI-related workers when configured |
| LiveKit | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL` | Video event rooms and join tokens |
| Payment | `VNP_*`, `PAYOS_*` | VNPay and PayOS payment providers |
| Shipping | `GHN_*`, `GHTK_*`, `AHAMOVE_*`, `RETURN_SHIPPING_PROVIDER` | Delivery and return logistics |
| AWS S3 | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` | Media upload storage |
| Email | `EMAIL_*`, `CLIENT_URL` | Verification, password reset, notifications |

Use `.env.docker.example` as a safe reference. Do not commit real `.env` secrets.

## Local Development

```bash
npm install
npm run dev
```

The API starts on `PORT`, commonly `http://localhost:8000`.

For a fuller local environment with Redis, Typesense, ML, OCR, and Chat AI services:

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

The dev compose file is designed for backend/Python infrastructure while the frontend can run locally from the FE repository.

## Build, Test, and Scripts

```bash
npm run build
npm run start
npm run lint
npm run test
npm run test:coverage
```

Useful operational scripts:

```bash
npm run seed:search
npm run verify:loyalty-coupon-indexes
npm run migrate:coupon-usage
npm run seed:e2e
```

## Docker Deployment

Production Docker Compose in this repository can orchestrate the full MediSpace stack:

- backend API
- frontend Nginx container
- OCR service
- ML recommendation service
- Chat AI service
- Redis
- Typesense

```bash
docker compose up -d
```

Images can be built locally or pulled from DockerHub using tags such as `BACKEND_TAG`, `FRONTEND_TAG`, `OCR_SERVICE_TAG`, `ML_SERVICE_TAG`, and `CHAT_AI_SERVICE_TAG`.

## Current Integration Status

- REST API and Socket.IO chat are actively wired in `src/index.ts` and `src/sockets/chat.socket.ts`.
- OCR scanning is proxied through `/prescriptions/scan` to the Python OCR service.
- Recommendation endpoints call the Python ML service and degrade to catalog fallbacks when ML is unavailable.
- Typesense schemas include products, articles, brands, categories, query suggestions, and optional embedding fields.
- Chat AI requests are proxied to the Python Chat AI service with conversation history and context enrichment.
- LiveKit support is implemented for community video events when credentials are configured.
- Background cleanup, stale chat requeue, AI moderation worker, and scheduler startup run from the backend process.

## Security and Operational Notes

- Keep JWT, OAuth, payment, AWS, email, LiveKit, database, and LLM keys out of Git.
- Set `FRONTEND_URLS` correctly in production; CORS depends on this list.
- Keep `ML_SERVICE_TOKEN` consistent between backend and ML service.
- Use production HTTPS URLs for payment callbacks and OAuth redirect URIs.
- Typesense embedding fields can require more memory; disable with `TYPESENSE_EMBEDDING_ENABLED=false` if needed.
- AI outputs are assistive and should remain behind guardrails, pharmacist escalation, and review flows for medical-risk scenarios.
