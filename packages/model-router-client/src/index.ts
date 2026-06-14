// Typed client for the model-router service. Used server-side by the console's
// route-handler proxy (so provider keys + service URLs stay off the browser).

export interface RouteRequest {
  prompt_id?: string;
  prompt_key?: string;
  version?: number;
  vars?: Record<string, unknown>;
  model_pref?: string;
  project_id?: string;
}

export interface RouteResponse {
  text: string;
  model: string;
  tokens: { input: number; output: number };
  cost_usd: number;
  latency_ms: number;
  prompt_version: number;
}

export interface PromptVersion {
  version: number;
  template: string;
  default_model: string | null;
  is_active: boolean;
}

export class ModelRouterError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ModelRouterError";
  }
}

export class ModelRouterClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || process.env.MODEL_ROUTER_URL || "http://localhost:8789").replace(/\/$/, "");
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ModelRouterError(res.status, await res.text());
    }
    return (await res.json()) as T;
  }

  route(req: RouteRequest): Promise<RouteResponse> {
    return this.post<RouteResponse>("/v1/route", { vars: {}, ...req });
  }

  createPrompt(key: string, name: string): Promise<{ id: string; key: string }> {
    return this.post("/v1/prompts", { key, name });
  }

  addVersion(
    key: string,
    v: { version?: number; template: string; default_model?: string; activate?: boolean },
  ): Promise<PromptVersion> {
    return this.post(`/v1/prompts/${encodeURIComponent(key)}/versions`, v);
  }

  activate(key: string, version: number): Promise<{ key: string; active_version: number }> {
    return this.post(`/v1/prompts/${encodeURIComponent(key)}/activate?version=${version}`, {});
  }

  async getPrompt(key: string): Promise<{ key: string; active_version: number | null; versions: PromptVersion[] }> {
    const res = await fetch(`${this.baseUrl}/v1/prompts/${encodeURIComponent(key)}`);
    if (!res.ok) throw new ModelRouterError(res.status, await res.text());
    return (await res.json()) as { key: string; active_version: number | null; versions: PromptVersion[] };
  }
}
