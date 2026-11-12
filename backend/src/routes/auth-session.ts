import {
  clearCookie,
  clearFailures,
  clientIp,
  COMPANY_COOKIE,
  companyToken,
  companyUsers,
  findCompany,
  findCompanyByLogin,
  findUser,
  findUserByLogin,
  isLocked,
  recordFailure,
  sessionCompany,
  sessionUser,
  setCookie,
  USER_COOKIE,
  userToken,
  verifyPassword,
} from "../lib/auth";

function json(data: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(data), { status, headers });
}

const TOO_MANY = "Слишком много попыток. Подождите 15 минут.";
const WRONG = "Неверный логин или пароль.";

async function readBody(req: Request) {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Кто вошёл на этом устройстве: компания, человек и список людей для выбора. */
export const me = {
  async GET(req: Request) {
    const [company, user] = await Promise.all([sessionCompany(req), sessionUser(req)]);
    if (!company) return json({ data: { company: null, user: null, users: [] } });
    return json({
      data: {
        company,
        user: user && user.company.id === company.id ? user : null,
        users: await companyUsers(company.id),
      },
    });
  },
};

/** Вход по логину компании (дальше — выбор человека) или по личному логину (сразу внутрь). */
export const login = {
  async POST(req: Request) {
    const body = await readBody(req);
    const loginName = String(body.login ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!loginName || !password) return json({ error: "Введите логин и пароль." }, 400);

    const key = `${clientIp(req)}:${loginName}`;
    if (isLocked(key)) return json({ error: TOO_MANY }, 429);

    const company = await findCompanyByLogin(loginName);
    if (company && (await verifyPassword(password, company.password_hash))) {
      clearFailures(key);
      // Новая компания на устройстве — прежний выбор человека сбрасываем.
      return json({ data: { next: "select" } }, 200, [setCookie(COMPANY_COOKIE, companyToken(company), req), ...clearCookie(USER_COOKIE, req)]);
    }

    const user = company ? null : await findUserByLogin(loginName);
    if (user && user.is_active && (await verifyPassword(password, user.password_hash))) {
      clearFailures(key);
      const userCompany = await findCompany(user.company_id);
      if (!userCompany) return json({ error: WRONG }, 401);
      return json({ data: { next: user.role } }, 200, [
        setCookie(COMPANY_COOKIE, companyToken(userCompany), req),
        setCookie(USER_COOKIE, userToken(user), req),
      ]);
    }

    recordFailure(key);
    return json({ error: WRONG }, 401);
  },
};

/** Шаг «Выберите менеджера»: человек из компании, вошедшей на этом устройстве, и его пароль. */
export const select = {
  async POST(req: Request) {
    const company = await sessionCompany(req);
    if (!company) return json({ error: "Сначала войдите в аккаунт компании." }, 401);

    const body = await readBody(req);
    const userId = String(body.user_id ?? "");
    const password = String(body.password ?? "");
    if (!userId || !password) return json({ error: "Выберите себя и введите пароль." }, 400);

    const key = `${clientIp(req)}:user:${userId}`;
    if (isLocked(key)) return json({ error: TOO_MANY }, 429);

    const user = await findUser(userId);
    if (!user || !user.is_active || user.company_id !== company.id) return json({ error: "Пользователь не найден." }, 404);
    if (!(await verifyPassword(password, user.password_hash))) {
      recordFailure(key);
      return json({ error: "Неверный пароль." }, 401);
    }
    clearFailures(key);
    return json({ data: { next: user.role } }, 200, [setCookie(USER_COOKIE, userToken(user), req)]);
  },
};

/** scope=user — сменить пользователя (компания остаётся), scope=all — выйти совсем. */
export const logout = {
  async POST(req: Request) {
    const body = await readBody(req);
    const cookies = clearCookie(USER_COOKIE, req);
    if (body.scope === "all") cookies.push(...clearCookie(COMPANY_COOKIE, req));
    return json({ ok: true }, 200, cookies);
  },
};
