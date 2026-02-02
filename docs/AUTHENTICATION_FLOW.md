# Authentication Flow

This project uses **NextAuth.js v5** (now Auth.js) for authentication with GitHub OAuth. Here's how it works end-to-end:

## 🏗️ Architecture Overview

```
User ──► GitHub OAuth ──► NextAuth.js ──► Next.js App
                              │                    │
                              │                    ▼
                        Session Token            Protected Routes
                              │                    │
                              ▼                    ▼
                         Database (Convex)         User Profile
```

## 📁 Key Files

### 1. Auth Configuration (`apps/web/src/auth.ts`)
```typescript
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID!,        // From encrypted .env.local
      clientSecret: process.env.GITHUB_SECRET!,  // From encrypted .env.local
    }),
  ],
  
  callbacks: {
    // 1️⃣ JWT Callback - Add user info to token
    async jwt({ token, user, account }) {
      if (user) token.id = user.id;
      if (account) token.accessToken = account.access_token;
      return token;
    },
    
    // 2️⃣ Session Callback - Create user session
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      if (token) session.accessToken = token.accessToken;
      return session;
    },
  },
  
  pages: {
    signIn: "/auth/signin",  // Custom sign-in page
  },
});
```

**Environment Variables Used:**
- `GITHUB_ID` - GitHub OAuth App Client ID
- `GITHUB_SECRET` - GitHub OAuth App Client Secret
- `AUTH_SECRET` - Session signing secret

### 2. API Route Handler (`apps/web/src/app/api/auth/[...nextauth]/route.ts`)
```typescript
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

**Purpose:** Forwards all `/api/auth/*` requests to NextAuth.js handlers

### 3. Session Provider (`apps/web/src/providers/session-provider.tsx`)
```typescript
"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { ReactNode } from "react";

export function SessionProvider({ children }: { children: ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
```

**Purpose:** Wraps NextAuth.js session provider for React components

### 4. App Layout (`apps/web/src/app/layout.tsx`)
```typescript
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
```

**Provider Order Matters:**
1. `SessionProvider` (NextAuth) - Makes auth available globally
2. `ConvexClientProvider` - Makes Convex available globally

## 🔁 Complete Flow Step-by-Step

### Step 1: User Initiates Login
```typescript
// In a React component
import { signIn } from "next-auth/react";

const handleLogin = () => {
  signIn("github"); // Redirects to GitHub
};
```

### Step 2: GitHub OAuth Flow
1. User redirected to GitHub
2. User authorizes the app
3. GitHub redirects back to `/api/auth/callback/github`
4. NextAuth.js exchanges code for access token

### Step 3: Session Creation
1. **JWT Callback** (`auth.ts`) fires:
   ```typescript
   async jwt({ token, user, account }) {
     token.id = user.id;           // User's GitHub ID
     token.accessToken = account.access_token; // GitHub access token
     return token;
   }
   ```

2. **Session Callback** (`auth.ts`) fires:
   ```typescript
   async session({ session, token }) {
     session.user.id = token.id;
     session.accessToken = token.accessToken;
     return session;
   }
   ```

### Step 4: User Data Stored in Convex
When user first logs in:
1. **NextAuth.js** creates session with GitHub user data
2. **Frontend** can call Convex functions to create user record
3. **Convex** stores user in `users` table:
   ```typescript
   // In convex/users.ts
   export const create = mutation({
     args: {
       email: v.string(),
       name: v.optional(v.string()),
       image: v.optional(v.string()),
     },
     handler: async (ctx, args) => {
       // Create user in Convex database
       return await ctx.db.insert("users", {
         email: args.email,
         name: args.name,
         image: args.image,
         createdAt: Date.now(),
       });
     },
   });
   ```

### Step 5: Accessing Auth State in Components
```typescript
"use client";

import { useSession } from "next-auth/react";

export function UserProfile() {
  const { data: session, status } = useSession();
  
  if (status === "loading") return <div>Loading...</div>;
  if (!session) return <div>Not logged in</div>;
  
  return (
    <div>
      <p>Welcome, {session.user.name}!</p>
      <p>Email: {session.user.email}</p>
      <p>User ID: {session.user.id}</p>
    </div>
  );
}
```

### Step 6: Protecting Routes
```typescript
// In any page or layout
import { auth } from "@/auth";

export default async function ProtectedPage() {
  const session = await auth(); // Get server-side session
  
  if (!session?.user) {
    redirect("/auth/signin");
  }
  
  // User is authenticated - render protected content
  return <div>Secret content for {session.user.name}</div>;
}
```

### Step 7: Server-Side Session Access
```typescript
// In server components or API routes
import { auth } from "@/auth";

export default async function ServerComponent() {
  const session = await auth();
  
  if (!session?.user) return <div>Please log in</div>;
  
  return <div>Hello {session.user.name}!</div>;
}
```

## 🔐 Security Features

### 1. Session Management
- **Secure JWT signing** with `AUTH_SECRET`
- **Automatic session refresh** (handles token expiration)
- **Session persistence** across page reloads

### 2. OAuth Security
- **PKCE flow** (Proof Key for Code Exchange)
- **State parameter** for CSRF protection
- **Short-lived access tokens** from GitHub

### 3. Integration Security
- **Environment variables** encrypted with dotenvx
- **Type-safe session data** with TypeScript
- **No secret exposure** to frontend

## 🛠️ Development Setup

### GitHub OAuth App Setup
1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Configure:
   - **Application name**: CHQL Chat
   - **Homepage URL**: http://localhost:3000
   - **Authorization callback URL**: http://localhost:3000/api/auth/callback/github
4. Get `Client ID` and `Client Secret`
5. Add to `.env.local`:
   ```
   GITHUB_ID=your_client_id_here
   GITHUB_SECRET=your_client_secret_here
   ```

### Required Environment Variables
```bash
# Auth.js secrets (encrypted)
AUTH_SECRET=random_32_byte_string
GITHUB_ID=github_client_id
GITHUB_SECRET=github_client_secret

# Auth.js configuration
AUTH_URL=http://localhost:3000
```

## 🔄 Session Data Structure

### TypeScript Types
```typescript
interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface Session {
  user: User & { id: string; };
  accessToken?: string;
  expires: Date;
}
```

### What Gets Stored
- **User profile**: name, email, image from GitHub
- **User ID**: GitHub user ID (string)
- **Access token**: GitHub API access token (for potential future GitHub API calls)

## 🚀 Usage Examples

### Login Button
```typescript
"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function LoginButton() {
  const { data: session } = useSession();
  
  if (session) {
    return (
      <button onClick={() => signOut()}>
        Sign out ({session.user.name})
      </button>
    );
  }
  
  return (
    <button onClick={() => signIn("github")}>
      Sign in with GitHub
    </button>
  );
}
```

### Authenticated API Call
```typescript
import { useMutation } from "convex/react";
import { api } from "convex/_generated/api";

export function ChatComponent() {
  const { data: session } = useSession();
  const createChat = useMutation(api.chats.create);
  
  const handleNewChat = async () => {
    if (!session?.user) {
      alert("Please log in first");
      return;
    }
    
    await createChat({
      userId: session.user.id,
      title: "New Chat",
    });
  };
  
  return (
    <button onClick={handleNewChat}>
      Create Chat
    </button>
  );
}
```

---

## Summary

**The authentication flow is:**
1. **Click login** → GitHub OAuth
2. **Authorize** → Back to app with access token
3. **NextAuth.js** → Creates secure session
4. **Session Provider** → Available throughout app
5. **Convex Integration** → User ID for database operations

**Key benefits:**
- ✅ **Secure**: OAuth 2.0 with PKCE
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Flexible**: Easy to extend (add more providers)
- ✅ **Integrated**: Works seamlessly with Convex

This setup provides a complete, secure authentication system perfect for your bachelor's thesis requirements!