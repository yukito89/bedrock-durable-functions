# コードリーディング Part 2: function_app.py 完全解説

## ファイル構成

```python
function_app.py (約800行)
├── インポート
├── 進捗管理の仕組み（グローバル変数とコールバック）
├── アプリケーション初期化
├── Blob Storage操作用ヘルパー関数
├── HTTP Starters（2つ）
│   ├── upload_starter（通常モード）
│   └── upload_diff_starter（差分モード）
├── Orchestrator関数
├── Activity関数
└── ユーティリティエンドポイント（4つ）
    ├── get_status（進捗確認）
    ├── list_results（処理履歴一覧）
    ├── download_result（結果ダウンロード）
    └── delete_result（結果削除）
```

---

## 1. インポートセクション

```python
import azure.functions as func  # Azure Functions基本ライブラリ
import azure.durable_functions as df  # Durable Functions（長時間処理・非同期処理用）
import logging  # ログ出力
import json  # JSON操作
import os  # 環境変数取得
from urllib.parse import quote  # URLエンコード（ファイル名用）
from azure.storage.blob import BlobServiceClient  # Azure Blob Storage操作
from azure.core.exceptions import ResourceExistsError  # コンテナ重複エラー

from core import normal_mode, diff_mode  # ビジネスロジック層
```

**ポイント**:
- `azure.durable_functions`がDurable Functionsの核心
- `core`モジュールに実際のビジネスロジックを分離

---

## 2. 進捗管理の仕組み

### 課題
Orchestrator関数内では外部リソース（Blob Storage）への直接アクセスが禁止されています。

### 解決策: グローバル変数とコールバック関数

```python
_progress_callback = None  # 進捗更新用のコールバック関数（Activity内で設定）

def set_progress_callback(callback):
    """Activity関数内で進捗更新用のコールバック関数を設定"""
    global _progress_callback
    _progress_callback = callback

class DurableProgressManager:
    """Durable Functions用のProgressManager
    
    coreモジュールのProgressManagerを置き換えて、
    Activity関数内で設定されたコールバック関数経由で進捗更新を行う。
    """
    def update_progress(self, job_id, stage, message, progress):
        """進捗を更新（コールバック関数経由）"""
        if _progress_callback:
            _progress_callback(stage, message, progress)
```

**動作の流れ**:
1. Activity関数内で`update_progress_direct`関数を定義
2. `set_progress_callback(update_progress_direct)`でグローバル変数に設定
3. coreモジュールの`ProgressManager`を`DurableProgressManager`に置き換え
4. coreモジュールが`update_progress`を呼び出すと、コールバック経由でBlob Storageに保存

---

## 3. Blob Storage操作用ヘルパー関数

### get_blob_service_client()

```python
def get_blob_service_client():
    """Azure Blob Storage Clientを取得"""
    connection_string = os.environ.get("AZURE_STORAGE_CONNECTION_STRING")
    if not connection_string:
        raise ValueError("AZURE_STORAGE_CONNECTION_STRING が設定されていません")
    return BlobServiceClient.from_connection_string(connection_string)
```

**役割**: 環境変数から接続文字列を取得し、BlobServiceClientを初期化

### ensure_container_exists()

```python
def ensure_container_exists(container_name: str):
    """Blobコンテナが存在しない場合は作成"""
    try:
        blob_service_client = get_blob_service_client()
        blob_service_client.create_container(container_name)
        logging.info(f"コンテナ作成: {container_name}")
    except ResourceExistsError:
        # コンテナが既に存在する場合（正常系）
        logging.info(f"コンテナ既存: {container_name}")
    except Exception as e:
        # その他のエラー（権限不足など）
        logging.error(f"コンテナ作成エラー: {e}")
```

**役割**: コンテナの存在確認と自動作成（冪等性を保証）

---

## 4. Starter関数: upload_starter（通常モード）

### デコレータ

```python
@app.route(route="upload", methods=["POST", "OPTIONS"])
@app.durable_client_input(client_name="client")  # Durable Functionsクライアントを注入
async def upload_starter(req: func.HttpRequest, client) -> func.HttpResponse:
```

**ポイント**:
- `@app.route`: HTTPエンドポイントを定義
- `@app.durable_client_input`: Durable Functionsクライアントを自動注入
- `async def`: 非同期関数（await可能）

### 処理フロー

```python
# 1. CORS preflight対応
if req.method == "OPTIONS":
    return func.HttpResponse(status_code=200, headers=CORS_HEADERS)

# 2. リクエストデータの取得
files = req.files.getlist("documentFiles")  # 複数ファイル対応
granularity = req.form.get("granularity", "simple")

# 3. Orchestratorを起動してinstance_idを取得
instance_id = await client.start_new("orchestrator")

# 4. ファイルをBlobに保存（instance_idを使用）
for idx, file in enumerate(files):
    blob_name = f"{instance_id}/input/file_{idx}_{file.filename}"
    blob_client = blob_service_client.get_blob_client(container="temp-uploads", blob=blob_name)
    blob_client.upload_blob(file.stream.read(), overwrite=True)
    file_refs.append({
        "filename": file.filename,
        "blob_name": blob_name,
        "container": "temp-uploads"
    })

# 5. Orchestratorにデータを送信
input_data = {
    "mode": "normal",
    "files": file_refs,
    "granularity": granularity,
    "instance_id": instance_id
}
await client.raise_event(instance_id, "start_processing", input_data)

# 6. レスポンスを即座に返却（3~5秒）
response = client.create_check_status_response(req, instance_id)
response.headers.update(CORS_HEADERS)
return response
```

### 重要ポイント

**instance_idの役割**:
- Durable Functionsが自動生成する一意のID
- Blobパスに使用（`{instance_id}/input/file_0_xxx.xlsx`）
- 進捗確認・結果ダウンロードに使用

**raise_eventの役割**:
- Orchestratorにデータを送信（イベント名: `start_processing`）
- Orchestratorは`wait_for_external_event`で受信

**create_check_status_responseの役割**:
- 以下のURLを含むレスポンスを生成:
  - `statusQueryGetUri`: 進捗確認用URL
  - `sendEventPostUri`: イベント送信用URL
  - `terminatePostUri`: 処理中断用URL

---

## 5. Starter関数: upload_diff_starter（差分モード）

### 通常モードとの違い

```python
# 新版設計書（Excel）
new_excel_files = req.files.getlist("newExcelFiles")

# 旧版成果物（Markdown）
old_structured_md = req.files.get("oldStructuredMd")
old_test_spec_md = req.files.get("oldTestSpecMd")

# 旧版ファイルもBlobに保存
old_md_blob = f"{instance_id}/input/old_structured.md"
blob_client = blob_service_client.get_blob_client(container="temp-uploads", blob=old_md_blob)
blob_client.upload_blob(old_structured_md.stream.read(), overwrite=True)

old_spec_blob = f"{instance_id}/input/old_test_spec.md"
blob_client = blob_service_client.get_blob_client(container="temp-uploads", blob=old_spec_blob)
blob_client.upload_blob(old_test_spec_md.stream.read(), overwrite=True)

# Orchestratorに送信するデータ
input_data = {
    "mode": "diff",
    "files": file_refs,
    "old_structured_md_blob": old_md_blob,
    "old_test_spec_md_blob": old_spec_blob,
    "granularity": granularity,
    "instance_id": instance_id
}
```

---

## 6. Orchestrator関数

### デコレータ

```python
@app.orchestration_trigger(context_name="context")
def orchestrator(context: df.DurableOrchestrationContext):
```

**ポイント**: `@app.orchestration_trigger`でOrchestrator関数として登録

### 処理フロー

```python
# 1. Starter関数からのイベントを待機
if not context.is_replaying:
    logging.info(f"Orchestrator waiting for event: {context.instance_id}")

input_data = yield context.wait_for_external_event("start_processing")

# 2. 初期進捗ステータスを設定
context.set_custom_status({
    "stage": "structuring",
    "progress": 10,
    "message": "設計書を構造化中..."
})

# 3. Activity関数を呼び出し
result = yield context.call_activity("process_test_generation", input_data)

# 4. 完了ステータスを設定
context.set_custom_status({
    "stage": "completed",
    "progress": 100,
    "message": "完了しました"
})

# 5. 結果を返却
return result
```

### リプレイ機構

```python
if not context.is_replaying:
    logging.info(f"Orchestrator waiting for event: {context.instance_id}")
```

**リプレイとは**:
- Durable Functionsは、障害発生時に処理を再開するため、Orchestrator関数を最初から再実行（リプレイ）する
- `is_replaying`フラグで、リプレイ中かどうかを判定
- リプレイ中は不要なログを出力しない

### 決定論的制約

Orchestrator関数は**決定論的**である必要があります:
- ❌ 現在時刻の取得（`datetime.now()`）
- ❌ 乱数生成（`random.random()`）
- ❌ 外部リソースへのアクセス（Blob Storage、HTTP通信）
- ✅ `yield context.call_activity()`でActivity関数に処理を委譲

---

## 7. Activity関数: process_test_generation

### デコレータ

```python
@app.activity_trigger(input_name="inputData")
def process_test_generation(inputData) -> dict:
```

**ポイント**: `@app.activity_trigger`でActivity関数として登録

### 処理フロー（通常モード）

```python
# 1. 入力データの解析
if isinstance(inputData, str):
    inputData = json.loads(inputData)

mode = inputData["mode"]
granularity = inputData["granularity"]
instance_id = inputData["instance_id"]

# 2. 進捗更新用のヘルパー関数を定義
def update_progress_direct(stage, message, progress):
    blob_service_client = get_blob_service_client()
    ensure_container_exists("progress")
    blob_client = blob_service_client.get_blob_client("progress", f"{instance_id}.json")
    data = {
        "stage": stage,
        "message": message,
        "progress": progress,
        "timestamp": datetime.utcnow().isoformat()
    }
    blob_client.upload_blob(json.dumps(data, ensure_ascii=False), overwrite=True)

# 3. coreモジュールにコールバック関数を設定
set_progress_callback(update_progress_direct)

# 4. ファイルラッパークラスの定義
class FileWrapper:
    def __init__(self, filename, content):
        self.filename = filename
        self.stream = io.BytesIO(content)
    
    def read(self):
        self.stream.seek(0)
        return self.stream.read()

# 5. Blob Storageからファイルを取得
files = []
for file_ref in inputData["files"]:
    blob_client = blob_service_client.get_blob_client(
        container=file_ref["container"],
        blob=file_ref["blob_name"]
    )
    content = blob_client.download_blob().readall()
    files.append(FileWrapper(file_ref["filename"], content))

# 6. coreモジュールを呼び出してテスト仕様書を生成
zip_bytes = normal_mode.generate_normal_test_spec(files, granularity, instance_id)
filename = "テスト仕様書.zip"

# 7. 生成結果をBlob Storageに保存
ensure_container_exists("results")
blob_name = f"{instance_id}/{filename}"
blob_client = blob_service_client.get_blob_client(container="results", blob=blob_name)
blob_client.upload_blob(zip_bytes, overwrite=True)

# 8. Orchestratorに結果を返却
return {
    "blob_name": blob_name,
    "filename": filename,
    "container": "results"
}
```

### FileWrapperクラスの役割

```python
class FileWrapper:
    def __init__(self, filename, content):
        self.filename = filename  # 元のファイル名
        self.stream = io.BytesIO(content)  # バイナリデータをストリームに変換
    
    def read(self):
        self.stream.seek(0)  # ストリームの先頭に戻す
        return self.stream.read()
```

**なぜ必要か**:
- Blob Storageから取得したデータはバイナリ（bytes）
- coreモジュールは、HTTPリクエストから受け取ったファイルオブジェクトを想定
- 同じインターフェース（`filename`, `stream`, `read`）を提供するためのアダプター

---

## 8. ユーティリティエンドポイント

### get_status（進捗確認）

```python
@app.route(route="status/{instanceId}", methods=["GET", "OPTIONS"])
@app.durable_client_input(client_name="client")
async def get_status(req: func.HttpRequest, client) -> func.HttpResponse:
    instance_id = req.route_params.get("instanceId")
    
    # Orchestratorのステータスを取得
    status = await client.get_status(instance_id)
    
    # Blob Storageから詳細な進捗情報を取得
    try:
        blob_client = blob_service_client.get_blob_client("progress", f"{instance_id}.json")
        progress_data = blob_client.download_blob().readall()
        custom_status = json.loads(progress_data)
    except:
        custom_status = status.custom_status
    
    response_data = {
        "instanceId": instance_id,
        "runtimeStatus": status.runtime_status.name,  # Running, Completed, Failed等
        "customStatus": custom_status,
        "createdTime": status.created_time.isoformat(),
        "lastUpdatedTime": status.last_updated_time.isoformat()
    }
    
    if status.runtime_status == df.OrchestrationRuntimeStatus.Completed:
        response_data["output"] = status.output
    
    return func.HttpResponse(json.dumps(response_data, ensure_ascii=False), ...)
```

**ポイント**:
- Orchestratorの`set_custom_status`は粗い粒度
- Activity関数がBlob Storageに保存した詳細情報を優先的に使用

### download_result（結果ダウンロード）

```python
@app.route(route="download/{instanceId}", methods=["GET", "OPTIONS"])
async def download_result(req: func.HttpRequest) -> func.HttpResponse:
    instance_id = req.route_params.get("instanceId")
    
    # Blob Storageからファイルを検索
    blob_service_client = get_blob_service_client()
    container_client = blob_service_client.get_container_client("results")
    blobs = list(container_client.list_blobs(name_starts_with=f"{instance_id}/"))
    
    if not blobs:
        return func.HttpResponse("ファイルが見つかりません", status_code=404, ...)
    
    # ZIPファイルをダウンロード
    blob_name = blobs[0].name
    blob_client = blob_service_client.get_blob_client(container="results", blob=blob_name)
    zip_bytes = blob_client.download_blob().readall()
    
    # ファイル名を抽出してエンコード
    filename = blob_name.split("/")[-1]
    encoded_filename = quote(filename)
    
    # レスポンスヘッダーを設定
    headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
        "Content-Type": "application/zip",
        **CORS_HEADERS
    }
    
    return func.HttpResponse(zip_bytes, status_code=200, headers=headers)
```

**ポイント**:
- `filename*=UTF-8''`: RFC 5987形式（日本語ファイル名対応）
- `quote()`: URLエンコード

---

## まとめ

### function_app.pyの責務
1. **HTTPリクエストの受付**（Starter関数）
2. **処理の非同期化**（Orchestrator関数）
3. **ビジネスロジックの呼び出し**（Activity関数）
4. **進捗管理とファイル配信**（ユーティリティエンドポイント）

### 次のパート
- Part 3: coreモジュール詳細解説（ビジネスロジック層）
