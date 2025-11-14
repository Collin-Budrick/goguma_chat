"use client";

import type { ChatConversation, ChatMessage } from "./types";

const DB_NAME = "chat:conversations";
const STORE_NAME = "snapshots";
const DB_VERSION = 1;

export type ConversationSnapshot = {
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  nextCursor: string | null;
  updatedAt: number;
};

export type ConversationStorage = {
  read(conversationId: string): Promise<ConversationSnapshot | null>;
  write(conversationId: string, snapshot: ConversationSnapshot): Promise<void>;
  delete(conversationId: string): Promise<void>;
  clear(): Promise<void>;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open conversation storage"));
    };
  });
}

function normalizeSnapshot(
  conversationId: string,
  value: unknown,
): ConversationSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<ConversationSnapshot & { id?: string }>;
  if (record && "id" in record && record.id !== conversationId) {
    return null;
  }

  return {
    conversation: (record?.conversation as ChatConversation | null) ?? null,
    messages: Array.isArray(record?.messages)
      ? (record.messages as ChatMessage[])
      : [],
    nextCursor:
      typeof record?.nextCursor === "string" || record?.nextCursor === null
        ? (record?.nextCursor ?? null)
        : null,
    updatedAt:
      typeof record?.updatedAt === "number" && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : 0,
  } satisfies ConversationSnapshot;
}

function createStorage(db: IDBDatabase): ConversationStorage {
  const run = <T,>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ) =>
    new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = operation(store);

      request.onsuccess = () => {
        resolve(request.result as T);
      };

      request.onerror = () => {
        reject(request.error ?? new Error("Conversation storage request failed"));
      };

      tx.onabort = () => {
        reject(tx.error ?? new Error("Conversation storage transaction aborted"));
      };
    });

  return {
    async read(conversationId) {
      const result = await run("readonly", (store) => store.get(conversationId));
      return normalizeSnapshot(conversationId, result);
    },
    async write(conversationId, snapshot) {
      await run("readwrite", (store) =>
        store.put({ id: conversationId, ...snapshot }),
      );
    },
    async delete(conversationId) {
      await run("readwrite", (store) => store.delete(conversationId));
    },
    async clear() {
      await run("readwrite", (store) => store.clear());
    },
  } satisfies ConversationStorage;
}

let storagePromise: Promise<ConversationStorage | null> | null = null;

export function getConversationStorage(): Promise<ConversationStorage | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  if (!storagePromise) {
    storagePromise = openDatabase()
      .then((db) => {
        db.onversionchange = () => {
          db.close();
        };
        return createStorage(db);
      })
      .catch((error) => {
        console.error("Failed to initialize conversation storage", error);
        return null;
      });
  }

  return storagePromise;
}
