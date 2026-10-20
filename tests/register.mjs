// `node --test` için: Next.js'in "@/…" takma adını ve uzantısız içe aktarmaları
// çözer, "server-only" işaretini boş modüle çevirir. Yalnızca testlerde kullanılır.
import { register } from "node:module";

register("./loader.mjs", import.meta.url);
