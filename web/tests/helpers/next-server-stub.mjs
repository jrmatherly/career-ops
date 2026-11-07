// next has no exports map, so plain Node ESM cannot resolve the bare "next/server"
// a route imports. Import this module for side effect before a dynamic import of
// the route; it maps that specifier to a stub of NextResponse.json and
// NextResponse.next, which is what the healthz, scheduler and proxy modules use.
// A route that imports NextRequest or connection needs more than this. The hook
// is process-wide for the test file that imports it.
import { register } from "node:module";

const adapter = `data:text/javascript,${encodeURIComponent(
  "export const NextResponse = { json: (body, init) => Response.json(body, init), next: () => new Response(null, { status: 200 }) };",
)}`;
register(`data:text/javascript,${encodeURIComponent(`
  export function resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return { url: ${JSON.stringify(adapter)}, shortCircuit: true };
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);
