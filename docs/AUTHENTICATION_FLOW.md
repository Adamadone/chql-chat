# Authentication Flow

This project uses **Convex Auth** (`@convex-dev/auth`) for authentication with GitHub OAuth. Convex Auth handles the entire OAuth flow server-side within Convex, using `@auth/core` provider definitions internally.

## Architecture Overview

```
User ──► GitHub OAuth ──► Convex Auth (HTTP routes) ──► Convex DB
                                  │
                                  ▼
                          Session/JWT token
                                  │
                    ┌─────────────┴──────────────┐
                    ▼                            ▼
             Next.js Middleware           Convex Functions
          (convexAuthNextjsMiddleware)   (getAuthUserId)
```

## Key Files

### Server-side (Convex backend)

**`convex/auth.ts`** — Auth entry point
```typescript
import GitHub from "@auth/core/providers/github";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub],
});
```

**`convex/auth.config.ts`** — JWT verification config
```typescript
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
```

**`convex/http.ts`** — Mounts OAuth callback routes on Convex HTTP router
```typescript
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

**`convex/schema.ts`** — Adds auth tables to database
```typescript
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  // ... app tables (chats, messages)
});
```

This adds Convex Auth's built-in tables: `users`, `authAccounts`, `authSessions`, `authRefreshTokens`.

### Client-side (Next.js)

**`apps/web/src/app/layout.tsx`** — Provider hierarchy
```typescript
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";

<ConvexAuthNextjsServerProvider>
  <ConvexClientProvider>{children}</ConvexClientProvider>
</ConvexAuthNextjsServerProvider>
```

**`apps/web/src/providers/convex-provider.tsx`** — Client provider
```typescript
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

<ConvexAuthNextjsProvider client={convex}>
  {children}
</ConvexAuthNextjsProvider>
```

**`apps/web/src/middleware.ts`** — Route protection
```typescript
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/chat(.*)"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/auth/signin");
  }
});
```

**`apps/web/src/components/auth/sign-in-card.tsx`** — Sign-in UI
```typescript
import { useAuthActions } from "@convex-dev/auth/react";

const { signIn } = useAuthActions();

// Triggers Convex Auth OAuth flow
signIn("github", { redirectTo: "/chat" });
```

## Complete Flow

### 1. User clicks "Continue with GitHub"
The `SignInCard` component calls `signIn("github")` from `@convex-dev/auth/react`. This initiates the OAuth flow via Convex Auth.

### 2. GitHub OAuth
1. User is redirected to GitHub
2. User authorizes the app
3. GitHub redirects back to the Convex HTTP callback route (mounted by `auth.addHttpRoutes`)

### 3. Convex Auth processes the callback
1. Convex Auth exchanges the authorization code for tokens
2. Creates/updates records in the `users`, `authAccounts`, and `authSessions` tables
3. Issues a session token (JWT)

### 4. Session available throughout the app
- **Next.js middleware**: `convexAuthNextjsMiddleware` validates the token and protects routes
- **Server pages**: `isAuthenticatedNextjs()` checks auth status
- **Convex functions**: `getAuthUserId(ctx)` retrieves the authenticated user's ID
- **React components**: `useAuthActions()` provides `signIn`/`signOut`

### 5. Auth checks in Convex functions
Every Convex query/mutation/action that needs auth uses:
```typescript
import { getAuthUserId } from "@convex-dev/auth/server";

const userId = await getAuthUserId(ctx);
if (!userId) return { success: false, error: "Not authenticated" };
```

Used in: `convex/ai.ts`, `convex/chats.ts`, `convex/messages.ts`, `convex/users.ts`

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | Session token signing secret |
| `GITHUB_ID` | GitHub OAuth App Client ID |
| `GITHUB_SECRET` | GitHub OAuth App Client Secret |
| `CONVEX_SITE_URL` | Convex HTTP endpoint (used as OAuth callback domain) |

## Security Features

- **Server-side OAuth flow**: The entire OAuth exchange happens on the Convex backend, not in the browser
- **JWT session tokens**: Signed with `AUTH_SECRET`, validated by Convex Auth middleware
- **Route protection**: Next.js middleware blocks unauthenticated access to `/chat/*`
- **Function-level auth**: Every Convex function checks `getAuthUserId()` independently
- **Encrypted env vars**: Secrets managed via dotenvx (see `ENVIRONMENT_SETUP.md`)

## GitHub OAuth App Setup

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Configure:
   - **Application name**: CHQL Chat
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: Your `CONVEX_SITE_URL` value (the Convex HTTP endpoint, NOT `localhost:3000`)
4. Get Client ID and Client Secret
5. Add to `.env.local`:
   ```
   GITHUB_ID=your_client_id_here
   GITHUB_SECRET=your_client_secret_here
   ```
