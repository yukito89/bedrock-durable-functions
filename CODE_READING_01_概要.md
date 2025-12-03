# コードリーディング Part 1: プロジェクト概要とアーキテクチャ

## プロジェクト全体像

このプロジェクトは、**Excel形式の設計書から単体テスト仕様書を自動生成する**Webアプリケーションです。

### 技術スタック
- **バックエンド**: Azure Durable Functions (Python 3.11)
- **LLM**: Azure AI Foundry経由でClaude Sonnet 4.5を使用
- **ストレージ**: Azure Blob Storage（ファイル保存・進捗管理）
- **フロントエンド**: 静的HTML/JavaScript (Azure Static Web Apps)

---

## アーキテクチャの核心: なぜDurable Functionsなのか？

### 解決すべき課題
Azure Functionsには**HTTP応答230秒制限**があります。しかし、テスト仕様書生成には以下の時間がかかります：

```
Excel解析: 10秒
LLM呼び出し（構造化）: 30秒
LLM呼び出し（テスト観点）: 30秒
LLM呼び出し（テスト仕様書）: 60秒
Excel/CSV変換: 5秒
合計: 約135秒
```

通常のAzure Functionsでは、この処理中にHTTP接続がタイムアウトしてしまいます。

### Durable Functionsによる解決策

Durable Functionsは**非同期アーキテクチャ**を採用し、以下の3つの関数タイプで処理を分離します：

```
┌─────────────┐  3~5秒で即座に応答  ┌──────────────┐
│   Starter   │ ──────────────────▶ │   クライアント │
│   関数      │  instanceIdを返却   │              │
└─────────────┘                     └──────────────┘
      │                                     │
      │ イベント送信                         │ 10秒ポーリング
      ▼                                     ▼
┌─────────────┐                     ┌──────────────┐
│Orchestrator │                     │ /api/status  │
│   関数      │ ◀───────────────────│  エンドポイント│
└─────────────┘  進捗状況を取得      └──────────────┘
      │
      │ 呼び出し
      ▼
┌─────────────┐
│  Activity   │  無制限に実行可能
│   関数      │  (5分でも10分でもOK)
└─────────────┘
```

---

## 3つの関数タイプの役割

### 1. Starter関数（HTTP応答3~5秒）
**役割**: HTTPリクエストを受け付け、即座にジョブIDを返却

**処理内容**:
1. アップロードされたファイルをBlob Storageに保存
2. Orchestrator関数を起動してinstance_idを取得
3. instance_idをクライアントに返却（HTTP応答完了）

**重要**: この時点でHTTP接続は切断されるため、230秒制限の影響を受けません。

### 2. Orchestrator関数（バックグラウンド実行）
**役割**: 処理全体の流れを管理

**処理内容**:
1. Starter関数からのイベント（start_processing）を待機
2. 進捗ステータスを設定（set_custom_status）
3. Activity関数を呼び出し
4. 完了ステータスを設定

**制約**: 
- **決定論的**である必要がある（同じ入力で同じ結果）
- 外部リソース（Blob Storage、HTTP通信）への直接アクセスは禁止
- リプレイ機構により、障害発生時も処理を継続可能

### 3. Activity関数（無制限実行）
**役割**: 実際のビジネスロジックを実行

**処理内容**:
1. Blob Storageからファイルを取得
2. coreモジュールを呼び出してテスト仕様書を生成
3. 生成結果をBlob Storageに保存
4. Blob参照情報を返却

**利点**: 
- 実行時間に制限なし（5分でも10分でもOK）
- 外部リソースへのアクセスが可能

---

## データフロー全体図

```
[クライアント]
    │
    │ 1. POST /api/upload (Excelファイル)
    ▼
[Starter関数]
    │ ① ファイルをBlobに保存
    │ ② Orchestratorを起動
    │ ③ instanceIdを即座に返却（3~5秒）
    │
    ├──────────────────────────────┐
    │                              │
    ▼                              ▼
[Orchestrator関数]          [クライアント]
    │ ① イベント待機                │ 10秒ポーリング
    │ ② 進捗設定                    │
    │ ③ Activity呼び出し            ▼
    │                        [GET /api/status/{id}]
    ▼                              │
[Activity関数]                     │ 進捗情報取得
    │ ① Blobからファイル取得        │
    │ ② Excel解析                   │
    │ ③ LLM呼び出し（構造化）       │
    │ ④ LLM呼び出し（テスト観点）   │
    │ ⑤ LLM呼び出し（テスト仕様書） │
    │ ⑥ Excel/CSV変換               │
    │ ⑦ ZIPファイル作成             │
    │ ⑧ Blobに結果保存              │
    │                              │
    └──────────────────────────────┘
                │
                ▼ 完了後
        [GET /api/download/{id}]
                │
                ▼
        [ZIPファイルダウンロード]
```

---

## Blob Storageコンテナ構成

| コンテナ名 | 用途 | ライフサイクル |
|-----------|------|---------------|
| `temp-uploads` | アップロードされたファイルの一時保存 | 手動削除推奨 |
| `results` | 生成されたZIPファイル | 1日後に自動削除（推奨） |
| `progress` | 進捗情報（JSON） | 自動上書き |
| `azure-webjobs-hosts` | Durable Functions制御情報 | 自動管理 |

---

## 進捗管理の仕組み

### 課題
Orchestrator関数内では、Blob Storageへの直接アクセスが禁止されています。

### 解決策
Activity関数内で進捗情報をBlob Storageに保存し、クライアントがポーリングで取得します。

```python
# Activity関数内で定義
def update_progress_direct(stage, message, progress):
    blob_client = blob_service_client.get_blob_client("progress", f"{instance_id}.json")
    data = {
        "stage": stage,
        "message": message,
        "progress": progress,
        "timestamp": datetime.utcnow().isoformat()
    }
    blob_client.upload_blob(json.dumps(data), overwrite=True)

# coreモジュールにコールバック関数を設定
set_progress_callback(update_progress_direct)
```

### 進捗ステージ

| ステージ | 進捗率 | 表示メッセージ |
|---------|--------|---------------|
| structuring | 10-40% | 📄 設計書を構造化中... |
| diff | 30% | 🔍 差分を検知中... (差分モードのみ) |
| perspectives | 40-50% | 💡 テスト観点を抽出中... |
| testspec | 70% | 📝 テスト仕様書を生成中... |
| converting | 90% | 🔄 成果物を変換中... |
| completed | 100% | ✅ 完了しました |

---

## 処理モード

### 通常モード
設計書（Excel）からテスト仕様書を新規生成

**入力**: 
- 設計書（.xlsx）

**出力**: 
- 構造化設計書.md
- テスト観点.md
- テスト仕様書.md
- テスト仕様書.xlsx
- テスト仕様書.csv

### 差分モード
新旧設計書を比較して、テスト仕様書の差分版を生成

**入力**: 
- 新版設計書（.xlsx）
- 旧版構造化設計書（.md）
- 旧版テスト仕様書（.md）

**出力**: 
- 新版_構造化設計書.md
- 差分サマリー.md
- テスト観点.md
- テスト仕様書.md（変更種別列付き）
- テスト仕様書.xlsx
- テスト仕様書.csv

---

## 次のパート

- Part 2: function_app.py詳細解説
- Part 3: coreモジュール詳細解説
- Part 4: フロントエンド詳細解説
