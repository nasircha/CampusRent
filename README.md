# CampusRent — full-stack implementation

CampusRent keeps the original black-and-yellow HTML/CSS interface and uses a Node.js/Express API with PostgreSQL (Prisma ORM). The browser no longer stores users, listings, or rental requests as application data. All shared marketplace data is stored in PostgreSQL.

## Included

- Existing browse page, category filters, search, sorting, item details, dialogs, and My Space dashboard.
- Registration and login with bcrypt password hashing and signed JWT sessions.
- PostgreSQL-backed users, listings, and rental requests.
- Image uploads (JPEG, PNG, WebP, GIF; 5 MB default) stored in `uploads/`.
- Listing pause/resume/delete, rental request, accept/decline/cancel, and mark returned.
- Owner-only and renter-only authorization checks on mutations.
- Transactional accept/return flows to avoid accepting two pending requests for the same item.
- API rate limiting on auth routes, Helmet security headers, input validation, and server-side price calculation.
- No auto-approved demo listings or fake users.

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL 14 or newer, or Docker Desktop

## Run locally (Docker PostgreSQL)

1. Open a terminal in this project directory.
2. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

3. Create your environment file:

   ```bash
   cp .env.example .env
   ```

   Set `JWT_SECRET` to a random secret of at least 32 characters. For example, generate one with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   The `.env.example` database URL matches the included Docker Compose database defaults.

4. Install dependencies and create the database tables:

   ```bash
   npm install
   npx prisma generate
   npx prisma migrate dev --name init
   ```

5. Start CampusRent:

   ```bash
   npm run dev
   ```

   On Windows, run these commands in PowerShell from the `campusrent` folder. Make sure Docker Desktop is running before starting the database.

6. Open **http://localhost:3000**. Create two accounts in separate browsers (or one normal and one private window) to test the renter and owner flows.

For a locally installed PostgreSQL server instead of Docker, create a database named `campusrent` and update `DATABASE_URL` in `.env`.

## Production deployment

1. Provision PostgreSQL and set `DATABASE_URL` to its connection string.
2. Set `JWT_SECRET` to a unique random secret (32+ characters), `NODE_ENV=production`, and `PORT` if required by your host.
3. Deploy the Node project and run `npx prisma migrate deploy` as the release/deploy command.
4. Ensure the `uploads/` directory is on persistent storage. The included local upload adapter writes to disk; ephemeral server filesystems will lose photos on redeploy. For horizontally scaled hosting, replace this adapter with S3, Cloudinary, or another shared object store.
5. Use HTTPS. If the frontend is hosted on a different origin, set `CORS_ORIGIN` to the exact frontend origin(s), comma-separated.

The easiest deployment is to serve the included `public/` frontend and API from the same Node service. The server already serves `public/index.html` and `/uploads/*`.

## API reference

All request and response bodies are JSON except `POST /api/items`, which uses `multipart/form-data`. Authenticated routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | API/database health |
| GET | `/api/bootstrap` | Public + optional token | Current user, visible listings, and the signed-in user's rentals |
| POST | `/api/auth/register` | Public | Create account; returns token and user |
| POST | `/api/auth/login` | Public | Sign in; returns token and user |
| POST | `/api/auth/logout` | Public | Stateless logout acknowledgement (client discards token) |
| GET | `/api/auth/me` | Signed in | Current user |
| GET | `/api/items` | Public | Available and rented listings |
| GET | `/api/items/:id` | Public | Listing detail |
| POST | `/api/items` | Signed in | Create listing with optional image upload |
| PATCH | `/api/items/:id/status` | Owner | Pause/resume listing |
| DELETE | `/api/items/:id` | Owner | Delete listing (retains history as hidden record if rentals exist) |
| POST | `/api/rentals` | Signed in | Request to rent an available item |
| PATCH | `/api/rentals/:id/accept` | Owner | Accept request and mark item rented; other pending requests are declined |
| PATCH | `/api/rentals/:id/decline` | Owner | Decline request |
| PATCH | `/api/rentals/:id/cancel` | Renter | Cancel pending request |
| PATCH | `/api/rentals/:id/return` | Owner | Mark accepted rental returned and make item available |

## Important implementation notes

- Passwords are hashed on the server with bcrypt (12 rounds); plaintext passwords are never stored.
- The browser stores only the JWT in local storage. For a higher-security production deployment, consider migrating to secure, HttpOnly, SameSite cookies plus CSRF protection.
- Rent and deposit are recalculated by the API from the listing's stored price; the client cannot set the amount.
- This project records rental workflow and amounts, but does not collect payments, hold deposits, or provide dispute resolution. Students settle payment directly at handover, as the original interface describes.
- Rental dates are stored and displayed, but this initial implementation treats an accepted rental as occupying the item until the owner marks it returned. It does not yet implement a calendar of future overlapping reservations.
- Add email verification, password reset, moderation/reporting, notification delivery, and an object-storage provider before a public production launch.

## Project layout

```text
campusrent/
├── prisma/schema.prisma
├── public/index.html          # Original design with API-powered frontend logic
├── src/
│   ├── middleware/auth.js
│   ├── routes/auth.js
│   ├── routes/bootstrap.js
│   ├── routes/items.js
│   ├── routes/rentals.js
│   ├── db.js
│   └── server.js
├── uploads/                   # Uploaded item photos (persistent volume in production)
├── .env.example
├── docker-compose.yml
└── package.json
```
