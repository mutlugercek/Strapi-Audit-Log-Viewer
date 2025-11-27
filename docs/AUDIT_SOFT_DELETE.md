# Audit & Soft Delete Sistemi

Bu dokümantasyon, BetterCoaching projesinde implement edilen audit logging ve soft delete sistemini açıklar.

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Audit Sistemi](#audit-sistemi)
3. [Soft Delete](#soft-delete)
4. [Environment Değişkenleri](#environment-değişkenleri)
5. [Database Migration](#database-migration)
6. [Kullanım Örnekleri](#kullanım-örnekleri)
7. [Cron Jobs](#cron-jobs)

## Genel Bakış

### Temel Prensipler

- **Az ve Öz Audit**: Sadece kritik olaylar kaydedilir
- **PII Koruması**: Kişisel veriler hash'lenerek saklanır
- **Partition Tabanlı**: Aylık partition'lar ile verimli retention
- **Fail-Open**: Audit hatası ana akışı bozmaz
- **Tamper Detection**: HMAC imza ile değişiklik tespiti

### Audit Aksiyon Seti (Minimum)

```
Auth:
- LOGIN_SUCCESS, LOGIN_FAIL_BUCKETED
- PASSWORD_RESET_REQUEST, PASSWORD_RESET_CONFIRM
- EMAIL_VERIFY

Profil:
- PROFILE_PUBLISH, PROFILE_UNPUBLISH
- PROFILE_UPDATE_SENSITIVE

Yetki:
- ROLE_CHANGED, PERMISSION_CHANGED

Hesap Silme:
- DELETE_REQUESTED, DELETE_CONFIRMED
- ANONYMIZED, PURGED

Admin:
- ADMIN_IMPERSONATION, ADMIN_BULK_UPDATE
```

## Audit Sistemi

### Database Yapısı

```
audit schema
├── audit_log (partitioned parent)
│   └── audit_log_YYYY_MM (monthly partitions)
├── audit_bucket (bruteforce protection)
├── audit_log_hot (90-day view)
└── partition_log (maintenance log)
```

### Tablo Şeması

```sql
audit.audit_log (
  id            BIGSERIAL,
  ts            TIMESTAMPTZ,      -- Zaman damgası
  actor_type    TEXT,             -- user/admin/system/anonymous
  actor_id      BIGINT,           -- User ID (PII değil)
  action        TEXT,             -- Aksiyon türü
  result        TEXT,             -- success/fail
  reason_code   TEXT,             -- Hata kodu
  target_type   TEXT,             -- Hedef entity türü
  target_id     BIGINT,           -- Hedef entity ID
  request_id    UUID,             -- Request correlation
  ip_hash       BYTEA,            -- SHA256 hash
  ua            TEXT,             -- User-Agent (max 300 char)
  meta          JSONB,            -- Ek veri (max 2KB)
  sig           BYTEA             -- HMAC imza
)
```

### Bucket Sistemi (Bruteforce Koruması)

Login fail gibi yoğun olaylar saniyede yüzlerce kez gelebilir. Bucket sistemi:

1. **5 dakikalık pencereler** içinde olayları gruplar
2. **Upsert** ile count artırır (her fail için satır oluşturmaz)
3. **10 dakikada bir** bucket'ları audit_log'a flush eder

```sql
audit.audit_bucket (
  window_start    TIMESTAMPTZ,
  action          TEXT,
  ip_hash         BYTEA,
  identifier_hash BYTEA,
  count           INT,
  first_ts        TIMESTAMPTZ,
  last_ts         TIMESTAMPTZ
)
```

### Meta Whitelist

Audit meta alanında sadece şu anahtarlar kabul edilir:

```
count, first_ts, window_start, identifier_hash,
locale, fieldChanged, fromRoleId, toRoleId,
profileType, reason, method, tokenType
```

PII içeren değerler (email, telefon vb.) otomatik filtrelenir.

## Soft Delete

### User Model Alanları

```sql
status              TEXT    -- active/deleted/deleted_pending_purge
deleted_at          TIMESTAMPTZ
deleted_by          BIGINT
erasure_requested_at TIMESTAMPTZ
erasure_due_at      TIMESTAMPTZ  -- +30 gün
anonymized_at       TIMESTAMPTZ
token_version       INT     -- JWT invalidation
last_auth_at        TIMESTAMPTZ
```

### Silme Akışı

```
1. DELETE_REQUESTED
   └─ User silme talebi oluşturur
   └─ Email onay linki gönderilir
   └─ erasure_due_at = now + 30 gün

2. DELETE_CONFIRMED (Email token ile)
   └─ status = deleted_pending_purge
   └─ token_version++ (tüm JWT'ler geçersiz)
   └─ Profiller unpublish edilir
   └─ PII anonymize edilir

3. ANONYMIZED (Hemen veya background)
   └─ email = deleted+{id}@example.invalid
   └─ username = deleted_user_{id}
   └─ Diğer PII alanlar null

4. PURGED (erasure_due_at sonrası - cron job)
   └─ status = purged
   └─ Tüm token'lar temizlenir
```

### JWT Invalidation

```
JWT claim: { ..., tv: tokenVersion }

Her auth check:
  if user.status !== 'active' → 403
  if user.tokenVersion !== jwt.tv → 401 (token expired)
```

## Environment Değişkenleri

```bash
# Audit HMAC secret (değiştirin!)
AUDIT_HMAC_SECRET=your-secure-audit-secret

# IP ve identifier hash salt'ları (değiştirin!)
AUDIT_IP_SALT=your-ip-salt
AUDIT_IDENTIFIER_SALT=your-identifier-salt

# Retention süresi (ay)
AUDIT_RETENTION_MONTHS=24

# Fail-open modu (varsayılan: true)
AUDIT_FAIL_OPEN=true
```

## Database Migration

Migration dosyaları:

```
apps/cms/database/migrations/
├── 001_audit_schema.sql     # Audit tabloları ve fonksiyonlar
└── 002_user_soft_delete.sql # User soft delete alanları
```

### Migration Çalıştırma

```bash
# PostgreSQL'e bağlan
psql -h localhost -p 5433 -U strapi_staging -d strapi_staging

# Migration'ları çalıştır
\i apps/cms/database/migrations/001_audit_schema.sql
\i apps/cms/database/migrations/002_user_soft_delete.sql
```

## Kullanım Örnekleri

### Audit Yazma

```typescript
import { writeAudit, auditLoginSuccess } from '../utils/audit';

// Basit kullanım
await auditLoginSuccess(strapi, ctx, userId, { method: 'local' });

// Detaylı kullanım
await writeAudit(strapi, {
  ctx,
  actorType: 'user',
  actorId: userId,
  action: 'PROFILE_PUBLISH',
  result: 'success',
  targetType: 'coach',
  targetId: coachId,
  meta: { profileType: 'coach' },
});
```

### Login Fail Bucket

```typescript
import { auditLoginFail } from '../utils/audit';

// Bucket'a eklenir, audit_log'a değil
await auditLoginFail(strapi, ctx, email, 'WRONG_PASSWORD');
```

### Account Deletion

```typescript
import { auditAccountDeletion } from '../utils/audit';

await auditAccountDeletion(strapi, ctx, {
  action: 'DELETE_CONFIRMED',
  actorId: userId,
  targetUserId: userId,
});
```

## Cron Jobs

```typescript
// config/cron.ts

// Her 10 dakika: Bucket flush
'*/10 * * * *': flushBuckets

// Her gün 01:00: Partition bakımı
'0 1 * * *': partition create/drop

// Her gün 02:00: User purge
'0 2 * * *': purge deleted users
```

### Manuel Çalıştırma

```sql
-- Bucket flush
SELECT audit.flush_buckets(10);

-- Partition oluştur
SELECT audit.ensure_partition(CURRENT_DATE);
SELECT audit.ensure_partition(CURRENT_DATE + interval '1 month');

-- Eski partition'ları sil
SELECT audit.drop_old_partitions(24);
```

## Request Correlation

### Next.js → Strapi

1. Next.js middleware `x-request-id` header üretir
2. API route'lar bu header'ı Strapi'ye forward eder
3. Strapi middleware `ctx.state.requestId`'ye kaydeder
4. Audit fonksiyonları requestId'yi log'a yazar

### Debug

```sql
-- Request ID ile audit sorgula
SELECT * FROM audit.audit_log_hot
WHERE request_id = 'uuid-here'
ORDER BY ts DESC;

-- Actor bazlı
SELECT * FROM audit.audit_log_hot
WHERE actor_id = 123
ORDER BY ts DESC
LIMIT 50;
```

## Güvenlik Notları

1. **HMAC Secret**: Production'da mutlaka güçlü bir secret kullanın
2. **Salt Değerleri**: IP ve identifier salt'ları production'da değiştirin
3. **PII**: Audit log'da asla raw PII saklanmaz
4. **Token Version**: Silinen hesapların JWT'leri anında geçersiz olur
5. **Partition Drop**: Retention süresi dolan veriler kalıcı silinir

## Kabul Kriterleri

- [x] Silinen kullanıcı JWT'si çalışmıyor (tokenVersion)
- [x] LOGIN_FAIL saldırısında audit şişmiyor (bucket)
- [x] Son 90 gün sorgusu hızlı (hot view)
- [x] Retention dışı veriler partition DROP ile siliniyor
- [x] Meta 2KB limitini aşınca truncate ediliyor
- [x] Soft delete confirm → profil listeden düşüyor
- [x] Anonymize idempotent çalışıyor

