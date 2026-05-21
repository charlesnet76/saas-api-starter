# saas-api-starter

Production-ready REST API starter for SaaS applications. Built with security-first decisions that junior developers typically skip.

## Stack

- **Runtime**: Node.js 20 + Express
- **Database**: PostgreSQL 15
- **Auth**: JWT access tokens (15min) + opaque refresh token rotation
- **Security**: bcrypt (12 rounds), Helmet, CORS, rate limiting, secrets scanning
- **DevOps**: Docker multi-stage build, Docker Compose, GitHub Actions CI/CD
- **Logging**: Winston structured JSON logs

## Security decisions

| Decision | Why |
|----------|-----|
| bcrypt runs even for nonexistent users | Prevents user enumeration via timing attacks |
| Opaque refresh tokens stored in DB | Revocable, rotated on every use — stolen tokens can't be reused |
| 15-minute access token expiry | Limits blast radius if a token leaks |
| Non-root Docker container | Limits container escape impact |
| Secrets scanning in CI | Catches leaked keys before they hit production |

## API endpoints

```
POST /api/auth/register   — create account
POST /api/auth/login      — get access + refresh tokens
POST /api/auth/refresh    — rotate refresh token, get new access token
POST /api/auth/logout     — revoke refresh token

GET  /api/users/me        — get own profile (authenticated)
GET  /api/users           — list all users (admin only)
DELETE /api/users/:id     — soft delete user (admin only)

GET  /health              — health check
```

## Quick start

**With Docker Compose (recommended):**

```bash
git clone https://github.com/charlesnet76/saas-api-starter.git
cd saas-api-starter
cp .env.example .env
docker compose up
```

API available at `http://localhost:3000`

**Without Docker:**

```bash
npm install
cp .env.example .env
# Edit .env with your PostgreSQL connection string
npm run dev
```

## Environment variables

See `.env.example` for all required variables. Never commit `.env` to git.

## Extending this starter

Common additions:
- Email verification flow
- Password reset via token
- Stripe subscription integration
- Audit log table
- Multi-tenancy via `org_id` on users table

## License

MIT
