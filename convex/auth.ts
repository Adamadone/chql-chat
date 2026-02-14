import GitHub from "@auth/core/providers/github";
import { convexAuth } from "@convex-dev/auth/server";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub],
  session: {
    totalDurationMs: ONE_WEEK_MS,
  },
});
