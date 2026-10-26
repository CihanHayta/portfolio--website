// Blog görselleri Supabase Storage'dan gelir; next/image yalnızca bu
// projenin herkese açık kovasını optimize eder.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;

// Yerel Supabase (`supabase start`, 127.0.0.1) ile geliştirirken görsel
// optimizasyonunun yerel adrese erişmesine izin verilir; üretimde kapalıdır.
const isLocalSupabase = ["localhost", "127.0.0.1"].includes(supabaseUrl?.hostname);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp'ın yerel kitaplığı (libvips) ayrı bir @img paketinde durur ve
  // otomatik izlemede atlanabiliyor; yükleme fonksiyonuna açıkça eklenir.
  outputFileTracingIncludes: {
    "/api/admin/media": ["./node_modules/@img/**/*"],
    "/api/admin/ai/images": ["./node_modules/@img/**/*"],
    "/api/admin/ai/screenshots": ["./node_modules/@img/**/*"],
    "/api/admin/ai/import-image": ["./node_modules/@img/**/*"],
    "/api/admin/ai/visual-image": ["./node_modules/@img/**/*"],
  },
  // İsteğe bağlı tarayıcı okuyucusu (yalnızca yerelde, PLAYWRIGHT_READER=1)
  // paketlenmez; çalışma anında dinamik olarak yüklenir.
  serverExternalPackages: ["playwright-core"],
  // Yalnızca yerel hata ayıklama derlemesinde (E2E_SOURCEMAPS=1): tarayıcı kaynak haritaları.
  productionBrowserSourceMaps: process.env.E2E_SOURCEMAPS === "1",
  // Temel güvenlik başlıkları. Çerçeve yalnızca aynı kaynakta izinli: yönetimdeki
  // AI önizlemesi (/admin/ai-preview) kendi sitesinde iframe içinde açılır.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
    ];
  },
  images: {
    dangerouslyAllowLocalIP: isLocalSupabase,
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol.replace(":", ""),
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/public/blog-media/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
