# ホスティング・コスト分析（AWS / Azure 最安構成）

> 作成日: 2026-06-23 / 為替前提: **1 USD = ¥161.5**（2026-06-23 時点）
> 対象: `character-chat-lab`（Next.js 15 SSR + API Routes、better-sqlite3 ローカル DB、OpenRouter プロキシ、ストリーミング応答）

## 結論（先に要点）

- **個人利用（〜数百チャット/日）なら、計算リソース費は AWS・Azure とも「永続無料枠」内で実質 ¥0/日・¥0/月。**
- 実際に発生する費用は **(1) 永続ストレージ 数十円/月、(2) LLM(OpenRouter)のトークン課金（ホスティングとは別建て）** だけ。
- 「常時起動でなくコールドスタート可」という条件は、**スケール・トゥ・ゼロ**（無リクエスト時は課金ゼロ）構成にそのまま合致し、最安化の前提として理想的。

### 推奨ランキング

| 順位 | 構成 | 月額(目安) | 日額(目安) | 改修量 | 備考 |
|---|---|---|---|---|---|
| ◎ 本命 | **Azure Container Apps (Consumption, min-replica=0)** | **¥0〜¥50** | **¥0〜¥2** | 小 | 今の Docker をほぼそのまま。スケールゼロ。DB は Azure Files マウント or libSQL 化 |
| ○ 最小改修・完全無料 | **Azure App Service Linux F1 (Free)** | **¥0** | **¥0** | ほぼ無し | SQLite を `/home`(永続)に置くだけ。制約: 60 CPU分/日・SLA無し |
| ○ AWS 本命 | **AWS Lambda + Function URL(streaming) + DynamoDB or Turso** | **¥0〜¥50** | **¥0〜¥2** | 中 | データ層をローカル SQLite から移行する改修が必要 |
| △ 参考 | AWS Lightsail / App Service B1（常時起動） | ¥550〜¥2,000 | ¥18〜¥66 | 小 | コールドスタート不要なら。最安ではない |

---

## 1. このアプリのホスティング上の「肝」

| 特性 | 内容 | ホスティングへの影響 |
|---|---|---|
| Next.js 15 SSR + API Routes | Node ランタイムが必要 | 静的ホスティング不可。サーバ実行環境が要る |
| **better-sqlite3（ローカルファイル DB）** | `data/chat-lab.db` に WAL で書込 | **最重要**。サーバレス/スケールゼロでは local disk が揮発するため、状態の置き場所を決める必要がある |
| ストリーミング応答 | LLM 生成中ずっとリクエストが開く（10〜30秒） | 従量課金の「アクティブ秒数」が伸びる＝コストドライバ |
| ネイティブモジュール | better-sqlite3 はビルド必須 | Linux 用にビルド/コンテナ化が必要 |
| 想定トラフィック | 個人利用・低頻度 | 無料枠に余裕で収まる |

### DB（状態）の置き場所 3 パターン

| 方式 | 改修量 | 対応プラットフォーム | 注意点 |
|---|---|---|---|
| A. SQLite を永続ストレージに置く | 小 | App Service F1(`/home`)、Container Apps + Azure Files | App Service はそのまま動く。Azure Files(SMB) は SQLite のロック相性が悪いので NFS or 単一レプリカ必須 |
| B. libSQL/Turso へ移行 | 小〜中 | 全部 | `better-sqlite3` → `@libsql/client`。SQLite 互換で SQL ほぼ流用可。無料枠あり |
| C. DynamoDB / Cosmos DB へ移行 | 中〜大 | Lambda + DynamoDB 等 | `lib/db-*.ts` を全面書換。クラウドネイティブで完全サーバレス |

---

## 2. 料金単価（2026-06 時点）

### AWS Lambda（永続無料枠）
- リクエスト: **100万/月 無料**、超過 $0.20/100万
- 実行時間: **400,000 GB-秒/月 無料**、超過 $0.0000166667/GB-秒（x86）/ $0.0000133334/GB-秒（ARM, 約20%安）
- **Lambda Function URL は無料**（API Gateway 不要）。かつ**レスポンスストリーミング対応**＝このアプリのチャットに必須要件を満たす
- 出典: <https://aws.amazon.com/lambda/pricing/>

### Azure Container Apps（Consumption / スケールゼロ）
- 無料枠: **180,000 vCPU-秒 + 360,000 GiB-秒 + 200万リクエスト/月**（サブスクリプション単位）
- アクティブ単価: $0.000024/vCPU-秒、$0.000003/GiB-秒
- アイドル単価（min-replica>0 のとき）: $0.000008/vCPU-秒、$0.000001/GiB-秒
- **min-replica=0（スケールゼロ）なら無リクエスト時は課金ゼロ**（既定でゼロにスケール）
- 出典: <https://azure.microsoft.com/en-us/pricing/details/container-apps/>

### Azure App Service Linux F1（Free）
- **完全無料（¥0）**。制約: **CPU 60分/日**、RAM 1GB、ストレージ 1GB（`/home` は永続）、SLA 無し、独自ドメイン SSL 無し、約20分アイドルでアンロード（次アクセス時コールドスタート）
- 出典: <https://azure.microsoft.com/en-us/pricing/details/app-service/linux/>

---

## 3. コスト試算

### 負荷モデル
1 チャット = ストリーミング応答中ずっと実行課金 ≒ **アクティブ 15 秒**、メモリ **0.5 vCPU / 1 GiB**（Lambda は 1024 MB）。付随 API（履歴読込・保存等）は短時間のため無視。

| シナリオ | チャット/日 | チャット/月 | アクティブ秒/月 |
|---|---|---|---|
| A. 軽め(個人) | 100 | 3,000 | 45,000 |
| B. 多め | 500 | 15,000 | 225,000 |

### 無料枠を使い切るしきい値
- **Azure Container Apps**: 180,000 vCPU-秒 ÷ (15s×0.5) ＝ **約 24,000 チャット/月（≒ 800/日）まで ¥0**
- **AWS Lambda**: 400,000 GB-秒 ÷ (15s×1GB) ＝ **約 26,000 チャット/月（≒ 880/日）まで ¥0**

→ 個人利用の現実的レンジ（シナリオ A も B も）は **計算リソース費 ¥0**。

### プラットフォーム別 月額/日額

| 構成 | シナリオA(100/日) | シナリオB(500/日) | 内訳 |
|---|---|---|---|
| **Azure Container Apps** | 月 **¥0〜¥50** / 日 **¥0〜¥2** | 月 **¥0〜¥50** / 日 **¥0〜¥2** | 計算 ¥0（無料枠内）+ Azure Files ストレージ約¥10〜30 + トランザクション数円。レジストリは **ghcr.io 無料**を使い ¥0 |
| **AWS Lambda + Function URL** | 月 **¥0〜¥50** / 日 **¥0〜¥2** | 月 **¥0〜¥50** / 日 **¥0〜¥2** | 計算 ¥0（無料枠内）+ Function URL ¥0 + DynamoDB 個人利用は無料枠内 ≒¥0 |
| **Azure App Service F1** | 月 **¥0** / 日 **¥0** | （60 CPU分/日 上限に注意） | 完全無料。SQLite は `/home` 永続でそのまま動作 |

### 参考: もし無料枠が無かった場合の素のコスト（Container Apps, シナリオB）
- vCPU: 112,500 vCPU-秒 × $0.000024 ＝ $2.70
- メモリ: 225,000 GiB-秒 × $0.000003 ＝ $0.68
- 合計 ≈ **$3.4/月 ≈ ¥550/月**（＝従量単価の実力値。実際は無料枠で相殺され ¥0）

---

## 4. コスト上の落とし穴（重要）

| 落とし穴 | 内容 | 回避策 |
|---|---|---|
| **AWS Lambda + EFS + NAT** | SQLite 永続化に EFS を使うと Lambda を VPC 内に置く必要 → OpenRouter(外部)へ出るのに **NAT Gateway ≈ ¥5,000/月** が発生し最安でなくなる | EFS を使わず、DynamoDB / Turso(libSQL) など**外部到達可能なサーバレス DB**にする |
| **コンテナレジストリ課金** | Azure Container Registry Basic ≈ ¥800/月、Amazon ECR も従量 | **ghcr.io / Docker Hub の無料枠**から pull すれば ¥0 |
| **常時起動プラン選択** | App Service B1 や App Runner は idle でも課金（¥550〜¥2,000/月） | 「コールドスタート可」要件を活かし**スケールゼロ系**を選ぶ |
| **SQLite over SMB** | Azure Files(SMB) 上で WAL を使うとロック破損リスク | NFS マウント or `journal_mode=DELETE`＋**単一レプリカ固定**、または libSQL 化 |
| **本当のコストは LLM** | ホスティングがほぼ ¥0 なので、総額は **OpenRouter のトークン課金が支配的**（例: DeepSeek V4 Flash $0.09/$0.18 per 1M tok） | モデル選択とコンテキスト長で最適化（ホスティング設計の範囲外） |

---

## 5. 推奨アクションプラン

### プラン①（最小手間・完全無料）: Azure App Service Linux F1
1. `next build` の standalone 出力を App Service にデプロイ（GitHub Actions 連携）
2. SQLite の `DB_DIR` を `/home/data` に変更（`/home` は永続）
3. `OPENROUTER_API_KEY` をアプリ設定に登録
- **月額 ¥0**。制約（60 CPU分/日・SLA無し・コールドスタート）が許容できるならこれが最安。

### プラン②（本命・スケールゼロで堅牢）: Azure Container Apps
1. 既存 Docker 化（standalone Next.js）→ ghcr.io に push（無料）
2. Container App を `min-replicas=0` で作成（スケールゼロ）
3. DB は **(a) Azure Files(NFS) マウントで SQLite 継続**、または **(b) libSQL/Turso へ移行**（推奨・スケールゼロと相性良）
- **月額 ¥0〜¥50**。Docker 資産を活かしつつ完全スケールゼロ。

### プラン③（AWS で揃えたい場合）: Lambda + Function URL + DynamoDB/Turso
1. `@opennextjs/aws`（OpenNext）または Lambda Web Adapter で Next.js を Lambda 化
2. **Function URL + INVOKE_MODE=RESPONSE_STREAM** でストリーミング配信（API Gateway 不要 = ¥0）
3. `lib/db-*.ts` を DynamoDB か Turso(libSQL) に移行（**EFS/NAT は使わない**）
- **月額 ¥0〜¥50**。データ層の改修コストはあるが完全サーバレス。

---

## 6. 最終推奨

- **とにかく ¥0 で最小手間** → **Azure App Service F1**（SQLite そのまま、改修ほぼ無し）
- **¥0〜数十円で堅牢・将来拡張も見据える** → **Azure Container Apps（スケールゼロ）+ libSQL** ← 総合本命
- いずれにせよ**ホスティング費は誤差**で、運用コストの実体は **OpenRouter のトークン課金**である点が最重要。

> 出典:
> - AWS Lambda Pricing: <https://aws.amazon.com/lambda/pricing/>
> - Azure Container Apps Pricing: <https://azure.microsoft.com/en-us/pricing/details/container-apps/>
> - Azure App Service (Linux) Pricing: <https://azure.microsoft.com/en-us/pricing/details/app-service/linux/>
> - 為替(USD/JPY, 2026-06-23): macrotrends / BOJ 参照
