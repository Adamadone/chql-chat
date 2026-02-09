"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessageSquare, Shield, Zap, ArrowRight } from "lucide-react";

export function HeroSection() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2 font-semibold">
            <MessageSquare className="size-5" />
            <span>CHQL Chat</span>
          </div>
          <Button size="sm" asChild>
            <Link href="/auth/signin">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Bachelor&apos;s Thesis Project
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Natural Language to
            <br />
            <span className="text-muted-foreground">DSL Queries</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Convert plain English into structured domain-specific queries using
            AI. Built with prompt injection resistance and MCP architecture.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link href="/auth/signin">
                Get Started
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Source
              </a>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-20 grid max-w-3xl gap-8 sm:grid-cols-3">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-muted">
              <MessageSquare className="size-5" />
            </div>
            <h3 className="font-medium">Chat Interface</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Conversational UI for natural language query generation
            </p>
          </div>
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-muted">
              <Shield className="size-5" />
            </div>
            <h3 className="font-medium">Injection Resistant</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Multi-layer defense against prompt injection attacks
            </p>
          </div>
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-muted">
              <Zap className="size-5" />
            </div>
            <h3 className="font-medium">MCP Architecture</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Model Context Protocol for structured tool interaction
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        CHQL Chat &mdash; Bachelor&apos;s Thesis
      </footer>
    </div>
  );
}
