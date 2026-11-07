export type Language = 'ar' | 'en';

export type NavigationTab =
  | 'home'
  | 'chat'
  | 'courses'
  | 'evidence';

export type EvidenceLevel = 'verified_planning' | 'partial_planning' | 'catalog_only';

export type ReadinessState =
  | 'requirements_met'
  | 'missing_prerequisite'
  | 'corequisite_condition'
  | 'needs_verification';

export type StudentCourseStatus =
  | 'completed'
  | 'in_progress'
  | 'failed_not_passed'
  | 'desired';

export interface OllamaStatus {
  ollama_reachable: boolean;
  base_url: string;
  configured_chat_model: string;
  configured_embed_model: string;
  chat_model_installed: boolean;
  embed_model_installed: boolean;
  installed_models: string[];
  discovered_qwen_candidates: string[];
  error: string | null;
  actionable_guidance: string[];
}

export interface HealthResponse {
  status: string;
  service: string;
  institution_scope: string;
  backend_connected: boolean;
  sqlite_ready: boolean;
  dataset_loaded: boolean;
  ollama: OllamaStatus;
  portal_sync: string;
}

export interface ProgramEntry {
  program_id: string;
  program_code: string;
  department_id: string;
  faculty_id: string;
  name_ar: string;
  name_en: string;
  degree_level: string;
  evidence_level: EvidenceLevel;
  is_departmental_listing_only: boolean;
  total_credits_reported: number | null;
  caveat_note_ar: string;
  caveat_note_en: string;
  source_url: string;
  last_verified_at: string;
  course_row_count: number;
  prereq_rule_count: number;
  gap_count: number;
  conflict_count: number;
}

export interface CatalogCourseRow {
  row_id: string;
  course_number: string; // Preserved 7-digit string with leading zeros
  program_id: string;
  department_id: string;
  faculty_id: string;
  title_ar: string;
  title_en: string;
  is_arabic_placeholder: boolean;
  credit_hours: number | null;
  lecture_hours?: number | null;
  lab_hours?: number | null;
  description_ar?: string;
  description_en?: string;
  requirement_label: string;
  raw_prerequisite_text: string;
  source_id: string;
  source_url: string;
  last_verified_at: string;
  has_conflict: boolean;
  has_gap: boolean;
}

export interface PrerequisiteRuleRecord {
  rule_id: string;
  program_id: string;
  course_number: string;
  relation_type: 'prerequisite' | 'corequisite';
  parse_status: 'parsed' | 'raw_only' | 'ambiguous';
  parsed_expression_json: string | null;
  raw_prerequisite_text: string;
  has_special_condition: boolean;
  source_url: string;
}

export interface WebsiteConflictRecord {
  conflict_id: string;
  course_number: string;
  program_id: string;
  field_name: string;
  value_source_a: string;
  value_source_b: string;
  source_a_url: string;
  source_b_url: string;
  conflict_type: string;
  severity: string;
  description: string;
  resolution_status: string;
}

export interface DataGapRecord {
  gap_id: string;
  program_id: string;
  course_number: string;
  entity_type: string;
  missing_field: string;
  gap_category: string;
  impact_on_advising: string;
  description: string;
  source_url: string;
}

export interface ChatCitation {
  chunk_id: string;
  course_number: string;
  program_id: string;
  title_ar: string;
  title_en: string;
  credit_hours: number | null;
  source_url: string;
  last_verified_at: string;
  effective_policy_date: string;
  page_number: number | null;
  has_conflict: boolean;
  has_gap: boolean;
  excerpt: string;
}

export interface ChatResponse {
  language?: Language;
  status: 'answered' | 'refused' | 'ollama_unavailable' | 'backend_disconnected';
  refusal_type: string | null;
  answer?: string | null;
  answer_ar?: string | null;
  answer_en?: string | null;
  error?: string | null;
  citations: ChatCitation[];
  conflicts: WebsiteConflictRecord[];
  gaps: DataGapRecord[];
  model_used: string | null;
  ollama_connected: boolean;
  is_illustrative_demo?: boolean;
}

export interface StudentCourseEntry {
  course_number: string;
  status: StudentCourseStatus;
  is_repeat: boolean;
  is_transfer_or_substitution: boolean;
}

export interface CourseEvaluationItem {
  course_number: string;
  title_ar: string;
  title_en: string;
  credit_hours: number | null;
  readiness_state: ReadinessState;
  requirement_label: string;
  is_mandatory_proven: boolean;
  reasons_en: string[];
  reasons_ar: string[];
  missing_courses: string[];
  corequisite_courses: string[];
  raw_prerequisite_text: string;
  parse_status: string;
  has_conflict: boolean;
  source_url: string;
  last_verified_at: string;
  official_approval_disclaimer_en: string;
  official_approval_disclaimer_ar: string;
}

export interface PlannerEvaluationResponse {
  program_id: string;
  program_name_ar: string;
  program_name_en: string;
  evidence_level: EvidenceLevel;
  is_departmental_listing_only: boolean;
  degree_audit_guaranteed: boolean;
  official_graduation_percentage: number | null;
  degree_audit_refusal_reason_en: string;
  degree_audit_refusal_reason_ar: string;
  credits_summary: {
    validated_completed_credits: number;
    counted_courses: Array<{
      course_number: string;
      title_ar: string;
      title_en: string;
      credit_hours: number;
    }>;
    unverified_or_excluded_courses: Array<{
      course_number: string;
      reason_en: string;
      reason_ar: string;
    }>;
    duplicate_completed_inputs_ignored: string[];
    repeated_courses_flagged: string[];
    transfer_or_substitution_flagged: string[];
  };
  course_evaluations: CourseEvaluationItem[];
  next_semester_suggestions: Array<{
    course_number: string;
    title_ar: string;
    title_en: string;
    credit_hours: number | null;
    readiness_state: ReadinessState;
    suggestion_disclaimer_en: string;
    suggestion_disclaimer_ar: string;
  }>;
  evaluated_via: 'local_fastapi_backend' | 'offline_deterministic_engine';
}
