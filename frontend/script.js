const status = document.querySelector("#status");
const uploadBtn = document.querySelector("#uploadBtn");
const fileInput = document.querySelector("#fileInput");
const apiKeyInput = document.querySelector("#apiKeyInput");

uploadBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    const files = fileInput.files;
    
    if (!apiKey) {
        status.textContent = "アクセスキーを入力してください";
        return;
    }
    
    if (files.length === 0) {
        status.textContent = "詳細設計書を選択してください";
        return;
    }

    // 選択された粒度を取得
    const granularity = document.querySelector('input[name="granularity"]:checked').value;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append("documentFiles", files[i]);
    }
    formData.append("granularity", granularity);

    uploadBtn.disabled = true;
    status.textContent = "生成中...";

    // ==== ローカル開発用 ====
    // const endpoint = "http://localhost:7071/api/upload?code=" + encodeURIComponent(apiKey);
    // ==== 本番環境用 ====
    const endpoint = "https://poc-func.azurewebsites.net/api/upload?code=" + encodeURIComponent(apiKey);

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            body: formData,
        });

        // console.log(res)  // 本番環境ではコメントアウト

        if (!res.ok) {
            if (res.status === 401) {
                status.textContent = "認証エラー: アクセスキーが無効です";
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
        let filename = 'generated_files.zip'; // fallback filename
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
