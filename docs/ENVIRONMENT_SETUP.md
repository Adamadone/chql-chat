# Environment Variables Setup

This project uses **dotenvx** for encrypted environment variable management, providing better security for sensitive credentials.

## Quick Start

### Development
```bash
npm run dev
```

Everything is handled automatically! The encrypted `.env.local` file is decrypted at runtime.

---

## How It Works

### File Structure

```
.env.local        → Encrypted environment variables (safe to commit)
.env.keys         → Private decryption keys (NEVER commit)
.env              → Template file (committed to repo)
```

### Security Benefits

✅ **Encrypted at rest** - Secrets are encrypted in `.env.local`  
✅ **Safe to commit** - Encrypted files can be version controlled  
✅ **No secrets in Docker** - `dotenvx prebuild` prevents shipping .env to production  
✅ **Key isolation** - Private keys stored separately in `.env.keys`  

---

## Adding New Environment Variables

### 1. Decrypt the file
```bash
npx dotenvx decrypt -f .env.local
```

### 2. Edit the decrypted file
Add your new variable:
```bash
# Add to .env.local
NEW_API_KEY=your-secret-key-here
```

### 3. Re-encrypt
```bash
npx dotenvx encrypt -f .env.local
```

### 4. Done!
The file is now encrypted and safe to commit.

---

## Team Setup

When a new team member joins:

### 1. They clone the repo
```bash
git clone <repo-url>
cd chql-chat
npm install
```

### 2. They receive the private key
You share the `DOTENV_PRIVATE_KEY_LOCAL` value securely (NOT via git):

```bash
# From .env.keys (don't commit this file!)
DOTENV_PRIVATE_KEY_LOCAL=7a08fbb1bb1796b87c08c3219bdd06dcdc89db8937c5d05d29594964649f5753
```

### 3. They create `.env.keys`
```bash
# Create .env.keys file with:
DOTENV_PRIVATE_KEY_LOCAL=<the-key-you-received>
```

### 4. They run the app
```bash
npm run dev
```

dotenvx will automatically decrypt `.env.local` using the key in `.env.keys`.

---

## Production Deployment

### Docker Build (Recommended)

The Dockerfile uses `dotenvx prebuild` to inject decrypted values at build time:

```dockerfile
# Copy encrypted .env.local
COPY .env.local ./

# Prebuild: decrypt and inject into environment
RUN npx dotenvx prebuild

# Build app (with decrypted env vars)
RUN npm run build
```

**Result:** No `.env` files shipped to production containers!

### Manual Deployment

Set the private key as an environment variable:

```bash
DOTENV_PRIVATE_KEY_LOCAL=<your-key> npm run build
```

---

## CI/CD Setup

### GitHub Actions Example

```yaml
name: Build
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Install dependencies
        run: npm install
      
      - name: Build
        env:
          DOTENV_PRIVATE_KEY_LOCAL: ${{ secrets.DOTENV_PRIVATE_KEY_LOCAL }}
        run: npm run build
```

**Important:** Add `DOTENV_PRIVATE_KEY_LOCAL` to your GitHub repository secrets!

---

## Backup Your Private Key

⚠️ **CRITICAL:** If you lose `.env.keys`, you cannot decrypt your `.env.local`!

### Backup options:

1. **Secure password manager** (1Password, LastPass, etc.)
2. **dotenvx ops backup** (official backup service):
   ```bash
   npx dotenvx ops backup
   ```

---

## Commands Reference

```bash
# Encrypt a file
npx dotenvx encrypt -f .env.local

# Decrypt a file
npx dotenvx decrypt -f .env.local

# Run with decryption
npx dotenvx run -- <your-command>

# Prebuild (for Docker)
npx dotenvx prebuild

# View encrypted values (for debugging)
npx dotenvx get NEXT_PUBLIC_CONVEX_URL
```

---

## Current Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `CONVEX_DEPLOYMENT` | Convex deployment ID | Yes |
| `NEXT_PUBLIC_CONVEX_URL` | Convex API endpoint | Yes |
| `CONVEX_SITE_URL` | Convex HTTP actions URL | Yes |
| `AUTH_SECRET` | Auth.js encryption secret | Yes |
| `AUTH_URL` | Auth.js callback URL | Yes |
| `GITHUB_ID` | GitHub OAuth client ID | Yes |
| `GITHUB_SECRET` | GitHub OAuth client secret | Yes |
| `ANTHROPIC_API_KEY` | Anthropic/Claude API key | Optional |
| `OPENAI_API_KEY` | OpenAI API key | Optional |

---

## Troubleshooting

### "Unable to decrypt" error

**Cause:** Missing or incorrect private key in `.env.keys`

**Solution:** 
1. Check that `.env.keys` exists
2. Verify the key matches the one used to encrypt
3. If lost, regenerate encryption (see below)

### Regenerating encryption

If you need to start fresh:

```bash
# 1. Decrypt current file
npx dotenvx decrypt -f .env.local

# 2. Remove old keys
rm .env.keys

# 3. Re-encrypt (generates new keys)
npx dotenvx encrypt -f .env.local

# 4. Share new key from .env.keys with team
```

---

## Security Best Practices

✅ **DO:**
- Keep `.env.keys` in `.gitignore` (already configured)
- Share private keys through secure channels (password managers, encrypted messages)
- Backup your private key securely
- Use different keys for production/staging

❌ **DON'T:**
- Commit `.env.keys` to git
- Share private keys via email, Slack, or other plaintext channels
- Use the same key across environments
- Lose your private key (no recovery possible!)

---

## Learn More

- [dotenvx Documentation](https://dotenvx.com/docs)
- [dotenvx Prebuild Guide](https://dotenvx.com/docs/advanced/prebuild)
- [dotenvx Encryption](https://dotenvx.com/encryption)
