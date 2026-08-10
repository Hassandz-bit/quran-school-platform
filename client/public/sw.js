const SHELL_CACHE = "quranos-shell-v1";
const RUNTIME_CACHE = "quranos-runtime-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/pwa-icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(SHELL_CACHE).then(cache => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});

function boundedPushText(value, fallback, maxLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function safeParentNotificationUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "/parent";

  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return "/parent";
    if (!url.pathname.startsWith("/parent")) return "/parent";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/parent";
  }
}

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = boundedPushText(payload.title, "تنبيه حضور", 80);
  const body = boundedPushText(
    payload.body,
    "لديك تحديث جديد بخصوص حضور أحد الأبناء.",
    240
  );
  const url = safeParentNotificationUrl(payload.url);
  const tag = boundedPushText(payload.tag, "guardian-attendance", 120);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa-icon-192.svg",
      tag,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetPath = safeParentNotificationUrl(event.notification.data?.url);
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async clientList => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin !== self.location.origin) continue;

          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          if ("focus" in client) {
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
