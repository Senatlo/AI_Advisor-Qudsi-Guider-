import { CatalogCourseRow, ChatResponse, HealthResponse, Language, ProgramEntry } from '../types/advisor';

const configuredBaseUrl = (import.meta.env?.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

function buildApiUrl(path: string): string {
  // Use relative /api path by default so Vite local proxy handles CORS cleanly
  if (!configuredBaseUrl || configuredBaseUrl === 'http://127.0.0.1:8000') {
    return path;
  }
  return `${configuredBaseUrl}${path}`;
}

async function fetchJsonWithTimeout<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 4500
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildApiUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Local Python FastAPI backend did not return JSON (likely not running).');
    }
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
    }
    return data as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function checkBackendHealth(): Promise<{
  connected: boolean;
  health: HealthResponse | null;
  error: string | null;
}> {
  try {
    const health = await fetchJsonWithTimeout<HealthResponse>('/api/health', {}, 3000);
    if (health && health.service === 'alquds-ai-academic-advisor-backend') {
      return { connected: true, health, error: null };
    }
    return {
      connected: false,
      health: null,
      error: 'Local Python FastAPI backend not detected on /api/health.',
    };
  } catch (err) {
    return {
      connected: false,
      health: null,
      error:
        err instanceof Error
          ? err.message
          : 'Local Python FastAPI backend and local Ollama are not connected.',
    };
  }
}

export async function fetchPrograms(): Promise<{
  fromLiveBackend: boolean;
  datasetLoaded: boolean;
  programs: ProgramEntry[];
}> {
  try {
    const data = await fetchJsonWithTimeout<{
      dataset_loaded: boolean;
      programs: ProgramEntry[];
    }>('/api/programs');
    if (Array.isArray(data.programs) && data.programs.length > 0) {
      return {
        fromLiveBackend: true,
        datasetLoaded: data.dataset_loaded,
        programs: data.programs,
      };
    }
    return {
      fromLiveBackend: true,
      datasetLoaded: false,
      programs: [],
    };
  } catch {
    return {
      fromLiveBackend: false,
      datasetLoaded: false,
      programs: [],
    };
  }
}

export async function fetchCourses(params: {
  q?: string;
  program_id?: string;
  has_conflict?: boolean;
  page?: number;
  page_size?: number;
}): Promise<{
  fromLiveBackend: boolean;
  total: number;
  courses: CatalogCourseRow[];
}> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.program_id) searchParams.set('program_id', params.program_id);
  if (params.has_conflict !== undefined) {
    searchParams.set('has_conflict', String(params.has_conflict));
  }
  searchParams.set('page', String(params.page || 1));
  searchParams.set('page_size', String(params.page_size || 25));

  try {
    const res = await fetchJsonWithTimeout<{
      total: number;
      courses: CatalogCourseRow[];
    }>(`/api/courses?${searchParams.toString()}`);
    return {
      fromLiveBackend: true,
      total: res.total,
      courses: res.courses,
    };
  } catch {
    return {
      fromLiveBackend: false,
      total: 0,
      courses: [],
    };
  }
}

export async function submitAdvisorChat(payload: {
  query: string;
  language: Language;
  program_id?: string;
  session_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<ChatResponse> {
  try {
    return await fetchJsonWithTimeout<ChatResponse>(
      '/api/chat',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      195000
    );
  } catch (err) {
    // CRITICAL RULE: Never simulate a live AI answer when Python/Ollama is unreachable.
    return {
      status: 'backend_disconnected',
      language: payload.language,
      refusal_type: 'local_backend_not_connected',
      error:
        err instanceof Error
          ? err.message
          : 'Local Python FastAPI and Ollama runtime are not connected.',
      answer_ar:
        'الخادم المحلي غير متصل (Local backend not connected): لا يمكن توليد إجابة حية لأن خادم Python FastAPI المحلي ونموذج Ollama (Qwen) غير متصلين بهذه المعاينة السحابية. يرجى تشغيل الخادم محلياً أو استعراض الأمثلة التوضيحية الموسومة بوضوح.',
      answer_en:
        'Local backend not connected: Cannot generate a live answer because your local Python FastAPI server and local Ollama (Qwen) runtime are not reachable from this browser preview. Run the backend locally or inspect the clearly labeled illustrative UI demo cards.',
      citations: [],
      conflicts: [],
      gaps: [],
      model_used: null,
      ollama_connected: false,
    };
  }
}

export function preserveSevenDigitCode(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed) && trimmed.length < 7) {
    return trimmed.padStart(7, '0');
  }
  return trimmed;
}
