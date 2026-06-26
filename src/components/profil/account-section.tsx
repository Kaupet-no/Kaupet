import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { Loader2, LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatErrorMessage } from "@/lib/errors";
import { DeleteAccountSection } from "@/components/profil/delete-account-section";

const emailSchema = z.object({
  email: z.string().trim().email("Ugyldig e-postadresse"),
});
type EmailForm = z.infer<typeof emailSchema>;

const passwordSchema = z
  .object({
    password: z.string().min(8, "Minst 8 tegn"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passordene må være like",
    path: ["confirm"],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

export function AccountSection() {
  const { data: userData } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
  const currentEmail = userData?.email ?? "";

  const emailForm = useForm<EmailForm>({ defaultValues: { email: "" } });
  useEffect(() => {
    if (currentEmail) emailForm.reset({ email: currentEmail });
  }, [currentEmail, emailForm]);

  const passwordForm = useForm<PasswordForm>({
    defaultValues: { password: "", confirm: "" },
  });

  const emailMutation = useMutation({
    mutationFn: async (values: EmailForm) => {
      const parsed = emailSchema.parse(values);
      if (parsed.email === currentEmail) {
        throw new Error("Det er allerede din nåværende e-post");
      }
      const { error } = await supabase.auth.updateUser({ email: parsed.email });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Sjekk innboksen din for å bekrefte den nye e-posten");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke endre e-postadressen")),
  });

  const passwordMutation = useMutation({
    mutationFn: async (values: PasswordForm) => {
      const parsed = passwordSchema.parse(values);
      const { error } = await supabase.auth.updateUser({ password: parsed.password });
      if (error) throw error;
    },
    onSuccess: () => {
      passwordForm.reset();
      showSuccessToast("Passordet er oppdatert");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke endre passordet")),
  });

  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="space-y-6">
      <form
        onSubmit={emailForm.handleSubmit((v) => emailMutation.mutate(v))}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h2 className="text-lg font-medium">E-postadresse</h2>
          <p className="text-sm text-muted-foreground">
            Vi sender en bekreftelseslenke til den nye adressen.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-post</Label>
          <Input id="email" type="email" {...emailForm.register("email")} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={emailMutation.isPending}>
            {emailMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Oppdater e-post
          </Button>
        </div>
      </form>

      <form
        onSubmit={passwordForm.handleSubmit((v) => passwordMutation.mutate(v))}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h2 className="text-lg font-medium">Endre passord</h2>
          <p className="text-sm text-muted-foreground">Minst 8 tegn.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Nytt passord</Label>
          <Input id="password" type="password" {...passwordForm.register("password")} />
          {passwordForm.formState.errors.password && (
            <p className="text-sm text-destructive">
              {passwordForm.formState.errors.password.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Bekreft passord</Label>
          <Input id="confirm" type="password" {...passwordForm.register("confirm")} />
          {passwordForm.formState.errors.confirm && (
            <p className="text-sm text-destructive">
              {passwordForm.formState.errors.confirm.message}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={passwordMutation.isPending}>
            {passwordMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Oppdater passord
          </Button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-medium">Logg ut</h2>
        <p className="mt-1 text-sm text-muted-foreground">Avslutt økten på denne enheten.</p>
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await supabase.auth.signOut();
              setSigningOut(false);
            }}
          >
            <LogOut className="size-4" /> Logg ut
          </Button>
        </div>
      </div>

      <DeleteAccountSection currentEmail={currentEmail} />
    </div>
  );
}
