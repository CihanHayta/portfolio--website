import assert from "node:assert/strict";
import { test } from "node:test";
import { postCanonical } from "./canonical.js";
import { PRODUCTION_SITE_URL, resolveSiteUrl } from "../supabase/env.js";

const site = { siteUrl: "http://localhost:3000", ownHosts: ["personadijitalpazarlama.com"] };

test("kanonik alan boşsa ya da yazının kendi adresiyse yazı kendi kanoniğidir", () => {
  const own = { url: "http://localhost:3000/blog/yazi", path: "/blog/yazi", external: false };
  assert.deepEqual(postCanonical({ slug: "yazi", canonicalUrl: "" }, site), own);
  assert.deepEqual(postCanonical({ slug: "yazi", canonicalUrl: null }, site), own);
  assert.deepEqual(postCanonical({ slug: "yazi", canonicalUrl: "https://personadijitalpazarlama.com/blog/yazi" }, site), own);
  assert.deepEqual(postCanonical({ slug: "yazi", canonicalUrl: "https://www.personadijitalpazarlama.com/blog/yazi/" }, site), own);
  assert.deepEqual(postCanonical({ slug: "yazi", canonicalUrl: "bozuk adres" }, site), own);
});

test("başka bir alan adı ya da başka bir yol dış kanoniktir", () => {
  assert.deepEqual(postCanonical({ slug: "yazi", canonicalUrl: "https://medium.com/@x/yazi-123" }, site), {
    url: "https://medium.com/@x/yazi-123",
    path: null,
    external: true,
  });
  assert.equal(postCanonical({ slug: "yazi", canonicalUrl: "https://personadijitalpazarlama.com/blog/baska" }, site).external, true);
});

test("canlı ortamda yerel ya da önizleme adresi site adresi olarak kullanılmaz", () => {
  assert.equal(resolveSiteUrl("http://localhost:3000", "production"), PRODUCTION_SITE_URL);
  assert.equal(resolveSiteUrl("https://portfolio-abc.vercel.app", "production"), PRODUCTION_SITE_URL);
  assert.equal(resolveSiteUrl("https://personadijitalpazarlama.com/", "production"), "https://personadijitalpazarlama.com");
  assert.equal(resolveSiteUrl("http://localhost:3000", "development"), "http://localhost:3000");
  assert.equal(resolveSiteUrl("http://localhost:3000", undefined), "http://localhost:3000");
  assert.equal(resolveSiteUrl("", "preview"), PRODUCTION_SITE_URL);
  assert.equal(resolveSiteUrl("bozuk", undefined), PRODUCTION_SITE_URL);
});
