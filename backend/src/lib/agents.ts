/**
 * «Агент» = аккаунт со СВОИМИ знаниями и правилами (knowledge_source_id IS NULL).
 * Другие аккаунты могут подключаться к нему (knowledge_source_id = id агента) —
 * тогда бот отвечает по знаниям и правилам агента, и писать их дважды не нужно.
 * Цепочки (A → B → C) запрещены: источник всегда сам является агентом.
 */

/** Возвращает текст ошибки или null, если привязку можно сохранить. */
export async function validateKnowledgeSource(
  supabase: any,
  accountId: string | null,
  sourceId: string | null
): Promise<string | null> {
  if (!sourceId) return null;
  if (sourceId === accountId) return "Аккаунт не может брать знания сам у себя.";

  const { data: source } = await supabase
    .from("accounts")
    .select("id, knowledge_source_id")
    .eq("id", sourceId)
    .maybeSingle();
  if (!source) return "Агент не найден.";
  if (source.knowledge_source_id) return "Выбранный аккаунт сам использует чужие знания — выберите основной.";

  if (accountId) {
    const { count } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("knowledge_source_id", accountId);
    if (count) return "К этому аккаунту уже подключены другие — сначала отвяжите их.";
  }
  return null;
}

/**
 * Перед удалением агента передаём его знания и правила первому подключённому
 * аккаунту — иначе ON DELETE CASCADE снесёт их у всех.
 */
export async function handOverKnowledgeBeforeDelete(supabase: any, accountId: string) {
  const { data: dependents } = await supabase
    .from("accounts")
    .select("id")
    .eq("knowledge_source_id", accountId)
    .order("created_at", { ascending: true });
  const heir: string | undefined = dependents?.[0]?.id;
  if (!heir) return;

  await supabase.from("accounts").update({ knowledge_source_id: null }).eq("id", heir);
  await supabase.from("accounts").update({ knowledge_source_id: heir }).eq("knowledge_source_id", accountId);
  await supabase.from("knowledge").update({ account_id: heir }).eq("account_id", accountId);
  await supabase.from("system_rules").update({ account_id: heir }).eq("account_id", accountId);
}
