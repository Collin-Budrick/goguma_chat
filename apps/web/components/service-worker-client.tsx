"use client";

import { useEffect } from "react";

const SERVICE_WORKER_PATH = "/sw.js";

export function ServiceWorkerClient() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      console.info("[sw] Service workers are not supported in this browser.");
      return;
    }

    if (process.env.NODE_ENV === "development" && window.location.hostname === "localhost") {
      console.info("[sw] Skipping service worker registration in local development.");
      return;
    }

    let isMounted = true;

    navigator.serviceWorker
      .register(SERVICE_WORKER_PATH)
      .then((registration) => {
        if (!isMounted) {
          return;
        }

        console.info("[sw] Service worker registered", registration.scope);

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener("statechange", () => {
              if (installingWorker.state === "installed") {
                if (navigator.serviceWorker.controller) {
                  console.info("[sw] New content is available; refresh for the latest version.");
                } else {
                  console.info("[sw] Content is cached for offline use.");
                }
              }
            });
          }
        });
      })
      .catch((error) => {
        if (isMounted) {
          console.error("[sw] Service worker registration failed", error);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return null;
}
