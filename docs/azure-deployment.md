# Azure Container Apps デプロイガイド

Azure Container Apps（Consumption プラン / スケールゼロ）+ Turso（libSQL）の構成で、**月額 ¥0**（無料枠内）でホスティングできます。

## 前提条件

- Azure アカウント（[無料で作成](https://azure.microsoft.com/ja-jp/free/)）
- [Turso](https://turso.tech/) アカウント（無料プラン: 5GB / 500M reads / 10M writes）
- GitHub リポジトリ（GHCR でコンテナイメージをホスト）

## 1. Turso データベースの作成

```bash
# Turso CLI インストール
curl -sSfL https://get.tur.so/install.sh | bash

# ログイン
turso auth login

# データベース作成（東京リージョン推奨）
turso db create character-chat-lab --location nrt

# 接続 URL を取得
turso db show character-chat-lab --url
# → libsql://character-chat-lab-xxxxx.turso.io

# 認証トークンを取得
turso db tokens create character-chat-lab
# → eyJhbGci...（この値を控えておく）
```

## 2. Azure リソースの作成

Azure Portal または CLI で以下を作成します。

```bash
# リソースグループ
az group create --name rg-character-chat-lab --location japaneast

# Container Apps 環境
az containerapp env create \
  --name cae-character-chat-lab \
  --resource-group rg-character-chat-lab \
  --location japaneast

# Container App（初回は仮イメージで作成）
az containerapp create \
  --name character-chat-lab \
  --resource-group rg-character-chat-lab \
  --environment cae-character-chat-lab \
  --image mcr.microsoft.com/k8se/quickstart:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 1 \
  --cpu 0.25 \
  --memory 0.5Gi \
  --env-vars \
    OPENROUTER_API_KEY=secretref:openrouter-api-key \
    LIBSQL_URL=secretref:libsql-url \
    LIBSQL_AUTH_TOKEN=secretref:libsql-auth-token
```

### シークレットの登録

```bash
az containerapp secret set \
  --name character-chat-lab \
  --resource-group rg-character-chat-lab \
  --secrets \
    openrouter-api-key="your-openrouter-api-key" \
    libsql-url="libsql://character-chat-lab-xxxxx.turso.io" \
    libsql-auth-token="your-turso-auth-token"
```

## 3. GHCR アクセス設定（Public リポジトリの場合）

Public リポジトリなら GHCR のイメージも公開されるので、Container Apps から追加認証なしで pull できます。

Private リポジトリの場合は、Container App にレジストリ認証を設定してください:

```bash
az containerapp registry set \
  --name character-chat-lab \
  --resource-group rg-character-chat-lab \
  --server ghcr.io \
  --username YOUR_GITHUB_USERNAME \
  --password YOUR_GITHUB_PAT
```

## 4. GitHub Actions の設定

### 必要な Secrets（リポジトリ Settings → Secrets and variables → Actions）

| Secret 名 | 内容 |
|---|---|
| `AZURE_CREDENTIALS` | サービスプリンシパルの JSON（下記で作成） |

### 必要な Variables（同画面の Variables タブ）

| Variable 名 | 値の例 |
|---|---|
| `CONTAINER_APP_NAME` | `character-chat-lab` |
| `AZURE_RESOURCE_GROUP` | `rg-character-chat-lab` |

### サービスプリンシパルの作成

```bash
az ad sp create-for-rbac \
  --name "github-actions-character-chat-lab" \
  --role contributor \
  --scopes /subscriptions/{subscription-id}/resourceGroups/rg-character-chat-lab \
  --json-auth
```

出力される JSON 全体を `AZURE_CREDENTIALS` シークレットに登録します。

## 5. デプロイの実行

`main` ブランチに push すると GitHub Actions が自動で:
1. Docker イメージをビルド
2. GHCR に push
3. Container App のイメージを更新

手動デプロイは Actions タブから `workflow_dispatch` で実行可能です。

## スケール設定

```bash
# スケールゼロ（デフォルト）: リクエストが無いときはレプリカ 0
az containerapp update \
  --name character-chat-lab \
  --resource-group rg-character-chat-lab \
  --min-replicas 0 \
  --max-replicas 1 \
  --scale-rule-name http-rule \
  --scale-rule-type http \
  --scale-rule-http-concurrency 10
```

## コスト目安

| 項目 | 月額 | 備考 |
|---|---|---|
| Container Apps | ¥0 | 無料枠: 180K vCPU-sec + 360K GiB-sec + 2M req |
| Turso Free | ¥0 | 5GB / 500M reads / 10M writes |
| GHCR | ¥0 | Public repo は無料 |
| **合計** | **¥0** | 個人利用は無料枠内に収まる |

超過時: コンテナ1チャットあたり約 ¥0.04。Turso Developer は $4.99/月。

## トラブルシューティング

### コールドスタートが遅い
スケールゼロからの起動は 5-15 秒かかります。許容できない場合は `--min-replicas 1` にしてください（月額約 ¥1,500 のアイドル課金が発生）。

### コンテナログの確認
```bash
az containerapp logs show \
  --name character-chat-lab \
  --resource-group rg-character-chat-lab \
  --follow
```
