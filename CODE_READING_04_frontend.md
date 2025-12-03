# コードリーディング Part 4: フロントエンド完全解説

## フロントエンド構成

```
frontend/
├── index.html       # メインページ（ファイルアップロード）
├── history.html     # 処理履歴ページ
├── script.js        # メインページのロジック
├── history.js       # 履歴ページのロジック
├── auth.js          # 認証処理（将来の拡張用）
└── style.css        # 共通スタイル
```

---

## 1. index.html: メインページ

### HTML構造

```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8" />
    <title>設計書アップロード</title>
    <link rel="stylesheet" href="style.css" />
    <script src="auth.js"></script>
</head>
<body>
    <div class="container" id="mainContent">
        <h1>単体テスト仕様書生成<br/>（Claude Sonnet 4.5）</h1>
        
        <!-- 処理履歴へのリンク -->
        <div style="text-align: right;">
            <a href="history.html" id="historyLink">📋 処理履歴を見る</a>
        </div>

        <!-- モード選択 -->
        <div class="mode-selection">
            <label>生成モード：</label>
            <div class="radio-group-horizontal">
                <label class="radio-label-inline">
                    <input type="radio" name="mode" value="normal" checked />
                    <span>通常版</span>
                </label>
                <label class="radio-label-inline">
                    <input type="radio" name="mode" value="diff" />
                    <span>差分版</span>
                </label>
            </div>
        </div>

        <!-- 通常版ファイル入力 -->
        <div id="normalMode" class="mode-content">
            <div class="file-inputs">
                <label>詳細設計書（Excel形式）：</label>
                <input type="file" id="fileInput" accept=".xlsx" multiple />
            </div>
        </div>

        <!-- 差分版ファイル入力 -->
        <div id="diffMode" class="mode-content" style="display:none;">
            <div class="file-section old-version">
                <h2>📁 旧版ファイル（必須）</h2>
                <div class="file-inputs">
                    <label>旧版 構造化設計書（.md）：</label>
                    <input type="file" id="oldStructuredMd" accept=".md" required />
                </div>
                <div class="file-inputs">
                    <label>旧版 テスト仕様書（.md）：</label>
                    <input type="file" id="oldTestSpecMd" accept=".md" required />
                </div>
            </div>
            <div class="file-section new-version">
                <h2>📄 新版ファイル（必須）</h2>
                <div class="file-inputs">
                    <label>新版 設計書（.xlsx）：</label>
                    <input type="file" id="newExcelFiles" accept=".xlsx" multiple required />
                </div>
            </div>
        </div>

        <!-- 粒度選択 -->
        <div class="granularity-selection">
            <label>テスト仕様書の粒度：</label>
            <div class="radio-group">
                <label class="radio-label">
                    <input type="radio" name="granularity" value="simple" checked />
                    <span>簡易版</span>
                    <small>テストケースと期待結果を簡潔に記載</small>
                </label>
                <label class="radio-label">
                    <input type="radio" name="granularity" value="detailed" />
                    <span>詳細版</span>
                    <small>前提条件・事前データ・操作手順を詳細に記載</small>
                </label>
            </div>
        </div>

        <button id="uploadBtn">アップロードして生成</button>

        <!-- 進捗バー -->
        <div id="progressContainer" class="progress-container" style="display:none;">
            <div class="progress-bar-wrapper">
                <div id="progressBar" class="progress-bar"></div>
            </div>
            <p id="progressText" class="progress-text">処理中...</p>
        </div>

        <p id="status"></p>
    </div>
    
    <script src="script.js?v=13"></script>
</body>
</html>
```

**ポイント**:
- モード切り替え（通常版/差分版）
- 粒度選択（簡易版/詳細版）
- 進捗バー表示エリア
- `script.js?v=13`: キャッシュバスティング

---

## 2. script.js: メインページのロジック

### 環境設定

```javascript
const API_BASE_URL = 'https://poc-func.azurewebsites.net/api'; // 本番環境用
// const API_BASE_URL = 'http://localhost:7071/api'; // ローカル開発用
```

**ポイント**: コメントアウトで環境を切り替え

### DOM要素の取得

```javascript
const status = document.querySelector("#status");
const uploadBtn = document.querySelector("#uploadBtn");
const progressBar = document.querySelector("#progressBar");
const progressText = document.querySelector("#progressText");
const progressContainer = document.querySelector("#progressContainer");
const historyLink = document.querySelector("#historyLink");

let pollingInterval = null;
let currentJobId = null;
```

### モード切り替え

```javascript
const modeRadios = document.querySelectorAll('input[name="mode"]');
const normalMode = document.querySelector("#normalMode");
const diffMode = document.querySelector("#diffMode");

modeRadios.forEach(radio => {
    radio.addEventListener("change", () => {
        if (radio.value === "normal") {
            normalMode.style.display = "block";
            diffMode.style.display = "none";
        } else {
            normalMode.style.display = "none";
            diffMode.style.display = "block";
        }
    });
});
```

**ポイント**: ラジオボタンの変更イベントで表示を切り替え

### アップロードボタンのクリックイベント

```javascript
uploadBtn.addEventListener("click", async () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const granularity = document.querySelector('input[name="granularity"]:checked').value;
    
    const formData = new FormData();
    
    // 通常モード：設計書のみ
    if (mode === "normal") {
        const files = document.querySelector("#fileInput").files;
        if (files.length === 0) {
            status.textContent = "詳細設計書を選択してください";
            return;
        }
        for (let i = 0; i < files.length; i++) {
            formData.append("documentFiles", files[i]);
        }
    } 
    // 差分モード：新版設計書 + 旧版MD2つ
    else {
        const newExcelFiles = document.querySelector("#newExcelFiles").files;
        const oldStructuredMd = document.querySelector("#oldStructuredMd").files;
        const oldTestSpecMd = document.querySelector("#oldTestSpecMd").files;
        
        // バリデーション
        if (newExcelFiles.length === 0) {
            status.textContent = "新版の設計書を選択してください";
            return;
        }
        if (oldStructuredMd.length === 0) {
            status.textContent = "旧版の構造化設計書を選択してください";
            return;
        }
        if (oldTestSpecMd.length === 0) {
            status.textContent = "旧版のテスト仕様書を選択してください";
            return;
        }
        
        for (let i = 0; i < newExcelFiles.length; i++) {
            formData.append("newExcelFiles", newExcelFiles[i]);
        }
        formData.append("oldStructuredMd", oldStructuredMd[0]);
        formData.append("oldTestSpecMd", oldTestSpecMd[0]);
    }
    
    formData.append("granularity", granularity);

    // UI状態を更新
    uploadBtn.disabled = true;
    historyLink.style.pointerEvents = "none";
    historyLink.style.opacity = "0.5";
    status.textContent = mode === "diff" ? "生成中...（差分検知を含むため時間がかかる場合があります）" : "生成中...";
    progressContainer.style.display = "block";
    progressBar.style.width = "0%";
    progressText.textContent = "処理を開始しています...";

    // エンドポイント選択
    const endpoint = mode === "normal" 
        ? `${API_BASE_URL}/upload`
        : `${API_BASE_URL}/upload_diff`;

    try {
        // ジョブを開始（即座にinstanceIdを取得）
        const startRes = await fetch(endpoint, {
            method: "POST",
            body: formData,
        });
        
        if (!startRes.ok) {
            progressContainer.style.display = "none";
            const errorText = await startRes.text();
            status.textContent = `エラー: ${errorText}`;
            uploadBtn.disabled = false;
            historyLink.style.pointerEvents = "auto";
            historyLink.style.opacity = "1";
            return;
        }
        
        const startData = await startRes.json();
        const instanceId = startData.id; // Durable FunctionsのインスタンスID
        currentJobId = instanceId;
        console.log('ジョブ開始:', instanceId);
        
        // ポーリング開始
        startPolling(instanceId);
        
    } catch (err) {
        stopPolling();
        progressContainer.style.display = "none";
        status.textContent = `通信エラー: ${err.message}`;
        uploadBtn.disabled = false;
        historyLink.style.pointerEvents = "auto";
        historyLink.style.opacity = "1";
    }
});
```

**処理の流れ**:
1. モードと粒度を取得
2. FormDataにファイルを追加
3. UI状態を更新（ボタン無効化、進捗バー表示）
4. Starter関数にPOSTリクエスト
5. instance_idを取得
6. ポーリング開始

### ポーリング処理

```javascript
function startPolling(instanceId) {
    stopPolling();
    
    pollingInterval = setInterval(async () => {
        await pollStatus(instanceId);
    }, 10000); // 10秒間隔
    
    // 初回は即座に実行
    pollStatus(instanceId);
}

async function pollStatus(instanceId) {
    try {
        const statusEndpoint = `${API_BASE_URL}/status/${instanceId}`;
        const res = await fetch(statusEndpoint);
        
        if (!res.ok) {
            stopPolling();
            progressContainer.style.display = "none";
            status.textContent = `❌ サーバーエラー (${res.status})`;
            uploadBtn.disabled = false;
            historyLink.style.pointerEvents = "auto";
            historyLink.style.opacity = "1";
            return;
        }
        
        const data = await res.json();
        
        // 進捗更新
        if (data.customStatus) {
            updateProgress(data.customStatus);
        }
        
        // 完了時
        if (data.runtimeStatus === "Completed") {
            stopPolling();
            progressContainer.style.display = "none";
            status.innerHTML = '✅ 完了しました　<a href="history.html" style="color: #4CAF50;">📋 履歴ページでダウンロード</a>';
            uploadBtn.disabled = false;
            historyLink.style.pointerEvents = "auto";
            historyLink.style.opacity = "1";
        }
        
        // 失敗時
        if (data.runtimeStatus === "Failed") {
            stopPolling();
            progressContainer.style.display = "none";
            status.textContent = "❌ 処理に失敗しました";
            uploadBtn.disabled = false;
            historyLink.style.pointerEvents = "auto";
            historyLink.style.opacity = "1";
        }
        
    } catch (err) {
        console.error('ポーリングエラー:', err);
        stopPolling();
        progressContainer.style.display = "none";
        status.textContent = `❌ サーバーエラー: ${err.message}`;
        uploadBtn.disabled = false;
        historyLink.style.pointerEvents = "auto";
        historyLink.style.opacity = "1";
    }
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}
```

**ポイント**:
- 10秒間隔でポーリング
- 初回は即座に実行（`pollStatus(instanceId)`）
- `runtimeStatus`で完了・失敗を判定

### 進捗更新

```javascript
function updateProgress(data) {
    const { stage, message, progress } = data;
    
    progressBar.style.width = `${progress}%`;
    
    const stageMessages = {
        "structuring": "📄 設計書を構造化中...",
        "diff": "🔍 差分を検知中...",
        "perspectives": "💡 テスト観点を抽出中...",
        "testspec": "📝 テスト仕様書を生成中...",
        "converting": "🔄 成果物を変換中..."
    };
    
    const displayMessage = stageMessages[stage] || message;
    progressText.textContent = `${displayMessage} (${progress}%)`;
}
```

**ポイント**:
- ステージごとに絵文字付きメッセージを表示
- 進捗バーの幅を更新

---

## 3. history.html & history.js: 処理履歴ページ

### history.js: 処理履歴の取得と表示

```javascript
const API_BASE_URL = 'https://poc-func.azurewebsites.net/api';

async function loadHistory() {
    try {
        const res = await fetch(`${API_BASE_URL}/list-results`);
        if (!res.ok) {
            throw new Error(`サーバーエラー (${res.status})`);
        }
        
        const results = await res.json();
        const tbody = document.querySelector("#historyTable tbody");
        tbody.innerHTML = "";
        
        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">処理履歴がありません</td></tr>';
            return;
        }
        
        results.forEach(result => {
            const row = document.createElement("tr");
            
            // タイムスタンプ
            const timeCell = document.createElement("td");
            timeCell.textContent = new Date(result.timestamp).toLocaleString('ja-JP');
            row.appendChild(timeCell);
            
            // ファイル名
            const nameCell = document.createElement("td");
            nameCell.textContent = result.filename;
            row.appendChild(nameCell);
            
            // サイズ
            const sizeCell = document.createElement("td");
            sizeCell.textContent = `${(result.size / 1024).toFixed(2)} KB`;
            row.appendChild(sizeCell);
            
            // アクション
            const actionCell = document.createElement("td");
            
            // ダウンロードボタン
            const downloadBtn = document.createElement("button");
            downloadBtn.textContent = "ダウンロード";
            downloadBtn.className = "download-btn";
            downloadBtn.onclick = () => downloadResult(result.instanceId);
            actionCell.appendChild(downloadBtn);
            
            // 削除ボタン
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "削除";
            deleteBtn.className = "delete-btn";
            deleteBtn.onclick = () => deleteResult(result.instanceId);
            actionCell.appendChild(deleteBtn);
            
            row.appendChild(actionCell);
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error('履歴読み込みエラー:', err);
        document.querySelector("#status").textContent = `エラー: ${err.message}`;
    }
}

async function downloadResult(instanceId) {
    try {
        const url = `${API_BASE_URL}/download/${instanceId}`;
        window.location.href = url;
    } catch (err) {
        alert(`ダウンロードエラー: ${err.message}`);
    }
}

async function deleteResult(instanceId) {
    if (!confirm('この結果を削除しますか？')) {
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/delete/${instanceId}`, {
            method: 'DELETE'
        });
        
        if (!res.ok) {
            throw new Error(`削除失敗 (${res.status})`);
        }
        
        alert('削除しました');
        loadHistory(); // 再読み込み
    } catch (err) {
        alert(`削除エラー: ${err.message}`);
    }
}

// ページ読み込み時に履歴を取得
window.addEventListener('DOMContentLoaded', loadHistory);
```

**ポイント**:
- `/api/list-results`で処理履歴一覧を取得
- 動的にテーブル行を生成
- ダウンロード: `window.location.href`でファイルダウンロード
- 削除: `DELETE`リクエスト後に再読み込み

---

## データフロー図（フロントエンド視点）

```
[ユーザー]
    │
    │ 1. ファイル選択
    ▼
[index.html]
    │
    │ 2. アップロードボタンクリック
    ▼
[script.js]
    │
    │ 3. POST /api/upload (FormData)
    ▼
[Starter関数]
    │
    │ 4. instance_idを即座に返却（3~5秒）
    ▼
[script.js]
    │
    │ 5. ポーリング開始（10秒間隔）
    │
    ├─────────────────────────┐
    │                         │
    │ 6. GET /api/status/{id} │
    ▼                         │
[進捗バー更新]               │
    │                         │
    │ 7. runtimeStatus確認    │
    │                         │
    └─────────────────────────┘
                │
                │ 8. Completed
                ▼
        [履歴ページへ誘導]
                │
                │ 9. history.htmlを開く
                ▼
        [history.js]
                │
                │ 10. GET /api/list-results
                ▼
        [処理履歴一覧表示]
                │
                │ 11. ダウンロードボタンクリック
                ▼
        [GET /api/download/{id}]
                │
                ▼
        [ZIPファイルダウンロード]
```

---

## まとめ

### フロントエンドの責務
1. **ファイルアップロード**（FormData）
2. **ポーリングによる進捗確認**（10秒間隔）
3. **進捗バーの更新**（視覚的フィードバック）
4. **処理履歴の管理**（一覧表示・ダウンロード・削除）

### 技術的特徴
- **非同期処理**: `async/await`で可読性の高いコード
- **ポーリング**: `setInterval`で定期的に進捗確認
- **動的DOM操作**: JavaScriptでテーブル行を生成
- **ユーザー体験**: 進捗バー・絵文字・エラーハンドリング

---

## 全体まとめ

このプロジェクトは、**Durable Functions**を活用して以下を実現しています：

1. **HTTP応答230秒制限の回避**（非同期アーキテクチャ）
2. **リアルタイム進捗表示**（Blob Storage + ポーリング）
3. **処理履歴管理**（ブラウザを閉じても結果を取得可能）
4. **スケーラビリティ**（Premium/Flexプランで自動スケール）

各レイヤーが明確に分離され、保守性・拡張性の高い設計になっています。
