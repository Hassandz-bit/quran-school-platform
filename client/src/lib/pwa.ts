export const PWA_INSTALL_AVAILABLE_EVENT = "quranos:pwa-install-available";

type InstallOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let installPromptListenersRegistered = false;

function registerInstallPromptListeners() {
  if (typeof window === "undefined" || installPromptListenersRegistered) return;

  installPromptListenersRegistered = true;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(PWA_INSTALL_AVAILABLE_EVENT));
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
  });
}

export function isPwaStandalone() {
  if (typeof window === "undefined") return false;

  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function canPromptPwaInstall() {
  return deferredInstallPrompt !== null && !isPwaStandalone();
}

export async function promptPwaInstall(): Promise<InstallOutcome | "unavailable"> {
  if (!deferredInstallPrompt || isPwaStandalone()) return "unavailable";

  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome;
}

export function registerPwaServiceWorker() {
  if (typeof window === "undefined") return;

  registerInstallPromptListeners();

  if (!("serviceWorker" in navigator)) return;

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
