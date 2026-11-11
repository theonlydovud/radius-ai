import { LeadsBoard } from "@/components/leads-board";

export default function LeadsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Заявки</h1>
        <p className="mt-1 text-sm text-slate-500">ИИ собирает данные у клиента, заявка уходит ответственному менеджеру.</p>
      </div>
      <LeadsBoard />
    </div>
  );
}
