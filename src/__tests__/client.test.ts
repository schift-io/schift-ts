import { afterEach, describe, expect, it, vi } from "vitest";
import { Schift, SchiftAuth } from "../client.js";

describe("Schift client search", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uses bucket in the bucket search endpoint", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ id: "doc_1", score: 0.9 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    const results = await client.search({ bucket: "docs", query: "hello", topK: 3 });

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.schift.io/v1/buckets/docs/search",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"top_k":3'),
      }),
    );
  });

  it("keeps collection as a deprecated search alias", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    await client.search({ collection: "legacy-docs", query: "hello" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.schift.io/v1/buckets/legacy-docs/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("manages child collections inside a resolved bucket", async () => {
    const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url).replace("https://api.schift.io", "");
      if (path === "/v1/buckets") {
        return new Response(JSON.stringify([{ id: "bucket_1", name: "docs" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (path === "/v1/buckets/bucket_1/collections") {
        return new Response(JSON.stringify([{ id: "collection_1", name: "support" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: "grant_1", permission: "search" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    await client.listBucketCollections("docs");
    await client.grantBucketCollectionAccess("docs", "collection_1", {
      subjectType: "role",
      subjectId: "support",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.schift.io/v1/buckets/bucket_1/collections",
      expect.objectContaining({ method: "GET" }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.schift.io/v1/buckets/bucket_1/collections/collection_1/grants",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          subject_type: "role",
          subject_id: "support",
          permission: "search",
        }),
      }),
    );
  });

  it("passes collection_id when uploading to a child collection", async () => {
    const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url).replace("https://api.schift.io", "");
      if (path === "/v1/buckets") {
        return new Response(JSON.stringify([{ id: "bucket_1", name: "docs" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ jobs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    await client.db.upload("docs", {
      files: [new Blob(["hello"], { type: "text/plain" })],
      collectionId: "collection_1",
    });

    const uploadCall = mockFetch.mock.calls.find(
      ([url]) => String(url) === "https://api.schift.io/v1/buckets/bucket_1/upload",
    );
    expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData);
    expect((uploadCall?.[1]?.body as FormData).get("collection_id")).toBe(
      "collection_1",
    );
  });

  it("redacts PII with the API key and exposes a mask helper", async () => {
    const mockFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Response(
        JSON.stringify({
          request_id: "req_1",
          profile: "schift-pii-v4",
          scope: "broad",
          types: ["phone"],
          entities: [{ label: "PHONE", start: 3, end: 16, score: 0.99, word: "010-1234-5678" }],
          token_format: "pii_type_index",
          masked: "김민수 [PII_PHONE_1]",
          reverse_map: { "[PII_PHONE_1]": "010-1234-5678" },
          elapsed_ms: 12,
          cached: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    const response = await client.redactPii({
      text: "김민수 010-1234-5678",
      scoreThreshold: 0.6,
      types: ["phone"],
    });
    const masked = await client.mask("김민수 010-1234-5678", {
      types: ["phone"],
    });

    expect(response.masked).toBe("김민수 [PII_PHONE_1]");
    expect(response.types).toEqual(["phone"]);
    expect(response.token_format).toBe("pii_type_index");
    expect(response.reverse_map).toEqual({ "[PII_PHONE_1]": "010-1234-5678" });
    expect(masked).toBe("김민수 [PII_PHONE_1]");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.schift.io/v1/pii/redact",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sch_test" }),
        body: JSON.stringify({
          text: "김민수 010-1234-5678",
          score_threshold: 0.6,
          scope: "broad",
          types: ["phone"],
          token_format: "pii_type_index",
          return: "both",
        }),
      }),
    );
  });

  it("restores PII with a caller-held reverse map", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          request_id: "req_restore",
          restored: "연락처 010-1234-5678",
          replaced: 1,
          missing_tokens: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    const response = await client.restorePii({
      text: "연락처 [PII_PHONE_1]",
      reverseMap: { "[PII_PHONE_1]": "010-1234-5678" },
    });

    expect(response.restored).toBe("연락처 010-1234-5678");
    expect(response.replaced).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.schift.io/v1/pii/restore",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sch_test" }),
        body: JSON.stringify({
          text: "연락처 [PII_PHONE_1]",
          reverse_map: { "[PII_PHONE_1]": "010-1234-5678" },
        }),
      }),
    );
  });
});

describe("Schift auth readiness client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("signs up against the configured base URL without an API key", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          user: {
            id: "usr_1",
            email: "smoke@example.test",
            name: "Smoke",
            onboarded: false,
          },
          org: {
            id: "org_1",
            name: "Smoke Org",
            slug: "smoke",
            tier: "free",
            region: "seoul",
            role: "owner",
          },
          token: "jwt_token",
          is_new_user: true,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const auth = new SchiftAuth({ baseUrl: "http://127.0.0.1:8011/" });
    const response = await auth.signup({
      email: "smoke@example.test",
      password: "SmokePass1234!",
      name: "Smoke",
      orgName: "Smoke Org",
    });

    expect(response.token).toBe("jwt_token");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/v1/auth/signup",
      expect.objectContaining({
        method: "POST",
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
        body: JSON.stringify({
          email: "smoke@example.test",
          password: "SmokePass1234!",
          name: "Smoke",
          org_name: "Smoke Org",
          region: "seoul",
        }),
      }),
    );
  });

  it("checks /v1/auth/me with the signup JWT", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          user: {
            id: "usr_1",
            email: "smoke@example.test",
            name: "Smoke",
            onboarded: false,
          },
          orgs: [
            {
              id: "org_1",
              name: "Smoke Org",
              slug: "smoke",
              tier: "free",
              region: "seoul",
              role: "owner",
            },
          ],
          pendingInvites: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const me = await Schift.auth({ baseUrl: "http://127.0.0.1:8011" }).me(
      "jwt_token",
    );

    expect(me.user.id).toBe("usr_1");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/v1/auth/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer jwt_token",
          Accept: "application/json",
        }),
      }),
    );
  });

});
