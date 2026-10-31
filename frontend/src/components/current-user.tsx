"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Manager } from "@/types";

/**
 * Кто сейчас работает в дашборде. Входа по паролю нет: пользователя выбирают
 * внизу бокового меню, выбор хранится в этом браузере. Это удобство, а не защита:
 * выбрать можно любого. От выбора зависят подпись «кто закрыл» и фильтр заявок.
 */

export const DIRECTOR = { id: "director", name: "Голиб Рахматов", role: "CEO/Директор" };

const STORAGE_KEY = "radius.currentUser";
const MANAGER_ROLE = "Менеджер";

export type CurrentUser = { id: string; name: string; role: string; managerId: string | null };

type CurrentUserContextValue = {
  user: CurrentUser;
  /** Директор и менеджеры, которых можно выбрать. */
  options: { id: string; name: string; role: string }[];
  /** Все менеджеры, включая выключенных. */
  managers: Manager[];
  /** Менеджеры и сохранённый выбор загружены. */
  ready: boolean;
  setUserId: (id: string) => void;
  reloadManagers: () => Promise<void>;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [userId, setUserIdState] = useState(DIRECTOR.id);
  const [ready, setReady] = useState(false);

  const reloadManagers = useCallback(async () => {
    try {
      const res = await fetch("/api/managers", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setManagers(json.data ?? []);
    } catch {
      /* без списка останется директор */
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setUserIdState(saved);
    } catch {
      /* private mode */
    }
    reloadManagers().finally(() => setReady(true));
  }, [reloadManagers]);

  const setUserId = useCallback((id: string) => {
    setUserIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode */
    }
  }, []);

  const value = useMemo<CurrentUserContextValue>(() => {
    const manager = managers.find((m) => m.id === userId);
    const user: CurrentUser = manager
      ? { id: manager.id, name: manager.name, role: MANAGER_ROLE, managerId: manager.id }
      : { ...DIRECTOR, managerId: null };
    const options = [
      DIRECTOR,
      // Выключенный менеджер виден в списке, только пока выбран он сам.
      ...managers
        .filter((m) => m.is_active || m.id === user.id)
        .map((m) => ({ id: m.id, name: m.name, role: MANAGER_ROLE })),
    ];
    return { user, options, managers, ready, setUserId, reloadManagers };
  }, [managers, userId, ready, setUserId, reloadManagers]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  const value = useContext(CurrentUserContext);
  if (!value) throw new Error("useCurrentUser должен быть внутри CurrentUserProvider");
  return value;
}
