// app/api/auth/login/route.ts
import { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE,
  sha256Hex,
  timingSafeEqualStr,
} from "@/lib/auth";

// 総当たりを鈍らせるための失敗時遅延(回数ロックは1人用アプリなので作らない)
const FAIL_DELAY_MS = 500;

export async function POST(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "サーバーの認証設定が未完了です（AUTH_SECRET 未設定）" },
        { status: 503 }
      );
    }
    return Response.json(
      { error: "開発環境では AUTH_SECRET が未設定のため認証は無効です" },
      { status: 400 }
    );
  }

  let password: unknown;
  try {
    const body = (await request.json()) as { password?: unknown };
    password = body?.password;
  } catch {
    password = undefined;
  }
  if (typeof password !== "string" || password.length === 0) {
    return Response.json({ error: "合言葉を入力してください" }, { status: 400 });
  }

  if (!timingSafeEqualStr(password, secret)) {
    await new Promise((resolve) => setTimeout(resolve, FAIL_DELAY_MS));
    return Response.json({ error: "合言葉が違います" }, { status: 401 });
  }

  const token = await sha256Hex(secret);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${AUTH_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${AUTH_COOKIE_MAX_AGE}${secure}`,
    },
  });
}
