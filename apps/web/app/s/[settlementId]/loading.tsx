import { ConsoleSkeleton } from "@/components/skeleton";

/**
 * What is on screen while `page.tsx` is awaiting the six calls in
 * `loadConsole()`.
 *
 * Next renders this automatically as the route's Suspense fallback, so the
 * first paint is the console's own geometry rather than a blank document, and
 * the six requests still happen once, on the server, in parallel.
 *
 * The spec is explicit and this file is the whole of its implementation: a
 * skeleton that holds the exact final layout so nothing jumps, and no spinners
 * on the main screen. The geometry lives in `components/skeleton.tsx`.
 */
export default function Loading() {
  return <ConsoleSkeleton />;
}
