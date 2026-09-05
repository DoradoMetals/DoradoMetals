declare module 'supertest' {
  interface Response {
    status: number
    body: any
    text: string
    request: { method: string; url: string }
    headers: Record<string, string | undefined>
  }
  interface Test extends Promise<Response> {
    send(data?: unknown): Test
    buffer(yes?: boolean): Test
    parse(
      fn: (
        res: import('node:stream').Readable,
        cb: (err: Error | null, body: unknown) => void
      ) => void
    ): Test
    query(params: Record<string, unknown>): Test
    set(field: string, value: string): Test
    expect(status: number): Test
  }
  interface SuperTest {
    get(url: string): Test
    post(url: string): Test
    put(url: string): Test
    patch(url: string): Test
    delete(url: string): Test
  }
  export default function request(app: unknown): SuperTest
}
