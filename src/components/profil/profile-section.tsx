import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { Calendar, Camera, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyProfileStats } from "@/lib/reviews.functions";
import { formatErrorMessage } from "@/lib/errors";
import {
  deletePreviousAvatarImage,
  describeImageError,
  IMAGE_ACCEPT,
  uploadAvatarImage,
  validateAvatarImage,
} from "@/lib/storage";
import { compressImage } from "@/lib/image-compression";
import { ProfileStats } from "@/components/profil/profile-stats";

const profileSchema = z.object({
  display_name: z.string().trim().min(2, "Minst 2 tegn").max(80),
});
type ProfileForm = z.infer<typeof profileSchema>;

export function ProfileSection() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const {
    data: userData,
    isError: userIsError,
    error: userError,
  } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
  const userId = userData?.id ?? null;

  const {
    data: profile,
    isLoading,
    isError: profileIsError,
    error: profileError,
  } = useQuery({
    queryKey: ["profile-edit", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const getStats = useServerFn(getMyProfileStats);
  const {
    data: stats,
    isError: statsIsError,
    error: statsError,
  } = useQuery({
    queryKey: ["my-profile-stats"],
    queryFn: () => getStats({}),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileForm>({
    defaultValues: { display_name: "" },
  });

  useEffect(() => {
    if (profile) {
      reset({ display_name: profile.display_name ?? "" });
    }
  }, [profile, reset]);

  const mutation = useMutation({
    mutationFn: async (values: ProfileForm) => {
      if (!userId) throw new Error("Ikke innlogget");
      const parsed = profileSchema.parse(values);
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: parsed.display_name })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-edit", userId] });
      queryClient.invalidateQueries({ queryKey: ["profile-menu", userId] });
      showSuccessToast("Profil oppdatert");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere profilen")),
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!userId) throw new Error("Ikke innlogget");
      const previousUrl = profile?.avatar_url ?? null;
      const avatarUrl = await uploadAvatarImage({ userId, file });
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", userId);
      if (error) throw error;
      await deletePreviousAvatarImage(previousUrl);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-edit", userId] });
      queryClient.invalidateQueries({ queryKey: ["profile-menu", userId] });
      showSuccessToast("Profilbilde oppdatert");
    },
    onError: (e: Error) =>
      showErrorToast(formatErrorMessage(e, "Kunne ikke laste opp profilbildet")),
    onSettled: () => setUploadingAvatar(false),
  });

  async function handleAvatarFile(file: File) {
    setUploadingAvatar(true);
    const compressed = await compressImage(file, "avatar");
    const err = validateAvatarImage(compressed);
    if (err) {
      showErrorToast(describeImageError(err));
      setUploadingAvatar(false);
      return;
    }
    avatarMutation.mutate(compressed);
  }

  const displayName = profile?.display_name ?? "";
  const memberSince = stats
    ? new Date(stats.created_at).toLocaleDateString("nb-NO", { month: "long", year: "numeric" })
    : null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-5 py-6">
          <Skeleton className="size-20 shrink-0 rounded-full" />
          <div className="max-w-xs flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (userIsError || profileIsError) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-destructive">
            {formatErrorMessage(userError ?? profileError, "Kunne ikke laste profilen")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Profilinfo</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))}>
          <CardContent className="flex items-center gap-5">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <div className="relative">
                <Avatar className="size-20">
                  {profile?.avatar_url && (
                    <AvatarImage src={profile.avatar_url} alt={displayName} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-lg font-medium text-primary">
                    {displayName?.slice(0, 2).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleAvatarFile(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  aria-label="Last opp profilbilde"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Camera className="size-3.5" />
                  )}
                </button>
              </div>
              {memberSince && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="size-3" /> Siden {memberSince}
                </p>
              )}
            </div>
            <div className="max-w-xs flex-1 space-y-2">
              <Label htmlFor="display_name">Visningsnavn</Label>
              <Input id="display_name" {...register("display_name")} />
              {errors.display_name && (
                <p className="text-sm text-destructive">{errors.display_name.message}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="justify-end border-t pt-6">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Lagre profil
            </Button>
          </CardFooter>
        </form>
      </Card>

      {statsIsError ? (
        <p className="text-sm text-destructive">
          {formatErrorMessage(statsError, "Kunne ikke laste statistikken")}
        </p>
      ) : (
        <ProfileStats />
      )}
    </div>
  );
}
