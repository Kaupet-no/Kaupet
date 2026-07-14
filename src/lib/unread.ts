/**
 * Returnerer true hvis samtalen har en ulest melding fra en annen bruker.
 *
 * Lest-status hentes fra databasen (conversations.buyer_last_read_at /
 * seller_last_read_at) slik at den er konsistent på tvers av enheter/økter.
 */
export function isUnread(
  lastMessageAt: string | null | undefined,
  lastMessageSenderId: string | null | undefined,
  myId: string | null | undefined,
  myLastReadAt: string | null | undefined,
): boolean {
  if (!lastMessageAt) return false;
  if (lastMessageSenderId && myId && lastMessageSenderId === myId) return false;
  if (!myLastReadAt) return true;
  return new Date(lastMessageAt).getTime() > new Date(myLastReadAt).getTime();
}
