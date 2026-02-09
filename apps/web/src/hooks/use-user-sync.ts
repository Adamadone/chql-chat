"use client";

import { useSession } from "next-auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { useEffect, useRef } from "react";
import type { Id } from "convex/_generated/dataModel";

export function useUserSync(): {
  userId: Id<"users"> | undefined;
  isLoading: boolean;
} {
  const { data: session, status } = useSession();
  const createUser = useMutation(api.users.create);
  const email = session?.user?.email ?? undefined;
  const convexUser = useQuery(
    api.users.getByEmail,
    email ? { email } : "skip"
  );
  const syncedRef = useRef(false);

  useEffect(() => {
    if (
      status === "authenticated" &&
      session?.user?.email &&
      convexUser === null &&
      !syncedRef.current
    ) {
      syncedRef.current = true;
      createUser({
        email: session.user.email,
        name: session.user.name ?? undefined,
        image: session.user.image ?? undefined,
      }).catch(console.error);
    }
  }, [status, session, convexUser, createUser]);

  const isLoading =
    status === "loading" || (status === "authenticated" && convexUser === undefined);

  return {
    userId: convexUser?._id,
    isLoading,
  };
}
