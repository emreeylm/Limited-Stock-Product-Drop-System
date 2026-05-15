# Product Drop System

Yüksek trafikli, sınırlı stoklu ürün satış sistemi. Aynı anda yüzlerce kullanıcının
aynı ürünü almak için yarıştığı senaryolarda **overselling** olmasını engelleyen,
rezervasyon tabanlı bir akış sunar.

## Teknoloji Yığını

| Katman   | Teknoloji                                                 |
| -------- | --------------------------------------------------------- |
| Backend  | Node.js + TypeScript + Express + Prisma + PostgreSQL      |
| Auth     | JWT (HS256), bcrypt                                       |
| Validate | Zod                                                       |
| Rate Lim | express-rate-limit                                        |
| Logging  | Winston (structured JSON) + morgan -> winston             |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS               |

## Spec Yorumu: Tek Ürün

İsterler "Build a **Limited Drop Page**" (tekil) diyor. Bu projede
**strict yorum** uygulandı:

- **UI** tek ürünlü bir DROPZONE sayfası — gerçek bir limited drop'un
  hissini doğru yansıtır (left 55% görsel, right 45% satın alma).
  Anasayfa veya katalog sayfası yoktur; uygulama doğrudan drop
  sayfasıyla açılır.
- **API** çoklu ürünü destekler (`?page`, `?limit`, `?sortBy`, `?search`,
  vb.) — spec'in API gereksinimlerini (pagination, filtering, sorting)
  koşulsuz karşılar.
- Frontend, mount sırasında `/api/products?limit=1` ile tek ürünü çeker
  ve doğrudan drop sayfasını gösterir.

Seed `Limited Sneaker` adlı **tek ürün** ile başlar (`stock: 100`,
`initialStock: 100`). Stok düştükçe `stock` azalır, `initialStock`
sabit kalır — UI bu sayede her zaman doğru "X sold / Y total" gösterir.

## Klasör Yapısı

```
.
├── backend/   # API, Prisma, scheduler
├── frontend/  # React UI (tek ürün drop sayfası)
└── docs/
    └── architecture.md   # Topoloji, ER, akış ve hata diyagramları
```

> Mimari diyagramlar için [docs/architecture.md](docs/architecture.md).

## Hızlı Başlangıç

### 1) Postgres ayağa kaldır
```bash
docker run --name drop-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=drop -p 5432:5432 -d postgres:16
```

### 2) Backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```
API: `http://localhost:4000`

### 3) Frontend
```bash
cd frontend
npm install
npm run dev
```
UI: `http://localhost:5173`

---

## Concurrency Stratejisi — Pessimistic vs Optimistic Locking

Çekirdek problem: **N kullanıcı aynı anda `stock=10` olan ürünü almak istiyor.**
Saf kontrol-sonra-yaz dizisi (`if (stock > 0) stock--`) klasik bir TOCTOU race
condition'ı yaratır ve **overselling** ile sonuçlanır.

### Pessimistic Locking (bu projede uygulanan)
Transaction içinde ürün satırı `SELECT ... FOR UPDATE` ile **kilitlenir**. Aynı
satıra başka bir transaction'dan gelen yazma denemeleri lock serbest kalana
kadar bekler. Postgres row-level lock kullandığı için diğer ürünleri etkilemez.

```ts
await prisma.$transaction(async (tx) => {
  const [product] = await tx.$queryRaw<Product[]>`
    SELECT * FROM "Product" WHERE id = ${productId} FOR UPDATE
  `;
  if (product.stock < qty) throw new InsufficientStockError();
  await tx.product.update({
    where: { id: productId },
    data:  { stock: { decrement: qty } },
  });
  await tx.reservation.create({ ... });
});
```

**Artıları:** Doğruluk garantisi, uygulama tarafında retry yok.
**Eksileri:** Lock kuyruğu (popüler ürün = sıralı işlem).

### Optimistic Locking (alternatif)
Ürüne bir `version` kolonu eklenir. Update şu şekilde yapılır:

```sql
UPDATE "Product"
   SET stock = stock - $qty, version = version + 1
 WHERE id = $id AND version = $expectedVersion AND stock >= $qty;
```

Etkilenen satır 0 ise başka biri bizden önce davranmıştır → uygulama katmanında
retry. **Artıları:** Lock yok, throughput yüksek. **Eksileri:** Yüksek
çakışmada retry fırtınası; doğru retry/backoff stratejisi şart.

**Bu projede pessimistic** seçildi: drop senaryosunda doğruluk > throughput,
ve `FOR UPDATE` semantiği Postgres'in en sağlam aracı.

---

## API Özeti

| Method | Path                  | Auth | Açıklama                          |
| ------ | --------------------- | ---- | --------------------------------- |
| POST   | /api/auth/register    | -    | Yeni kullanıcı                    |
| POST   | /api/auth/login       | -    | JWT döner                         |
| GET    | /api/products         | -    | Sayfalanmış ürün listesi          |
| GET    | /api/products/:id     | -    | Tekil ürün                        |
| POST   | /api/reserve          | JWT  | 5 dk geçerli rezervasyon          |
| POST   | /api/checkout         | JWT  | Rezervasyondan order              |
| GET    | /api/reservations     | JWT  | Kullanıcının aktif rezervasyonları |
| GET    | /api/metrics          | -    | Sağlık ve sayaç                   |
| GET    | /api/health           | -    | Liveness probe                    |

### `GET /api/products` — Query Parametreleri

| Param      | Tip                                          | Default      | Açıklama                                  |
| ---------- | -------------------------------------------- | ------------ | ----------------------------------------- |
| `page`     | int ≥ 1                                      | `1`          | Sayfa numarası                            |
| `limit`    | int 1..100                                   | `20`         | Sayfa başına kayıt                        |
| `sortBy`   | `createdAt` \| `price` \| `stock` \| `name`  | `createdAt`  | Sıralama alanı                            |
| `order`    | `asc` \| `desc`                              | `asc`        | Sıra yönü                                 |
| `minStock` | int ≥ 0                                      | —            | En az X stok kalanlar (sold-out filtresi) |
| `minPrice` | num ≥ 0                                      | —            | Alt fiyat sınırı                          |
| `maxPrice` | num ≥ 0                                      | —            | Üst fiyat sınırı                          |
| `search`   | string (≤100)                                | —            | `name` veya `description` case-insensitive|

**Cevap:**
```json
{
  "products": [/* … */],
  "pagination": {
    "total": 14, "page": 1, "limit": 20,
    "totalPages": 1, "hasNext": false, "hasPrev": false
  }
}
```

### Önemli Hata Kodları

| Kod                       | HTTP | Tetikleyici                                 |
| ------------------------- | ---- | ------------------------------------------- |
| `VALIDATION_ERROR`        | 400  | Zod validation başarısız                    |
| `UNAUTHORIZED`            | 401  | JWT yok / geçersiz                          |
| `FORBIDDEN`               | 403  | Başka kullanıcının rezervasyonu             |
| `NOT_FOUND`               | 404  | Ürün / rezervasyon bulunamadı               |
| `INSUFFICIENT_STOCK`      | 409  | Yetersiz stok (oversell engellendi)         |
| `DUPLICATE_RESERVATION`   | 409  | Aynı ürün için aktif PENDING var            |
| `GONE`                    | 410  | Rezervasyon expire olmuş                    |
| `RATE_LIMITED`            | 429  | Rate limit aşıldı                           |

## Background Job
`backend/src/services/cleanupService.ts` her 30 saniyede bir
`status=PENDING && expiresAt < now()` rezervasyonları **transaction içinde**
`EXPIRED` yapar, ürün stoğunu geri yükler ve `InventoryLog` kaydı atar.

---

## Schema Kararları (Why)

Aşağıdaki seçimler kasıtlıdır; alternatifleri reddetme nedenleriyle birlikte:

- **Reservation tablosu (stok kolonu yerine)**
  Stoğu sadece `Product.stock` üzerinde tutup "rezerve edilmiş" kavramını
  başka bir hesapla türetmek mümkündü, ama:
  - Tek-yazılı satır = tek lock noktası → throughput dar boğazı.
  - Audit ve "kim, ne zaman, ne kadar tuttu" sorgusu pahalı hale gelir.
  Ayrı tablo, expiry sweeper'ı + `InventoryLog`'u sade tutar.

- **`status` enum (PENDING/COMPLETED/EXPIRED) + `expiresAt`**
  Boolean'lar yerine enum: ileride `REFUNDED`, `CANCELLED_BY_USER` gibi
  durumlar maliyet olmadan eklenir. `(status, expiresAt)` üzerinde compound
  index ile sweeper sorgusu O(log n) tarama yapar.

- **`InventoryLog` (audit trail)**
  Stok delta'sı her zaman bir transaction içinden yazılır
  (`RESERVE | EXPIRE_RESTOCK | CHECKOUT | SEED`). Şüpheye düşersek
  "ürün stoğu nereye gitti?" sorusunu DB'den **deterministik** cevaplayabiliriz.
  10k QPS'te bile bu append-only tablo en ucuz I/O.

- **`Order.reservationId` UNIQUE**
  Aynı rezervasyondan iki order doğamaz. DB-seviyesi garanti,
  application-level "if-exists" değil.

- **Decimal(10,2) para için**
  Float katiyen yok — yuvarlama hataları sessizdir, gerçek paradır.

- **Composite index `(status, expiresAt)`**
  Sweeper `WHERE status='PENDING' AND expiresAt < now()` sorgusu çalıştırır;
  bu sorgu bu indeksi tek seek + range scan ile çözer.

---

## Trade-offs

Bu projede bilinçli ödün verilen yerler:

| Karar                                          | Kazandığı                       | Kaybettiği                                    |
| ---------------------------------------------- | ------------------------------- | --------------------------------------------- |
| Pessimistic locking (FOR UPDATE)               | Doğruluk, retry yok             | Popüler ürünlerde sıralı işlem (lock kuyruğu) |
| Serializable izolasyon                         | En güçlü tutarlılık             | `40001` retry'larına açık (yüksek yükte)      |
| In-process setInterval sweeper                 | Sıfır extra altyapı             | Multi-instance'da N kez tetiklenir            |
| 5sn polling (WebSocket değil)                  | Stateless, basit                | Stok değişimi 0–5sn gecikmeli görünür         |
| JWT (refresh token yok)                        | Stateless, ölçeklenebilir       | Logout = client-side; gerçek revoke yok       |
| `Product.stock` Int (event-sourcing değil)     | Direkt sorgu, basit             | "Geçmiş stok" sorgusu InventoryLog'a bağımlı  |
| Bcrypt cost=10                                 | Brute-force koruması            | Login ~80ms CPU; cost=12 daha güvenli ama yavaş |
| Aynı kullanıcı, aynı ürüne 1 PENDING           | Bot/spammer hold abuse'unu kırar | Meşru kullanıcı sepetinde 2 adet tutamaz      |

---

## 10K Eşzamanlı Kullanıcıda Ne Kırılır?

Senaryo: T=0 anında 10.000 kullanıcı tek ürün için `/reserve` atıyor.
Mevcut mimaride **fonksiyonel olarak doğru** çalışır — overselling olmaz —
ama performans uçurumları şuralarda:

### 1. **Tek satır lock kuyruğu (en kritik)**
Tek ürün satırı için `FOR UPDATE` ile her transaction sıraya girer.
Tek transaction ortalama ~3–8ms sürdüğünü varsayarsak 10k istek
**sıralı** olarak 30–80 saniyede biter. Kullanıcı algılaması:
"reserve butonu cevap vermiyor" → timeout fırtınası → retry → DDoS.

**Çözüm:**
- **Inventory partitioning (shards):** Ürün stoğunu 50 bucket'a böl
  (`Product_Inventory(productId, shard, stock)`). Reserve, rastgele bir
  shard seçer, sadece o shard'ı kilitler. Lock contention 50× azalır.
- **Reservation queue (Redis):** `INCR product:N:reserved` atomik sayaç,
  başarılı olanlar DB'ye `INSERT`. Postgres'i sadece persistance için kullan.
  Bu, drop senaryolarının endüstri standardı.

### 2. **Postgres connection pool tükenmesi**
Default Prisma pool `num_cpus * 2 + 1` ≈ 9 connection. 10k eşzamanlı istek
bunları anında doldurur, gerisi `P2024 Timed out fetching a new connection`.

**Çözüm:**
- **PgBouncer** transaction-mode pooling önüne: 9 → ~1000 logical connection.
- Pool size'ı CPU sayısı × 4'e çıkar (Postgres'in `max_connections`'ı paralel
  artırılmak şartıyla).

### 3. **Serializable retry fırtınası**
Aynı satırı hedef alan birden fazla transaction'da Postgres `40001
serialization failure` atabilir. Uygulamada retry yapmıyoruz — istek FAIL
olur. Yüksek yükte hata oranı %1–5 görmek normal.

**Çözüm:** Tek-satır lock için Serializable yerine **Read Committed +
`FOR UPDATE`** yeterli. Serializable phantom-read kaygısı için lazım,
ama `FOR UPDATE` zaten satırı izole ediyor. Bu değişiklik throughput'u
%30–50 artırır ve `40001`'i pratikte sıfırlar.

### 4. **Node event loop block**
JWT verify (sync) + bcrypt compare (login için) CPU-yoğun. 10k eşzamanlı
login = event loop'u tıkar. Reserve/checkout için sorun değil (sadece verify).

**Çözüm:** Bcrypt'i `worker_threads` ile offload et, ya da kayıt/login
endpoint'ini ayrı bir node process'e ayır (auth service split).

### 5. **In-process sweeper'ın multi-instance sorunu**
2+ API instance çalışırsa her biri 30sn'de bir aynı sweep'i yapar.
Tek seferlik iş 2× yapılır (idempotent ama gereksiz iş + lock kavgası).

**Çözüm:** Sweeper'ı API'den ayır → **dedicated cron job / worker**
(BullMQ, Render Cron, K8s CronJob). Tek leader, exactly-once garanti.

### 6. **Rate limiter bellek tabanlı**
`express-rate-limit` default'u in-memory `Map`. Multi-instance dağıtımda
her instance kendi sayacını tutar → kullanıcı limit'in N katı istek atabilir.

**Çözüm:** `rate-limit-redis` adapter.

### 7. **Frontend polling 10k × 5sn = 2000 RPS sadece read**
Her kullanıcı tarayıcısı her 5sn'de bir `/products` çağırıyor.

**Çözüm:**
- DB'ye gitmesin: `/products` cevabını **Redis cache** (TTL=2sn) arkasına al.
- Cache stampede engelle: single-flight pattern veya `stale-while-revalidate`.
- Daha iyisi: **WebSocket / SSE push** — stok değiştiğinde fan-out.

---

## Bunu Nasıl Ölçeklendiririm

**Aşama 1: Tek-node optimizasyonu (mevcuttan minimal değişiklik)**
- PgBouncer ekle, pool size yükselt.
- Read Committed + FOR UPDATE'e geç (Serializable bırak).
- `/products` cevabına `Cache-Control: public, max-age=2` + CDN edge cache.

**Aşama 2: Yatay genişleme**
- API node'larını N kopyaya çıkar (stateless).
- Rate limiter'ı Redis'e taşı.
- Sweeper'ı ayrı bir worker process'e ayır (single leader).
- Logging'i merkezi sink'e bağla (Loki / CloudWatch / Datadog).

**Aşama 3: Hot product için özel yol**
- Drop ürünleri **Redis'te** stok sayar: `DECR product:X:stock`.
  Atomik, lock-free, ~100k ops/sec/node.
- Başarılı `DECR` → background job DB'ye `Reservation` insert eder
  (eventual persistence). Frontend reservationId için bekler.
- Postgres tek doğruluk kaynağı kalır; Redis sadece counter front-end.

**Aşama 4: Multi-region**
- Bölgesel Postgres read replica + tek primary (write).
- Drop ürünü counter'ı bölgesel limit'e split (bucket-per-region).
- Eventual consistency: 100 stok, 5 bölgeye 20'şer dağıt; satılmayan
  kontenjan T+30sn'de yeniden dengelenir.

**Aşama 5: Drop'a özel mimari**
- Pre-drop "queue page": drop'tan önce kullanıcı sıraya alınır,
  rastgele sırayla N kişi/sn admit edilir. DB'ye giden RPS tahmin edilebilir.
- "Honest delay": kullanıcıya "sıranızdasınız, ~12sn" bilgisi gösterilir.
  10k anlık spike → 5dk düz akış. Aynı doğruluk, fizibıl yük.
