export interface Stats {
  total_processed: number;
  total_errors: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  processed_today: number;
  last_scan: string | null;
}

export interface ClaudeAnalysis {
  title: string;
  correspondent: string;
  document_type: string;
  tags: string[];
  summary: string;
  language: string;
}

export interface ProcessingResult {
  document_id: number;
  document_title: string;
  success: boolean;
  analysis: ClaudeAnalysis | null;
  error: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  processed_at: string;
  duration_seconds: number;
}
