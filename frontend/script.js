console.log('script.js実行開始');

// ==================== 環境設定 ====================
const API_BASE_URL = 'https://poc-func.azurewebsites.net/api'; // 本番環境用
// const API_BASE_URL = 'http://localhost:7071/api'; // ローカル開発用
// ==================================================

const status = document.querySelector("#status");
const uploadBtn = document.querySelector("#uploadBtn");
const progressBar = document.querySelector("#progressBar");
const progressText = document.querySelector("#progressText");
const progressContainer = document.querySelector("#progressContainer");

console.log('DOM要素取得:', {status, uploadBtn, progressBar, progressText, progressContainer});

let pollingInterval = null;
let currentJobId = null;

// モード切り替え
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

uploadBtn.addEventListener("click", async () => {
    console.log('アップロードボタンクリック');
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const granularity = document.querySelector('input[name="granularity"]:checked').value;
    
    const formData = new FormData();
    
    if (mode === "normal") {
        const files = document.querySelector("#fileInput").files;
        if (files.length === 0) {
            status.textContent = "詳細設計書を選択してください";
            return;
        }
        for (let i = 0; i < files.length; i++) {
            formData.append("documentFiles", files[i]);
        }
    } else {
        const newExcelFiles = document.querySelector("#newExcelFiles").files;
        const oldStructuredMd = document.querySelector("#oldStructuredMd").files;
        const oldTestSpecMd = document.querySelector("#oldTestSpecMd").files;
        
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

    uploadBtn.disabled = true;
    status.textContent = mode === "diff" ? "生成中...（差分検知を含むため時間がかかる場合があります）" : "生成中...";
    progressContainer.style.display = "block";
    progressBar.style.width = "0%";
    progressText.textContent = "処理を開始しています...";

    const endpoint = mode === "normal" 
        ? `${API_BASE_URL}/upload`
        : `${API_BASE_URL}/upload_diff`;

    // ジョブIDを事前に生成
    const jobId = crypto.randomUUID();
    currentJobId = jobId;
    console.log('ジョブID生成:', jobId);
    
    // クエリパラメータにジョブIDを追加
    const endpointWithJobId = `${endpoint}?jobId=${jobId}`;

    try {
        // 先にポーリングを開始
        setTimeout(() => {
            console.log('ポーリング開始準備');
            startPollingWithoutJobId();
        }, 1000);
        
        // 同期処理（ZIPファイルを直接返す）
        fetch(endpointWithJobId, {
            method: "POST",
            body: formData,
        }).then(async (res) => {
            if (!res.ok) {
                stopPolling();
                progressContainer.style.display = "none";
                if (res.status === 401 || res.status === 403) {
                    status.textContent = "アクセスが拒否されました（IP制限）";
                } else if (res.status === 400) {
                    const errorText = await res.text();
                    status.textContent = `入力エラー: ${errorText}`;
                } else if (res.status === 500) {
                    status.textContent = "サーバーエラー: 処理中に問題が発生しました";
                } else {
                    status.textContent = `エラー: ${res.status}`;
                }
                uploadBtn.disabled = false;
                return;
            }

            // ファイルダウンロード処理
            const blob = await res.blob();
            const contentDisposition = res.headers.get('content-disposition');
            let filename = mode === "diff" ? 'generated_files_diff.zip' : 'generated_files.zip';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
                if (filenameMatch && filenameMatch.length > 1) {
                    filename = decodeURIComponent(filenameMatch[1]);
                } else {
                    const filenameMatchRegular = contentDisposition.match(/filename="(.+)"/);
                    if (filenameMatchRegular && filenameMatchRegular.length > 1) {
                        filename = filenameMatchRegular[1];
                    }
                }
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();

            stopPolling();
            progressContainer.style.display = "none";
            status.textContent = "✅ 完了しました";
            uploadBtn.disabled = false;
        }).catch((err) => {
            stopPolling();
            progressContainer.style.display = "none";
            status.textContent = `通信エラー: ${err.message}`;
            uploadBtn.disabled = false;
        });
        
        // 何もしない（ポーリングはすでに開始済み）
        
    } catch (err) {
        stopPolling();
        progressContainer.style.display = "none";
        status.textContent = `エラー: ${err.message}`;
        uploadBtn.disabled = false;
    }
});

function startPollingWithoutJobId() {
    stopPolling();
    // 初回は即座に実行
    if (currentJobId) pollProgress(currentJobId);
    
    pollingInterval = setInterval(async () => {
        if (currentJobId) {
            await pollProgress(currentJobId);
        }
    }, 10000); // 10秒間隔
}

async function pollProgress(jobId) {
    try {
        const progressEndpoint = `${API_BASE_URL}/progress/${jobId}`;
        const res = await fetch(progressEndpoint);
        
        if (res.ok) {
            const data = await res.json();
            updateProgress(data);
        }
    } catch (err) {
        // エラーは無視（ポーリング継続）
    }
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    // currentJobIdはクリアしない（ポーリング中に必要）
}

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
