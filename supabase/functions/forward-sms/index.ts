// forward-sms
//
// Dedup: public.smsfwd_dedupe stores (user_id, dedupe_key, seen_at) only.
// A unique claim is inserted before SMTP. smsfwd_prune() drops claims older
// than 5 minutes. If SMTP fails, this function deletes the claim so the
// client can retry. The SMS body is never written to Postgres.
//
// Rate limit: public.smsfwd_send_log stores user_id + sent_at for successful
// sends. Caps are MAX_PER_MINUTE and MAX_PER_DAY below.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const MAX_PER_MINUTE = 10;
const MAX_PER_DAY = 200;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Profile = {
  destination_email: string;
  forwarding_enabled: boolean;
  include_metadata: boolean;
  filter_mode: "all" | "senders" | "contains";
  filter_values: string[] | null;
  language: "tr" | "en";
};

type ForwardRequest = {
  sender: string;
  body: string;
  timestamp: number;
  dedupe_key: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: "supabase_not_configured" });
  }

  const auth = req.headers.get("Authorization") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    return json(401, { error: "unauthorized" });
  }

  let payload: ForwardRequest;
  try {
    payload = parseBody(await req.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_body";
    return json(400, { error: message });
  }

  const { data: profile, error: profileError } = await supabase
    .from("smsfwd_profiles")
    .select(
      "destination_email, forwarding_enabled, include_metadata, filter_mode, filter_values, language",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return json(500, { error: "profile_read_failed" });
  }
  if (!profile?.forwarding_enabled) {
    return json(200, { skipped: "disabled" });
  }

  if (!passesFilter(profile, payload.sender, payload.body)) {
    return json(200, { skipped: "filtered" });
  }

  const { error: pruneError } = await supabase.rpc("smsfwd_prune");
  if (pruneError) {
    return json(500, { error: "prune_failed" });
  }

  const claim = await claimDedupe(supabase, user.id, payload.dedupe_key);
  if (claim === "error") {
    return json(500, { error: "dedupe_failed" });
  }
  if (claim === "duplicate") {
    return json(200, { skipped: "duplicate" });
  }

  try {
    if (await overRateLimit(supabase, user.id)) {
      await releaseDedupe(supabase, user.id, payload.dedupe_key);
      return json(429, { error: "rate_limited" });
    }
  } catch {
    await releaseDedupe(supabase, user.id, payload.dedupe_key);
    return json(500, { error: "rate_count_failed" });
  }

  try {
    await sendMail(profile, payload);
  } catch (error) {
    await releaseDedupe(supabase, user.id, payload.dedupe_key);
    if (error instanceof Error && error.message === "smtp_not_configured") {
      return json(500, { error: "smtp_not_configured" });
    }
    return json(502, { error: "smtp_failed" });
  }

  const { error: logError } = await supabase
    .from("smsfwd_send_log")
    .insert({ user_id: user.id });
  if (logError) {
    return json(500, { error: "rate_log_failed" });
  }

  return json(200, { status: "sent" });
});

function parseBody(value: unknown): ForwardRequest {
  if (!value || typeof value !== "object") {
    throw new Error("invalid_body");
  }
  const record = value as Record<string, unknown>;
  const sender = record.sender;
  const body = record.body;
  const timestamp = record.timestamp;
  const dedupeKey = record.dedupe_key;
  if (typeof sender !== "string" || sender.trim().length === 0) {
    throw new Error("invalid_sender");
  }
  if (typeof body !== "string") {
    throw new Error("invalid_body");
  }
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    throw new Error("invalid_timestamp");
  }
  if (typeof dedupeKey !== "string" || dedupeKey.trim().length === 0) {
    throw new Error("invalid_dedupe_key");
  }
  return {
    sender,
    body,
    timestamp,
    dedupe_key: dedupeKey,
  };
}

function passesFilter(profile: Profile, sender: string, body: string): boolean {
  const values = profile.filter_values ?? [];
  if (profile.filter_mode === "all") return true;
  if (profile.filter_mode === "senders") {
    const senderKey = normalizeSender(sender);
    return values.some((value) => normalizeSender(value) === senderKey && senderKey.length > 0);
  }
  if (profile.filter_mode === "contains") {
    const haystack = body.toLowerCase();
    return values.some((value) => {
      const needle = value.trim().toLowerCase();
      return needle.length > 0 && haystack.includes(needle);
    });
  }
  return false;
}

function normalizeSender(value: string): string {
  return value.trim().toLowerCase().replace(/[\s()-]/g, "");
}

async function claimDedupe(
  supabase: SupabaseClient,
  userId: string,
  dedupeKey: string,
): Promise<"ok" | "duplicate" | "error"> {
  const { error } = await supabase.from("smsfwd_dedupe").insert({
    user_id: userId,
    dedupe_key: dedupeKey,
  });
  if (!error) return "ok";
  if (error.code === "23505") return "duplicate";
  return "error";
}

async function releaseDedupe(
  supabase: SupabaseClient,
  userId: string,
  dedupeKey: string,
): Promise<void> {
  await supabase
    .from("smsfwd_dedupe")
    .delete()
    .eq("user_id", userId)
    .eq("dedupe_key", dedupeKey);
}

async function overRateLimit(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const now = Date.now();
  const minuteCount = await countSends(supabase, userId, new Date(now - MINUTE_MS).toISOString());
  if (minuteCount >= MAX_PER_MINUTE) return true;
  const dayCount = await countSends(supabase, userId, new Date(now - DAY_MS).toISOString());
  return dayCount >= MAX_PER_DAY;
}

async function countSends(
  supabase: SupabaseClient,
  userId: string,
  since: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("smsfwd_send_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("sent_at", since);
  if (error) {
    throw new Error("rate_count_failed");
  }
  return count ?? 0;
}

async function sendMail(profile: Profile, payload: ForwardRequest): Promise<void> {
  const hostname = Deno.env.get("SMTP_HOST") ?? "";
  const port = Number(Deno.env.get("SMTP_PORT"));
  const username = Deno.env.get("SMTP_USER") ?? "";
  const password = Deno.env.get("SMTP_PASS") ?? "";
  const from = Deno.env.get("SMTP_FROM") ?? "";
  if (!hostname || !Number.isFinite(port) || !username || !password || !from) {
    throw new Error("smtp_not_configured");
  }

  const smtp = new SMTPClient({
    connection: {
      hostname,
      port,
      tls: port === 465,
      auth: { username, password },
    },
  });

  try {
    await smtp.send({
      from,
      to: profile.destination_email,
      subject: profile.include_metadata ? `SMS from ${payload.sender}` : `SMS: ${payload.sender}`,
      content: buildBody(profile, payload),
    });
  } finally {
    try {
      await smtp.close();
    } catch {
      // The send result is what matters; close failures must not hide it.
    }
  }
}

function buildBody(profile: Profile, payload: ForwardRequest): string {
  if (!profile.include_metadata) {
    return payload.body;
  }
  const locale = profile.language === "en" ? "en-GB" : "tr-TR";
  const received = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(payload.timestamp));
  return `${payload.body}\n\n──────────\nFrom: ${payload.sender}\nReceived: ${received} UTC\nForwarded by SMS→Email Forwarder`;
}

function json(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
