"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Phone, MapPin, Weight, Package } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Lead, LeadStatus } from "@/types";

const STATUS_LABEL: Record<LeadStatus, string> = {
  pending_quote: "Ожидает расчёт",
  quoted: "Расчёт отправлен",
  closed: "Закрыта",
};

const STATUS_VARIANT: Record<LeadStatus, "warning" | "accent" | "secondary"> = {
  pending_quote: "warning",
  quoted: "accent",
  closed: "secondary",
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeads(data.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSendQuote(lead: Lead) {
    const price = Number(priceDrafts[lead.id]);
    if (!price || price <= 0) return;
    setSubmitting(lead.id);
    await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote_price: price }),
    });
    setSubmitting(null);
    load();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Заявки</h1>
        <p className="mt-1 text-sm text-slate-500">
          ИИ собирает данные у клиента, логист вводит стоимость и отправляет расчёт.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Загрузка...</p>
      ) : leads.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <ClipboardList className="h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-500">Заявок пока нет.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {leads.map((lead) => (
            <Card key={lead.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{lead.client_name}</p>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Phone className="h-3 w-3" /> {lead.client_phone}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[lead.status]}>{STATUS_LABEL[lead.status]}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5 text-sm text-slate-600">
                  <p className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {lead.collected_data?.origin_city ?? "—"} → {lead.collected_data?.destination_city ?? "—"}
                  </p>
                  <p className="flex items-center gap-2">
                    <Weight className="h-3.5 w-3.5 text-slate-400" />
                    {lead.collected_data?.weight ?? "не указан вес"}
                  </p>
                  <p className="flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-slate-400" />
                    {lead.collected_data?.cargo_type ?? "не указан тип груза"}
                  </p>
                </div>

                {lead.status === "pending_quote" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="number"
                      placeholder="Сумма, $"
                      value={priceDrafts[lead.id] ?? ""}
                      onChange={(e) =>
                        setPriceDrafts((prev) => ({ ...prev, [lead.id]: e.target.value }))
                      }
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSendQuote(lead)}
                      disabled={submitting === lead.id}
                    >
                      Отправить
                    </Button>
                  </div>
                ) : lead.quote_price ? (
                  <p className="text-sm font-semibold text-slate-900">
                    {formatCurrency(lead.quote_price)}
                  </p>
                ) : null}

                <p className="text-xs text-slate-400">Заявка от {formatDate(lead.created_at)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
