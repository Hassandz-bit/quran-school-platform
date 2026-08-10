import { getSupabaseClient } from "./supabase.ts";

// Public VAPID key only. The matching private key must stay in the server-side
// notification dispatcher and is intentionally not part of this PR/client.
export const GUARDIAN_PUSH_PUBLIC_VAPID_KEY =
  "BF8BbeLrCMmzYnmxMtAS7MaZhRmDD0V4ICZ1a7l29znbK2vstzGUtew6zrY1gKh1eq9bcHLIL2LQ1r6Izl5vyYY";

export type GuardianPushStatus =
  | "unsupported"
  | "denied"
  | "available"
  | "enabled";

export class GuardianPushError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardianPushError";
  }
}

function supportsGuardianPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }

  return buffer;
}

function serializeSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const authKey = json.keys?.auth;

  if (!endpoint || !p256dh || !authKey) {
    throw new GuardianPushError("push_subscription_incomplete");
  }

  return { endpoint, p256dh, authKey };
}

async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const { endpoint, p256dh, authKey } = serializeSubscription(subscription);
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("register_my_guardian_push_subscription", {
    target_endpoint: endpoint,
    target_p256dh: p256dh,
    target_auth_key: authKey,
    target_user_agent: navigator.userAgent.slice(0, 512),
  });

  if (error) throw error;
  if (data !== true) throw new GuardianPushError("push_subscription_not_registered");
}

export async function getGuardianPushStatus(): Promise<GuardianPushStatus> {
  if (!supportsGuardianPush()) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "enabled" : "available";
}

export async function enableGuardianPush(): Promise<GuardianPushStatus> {
  if (!supportsGuardianPush()) return "unsupported";

  let permission = Notification.permission;
  if (permission === "default") {
    // This function must only be called from an explicit user gesture.
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return "denied";

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToArrayBuffer(
        GUARDIAN_PUSH_PUBLIC_VAPID_KEY
      ),
    });
  }

  await registerSubscription(subscription);
  return "enabled";
}

export async function disableGuardianPush(): Promise<GuardianPushStatus> {
  if (!supportsGuardianPush()) return "unsupported";

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return Notification.permission === "denied" ? "denied" : "available";
  }

  const endpoint = subscription.endpoint;
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("delete_my_guardian_push_subscription", {
    target_endpoint: endpoint,
  });

  if (error) throw error;
  if (data !== true) throw new GuardianPushError("push_subscription_not_deleted");

  await subscription.unsubscribe();
  return "available";
}
