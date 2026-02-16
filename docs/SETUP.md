# Project Setup

Complete guide for environment variables, authentication, secrets management, and Convex configuration. For server infrastructure and deployment, see [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Environment Variables

### Complete Reference

| Variable | Purpose | Used By | Required |
|----------|---------|---------|----------|
| `CONVEX_DEPLOYMENT` | Convex deployment ID | Convex CLI | Yes |
| `CONVEX_DEPLOY_KEY` | Deploy key for production pushes | CI/CD | Yes (production) |
| `CONVEX_SITE_URL` | Convex HTTP actions URL (OAuth callback domain) | Convex Auth | Yes |
| `NEXT_PUBLIC_CONVEX_URL` | Convex API endpoint (baked into client bundle) | Next.js | Yes |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Convex site URL (public) | Next.js | Yes |
| `AUTH_SECRET` | Session token signing secret | Convex Auth | Yes |
| `AUTH_URL` | Auth callback URL (e.g. `http://localhost:3000`) | Convex Auth | Yes |
| `GITHUB_ID` | GitHub OAuth App client ID | Convex Auth | Yes |
| `GITHUB_SECRET` | GitHub OAuth App client secret | Convex Auth | Yes |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | Convex actions | Yes (for AI) |
| `CHYSTAT_API_TOKEN` | chy.stat API Bearer token | MCP server | Yes (for queries) |
| `MCP_SERVER_URL` | MCP server endpoint | Convex actions | No (default: `http://localhost:3001/mcp`) |
| `MCP_AUTH_TOKEN` | Shared secret for MCP server auth | Convex + MCP server | Yes (production) |
| `MCP_PORT` | MCP server HTTP port | MCP server | No (default: `3001`) |

### Secrets Inventory

Secrets live in different places depending on who needs them:

| Secret | Where it lives | Who uses it |
|---|---|---|
| `CHYSTAT_API_TOKEN` | `.env.production` on server | MCP server -> chy.stat API |
| `MCP_AUTH_TOKEN` | `.env.production` on server + Convex env vars (prod) | Convex action -> MCP server auth |
| `ANTHROPIC_API_KEY` | Convex env vars (both deployments) | Convex action -> Claude API |
| `AUTH_SECRET` | Convex env vars (both deployments) | Convex Auth session encryption |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | Convex env vars (per deployment) | Convex Auth GitHub OAuth |
| `SITE_URL` | Convex env vars (per deployment) | Post-OAuth redirect target |
| `NEXT_PUBLIC_CONVEX_URL` | Docker build arg (in compose) | Baked into Next.js client bundle |
| `HETZNER_HOST` / `HETZNER_USER` / `HETZNER_SSH_KEY` | GitHub Secrets | CI/CD SSH deployment |
| `CONVEX_PROD_DEPLOY_KEY` | GitHub Secrets | CI/CD Convex function deployment |

**Summary:**

- **`.env.local`** (local dev): All variables for local development, encrypted with dotenvx.
- **`.env.production`** (on server): Only secrets Docker containers need directly (`CHYSTAT_API_TOKEN`, `MCP_AUTH_TOKEN`, `NEXT_PUBLIC_CONVEX_URL`).
- **Convex dashboard**: `ANTHROPIC_API_KEY`, `MCP_SERVER_URL`, `MCP_AUTH_TOKEN`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `SITE_URL`.
- **GitHub Secrets**: SSH credentials + Convex prod deploy key.
- **Never committed to git**: All of the above.

---

## dotenvx Encryption

This project uses **dotenvx** for encrypted environment variable management.

### File Structure

```
.env.local        -> Encrypted environment variables (git-ignored, single source of truth for dev)
.env.keys         -> Private decryption keys (NEVER commit)
.env              -> Encrypted environment variables (committed to repo)
```

### How It Works

Secrets are encrypted with a public key and can only be decrypted with the matching private key in `.env.keys`. At runtime, `dotenvx` transparently decrypts values.

### Adding / Editing Variables

```bash
# 1. Decrypt
npx dotenvx decrypt -f .env.local

# 2. Edit the file (add/change variables)

# 3. Re-encrypt
npx dotenvx encrypt -f .env.local
```

### Commands Reference

```bash
npx dotenvx encrypt -f .env.local       # Encrypt a file
npx dotenvx decrypt -f .env.local       # Decrypt a file
npx dotenvx run -- <command>             # Run with decryption
npx dotenvx prebuild                     # For Docker builds
npx dotenvx get NEXT_PUBLIC_CONVEX_URL   # View a single value
npx dotenvx ops backup                   # Backup keys
```

### Backup Your Private Key

If you lose `.env.keys`, you cannot decrypt `.env.local`. Back it up in a secure password manager or use `npx dotenvx ops backup`.

### Security Best Practices

- Keep `.env.keys` in `.gitignore` (already configured)
- Share private keys through secure channels only (password managers, encrypted messages)
- Use different keys for production/staging
- Never commit `.env.keys` or share keys via email, Slack, or plaintext channels

---

## Authentication

### Overview

The project uses **Convex Auth** (`@convex-dev/auth`) with GitHub OAuth. The entire OAuth exchange happens server-side within Convex.

```
User --> GitHub OAuth --> Convex Auth (HTTP routes) --> Convex DB
                                  |
                                  v
                          Session/JWT token
                                  |
                    +-------------+---------------+
                    v                             v
             Next.js Middleware            Convex Functions
          (convexAuthNextjsMiddleware)    (getAuthUserId)
```

### Key Files

**Server-side (Convex backend):**

- **`convex/auth.ts`** -- Auth entry point. Configures GitHub provider with 1-week session duration.
- **`convex/auth.config.ts`** -- JWT verification config. Points to `CONVEX_SITE_URL` domain.
- **`convex/http.ts`** -- Mounts OAuth callback routes on Convex HTTP router.
- **`convex/schema.ts`** -- Adds auth tables (`users`, `authAccounts`, `authSessions`, `authRefreshTokens`, `authVerificationCodes`).

**Client-side (Next.js):**

- **`apps/web/src/app/layout.tsx`** -- Provider hierarchy (`ConvexAuthNextjsServerProvider`).
- **`apps/web/src/providers/convex-provider.tsx`** -- Client provider (`ConvexAuthNextjsProvider`).
- **`apps/web/src/middleware.ts`** -- Route protection. Blocks unauthenticated access to `/chat/*`, redirects to `/auth/signin`.
- **`apps/web/src/components/auth/sign-in-card.tsx`** -- Sign-in UI. Calls `signIn("github")`.

### Complete Flow

1. **User clicks "Continue with GitHub"** -- `SignInCard` calls `signIn("github")` from `@convex-dev/auth/react`.
2. **GitHub OAuth** -- User is redirected to GitHub, authorizes the app, GitHub redirects back to the Convex HTTP callback route.
3. **Convex Auth processes the callback** -- Exchanges authorization code for tokens, creates/updates records in `users`, `authAccounts`, `authSessions`, issues a JWT session token.
4. **Session available throughout the app:**
   - Next.js middleware validates the token and protects routes
   - Convex functions use `getAuthUserId(ctx)` for auth checks
   - React components use `useAuthActions()` for `signIn`/`signOut`

### Auth Checks in Convex Functions

Every Convex query/mutation/action that needs auth uses:

```typescript
import { getAuthUserId } from "@convex-dev/auth/server";

const userId = await getAuthUserId(ctx);
if (!userId) return { success: false, error: "Not authenticated" };
```

Used in: `convex/ai.ts`, `convex/chats.ts`, `convex/messages.ts`, `convex/users.ts`.

### Security Features

- **Server-side OAuth flow**: The entire OAuth exchange happens on the Convex backend, not in the browser.
- **JWT session tokens**: Signed with `AUTH_SECRET`, validated by Convex Auth middleware.
- **Session expiry**: Sessions expire after 1 week (`totalDurationMs` in `convex/auth.ts`).
- **Route protection**: Next.js middleware blocks unauthenticated access to `/chat/*`.
- **Function-level auth**: Every Convex function checks `getAuthUserId()` independently.

### GitHub OAuth App Setup

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Configure:
   - **Application name**: CHQL Chat (or CHQL Chat DEV for development)
   - **Homepage URL**: `http://localhost:3000` (dev) or your production URL
   - **Authorization callback URL**: Your `CONVEX_SITE_URL` value (the Convex HTTP endpoint, NOT localhost)
4. Get Client ID and Client Secret
5. Add to `.env.local` (then re-encrypt)

The project uses **two separate GitHub OAuth Apps** -- one for dev, one for production. Each points to a different Convex deployment's callback URL. See [DEPLOYMENT.md](./DEPLOYMENT.md) for production-specific values.

> **Important:** In the Convex dashboard, the env var names must use the `AUTH_` prefix: `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`. The local `.env.local` uses `GITHUB_ID` / `GITHUB_SECRET` (without prefix).

---

## Convex Environment Variables

Convex actions run on Convex's cloud infrastructure (not locally or on your server). They need their own copy of certain secrets. Each deployment (dev and prod) has its own set.

### Development deployment (`dev:qualified-malamute-653`)

Set via the CLI (targets the deployment in `.env` by default):

```bash
npx convex env set SITE_URL http://localhost:3000
npx convex env set AUTH_GITHUB_ID <dev-github-oauth-id>
npx convex env set AUTH_GITHUB_SECRET <dev-github-oauth-secret>
npx convex env set AUTH_SECRET <your-auth-secret>
npx convex env set ANTHROPIC_API_KEY <your-anthropic-key>
npx convex env set MCP_SERVER_URL https://mcp.azacios.cz/mcp
npx convex env set MCP_AUTH_TOKEN <your-mcp-token>
```

### Production deployment (`pleasant-cheetah-909`)

Set via the Convex dashboard or CLI with `--url`:

```bash
npx convex env set SITE_URL https://chql.azacios.cz --url https://pleasant-cheetah-909.eu-west-1.convex.cloud
npx convex env set AUTH_GITHUB_ID <prod-github-oauth-id> --url https://pleasant-cheetah-909.eu-west-1.convex.cloud
npx convex env set AUTH_GITHUB_SECRET <prod-github-oauth-secret> --url https://pleasant-cheetah-909.eu-west-1.convex.cloud
npx convex env set AUTH_SECRET <your-auth-secret> --url https://pleasant-cheetah-909.eu-west-1.convex.cloud
npx convex env set ANTHROPIC_API_KEY <your-anthropic-key> --url https://pleasant-cheetah-909.eu-west-1.convex.cloud
npx convex env set MCP_SERVER_URL https://mcp.azacios.cz/mcp --url https://pleasant-cheetah-909.eu-west-1.convex.cloud
npx convex env set MCP_AUTH_TOKEN <same-value-as-on-server> --url https://pleasant-cheetah-909.eu-west-1.convex.cloud
```

### Dual Environment Overview

| | Development | Production |
|---|---|---|
| **Convex deployment** | `dev:qualified-malamute-653` | `pleasant-cheetah-909` (eu-west-1) |
| **SITE_URL** | `http://localhost:3000` | `https://chql.azacios.cz` |
| **GitHub OAuth App** | "chql-chat DEV" | "chql-chat" |
| **OAuth callback URL** | `https://qualified-malamute-653.convex.site/api/auth/callback/github` | `https://pleasant-cheetah-909.eu-west-1.convex.site/api/auth/callback/github` |

> **Why two deployments?** Convex Auth uses `SITE_URL` to redirect the browser after OAuth. A single deployment can only point to one URL. Two deployments means each has its own `SITE_URL`, so GitHub login works correctly in both environments.

---

## Team Setup

When a new team member joins:

### 1. Clone and install

```bash
git clone <repo-url>
cd chql-chat
npm install
```

### 2. Receive the private key

Get the `DOTENV_PRIVATE_KEY_LOCAL` value securely from a team member (NOT via git).

### 3. Create `.env.keys`

```bash
# Create .env.keys file with:
DOTENV_PRIVATE_KEY_LOCAL=<the-key-you-received>
```

### 4. Run the app

```bash
npm run dev
```

dotenvx will automatically decrypt `.env.local` using the key in `.env.keys`.

---

## Troubleshooting

### "Unable to decrypt" error

**Cause:** Missing or incorrect private key in `.env.keys`.

**Fix:**
1. Check that `.env.keys` exists
2. Verify the key matches the one used to encrypt
3. If lost, regenerate encryption:

```bash
npx dotenvx decrypt -f .env.local   # Decrypt with current key
rm .env.keys                          # Remove old keys
npx dotenvx encrypt -f .env.local    # Re-encrypt (generates new keys)
# Share new key from .env.keys with team
```

### MCP server returning 401

The `MCP_AUTH_TOKEN` values must match exactly between `.env.production` on the server and the Convex env var.

```bash
# Generate a new token
openssl rand -hex 32

# Update on server
nano /opt/chql-chat/.env.production
cd /opt/chql-chat && docker compose restart mcp-server

# Update in Convex
npx convex env set MCP_AUTH_TOKEN <new-value>
```

### GitHub OAuth login not working

1. Verify the callback URL in your GitHub OAuth App matches your Convex deployment's site URL
2. Check that `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` (with `AUTH_` prefix) are set in the Convex dashboard
3. Verify `SITE_URL` points to the correct frontend URL for your environment

---

## Learn More

- [dotenvx Documentation](https://dotenvx.com/docs)
- [dotenvx Encryption](https://dotenvx.com/encryption)
- [Convex Auth Documentation](https://labs.convex.dev/auth)
- [Convex Documentation](https://docs.convex.dev)
