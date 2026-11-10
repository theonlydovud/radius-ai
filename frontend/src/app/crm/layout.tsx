import { CurrentUserProvider } from "@/components/current-user";

/** Рабочее место менеджера: одна страница, без бокового меню. */
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <CurrentUserProvider role="manager">{children}</CurrentUserProvider>;
}
