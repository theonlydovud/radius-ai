import { CurrentUserProvider } from "@/components/current-user";

/** Супер-админ: одна страница — все заявки и статистика, без бокового меню. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <CurrentUserProvider role="admin">{children}</CurrentUserProvider>;
}
