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
  // Ingen avsender = ingen meldinger ennå (messages.sender_id er NOT NULL):
  // en samtale som bare er åpnet, er ikke ulest.
  if (!lastMessageAt || !lastMessageSenderId) return false;
  if (myId && lastMessageSenderId === myId) return false;
  if (!myLastReadAt) return true;
  return new Date(lastMessageAt).getTime() > new Date(myLastReadAt).getTime();
}
