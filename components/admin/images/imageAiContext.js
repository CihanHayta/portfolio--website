"use client";

import { createContext } from "react";

// Blok ayarlarındaki görsel alanının "Yapay zekâyla oluştur" penceresi için editör
// bağlamı: yazının kimliği, başlığı, blokları, kapağı ve taslak oluşturma işlevi.
// Bağlam yoksa (ör. şablon galerisi) yalnızca "Görsel yükle" gösterilir.
//   { postId, getTitle(), getBlocks(), getCover(), ensureDraft(), blockId? }
export const ImageAiContext = createContext(null);
