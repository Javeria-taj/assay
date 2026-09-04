"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@assay/contract";
import { Button } from "@/components/ui/button";

/**
 * Batch 1 only. This page exists to prove one thing: the browser can reach the
 * API service cross-origin and the response satisfies the shared contract.
 * The real screen replaces it wholesale in a later batch.
 *
 * The fetch runs in the browser deliberately — a server-side call would prove
 * nothing about CORS.
 */

const baseUrl = process.env.NEXT_PUBLIC_ASSAY_API ?? "http://localhost:4318";

type State =
  | { phase: "loading" }
  | { phase: "ok"; health: unknown }
  | { phase: "error"; name: string; message: string };

export default function HealthPage() {
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(() => {
    setState({ phase: "loading" });
    const api = createClient({ baseUrl });
    api
      .health()
      .then((health) => setState({ phase: "ok", health }))
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e));
        setState({ phase: "error", name: err.name, message: err.message });
      });
  }, []);

  useEffect(load, [load]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8 font-mono text-sm">
      <header className="flex flex-col gap-1">
        <h1 className="text-base font-semibold tracking-tight">Assay — API reachability</h1>
        <p className="text-muted-foreground">
          GET <code>/v1/health</code> from the browser at <code>{baseUrl}</code>
        </p>
      </header>

      {state.phase === "loading" && <p className="text-muted-foreground">Checking…</p>}

      {state.phase === "ok" && (
        <pre className="overflow-x-auto rounded-md border border-border bg-muted p-4">
          {JSON.stringify(state.health, null, 2)}
        </pre>
      )}

      {state.phase === "error" && (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-semibold">{state.name}</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{state.message}</p>
          <p className="text-muted-foreground">
            A CORS refusal shows here as a failed fetch. Check <code>ALLOWED_ORIGIN</code> on the API.
          </p>
        </div>
      )}

      <div>
        <Button onClick={load} variant="outline" size="sm">
          Check again
        </Button>
      </div>
    </main>
  );
}
