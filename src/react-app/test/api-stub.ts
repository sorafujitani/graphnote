/**
 * `fetch` stub shared by the browser tests.
 *
 * Stubbing the transport rather than mocking the API module keeps `server/api.ts`
 * under test and gives every assertion the real request payloads.
 */

export type StubRequest = {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  /** Lower-cased header names, as the worker would read them. */
  headers: Record<string, string>;
};

/** A non-2xx answer, mirroring the worker's `{ error, ...extra }` body. */
export class StubError {
  constructor(
    readonly status: number,
    readonly error: string,
    readonly extra: Record<string, unknown> = {},
  ) {}
}

export type FetchStub = {
  /** Every request the app made, in order. */
  calls: StubRequest[];
  /** Requests matching a method and a path suffix. */
  matching: (method: string, pathEnd: string) => StubRequest[];
  restore: () => void;
};

/**
 * `handle` returns the JSON body for a request, or `undefined` to fall through to
 * `{ ok: true }` — an unhandled call then fails an assertion instead of the
 * transport, which is far easier to read in a test failure. Returning a
 * `StubError` answers with that status, so a test can exercise the rejection
 * paths the worker really has.
 */
export function stubFetch(handle: (request: StubRequest) => unknown): FetchStub {
  const realFetch = globalThis.fetch;
  const calls: StubRequest[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const request: StubRequest = {
      method: init?.method ?? "GET",
      path: new URL(target, window.location.origin).pathname,
      body:
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
      headers,
    };
    calls.push(request);

    if (!request.path.startsWith("/api/")) return realFetch(input, init);
    const data = handle(request) ?? { ok: true };
    const failure = data instanceof StubError ? data : null;
    return new Response(
      JSON.stringify(failure ? { error: failure.error, ...failure.extra } : data),
      {
        status: failure ? failure.status : 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  return {
    calls,
    matching: (method, pathEnd) =>
      calls.filter((call) => call.method === method && call.path.endsWith(pathEnd)),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}
