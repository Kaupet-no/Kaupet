import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const URL = process.env.LOCAL_SUPABASE_URL;
const ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(URL && ANON_KEY && SERVICE_ROLE_KEY);

describe.skipIf(!canRun)("RLS: suggest_category_for_title fallback gate", () => {
  const admin = createClient<Database>(URL!, SERVICE_ROLE_KEY!);
  const suffix = Date.now();
  const categoryId = crypto.randomUUID();
  const slug = `sykkel-tmp-${suffix}`;

  beforeAll(async () => {
    const { error: categoryError } = await admin
      .from("categories")
      .insert({ id: categoryId, slug, name_nb: "Sykkel", parent_id: null });
    if (categoryError) throw categoryError;
    const { error: wordStatsError } = await admin.from("listing_category_word_stats").insert({
      lexeme: "testsykkel",
      category_id: categoryId,
      listing_count: 3,
    });
    if (wordStatsError) throw wordStatsError;
  });

  afterAll(async () => {
    await admin
      .from("listing_category_word_stats")
      .delete()
      .eq("lexeme", "testsykkel")
      .eq("category_id", categoryId);
    await admin.from("categories").delete().eq("id", categoryId);
  });

  it("faller tilbake til word_similarity når stemmegrenen ikke gir en trygg vinner", async () => {
    const { data, error } = await admin.rpc("suggest_category_for_title", {
      _title: "Testsykkel 26 tommer",
    });
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({ category_id: categoryId, name_nb: "Sykkel", votes: 8 }),
    ]);
  });

  it("lar en trygg stemmevinner stå urørt", async () => {
    const { error: updateError } = await admin
      .from("listing_category_word_stats")
      .update({ listing_count: 12 })
      .eq("lexeme", "testsykkel")
      .eq("category_id", categoryId);
    expect(updateError).toBeNull();

    const { data, error } = await admin.rpc("suggest_category_for_title", {
      _title: "Testsykkel 26 tommer",
    });
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({ category_id: categoryId, name_nb: "Sykkel", votes: 12 }),
    ]);
  });
});
