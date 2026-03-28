export type ConfidenceLevel = "high" | "medium" | "low";

export interface ContextDocument {
  path: string;
  title: string;
  domain: string;
  tags: string[];
  confidence: ConfidenceLevel;
  content: string;
  lastVerified: string | null;
}

export interface IndexerError {
  path: string;
  message: string;
}

export interface ScanResult {
  documents: ContextDocument[];
  errors: IndexerError[];
}

export interface SearchOptions {
  domain?: string;
  limit?: number;
}

export interface SearchResult extends ContextDocument {
  snippet: string;
}

export interface Annotation {
  id: number;
  documentPath: string;
  note: string;
  author: string;
  createdAt: string;
}

export interface DomainCount {
  domain: string;
  count: number;
}

export interface StructuredSection {
  title: string;
  level: number;
  body: string;
}

export interface KeyFile {
  path: string;
  description: string;
}

export interface StateMachine {
  section: string;
  diagram: string;
}

export interface StructuredPitfall {
  path: string;
  title: string;
  confidence: ConfidenceLevel;
  lastVerified: string | null;
  content: string;
}

export interface StructuredDocument {
  path: string;
  title: string;
  domain: string;
  tags: string[];
  confidence: ConfidenceLevel;
  lastVerified: string | null;
  keyFiles: KeyFile[];
  stateMachines: StateMachine[];
  pitfalls: StructuredPitfall[];
  sections: StructuredSection[];
}

export interface ContextHubConfig {
  cwd: string;
  configPath: string | null;
  contextDir: string;
  dbPath: string;
  watch: boolean;
  reindexDebounceMs: number;
  includeGlobs: string[];
  excludeGlobs: string[];
}

export interface LoadConfigOptions {
  cwd?: string;
  config?: string;
  contextDir?: string;
  dbPath?: string;
  watch?: boolean;
  reindexDebounceMs?: number;
  includeGlobs?: string[];
  excludeGlobs?: string[];
}

export interface ReindexReport {
  indexedCount: number;
  errors: IndexerError[];
}
