import chokidar, { type FSWatcher } from "chokidar";

import type { ContextHubConfig } from "./types.js";

import { ContextStore } from "./store.js";

function isMarkdownPath(targetPath: string): boolean {
  return targetPath.endsWith(".md");
}

export class ContextWatcher {
  readonly #config: ContextHubConfig;
  readonly #store: ContextStore;
  #watcher: FSWatcher | null = null;
  #timer: NodeJS.Timeout | null = null;

  constructor(config: ContextHubConfig, store: ContextStore) {
    this.#config = config;
    this.#store = store;
  }

  start(): void {
    this.#watcher = chokidar.watch(this.#config.contextDir, {
      ignoreInitial: true,
      persistent: true,
    });

    const schedule = (changedPath: string): void => {
      if (!isMarkdownPath(changedPath)) {
        return;
      }

      if (this.#timer) {
        clearTimeout(this.#timer);
      }

      this.#timer = setTimeout(() => {
        this.#timer = null;
        void this.#store.reindex();
      }, this.#config.reindexDebounceMs);
    };

    this.#watcher.on("add", schedule);
    this.#watcher.on("change", schedule);
    this.#watcher.on("unlink", schedule);
  }

  async close(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }

    await this.#watcher?.close();
    this.#watcher = null;
  }
}
