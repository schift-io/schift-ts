/** Document Agent (Agent Hub) types — facade `/v1/agent-hub` 경유. */

export interface AgentHubIntakeQuestion {
  question: string;
  answerOptions: string[];
  nextAction: string;
}

/** 답을 돌려주면 intake:answer로 전달, null이면 건너뛴다. */
export type IntakeHandler = (
  question: AgentHubIntakeQuestion,
) => string | null | Promise<string | null>;

export interface DocumentRunOptions {
  /** 문서로 만들 사용자 요청. 세션 메모리에 들어가 생성에 반영된다. */
  message: string;
  /**
   * 세션 네임스페이스 (org slug 권장). 과금/격리는 항상 API key의 org
   * 기준이므로 이 값은 세션 id 구성에만 쓰인다.
   */
  tenant?: string;
  /** 세션 id의 user 파트. 기본 "sdk". */
  userId?: string;
  /** 같은 값을 다시 쓰면 같은 세션(메모리)으로 이어진다. 기본 랜덤. */
  conversationId?: string;
  /** blank 팩 전용 — 문서 섹션 구성. */
  customSections?: Array<Record<string, unknown>>;
  /** /v1/skills 허브의 유저 스킬 manifest. */
  userSkills?: Array<Record<string, unknown>>;
  /** 팩의 intake 질문에 답할 핸들러. 없으면 intake 없이 바로 생성한다. */
  onIntake?: IntakeHandler;
  /** onIntake가 있어도 intake를 강제로 건너뛴다. */
  skipIntake?: boolean;
}

export interface AgentHubArtifact {
  artifactId: string;
  sessionId: string;
  type: string;
  format: string;
  title: string;
  contentRef: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: string;
}

export interface DocumentRunResult {
  runId: string;
  sessionId: string;
  status: string;
  usage: Record<string, unknown>;
  qc: Record<string, unknown> | null;
  observations: Record<string, unknown>;
  inferenceHardware: string;
  artifacts: AgentHubArtifact[];
}

export interface AgentHubAgentListing {
  agentId: string;
  name: string;
  [key: string]: unknown;
}
