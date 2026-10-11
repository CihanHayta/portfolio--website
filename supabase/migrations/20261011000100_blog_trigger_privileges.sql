-- Trigger fonksiyonları yalnızca trigger'lar tarafından çalıştırılır; API
-- rollerinin bunları doğrudan çağırma yetkisi olmasına gerek yoktur.
-- (Supabase güvenlik danışmanının SECURITY DEFINER uyarısını kapatır.)
revoke execute on function public.blog_posts_track_slug() from public, anon, authenticated;
revoke execute on function public.blog_posts_before_update() from public, anon, authenticated;
