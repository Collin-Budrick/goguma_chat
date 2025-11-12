export type ServiceWorkerMessage = {
  type: string;
  [key: string]: unknown;
};

async function resolveServiceWorkerTarget(): Promise<ServiceWorker | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      return controller;
    }

    const active = registration.active ?? registration.waiting ?? registration.installing ?? null;
    return active;
  } catch (error) {
    console.warn("[sw] Failed to resolve service worker target", error);
    return null;
  }
}

export async function postServiceWorkerMessage(message: ServiceWorkerMessage): Promise<void> {
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    return;
  }

  const target = await resolveServiceWorkerTarget();
  if (!target) {
    return;
  }

  try {
    target.postMessage(message);
  } catch (error) {
    console.warn("[sw] Failed to post message to service worker", error);
  }
}
