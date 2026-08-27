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
  }
  interface Test extends Promise<Response> {
    send(data?: unknown): Test;
    query(params: Record<string, unknown>): Test;
    set(field: string, value: string): Test;
    expect(status: number): Test;
  }
  interface SuperTest {
    get(url: string): Test;
    post(url: string): Test;
    put(url: string): Test;
    delete(url: string): Test;
  }
  export default function request(app: unknown): SuperTest;
}
