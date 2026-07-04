# 共有シークレット認証（Issue #42）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 環境変数 `AUTH_SECRET` の合言葉をログインページで入力させ、以後 Cookie で全ページ・全 API を守る認証を追加する（ローカル開発は未設定なら従来どおり認証なし）。

**Architecture:** `middleware.ts`（Edge）が全リクエストを検査する防御の本体。Cookie 値は `AUTH_SECRET` の SHA-256 hex（生値は入れない）。`/api/auth/login` が照合と Cookie 発行、`/login` が入力 UI。既存コードは無変更の純追加。

**Tech Stack:** Next.js 15 App Router (TypeScript strict), Web Crypto（Edge 対応のため Node `crypto` 不使用）, Tailwind + CSS 変数。

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-07-04-auth-shared-secret-design.md`（本計画の正）
- **フェイルクローズ**: `NODE_ENV === "production"` かつ `AUTH_SECRET` 未設定 → 全リクエスト 503。production 以外で未設定 → 認証スキップ（ローカル開発は従来どおり）
- Cookie: 名前 `auth_token`、値は `sha256Hex(AUTH_SECRET)`、`HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`（30日）、production のみ `Secure` 付与
- 比較は必ず定数時間比較（`timingSafeEqualStr`）。`===` での秘密比較は禁止
- `AUTH_SECRET`・Cookie 値をログ出力しない
- 未認証: `/api/*` → 401 JSON `{ "error": "認証が必要です" }` / ページ → `/login?from=<元パス>` へリダイレクト
- middleware 除外: `/login`、`/api/auth/login`、`/_next/*`、`/favicon.ico` のみ
- ログイン失敗は約 500ms 遅延後に 401 `{ "error": "合言葉が違います" }`
- `from` パラメータは「`/` 始まり かつ `//` 始まりでない」相対パスのみ許可、それ以外は `/`
- 文言はすべて日本語。既存の `/api/eval/*` の `EVAL_UI_ENABLED` ガードは変更しない
- テストフレームワーク無し: 純粋関数は tsx ワンオフ（スクラッチパッド、コミット禁止）、統合は dev サーバー + curl
- dev サーバーは起動前に `ps -eo pid,args | grep -E "next-server|next dev" | grep -v grep` で確認、自分が起動したものは必ず kill。`npx next build` は dev 全停止後、build 後に dev を再開する場合は `rm -rf .next`
- コミットメッセージは日本語、末尾に空行 + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: 認証ヘルパ `lib/auth.ts`

**Files:**
- Create: `lib/auth.ts`
- 検証: tsx ワンオフ（スクラッチパッド）

**Interfaces:**
- Produces（後続タスクが import）:
  - `const AUTH_COOKIE_NAME = "auth_token"`
  - `const AUTH_COOKIE_MAX_AGE = 2592000`（30日、秒）
  - `async function sha256Hex(input: string): Promise<string>`（小文字 hex 64桁）
  - `function timingSafeEqualStr(a: string, b: string): boolean`

- [ ] **Step 1: 実装**

```ts
// lib/auth.ts
// 共有シークレット認証のヘルパ。middleware(Edge ランタイム)から使うため
// Node の crypto ではなく Web Crypto を使う。
export const AUTH_COOKIE_NAME = "auth_token";
export const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30日(秒)

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 定数時間比較。長さが違っても早期 return せず全桁を見る
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}
```

- [ ] **Step 2: tsx ワンオフで検証**

スクラッチパッドの検証スクリプトで:
1. `sha256Hex("abc")` === `"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"`（既知テストベクタ）
2. `sha256Hex("")` === `"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"`
3. `timingSafeEqualStr("same","same")` → true / `("same","diff")` → false / `("short","longer")` → false / `("","")` → true / `("a","")` → false

Run: `npx tsx <scratchpad>/verify-auth.ts`
Expected: 全ケース OK

- [ ] **Step 3: 型チェックとコミット**

Run: `npx tsc --noEmit` → エラーなし

```bash
git add lib/auth.ts
git commit -m "feat: 認証ヘルパ(sha256Hex・定数時間比較)を追加 (Issue #42)"
```

---

### Task 2: `middleware.ts`（防御の本体）

**Files:**
- Create: `middleware.ts`（リポジトリルート。`app/` と同じ階層）

**Interfaces:**
- Consumes: Task 1 の `AUTH_COOKIE_NAME` / `sha256Hex` / `timingSafeEqualStr`
- Produces: 全リクエストの認証ゲート（後続タスクはこの挙動を前提に検証する）

- [ ] **Step 1: 実装**

```ts
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
```

- [ ] **Step 2: dev サーバーで検証（AUTH_SECRET なし = 従来どおり）**

`npm run dev`（AUTH_SECRET なし）で:
- `curl -s -o /dev/null -w '%{http_code}' localhost:3000/` → 200
- `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/personas` → 200
（ローカル開発の無認証動作が保たれていることの確認）

- [ ] **Step 3: dev サーバーで検証（AUTH_SECRET あり）**

いったん止めて `AUTH_SECRET=test-secret-123 npm run dev` で再起動:
- `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' localhost:3000/` → 307 で `/login?from=%2F` へ
- `curl -s -w '\n%{http_code}' localhost:3000/api/personas` → `{"error":"認証が必要です"}` 401
- 正しい Cookie を手計算して付与（`node -e 'crypto.subtle.digest("SHA-256", new TextEncoder().encode("test-secret-123")).then(d=>console.log(Buffer.from(d).toString("hex")))'`）:
  `curl -s -o /dev/null -w '%{http_code}' -H "Cookie: auth_token=<hex>" localhost:3000/` → 200、`/api/personas` も 200
- でたらめ Cookie → 401/リダイレクト
- `curl -s -o /dev/null -w '%{http_code}' localhost:3000/login` → 200 系（この時点でページ未実装なら 404 でもよい。middleware が素通ししていること = 401/307 で**ない**ことを確認）

- [ ] **Step 4: 型チェックとコミット**

Run: `npx tsc --noEmit` → エラーなし

```bash
git add middleware.ts
git commit -m "feat: 全ページ・全APIを守る認証middlewareを追加 (Issue #42)"
```

---

### Task 3: 認証 API `app/api/auth/login/route.ts`

**Files:**
- Create: `app/api/auth/login/route.ts`

**Interfaces:**
- Consumes: Task 1 の `AUTH_COOKIE_NAME` / `AUTH_COOKIE_MAX_AGE` / `sha256Hex` / `timingSafeEqualStr`
- Produces: `POST /api/auth/login` body `{ password: string }` → 200 `{ ok: true }` + Set-Cookie / 400 / 401 / 503

- [ ] **Step 1: 実装**

```ts
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
```

- [ ] **Step 2: curl 検証（`AUTH_SECRET=test-secret-123 npm run dev`）**

- 正解: `curl -si -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"password":"test-secret-123"}'` → 200・`Set-Cookie: auth_token=<64桁hex>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`（Secure なし = dev）
- その Cookie で `GET /api/personas` → 200（middleware を通過できる）
- 不正解: `time curl -s -X POST ... -d '{"password":"wrong"}'` → 401「合言葉が違います」かつ**実時間 0.5 秒以上**
- password 欠落 / 空文字 / 非 JSON body → 400「合言葉を入力してください」
- AUTH_SECRET なしの dev で POST → 400「開発環境では AUTH_SECRET が未設定のため認証は無効です」

- [ ] **Step 3: 型チェックとコミット**

Run: `npx tsc --noEmit` → エラーなし

```bash
git add app/api/auth/login/route.ts
git commit -m "feat: 合言葉照合とCookie発行を行う認証API(/api/auth/login)を追加"
```

---

### Task 4: ログインページ `app/login/page.tsx`

**Files:**
- Create: `app/login/page.tsx`

**Interfaces:**
- Consumes: Task 3 の `POST /api/auth/login`
- Produces: `/login` ページ（UI のみ）

- [ ] **Step 1: 実装**

`useSearchParams` は Suspense 境界が必須（`next build` の prerender でエラーになるため必ず下記構成にする）:

```tsx
// app/login/page.tsx
"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// オープンリダイレクト防止: "/" 始まりかつ "//" 始まりでない相対パスのみ許可
function safeFrom(from: string | null): string {
  if (from && from.startsWith("/") && !from.startsWith("//")) {
    return from;
  }
  return "/";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace(safeFrom(searchParams.get("from")));
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "ログインに失敗しました");
    } catch {
      setError("通信に失敗しました。時間をおいて再度お試しください");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl p-6 space-y-4"
        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          合言葉を入力してください
        </h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="合言葉"
          className="w-full rounded px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
        {error && (
          <p className="text-sm" style={{ color: "#e05252" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || password.length === 0}
          className="w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
        >
          {submitting ? "確認中..." : "入室"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: 一気通貫の e2e（`AUTH_SECRET=test-secret-123 npm run dev`・curl の Cookie jar）**

```bash
J=$(mktemp)
# 1) 未認証でトップ → /login?from=%2F へ 307
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -c "$J" localhost:3000/
# 2) /login は未認証で 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/login
# 3) ログイン成功で Cookie が jar に入る
curl -s -c "$J" -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"password":"test-secret-123"}'
# 4) Cookie 付きでトップ 200・API 200
curl -s -o /dev/null -w '%{http_code}\n' -b "$J" localhost:3000/
curl -s -o /dev/null -w '%{http_code}\n' -b "$J" localhost:3000/api/personas
rm -f "$J"
```
- `safeFrom` の分岐はページ内純粋関数なので tsx ワンオフで直接検証: `safeFrom("/usage")` → `/usage`、`safeFrom("//evil.com")` → `/`、`safeFrom("https://evil.com")` → `/`、`safeFrom(null)` → `/`（関数をコピーした検証スクリプトで可。または `page.tsx` から export して import。export する場合はその旨レポートに記載）
- HTML 構造確認: `curl -s localhost:3000/login | grep -o '合言葉を入力してください'` がヒット。レイアウトは `max-w-sm` の中央カードでスマホ/PC 両対応（コード上の確認でよい）

- [ ] **Step 3: 型チェックとコミット**

Run: `npx tsc --noEmit` → エラーなし

```bash
git add app/login/page.tsx
git commit -m "feat: ログインページ(/login)を追加(スマホ/PC対応・fromリダイレクト)"
```

---

### Task 5: ドキュメント + 本番モード検証 + ビルド確認

**Files:**
- Modify: `.env.example`（`AUTH_SECRET=` 追記）
- Modify: `README.md`（セットアップ・認証の説明）
- Modify: `docs/azure-deployment.md`（環境変数一覧に `AUTH_SECRET` 追加）
- Modify: `PROGRESS.md`（完了メモ）

- [ ] **Step 1: `.env.example` 追記**

既存エントリの近く（コメントスタイルは既存に合わせる）:

```
# 共有シークレット認証の合言葉。本番では必須(未設定だと全リクエスト503)。
# ローカル開発では未設定なら認証なしで従来どおり動く。
# 生成例: openssl rand -base64 32
AUTH_SECRET=
```

- [ ] **Step 2: README / azure-deployment.md 追記**

- `README.md`: 「認証」節を追加 — 仕組み（合言葉 1 つの共有シークレット + Cookie 30日）、ローカルは未設定で認証なし、本番は必須（未設定なら 503 で全遮断）、合言葉の決め方（`openssl rand -base64 32` 推奨、短い単語は不可）、変更したら全ブラウザで再ログインになること
- `docs/azure-deployment.md`: 環境変数一覧・設定手順に `AUTH_SECRET` を追加（必須である旨と 503 フェイルクローズの説明）

- [ ] **Step 3: 本番モードのフェイルクローズ検証**

dev サーバーを**全停止**してから:

```bash
npx next build   # 成功すること
# AUTH_SECRET なしで本番モード起動
npx next start -p 3100 &
curl -s -w '\n%{http_code}\n' localhost:3100/              # → 503 JSON
curl -s -w '\n%{http_code}\n' localhost:3100/api/personas  # → 503 JSON
kill %1
# AUTH_SECRET ありで本番モード起動
AUTH_SECRET=prod-test-456 npx next start -p 3100 &
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' localhost:3100/   # → 307 /login
curl -si -X POST localhost:3100/api/auth/login -H 'Content-Type: application/json' -d '{"password":"prod-test-456"}' | grep -i 'Set-Cookie'  # → Secure が付いている
kill %1
rm -rf .next
```

- [ ] **Step 4: dev 回帰確認**

`npm run dev`（AUTH_SECRET なし）で従来どおり: `/` 200、チャット 1 往復（`POST /api/chat` が正常応答）、`/usage` 200。確認後、自分が起動した dev を kill。

- [ ] **Step 5: PROGRESS.md 更新とコミット**

「完了済み（直近）」に完了メモ（仕組み・フェイルクローズ・検証結果）を追記。

```bash
git add .env.example README.md docs/azure-deployment.md PROGRESS.md
git commit -m "docs: 共有シークレット認証のセットアップ手順を追記、PROGRESS更新 (Issue #42)"
```

---

## 計画外だが同 PR 完了後にやること（コントローラー向けメモ・タスクではない）

- PR 作成（ユーザー承認後マージ）。**マージ後、ユーザーが Azure に `AUTH_SECRET` を設定してからデプロイする必要がある**ことを必ず伝える（設定せずデプロイすると 503 で使えなくなる = フェイルクローズの仕様どおり）
- Issue #42 をクローズ（対応内容コメント付き）
