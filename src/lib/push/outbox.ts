// In-memory Push Notification Outbox for test verification & mock delivery
export interface PushNotificationMessage {
  id: string;
  userId: string;
  payload: {
    title: string;
    body: string;
    url?: string;
  };
  enqueuedAt: string;
}

let pushOutbox: PushNotificationMessage[] = [];

export function enqueuePushNotification(userId: string, payload: { title: string; body: string; url?: string }) {
  const msg: PushNotificationMessage = {
    id: `push-${Math.random().toString(36).slice(2, 9)}`,
    userId,
    payload,
    enqueuedAt: new Date().toISOString(),
  };
  pushOutbox.push(msg);
  return msg;
}

export function getPushOutbox(): PushNotificationMessage[] {
  return [...pushOutbox];
}

export function clearPushOutbox(): void {
  pushOutbox = [];
}
