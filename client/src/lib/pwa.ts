export function registerPwaServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener(
    "load",
    () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(error => {
        console.error("QuranOS service worker registration failed", error);
      });
    },
    { once: true }
  );
}
