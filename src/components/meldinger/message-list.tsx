import * as React from "react";
import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
};

export function renderWithDayDividers(
  messages: Message[],
  myId: string,
  onDelete: (messageId: string) => void,
  otherLastReadAt?: string | null,
) {
  const out: React.ReactElement[] = [];
  let lastDay = "";
  let lastMineId: string | null = null;
  for (const m of messages) {
    if (m.sender_id === myId && !m.deleted_at) lastMineId = m.id;
  }
  for (const m of messages) {
    const d = new Date(m.created_at);
    const day = d.toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    if (day !== lastDay) {
      out.push(
        <div
          key={`d-${m.id}`}
          className="my-2 text-center text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          {day}
        </div>,
      );
      lastDay = day;
    }
    const mine = m.sender_id === myId;
    const deleted = !!m.deleted_at;
    const isReadByOther =
      !!otherLastReadAt && new Date(m.created_at).getTime() <= new Date(otherLastReadAt).getTime();
    const showReadReceipt = mine && !deleted && m.id === lastMineId && isReadByOther;
    out.push(
      <div
        key={m.id}
        className={`group flex items-end gap-1 ${mine ? "justify-end" : "justify-start"}`}
      >
        {mine && !deleted && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                aria-label="Slett melding"
                className="mb-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Slett melding</AlertDialogTitle>
                <AlertDialogDescription>
                  Meldingen erstattes med «Melding slettet» for begge parter. Dette kan ikke angres.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(m.id)}>Slett</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <div
          className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
            deleted
              ? "bg-muted/40 italic text-muted-foreground"
              : mine
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground"
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{deleted ? "Melding slettet" : m.body}</p>
          <p
            className={`mt-1 text-[10px] ${
              mine && !deleted ? "text-primary-foreground/70" : "text-muted-foreground"
            }`}
          >
            {d.toLocaleTimeString("nb-NO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>,
    );
    if (showReadReceipt) {
      out.push(
        <p key={`r-${m.id}`} className="mr-1 text-right text-[10px] text-muted-foreground">
          Lest
        </p>,
      );
    }
  }
  return out;
}
