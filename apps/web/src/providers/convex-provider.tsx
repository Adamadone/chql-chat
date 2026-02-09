"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { type ReactNode, useRef } from "react";

let cachedClient: ConvexReactClient | null = null;

function getConvexClient(): ConvexReactClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  cachedClient = new ConvexReactClient(url);
  return cachedClient;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<ConvexReactClient | null>(undefined);
  if (clientRef.current === undefined) {
    clientRef.current = getConvexClient();
  }

  // During build/prerender NEXT_PUBLIC_CONVEX_URL is unavailable
  if (!clientRef.current) {
    return <>{children}</>;
  }

  return <ConvexProvider client={clientRef.current}>{children}</ConvexProvider>;
}
