# Addis POS

Multi-tenant point of sale and inventory SaaS for Ethiopian grocery shops and restaurants.
Each shop picks a **business mode** at signup:

- **Grocery**: barcode scanning, items sold by weight (kg), pay at the counter.
- **Restaurant**: tables, waiters, open orders that are paid later.

Both modes share products, stock, payments, shifts, credit, refunds, suppliers and purchases.

## Stack

- Next.js (App Router) + TypeScript + Tailwind, installable as a PWA with offline POS (planned)
- PostgreSQL via Prisma, every table scoped by `tenantId`
- Chapa for Telebirr / CBE Birr / card payments (planned)
- English and Amharic UI, prices in ETB

## Run it on your computer (Windows, step by step)

You need [Node.js](https://nodejs.org) (LTS, version 20 or newer) and [Git](https://git-scm.com).
Open **Command Prompt** or **PowerShell** in the folder where you keep your projects.

**1. Get the code**

```
git clone https://github.com/Mukman/restaurant_managment.git
cd restaurant_managment
```

**2. Create your settings file.** The app will not start without it.

```
copy .env.example .env
notepad .env
```

(PowerShell: `Copy-Item .env.example .env`.) Notepad opens the file. Fill in two lines:

- `DATABASE_URL`: your Supabase **Session pooler** connection string (Supabase project > Connect > Session pooler).
  If your password contains special characters, write them URL-encoded (`@` becomes `%40`).
- `AUTH_SECRET`: a long random text used to sign logins. **This is required.** Create one by running this
  in the terminal, then copy the output into the file between the quotes:

  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

Save the file. It is listed in `.gitignore`, so it is never uploaded to GitHub. Keep it private.

**3. Install and create the tables**

```
npm install
npx prisma migrate deploy
```

`npm install` also runs `prisma generate` for you. Run `npx prisma migrate deploy` again whenever a new version
adds a migration (the release notes will say so).

**4. Start the app**

```
npm run dev
```

Open <http://localhost:3000/signup> and create your shop.

**Updating later:** `git pull`, then `npm install`, then `npx prisma migrate deploy`, then `npm run dev`.

### If something goes wrong

| What you see | What to do |
| --- | --- |
| `AUTH_SECRET is missing or too short` | Add `AUTH_SECRET` to `.env` (step 2) and restart `npm run dev`. |
| `Can't reach database server` | Use the **Session pooler** address, not the direct `db.<ref>.supabase.co` one (it only works over IPv6). |
| `@prisma/client did not initialize yet` | Run `npx prisma generate`. |
| `Environment variable not found: DATABASE_URL` | The `.env` file is missing or is in the wrong folder (it belongs next to `package.json`). |
| Password rejected | Check URL-encoding of special characters in the password. |

## Tests

Tests create shops, users and sales, so they must **never** run against your real database. They only run
when you point `TEST_DATABASE_URL` at a separate, throwaway Postgres database (a local one, or a second
Supabase project), and they refuse to start otherwise.

```
:: Command Prompt
set TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/addis_test&& npm test
```

```
# PowerShell
$env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/addis_test"; npm test
```

`npm test` first creates or updates the tables in that test database, then runs the tests.

## Conventions

- Money is stored as integer **santim** (1 ETB = 100 santim). See `src/lib/money.ts`.
- Prices are VAT-inclusive; `vatRate` is in basis points (1500 = 15%).
- Stock quantities are `Decimal(12,3)` so weighed items work.
- Orders carry a `clientId` generated on the device so offline sales sync without duplicates. Refunds do too.

## What works now

- `/signup`: create a shop (grocery or restaurant), owner signs in with phone + PIN
- `/app/products`: add products with Amharic name, barcode, unit, sold-by-weight, opening and minimum stock
- `/app/pos`: barcode/search, categories, weighed items, discount, VAT, payment (Cash with change,
  Telebirr / CBE Birr / M-Pesa / bank with reference, card, credit to a customer), printable receipt.
  Restaurant mode adds tables, waiters, open orders, add items, pay later.
- `/app/shift`: open a shift with the cash in the till, close it with a cash count. Expected cash = opening cash
  + cash sales + cash repayments − cash refunds (mobile money and card are not cash). Owner/manager marks closed
  shifts audited or disputed. Taking payment requires an open shift.
- `/app/staff`: owner/manager adds cashiers, waiters and inventory staff (owner can also add managers), resets PINs, deactivates people
- `/app/customers`: balances owed, credit limits (set by owner/manager; a cashier's new customers start at 0),
  full credit history, and repayments (cash repayments count in the till for the shift that took them)
- `/app/orders`: completed sales; owner/manager can **refund** all or part of a sale. Each refund can put the goods
  back in stock (or not, for spoiled goods), is paid back by cash or the way the customer paid (Telebirr, CBE Birr,
  M-Pesa, bank need a reference), and a refunded credit sale lowers what the customer owes. Cash refunds come out of
  the refunding person's shift.
- `/app/purchases`: **receive stock** from a supplier (quantity, unit cost, optional expiry, optional payment now). It adds
  stock, sets the product cost to the weighted average of old and new stock, and raises what you owe the supplier.
  Retrying a submit never receives the same delivery twice.
- `/app/suppliers`: what you owe each supplier, purchase and payment history, and **pay supplier** (oldest unpaid
  purchase first, or a chosen one). Cash paid out of the till lowers that shift's expected cash. Only owner/manager can pay.
- `/app`: today's sales (after refunds), order count, low stock, credit owed, owed to suppliers, stock value at cost

## Roadmap

1. **MVP**: signup and login, products with barcodes and units, POS for both modes, stock updates on sale, shifts, VAT receipts, dashboard, EN/AM, credit, refunds, offline POS
2. **Operations**: purchases and suppliers, expiry, low-stock alerts, expenses, report exports
3. **Scale**: Telebirr/Chapa, multi-branch and transfers, subscription billing, Ethiopian calendar, audit log
4. **Extras**: AI assistant, SMS alerts
