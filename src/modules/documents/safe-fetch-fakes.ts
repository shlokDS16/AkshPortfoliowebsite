import { vi, expect } from "vitest";
import { DocumentError, type DocumentErrorCode } from "./errors";
import type { Address, Resolver, Transport, TransportRequest, TransportResponse } from "./safe-fetch";


// No test here touches the network: DNS is a table and the transport is a function. The fakes record every call so the tests can
// say what was resolved, what was connected to, and what was never asked for.

export const PUBLIC: Address = { address: "93.184.216.34", family: 4 };
export const enc = (text: string) => new TextEncoder().encode(text);

export function body(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

export const reply = (status: number, headers: Record<string, string> = {}, chunks: Uint8Array[] = []): TransportResponse => ({
  status,
  headers,
  body: body(...chunks),
  close: vi.fn(),
});

/** A DNS table: a host maps to its addresses, or to an error; one that is not listed does not exist. */
export function dns(table: Record<string, Address[] | Error>) {
  const asked: string[] = [];
  const resolve: Resolver = async (host) => {
    asked.push(host);
    const answer = table[host];
    if (!answer) throw new Error("ENOTFOUND");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { resolve, asked };
}

/** A transport that serves one canned response per call, in order, and remembers what it was asked. */
export function server(...responses: (TransportResponse | ((request: TransportRequest) => Promise<TransportResponse>))[]) {
  const calls: TransportRequest[] = [];
  const transport: Transport = async (request) => {
    calls.push(request);
    const next = responses[calls.length - 1];
    if (!next) throw new Error("unexpected request");
    return typeof next === "function" ? next(request) : next;
  };
  return { transport, calls };
}

export async function refusal(promise: Promise<unknown>): Promise<DocumentErrorCode> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DocumentError);
  return (error as DocumentError).code;
}

