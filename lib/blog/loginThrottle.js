// Yönetici girişinde kaba kuvvet denemelerini yavaşlatır (sunucu tarafı).
// Aynı IP + e-posta için 15 dakikada 5 hatalı deneme, aynı IP için 20 hatalı
// deneme sonrası istek Supabase'e hiç gönderilmeden reddedilir. Başarılı giriş
// sayacı sıfırlar. Kimlikler SHA-256 özetiyle tutulur (açık e-posta saklanmaz).
// Not: sunucu örneği başına bellektedir; Supabase Auth'un kendi hız sınırları
// ayrıca geçerlidir (docs/SECURITY_CHECKLIST.md).

import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60_000;
const MAX_PER_ACCOUNT = 5;
const MAX_PER_IP = 20;
const failures = new Map(); // anahtar → zaman damgaları
const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 32);

const keysFor = (ip, email) => ({ ip: `ip:${hash(String(ip || "?"))}`, account: `acct:${hash(`${ip || "?"}|${String(email).trim().toLowerCase()}`)}` });

function recent(key, now) {
  const list = (failures.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

// { allowed, retryAfterSeconds }
export function checkLogin(ip, email, now = Date.now()) {
  const { ip: ipKey, account } = keysFor(ip, email);
  const accountList = recent(account, now);
  const ipList = recent(ipKey, now);
  const blocked = accountList.length >= MAX_PER_ACCOUNT ? accountList : ipList.length >= MAX_PER_IP ? ipList : null;
  if (!blocked) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.ceil((blocked[0] + WINDOW_MS - now) / 1000) };
}

export function recordFailure(ip, email, now = Date.now()) {
  const { ip: ipKey, account } = keysFor(ip, email);
  for (const key of [ipKey, account]) failures.set(key, [...recent(key, now), now]);
  if (failures.size > 5_000) failures.delete(failures.keys().next().value);
}

export function recordSuccess(ip, email) {
  failures.delete(keysFor(ip, email).account);
}

export function resetLoginThrottle() {
  failures.clear();
}
