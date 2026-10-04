/* Public assets only. Never intercept/cache ERP, sessions, exports or API responses. */
const CACHE = "mh-public-v2";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/offline.html",
          "/offline.css",
          "/icon.svg",
          "/icon-192.png",
          "/icon-512.png",
        ]),
      ),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("mh-public-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
    return;
  }
  if (
    ["/offline.css", "/icon.svg", "/icon-192.png", "/icon-512.png"].includes(
      url.pathname,
    )
  )
    event.respondWith(
      caches
        .match(event.request)
        .then((cached) => cached || fetch(event.request)),
    );
});
