export { loadConfig } from "./core/config.js";
export { scanContextDocuments } from "./core/indexer.js";
export { buildStructuredDocument } from "./core/structured-document.js";
export { ContextStore, openContextStore } from "./core/store.js";
export { ContextWatcher } from "./core/watcher.js";
export { initWorkspace } from "./core/scaffold.js";
export { runDoctor } from "./core/doctor.js";
export { isSupportedMcpTarget, renderMcpConfig, stringifyMcpConfig, supportedMcpTargets } from "./core/mcp-config.js";
export type {
  Annotation,
  ContextDocument,
  ContextHubConfig,
  DomainCount,
  IndexerError,
  KeyFile,
  ReindexReport,
  ScanResult,
  SearchResult,
  StateMachine,
  StructuredDocument,
  StructuredPitfall,
  StructuredSection,
} from "./core/types.js";
