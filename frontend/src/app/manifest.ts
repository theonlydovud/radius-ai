import type { MetadataRoute } from "next";

/**
 * DexaAI как приложение: в Chrome/Edge «Установить DexaAI» — и платформа открывается
 * отдельным окном без адресной строки (на электронной доске — во весь экран).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DexaAI",
    short_name: "DexaAI",
    description: "ИИ-менеджер для Instagram Direct и CRM для заявок",
    start_url: "/login",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    background_color: "#f7f8fb",
    theme_color: "#2f5be8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
