# Production Deployment Guide

This guide covers deploying chql-chat to a Hetzner VPS running **Ubuntu 24.04 LTS** with Docker Compose, Caddy reverse proxy (automatic HTTPS), and GitHub Actions for auto-deploy on push.

## Dual Environment Setup

See [SETUP.md](./SETUP.md#dual-environment-overview) for the full dual-deployment table (dev vs prod Convex deployments, OAuth apps, URLs). The production Convex deployment is `pleasant-cheetah-909` (eu-west-1).

## Architecture

```
Internet
   |
   v
+------------------------------------------+
|     Hetzner Server (Ubuntu 24.04)        |
|                                          |
|  +----------+                            |
|  |  Caddy   | :80/:443 (public)          |
|  |  (HTTPS) |                            |
|  +----+-----+                            |
|       |                                  |
|       +-->  web:3000 (Next.js)           |
|       |                                  |
|       +-->  mcp-server:3001              |
|              ^                           |
|              |                           |
+------------------------------------------+
               |
   Convex Cloud — PROD deployment
   (pleasant-cheetah-909.eu-west-1)
   actions call https://mcp.azacios.cz/mcp
   with MCP_AUTH_TOKEN
```

- Ports 3000/3001 are bound to `127.0.0.1` only (not reachable from the internet directly).
- Caddy is the only service listening on ports 80/443.
- The MCP server `/mcp` endpoint requires `Authorization: Bearer <MCP_AUTH_TOKEN>` in production.
- The `/health` endpoint is unauthenticated (used by Docker healthcheck and CI).
- Convex runs in the cloud and connects to the MCP server via the public HTTPS URL.
- The **production** Next.js build is compiled with `NEXT_PUBLIC_CONVEX_URL` pointing to the prod Convex deployment.

---

## Secrets Inventory

See [SETUP.md](./SETUP.md#secrets-inventory) for the full secrets table and where each secret lives (server, Convex dashboard, GitHub Secrets, etc.).

---

## Prerequisites

- A Hetzner VPS with Ubuntu 24.04 LTS
- A domain name with access to DNS settings (you need two A records)
- The GitHub repo at `github.com/Adamadone/chql-chat`

---

## Server Setup (One-Time)

### 1. SSH into the server and update packages

```bash
ssh root@<your-server-ip>
apt update && apt upgrade -y
```

### 2. Install Docker

Ubuntu 24.04 does not ship Docker by default. Install it with the official convenience script:

```bash
curl -fsSL https://get.docker.com | sh
```

Verify it works:

```bash
docker --version
docker compose version
```

### 3. Create a deploy user

Do not run containers as root.

```bash
adduser deploy
# Follow the prompts (set a password, leave the rest blank)

usermod -aG docker deploy
```

### 4. Set up the firewall

Ubuntu 24.04 comes with `ufw` pre-installed but disabled. Enable it and allow only the ports we need:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

Expected output:

```
Status: active

To                         Action      From
--                         ------      ----
OpenSSH                    ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
```

If your Hetzner server also has a **Cloud Firewall** in the Hetzner console, make sure ports 22, 80, and 443 are allowed there too.

### 5. Set up SSH keys for GitHub Actions deployment

On your **local machine** (not the server), generate a dedicated deploy key:

```bash
ssh-keygen -t ed25519 -C "chql-deploy" -f ~/.ssh/chql-deploy
```

Copy the **public** key to the server's `deploy` user:

```bash
ssh-copy-id -i ~/.ssh/chql-deploy.pub deploy@<your-server-ip>
```

Test that it works:

```bash
ssh -i ~/.ssh/chql-deploy deploy@<your-server-ip>
```

The **private** key (`~/.ssh/chql-deploy`) will be added to GitHub Secrets later. Do not share it anywhere else.

### 6. Give the server read access to the GitHub repo

Still on the server, switch to the deploy user and generate an SSH key for git:

```bash
su - deploy
ssh-keygen -t ed25519 -C "chql-server"
cat ~/.ssh/id_ed25519.pub
```

Copy the output and add it as a **Deploy Key** (read-only) at:
`https://github.com/Adamadone/chql-chat/settings/keys`

Test the connection:

```bash
ssh -T git@github.com
# Should print: "Hi Adamadone/chql-chat! You've successfully authenticated..."
```

### 7. Clone the repo

As the deploy user:

```bash
sudo mkdir -p /opt/chql-chat
sudo chown deploy:deploy /opt/chql-chat
git clone git@github.com:Adamadone/chql-chat.git /opt/chql-chat
```

### 8. Create the production env file

Generate the MCP auth token first:

```bash
openssl rand -hex 32
```

Save the output -- you will need this value in three places (server, Convex, and your records).

Create the env file:

```bash
nano /opt/chql-chat/.env.production
```

Contents:

```
CHYSTAT_API_TOKEN=<your-chystat-api-token>
MCP_AUTH_TOKEN=<the-token-you-generated-above>
NEXT_PUBLIC_CONVEX_URL=https://pleasant-cheetah-909.eu-west-1.convex.cloud
```

Lock down permissions (readable only by the deploy user):

```bash
chmod 600 /opt/chql-chat/.env.production
```

### 9. Configure DNS

Create two A records pointing to your server's public IP address:

```
chql.example.com    ->  <your-server-ip>
mcp.example.com     ->  <your-server-ip>
```

Wait for DNS propagation (usually a few minutes, can take up to 24 hours). Verify:

```bash
dig +short chql.example.com
dig +short mcp.example.com
# Both should return your server IP
```

### 10. Edit the Caddyfile

Replace the placeholder domains in the Caddyfile with your actual domains:

```bash
nano /opt/chql-chat/Caddyfile
```

Change `chql.example.com` and `mcp.example.com` to your real domain names.

### 11. Build and start

```bash
cd /opt/chql-chat
docker compose build
docker compose up -d
```

The first start takes a few minutes (building images, pulling base layers). Caddy will automatically provision HTTPS certificates from Let's Encrypt once DNS is pointing correctly.

Check that all three containers are running:

```bash
docker compose ps
```

Expected output:

```
NAME              SERVICE       STATUS
chql-chat-web-1         web           Up
chql-chat-mcp-server-1  mcp-server    Up (healthy)
chql-chat-caddy-1       caddy         Up
```

### 12. Verify

```bash
# Health check from the server
curl http://localhost:3001/health
# Expected: {"status":"ok"}

# From the internet (or from the server itself)
curl https://mcp.example.com/health
curl -I https://chql.example.com
```

---

## Convex Environment Variables

See [SETUP.md](./SETUP.md#convex-environment-variables) for the full Convex env var setup (both dev and prod deployments, CLI commands, and GitHub OAuth callback URLs).

---

## GitHub Actions (Auto-Deploy)

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`. It SSHs into the server, pulls the latest code, rebuilds containers, and runs health checks.

### Add GitHub Secrets

Go to `https://github.com/Adamadone/chql-chat/settings/secrets/actions` and add:

| Secret name | Value |
|---|---|
| `HETZNER_HOST` | Your server IP (e.g. `116.203.x.x`) |
| `HETZNER_USER` | `deploy` |
| `HETZNER_SSH_KEY` | Contents of `~/.ssh/chql-deploy` (the **private** key file) |
| `CONVEX_PROD_DEPLOY_KEY` | Convex prod deploy key (from Convex dashboard -> `pleasant-cheetah-909` -> Settings -> Deploy Key) |

To copy the SSH private key contents:

```bash
cat ~/.ssh/chql-deploy
```

Paste the entire output (including the `-----BEGIN` and `-----END` lines) into the GitHub Secret value.

### Deployment flow

1. You push to `main`.
2. **Job 1 (`deploy-convex`):** GitHub Actions checks out code, installs deps, runs `npx convex deploy` using `CONVEX_PROD_DEPLOY_KEY` to push Convex functions to the prod deployment.
3. **Job 2 (`deploy-server`):** After Convex deploy succeeds, SSHs into the server as the `deploy` user.
4. Runs `git pull`, `docker compose build --no-cache`, `docker compose up -d`.
5. Cleans up old Docker images.
6. Verifies health checks pass.

### Manual trigger

The workflow also supports `workflow_dispatch`, so you can trigger a deploy manually from the GitHub Actions UI without pushing code.

---

## Security Notes

### MCP server authentication

The MCP server's `/mcp` endpoint is protected by a Bearer token (`MCP_AUTH_TOKEN`). In local development, if this variable is not set, auth is skipped. In production, it must be set on both:

- The server (`.env.production`) -- so the MCP server enforces it.
- Convex env vars -- so the Convex action sends it.

### .dockerignore

The `.dockerignore` file prevents `.env`, `.env.keys`, `.env.local`, `.env.production`, `node_modules`, `.git`, and other sensitive/unnecessary files from being sent to the Docker daemon during builds. This means secrets never end up in Docker image layers.

### Port binding

In `docker-compose.yml`, ports are bound to `127.0.0.1` (e.g. `127.0.0.1:3000:3000`), not `0.0.0.0`. This means the services are only reachable from the server itself (and through Caddy), not directly from the internet.

### Firewall

Ubuntu 24.04's `ufw` should be enabled (see step 4). Only ports 22 (SSH), 80 (HTTP), and 443 (HTTPS) should be open. Verify with:

```bash
ufw status
```

If your Hetzner VPS has a Cloud Firewall configured in the Hetzner console, ensure the same ports are allowed there too (Hetzner's firewall operates at the network level, before traffic reaches the OS).

### Unattended security updates

Ubuntu 24.04 has `unattended-upgrades` enabled by default for security patches. Verify:

```bash
systemctl status unattended-upgrades
```

This keeps your OS patched without manual intervention. Docker images should be rebuilt periodically to pick up base image updates (`node:20-alpine`).

---

## Updating the Deployment

### Automatic (recommended)

Push to `main`. GitHub Actions handles the rest.

### Manual

```bash
ssh deploy@<your-server-ip>
cd /opt/chql-chat
git pull origin main
docker compose build --no-cache
docker compose up -d
docker image prune -f
```

---

## Troubleshooting

### Containers not starting

```bash
cd /opt/chql-chat
docker compose logs -f
```

### Docker permission denied

If the deploy user gets "permission denied" when running docker commands:

```bash
# As root:
usermod -aG docker deploy

# The deploy user must log out and back in for the group change to take effect:
su - deploy
```

### MCP server returning 401

The `MCP_AUTH_TOKEN` values must match exactly between:
- `.env.production` on the server
- `npx convex env set MCP_AUTH_TOKEN ...`

Regenerate if unsure:

```bash
# Generate a new token
openssl rand -hex 32

# Update on server
nano /opt/chql-chat/.env.production

# Restart MCP server
cd /opt/chql-chat && docker compose restart mcp-server

# Update in Convex
npx convex env set MCP_AUTH_TOKEN <new-value>
```

### Caddy not getting certificates

- Ensure DNS A records point to the server IP: `dig +short chql.example.com`
- Ensure ports 80 and 443 are open: `ufw status` and check Hetzner Cloud Firewall.
- Check Caddy logs: `docker compose logs caddy`
- Let's Encrypt has rate limits. If you hit them during testing, wait 1 hour.

### Health check failing in CI

The deploy script waits 10 seconds after `docker compose up -d` before checking health. If your server is slow, increase the `sleep` value in `.github/workflows/deploy.yml`.

### Rebuilding from scratch

```bash
cd /opt/chql-chat
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Checking disk space

Docker images accumulate over time. Clean up periodically:

```bash
docker system prune -af
```

On a small Hetzner VPS, monitor disk usage with:

```bash
df -h
docker system df
```
