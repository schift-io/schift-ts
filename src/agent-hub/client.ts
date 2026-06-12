/** Document Agent SDK client — Agent Hub facade(`/v1/agent-hub`) 경유.
 *
 * API key에는 `agents:documents:run` scope가 필요하다. 세션 생성(bootstrap)
 * → 요청 메모리 적재 → (선택) intake 문답 → agentic run → 산출물 조회를
 * 한 번의 `.run()`으로 묶는다. run 자체가 동기 응답(완료까지 블로킹)이라
 * 폴링은 없다 — facade 타임아웃(기본 600s) 안에서 끝난다.
 */

import type { HttpTransport } from "../workflow/client.js";
import type {
  AgentHubAgentListing,
  AgentHubArtifact,
  AgentHubIntakeQuestion,
  DocumentRunOptions,
  DocumentRunResult,
} from "./types.js";

const FACADE = "/v1/agent-hub";

function toCamel<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const camelKey = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camelKey] = v;
  }
  return result as T;
}

function randomConversationId(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class AgentHubClient {
  constructor(private readonly http: HttpTransport) {}

  /** 사용 가능한 문서 에이전트 팩 목록. */
  async listAgents(): Promise<AgentHubAgentListing[]> {
    const raw = await this.http.get<Record<string, unknown>[]>(
      `${FACADE}/v1/agents`,
    );
    return raw.map((r) => toCamel<AgentHubAgentListing>(r));
  }

  /** 팩 핸들 — `client.agentHub.document("bizplan").run({...})`. */
  document(agentId: string): DocumentAgent {
    return new DocumentAgent(this.http, agentId);
  }
}

export class DocumentAgent {
  constructor(
    private readonly http: HttpTransport,
    private readonly agentId: string,
  ) {}

  async run(options: DocumentRunOptions): Promise<DocumentRunResult> {
    const tenant = options.tenant ?? "default";
    const userId = options.userId ?? "sdk";
    const conversationId = options.conversationId ?? randomConversationId();
    const sessionId = `${tenant}:${this.agentId}:${userId}:${conversationId}`;
    const base = `${FACADE}/v1/sessions/${encodeURIComponent(sessionId)}`;
    const envelope: Record<string, unknown> = {
      tenant_id: tenant,
      agent_id: this.agentId,
      user_id: userId,
      conversation_id: conversationId,
    };

    await this.http.post(`${base}/bootstrap`, {
      ...envelope,
      custom_sections: options.customSections ?? [],
      user_skills: options.userSkills ?? [],
    });
    await this.http.post(`${base}/memory:append`, {
      ...envelope,
      role: "user",
      kind: "summary",
      content_redacted: options.message,
      tags: ["schift-sdk", "document-agent"],
    });

    if (options.onIntake && !options.skipIntake) {
      await this.handleIntake(base, envelope, options);
    }

    const run = await this.http.post<Record<string, unknown>>(
      `${base}/agentic-runs`,
      { ...envelope },
    );
    const artifacts = await this.http.get<Record<string, unknown>[]>(
      `${base}/artifacts`,
    );

    return {
      runId: String(run.run_id ?? ""),
      sessionId,
      status: String(run.status ?? ""),
      usage: (run.usage_summary as Record<string, unknown>) ?? {},
      qc: (run.qc as Record<string, unknown> | null) ?? null,
      observations: (run.observations as Record<string, unknown>) ?? {},
      inferenceHardware: String(run.inference_hardware ?? ""),
      artifacts: artifacts.map((a) => toCamel<AgentHubArtifact>(a)),
    };
  }

  private async handleIntake(
    base: string,
    envelope: Record<string, unknown>,
    options: DocumentRunOptions,
  ): Promise<void> {
    const intake = await this.http.post<Record<string, unknown>>(
      `${base}/intake:question`,
      { ...envelope, user_message: options.message },
    );
    if (!intake.should_ask || !intake.question) return;
    const question: AgentHubIntakeQuestion = {
      question: String(intake.question),
      answerOptions: (intake.answer_options as string[]) ?? [],
      nextAction: String(intake.next_action ?? ""),
    };
    const answer = await options.onIntake!(question);
    if (!answer) return;
    await this.http.post(`${base}/intake:answer`, {
      ...envelope,
      question: question.question,
      answer,
    });
  }
}
