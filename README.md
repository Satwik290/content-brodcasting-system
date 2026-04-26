# 📺 Content Broadcasting System

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue.svg)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.8.0-blueviolet.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-red.svg)](https://redis.io/)
[![Tests](https://img.shields.io/badge/Tests-Jest-green.svg)](https://jestjs.io/)

A production-grade backend for distributing educational content from teachers to students via a public broadcasting API. Teachers upload subject-specific content, the Principal approves it, and students access the currently active content through a public endpoint that implements deterministic subject-based rotation.

---

## 🚀 Key Features

- **🎯 Deterministic Rotation Engine** — Pure-function scheduling algorithm. No timers or cron jobs. Stateless and horizontally scalable.
- **🛡️ JWT Authentication + RBAC** — Strictly separated Principal and Teacher permissions.
- **🔒 Approval Workflow** — Multi-stage lifecycle with DB-level immutability trigger (ADR-003).
- **📅 Subject-Based Scheduling** — Each subject has its own independent rotation queue.
- **⚡ Redis Caching** — Dynamic TTL aligned to rotation boundary. Cache expires exactly when content rotates.
- **🌪️ Thundering Herd Protection** — SingleFlight request collapsing prevents DB flooding on cache miss.
- **🔄 Idempotency** — Redis-backed idempotency guard prevents duplicate approvals/uploads.
- **📊 Analytics Worker** — Redis Streams + background worker for non-blocking view tracking.
- **🛡️ Rate Limiting** — Sliding window rate limiter on the public API.

---

## 🏗️ Architecture

Service-Oriented Architecture with 3 layers: **Controllers** (validation, HTTP) → **Services** (business logic) → **Prisma ORM** (database).

See [`architecture-notes.txt`](./architecture-notes.txt) for full design documentation including scheduling logic, RBAC flow, and scalability decisions.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20.x, TypeScript 6 |
| Framework | Express 5 |
| Database | PostgreSQL 16 (Prisma 7.8.0) |
| Cache | Redis 7 (ioredis) |
| Validation | Zod |
| Auth | JWT + bcrypt |
| Testing | Jest, Supertest |
| Logging | Winston (structured JSON) |
| Container | Docker Compose |

---

## 🚦 Getting Started

### Prerequisites
- Node.js v20+
- Docker & Docker Compose

### 1. Clone & Install
```bash
git clone <repo-url>
cd content-broadcasting-system
npm install
```

### 2. Start Infrastructure (PostgreSQL + Redis)
```bash
docker-compose up -d
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env — DATABASE_URL defaults to localhost:5433
```

### 4. Run Migrations & Generate Client
```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. Start the Server
```bash
# Development (hot reload)
npm run dev

# Start analytics worker (separate terminal — REQUIRED for Analytics)
npm run worker
```

### 6. Testing with Postman
A comprehensive Postman collection is provided in the root directory: [`postman-collection.json`](./postman-collection.json).
It includes automated scripts to manage tokens and IDs for a seamless testing workflow.

---

## 📡 API Reference

All endpoints are prefixed with `/api/v1/`.

> Use `Idempotency-Key: <unique-id>` header on all mutating requests for safe retries.

---

### 🔑 Auth Endpoints

#### POST `/api/v1/auth/register`
Register a new user.

**Body:**
```json
{
  "name": "John Doe",
  "email": "john@school.com",
  "password": "SecurePass123",
  "role": "TEACHER"
}
```
> `role` must be `"TEACHER"` or `"PRINCIPAL"`

**Response:**
```json
{
  "success": true,
  "data": { "id": "uuid", "name": "John Doe", "email": "...", "role": "TEACHER" },
  "token": "<jwt>"
}
```

---

#### POST `/api/v1/auth/login`
Login and receive a JWT.

**Body:**
```json
{ "email": "john@school.com", "password": "SecurePass123" }
```

**Response:**
```json
{ "token": "<jwt>", "role": "TEACHER" }
```

---

### 📁 Content Endpoints — Teacher

> All require `Authorization: Bearer <token>` header (TEACHER or PRINCIPAL role).

#### POST `/api/v1/content/upload`
Upload content file with metadata. Use `multipart/form-data`.

**Form Fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `file` | file | ✅ | JPG/PNG/GIF, max 10MB |
| `title` | string | ✅ | Max 255 chars |
| `subject` | string | ✅ | One of: `maths`, `science`, `english`, `history`, `geography`, `social-studies` |
| `description` | string | ❌ | Optional, max 1000 chars |
| `startTime` | ISO 8601 | ✅ | When content becomes visible |
| `endTime` | ISO 8601 | ✅ | When content stops being visible |
| `rotationDuration` | integer | ❌ | Minutes per rotation slot (default: 5) |

**Response (201):**
```json
{
  "success": true,
  "data": { "id": "uuid", "title": "...", "subject": "maths", "status": "PENDING", "createdAt": "..." }
}
```

---

#### GET `/api/v1/content/my-uploads`
Get the authenticated teacher's own uploads.

**Query Params:** `?status=PENDING&subject=maths&limit=10&offset=0`

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 25,
    "limit": 10,
    "offset": 0,
    "items": [{ "id": "...", "title": "...", "status": "APPROVED", ... }]
  }
}
```

---

### ✅ Content Endpoints — Principal

> Require `Authorization: Bearer <token>` (PRINCIPAL role only).

#### GET `/api/v1/content/admin/pending`
List all content awaiting review.

**Query Params:** `?subject=maths&limit=20&offset=0`

---

#### POST `/api/v1/content/admin/:id/approve`
Approve a pending content item.

**Response:**
```json
{ "success": true, "message": "Content approved successfully", "data": { "id": "...", "status": "APPROVED", "approvedAt": "..." } }
```

---

#### POST `/api/v1/content/admin/:id/reject`
Reject a pending content item with a mandatory reason.

**Body:**
```json
{ "reason": "Content is not relevant to the curriculum." }
```

---

### 📡 Public Broadcasting Endpoint — No Auth Required

#### GET `/api/v1/content/live/:teacherId`
Get the currently active, live content for a specific teacher.

**Path Param:** `:teacherId` — the UUID of the teacher

**Query Params:** `?subject=maths` (optional — filters to a specific subject)

**Rate limited:** 100 requests/minute per IP.

**Response — Content Active:**
```json
{
  "success": true,
  "data": {
    "teacherId": "uuid",
    "content": {
      "id": "uuid",
      "title": "Maths Chapter 3",
      "subject": "maths",
      "fileUrl": "/uploads/content/abc.jpg",
      "uploadedAt": "2026-04-26T10:00:00Z",
      "isActive": true,
      "activeUntil": "2026-04-26T10:05:00Z",
      "rotationInfo": {
        "totalContents": 3,
        "currentIndex": 1,
        "rotationOrder": 1,
        "remainingSeconds": 180
      }
    }
  }
}
```

**Response — No Content Available:**
```json
{ "success": true, "data": { "content": null, "message": "No content available" } }
```

> ℹ️ Invalid subjects, no approved content, and outside-time-window all return the same empty response — not an error.

---

## 🔄 Content Lifecycle

```
Teacher uploads → PENDING → Principal reviews
                         ├── APPROVED → Goes live in rotation
                         └── REJECTED → Rejection reason visible to teacher
```

Content appears live **only when**:
1. Status is `APPROVED`
2. Current time is between `startTime` and `endTime`
3. Teacher has a matching `teacherId`

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run only unit tests
npx jest tests/unit

# Run only integration tests
npx jest tests/integration
```

---

## ⚠️ Assumptions & Design Decisions

1. **Content immediately enters PENDING state on upload.** The spec lists `uploaded → pending` as distinct states; in this implementation, uploading a file atomically creates the record as PENDING (the transition is instantaneous — there is no manual "submit for review" step by the teacher after uploading).

2. **Teacher ID used in `/live/:teacherId` is the user's UUID**, not a sequential integer like `teacher-1`. If you want human-friendly IDs, use the user's email or a custom slug.

3. **Subject list is a fixed whitelist** defined in `src/config/constants.ts`: `maths, science, english, history, geography, social-studies`. A teacher cannot create content for an unlisted subject.

4. **Rotation is calculated on-the-fly** using an epoch-based modulo formula — no background scheduler or database polling is needed. This makes the system stateless and horizontally scalable.

5. **S3 upload is not implemented** (marked as bonus). The `StorageProvider` interface is in place; swapping to S3 requires implementing `S3StorageProvider` and setting `STORAGE=s3` in `.env`.

6. **Demo video and deployment link** are not included in this repo submission — these are submitted separately via the Google Form.

7. **Rotation looping is infinite.** Content rotates continuously within the `startTime`/`endTime` window until the window closes.

---

## 📜 License
ISC License — Copyright © 2026
