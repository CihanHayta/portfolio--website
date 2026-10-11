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
