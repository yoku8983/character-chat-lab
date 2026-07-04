# ペルソナスキーマ拡張 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ペルソナ定義に `user_role` / `relationships` / `point_in_time` の 3 optional フィールドを追加し、プロンプト・編集 UI・サンプル・ドキュメントまで一貫させる（Issue #34 T3 の PR 1）。

**Architecture:** `lib/types.ts` の `Persona` 型に optional フィールドを追加し、`lib/prompt.ts` の `buildSystemPrompt` が値の存在するときだけ対応セクションを出力する。`components/PersonaEditor.tsx` に既存パターン流用のフォームセクションを追加（dormant だった `anti_examples` の編集 UI も同時に追加）。既存ペルソナ・DB は無変更で動き続ける（純追加・後方互換）。

**Tech Stack:** Next.js 15 (App Router) / TypeScript strict / Tailwind + CSS 変数。テストフレームワークなし（tsx ワンオフ検証 + `tsc --noEmit` + `next build` が流儀）。

## Global Constraints

- 新フィールドはすべて **optional**。既存ペルソナ定義（YAML・DB 内 JSON）は無変更で従来どおり動くこと
- プロンプトの新セクションは「値が存在し空でない（trim 後に非空 / 配列は length > 0）ときのみ」出力。undefined・空文字・空配列ならセクションごと省略
- `buildConvertSystemPrompt`（口調変換）と `buildFewShotMessages` は**変更しない**
- サンプルペルソナに `anti_examples` の値は**追加しない**（PR 3 の A/B 実証を汚さないため）
- サンプルペルソナに実在の人物の名前を使わない
- tsx ワンオフ検証スクリプトはコミットしない（scratchpad に置く）
- ビルド前に dev サーバー停止。build 後に dev を再開する場合は `rm -rf .next` してから
- コミットメッセージは日本語・Conventional Commits 形式（既存ログ準拠）

---

### Task 1: 型定義とプロンプト組立

**Files:**
- Modify: `lib/types.ts:1-34`
- Modify: `lib/prompt.ts:3-68`（`buildSystemPrompt` のみ）
- Test: tsx ワンオフ（scratchpad、コミットしない）

**Interfaces:**
- Consumes: 既存の `Persona` / `SpeakingStyle` 型、`buildSystemPrompt(persona, episodicMemories?)`
- Produces: `Relationship { name: string; address_as: string; attitude: string }`（export）、`Persona.identity.point_in_time?: string`、`Persona.user_role?: string`、`Persona.relationships?: Relationship[]`。Task 2・3 はこの型名・フィールド名をそのまま使う

- [ ] **Step 1: `lib/types.ts` に型を追加**

`KnowledgeDomain` の直後（12行目付近）に追加:

```ts
export interface Relationship {
  name: string;       // 相手の名前
  address_as: string; // 呼び方
  attitude: string;   // 態度・距離感
}
```

`Persona` を次のように変更（`identity` に `point_in_time` を、`behavior` と `examples` の間に `user_role` / `relationships` を追加）:

```ts
export interface Persona {
  id: string;
  name: string;
  identity: {
    personality: string;
    background: string;
    point_in_time?: string; // 物語上のどの時点のキャラか（時系列混在ハルシネーション防止）
    speaking_style: SpeakingStyle;
  };
  knowledge: {
    domains: KnowledgeDomain[];
  };
  memory: {
    type: string;
    entries: string[];
  };
  behavior: {
    constraints: string[];
  };
  user_role?: string;             // ユーザーはキャラにとって誰か（例: プロデューサー）
  relationships?: Relationship[]; // 主要人物への呼び方・態度
  examples: { user: string; assistant: string }[];
  anti_examples?: { user: string; assistant: string }[];
}
```

- [ ] **Step 2: `lib/prompt.ts` の `buildSystemPrompt` に 3 セクションを追加**

(a) `## 経歴`（現12行目 `parts.push(`\n## 経歴\n...`)`）の**直後**に追加:

```ts
  if (identity.point_in_time && identity.point_in_time.trim()) {
    parts.push(
      `\n## 時点\nあなたは物語上の「${identity.point_in_time.trim()}」の時点にいます。それ以降の出来事はまだ起きておらず、あなたは知りません。`
    );
  }
```

(b) `## 行動制約` ブロック（現41-46行目 `if (behavior.constraints.length > 0) {...}`）の**直前**に追加:

```ts
  if (persona.relationships && persona.relationships.length > 0) {
    parts.push(`\n## 人間関係`);
    for (const rel of persona.relationships) {
      parts.push(`- ${rel.name}: 「${rel.address_as}」と呼ぶ。${rel.attitude}`);
    }
  }

  if (persona.user_role && persona.user_role.trim()) {
    parts.push(
      `\n## 会話相手\nいまあなたが会話している相手（ユーザー）は「${persona.user_role.trim()}」です。`
    );
  }
```

`buildConvertSystemPrompt` / `buildFewShotMessages` / `buildConvertPrompt` は変更しない。

- [ ] **Step 3: tsx ワンオフで検証**

`/tmp/claude-1000/-home-yoku8983-projects-character-chat-lab/f10a8781-4699-4c7a-8a09-ca968309b21c/scratchpad/verify-prompt.ts` を作成:

```ts
import { buildSystemPrompt } from "/home/yoku8983/projects/character-chat-lab/lib/prompt";
import { Persona } from "/home/yoku8983/projects/character-chat-lab/lib/types";

const base: Persona = {
  id: "t",
  name: "テスト",
  identity: {
    personality: "性格",
    background: "経歴",
    speaking_style: {
      first_person: "私",
      tone: "calm",
      sentence_endings: ["です"],
      catchphrases: [],
      vocabulary_notes: "",
    },
  },
  knowledge: { domains: [] },
  memory: { type: "static", entries: [] },
  behavior: { constraints: ["制約A"] },
  examples: [],
};

// 1) 新フィールドなし → 新セクションが一切出ない
const p1 = buildSystemPrompt(base);
for (const h of ["## 時点", "## 人間関係", "## 会話相手"]) {
  if (p1.includes(h)) throw new Error(`未指定なのに ${h} が出力された`);
}

// 2) 空文字・空配列 → 出ない
const p2 = buildSystemPrompt({
  ...base,
  identity: { ...base.identity, point_in_time: "  " },
  user_role: "",
  relationships: [],
});
for (const h of ["## 時点", "## 人間関係", "## 会話相手"]) {
  if (p2.includes(h)) throw new Error(`空値なのに ${h} が出力された`);
}

// 3) 全指定 → 内容と順序を確認
const p3 = buildSystemPrompt({
  ...base,
  identity: { ...base.identity, point_in_time: "物語中盤" },
  user_role: "プロデューサー",
  relationships: [{ name: "アキラ", address_as: "アキラさん", attitude: "尊敬している" }],
});
if (!p3.includes("## 時点")) throw new Error("時点セクションがない");
if (!p3.includes("「物語中盤」の時点にいます。それ以降の出来事はまだ起きておらず、あなたは知りません。"))
  throw new Error("時点の文言が不正");
if (!p3.includes("- アキラ: 「アキラさん」と呼ぶ。尊敬している")) throw new Error("人間関係の行が不正");
if (!p3.includes("いまあなたが会話している相手（ユーザー）は「プロデューサー」です。"))
  throw new Error("会話相手の文言が不正");
const order = ["## 経歴", "## 時点", "## 話し方", "## 人間関係", "## 会話相手", "## 行動制約"];
let last = -1;
for (const h of order) {
  const idx = p3.indexOf(h);
  if (idx < 0) throw new Error(`${h} がない`);
  if (idx < last) throw new Error(`順序不正: ${h}`);
  last = idx;
}

console.log("OK: 全検証パス");
```

Run: `cd /home/yoku8983/projects/character-chat-lab && npx tsx /tmp/claude-1000/-home-yoku8983-projects-character-chat-lab/f10a8781-4699-4c7a-8a09-ca968309b21c/scratchpad/verify-prompt.ts`
Expected: `OK: 全検証パス`

- [ ] **Step 4: 型チェック**

Run: `cd /home/yoku8983/projects/character-chat-lab && npx tsc --noEmit`
Expected: エラーなし（終了コード 0）

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/prompt.ts
git commit -m "feat: ペルソナに user_role / relationships / point_in_time を追加しプロンプトへ注入"
```

---

### Task 2: PersonaEditor フォーム拡張

**Files:**
- Modify: `components/PersonaEditor.tsx`（フォームセクション追加、JSON 凡例表、保存後の件数突合）

**Interfaces:**
- Consumes: Task 1 の `Persona.identity.point_in_time?: string`、`Persona.user_role?: string`、`Persona.relationships?: Relationship[]`、既存 `Persona.anti_examples?: { user: string; assistant: string }[]`
- Produces: なし（UI のみ。API は既存の `as Persona` キャストのため変更不要）

- [ ] **Step 1: 「性格・背景」セクションに時点入力を追加**

経歴の `<div>`（現394-404行目）の直後に追加:

```tsx
              <div>
                <label className={labelClass} style={{ color: "var(--text-secondary)" }}>時点（物語上のどの時点のキャラか・任意）</label>
                <input
                  value={form.identity.point_in_time ?? ""}
                  onChange={(e) => update((p) => { p.identity.point_in_time = e.target.value; })}
                  className="w-full rounded-lg px-4 py-2 text-base outline-none"
                  style={inputStyle}
                  placeholder="例: ○○編の直後、デビュー1年目"
                />
              </div>
```

- [ ] **Step 2: 「人間関係」セクションを新設**

「静的記憶」セクション（現560-587行目）と「行動制約」セクションの**間**に追加（プロンプト出力順と揃える）:

```tsx
          {/* 人間関係 */}
          <section>
            <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4" style={{ color: "var(--accent-hover)" }}>人間関係</h3>
            <div className="mb-3">
              <label className={labelClass} style={{ color: "var(--text-secondary)" }}>会話相手（ユーザーはキャラにとって誰か・任意）</label>
              <input
                value={form.user_role ?? ""}
                onChange={(e) => update((p) => { p.user_role = e.target.value; })}
                className="w-full rounded-lg px-4 py-2 text-base outline-none"
                style={inputStyle}
                placeholder="例: プロデューサー、初対面の来館者"
              />
            </div>
            <label className={labelClass} style={{ color: "var(--text-secondary)" }}>主要人物への呼び方・態度</label>
            {(form.relationships ?? []).map((rel, i) => (
              <div key={i} className="mb-3 p-4 rounded-lg" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>関係 {i + 1}</span>
                  <button
                    onClick={() => update((p) => { p.relationships!.splice(i, 1); })}
                    className="text-sm"
                    style={{ color: "#dc2626" }}
                  >
                    削除
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    value={rel.name}
                    onChange={(e) => update((p) => { p.relationships![i].name = e.target.value; })}
                    className="rounded px-3 py-1 text-sm outline-none"
                    style={inputStyle}
                    placeholder="相手の名前"
                  />
                  <input
                    value={rel.address_as}
                    onChange={(e) => update((p) => { p.relationships![i].address_as = e.target.value; })}
                    className="rounded px-3 py-1 text-sm outline-none"
                    style={inputStyle}
                    placeholder="呼び方"
                  />
                  <input
                    value={rel.attitude}
                    onChange={(e) => update((p) => { p.relationships![i].attitude = e.target.value; })}
                    className="rounded px-3 py-1 text-sm outline-none"
                    style={inputStyle}
                    placeholder="態度・距離感"
                  />
                </div>
              </div>
            ))}
            <button
              onClick={() => update((p) => { p.relationships = [...(p.relationships ?? []), { name: "", address_as: "", attitude: "" }]; })}
              className="text-sm px-4 py-2 rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            >
              + 関係を追加
            </button>
          </section>
```

- [ ] **Step 3: 「悪い応答例」セクションを新設**

「会話例 (few-shot)」セクション（現618-663行目）の**直後**に追加:

```tsx
          {/* 悪い応答例 */}
          <section>
            <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4" style={{ color: "var(--accent-hover)" }}>悪い応答例 (anti-examples)</h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
              「こう応答してはいけない」例。システムプロンプトに否定文脈で注入され、崩れやすい応答を抑制します（任意）。
            </p>
            {(form.anti_examples ?? []).map((ex, i) => (
              <div key={i} className="mb-3 p-4 rounded-lg" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>悪い例 {i + 1}</span>
                  <button
                    onClick={() => update((p) => { p.anti_examples!.splice(i, 1); })}
                    className="text-sm"
                    style={{ color: "#dc2626" }}
                  >
                    削除
                  </button>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>ユーザー</label>
                    <input
                      value={ex.user}
                      onChange={(e) => update((p) => { p.anti_examples![i].user = e.target.value; })}
                      className="w-full rounded px-3 py-1 text-sm outline-none"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>してはいけない応答</label>
                    <textarea
                      value={ex.assistant}
                      onChange={(e) => update((p) => { p.anti_examples![i].assistant = e.target.value; })}
                      rows={2}
                      className="w-full rounded px-3 py-1 text-sm outline-none resize-none"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={() => update((p) => { p.anti_examples = [...(p.anti_examples ?? []), { user: "", assistant: "" }]; })}
              className="text-sm px-4 py-2 rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            >
              + 悪い例を追加
            </button>
          </section>
```

- [ ] **Step 4: JSON キー凡例表に 4 行追加**

`examples[]` の行（現304行目）の直後に追加:

```tsx
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>anti_examples[]</td><td>悪い応答例（user + assistant のペア・任意）</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>identity.point_in_time</td><td>物語上のどの時点のキャラか（任意）</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>user_role</td><td>ユーザーはキャラにとって誰か（任意）</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>relationships[]</td><td>主要人物への呼び方・態度（name + address_as + attitude・任意）</td></tr>
```

- [ ] **Step 5: 保存後の件数突合に relationships / anti_examples を追加**

`handleSave` 内の `expected` / `actual`（現154-165行目）にフィールドを追加し、比較条件（166-171行目）とエラーメッセージ（174行目）にも同名で追加:

```ts
          const expected = {
            domains: saveData.knowledge?.domains?.length ?? 0,
            entries: saveData.memory?.entries?.length ?? 0,
            constraints: saveData.behavior?.constraints?.length ?? 0,
            examples: saveData.examples?.length ?? 0,
            relationships: saveData.relationships?.length ?? 0,
            antiExamples: saveData.anti_examples?.length ?? 0,
          };
          const actual = {
            domains: saved.knowledge?.domains?.length ?? 0,
            entries: saved.memory?.entries?.length ?? 0,
            constraints: saved.behavior?.constraints?.length ?? 0,
            examples: saved.examples?.length ?? 0,
            relationships: saved.relationships?.length ?? 0,
            antiExamples: saved.anti_examples?.length ?? 0,
          };
          if (
            actual.domains !== expected.domains ||
            actual.entries !== expected.entries ||
            actual.constraints !== expected.constraints ||
            actual.examples !== expected.examples ||
            actual.relationships !== expected.relationships ||
            actual.antiExamples !== expected.antiExamples
          ) {
            console.error("[PersonaEditor] Save verification failed", { expected, actual });
            setError(
              `保存データの検証に失敗しました（期待: domains=${expected.domains}, entries=${expected.entries}, constraints=${expected.constraints}, examples=${expected.examples}, relationships=${expected.relationships}, antiExamples=${expected.antiExamples} / 実際: domains=${actual.domains}, entries=${actual.entries}, constraints=${actual.constraints}, examples=${actual.examples}, relationships=${actual.relationships}, antiExamples=${actual.antiExamples}）`
            );
            setSaving(false);
            return;
          }
```

- [ ] **Step 6: 型チェック**

Run: `cd /home/yoku8983/projects/character-chat-lab && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 7: Commit**

```bash
git add components/PersonaEditor.tsx
git commit -m "feat: ペルソナ編集UIに人間関係・時点・悪い応答例のフォームを追加"
```

---

### Task 3: サンプルペルソナ・ドキュメント更新とビルド検証

**Files:**
- Modify: `personas/mira.yaml`
- Modify: `personas/tetsu-oyaji.yaml`
- Modify: `README.md:122-251`（YAML 例・生成 AI プロンプト例）
- Modify: `PROGRESS.md`（完了メモ）

**Interfaces:**
- Consumes: Task 1 のフィールド名（`identity.point_in_time` / `user_role` / `relationships[].name/address_as/attitude`）。YAML キー名はこれと完全一致させること

- [ ] **Step 1: `personas/mira.yaml` に実例値を追加**

`identity.background` の直後（16行目の後）に追加:

```yaml
  point_in_time: "ノヴァ・ラボ入所3年目。初めての単独論文を執筆している時期"
```

`behavior:` ブロックの直後・`examples:` の前に追加:

```yaml
user_role: "ノヴァ・ラボに見学に来た外部の人。ミラにとっては気軽に雑談できる相手"

relationships:
  - name: "田村博士"
    address_as: "田村所長"
    attitude: "温厚な人柄を尊敬しているが、締切の話題になると少し及び腰になる"
```

- [ ] **Step 2: `personas/tetsu-oyaji.yaml` に実例値を追加**

`identity.background` の直後（15行目の後）に追加:

```yaml
  point_in_time: "博物館の管理人になって10年目。妻を亡くして5年が経った頃"
```

`behavior:` ブロックの直後・`examples:` の前に追加:

```yaml
user_role: "鉄道博物館にふらりと立ち寄った来館者。ワシにとっては茶飲み話の相手"

relationships:
  - name: "信夫（昔の機関士仲間）"
    address_as: "ノブ"
    attitude: "軽口を叩き合える数少ない友人。感謝や心配は素直に口にしない"
```

- [ ] **Step 3: README の YAML 例を更新**

`README.md` の YAML コード例（132-172行目）で、`background` の直後に追加:

```yaml
  point_in_time: "物語上のどの時点か"  # 任意: 時系列混在によるハルシネーション防止
```

`examples:` ブロックの直前（`behavior` の後）に追加:

```yaml
# 任意: ユーザーはキャラにとって誰か（会話相手の既定値）
user_role: "プロデューサー"

# 任意: 主要人物への呼び方・態度
relationships:
  - name: "相手の名前"
    address_as: "呼び方"
    attitude: "態度・距離感"
```

- [ ] **Step 4: README の生成 AI プロンプト例を更新**

「以下を正確に反映してください」の箇条書き（198-203行目）に 2 行追加:

```
- 主要な登場人物への呼び方・態度（relationships）
- 物語上のどの時点のキャラかの明示（point_in_time）と、ユーザーは誰として会話するか（user_role）
```

出力フォーマット JSON（207-245行目）の `"behavior"` と `"examples"` の間に追加:

```
  "user_role": "ユーザーはキャラにとって誰か（例: 部下、ファン、初対面の客）",
  "relationships": [
    {
      "name": "主要人物の名前",
      "address_as": "その人物への呼び方",
      "attitude": "その人物への態度・距離感（1文）"
    }
  ],
```

`"identity"` 内の `"background"` の直後に追加:

```
    "point_in_time": "物語上のどの時点のキャラか（1文。例: ○○編終了直後）",
```

- [ ] **Step 5: PROGRESS.md に完了メモを追記**

「完了済み」セクションの先頭に、既存エントリと同じ体裁で追記（ブランチ名 `feat/persona-schema-extension`、追加フィールド 3 つ + anti_examples 編集 UI、後方互換 optional、buildConvertSystemPrompt 非変更、の要点を 5 行程度で）。冒頭「次にやること」の T3 行に「スキーマ拡張（PR 1）完了」の進捗を反映する。

- [ ] **Step 6: ビルド検証**

dev サーバーが動いていないことを確認してから:

Run: `cd /home/yoku8983/projects/character-chat-lab && npx next build`
Expected: ビルド成功（Compiled successfully）

Run 後: `rm -rf .next`（dev 再開時の古いビルド掴み防止）

- [ ] **Step 7: Commit**

```bash
git add personas/mira.yaml personas/tetsu-oyaji.yaml README.md PROGRESS.md
git commit -m "docs: サンプルペルソナとREADMEに新フィールドの実例を追加"
```

---

## 手動確認（全タスク完了後・コントローラ実施）

1. `npm run dev` を起動し、ペルソナ管理 → mira を編集 → 「人間関係」「時点」「悪い応答例」セクションが表示され、YAML 由来の値が入っていること
2. `user_role` を書き換えて保存 → 再読込で保持されていること
3. チャットで 1 往復し、応答が破綻しないこと（新フィールドがプロンプトに乗った状態での回帰確認）
