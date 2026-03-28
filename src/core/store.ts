import { mkdir } from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

import { scanContextDocuments } from "./indexer.js";

import type {
  Annotation,
  ContextDocument,
  ContextHubConfig,
  DomainCount,
  ReindexReport,
  SearchOptions,
  SearchResult,
  TagCount,
} from "./types.js";

interface OpenStoreOptions {
  reindexOnOpen?: boolean;
}

function normalizeSearchQuery(query: string): string {
  const normalized = query.replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  if (!normalized) {
    throw new Error("Search query must contain letters or numbers");
  }

  return normalized
    .split(/\s+/)
    .map(term => `"${term}"`)
    .join(" ");
}

function decodeTags(tags: string): string[] {
  try {
    const decoded = JSON.parse(tags) as unknown;
    return Array.isArray(decoded) ? decoded.filter(tag => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function mapDocumentRow(row: Record<string, unknown>): ContextDocument {
  return {
    path: String(row.path),
    title: String(row.title),
    domain: String(row.domain),
    tags: decodeTags(String(row.tags ?? "[]")),
    confidence: String(row.confidence) as ContextDocument["confidence"],
    content: String(row.content),
    lastVerified: row.last_verified ? String(row.last_verified) : null,
  };
}

export class ContextStore {
  readonly #config: ContextHubConfig;
  readonly #db: Database.Database;

  private constructor(config: ContextHubConfig, db: Database.Database) {
    this.#config = config;
    this.#db = db;
  }

  static async open(
    config: ContextHubConfig,
    options: OpenStoreOptions = {},
  ): Promise<ContextStore> {
    await mkdir(path.dirname(config.dbPath), { recursive: true });

    const db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");

    const store = new ContextStore(config, db);
    store.setupSchema();

    if (options.reindexOnOpen ?? true) {
      await store.reindex();
    }

    return store;
  }

  private setupSchema(): void {
    const statements = [
      `CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        domain TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        confidence TEXT NOT NULL DEFAULT 'medium',
        content TEXT NOT NULL,
        last_verified TEXT,
        indexed_at TEXT NOT NULL
      )`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        title,
        content,
        domain,
        tags,
        content=documents,
        content_rowid=id
      )`,
      `CREATE TABLE IF NOT EXISTS annotations (
        id INTEGER PRIMARY KEY,
        document_path TEXT NOT NULL,
        note TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'agent',
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY,
        document_path TEXT NOT NULL,
        helpful INTEGER NOT NULL,
        context TEXT,
        created_at TEXT NOT NULL
      )`,
    ];

    for (const statement of statements) {
      this.#db.exec(statement);
    }
  }

  async close(): Promise<void> {
    this.#db.close();
  }

  async reindex(): Promise<ReindexReport> {
    const result = await scanContextDocuments(this.#config);
    const now = new Date().toISOString();

    const deleteMissing = this.#db.prepare(
      "DELETE FROM documents WHERE path NOT IN (SELECT value FROM json_each(?))",
    );
    const deleteAll = this.#db.prepare("DELETE FROM documents");
    const upsertDocument = this.#db.prepare(
      `INSERT INTO documents (path, title, domain, tags, confidence, content, last_verified, indexed_at)
       VALUES (@path, @title, @domain, @tags, @confidence, @content, @lastVerified, @indexedAt)
       ON CONFLICT(path) DO UPDATE SET
         title = excluded.title,
         domain = excluded.domain,
         tags = excluded.tags,
         confidence = excluded.confidence,
         content = excluded.content,
         last_verified = excluded.last_verified,
         indexed_at = excluded.indexed_at`,
    );

    const transaction = this.#db.transaction((documents: ContextDocument[]) => {
      if (documents.length === 0) {
        deleteAll.run();
      } else {
        deleteMissing.run(JSON.stringify(documents.map(document => document.path)));
      }

      for (const document of documents) {
        upsertDocument.run({
          path: document.path,
          title: document.title,
          domain: document.domain,
          tags: JSON.stringify(document.tags),
          confidence: document.confidence,
          content: document.content,
          lastVerified: document.lastVerified,
          indexedAt: now,
        });
      }

      this.#db
        .prepare("DELETE FROM annotations WHERE document_path NOT IN (SELECT path FROM documents)")
        .run();
      this.#db
        .prepare("DELETE FROM feedback WHERE document_path NOT IN (SELECT path FROM documents)")
        .run();
      this.#db.prepare("INSERT INTO documents_fts(documents_fts) VALUES ('rebuild')").run();
    });

    transaction(result.documents);

    return {
      indexedCount: result.documents.length,
      errors: result.errors,
    };
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const normalizedQuery = normalizeSearchQuery(query);
    const limit = options.limit ?? 10;

    const whereClauses: string[] = ["documents_fts MATCH ?"];
    const params: unknown[] = [normalizedQuery];

    if (options.domain !== undefined) {
      whereClauses.push("d.domain = ?");
      params.push(options.domain);
    }

    if (options.confidence !== undefined) {
      const minConfidenceValue =
        options.confidence === "high" ? 3 : options.confidence === "medium" ? 2 : 1;
      const confidenceRank = `CASE d.confidence WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 2 END`;
      whereClauses.push(`(${confidenceRank}) >= ?`);
      params.push(minConfidenceValue);
    }

    if (options.verified_after !== undefined) {
      whereClauses.push("d.last_verified > ?");
      params.push(options.verified_after);
    }

    if (options.verified_before !== undefined) {
      whereClauses.push("d.last_verified < ?");
      params.push(options.verified_before);
    }

    if (options.tags !== undefined && options.tags.length > 0) {
      const tagClauses = options.tags.map(() => `d.tags LIKE ?`).join(" OR ");
      whereClauses.push(`(${tagClauses})`);
      for (const tag of options.tags) {
        params.push(`%"${tag}"%`);
      }
    }

    params.push(limit);

    const sql = `SELECT d.path, d.title, d.domain, d.tags, d.confidence, d.content, d.last_verified,
                        snippet(documents_fts, 1, '[', ']', '...', 20) AS snippet
                 FROM documents_fts
                 JOIN documents d ON d.id = documents_fts.rowid
                 WHERE ${whereClauses.join(" AND ")}
                 ORDER BY rank
                 LIMIT ?`;

    const stmt = this.#db.prepare(sql);
    const rows = stmt.all(...(params as Parameters<typeof stmt.all>)) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      ...mapDocumentRow(row),
      snippet: String(row.snippet),
    }));
  }

  async listTags(domain?: string): Promise<TagCount[]> {
    const rows = (
      domain !== undefined
        ? this.#db
            .prepare(
              `SELECT value AS tag, COUNT(*) AS count
               FROM documents, json_each(documents.tags)
               WHERE domain = ?
               GROUP BY value
               ORDER BY count DESC, value ASC`,
            )
            .all(domain)
        : this.#db
            .prepare(
              `SELECT value AS tag, COUNT(*) AS count
               FROM documents, json_each(documents.tags)
               GROUP BY value
               ORDER BY count DESC, value ASC`,
            )
            .all()
    ) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      tag: String(row.tag),
      count: Number(row.count),
    }));
  }

  async get(documentPath: string): Promise<ContextDocument | null> {
    const resolvedPath = this.resolveDocumentPath(documentPath);

    if (!resolvedPath) {
      return null;
    }

    const row = this.#db
      .prepare(
        "SELECT path, title, domain, tags, confidence, content, last_verified FROM documents WHERE path = ?",
      )
      .get(resolvedPath) as Record<string, unknown> | undefined;

    return row ? mapDocumentRow(row) : null;
  }

  async listDomains(): Promise<DomainCount[]> {
    return (this.#db
      .prepare(
        "SELECT domain, COUNT(*) AS count FROM documents GROUP BY domain ORDER BY domain ASC",
      )
      .all() as Array<Record<string, unknown>>)
      .map(row => ({
        domain: String(row.domain),
        count: Number(row.count),
      }));
  }

  async getPitfalls(domain?: string): Promise<ContextDocument[]> {
    const rows = (
      domain !== undefined
        ? this.#db
            .prepare(
              `SELECT path, title, domain, tags, confidence, content, last_verified
               FROM documents
               WHERE path LIKE 'pitfalls/%' AND domain = ?
               ORDER BY path ASC`,
            )
            .all(domain)
        : this.#db
            .prepare(
              `SELECT path, title, domain, tags, confidence, content, last_verified
               FROM documents
               WHERE path LIKE 'pitfalls/%'
               ORDER BY path ASC`,
            )
            .all()
    ) as Array<Record<string, unknown>>;

    return rows.map(mapDocumentRow);
  }

  async annotate(documentPath: string, note: string, author = "agent"): Promise<void> {
    const resolvedPath = this.assertDocumentExists(documentPath);
    this.#db
      .prepare(
        "INSERT INTO annotations (document_path, note, author, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(resolvedPath, note, author, new Date().toISOString());
  }

  async rate(documentPath: string, helpful: boolean, context?: string): Promise<void> {
    const resolvedPath = this.assertDocumentExists(documentPath);
    this.#db
      .prepare(
        "INSERT INTO feedback (document_path, helpful, context, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(resolvedPath, helpful ? 1 : 0, context ?? null, new Date().toISOString());
  }

  async listAnnotations(documentPath?: string): Promise<Annotation[]> {
    const resolvedPath =
      documentPath !== undefined ? this.resolveDocumentPath(documentPath) : undefined;
    const rows = (
      documentPath !== undefined
        ? resolvedPath === null
          ? []
          : this.#db
              .prepare(
                `SELECT id, document_path, note, author, created_at
                 FROM annotations
                 WHERE document_path = ?
                 ORDER BY created_at DESC`,
              )
              .all(resolvedPath)
        : this.#db
            .prepare(
              `SELECT id, document_path, note, author, created_at
               FROM annotations
               ORDER BY created_at DESC`,
            )
            .all()
    ) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      id: Number(row.id),
      documentPath: String(row.document_path),
      note: String(row.note),
      author: String(row.author),
      createdAt: String(row.created_at),
    }));
  }

  async deleteAnnotation(id: number): Promise<void> {
    const row = this.#db
      .prepare("SELECT id FROM annotations WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Annotation not found: ${id}`);
    }

    this.#db.prepare("DELETE FROM annotations WHERE id = ?").run(id);
  }

  private resolveDocumentPath(documentPath: string): string | null {
    const exactRow = this.#db
      .prepare("SELECT path, domain FROM documents WHERE path = ? LIMIT 1")
      .get(documentPath) as Record<string, unknown> | undefined;

    if (exactRow) {
      return String(exactRow.path);
    }

    const separatorIndex = documentPath.indexOf("/");
    if (separatorIndex === -1) {
      return null;
    }

    const requestedDomain = documentPath.slice(0, separatorIndex);
    const candidatePath = documentPath.slice(separatorIndex + 1);

    if (!candidatePath) {
      return null;
    }

    const aliasedRow = this.#db
      .prepare("SELECT path, domain FROM documents WHERE path = ? LIMIT 1")
      .get(candidatePath) as Record<string, unknown> | undefined;

    if (aliasedRow && String(aliasedRow.domain) === requestedDomain) {
      return String(aliasedRow.path);
    }

    return null;
  }

  private assertDocumentExists(documentPath: string): string {
    const resolvedPath = this.resolveDocumentPath(documentPath);

    if (!resolvedPath) {
      throw new Error(`Document not found: ${documentPath}`);
    }

    return resolvedPath;
  }
}

export async function openContextStore(
  config: ContextHubConfig,
  options: OpenStoreOptions = {},
): Promise<ContextStore> {
  return ContextStore.open(config, options);
}
