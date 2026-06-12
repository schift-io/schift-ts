import { afterEach, describe, expect, it, vi } from "vitest";
import { Schift } from "../client.js";

/**
 * AgentHubClient (`client.agentHub`) — facade `/v1/agent-hub` 경유 문서
 * 에이전트 run 래퍼. 호출 순서(bootstrap → memory:append → [intake] →
 * agentic-runs → artifacts)와 응답 camelCase 매핑을 고정한다.
 */
describe("AgentHubClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const RUN = {
    run_id: "run_1",
    session_id: "acme:bizplan:sdk:conv-1",
    status: "completed",
    usage_summary: { billed_cost_usd: 0.0013 },
    qc: { verdict: "PASS" },
    observations: { sections: 5 },
    inference_hardware: "hosted",
    markdown_artifact_id: "art_md",
    html_artifact_id: "art_html",
  };
  const ARTIFACTS = [
    {
      artifact_id: "art_md",
      session_id: "acme:bizplan:sdk:conv-1",
      type: "document",
      format: "markdown",
      title: "사업계획서.md",
      content_ref: null,
      content: "# 본문",
      metadata: {},
      version: 1,
      created_at: "2026-06-12T05:00:00Z",
    },
  ];

  function routeFetch(
    calls: Array<{ method: string; path: string; body: unknown }>,
    intake?: Record<string, unknown>,
  ) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const path = new URL(url).pathname;
      calls.push({
        method: init?.method ?? "GET",
        path,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (path.endsWith("/agentic-runs")) return jsonResponse(RUN);
      if (path.endsWith("/artifacts")) return jsonResponse(ARTIFACTS);
      if (path.endsWith("/intake:question"))
        return jsonResponse(intake ?? { should_ask: false });
      return jsonResponse({ ok: true });
    });
  }

  it("run() executes the full lifecycle in order and remaps the result", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    globalThis.fetch = routeFetch(calls) as typeof fetch;

    const client = new Schift({ apiKey: "sch_x" });
    const result = await client.agentHub.document("bizplan").run({
      message: "전기차 충전 사업계획서",
      tenant: "acme",
      conversationId: "conv-1",
    });

    const sessionPath = encodeURIComponent("acme:bizplan:sdk:conv-1");
    expect(calls.map((c) => c.path)).toEqual([
      `/v1/agent-hub/v1/sessions/${sessionPath}/bootstrap`,
      `/v1/agent-hub/v1/sessions/${sessionPath}/memory:append`,
      `/v1/agent-hub/v1/sessions/${sessionPath}/agentic-runs`,
      `/v1/agent-hub/v1/sessions/${sessionPath}/artifacts`,
    ]);
    const memoryBody = calls[1].body as Record<string, unknown>;
    expect(memoryBody.content_redacted).toBe("전기차 충전 사업계획서");
    expect(memoryBody.tenant_id).toBe("acme");

    expect(result.runId).toBe("run_1");
    expect(result.sessionId).toBe("acme:bizplan:sdk:conv-1");
    expect(result.usage.billed_cost_usd).toBe(0.0013);
    expect(result.qc).toEqual({ verdict: "PASS" });
    expect(result.artifacts[0].artifactId).toBe("art_md");
    expect(result.artifacts[0].contentRef).toBeNull();
    expect(result.artifacts[0].content).toBe("# 본문");
  });

  it("run() asks intake only when a handler is provided and forwards the answer", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    globalThis.fetch = routeFetch(calls, {
      should_ask: true,
      question: "타깃 고객은 누구인가요?",
      answer_options: ["B2B", "B2C"],
      next_action: "generate",
    }) as typeof fetch;

    const client = new Schift({ apiKey: "sch_x" });
    const onIntake = vi.fn(async () => "B2B");
    await client.agentHub.document("bizplan").run({
      message: "사업계획서",
      tenant: "acme",
      conversationId: "conv-1",
      onIntake,
    });

    expect(onIntake).toHaveBeenCalledWith({
      question: "타깃 고객은 누구인가요?",
      answerOptions: ["B2B", "B2C"],
      nextAction: "generate",
    });
    const answerCall = calls.find((c) => c.path.endsWith("/intake:answer"));
    expect((answerCall?.body as Record<string, unknown>).answer).toBe("B2B");
  });

  it("run() skips intake entirely without a handler or with skipIntake", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    globalThis.fetch = routeFetch(calls, { should_ask: true, question: "?" }) as
      typeof fetch;

    const client = new Schift({ apiKey: "sch_x" });
    await client.agentHub.document("deck").run({
      message: "투자 덱",
      onIntake: async () => "무시되어야 함",
      skipIntake: true,
    });

    expect(calls.some((c) => c.path.includes("intake"))).toBe(false);
  });
});
