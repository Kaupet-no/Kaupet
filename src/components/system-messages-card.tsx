import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadSystemMessagesCount } from "@/hooks/use-unread";

type SystemMessage = {
  id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

/** Meldinger fra Kaupet-teamet. Vises på varselsiden, ikke i innboksen: de
 * telles på Meg-fanens badge sammen med varsler (se
 * useUnreadSystemMessagesCount), og badgen skal peke dit innholdet er. */
export function SystemMessagesCard({ className }: { className?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const unreadCount = useUnreadSystemMessagesCount();

  const { data: messages } = useQuery({
    queryKey: ["system-messages", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_messages")
        .select("id, body, created_at, read_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SystemMessage[];
    },
  });

  const markReadMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("system_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .is("read_at", null);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["system-messages"] });
      void qc.invalidateQueries({ queryKey: ["system-messages-unread"] });
    },
  });

  if (!messages || messages.length === 0) return null;

  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <ShieldAlert className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Kaupet-teamet</p>
          <p className="text-xs text-muted-foreground">
            {messages.length} {messages.length === 1 ? "melding" : "meldinger"}
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-2xs font-semibold text-brand-foreground">
            {unreadCount}
            <span className="sr-only"> uleste</span>
          </span>
        )}
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {messages.map((msg) => (
            <li key={msg.id}>
              <SystemMessageRow msg={msg} onRead={() => markReadMut.mutate(msg.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SystemMessageRow({ msg, onRead }: { msg: SystemMessage; onRead: () => void }) {
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    if (!msg.read_at) onRead();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`flex w-full items-start gap-3 p-3 text-left hover:bg-muted/40 ${!msg.read_at ? "bg-brand/5" : ""}`}
      >
        <div className="min-w-0 flex-1 pl-1">
          <p className={`truncate text-sm ${!msg.read_at ? "font-semibold" : "font-medium"}`}>
            {msg.body.slice(0, 80)}
            {msg.body.length > 80 ? "…" : ""}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: nb })}
          </p>
        </div>
        {!msg.read_at && (
          <span className="mt-1 size-2 shrink-0 rounded-full bg-brand" aria-label="Ulest" />
        )}
      </button>
      {open && (
        <div className="border-t border-border bg-muted/30 px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-xs text-muted-foreground underline underline-offset-2"
          >
            Skjul
          </button>
        </div>
      )}
    </>
  );
}
