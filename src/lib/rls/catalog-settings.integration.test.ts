/** RLS integration tests: catalog-settings. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  createTestCategory,
  createRlsUser,
  signInWithRetry,
  grantAdmin,
  registerCategoryCleanup,
} from "../rls-test-helpers";

describe.skipIf(!canRun)(
  "RLS: vehicle_brands / vehicle_models — publicly readable, pending only insertable as pending by self",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const email = `rls-vehiclebrand-${suffix}@example.com`;
    const userIds: string[] = [];
    let userId: string;
    let pendingBrandId: string;

    async function signIn() {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userId = data.user!.id;
      userIds.push(userId);

      const { data: brand, error: brandErr } = await admin
        .from("vehicle_brands")
        .insert({
          name: `RLS Test Brand ${suffix}`,
          category_group: "bil",
          status: "pending",
          submitted_by: userId,
        })
        .select("id")
        .single();
      if (brandErr) throw brandErr;
      pendingBrandId = brand.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("vehicle_brands").delete().eq("id", pendingBrandId);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets an anonymous visitor read even a pending brand (SELECT policy has no status filter)", async () => {
      // Documents actual current behavior, not necessarily ideal: the
      // SELECT policy is USING (true) with no status check, so a
      // not-yet-approved, user-submitted brand name is technically
      // readable by anyone — the app is expected to filter pending values
      // out client-side (e.g. VehicleBrandField) rather than relying on RLS.
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon
        .from("vehicle_brands")
        .select("id, status")
        .eq("id", pendingBrandId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0].status).toBe("pending");
    });

    it("blocks a user from inserting a brand pre-approved as 'approved'", async () => {
      const client = await signIn();
      const { error } = await client.from("vehicle_brands").insert({
        name: `RLS Self-Approved Brand ${suffix}`,
        category_group: "bil",
        status: "approved",
        submitted_by: userId,
      });
      expect(error).not.toBeNull();
    });

    it("blocks a user from proposing a brand on someone else's behalf", async () => {
      const client = await signIn();
      const { error } = await client.from("vehicle_brands").insert({
        name: `RLS Impersonated Brand ${suffix}`,
        category_group: "bil",
        status: "pending",
        submitted_by: "00000000-0000-0000-0000-000000000000",
      });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: categories / category_filters / category_flows / filter_synonyms — public read, admin-only write",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-taxonomy-admin-${suffix}@example.com`,
      other: `rls-taxonomy-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let categoryId: string;
    let categoryFilterId: string;

    async function signIn(email: string) {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const mkUser = async (email: string) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
        userIds.push(data.user!.id);
        return data.user!.id;
      };
      const adminId = await mkUser(emails.admin);
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      categoryId = await createTestCategory(admin, `taxonomy-${suffix}`);

      const { data: filter, error: filterError } = await admin
        .from("category_filters")
        .insert({
          category_id: categoryId,
          key: `rls_taxonomy_filter_${suffix}`,
          label_nb: "RLS taxonomy filter",
          type: "text",
        })
        .select("id")
        .single();
      if (filterError) throw filterError;
      categoryFilterId = filter.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("categories").delete().eq("id", categoryId);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets an anonymous visitor read all four taxonomy tables", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      for (const table of [
        "categories",
        "category_filters",
        "category_flows",
        "filter_synonyms",
      ] as const) {
        const { error } = await anon.from(table).select("id").limit(1);
        expect(error, `${table} should be publicly readable`).toBeNull();
      }
    });

    it("blocks a non-admin authenticated user from renaming a category", async () => {
      const other = await signIn(emails.other);
      const { error, count } = await other
        .from("categories")
        .update({ name_nb: "Hijacked category name" }, { count: "exact" })
        .eq("id", categoryId);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });

    it("blocks a non-admin authenticated user from inserting a category filter", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("category_filters").insert({
        category_id: categoryId,
        key: `rls_hijack_${suffix}`,
        label_nb: "Hijacked filter",
        type: "text",
      });
      expect(error).not.toBeNull();
    });

    it("lets an admin insert and then delete a category filter", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient
        .from("category_filters")
        .insert({
          category_id: categoryId,
          key: `rls_admin_test_${suffix}`,
          label_nb: "RLS admin test filter",
          type: "text",
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data).not.toBeNull();

      if (data) {
        const { error: deleteErr } = await adminClient
          .from("category_filters")
          .delete()
          .eq("id", data.id);
        expect(deleteErr).toBeNull();
      }
    });

    it("allows only an admin to write category flows and filter synonyms", async () => {
      const other = await signIn(emails.other);
      const adminClient = await signIn(emails.admin);
      const flow = {
        category_id: categoryId,
        field_groups: [
          "photos",
          "title",
          "category-attributes",
          "description-keywords",
          "review-publish",
        ],
        sort_order: 99,
      };

      const { error: flowInsertError } = await other.from("category_flows").insert(flow);
      expect(flowInsertError).not.toBeNull();
      const { data: insertedFlow, error: adminFlowError } = await adminClient
        .from("category_flows")
        .insert(flow)
        .select("id")
        .single();
      expect(adminFlowError).toBeNull();
      expect(insertedFlow).not.toBeNull();

      const { error: synonymInsertError } = await other.from("filter_synonyms").insert({
        category_filter_id: categoryFilterId,
        phrase: `uautorisert-${suffix}`,
      });
      expect(synonymInsertError).not.toBeNull();
      const { data: insertedSynonym, error: adminSynonymError } = await adminClient
        .from("filter_synonyms")
        .insert({ category_filter_id: categoryFilterId, phrase: `admin-${suffix}` })
        .select("id")
        .single();
      expect(adminSynonymError).toBeNull();
      expect(insertedSynonym).not.toBeNull();

      if (insertedFlow) {
        const { error } = await adminClient
          .from("category_flows")
          .update({ sort_order: 100 })
          .eq("id", insertedFlow.id);
        expect(error).toBeNull();
        const { error: deleteError } = await adminClient
          .from("category_flows")
          .delete()
          .eq("id", insertedFlow.id);
        expect(deleteError).toBeNull();
      }
      if (insertedSynonym) {
        const { error } = await adminClient
          .from("filter_synonyms")
          .update({ phrase: `admin-endret-${suffix}` })
          .eq("id", insertedSynonym.id);
        expect(error).toBeNull();
        const { error: deleteError } = await adminClient
          .from("filter_synonyms")
          .delete()
          .eq("id", insertedSynonym.id);
        expect(deleteError).toBeNull();
      }
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: site_settings — public read, only admins can update the singleton row",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-sitesettings-admin-${suffix}@example.com`,
      other: `rls-sitesettings-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let originalDefaultSearchExamples: string[];
    let createdSiteSettings = false;

    async function signIn(email: string) {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const mkUser = async (email: string) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
        userIds.push(data.user!.id);
        return data.user!.id;
      };
      const adminId = await mkUser(emails.admin);
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      // This is a real singleton row used in production/staging (rotating
      // search-field examples on the landing page) — save its current
      // value so the admin-update test below can restore it afterwards
      // instead of leaving test data behind on a shared row.
      const { data: current, error: currentErr } = await admin
        .from("site_settings")
        .select("default_search_examples")
        .eq("id", true)
        .maybeSingle();
      if (currentErr) throw currentErr;
      if (current) {
        originalDefaultSearchExamples = current.default_search_examples;
      } else {
        originalDefaultSearchExamples = [];
        const { error: insertErr } = await admin
          .from("site_settings")
          .insert({ id: true, default_search_examples: [] });
        if (insertErr) throw insertErr;
        createdSiteSettings = true;
      }
    });

    afterAll(async () => {
      if (!canRun) return;
      if (createdSiteSettings) {
        await admin.from("site_settings").delete().eq("id", true);
      } else {
        await admin
          .from("site_settings")
          .update({ default_search_examples: originalDefaultSearchExamples })
          .eq("id", true);
      }
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets an anonymous visitor read site settings", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon.from("site_settings").select("id").eq("id", true);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("blocks a non-admin from updating site settings", async () => {
      const other = await signIn(emails.other);
      const { error, count } = await other
        .from("site_settings")
        .update({ default_search_examples: ["hijacked"] }, { count: "exact" })
        .eq("id", true);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });

    it("lets an admin update site settings", async () => {
      const adminClient = await signIn(emails.admin);
      const { error, count } = await adminClient
        .from("site_settings")
        .update({ default_search_examples: ["rls-test-example"] }, { count: "exact" })
        .eq("id", true);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: app_settings has no client access at all, not even for admins",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = { admin: `rls-appsettings-admin-${suffix}@example.com` };
    const userIds: string[] = [];

    async function signIn(email: string) {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: emails.admin,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      const adminId = data.user!.id;
      userIds.push(adminId);
      await grantAdmin(admin, adminId);
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("never returns app_settings rows to a client, even an admin (zero policies, service-role only — stores secrets like push_dispatch_secret)", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient.from("app_settings").select("key").limit(1);
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data).toHaveLength(0);
      }
    });
  },
);

describe.skipIf(!canRun)("RLS: kategori-synkestatus er kun lesbar for administratorer", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    admin: `rls-sync-admin-${suffix}@example.com`,
    other: `rls-sync-other-${suffix}@example.com`,
  };
  const userIds: string[] = [];

  beforeAll(async () => {
    await createRlsUser(admin, emails.admin, userIds);
    const otherId = await createRlsUser(admin, emails.other, userIds);
    await grantAdmin(admin, userIds[0]!);
    const { error } = await admin.from("category_sync_status").upsert({
      id: true,
      last_synced_at: new Date().toISOString(),
      last_synced_by: otherId,
    });
    if (error) throw error;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("category_sync_status").delete().eq("id", true);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("viser status til admin, men ikke annen bruker eller anonym", async () => {
    const adminClient = await signInWithRetry(emails.admin);
    const other = await signInWithRetry(emails.other);
    const anon = createClient(URL!, ANON_KEY!);
    const adminRead = await adminClient.from("category_sync_status").select("id").eq("id", true);
    const otherRead = await other.from("category_sync_status").select("id").eq("id", true);
    const anonRead = await anon.from("category_sync_status").select("id").eq("id", true);
    expect(adminRead.error).toBeNull();
    expect(adminRead.data).toHaveLength(1);
    expect(otherRead.data).toHaveLength(0);
    expect(anonRead.data).toHaveLength(0);
  });

  it("blokkerer klient-skriving og lar service_role oppdatere status", async () => {
    const client = await signInWithRetry(emails.admin);
    const { error: clientError, count: clientCount } = await client
      .from("category_sync_status")
      .update({ last_synced_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", true);
    expect(clientError).toBeNull();
    expect(clientCount).toBe(0);
    const { error: serviceError } = await admin
      .from("category_sync_status")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", true);
    expect(serviceError).toBeNull();
  });
});

describe.skipIf(!canRun)("RLS: aktive priser og kjøretøykatalog er offentlig lesbare", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    admin: `rls-public-admin-${suffix}@example.com`,
    other: `rls-public-other-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  let activePricingId: string;
  let inactivePricingId: string;
  let brandId: string;
  let classId: string;
  let modelId: string;

  beforeAll(async () => {
    const adminId = await createRlsUser(admin, emails.admin, userIds);
    await createRlsUser(admin, emails.other, userIds);
    await grantAdmin(admin, adminId);
    const { data: active, error: activeError } = await admin
      .from("promotion_pricing")
      .insert({ duration_days: 3, price_nok: 99, active: true })
      .select("id")
      .single();
    if (activeError) throw activeError;
    activePricingId = active.id;
    const { data: inactive, error: inactiveError } = await admin
      .from("promotion_pricing")
      .insert({ duration_days: 4, price_nok: 100, active: false })
      .select("id")
      .single();
    if (inactiveError) throw inactiveError;
    inactivePricingId = inactive.id;
    const { data: brand, error: brandError } = await admin
      .from("vehicle_brands")
      .insert({ name: `RLS Public Brand ${suffix}`, category_group: "bil", status: "approved" })
      .select("id")
      .single();
    if (brandError) throw brandError;
    brandId = brand.id;
    const { data: vehicleClass, error: classError } = await admin
      .from("vehicle_model_classes")
      .insert({ brand_id: brandId, name: `RLS Class ${suffix}`, status: "approved" })
      .select("id")
      .single();
    if (classError) throw classError;
    classId = vehicleClass.id;
    const { data: model, error: modelError } = await admin
      .from("vehicle_models")
      .insert({
        brand_id: brandId,
        class_id: classId,
        name: `RLS Model ${suffix}`,
        status: "approved",
      })
      .select("id")
      .single();
    if (modelError) throw modelError;
    modelId = model.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("promotion_pricing").delete().in("id", [activePricingId, inactivePricingId]);
    await admin.from("vehicle_models").delete().eq("id", modelId);
    await admin.from("vehicle_model_classes").delete().eq("id", classId);
    await admin.from("vehicle_brands").delete().eq("id", brandId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("viser aktiv pris og katalograder for anonym, men ikke inaktiv pris", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const active = await anon.from("promotion_pricing").select("id").eq("id", activePricingId);
    const inactive = await anon.from("promotion_pricing").select("id").eq("id", inactivePricingId);
    const classes = await anon.from("vehicle_model_classes").select("id").eq("id", classId);
    const models = await anon.from("vehicle_models").select("id").eq("id", modelId);
    expect(active.error).toBeNull();
    expect(active.data).toHaveLength(1);
    expect(inactive.error).toBeNull();
    expect(inactive.data).toHaveLength(0);
    expect(classes.data).toHaveLength(1);
    expect(models.data).toHaveLength(1);
  });

  it("lar bare admin skrive priser, mens katalogmodeller ikke kan skrives direkte av klient", async () => {
    const other = await signInWithRetry(emails.other);
    const adminClient = await signInWithRetry(emails.admin);
    const { error: pricingError, count: pricingCount } = await other
      .from("promotion_pricing")
      .update({ price_nok: 1 }, { count: "exact" })
      .eq("id", activePricingId);
    expect(pricingError).toBeNull();
    expect(pricingCount).toBe(0);
    const { data: inserted, error: adminPricingError } = await adminClient
      .from("promotion_pricing")
      .insert({ duration_days: 5, price_nok: 101, active: true })
      .select("id")
      .single();
    expect(adminPricingError).toBeNull();
    if (inserted) {
      const { error } = await adminClient.from("promotion_pricing").delete().eq("id", inserted.id);
      expect(error).toBeNull();
    }
    const { error: classInsertError } = await other.from("vehicle_model_classes").insert({
      brand_id: brandId,
      name: `client-class-${suffix}`,
      status: "pending",
      submitted_by: userIds[1],
    });
    expect(classInsertError).not.toBeNull();
    const { error: modelInsertError } = await other.from("vehicle_models").insert({
      brand_id: brandId,
      name: `client-model-${suffix}`,
      status: "pending",
      submitted_by: userIds[1],
    });
    expect(modelInsertError).not.toBeNull();
  });
});

// Deletes the categories created by createTestCategory() above. Registered last so
// it runs after the block-local afterAll hooks (see rls-test-helpers.ts).
registerCategoryCleanup();
