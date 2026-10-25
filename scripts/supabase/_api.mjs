// Supabase Yönetim API'si yardımcıları (yalnızca yerel bakım/test betikleri).
// Kimlik: bu makinedeki Supabase CLI oturumu (~/.supabase/access-token) ya da
// SUPABASE_ACCESS_TOKEN. Anahtar hiçbir zaman yazdırılmaz, dosyaya yazılmaz.
// Uygulama kodu bu dosyayı KULLANMAZ; canlı sunucuda yönetim anahtarı bulunmaz.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://api.supabase.com";

function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    return readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
  } catch {
    throw new Error("Supabase CLI oturumu bulunamadı (npx supabase login).");
  }
}

export function linkedProject(root = process.cwd()) {
  const ref = readFileSync(join(root, "supabase", ".temp", "project-ref"), "utf8").trim();
  const linked = JSON.parse(readFileSync(join(root, "supabase", ".temp", "linked-project.json"), "utf8"));
  return { ref, organization: linked.organization_slug, name: linked.name };
}

export async function api(path, { method = "GET", body, timeoutMs = 60_000 } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token()}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = typeof data === "object" && data ? data.message ?? JSON.stringify(data) : String(data);
    throw Object.assign(new Error(`Supabase API ${method} ${path.replace(/[0-9a-z]{20}/, "<ref>")}: HTTP ${response.status} ${String(message).slice(0, 300)}`), { status: response.status });
  }
  return data;
}

// SQL: salt okunur uç varsayılandır; yazma yalnızca açıkça istenince.
export async function sql(ref, query, { write = false } = {}) {
  return api(write ? `/v1/projects/${ref}/database/query` : `/v1/projects/${ref}/database/query/read-only`, { method: "POST", body: { query } });
}

// Projenin URL'si ve anahtarları — yalnızca bellekte kullanılır.
export async function projectKeys(ref) {
  const keys = await api(`/v1/projects/${ref}/api-keys?reveal=true`);
  const find = (name) => keys.find((key) => key.name === name)?.api_key ?? null;
  return { url: `https://${ref}.supabase.co`, anon: find("anon"), serviceRole: find("service_role") };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
