/**
 * Следующий ответственный по очереди (round-robin) — внутри компании. Очередь считает
 * функция assign_next_manager_in(company) в БД: она хранит последнего назначенного и
 * блокирует строку, поэтому переживает перезапуск Render и одновременные заявки.
 * Ошибка назначения не должна терять заявку — вернём null, и заявка создастся
 * без ответственного.
 */
export async function assignNextManager(supabase: any, companyId: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.rpc("assign_next_manager_in", { p_company: companyId });
  if (error) {
    console.error("[Lead Assign] Error:", error.message);
    return null;
  }
  const manager = Array.isArray(data) ? data[0] : data;
  return manager?.id ? { id: manager.id, name: manager.name } : null;
}
