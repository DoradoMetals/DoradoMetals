// Minimal ambient declaration for supertest.
//
// TEMPORARY, and the honest fix is `pnpm add -D @types/supertest`. It is here
// because moving tests to .ts means they are typechecked, and supertest ships
// no types of its own - so without this every endpoint test fails tsc on the
// import alone. Declared narrowly: only the surface the tests actually use, so
// that if a test reaches for something else it fails here rather than silently
// becoming `any`.
declare module "supertest" {
  interface Response {
    status: number;
    body: any;
    text: string;
    // Superagent hangs the originating request off the response, and
    // features/leads/tests/replay.test.ts reads it to name which call failed
    // in a loop over several. Declared narrowly, like everything else here:
    // only the two fields a test actually reads.
    request: { method: string; url: string };
    // Response headers, lowercased by superagent. The PDF tests assert
    // content-type and content-disposition, which is how they prove a browser
    // will save the file rather than render it.
    headers: Record<string, string | undefined>;
  }
  interface Test extends Promise<Response> {
    send(data?: unknown): Test;
    // The binary pair. A PDF route returns bytes, and superagent's default
    // parser would decode them as text - so the PDF tests turn buffering on
    // and supply their own parser. Declared narrowly like the rest of this
    // file: `parse` takes the raw response stream and a node-style callback.
    buffer(yes?: boolean): Test;
    parse(
      fn: (
        res: import("node:stream").Readable,
        cb: (err: Error | null, body: unknown) => void
      ) => void
    ): Test;
    query(params: Record<string, unknown>): Test;
    set(field: string, value: string): Test;
    expect(status: number): Test;
  }
  interface SuperTest {
    get(url: string): Test;
    post(url: string): Test;
    put(url: string): Test;
    // PATCH WAS MISSING, and the omission was invisible for the reason this
    // file's own header gives: only the surface the tests use is declared, and
    // every test that PATCHes was JavaScript, so tsc never saw the call. PATCH
    // is now the WHOLE order mutation surface - PATCH /api/orders/:id,
    // /api/orders/items/:id, /api/shipments/:id, /api/refiners/orders/:id -
    // which D87 consolidated out of a ~25-route RPC zoo. Found by converting
    // features/orders/tests/update-tracking.test.js (wave 5A). The narrow
    // declaration did its job: it failed rather than becoming `any`.
    patch(url: string): Test;
    delete(url: string): Test;
  }
  export default function request(app: unknown): SuperTest;
}
