"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** «Знания ИИ» объединены с правилами и знаниями в одну вкладку «Роль ИИ». */
export default function Redirect() {
  const router = useRouter();
  useEffect(() => router.replace("/ai-role"), [router]);
  return null;
}
