"use client";

import { useState } from "react";
import { CreateLeadButton } from "@/components/create-lead-dialog";
import { LeadsBoard } from "@/components/leads-board";

export default function LeadsPage() {
  // Новая заявка — пересоздаём доску, чтобы она перечитала список.
  const [key, setKey] = useState(0);
  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Заявки</h1>
          <p className="mt-1 text-sm text-slate-500">ИИ собирает данные у клиента, заявка уходит ответственному менеджеру.</p>
        </div>
        <CreateLeadButton onCreated={() => setKey((k) => k + 1)} className="self-start" />
      </div>
      <LeadsBoard key={key} />
    </div>
  );
}
