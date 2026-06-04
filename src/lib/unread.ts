import { useEffect, useState } from "react";

const PREFIX = "kaupet_read_";
const EVENT = "kaupet:read-updated";

export function getLastRead(conversationId: string): string | null {
  try {
    return localStorage.getItem(PREFIX + conversationId);
  } catch {
    return null;
  }
}

export function markRead(conversationId: string, at: string = new Date().toISOString()) {
  try {
    localStorage.setItem(PREFIX + conversationId, at);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { conversationId } }));
  } catch {
    /* ignore */
  }
}

/**
 * Returnerer true hvis samtalen har en uleste melding fra en annen bruker.
 */
export function isUnread(
  conversationId: string,
  lastMessageAt: string | null | undefined,
  lastMessageSenderId: string | null | undefined,
  myId: string | null | undefined,
): boolean {
  if (!lastMessageAt) return false;
  if (lastMessageSenderId && myId && lastMessageSenderId === myId) return false;
  const lastRead = getLastRead(conversationId);
  if (!lastRead) return true;
  return new Date(lastMessageAt).getTime() > new Date(lastRead).getTime();
}

/**
 * Hook som trigger re-render når en samtale markeres som lest et annet sted i UI-et,
 * eller når localStorage endres i en annen fane.
 */
export function useReadVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(EVENT, bump);
    window.addEventListener("storage", (e) => {
      if (e.key && e.key.startsWith(PREFIX)) bump();
    });
    return () => {
      window.removeEventListener(EVENT, bump);
    };
  }, []);
  return version;
}
