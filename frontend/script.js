const status = document.querySelector("#status");
const uploadBtn = document.querySelector("#uploadBtn");

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
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const granularity = document.querySelector('input[name="granularity"]:checked').value;
    
    const formData = new FormData();
    
    if (mode === "normal") {
        // 通常版
        const files = document.querySelector("#fileInput").files;
        if (files.length === 0) {
            status.textContent = "詳細設計書を選択してください";
            return;
        }
        for (let i = 0; i < files.length; i++) {
            formData.append("documentFiles", files[i]);
        }
    } else {
        // 差分版
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

    // ==== ローカル開発用 ====
    const endpoint = mode === "normal" 
        ? "http://localhost:7071/api/upload"
        : "http://localhost:7071/api/upload_diff";
    // ==== 本番環境用 ====
    // const endpoint = mode === "normal"
    //     ? "https://poc-func.azurewebsites.net/api/upload"
    //     : "https://poc-func.azurewebsites.net/api/upload_diff";

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            body: formData,
        });

        // console.log(res)  // 本番環境ではコメントアウト

        if (!res.ok) {
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

        status.textContent = "完了しました";
    } catch (err) {
        status.textContent = `通信エラー: ${err.message}`;
    } finally {
        uploadBtn.disabled = false;
    }
});
