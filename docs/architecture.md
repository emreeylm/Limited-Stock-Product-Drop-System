# Architecture

Tüm sistemin uçtan uca akışı, bileşenleri ve veri yolları.

## High-Level Topology

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (User)                              │
│                                                                          │
│   React 18 + Vite + TS + Tailwind                                        │
│   ┌────────────────────────────────────────────────────────────────┐     │
│   │  App.tsx  (tek ürün — /api/products?limit=1 ile ID alır)       │     │
│   │   ├─ StatusBar               ── nav, auth, cart badge          │     │
│   │   ├─ DropPage + useProduct() ── polls /api/products/:id 5s     │     │
│   │   │   ├─ StockMeter          ── sold / total visual ratio      │     │
│   │   │   ├─ ReserveButton       ── POST /api/reserve              │     │
│   │   │   └─ CountdownTimer      ── client-side TTL, expire cb     │     │
│   │   ├─ CartPage + useReservations()  ── polls /api/reservations   │     │
│   │   ├─ AuthModal / AuthForm    ── login / register               │     │
│   │   └─ Toasts                  ── global notifications           │     │
│   │  api/client.ts (single API layer, JWT, AbortController timeout) │     │
│   └────────────────────────────────────────────────────────────────┘     │
└──────────────────┬───────────────────────────────────────────────────────┘
                   │   HTTPS / JSON / Bearer JWT
                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          API NODE (Express + TS)                         │
│                                                                          │
│  ┌──────────┐  ┌────────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │  CORS    │→ │  Rate Limit    │→ │  Morgan    │→ │  Routes          │  │
│  │          │  │  (global+auth) │  │  → Winston │  │                  │  │
│  └──────────┘  └────────────────┘  └────────────┘  │  /auth/*         │  │
│                                                    │  /products       │  │
│  ┌──────────────────────────────────────────────┐  │  /reserve   ───┐ │  │
│  │  Zod validate  →  requireAuth (JWT verify)   │  │  /checkout  ───┤ │  │
│  └──────────────────────────────────────────────┘  │  /reservations │ │  │
│                                                    │  /metrics      │ │  │
│                                                    │  /health       │ │  │
│  ┌──────────────────────────────────────────────┐  └────────────────┼─┘  │
│  │  Centralized Error Handler                   │                   │    │
│  │  (Zod | AppError | Prisma P2002/P2025)       │                   │    │
│  └──────────────────────────────────────────────┘                   │    │
│                                                                     ▼    │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  services/reservationService.ts                                  │   │
│  │  ┌──────────────────────────────────────────────────────────┐    │   │
│  │  │  $transaction (Serializable)                              │    │   │
│  │  │     SELECT * FROM Product WHERE id=$1 FOR UPDATE          │    │   │
│  │  │     duplicate guard (findFirst PENDING)                   │    │   │
│  │  │     UPDATE Product SET stock = stock - $qty               │    │   │
│  │  │     INSERT Reservation                                    │    │   │
│  │  │     INSERT InventoryLog                                   │    │   │
│  │  └──────────────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  services/cleanupService.ts          (setInterval every 30s)     │   │
│  │     for each PENDING reservation with expiresAt < now():         │   │
│  │        $transaction → mark EXPIRED, restock, log                 │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────┬────────────────────────────────────────────────────────────┘
              │   prisma client (pool)
              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            PostgreSQL                                    │
│                                                                          │
│   User ──┐                                                               │
│          ├─< Reservation >─┐                                             │
│   Product─┤                ├─ Order                                      │
│          └─< InventoryLog                                                │
│                                                                          │
│   Indexes:                                                               │
│     Product(stock)                                                       │
│     Reservation(status, expiresAt)   ← sweeper uses this                 │
│     Reservation(userId)                                                  │
│     InventoryLog(productId, createdAt)                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

## Request Flow — POST /reserve (mutlu yol)

```
Browser                  API node                      Postgres
   │                        │                             │
   │ POST /api/reserve      │                             │
   │ {productId,qty}        │                             │
   │ Authorization:Bearer.. │                             │
   │───────────────────────>│                             │
   │                        │ Zod validate                │
   │                        │ JWT verify → req.user       │
   │                        │ rate-limit (per userId)     │
   │                        │                             │
   │                        │ BEGIN (Serializable)        │
   │                        │────────────────────────────>│
   │                        │                             │
   │                        │ SELECT ... FOR UPDATE       │
   │                        │────────────────────────────>│ row-level lock
   │                        │<── stock=10 ────────────────│
   │                        │                             │
   │                        │ duplicate guard:            │
   │                        │  findFirst userId+product   │
   │                        │  status=PENDING             │
   │                        │────────────────────────────>│
   │                        │<── null ────────────────────│
   │                        │                             │
   │                        │ UPDATE stock = stock - 1    │
   │                        │────────────────────────────>│
   │                        │                             │
   │                        │ INSERT Reservation          │
   │                        │  (PENDING, expiresAt=+5min) │
   │                        │────────────────────────────>│
   │                        │                             │
   │                        │ INSERT InventoryLog         │
   │                        │  (changeAmount=-1, RESERVE) │
   │                        │────────────────────────────>│
   │                        │                             │
   │                        │ COMMIT                      │
   │                        │────────────────────────────>│ lock released
   │                        │                             │
   │ 201 {reservation:{...}}│                             │
   │<───────────────────────│                             │
```

## Concurrency — 100 Eşzamanlı /reserve

Tek `Product` satırı için 100 transaction sırayla işlenir. İlk N tane
(N=stok) başarı döner; gerisi `INSUFFICIENT_STOCK` (409) alır.

```
Time →
                            ┌──────┐
T0:  user_001 ─ FOR UPDATE ─┤      │  (holds lock)
                            │ stock│
T0:  user_002 ─ FOR UPDATE ─┤  =10 │ → blocked, waiting
T0:  user_003 ─ FOR UPDATE ─┤      │ → blocked, waiting
                            │      │
T0+3ms: user_001 COMMIT     │ stock│
                            │  =9  │
T0+3ms: user_002 acquires ──┤      │
                            │      │
... 100 transactions serially, ~300ms total
```

## Cleanup Loop

```
every 30s
   │
   ▼
SELECT id FROM Reservation
WHERE status='PENDING' AND expiresAt < now()
LIMIT 500
   │
   ▼ (for each)
   │
   ▼
$transaction (Serializable)
  SELECT ... FOR UPDATE      ← Reservation row
  re-check status & expiry   ← prevent racing /checkout
  SELECT ... FOR UPDATE      ← Product row
  UPDATE Product SET stock = stock + qty
  UPDATE Reservation SET status = 'EXPIRED'
  INSERT InventoryLog (changeAmount=+qty, reason='EXPIRE_RESTOCK')
COMMIT
```

## Veri Modeli — ER Diyagramı

```
┌───────────────┐
│     User      │
├───────────────┤
│ id    (PK)    │
│ email (UQ)    │
│ password      │
│ createdAt     │
└──────┬────────┘
       │ 1
       │
       │ N
┌──────┴────────┐         ┌────────────────┐
│  Reservation  │ N    1  │    Product     │
├───────────────┤─────────├────────────────┤
│ id    (PK)    │         │ id  (PK)       │
│ userId (FK)   │         │ name           │
│ productId(FK) │         │ description    │
│ quantity      │         │ price Decimal  │
│ status        │         │ stock Int      │
│ expiresAt     │         │ initialStock   │
│ createdAt     │         │ imageUrl       │
│ updatedAt     │         │ createdAt      │
│               │         │ updatedAt      │
└──────┬────────┘         └────────┬───────┘
       │ 1                         │ 1
       │                           │
       │ 0..1                      │ N
┌──────┴────────┐         ┌────────┴───────┐
│     Order     │         │  InventoryLog  │
├───────────────┤         ├────────────────┤
│ id  (PK)      │         │ id   (PK)      │
│ userId (FK)   │         │ productId (FK) │
│ reservationId │         │ changeAmount   │
│   (FK,UQ)     │         │ reason         │
│ totalAmount   │         │ createdAt      │
│ createdAt     │         └────────────────┘
└───────────────┘
```

## Hata Yolları

```
                     ┌─ Zod hatası        →  400 VALIDATION_ERROR
                     │
                     ├─ AppError          →  app-defined status + code
                     │   ├─ Unauthorized        401 UNAUTHORIZED
                     │   ├─ Forbidden           403 FORBIDDEN
                     │   ├─ NotFound            404 NOT_FOUND
                     │   ├─ Conflict            409 CONFLICT
                     │   ├─ Gone                410 GONE
                     │   ├─ InsufficientStock   409 INSUFFICIENT_STOCK
                     │   └─ DuplicateReserv.    409 DUPLICATE_RESERVATION
                     │
                     ├─ Prisma P2002      →  409 CONFLICT (unique)
errorHandler.ts ─────┼─ Prisma P2025      →  404 NOT_FOUND
                     │
                     └─ Diğer her şey     →  500 INTERNAL_ERROR (logged)
```

## Observability

```
HTTP istek           ┌─ Morgan (format) ──┐
   │                 │                    │
   ▼                 ▼                    ▼
[counter inc]   stream.write()      Winston logger
                                     │
                                     ├─ dev → renkli console
                                     └─ prod → JSON (CloudWatch/Loki/ELK)

GET /api/metrics → {uptime, memory, db.pendingReservations, counters{
  http_requests_total, http_errors_total,
  reservations_created, reservations_completed, reservations_expired,
  oversell_attempts_blocked
}}

GET /api/health → liveness probe
```

## Frontend State Makinesi

```
                            user clicks Reserve
                                   │
                                   ▼
   ┌─────────┐  load   ┌──────────┐ click  ┌──────────┐ 201  ┌───────────┐
   │ loading │ ──────> │   idle   │ ─────> │ reserving│ ───> │ reserved  │
   └─────────┘         └──────────┘        └────┬─────┘      └─────┬─────┘
                          ▲                     │ 409                │
                          │                     ▼                    │
                          │              ┌──────────┐                │
                          │              │  error   │                │
                          │              └──────────┘                │
                          │                                          ▼
                          │  on TTL=0                          ┌───────────┐
                          └─────  EXPIRED ─────────────────────│ checkout? │
                                                               └─────┬─────┘
                                                                     │ 201
                                                                     ▼
                                                               ┌───────────┐
                                                               │ completed │
                                                               └───────────┘

Hata kaynakları (her geçişte): network failure, timeout (8s AbortController),
INSUFFICIENT_STOCK (race), DUPLICATE_RESERVATION (rehydrate).
```

## 10k Ölçek Hedefinde Hedef Topoloji (Aşama 3)

```
              ┌────────────┐
              │   CDN /    │  (static frontend + GET /products edge cache)
              │   Edge     │
              └─────┬──────┘
                    │
              ┌─────▼──────┐
              │   ALB /    │
              │   Ingress  │
              └─────┬──────┘
                    │
            ┌───────┴───────┐
            ▼               ▼
       ┌─────────┐     ┌─────────┐
       │  API #1 │ ... │  API #N │  (stateless, autoscaled)
       └────┬────┘     └────┬────┘
            │               │
            └───────┬───────┘
                    ▼
        ┌───────────────────────┐
        │     Redis Cluster     │ ── stock counter + rate-limit + session
        └──────────┬────────────┘
                   │  (async persistance)
                   ▼
        ┌───────────────────────┐
        │      PgBouncer        │
        └──────────┬────────────┘
                   ▼
        ┌───────────────────────┐
        │  Postgres (primary)   │ ─── read replicas (regional)
        │  + WAL → backup       │
        └───────────────────────┘

       ┌─────────────────┐
       │  Sweeper Worker │  (separate process, single leader)
       └─────────────────┘
```
