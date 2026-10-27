import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import bcrypt from "bcryptjs";

import { getSupabaseAdmin, type PixelSettingsRow } from "@/lib/supabase-admin";
import {
  createPixelSessionToken,
  isValidPixelSessionToken,
  PIXEL_SESSION_COOKIE,
} from "@/lib/pixel-session";

function requireAdmin() {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Banco de rastreamento não configurado");
  return admin;
}

async function fetchRow(): Promise<PixelSettingsRow> {
  const { data, error } = await requireAdmin()
    .from("pixel_settings")
    .select(
      "id, utmify_html, utmify_api_token, tiktok_pixel_id, tiktok_access_token, password_hash, updated_at",
    )
    .eq("id", 1)
    .single();
  if (error || !data) throw new Error("Não foi possível ler as configurações do pixel");
  return data;
}

async function requireSession() {
  const token = getCookie(PIXEL_SESSION_COOKIE);
  const valid = await isValidPixelSessionToken(token);
  if (!valid) throw new Error("unauthorized");
}

/** Secure só em produção: em http://localhost o Chrome cria cookies Secure normalmente,
 * mas se recusa a sobrescrevê-los/apagá-los fora de uma conexão https real, o que quebrava
 * o logout em desenvolvimento. */
const PIXEL_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  path: "/",
};

async function openSession() {
  const token = await createPixelSessionToken();
  setCookie(PIXEL_SESSION_COOKIE, token, { ...PIXEL_COOKIE_OPTS, maxAge: 60 * 60 * 12 });
}

export const getPixelAuthState = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(PIXEL_SESSION_COOKIE);
  const authenticated = await isValidPixelSessionToken(token);
  const row = await fetchRow();
  return { authenticated, hasPassword: Boolean(row.password_hash) };
});

export const setInitialPixelPassword = createServerFn({ method: "POST" })
  .validator((input: { password: string }) => input)
  .handler(async ({ data }) => {
    const row = await fetchRow();
    if (row.password_hash) return { ok: false as const, reason: "already-set" as const };
    const password_hash = await bcrypt.hash(data.password, 10);
    const { error } = await requireAdmin()
      .from("pixel_settings")
      .update({ password_hash })
      .eq("id", 1);
    if (error) return { ok: false as const, reason: "error" as const };
    await openSession();
    return { ok: true as const };
  });

export const loginPixel = createServerFn({ method: "POST" })
  .validator((input: { password: string }) => input)
  .handler(async ({ data }) => {
    const row = await fetchRow();
    if (!row.password_hash) return { ok: false as const, reason: "no-password" as const };
    const matches = await bcrypt.compare(data.password, row.password_hash);
    if (!matches) return { ok: false as const, reason: "wrong-password" as const };
    await openSession();
    return { ok: true as const };
  });

export const logoutPixel = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(PIXEL_SESSION_COOKIE, PIXEL_COOKIE_OPTS);
});

export const getPixelSettings = createServerFn({ method: "GET" }).handler(async () => {
  await requireSession();
  const row = await fetchRow();
  return {
    utmifyHtml: row.utmify_html ?? "",
    utmifyApiToken: row.utmify_api_token ?? "",
    tiktokPixelId: row.tiktok_pixel_id ?? "",
    tiktokAccessToken: row.tiktok_access_token ?? "",
  };
});

export const savePixelSettings = createServerFn({ method: "POST" })
  .validator(
    (input: {
      utmifyHtml: string;
      utmifyApiToken: string;
      tiktokPixelId: string;
      tiktokAccessToken: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    await requireSession();
    const { error } = await requireAdmin()
      .from("pixel_settings")
      .update({
        utmify_html: data.utmifyHtml || null,
        utmify_api_token: data.utmifyApiToken.trim() || null,
        tiktok_pixel_id: data.tiktokPixelId || null,
        tiktok_access_token: data.tiktokAccessToken || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) return { ok: false as const };
    return { ok: true as const };
  });

export const changePixelPassword = createServerFn({ method: "POST" })
  .validator((input: { currentPassword: string; newPassword: string }) => input)
  .handler(async ({ data }) => {
    await requireSession();
    const row = await fetchRow();
    if (!row.password_hash || !(await bcrypt.compare(data.currentPassword, row.password_hash))) {
      return { ok: false as const, reason: "wrong-password" as const };
    }
    const password_hash = await bcrypt.hash(data.newPassword, 10);
    const { error } = await requireAdmin()
      .from("pixel_settings")
      .update({ password_hash })
      .eq("id", 1);
    if (error) return { ok: false as const, reason: "error" as const };
    return { ok: true as const };
  });
