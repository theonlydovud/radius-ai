import { getPlans } from "../lib/plans";

/** Тарифы для сайта: лендинг и страница регистрации. Без входа. */
export async function GET() {
  return Response.json({ data: await getPlans() }, { headers: { "Cache-Control": "public, max-age=60" } });
}
