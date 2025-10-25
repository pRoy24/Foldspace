import { promises as fs } from "node:fs";
import path from "node:path";

import type { SessionRecord } from "../types";

export interface SessionStore {
  init(): Promise<void>;
  list(): Promise<SessionRecord[]>;
  get(id: string): Promise<SessionRecord | undefined>;
  insert(record: SessionRecord): Promise<void>;
  update(id: string, updater: (record: SessionRecord) => SessionRecord): Promise<SessionRecord>;
}

function cloneRecord(record: SessionRecord): SessionRecord {
  return JSON.parse(JSON.stringify(record)) as SessionRecord;
}

export class FileSessionStore implements SessionStore {
  private readonly filePath: string;
  private initialized = false;
  private readonly cache = new Map<string, SessionRecord>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as SessionRecord[];
      for (const record of parsed) {
        this.cache.set(record.id, record);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        await this.persist();
      } else {
        throw error;
      }
    }

    this.initialized = true;
  }

  async list(): Promise<SessionRecord[]> {
    await this.ensureReady();
    return Array.from(this.cache.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async get(id: string): Promise<SessionRecord | undefined> {
    await this.ensureReady();
    return this.cache.get(id);
  }

  async insert(record: SessionRecord): Promise<void> {
    await this.ensureReady();
    this.cache.set(record.id, record);
    await this.enqueuePersist();
  }

  async update(id: string, updater: (record: SessionRecord) => SessionRecord): Promise<SessionRecord> {
    await this.ensureReady();
    const existing = this.cache.get(id);
    if (!existing) {
      throw new Error(`Session ${id} not found`);
    }

    const draft = cloneRecord(existing);
    const updated = updater(draft);
    this.cache.set(id, updated);
    await this.enqueuePersist();
    return updated;
  }

  private async ensureReady(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private async enqueuePersist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.persist());
    return this.writeQueue.catch((error) => {
      console.error("Failed to persist session store", error);
      throw error;
    });
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const payload = JSON.stringify(Array.from(this.cache.values()), null, 2);
    await fs.writeFile(this.filePath, payload, "utf-8");
  }
}
