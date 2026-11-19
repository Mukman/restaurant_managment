# Addis POS

Multi-tenant point of sale and inventory SaaS for Ethiopian grocery shops and restaurants.
Each shop picks a **business mode** at signup:

- **Grocery**: barcode scanning, items sold by weight (kg), pay at the counter.
- **Restaurant**: tables, waiters, open orders that are paid later.

Both modes share products, stock, payments, shifts and reports.

## Stack

- Next.js (App Router) + TypeScript + Tailwind, installable as a PWA with offline POS
- PostgreSQL via Prisma, every table scoped by `tenantId`
- Chapa for Telebirr / CBE Birr / card payments (Phase 3)
- English and Amharic UI, prices in ETB

## Conventions

- Money is stored as integer **santim** (1 ETB = 100 santim). See `src/lib/money.ts`.
- Prices are VAT-inclusive; `vatRate` is in basis points (1500 = 15%).
- Stock quantities are `Decimal(12,3)` so weighed items work.
- Orders carry a `clientId` generated on the device so offline sales sync without duplicates.

## Getting started

```bash
cp .env.example .env   # set DATABASE_URL
npm install
npx prisma migrate dev
npm run dev
```

## Roadmap

1. **MVP**: signup and login, products with barcodes and units, POS for both modes, stock updates on sale, shift open/close with cash count, VAT receipts, dashboard, EN/AM, offline POS
2. **Operations**: purchases and suppliers, expiry, low-stock alerts, credit customers, returns, expenses, report exports
3. **Scale**: Telebirr/Chapa, multi-branch and transfers, subscription billing, Ethiopian calendar, audit log
4. **Extras**: AI assistant, SMS alerts
