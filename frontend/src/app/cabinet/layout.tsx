import { CurrentUserProvider } from "@/components/current-user";

/** Кабинет компании, которая зарегистрировалась сама: анкета и заявка на подключение. */
export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  return <CurrentUserProvider role="cabinet">{children}</CurrentUserProvider>;
}
