import { describe, expect, it } from "vitest";
import { HttpRequestError, RpcRequestError } from "viem";
import { rpcFailure } from "../scripts/wallet.js";

const URL_ = "https://mainnet.base.org";

describe("rpcFailure", () => {
  it("returns null for an error that is not the RPC's fault", () => {
    // The important half. A TypeError here is a bug in this code, and a script
    // that turns it into "the RPC is unhappy, try again" hides it — the failure
    // this issue exists to stop is an error that says the wrong thing.
    expect(rpcFailure(new TypeError("x is not a function"))).toBeNull();
    expect(rpcFailure(new Error("plain"))).toBeNull();
    expect(rpcFailure("a string")).toBeNull();
    expect(rpcFailure(undefined)).toBeNull();
  });

  it("names a rate limit as a rate limit", () => {
    const failure = rpcFailure(
      new RpcRequestError({
        body: {},
        error: { code: -32016, message: "over rate limit" },
        url: URL_,
      }),
    );
    expect(failure?.summary).toMatch(/rate limit/i);
    // The operator's correct response is to do nothing for a minute, and that
    // is worth saying, because the transient case is the one that looks like a
    // bug when it arrives as a stack trace.
    expect(failure?.advice).toMatch(/wait|again/i);
  });

  it("names an HTTP 429 as a rate limit too", () => {
    // Some providers rate-limit at the transport layer rather than in the RPC
    // envelope, so the same condition arrives in a different shape.
    const failure = rpcFailure(new HttpRequestError({ status: 429, url: URL_ }));
    expect(failure?.summary).toMatch(/rate limit/i);
  });

  it("names a provider outage as an outage, not a rate limit", () => {
    const failure = rpcFailure(new HttpRequestError({ status: 503, url: URL_ }));
    expect(failure?.summary).toMatch(/unavailable|outage|5\d\d/i);
    expect(failure?.summary).not.toMatch(/rate limit/i);
  });

  it("recognises an unreachable host", () => {
    const failure = rpcFailure(
      new HttpRequestError({ url: URL_, details: "Unable to connect. Is the computer able to access the url?" }),
    );
    // Pinned to this branch's own wording, not to any word the generic branch
    // also produces: the generic message quotes the details verbatim, so
    // `/connect/` matched it too and the assertion could not fail.
    expect(failure?.summary).toMatch(/^cannot reach the RPC:/);
    expect(failure?.advice).toMatch(/check the network/i);
  });

  it("still classifies an RPC error it has no special name for", () => {
    // Unrecognised is not the same as not-an-RPC-problem: it must still be
    // reported as one, or an unfamiliar code falls through to a stack trace.
    const failure = rpcFailure(
      new RpcRequestError({ body: {}, error: { code: -32000, message: "something new" }, url: URL_ }),
    );
    expect(failure).not.toBeNull();
    expect(failure?.summary).toContain("something new");
  });

  it("always says nothing was sent", () => {
    // The one fact an operator needs before deciding what to do next.
    for (const e of [
      new HttpRequestError({ status: 503, url: URL_ }),
      new RpcRequestError({ body: {}, error: { code: -32016, message: "over rate limit" }, url: URL_ }),
    ]) {
      expect(rpcFailure(e)?.advice).toMatch(/nothing was sent/i);
    }
  });
});
