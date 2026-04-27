# 📺 Content Broadcasting System - Advanced Documentation

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue.svg)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.8.0-blueviolet.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-red.svg)](https://redis.io/)
[![Express](https://img.shields.io/badge/Express-5.x-green.svg)](https://expressjs.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)](https://www.docker.com/)

A production-grade, horizontally scalable backend for distributing educational content. Teachers upload subject-specific content, Principals approve via a multi-stage workflow, and students access live content through a deterministic, state-free broadcasting engine that rotates content independently per subject.

**Key Innovation:** Deterministic rotation algorithm eliminates server-side timers, distributed caches, and polling. Multiple instances compute the same active content simultaneously without coordination.

---

## 🚀 Quick Start

### Prerequisites
```bash
Node.js 20+, Docker & Docker Compose
```

### Setup in 5 Steps

```bash
# 1. Clone and install
git clone <repo>
cd content-broadcasting-system
npm install

# 2. Start infrastructure
docker-compose up -d

# 3. Configure environment
cp .env.example .env

# 4. Run migrations
npx prisma migrate deploy
npx prisma generate

# 5. Start server (two terminals)
npm run dev        # Terminal 1: API server
npm run worker     # Terminal 2: Analytics worker
```

**Verify:** `curl http://localhost:3000/health` → `{"status":"ok"}`

---

## 📊 System Architecture

### Three-Layer Service-Oriented Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      HTTP Layer                              │
│  Routers (auth, content, public) → Controllers (validation) │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Business Logic Layer                        │
│  Services (auth, content, scheduling, broadcast, upload)    │
│  - Transaction management                                     │
│  - Business rules enforcement                                │
│  - Caching & performance optimization                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Data Access Layer                           │
│  Prisma ORM (type-safe) → PostgreSQL + Redis                │
│  - Atomic transactions                                        │
│  - Connection pooling (pg-pool, max 20 connections)          │
└─────────────────────────────────────────────────────────────┘
```

### Request Pipeline

```
Client Request
    ↓
[CORS] → [Request Logger] → [JSON Parser] → [Idempotency Guard]
    ↓
[Rate Limiter] (if /api/*)
    ↓
[Authenticate] (if protected) → [Role Guard] (if admin)
    ↓
[Controller] (validation via Zod)
    ↓
[Service Layer] (business logic + DB)
    ↓
[Cache Layer] (Redis for GET /live)
    ↓
[Response] 200/201/400/401/403/409/429/500
    ↓
[Error Handler] (global catch-all)
```

---

## 🔐 Authentication & RBAC

### JWT Flow

```
1. User Registration/Login
   ├─ Email + Password → bcrypt.hash()
   ├─ Verify → jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '1h' })
   └─ Return: { token, role, user }

2. Protected Request
   ├─ Extract Authorization: Bearer <token>
   ├─ jwt.verify(token, JWT_SECRET)
   ├─ Attach req.user = { id, role }
   └─ Check roleGuard(['PRINCIPAL']) or roleGuard(['TEACHER'])

3. Logout (Token Blocklist)
   ├─ Extract token expiry from jwt.decode()
   ├─ redis.setex(`blocklist:${token}`, remainingTime, '1')
   └─ On next request: redis.get(`blocklist:${token}`) → revoked
```

### Role-Based Access Control (RBAC)

| Endpoint | Teacher | Principal | Student |
|----------|---------|-----------|---------|
| POST /auth/register | ✅ | ✅ | ✅ |
| POST /content/upload | ✅ | ✅ | ❌ |
| GET /content/my-uploads | ✅ | ✅ | ❌ |
| GET /content/admin/pending | ❌ | ✅ | ❌ |
| POST /content/admin/:id/approve | ❌ | ✅ | ❌ |
| POST /content/admin/:id/reject | ❌ | ✅ | ❌ |
| GET /content/live/:teacherId | ✅ | ✅ | ✅ |
| GET /users/me | ✅ | ✅ | ✅ |
| GET /analytics/system | ❌ | ✅ | ❌ |

**Implementation:** `src/middlewares/auth.ts`

---

## 📁 Subject-Based Content Distribution

### Problem Statement

> Multiple teachers upload content for different subjects. A student should see only the currently active content from their teacher, with independent rotation per subject.

### Solution Architecture

```
Teacher A (Maths)          Teacher A (Science)         Teacher B (Maths)
├─ Content M1              ├─ Content S1               ├─ Content M1'
├─ Content M2              ├─ Content S2               └─ Content M2'
└─ Content M3

↓ (Each subject independent rotation)

GET /content/live/teacher-a?subject=maths
→ Returns currently active Maths content (M1, M2, or M3)
  based on time-based calculation, NOT server state

GET /content/live/teacher-a?subject=science
→ Returns currently active Science content (S1 or S2)
  independent cycle, different timing
```

### Data Model

```prisma
Content {
  id: String @id
  title: String
  subject: String        ← Filter dimension
  status: PENDING | APPROVED | REJECTED
  teacherId: String      ← Teacher FK
  
  schedule: ContentSchedule
  slots: ContentSlot[]   ← Rotation metadata
}

ContentSlot {
  id: String
  subject: String        ← "maths", "science", etc.
  rotationOrder: Int     ← Position in subject's queue
  contentId: String      ← FK to Content
  
  @@unique([subject, rotationOrder])
}

ContentSchedule {
  id: String
  contentId: String      ← FK to Content
  slotId: String         ← FK to ContentSlot
  startTime: DateTime    ← When rotation becomes active
  endTime: DateTime      ← When rotation ends
  rotationDurationMinutes: Int
}
```

### Query Example

```sql
-- Get all approved Maths content for teacher-1, active NOW
SELECT c.* FROM "Content" c
  INNER JOIN "ContentSchedule" cs ON c.id = cs.content_id
  INNER JOIN "ContentSlot" slot ON cs.slot_id = slot.id
WHERE
  c.status = 'APPROVED'
  AND c.subject = 'maths'
  AND c.teacher_id = 'teacher-1'
  AND NOW() BETWEEN cs.start_time AND cs.end_time
ORDER BY slot.rotation_order ASC;
```

### Why This Works

1. **Independence:** Maths rotation doesn't affect Science rotation
2. **Scale:** 1000 subjects × 100 items each = independent cycles
3. **Deterministic:** Same inputs (subject, teacher, time) = always same output
4. **No Coordination:** Each server instance computes independently

---

## 📤 File Upload & Validation

### Upload Flow

```
Request (multipart/form-data)
    ├─ file: Buffer (from multer.memoryStorage())
    ├─ title: String
    ├─ subject: String
    ├─ startTime: ISO 8601
    └─ endTime: ISO 8601
    ↓
[Zod Validation]
    ├─ title: 1-255 chars
    ├─ subject: must be in VALID_SUBJECTS
    ├─ startTime < endTime ✓
    └─ times are valid ISO 8601
    ↓
[UploadService.save(file, metadata)]
    ├─ Extract extension from originalname
    ├─ Check: file.size ≤ 10MB
    ├─ Check: extension in ['jpg', 'jpeg', 'png', 'gif']
    ├─ Validate magic bytes:
    │   ├─ JPG: [0xFF, 0xD8, 0xFF]
    │   ├─ PNG: [0x89, 0x50, 0x4E, 0x47]
    │   ├─ GIF: [0x47, 0x49, 0x46]
    │   └─ Compare file.buffer.subarray(0, len) === expected
    ├─ Generate secure filename: ${uuid()}.${ext}
    ├─ Write to: uploads/content/${filename}
    └─ Return: { path, type, size }
    ↓
[ContentService.createContent()]
    ├─ transaction BEGIN
    ├─ Find max rotationOrder for subject
    ├─ Create Content record (status=UPLOADED)
    ├─ Auto-transition to PENDING
    ├─ Create ContentSlot (subject, rotationOrder)
    ├─ Create ContentSchedule (startTime, endTime)
    ├─ Create AuditLog entry
    └─ transaction COMMIT
    ↓
Response: 201 { success: true, data: { id, title, status: "PENDING" } }
```

### Security Measures

| Check | Implementation | Impact |
|-------|----------------|--------|
| Extension | `.split('.').pop().toLowerCase()` | Prevent `.exe` uploads |
| File Size | `10 * 1024 * 1024` byte limit | Prevent disk exhaustion |
| Magic Bytes | Compare buffer signature vs known bytes | Prevent disguised executables |
| Filename | `uuid()` replaces user-provided name | Prevent path traversal (e.g., `../../etc/passwd`) |
| Mimetype | Not trusted; validate via content | Prevent MIME spoofing |
| Storage Location | Fixed `/uploads/content/` | Prevent relative path escapes |

### Supported Formats

```
JPG/JPEG  │ Image/Joint Photographic Experts Group
PNG       │ Portable Network Graphics
GIF       │ Graphics Interchange Format (max 10MB each)
```

**Why These?** Educational content typically uses these formats. PDF/video support can be added via `StorageProvider` interface swap.

---

## ✅ Approval Workflow & Immutability

### Content Lifecycle State Machine

```
┌─────────┐
│ UPLOADED │  (File written, record created)
└────┬────┘
     │
     ▼
┌─────────┐  (Awaiting Principal review)
│ PENDING │
└────┬────┘
     │
     ├──→ ┌──────────┐  (Visible in rotation)
     │    │ APPROVED │
     │    └──────────┘
     │
     └──→ ┌──────────┐  (Rejected, reason stored)
          │ REJECTED │
          └──────────┘
          
Only APPROVED can become live.
Once APPROVED, cannot be modified (immutable).
```

### Approval Workflow Implementation

**Database Level (Trigger):**
```sql
CREATE TRIGGER content_update_lock BEFORE UPDATE ON "Content"
FOR EACH ROW
WHEN (OLD.status = 'APPROVED')
EXECUTE FUNCTION prevent_approved_modification();

-- Raises: "Cannot modify approved content (id=uuid)"
```

**Application Level (Service):**
```typescript
if (content.status === 'APPROVED') {
    throw new AppError('Cannot modify approved content', 409);
}
if (content.status !== 'PENDING') {
    throw new AppError('Content is not in pending state', 400);
}
```

**Two-Layer Defense:**
1. **DB Trigger** — Last line of defense (safety net)
2. **App Logic** — Fast fail before DB roundtrip

### Rejection Workflow

```
Principal submits rejection via POST /content/admin/:id/reject
    ├─ Body: { reason: "Image quality too low" }
    ├─ Validate: reason.length ∈ [5, 500]
    ├─ Update: Content.status = 'REJECTED', rejectionReason = reason
    ├─ Create AuditLog entry
    └─ Return: { status: "REJECTED", rejectionReason }

Teacher views MY_UPLOADS, sees:
    ├─ Status: REJECTED
    ├─ Rejection reason visible inline
    └─ Can re-upload improved version
```

### Audit Trail

Every approval/rejection is recorded:

```typescript
await auditLog.create({
    userId: principalId,
    action: 'approve' | 'reject',
    entityType: 'content',
    entityId: contentId,
    changes: { status, rejectionReason, rotationSlots },
    timestamp: now
});
```

**Query Example:**
```sql
SELECT * FROM "AuditLog"
WHERE entity_type = 'content' AND entity_id = 'uuid'
ORDER BY timestamp DESC;
```

---

## 🔄 Deterministic Rotation Logic (CORE ALGORITHM)

### The Problem

> Without server-side state, how do 1000 simultaneous students, hitting different backend instances, all receive the SAME active content?

### The Solution: Epoch-Based Modulo Formula

```
i = floor((T_now - T_anchor) / D) % N

Where:
  T_now   = Current timestamp (ms since epoch)
  T_anchor = startTime of first active content (ms since epoch)
  D       = Duration of each content slot (ms)
  N       = Number of active content items
  i       = Index of currently active content
```

### Example

```
Math Content (3 items, 5 min each):
├─ Item 0: rotationOrder=0 (00:00-05:00)
├─ Item 1: rotationOrder=1 (05:00-10:00)
└─ Item 2: rotationOrder=2 (10:00-15:00)

Cycle duration = 15 minutes = 900,000 ms

Request at 10:06 AM:
  T_anchor = 10:00 AM = epoch_ms(1000)
  T_now = 10:06 AM = epoch_ms(1360000)
  D = 5 * 60 * 1000 = 300,000 ms
  N = 3
  
  elapsed = 1360000 - 1000 = 359,999 ms
  position = floor(359999 / 300000) % 3
           = floor(1.19...) % 3
           = 1 % 3
           = 1
  
  → Return Item[1] (06:00-10:00 window)
  → Next rotation at: 10:10 AM
  → Cache TTL: 4 minutes (until next rotation)
```

### Implementation Details

**File:** `src/services/scheduling.service.ts`

```typescript
static calculateActiveContentByRotation(
    contentList: ContentWithScheduleAndSlot[],
    currentTime: Date
): RotationResult {
    // 1. Filter by time window
    const activeContents = contentList.filter(c =>
        c.status === 'APPROVED'
        && c.schedule
        && currentTime >= c.schedule.startTime
        && currentTime <= c.schedule.endTime
    );

    if (activeContents.length === 0)
        return { content: null, message: "No content available" };

    // 2. Sort by rotation order
    activeContents.sort((a, b) =>
        (a.slots[0]?.rotationOrder ?? 999)
        - (b.slots[0]?.rotationOrder ?? 999)
    );

    // 3. Calculate cycle
    const cycleStartTime = new Date(activeContents[0].schedule!.startTime);
    const totalCycleDuration = activeContents.reduce((sum, c) =>
        sum + c.schedule!.rotationDurationMinutes * 60 * 1000,
        0
    );

    // 4. Find position in cycle
    const elapsed = Math.max(0, currentTime - cycleStartTime);
    const position = elapsed % totalCycleDuration;

    // 5. Find which content covers this position
    let accumulated = 0;
    for (let i = 0; i < activeContents.length; i++) {
        const duration = activeContents[i].schedule!.rotationDurationMinutes * 60 * 1000;
        if (position < accumulated + duration) {
            return {
                content: activeContents[i],
                activeUntil: new Date(currentTime + (accumulated + duration - position)),
                rotationInfo: {
                    totalContents: activeContents.length,
                    currentIndex: i,
                    rotationOrder: activeContents[i].slots[0]?.rotationOrder ?? -1,
                    remainingSeconds: Math.floor((accumulated + duration - position) / 1000)
                }
            };
        }
        accumulated += duration;
    }
}
```

### Why This Works Across Instances

```
Instance-1    Instance-2    Instance-3
(California)  (Virginia)    (Tokyo)
    │             │             │
    └─────────────┴─────────────┘
           All have:
           ├─ Same T_now (±seconds, NTP synchronized)
           ├─ Same T_anchor (stored in DB)
           ├─ Same D (per content, from DB)
           ├─ Same N (computed from same DB query)
           └─ NO shared state needed!
           
Result: All instances compute i=1 simultaneously,
        return Item[1] to students
```

### Edge Cases & Handling

| Case | Behavior |
|------|----------|
| No approved content | Return null + message (200 OK, not error) |
| Approved but outside time window | Return null (content not yet/no longer active) |
| Single content item | Return immediately (no rotation needed) |
| Invalid subject filter | Return null (not an error, per spec) |
| Content with zero duration | Skip silently (shouldn't happen but handled) |

---

## 💾 Database Design

### Schema Overview

```prisma
// Core Users
User {
  id: String @id @default(uuid())
  name: String
  email: String @unique
  password_hash: String (bcrypt)
  role: PRINCIPAL | TEACHER
  createdAt: DateTime
  updatedAt: DateTime
  
  // Relations
  uploads: Content[] @relation("UploadedContent")
  approvals: Content[] @relation("ApprovedContent")
  auditLogs: AuditLog[]
}

// Content & Scheduling
Content {
  id: String @id
  title: String
  subject: String
  fileUrl: String
  fileType: String
  fileSize: Int
  description: String?
  status: UPLOADED | PENDING | APPROVED | REJECTED
  rejectionReason: String?
  
  teacherId: String (FK → User.id)
  approvedById: String? (FK → User.id)
  approvedAt: DateTime?
  
  schedule: ContentSchedule?
  slots: ContentSlot[]
  
  @@index([subject, status])
  @@index([status, createdAt DESC])
}

ContentSlot {
  id: String
  subject: String
  rotationOrder: Int
  contentId: String (FK → Content.id)
  
  @@unique([subject, rotationOrder])
}

ContentSchedule {
  id: String
  contentId: String (FK → Content.id, unique)
  slotId: String (FK → ContentSlot.id)
  startTime: DateTime
  endTime: DateTime
  rotationDurationMinutes: Int
  
  @@index([startTime, endTime])
}

// Auditing
AuditLog {
  id: String
  userId: String? (FK → User.id)
  action: String ("approve" | "reject")
  entityType: String ("content")
  entityId: String
  changes: Json
  timestamp: DateTime
  
  @@index([entityType, entityId])
  @@index([userId])
}
```

### Index Strategy

| Index | Query Pattern | Benefit |
|-------|---------------|---------|
| `[status, createdAt DESC]` | Principal's dashboard (PENDING) | Index-only scan, no sorting |
| `[subject, status]` | Filter content by subject | Fast subject lookups |
| `[startTime, endTime]` | Time-window queries | Efficient range scans |
| `[subject, rotationOrder]` | Unique constraint on rotation order | Prevents duplicates |

### Query Performance

```sql
-- Principal's Pending Review Dashboard (O(1) index scan)
SELECT * FROM "Content"
WHERE status = 'PENDING' AND created_at DESC
LIMIT 20;
→ Uses: @@index([status, createdAt DESC])
→ No full table scan, no temporary sort

-- Live Content Query (O(M log M) where M = items per subject)
SELECT c.* FROM "Content" c
INNER JOIN "ContentSchedule" cs ON c.id = cs.content_id
WHERE
  c.status = 'APPROVED'
  AND c.subject = 'maths'
  AND NOW() BETWEEN cs.start_time AND cs.end_time
ORDER BY c.created_at ASC;
→ Uses: @@index([startTime, endTime])
→ PostgreSQL range scan efficient for time windows
```

### Relationships & Cascading

```
User deleted
  → All User.approvals set approvedById = NULL
  → All User.uploads get author = UNSET (ERROR — constraint)
     ✓ Solution: Don't allow teacher deletion if they have content

Content deleted
  → ContentSchedule deleted (CASCADE)
  → ContentSlot deleted (CASCADE)
  → AuditLog entries remain (for audit trail)

ContentSlot deleted
  → ContentSchedule.slotId = NULL (if not already cascaded)
```

---

## 🔗 Folder Structure

```
content-broadcasting-system/
│
├── src/
│   ├── app.ts                    ← Express app setup
│   ├── server.ts                 ← HTTP server entrypoint
│   │
│   ├── config/
│   │   ├── constants.ts          ← VALID_SUBJECTS
│   │   ├── prisma.ts            ← PrismaClient + pg.Pool
│   │   └── redis.ts             ← ioredis singleton
│   │
│   ├── controllers/              ← HTTP layer (validation, routing)
│   │   ├── auth.controller.ts
│   │   ├── content.controller.ts
│   │   ├── broadcast.controller.ts
│   │   ├── user.controller.ts
│   │   └── analytics.controller.ts
│   │
│   ├── services/                 ← Business logic (transactions, rules)
│   │   ├── auth.service.ts       ← JWT, bcrypt, logout
│   │   ├── content.service.ts    ← CRUD, lifecycle, immutability
│   │   ├── broadcast.service.ts  ← Caching, SingleFlight
│   │   ├── scheduling.service.ts ← Rotation algorithm
│   │   ├── upload.service.ts     ← File validation, storage
│   │   ├── user.service.ts       ← Profile, list teachers
│   │   └── analytics.service.ts  ← View aggregation
│   │
│   ├── middlewares/              ← HTTP middleware (pre-controller)
│   │   ├── auth.ts              ← JWT verify, roleGuard
│   │   ├── errorHandler.ts      ← Global error catching
│   │   ├── idempotency.ts       ← Duplicate request prevention
│   │   ├── rateLimiter.ts       ← Sliding window (Redis)
│   │   └── logging.middleware.ts ← Request logging
│   │
│   ├── routes/                   ← Router definitions
│   │   ├── auth.ts
│   │   ├── content.ts
│   │   ├── public.ts
│   │   ├── user.ts
│   │   └── analytics.ts
│   │
│   ├── validators/               ← Zod schemas
│   │   ├── auth.validator.ts
│   │   └── content.validator.ts
│   │
│   ├── models/                   ← Domain models
│   │   └── user.model.ts        ← UserModel.sanitize()
│   │
│   ├── types/                    ← TypeScript interfaces
│   │   ├── auth.types.ts
│   │   ├── content.types.ts
│   │   ├── scheduling.types.ts
│   │   └── common.types.ts
│   │
│   ├── utils/                    ← Utilities & helpers
│   │   ├── logger.ts            ← Winston logger
│   │   ├── singleFlight.ts      ← Request collapsing
│   │   └── rotationEngine.ts    ← Deterministic algorithm
│   │
│   └── workers/                  ← Background jobs
│       └── analyticsWorker.ts   ← Redis Stream consumer
│
├── prisma/
│   ├── schema.prisma            ← Data model
│   └── migrations/              ← Migration files
│       └── 20260426120544_init/
│
├── tests/
│   ├── unit/
│   │   └── services/
│   │       └── SchedulingService.test.ts
│   └── integration/
│       └── content.workflow.test.ts
│
├── uploads/
│   └── content/                 ← File storage directory
│
├── docker-compose.yml           ← PostgreSQL + Redis
├── .env.example                 ← Environment template
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── architecture-notes.txt
└── postman-collection.json      ← API testing
```

---

## 🔌 Middleware Stack

### Order of Execution

```
Inbound Request
    ↓
1. cors()                      ← Cross-origin headers
    ↓
2. requestLogger()             ← Log method, path, status, duration
    ↓
3. express.json()              ← Parse JSON body (req.body)
    ↓
4. idempotencyGuard()          ← Check Idempotency-Key header
    ├─ If duplicate: return cached response (24h TTL)
    └─ Else: intercept res.json(), cache successful responses
    ↓
5. apiLimiter (on /api/*)      ← Sliding window rate limiting
    ├─ Lua script in Redis
    ├─ 100 req/min per IP
    └─ Returns 429 if exceeded
    ↓
6. Route Handler
    ├─ authenticate()           ← JWT verify (if protected)
    │   ├─ Extract Bearer token
    │   ├─ Verify signature
    │   ├─ Check Redis blocklist (logout)
    │   └─ Attach req.user = { id, role }
    │
    ├─ roleGuard(['PRINCIPAL']) ← RBAC check (if admin route)
    │   └─ Returns 403 if insufficient permissions
    │
    ├─ uploadMiddleware        ← multer.single('file') (if upload)
    │   └─ Parse multipart/form-data, store in req.file
    │
    └─ Controller              ← Business logic
    ↓
7. Global Error Handler
    ├─ If AppError: return JSON error response
    └─ Else: log, return 500
```

### Middleware Highlights

#### Request Logger
```typescript
export const requestLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            user: req.user?.id
        });
    });
    next();
};
```

**Output:**
```json
{
  "level": "info",
  "message": "HTTP Request",
  "timestamp": "2026-04-26T10:30:45.123Z",
  "method": "POST",
  "path": "/api/v1/content/upload",
  "status": 201,
  "duration": "234ms",
  "ip": "192.168.1.1",
  "user": "uuid-teacher-123"
}
```

#### Idempotency Guard
```typescript
export const idempotencyGuard = async (req, res, next) => {
    if (!['POST', 'PATCH', 'PUT'].includes(req.method)) return next();
    
    const key = req.headers['idempotency-key'];
    if (!key) return next();
    
    const cacheKey = `idempotency:${req.path}:${key}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
        const { status, body } = JSON.parse(cached);
        return res.status(status).json(body);  // ← Same response
    }
    
    // Intercept res.json() to cache it
    const original = res.json;
    res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            redis.setex(cacheKey, 86400, JSON.stringify({
                status: res.statusCode,
                body
            }));
        }
        return original.call(res, body);
    };
    next();
};
```

**Use Case:**
```bash
# Request 1: Success
POST /api/v1/content/upload
Idempotency-Key: abc-123
→ 201 { success: true, data: { id: "xyz" } }

# Request 2: Duplicate (network retry, user clicked twice)
POST /api/v1/content/upload
Idempotency-Key: abc-123
→ 201 { success: true, data: { id: "xyz" } }  ← From cache!
  (No file uploaded twice, no content created twice)
```

#### Rate Limiter (Sliding Window)
```lua
-- Lua script in Redis (atomic operation)
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count >= limit then
    return 0  -- Rate limit exceeded
end

redis.call('ZADD', key, now, now)
redis.call('PEXPIRE', key, window)
return 1  -- OK
```

**Configuration:**
- **Window:** 60,000 ms (1 minute)
- **Limit:** 100 requests per minute per IP
- **Response:** 429 Too Many Requests

---

## 🚀 Scalability & Performance

### Caching Strategy

#### 1. Live Content Caching (Redis)

```
GET /content/live/:teacherId?subject=maths
    ├─ Cache Key: "live_content:{teacherId}:{subject}"
    ├─ Check: redis.get(key)
    │
    ├─ HIT (cached)
    │   └─ Return immediately (O(1), sub-millisecond)
    │
    └─ MISS (not cached or expired)
        ├─ SingleFlight: Collapse concurrent requests
        ├─ Query DB: SELECT ... WHERE status='APPROVED' AND ...
        ├─ Calculate: SchedulingService.calculateActiveContent()
        ├─ Cache: redis.setex(key, TTL, JSON)
        │   └─ TTL = seconds until next rotation
        │       (e.g., 180 seconds if 5 min slot, 2 min remaining)
        └─ Return to client + all waiting requests
```

**Why Dynamic TTL?**
```
Content changes at rotation boundary (T+300s).
Cache expires at exact same time.
Zero stale data. Perfect cache invalidation!
```

#### 2. SingleFlight Request Collapsing

```
T=0:00  5000 students hit /live/:teacher
        ├─ Request 1: Lock acquired, DB query starts
        ├─ Request 2-5000: Wait for Request 1
        │
T=0:01  Request 1 completes, returns content
        ├─ All 5000 requests receive same response (in-memory)
        └─ Cache set in Redis (for next miss)

Without SingleFlight:
        ├─ 5000 DB connections opened
        ├─ 5000 identical queries executed
        └─ Connection pool exhausted → 429 errors
        
With SingleFlight:
        ├─ 1 DB connection
        ├─ 1 query executed
        └─ All requests satisfied (in-memory promise)
```

**Implementation:**
```typescript
export class SingleFlight {
    private activeCalls: Map<string, Promise<any>> = new Map();

    async do<T>(key: string, fn: () => Promise<T>): Promise<T> {
        if (this.activeCalls.has(key)) {
            return this.activeCalls.get(key);  // ← Await same promise
        }

        const promise = fn().finally(() => {
            this.activeCalls.delete(key);      // ← Cleanup
        });

        this.activeCalls.set(key, promise);
        return promise;
    }
}
```

### Connection Pooling

**PostgreSQL (pg.Pool):**
```typescript
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,           // Max connections
    idleTimeoutMillis: 30000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

**Configuration Rationale:**
- **max: 20** — Enough for typical traffic (each request: 1-2 connections)
- **idleTimeout: 30s** — Reclaim idle connections after 30 seconds
- **Queries use transactions** — Short-lived, predictable duration

### Background Analytics Worker

**Problem:** Every view tracked = DB write = slows down request

**Solution:** Async event-driven architecture

```
Request                         Background Worker
│                               │
GET /live/:teacher              │
  ├─ Compute active content      │
  ├─ Return 200 OK              │
  │                             │
  ├─ (async, fire & forget)     │
  │ redis.xadd(                 │
  │   'content_views_stream',   │
  │   { content_id, teacher_id, │
  │     subject, timestamp }    │
  │ )                           │
  └─ Response sent in <50ms    │
                                │
                        (separate process)
                        ├─ redis.xreadgroup()
                        ├─ Aggregate 50 messages
                        │  { content_id_1: 123 views,
                        │    content_id_2: 456 views, ... }
                        ├─ Bulk upsert to DB
                        │  UPDATE analytics
                        │  SET viewCount += ?
                        └─ redis.xack() confirm
```

**Redis Stream vs Message Queue:**
- **Durability:** Stream persists to disk (appendonly.aof)
- **Ordering:** FIFO within subject
- **Replay:** Consumer can re-read on crash
- **Memory:** Bounded (configurable maxlen)

---

## 📊 API Endpoints Reference

### Authentication (3 endpoints)

#### POST /api/v1/auth/register
```http
POST http://localhost:3000/api/v1/auth/register
Content-Type: application/json

{
  "name": "John Teacher",
  "email": "john@school.com",
  "password": "SecurePass123!",
  "role": "TEACHER"
}

201 Created
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "name": "John Teacher", "email": "...", "role": "TEACHER" },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### POST /api/v1/auth/login
```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "john@school.com",
  "password": "SecurePass123!"
}

200 OK
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "role": "TEACHER",
    "user": { "id": "uuid", "name": "John", "email": "..." }
  }
}
```

#### POST /api/v1/auth/logout
```http
POST http://localhost:3000/api/v1/auth/logout
Authorization: Bearer <token>

200 OK
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Content Management (6 endpoints)

#### POST /api/v1/content/upload (Teacher)
```http
POST http://localhost:3000/api/v1/content/upload
Authorization: Bearer <teacher-token>
Content-Type: multipart/form-data
Idempotency-Key: <uuid>

{
  "title": "Maths Quiz Week 1",
  "subject": "maths",
  "description": "Basic arithmetic",
  "file": <binary>,
  "startTime": "2026-04-26T10:00:00Z",
  "endTime": "2026-04-26T18:00:00Z",
  "rotationDuration": 5
}

201 Created
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Maths Quiz Week 1",
    "subject": "maths",
    "status": "PENDING",
    "createdAt": "2026-04-26T10:30:45Z"
  }
}
```

#### GET /api/v1/content/my-uploads (Teacher)
```http
GET http://localhost:3000/api/v1/content/my-uploads?subject=maths&limit=10&offset=0
Authorization: Bearer <teacher-token>

200 OK
{
  "success": true,
  "data": {
    "total": 25,
    "limit": 10,
    "offset": 0,
    "items": [
      {
        "id": "uuid",
        "title": "...",
        "subject": "maths",
        "status": "APPROVED",
        "createdAt": "...",
        "schedule": { "startTime": "...", "endTime": "..." },
        "slots": [{ "subject": "maths", "rotationOrder": 0 }]
      }
    ]
  }
}
```

#### GET /api/v1/content/admin/pending (Principal)
```http
GET http://localhost:3000/api/v1/content/admin/pending?limit=20&subject=maths
Authorization: Bearer <principal-token>

200 OK
{
  "success": true,
  "data": {
    "total": 42,
    "items": [
      {
        "id": "uuid",
        "title": "...",
        "status": "PENDING",
        "author": { "id": "uuid", "name": "John Teacher" },
        "createdAt": "..."
      }
    ]
  }
}
```

#### POST /api/v1/content/admin/:id/approve (Principal)
```http
POST http://localhost:3000/api/v1/content/admin/uuid/approve
Authorization: Bearer <principal-token>

200 OK
{
  "success": true,
  "message": "Content approved successfully",
  "data": {
    "id": "uuid",
    "status": "APPROVED",
    "approvedAt": "2026-04-26T10:32:10Z"
  }
}
```

#### POST /api/v1/content/admin/:id/reject (Principal)
```http
POST http://localhost:3000/api/v1/content/admin/uuid/reject
Authorization: Bearer <principal-token>
Content-Type: application/json

{
  "reason": "Image quality is too low for students to read"
}

200 OK
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "REJECTED",
    "rejectionReason": "Image quality is too low..."
  }
}
```

### Public Broadcasting (1 endpoint — NO AUTH)

#### GET /api/v1/content/live/:teacherId
```http
GET http://localhost:3000/api/v1/content/live/teacher-uuid
GET http://localhost:3000/api/v1/content/live/teacher-uuid?subject=maths

200 OK — Content Available
{
  "success": true,
  "data": {
    "teacherId": "uuid",
    "content": {
      "id": "uuid",
      "title": "Maths Chapter 3",
      "subject": "maths",
      "fileUrl": "/uploads/content/abc.jpg",
      "uploadedAt": "2026-04-26T09:00:00Z",
      "isActive": true,
      "activeUntil": "2026-04-26T10:05:00Z",
      "rotationInfo": {
        "totalContents": 3,
        "currentIndex": 1,
        "rotationOrder": 1,
        "remainingSeconds": 180
      }
    }
  },
  "cached": true
}

200 OK — No Content Available
{
  "success": true,
  "data": {
    "content": null,
    "message": "No content available"
  }
}

429 Too Many Requests
{
  "error": "Rate limit exceeded"
}
```

---

## 🧪 Testing Strategy

### Unit Tests
```bash
npm test -- tests/unit/services/SchedulingService.test.ts
```

**Coverage:**
- Rotation algorithm (3+ items, edge cases)
- Time window boundaries
- Empty content handling
- Immutability checks

### Integration Tests
```bash
npm test -- tests/integration/content.workflow.test.ts
```

**Coverage:**
- Full upload → approve → broadcast flow
- Subject validation
- Zod schema validation
- RBAC enforcement
- Edge cases (no file, invalid subject, no auth)

---

## 📈 Deployment Checklist

- [ ] Environment variables configured (.env)
- [ ] PostgreSQL database accessible
- [ ] Redis instance accessible
- [ ] Migrations run: `npx prisma migrate deploy`
- [ ] Analytics worker process running separately
- [ ] Health check responds: `GET /health` → 200 OK
- [ ] Rate limiting configured (100 req/min)
- [ ] Logging level set to "info" (or lower for debug)
- [ ] File upload directory has write permissions
- [ ] Idempotency-Key header supported
- [ ] JWT_SECRET is strong (32+ chars)
- [ ] CORS configured for allowed origins
- [ ] Load balancer sticky sessions (if scaling horizontally)

---

## 🔗 See Also

- **architecture-notes.txt** — Deep technical reference
- **postman-collection.json** — API testing collection
- **prisma/schema.prisma** — Data model definition
- **tests/** — Test suites (unit + integration)