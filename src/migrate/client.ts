/**
 * Migration client — vectors-in migration into the schift-embed-1-small 1024d hub.
 *
 * @example
 * ```ts
 * const q = await schift.migrate.quote({
 *   n_tokens: 1_000_000,
 *   source_profile: "vector_store",
 * });
 * if (!q.contact_sales) {
 *   const job = await schift.migrate.start({
 *     source,
 *     target_collection_id: "col_x",
 *     n_tokens: 1_000_000,
 *     source_profile: "vector_store",
 *   });
 *   // poll
 *   const status = await schift.migrate.status(job.job_id);
 * }
 * ```
 */

import type { HttpTransport } from "../workflow/client.js";

export type ConnectorKind = "pgvector" | "chroma" | "pinecone" | "weaviate";

export interface SourceConfig {
  kind: ConnectorKind;
  config: Record<string, unknown>;
}

export interface FeasibilityRequest {
  source_model: string;
  target_model?: string; // defaults schift-embed-1-small
  source_vectors: number[][];
  target_vectors: number[][];
}

export interface FeasibilityResponse {
  cka: number;
  recommended_method: "procrustes" | "ridge" | "re_embed";
  holdout_cosine: number;
  calibration_samples_recommended: number;
  notes: string;
}

export type MigrationSourceProfile = "vector_store" | "obsidian_vault";
export type MigrationSlaTier = "std" | "scale";
export type MigrationTier =
  | "starter_trial"
  | "pro_trial"
  | "paid_std"
  | "paid_scale"
  | "contact_sales";

export interface QuoteRequest {
  n_tokens: number;
  source_profile: MigrationSourceProfile;
  sla_tier?: MigrationSlaTier;
}

export interface QuoteResponse {
  tier: MigrationTier;
  trial_plan: "starter" | "pro" | null;
  trial_months: number | null;
  customer_price_usd: number;
  vendor_full_cost_usd: number;
  card_required: boolean;
  contact_sales: boolean;
  savings_vs_vendor_direct_usd: number;
  source_profile: MigrationSourceProfile;
  pipeline: string;
  ocr_required: boolean;
  messaging: string;
}

export interface StartRequest {
  source: SourceConfig;
  target_collection_id: string;
  n_tokens: number;
  source_profile: MigrationSourceProfile;
  sla_tier?: MigrationSlaTier;
  confirmed_price_usd?: number;
  method?: "ridge" | "procrustes";
  retain_on_cloud?: boolean;
}

export interface StartResponse {
  job_id: string;
  state: string;
  tier: MigrationTier;
  trial_plan: "starter" | "pro" | null;
  trial_months: number | null;
  customer_price_usd: number;
  card_required: boolean;
  requires_payment: boolean;
  checkout_url: string | null;
  quote: QuoteResponse;
  messaging: string;
}

export interface JobStatus {
  job_id: string;
  state: string;
  progress: number;
  n_total: number;
  n_projected: number;
  cka: number | null;
  sample_retention: number | null;
  error: string | null;
}

const BASE = "/v1/migrate";

export class MigrateClient {
  private readonly http: HttpTransport;

  constructor(http: HttpTransport) {
    this.http = http;
  }

  /** CKA + holdout Ridge cosine; recommends method. No charge. */
  async feasibility(request: FeasibilityRequest): Promise<FeasibilityResponse> {
    return this.http.post<FeasibilityResponse>(`${BASE}/feasibility`, {
      target_model: "schift-embed-1-small",
      ...request,
    });
  }

  /** Token/profile-aware quote used by the migration service runtime. */
  async quote(request: QuoteRequest): Promise<QuoteResponse> {
    return this.http.post<QuoteResponse>(`${BASE}/quote`, {
      sla_tier: "std",
      ...request,
    });
  }

  /** Kick off async migration. Server re-quotes n_tokens/source_profile before creating a job. */
  async start(request: StartRequest): Promise<StartResponse> {
    return this.http.post<StartResponse>(`${BASE}/start`, {
      method: "ridge",
      retain_on_cloud: true,
      sla_tier: "std",
      ...request,
    });
  }

  /** Poll a migration job. */
  async status(jobId: string): Promise<JobStatus> {
    return this.http.get<JobStatus>(`${BASE}/${jobId}`);
  }
}
