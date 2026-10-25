import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_HOME, loginUrlFor, safeAdminPath } from "./adminRedirect.js";

test("yönetim sayfalarına dönüşe izin verir, sorguyu korur", () => {
  assert.equal(safeAdminPath("/admin/blog"), "/admin/blog");
  assert.equal(safeAdminPath("/admin/blog/new?studio=1"), "/admin/blog/new?studio=1");
  assert.equal(safeAdminPath("/admin/blog?view=drafts"), "/admin/blog?view=drafts");
  assert.equal(
    safeAdminPath("/admin/blog/7d1f6a52-2a5e-4a8b-9a0e-3f5f1b2c4d6e"),
    "/admin/blog/7d1f6a52-2a5e-4a8b-9a0e-3f5f1b2c4d6e"
  );
});

test("başka siteye, protokole ya da hileli yollara yönlendirmez", () => {
  for (const value of [
    "https://kotu.example/admin",
    "//kotu.example/admin",
    "/\\kotu.example",
    "\\\\kotu.example",
    "javascript:alert(1)",
    "/admin\u0000/blog",
    "/admin\n//kotu.example",
    " /admin/blog",
    "admin/blog",
    "",
    null,
    undefined,
    42,
    "/" + "a".repeat(600),
  ]) {
    assert.equal(safeAdminPath(value), ADMIN_HOME, JSON.stringify(value));
  }
});

test("yönetim dışı yolları, giriş sayfasını ve API'yi reddeder", () => {
  for (const value of ["/", "/blog", "/administrator", "/admin-panel", "/api/admin/media", "/admin/login", "/admin/login?next=/admin/blog", "/admin"]) {
    assert.equal(safeAdminPath(value), ADMIN_HOME, value);
  }
});

test("nokta bölümleri yönetim dışına çıkamaz", () => {
  assert.equal(safeAdminPath("/admin/../blog"), ADMIN_HOME);
  assert.equal(safeAdminPath("/admin/%2e%2e/blog"), ADMIN_HOME);
  assert.equal(safeAdminPath("/admin/blog/../media"), "/admin/media");
});

test("giriş adresi yalnızca gerektiğinde hedef taşır", () => {
  assert.equal(loginUrlFor("/admin"), "/admin/login");
  assert.equal(loginUrlFor("/admin/blog"), "/admin/login");
  assert.equal(loginUrlFor("/admin/blog/new", "?studio=1"), "/admin/login?next=%2Fadmin%2Fblog%2Fnew%3Fstudio%3D1");
  assert.equal(loginUrlFor("/admin/blog/categories"), "/admin/login?next=%2Fadmin%2Fblog%2Fcategories");
});
