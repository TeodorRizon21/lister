# Lister — instrucțiuni de configurare

Aplicație **Next.js 15 (App Router)**, **Clerk** (autentificare), **Prisma** pe **MongoDB**.

## 1. Clerk

1. Creează o aplicație în [Clerk Dashboard](https://dashboard.clerk.com).
2. Copiază cheile în `.env` (vezi `.env.example`): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
3. Configurează URL-urile de redirect pentru development (`http://localhost:3000`).

## 2. MongoDB

1. Creează un cluster (ex. [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) — tier gratuit e suficient pentru dev).
2. **Database Access**: utilizator cu parolă pentru aplicație.
3. **Network Access**: adaugă IP-ul tău (sau `0.0.0.0/0` doar pentru test local).
4. **Connect → Drivers**: copiază connection string-ul și înlocuiește `<password>`.
5. Adaugă numele bazei în URI dacă lipsește, ex. `...mongodb.net/lister?retryWrites=true&w=majority`.
6. Pune valoarea în `.env` ca `DATABASE_URL` (copiază din `.env.example`).

### Schema Prisma (fără migrări SQL)

MongoDB folosește `db push`, nu migrările Postgres vechi:

```bash
npm run db:push
```

`prisma generate` rulează automat la `npm install` (postinstall).

## 3. Utilizatori aplicație ↔ Clerk

- Colecția `User` folosește același id ca Clerk (`user_xxx`).
- La login, `syncUserFromAuth()` face upsert (vezi `src/lib/auth/server.ts`).
- Setează `DEFAULT_ADMIN_EMAIL` pentru primul administrator; rolul `admin` se acordă doar la creare.

## 4. Rulare

```bash
npm install
npm run db:push
npm run dev
```

## 5. Securitate

- Rutele sunt protejate în **middleware** (Clerk).
- Rolurile **admin** / **staff** se verifică pe server (`requireAdmin`, `requireStaffOrAdmin`).
- `DATABASE_URL` și `CLERK_SECRET_KEY` doar pe server / secret manager în producție.

## 6. Înscriere participanți (link public)

- Fiecare eveniment are un link: `https://domeniu/e/{slug}` (slug generat din titlu).
- În pagina evenimentului (admin) setezi **parola** și bifezi **Înscrieri deschise**.
- Participanții introduc parola, apoi formularul (clasă, nume, meniu, minor/major + acord parental).
- Duplicate blocate: același prenume + nume + clasă la același eveniment.

## 7. Note migrare Postgres → MongoDB

- ID-urile evenimentelor / participanților sunt acum **ObjectId** (24 caractere hex), nu UUID.
- Datele din Postgres **nu** se migrează automat; pornești cu o bază MongoDB goală sau imporți manual.
- Șterge `DIRECT_URL` din `.env` — nu mai e folosit.
