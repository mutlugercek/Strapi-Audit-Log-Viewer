# Audit Log Viewer Plugin - Teknik Dokümantasyon

## Genel Bakış

Audit Log Viewer, Strapi 5.27 Admin Panel içinde audit loglarını görüntülemek için geliştirilmiş özel bir plugin'dir. PostgreSQL'deki partition'lı `audit.audit_log` tablosundan doğrudan veri okur ve SuperAdmin kullanıcılarına read-only erişim sağlar.

**Önemli**: Bu plugin Strapi'nin ücretli "Audit Logs" özelliği ile çakışmaz. Community edition için özel olarak geliştirilmiştir.

---

## Mimari

### Plugin Konumu

```
packages/strapi-plugin-audit-viewer/
├── package.json                    # Plugin manifest
├── tsconfig.json                   # TypeScript yapılandırması
├── dist/                           # Build çıktıları
├── admin/
│   └── src/
│       ├── index.tsx               # Admin entry point
│       ├── pluginId.ts             # Plugin ID sabiti
│       ├── pages/
│       │   └── AuditLogPage.tsx    # Ana UI bileşeni
│       └── translations/
│           ├── en.json             # İngilizce çeviriler
│           └── tr.json             # Türkçe çeviriler
└── server/
    └── src/
        ├── index.ts                # Server entry point
        ├── bootstrap.ts            # RBAC permission kaydı
        ├── routes/
        │   └── index.ts            # Admin-type route tanımları
        ├── controllers/
        │   ├── index.ts
        │   └── audit-viewer.ts     # HTTP handler'lar
        ├── services/
        │   ├── index.ts
        │   └── audit-viewer.ts     # DB query logic
        └── policies/
            ├── index.ts
            └── is-super-admin.ts   # SuperAdmin policy

```

### Veri Akışı

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Strapi Admin   │────▶│  Plugin Routes   │────▶│  Plugin Service     │
│  (React UI)     │     │  (type: admin)   │     │  (Knex queries)     │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
        ▲                       │                          │
        │                       ▼                          ▼
        │               ┌──────────────────┐     ┌─────────────────────┐
        │               │  SuperAdmin      │     │  PostgreSQL         │
        │               │  Policy Check    │     │  audit.audit_log    │
        │               └──────────────────┘     └─────────────────────┘
        │                                                  │
        └──────────────────────────────────────────────────┘
                        JSON Response
```

---

## Server Tarafı

### Routes (`server/src/routes/index.ts`)

Tüm route'lar `type: 'admin'` olarak tanımlanmıştır - yalnızca Admin Panel üzerinden erişilebilir.

| Method | Path | Handler | Açıklama |
|--------|------|---------|----------|
| GET | `/logs` | `findMany` | Sayfalı log listesi |
| GET | `/logs/:id` | `findOne` | Tekil log detayı |
| GET | `/actions` | `getActions` | Action dropdown listesi |
| GET | `/stats` | `getStats` | 7 günlük istatistikler |
| GET | `/export` | `exportCsv` | CSV export |

### Policies

Her route iki policy ile korunur:

1. **`admin::isAuthenticatedAdmin`** - Strapi built-in admin auth
2. **`plugin::audit-viewer.is-super-admin`** - Özel SuperAdmin kontrolü

```typescript
// is-super-admin.ts
const isSuperAdmin = admin.roles?.some(
  (role: any) => role.code === 'strapi-super-admin' || role.name === 'Super Admin'
);
```

### Service (`server/src/services/audit-viewer.ts`)

#### Query Kısıtlamaları

```typescript
const MAX_PAGE_SIZE = 100;        // Sayfa başına maksimum kayıt
const DEFAULT_PAGE_SIZE = 25;     // Varsayılan sayfa boyutu
const MAX_DATE_RANGE_DAYS = 31;   // UI sorgusu için max tarih aralığı
const MAX_EXPORT_DAYS = 90;       // Export için max tarih aralığı
```

#### Desteklenen Filtreler (Whitelist)

```typescript
const ALLOWED_FILTERS = new Set([
  'action',
  'result',
  'actor_type',
  'actor_id',
  'target_type',
  'target_id',
  'request_id',
]);
```

#### Audit Actions

```typescript
const AUDIT_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAIL_BUCKETED',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET_CONFIRM',
  'EMAIL_VERIFY',
  'PROFILE_PUBLISH',
  'PROFILE_UNPUBLISH',
  'PROFILE_UPDATE_SENSITIVE',
  'ROLE_CHANGED',
  'PERMISSION_CHANGED',
  'DELETE_REQUESTED',
  'DELETE_CONFIRMED',
  'ANONYMIZED',
  'PURGED',
  'ADMIN_IMPERSONATION',
  'ADMIN_BULK_UPDATE',
];
```

#### Audit Log Entegrasyonu

Aşağıdaki olaylar otomatik olarak audit log'a yazılır:

| Olay | Fonksiyon | Tetiklendiği Dosya | Açıklama |
|------|-----------|-------------------|----------|
| Başarılı login | `auditLoginSuccess()` | `strapi-server.ts` | Kullanıcı başarıyla giriş yaptığında |
| Başarısız login (yanlış şifre) | `auditLoginFail()` | `strapi-server.ts` | Geçersiz credentials |
| Silinmiş hesap login denemesi | `auditLoginFail()` | `strapi-server.ts` | reason: `ACCOUNT_DELETED` |
| Doğrulanmamış hesap login | `auditLoginFail()` | `strapi-server.ts` | reason: `UNCONFIRMED` |
| Şifre sıfırlama isteği | `auditPasswordResetRequest()` | `strapi-server.ts` | Forgot password çağrıldığında |
| Şifre sıfırlama onayı | `auditPasswordResetConfirm()` | `strapi-server.ts` | Şifre başarıyla değiştiğinde |
| Email doğrulama | `auditEmailVerify()` | `custom.ts` | Email verify edildiğinde |
| Hesap silme isteği | `auditAccountDeletion()` | `account.ts` | action: `DELETE_REQUESTED` |
| Hesap silme onayı | `auditAccountDeletion()` | `account.ts` | action: `DELETE_CONFIRMED` |
| Kullanıcı anonimleştirme | `auditAccountDeletion()` | `account.ts` | action: `ANONYMIZED` |

**Audit Utility Fonksiyonları** (`src/utils/audit.ts`):

```typescript
// Login olayları
auditLoginSuccess(strapi, ctx, userId, { method: 'local' })
auditLoginFail(strapi, ctx, identifier, reasonCode)

// Password reset
auditPasswordResetRequest(strapi, ctx, userId?)
auditPasswordResetConfirm(strapi, ctx, userId)

// Email verification
auditEmailVerify(strapi, ctx, userId)

// Profile olayları
auditProfilePublish(strapi, ctx, { actorId, targetType, targetId, isPublish })

// Role değişikliği
auditRoleChange(strapi, ctx, { actorId, targetUserId, fromRoleId, toRoleId })

// Hesap silme
auditAccountDeletion(strapi, ctx, { action, actorId, targetUserId, reason })
```

#### DB Sorgulama

Plugin, Strapi CT (Content Type) kullanmaz. Doğrudan Knex ile PostgreSQL sorgusu yapar:

```typescript
const knex = strapi.db.connection;

// Hot view üzerinden sorgulama (son 90 gün)
const data = await knex('audit.audit_log_hot')
  .select([...])
  .where('ts', '>=', fromDate)
  .where('ts', '<=', toDate)
  .orderBy('ts', 'desc')
  .limit(pageSize)
  .offset(offset);
```

#### PII Koruması

`sanitizeRow` fonksiyonu hassas verileri filtreler:

```typescript
sanitizeRow(row: any): AuditRow {
  return {
    id: row.id,
    ts: row.ts,
    actor_type: row.actor_type,
    actor_id: row.actor_id,
    action: row.action,
    result: row.result,
    reason_code: row.reason_code,
    target_type: row.target_type,
    target_id: row.target_id,
    request_id: row.request_id,
    ua: row.ua ? row.ua.substring(0, 100) : null, // UA truncate
    meta: row.meta || {},
    // ip_hash ve sig gösterilmiyor (güvenlik)
  };
}
```

### Bootstrap (`server/src/bootstrap.ts`)

Plugin yüklendiğinde RBAC permission'ları kaydeder:

```typescript
const actions = [
  {
    section: 'plugins',
    displayName: 'View Audit Logs',
    uid: 'read',
    pluginName: 'audit-viewer',
  },
  {
    section: 'plugins',
    displayName: 'Export Audit Logs',
    uid: 'export',
    pluginName: 'audit-viewer',
  },
];

await strapi.admin?.services?.permission?.actionProvider?.registerMany(actions);
```

---

## Admin Tarafı

### Entry Point (`admin/src/index.tsx`)

Strapi 5 API kullanarak plugin kaydı ve menü linki ekleme:

```typescript
import { PLUGIN_ID } from './pluginId';
import { AuditLogPage } from './pages/AuditLogPage';

// Basit icon (SVG sorunlarından kaçınmak için emoji)
const PluginIcon = () => '📋';

export default {
  register(app: any) {
    // Menü linki ve Component birlikte tanımlanır
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: 'Audit Logs',
      },
      permissions: [
        { action: `plugin::${PLUGIN_ID}.read`, subject: null },
      ],
      Component: AuditLogPage,
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      name: 'Audit Viewer',
    });
  },

  bootstrap() {},

  async registerTrads({ locales }: { locales: string[] }) {
    // Çeviri dosyalarını yükle
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);
          return { data, locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};
```

**Önemli Notlar**:
- `Component` doğrudan `addMenuLink` içinde tanımlanır (lazy loading yerine)
- Icon olarak emoji kullanılır (SVG import sorunlarından kaçınmak için)
- `bootstrap()` boş bırakılır (route'lar `addMenuLink` içinde tanımlandığı için)

### Strapi 5 Import Kuralları

**Doğru (Strapi 5)**:
```typescript
import { useFetchClient } from '@strapi/strapi/admin';
```

**Yanlış (Strapi 4)**:
```typescript
// import { useFetchClient } from '@strapi/helper-plugin'; // KULLANMA
```

### AuditLogPage Bileşeni

#### Özellikler

1. **İstatistik Kartları**
   - Toplam kayıt (7 gün)
   - Başarılı işlemler
   - Başarısız işlemler
   - En sık action

2. **Filtreler**
   - Tarih aralığı (from/to)
   - Action dropdown
   - Result select (success/fail)

3. **Tablo**
   - Timestamp
   - Action (Badge)
   - Result (Renkli badge)
   - Actor (type + id)
   - Target (type + id)
   - Request ID (kısaltılmış)
   - Detail butonu

4. **Pagination**
   - Sayfa navigasyonu
   - Toplam kayıt gösterimi

5. **Detay Modal**
   - Tüm log alanları
   - Meta JSON pretty view
   - User Agent

6. **CSV Export**
   - Filtrelere göre export
   - Otomatik dosya adı (tarih bazlı)

#### API Çağrıları

```typescript
const { get } = useFetchClient();

// Log listesi
const response = await get(`/${PLUGIN_ID}/logs?page=1&pageSize=25&from=...&to=...`);

// İstatistikler
const response = await get(`/${PLUGIN_ID}/stats`);

// Actions listesi
const response = await get(`/${PLUGIN_ID}/actions`);

// CSV Export
const response = await get(`/${PLUGIN_ID}/export?from=...&to=...`);
```

---

## Kurulum ve Yapılandırma

### Plugin Config (`apps/cms/config/plugins.ts`)

```typescript
'audit-viewer': {
  enabled: true,
},
```

### Workspace Dependency (`apps/cms/package.json`)

```json
{
  "dependencies": {
    "strapi-plugin-audit-viewer": "workspace:*"
  }
}
```

### Build Komutları

```bash
# Plugin build
cd packages/strapi-plugin-audit-viewer
pnpm build

# Strapi build
cd apps/cms
pnpm build

# Development
cd apps/cms
pnpm develop
```

---

## Veritabanı Gereksinimleri

Plugin, mevcut audit schema'yı kullanır:

### Gerekli Tablo/View

```sql
-- Ana partition'lı tablo
audit.audit_log

-- Hot view (son 90 gün) - UI sorguları için
audit.audit_log_hot
```

### Beklenen Kolonlar

```sql
id            BIGSERIAL
ts            TIMESTAMPTZ
actor_type    TEXT
actor_id      BIGINT
action        TEXT
result        TEXT
reason_code   TEXT
target_type   TEXT
target_id     BIGINT
request_id    UUID
ip_hash       BYTEA     -- UI'da gösterilmez
ua            TEXT
meta          JSONB
sig           BYTEA     -- UI'da gösterilmez
```

---

## Güvenlik

### Erişim Kontrolü

1. **Route Level**: `admin::isAuthenticatedAdmin` + `is-super-admin` policy
2. **UI Level**: RBAC permission kontrolü (`plugin::audit-viewer.read`)
3. **Data Level**: PII scrubbing (ip_hash, sig gösterilmez)

### Rate Limiting

- Export için max 10,000 kayıt limiti
- Tarih aralığı limitleri (UI: 31 gün, Export: 90 gün)
- Page size limiti (max 100)

### Input Validation

- Tüm filtreler whitelist ile kontrol edilir
- SQL injection koruması (Knex parameterized queries)
- Request ID UUID formatı kontrolü

---

## Sorun Giderme

### Plugin Menüde Görünmüyor

1. Plugin build edildi mi kontrol et:
   ```bash
   cd packages/strapi-plugin-audit-viewer
   ls -la dist/
   ```

2. Strapi rebuild:
   ```bash
   cd apps/cms
   rm -rf .cache dist
   pnpm build
   ```

3. SuperAdmin ile giriş yaptığından emin ol

### "Invalid hook call" Hatası

Bu hata genellikle React'in birden fazla kopyasının yüklenmesinden kaynaklanır.

**Çözüm**: Plugin'in `package.json`'ında React ve Design System `dependencies` yerine `peerDependencies` olarak tanımlanmalıdır:

```json
{
  "peerDependencies": {
    "@strapi/design-system": "^2.0.0-rc.0",
    "@strapi/icons": "^2.0.0-rc.0",
    "@strapi/strapi": "^5.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-router-dom": "^6.0.0",
    "styled-components": "^6.0.0"
  }
}
```

**Neden**: `peerDependencies` kullanıldığında plugin, Strapi'nin React instance'ını kullanır. `dependencies` olarak tanımlanırsa, plugin kendi React kopyasını getirir ve "Invalid hook call" hatasına yol açar.

Düzeltme sonrası:
```bash
cd packages/strapi-plugin-audit-viewer
rm -rf node_modules dist
cd /path/to/project
pnpm install
cd packages/strapi-plugin-audit-viewer
pnpm build
cd apps/cms
rm -rf .cache
pnpm build
```

### Beyaz Ekran / Admin Panel Açılmıyor

1. Tarayıcı DevTools > Console'u kontrol et
2. "Invalid hook call" hatası varsa yukarıdaki çözümü uygula
3. Network sekmesinde 500/403 hataları kontrol et

### API 403 Hatası

- SuperAdmin rolüne sahip olduğundan emin ol
- RBAC permissions kontrol et (Settings > Roles)

### Boş Tablo

- `audit.audit_log_hot` view'ının var olduğunu kontrol et
- Tarih filtresinin doğru olduğunu kontrol et
- PostgreSQL bağlantısını kontrol et

---

## Geliştirme

### Watch Mode

```bash
# Terminal 1: Plugin watch
cd packages/strapi-plugin-audit-viewer
pnpm watch

# Terminal 2: Strapi develop
cd apps/cms
pnpm develop
```

### Yeni Özellik Ekleme

1. Server'da yeni route/handler ekle
2. Service'e business logic ekle
3. Admin UI'da bileşen güncelle
4. Plugin rebuild + Strapi rebuild

---

## Plugin package.json Yapısı

**Kritik**: React ve Strapi Design System `peerDependencies` olarak tanımlanmalıdır:

```json
{
  "name": "strapi-plugin-audit-viewer",
  "version": "1.0.0",
  "strapi": {
    "displayName": "Audit Log Viewer",
    "name": "audit-viewer",
    "kind": "plugin"
  },
  "devDependencies": {
    "@strapi/sdk-plugin": "^5.2.6",
    "@strapi/strapi": "^5.0.0",
    "@strapi/types": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "typescript": "^5.0.0"
  },
  "peerDependencies": {
    "@strapi/design-system": "^2.0.0-rc.0",
    "@strapi/icons": "^2.0.0-rc.0",
    "@strapi/strapi": "^5.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-router-dom": "^6.0.0",
    "styled-components": "^6.0.0"
  }
}
```

**Önemli**:
- `dependencies` bölümünde React veya Design System **olmamalı**
- Tüm UI bağımlılıkları `peerDependencies` altında olmalı
- Bu yapı, plugin'in Strapi'nin React instance'ını kullanmasını sağlar

---

## Versiyon Bilgisi

| Bileşen | Versiyon |
|---------|----------|
| Plugin | 1.0.0 |
| Strapi | 5.27.0 |
| @strapi/design-system | ^2.0.0-rc.0 (peer) |
| @strapi/icons | ^2.0.0-rc.0 (peer) |
| Node.js | >=18.0.0 <=22.x.x |

---

## İlgili Dosyalar

### Audit Logging

| Dosya | Açıklama |
|-------|----------|
| `src/utils/audit.ts` | Ana audit utility fonksiyonları |
| `src/middlewares/request-context.ts` | IP hash, request ID extraction |
| `src/extensions/users-permissions/strapi-server.ts` | Login/logout audit hook'ları |
| `src/api/auth/controllers/custom.ts` | Email verify audit |
| `src/api/account/controllers/account.ts` | Account deletion audit |
| `config/cron.ts` | Bucket flush ve partition management |

### Database

| Dosya | Açıklama |
|-------|----------|
| `database/migrations/001_audit_schema.sql` | Audit schema ve tablolar |
| `database/migrations/002_user_soft_delete.sql` | Soft delete alanları |

---

## İlgili Dokümanlar

- [Audit & Soft Delete Sistemi](./AUDIT_SOFT_DELETE.md)
- [Strapi 5 Plugin Development](https://docs.strapi.io/dev-docs/plugins/development/create-a-plugin)
- [Strapi Admin Panel API](https://docs.strapi.io/dev-docs/admin-panel-api)

