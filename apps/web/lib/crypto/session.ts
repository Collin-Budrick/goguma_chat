"use client";

import type { TransportMessage } from "@/lib/messaging-transport";

export type PeerTrustState = {
  sessionId: string;
  localFingerprint: string | null;
  remoteFingerprint: string | null;
  trusted: boolean;
  lastRotation: number | null;
};

export type PeerCryptoSessionOptions = {
  sessionId: string;
  onPlaintext: (payload: TransportMessage) => void;
  onError?: (error: Error) => void;
};

export type PeerCryptoSession = {
  receive: (payload: TransportMessage) => Promise<void>;
  send: (payload: TransportMessage) => Promise<void>;
  attachTransmitter: (transmit: (payload: TransportMessage) => Promise<void>) => void;
  whenReady: () => Promise<void>;
  teardown: () => Promise<void>;
};

const DB_NAME = "goguma-peer-crypto";
const DB_VERSION = 1;
const STORE_KEYS = "keys";
const STORE_SESSIONS = "sessions";
const IDENTITY_KEY = "identity";
const KEY_ROTATION_INFO = new TextEncoder().encode("goguma-peer-session");
const HANDSHAKE_TIMEOUT_MS = 15_000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const isTransientTransportSendError = (error: Error) => {
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    message.includes("transport is not connected") ||
    message.includes("data channel is not open") ||
    message.includes("not ready to transmit")
  );
};

const createEmitter = <T>() => {
  const listeners = new Set<(value: T) => void>();
  return {
    emit(value: T) {
      listeners.forEach((listener) => {
        try {
          listener(value);
        } catch (error) {
          console.error("Peer crypto listener failed", error);
        }
      });
    },
    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as const;
};

const trustEmitter = createEmitter<PeerTrustState>();

const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  if (typeof window === "undefined" || typeof window.btoa !== "function") {
    return Buffer.from(binary, "binary").toString("base64");
  }
  return window.btoa(binary);
};

const base64ToBuffer = (value: string): ArrayBuffer => {
  if (typeof window === "undefined" || typeof window.atob !== "function") {
    return Buffer.from(value, "base64").buffer;
  }
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const bufferToHexGroups = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const hex = Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const groups: string[] = [];
  for (let index = 0; index < hex.length; index += 8) {
    groups.push(hex.slice(index, index + 8));
  }
  return groups.join(" ");
};

const inMemoryStores = {
  keys: new Map<string, unknown>(),
  sessions: new Map<string, unknown>(),
};

const getDatabase = () => {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve<IDBDatabase | null>(null);
  }

  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open peer crypto database", request.error);
      resolve(null);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: "sessionId" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onblocked = () => {
      reject(new Error("Peer crypto database upgrade blocked"));
    };
  });
};

const dbPromiseRef: { current: Promise<IDBDatabase | null> | null } = { current: null };

const getDatabaseOnce = () => {
  if (!dbPromiseRef.current) {
    dbPromiseRef.current = getDatabase();
  }
  return dbPromiseRef.current;
};

type IdentityStoreRecord = {
  id: typeof IDENTITY_KEY;
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
  fingerprint: string;
};

type SessionStoreRecord = {
  sessionId: string;
  remotePublicKey: string | null;
  remoteFingerprint: string | null;
  trusted: boolean;
  lastRotation: number | null;
  sessionKey: string | null;
};

const loadIdentityRecord = async (): Promise<IdentityStoreRecord | null> => {
  const db = await getDatabaseOnce();
  if (!db) {
    return (inMemoryStores.keys.get(IDENTITY_KEY) as IdentityStoreRecord | undefined) ?? null;
  }

  return new Promise<IdentityStoreRecord | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_KEYS, "readonly");
    const store = transaction.objectStore(STORE_KEYS);
    const request = store.get(IDENTITY_KEY);

    request.onerror = () => reject(request.error ?? new Error("Failed to load identity"));
    request.onsuccess = () => resolve((request.result as IdentityStoreRecord | undefined) ?? null);
  });
};

const saveIdentityRecord = async (record: IdentityStoreRecord) => {
  const db = await getDatabaseOnce();
  if (!db) {
    inMemoryStores.keys.set(IDENTITY_KEY, record);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_KEYS, "readwrite");
    const store = transaction.objectStore(STORE_KEYS);
    const request = store.put(record);
    request.onerror = () => reject(request.error ?? new Error("Failed to persist identity"));
    request.onsuccess = () => resolve();
  });
};

const loadSessionRecord = async (sessionId: string): Promise<SessionStoreRecord | null> => {
  const db = await getDatabaseOnce();
  if (!db) {
    return (inMemoryStores.sessions.get(sessionId) as SessionStoreRecord | undefined) ?? null;
  }

  return new Promise<SessionStoreRecord | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, "readonly");
    const store = transaction.objectStore(STORE_SESSIONS);
    const request = store.get(sessionId);
    request.onerror = () => reject(request.error ?? new Error("Failed to load session"));
    request.onsuccess = () => resolve((request.result as SessionStoreRecord | undefined) ?? null);
  });
};

const saveSessionRecord = async (record: SessionStoreRecord) => {
  const db = await getDatabaseOnce();
  if (!db) {
    inMemoryStores.sessions.set(record.sessionId, record);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, "readwrite");
    const store = transaction.objectStore(STORE_SESSIONS);
    const request = store.put(record);
    request.onerror = () => reject(request.error ?? new Error("Failed to persist session"));
    request.onsuccess = () => resolve();
  });
};

type IdentityKeyPair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  fingerprint: string;
};

const importIdentityKeys = async (
  record: IdentityStoreRecord,
): Promise<IdentityKeyPair> => {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    record.publicKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    record.privateKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits", "deriveKey"],
  );

  return { publicKey, privateKey, fingerprint: record.fingerprint };
};

const createIdentityRecord = async (): Promise<IdentityStoreRecord> => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits", "deriveKey"],
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const fingerprintDigest = await crypto.subtle.digest("SHA-256", publicKeyRaw);
  const fingerprint = bufferToHexGroups(fingerprintDigest);

  return {
    id: IDENTITY_KEY,
    publicKey: publicKeyJwk,
    privateKey: privateKeyJwk,
    fingerprint,
  } satisfies IdentityStoreRecord;
};

const getIdentityKeyPair = async (): Promise<IdentityKeyPair> => {
  let record = await loadIdentityRecord();
  if (!record) {
    record = await createIdentityRecord();
    await saveIdentityRecord(record);
  }
  return importIdentityKeys(record);
};

type SessionBootstrap = {
  sessionId: string;
  identity: IdentityKeyPair;
  storedRecord: SessionStoreRecord | null;
};

const bootstrapSession = async (sessionId: string): Promise<SessionBootstrap> => {
  const identity = await getIdentityKeyPair();
  const storedRecord = await loadSessionRecord(sessionId);
  return { sessionId, identity, storedRecord };
};

type EnvelopeHandshake = {
  version: 1;
  kind: "handshake";
  sessionId: string;
  publicKey: string;
  salt: string;
  rotation: number;
};

type EnvelopeData = {
  version: 1;
  kind: "data";
  sessionId: string;
  rotation: number;
  iv: string;
  ciphertext: string;
};

type CryptoEnvelope = EnvelopeHandshake | EnvelopeData;

const isHandshakeEnvelope = (value: CryptoEnvelope): value is EnvelopeHandshake =>
  value.kind === "handshake";

const normalizeTransportMessage = async (
  payload: TransportMessage,
): Promise<Uint8Array> => {
  if (typeof payload === "string") {
    return textEncoder.encode(payload);
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (typeof Blob !== "undefined" && payload instanceof Blob) {
    const buffer = await payload.arrayBuffer();
    return new Uint8Array(buffer);
  }
  throw new Error("Unsupported transport payload for encryption");
};

const decodeTransportMessage = (bytes: Uint8Array): TransportMessage =>
  textDecoder.decode(bytes);

const compareUint8Arrays = (left: Uint8Array, right: Uint8Array): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
};

const combineSalts = (
  localSalt: Uint8Array,
  localRotation: number,
  remoteSalt: Uint8Array,
  remoteRotation: number,
): Uint8Array => {
  const rotationsMatch = localRotation === remoteRotation;
  const localFirst = rotationsMatch
    ? compareUint8Arrays(localSalt, remoteSalt) <= 0
    : localRotation <= remoteRotation;
  const first = localFirst ? localSalt : remoteSalt;
  const second = localFirst ? remoteSalt : localSalt;
  const combined = new Uint8Array(first.length + second.length);
  combined.set(first, 0);
  combined.set(second, first.length);
  return combined;
};

type PeerCryptoInternalOptions = SessionBootstrap & {
  onPlaintext: (payload: TransportMessage) => void;
  onError?: (error: Error) => void;
};

class PeerCryptoSessionImpl implements PeerCryptoSession {
  private readonly sessionId: string;

  private readonly identity: IdentityKeyPair;

  private readonly onPlaintext: (payload: TransportMessage) => void;

  private readonly onError?: (error: Error) => void;

  private readonly readyPromise: Promise<void>;

  private readyResolve: (() => void) | null = null;

  private readyReject: ((error: Error) => void) | null = null;

  private transmit: ((payload: TransportMessage) => Promise<void>) | null = null;

  private readonly localSalt: Uint8Array;

  private readonly localRotation: number;

  private remoteSalt: Uint8Array | null = null;

  private remoteRotation: number | null = null;

  private remotePublicKey: CryptoKey | null = null;

  private remoteFingerprint: string | null;

  private sessionKey: CryptoKey | null = null;

  private handshakeCompleted = false;

  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly queuedIncoming: TransportMessage[] = [];

  private readonly queuedOutgoing: Array<{
    payload: TransportMessage;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  private trustState: PeerTrustState;

  constructor(options: PeerCryptoInternalOptions) {
    this.sessionId = options.sessionId;
    this.identity = options.identity;
    this.onPlaintext = options.onPlaintext;
    this.onError = options.onError;
    this.remoteFingerprint = options.storedRecord?.remoteFingerprint ?? null;
    this.trustState = {
      sessionId: options.sessionId,
      localFingerprint: options.identity.fingerprint,
      remoteFingerprint: options.storedRecord?.remoteFingerprint ?? null,
      trusted: options.storedRecord?.trusted ?? false,
      lastRotation: options.storedRecord?.lastRotation ?? null,
    };

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    this.localSalt = crypto.getRandomValues(new Uint8Array(32));
    this.localRotation = Date.now();

    trustEmitter.emit({ ...this.trustState });
  }

  attachTransmitter(transmit: (payload: TransportMessage) => Promise<void>) {
    this.transmit = transmit;
    void this.sendHandshake();
    this.flushQueuedOutgoing();
  }

  async send(payload: TransportMessage) {
    if (!this.transmit) {
      return await new Promise<void>((resolve, reject) => {
        this.queuedOutgoing.push({
          payload,
          resolve,
          reject,
        });
      });
    }

    await this.performEncryptedSend(payload);
  }

  private async performEncryptedSend(payload: TransportMessage) {
    await this.whenReady();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = this.sessionKey;
    if (!key) {
      throw new Error("Missing session key for encryption");
    }

    try {
      const normalized = await normalizeTransportMessage(payload);
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        normalized,
      );
      const envelope: EnvelopeData = {
        version: 1,
        kind: "data",
        sessionId: this.sessionId,
        rotation: this.remoteRotation && this.remoteRotation > this.localRotation
          ? this.remoteRotation
          : this.localRotation,
        iv: bufferToBase64(iv.buffer),
        ciphertext: bufferToBase64(ciphertext),
      };
      await this.transmit(JSON.stringify(envelope));
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (!isTransientTransportSendError(normalized)) {
        this.handleError(normalized);
      }
      throw normalized;
    }
  }

  async receive(payload: TransportMessage) {
    try {
      const normalized = await normalizeTransportMessage(payload);
      const decoded = decodeTransportMessage(normalized);
      const envelope = JSON.parse(decoded) as CryptoEnvelope;

      if (envelope.version !== 1 || envelope.sessionId !== this.sessionId) {
        console.warn("Peer crypto ignored envelope for mismatched session", {
          expected: this.sessionId,
          received: envelope.sessionId,
          kind: envelope.kind,
        });
        return;
      }

      if (isHandshakeEnvelope(envelope)) {
        await this.handleHandshake(envelope);
        return;
      }

      await this.handleEncrypted(envelope);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.handleError(normalized);
    }
  }

  async whenReady(): Promise<void> {
    return this.readyPromise;
  }

  async teardown(): Promise<void> {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    this.queuedIncoming.length = 0;
    this.rejectQueuedOutgoing(new Error("Peer crypto session closed"));
  }

  private handleError(error: Error) {
    this.rejectQueuedOutgoing(error);
    if (this.onError) {
      try {
        this.onError(error);
      } catch (callbackError) {
        console.error("Peer crypto onError callback failed", callbackError);
      }
    }
    if (this.readyReject) {
      this.readyReject(error);
      this.readyReject = null;
    }
  }

  private async sendHandshake() {
    if (!this.transmit) return;

    const publicKeyRaw = await crypto.subtle.exportKey("raw", this.identity.publicKey);
    const envelope: EnvelopeHandshake = {
      version: 1,
      kind: "handshake",
      sessionId: this.sessionId,
      publicKey: bufferToBase64(publicKeyRaw),
      salt: bufferToBase64(this.localSalt.buffer),
      rotation: this.localRotation,
    };

    this.startHandshakeTimer();

    await this.transmit(JSON.stringify(envelope));
  }

  private flushQueuedOutgoing() {
    if (!this.transmit || this.queuedOutgoing.length === 0) {
      return;
    }
    const queued = this.queuedOutgoing.splice(0);
    queued.forEach(({ payload, resolve, reject }) => {
      this.performEncryptedSend(payload).then(resolve, reject);
    });
  }

  private rejectQueuedOutgoing(error: Error) {
    if (!this.queuedOutgoing.length) {
      return;
    }
    const normalized = error instanceof Error ? error : new Error(String(error));
    while (this.queuedOutgoing.length) {
      this.queuedOutgoing.shift()?.reject(normalized);
    }
  }

  private startHandshakeTimer() {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
    }
    this.handshakeTimer = setTimeout(() => {
      if (this.readyReject) {
        this.readyReject(new Error("Peer crypto handshake timed out"));
        this.readyReject = null;
      }
    }, HANDSHAKE_TIMEOUT_MS);
  }

  private async handleHandshake(envelope: EnvelopeHandshake) {
    const remoteKeyBuffer = base64ToBuffer(envelope.publicKey);
    const remoteSalt = new Uint8Array(base64ToBuffer(envelope.salt));
    const remotePublicKey = await crypto.subtle.importKey(
      "raw",
      remoteKeyBuffer,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    );

    const fingerprintDigest = await crypto.subtle.digest("SHA-256", remoteKeyBuffer);
    const fingerprint = bufferToHexGroups(fingerprintDigest);

    if (this.remoteFingerprint && fingerprint !== this.remoteFingerprint) {
      throw new Error("Peer fingerprint mismatch detected");
    }

    this.remoteFingerprint = fingerprint;
    this.remotePublicKey = remotePublicKey;
    this.remoteSalt = remoteSalt;
    this.remoteRotation = envelope.rotation;

    await this.persistTrustState();

    await this.maybeFinalizeHandshake();
  }

  private async handleEncrypted(envelope: EnvelopeData) {
    const key = this.sessionKey;
    if (!key) {
      // queue until handshake completes
      this.queuedIncoming.push(JSON.stringify(envelope));
      return;
    }

    const iv = new Uint8Array(base64ToBuffer(envelope.iv));
    const ciphertext = base64ToBuffer(envelope.ciphertext);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const decoded = decodeTransportMessage(new Uint8Array(plaintext));
    this.onPlaintext(decoded);
  }

  private async maybeFinalizeHandshake() {
    if (this.handshakeCompleted) return;
    if (!this.remotePublicKey || !this.remoteSalt || this.remoteRotation == null) {
      return;
    }

    const sharedSecret = await crypto.subtle.deriveBits(
      { name: "ECDH", public: this.remotePublicKey },
      this.identity.privateKey,
      256,
    );

    const combinedSalt = combineSalts(
      this.localSalt,
      this.localRotation,
      this.remoteSalt,
      this.remoteRotation,
    );

    const baseKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        salt: combinedSalt,
        info: KEY_ROTATION_INFO,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    this.sessionKey = aesKey;
    this.handshakeCompleted = true;

    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }

    await this.persistTrustState();

    if (this.readyResolve) {
      this.readyResolve();
      this.readyResolve = null;
    }

    while (this.queuedIncoming.length) {
      const next = this.queuedIncoming.shift();
      if (!next) continue;
      try {
        const envelope = JSON.parse(next) as EnvelopeData;
        await this.handleEncrypted(envelope);
      } catch (error) {
        console.error("Failed to process queued encrypted frame", error);
      }
    }

  }

  private async persistTrustState() {
    const record = (await loadSessionRecord(this.sessionId)) ?? {
      sessionId: this.sessionId,
      remotePublicKey: null,
      remoteFingerprint: null,
      trusted: false,
      lastRotation: null,
      sessionKey: null,
    };

    if (this.remotePublicKey) {
      const exportedRemoteKey = await crypto.subtle.exportKey("raw", this.remotePublicKey);
      record.remotePublicKey = bufferToBase64(exportedRemoteKey);
    }
    record.remoteFingerprint = this.remoteFingerprint;
    record.lastRotation = Date.now();

    if (this.sessionKey) {
      const exportedKey = await crypto.subtle.exportKey("raw", this.sessionKey);
      record.sessionKey = bufferToBase64(exportedKey);
    }

    this.trustState = {
      sessionId: this.sessionId,
      localFingerprint: this.identity.fingerprint,
      remoteFingerprint: record.remoteFingerprint,
      trusted: record.trusted,
      lastRotation: record.lastRotation,
    };

    trustEmitter.emit({ ...this.trustState });
    await saveSessionRecord(record);
  }
}

export const subscribePeerTrust = (listener: (state: PeerTrustState) => void) =>
  trustEmitter.subscribe(listener);

export const getPeerTrustState = async (sessionId: string): Promise<PeerTrustState> => {
  const identity = await getIdentityKeyPair();
  const record = await loadSessionRecord(sessionId);
  return {
    sessionId,
    localFingerprint: identity.fingerprint,
    remoteFingerprint: record?.remoteFingerprint ?? null,
    trusted: record?.trusted ?? false,
    lastRotation: record?.lastRotation ?? null,
  } satisfies PeerTrustState;
};

export const markPeerTrusted = async (sessionId: string, trusted = true) => {
  const record = (await loadSessionRecord(sessionId)) ?? {
    sessionId,
    remotePublicKey: null,
    remoteFingerprint: null,
    trusted: false,
    lastRotation: null,
    sessionKey: null,
  } satisfies SessionStoreRecord;

  record.trusted = trusted;
  await saveSessionRecord(record);

  const identity = await getIdentityKeyPair();
  trustEmitter.emit({
    sessionId,
    localFingerprint: identity.fingerprint,
    remoteFingerprint: record.remoteFingerprint,
    trusted: record.trusted,
    lastRotation: record.lastRotation,
  });
};

export const createPeerCryptoSession = async (
  options: PeerCryptoSessionOptions,
): Promise<PeerCryptoSession> => {
  const bootstrap = await bootstrapSession(options.sessionId);
  const session = new PeerCryptoSessionImpl({
    ...bootstrap,
    onPlaintext: options.onPlaintext,
    onError: options.onError,
  });

  return {
    receive: (payload) => session.receive(payload),
    send: (payload) => session.send(payload),
    attachTransmitter: (transmit) => session.attachTransmitter(transmit),
    whenReady: () => session.whenReady(),
    teardown: () => session.teardown(),
  } satisfies PeerCryptoSession;
};

export const getLocalFingerprint = async (): Promise<string | null> => {
  const identity = await getIdentityKeyPair();
  return identity.fingerprint;
};
