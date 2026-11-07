export interface KnowledgeStatus {
  dataset_loaded: boolean;
  observed_counts: Record<string, number>;
  chroma_status: { available: boolean; vector_count: number; embedding_model?: string };
  latest_ingestion?: { observed_counts?: Record<string, number> };
}

export interface SourceRecord { source_id: string; title: string; url: string }

export async function fetchKnowledgeStatus(): Promise<KnowledgeStatus> {
  const response = await fetch('/api/knowledge/status', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Knowledge status is unavailable');
  return response.json();
}

export async function fetchSourceRecords(): Promise<SourceRecord[]> {
  const response = await fetch('/api/evidence', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Sources are unavailable');
  const data = await response.json();
  return (data.sources || []).filter((source: SourceRecord) => /^https?:\/\//.test(source.url));
}
