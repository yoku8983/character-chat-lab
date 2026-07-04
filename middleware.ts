// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, sha256Hex, timingSafeEqualStr } from "@/lib/auth";

// _next(静的アセット・HMR)と favicon は認証対象外
export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ログインページと認証 API は未認証で到達できる必要がある
  if (pathname === "/login" || pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // フェイルクローズ: 本番で設定し忘れたら丸裸ではなく全遮断
      return new NextResponse(
        JSON.stringify({ error: "サーバーの認証設定が未完了です（AUTH_SECRET 未設定）" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
    // ローカル開発(未設定)は認証なし
    return NextResponse.next();
  }

  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? "";
  const expected = await sha256Hex(secret);
  if (cookie && timingSafeEqualStr(cookie, expected)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ error: "認証が必要です" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("from", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}
