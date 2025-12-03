# コードリーディング Part 3: coreモジュール完全解説

## coreモジュール構成

```
core/
├── __init__.py              # パッケージ定義
├── llm_service.py           # LLM呼び出し抽象化層
├── progress_manager.py      # 進捗管理
├── utils.py                 # 共通ユーティリティ
├── normal_mode.py           # 通常モード処理
└── diff_mode.py             # 差分モード処理
```

---

## 1. llm_service.py: LLM呼び出し抽象化層

### 環境変数の読み込み

```python
from dotenv import load_dotenv
load_dotenv()

# Azure AI Foundry (Claude) 接続情報
foundry_api_key = os.getenv("AZURE_FOUNDRY_API_KEY")
foundry_endpoint = os.getenv("AZURE_FOUNDRY_ENDPOINT")

# モデル選択
model_structuring = os.getenv("MODEL_STRUCTURING")
model_test_perspectives = os.getenv("MODEL_TEST_PERSPECTIVES")
model_test_spec = os.getenv("MODEL_TEST_SPEC")
model_diff_detection = os.getenv("MODEL_DIFF_DETECTION")
```

**ポイント**: 各処理ステップで異なるモデルを使用可能（柔軟性）

### LLMクライアントの初期化（遅延初期化）

```python
foundry_client = None  # グローバル変数

def initialize_client():
    """LLMクライアントの初期化関数（初回呼び出し時のみ実行）"""
    global foundry_client
    validate_env()
    
    foundry_client = AnthropicFoundry(
        api_key=foundry_api_key,
        base_url=foundry_endpoint
    )
```

**なぜ遅延初期化？**:
- モジュールインポート時に環境変数が未設定の場合でもエラーにならない
- 実際に使用するタイミングで初期化

### 共通LLM呼び出し関数

```python
def call_llm(system_prompt: str, user_prompt: str, model: str, max_retries: int = 10) -> str:
    """Azure AI Foundry (Claude) を呼び出す共通関数"""
    global foundry_client
    
    # クライアントが未初期化の場合は初期化
    if foundry_client is None:
        initialize_client()
    
    for attempt in range(max_retries):
        try:
            # Azure AI Foundry (Claude) を呼び出し（ストリーミング有効）
            result = ""
            with foundry_client.messages.stream(
                model=model,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
                max_tokens=64000,
            ) as stream:
                for text in stream.text_stream:
                    result += text
            return result

        except RateLimitError as e:
            # レート制限エラー時のリトライ処理
            if attempt < max_retries - 1:
                wait_time = min((2 ** attempt) * 3 + (attempt * 5), 120)
                logging.warning(f"レート制限エラー。{wait_time}秒後にリトライ ({attempt + 1}/{max_retries})")
                time.sleep(wait_time)
                continue
            else:
                raise RuntimeError("レート制限エラー。時間をおいて再試行してください。")
        
        except APIError as e:
            logging.error(f"API呼び出し中にエラー: {str(e)}")
            raise RuntimeError(f"API呼び出しに失敗: {str(e)}")
```

**リトライ戦略**:
- 指数バックオフ: `wait_time = (2 ** attempt) * 3 + (attempt * 5)`
- 最大待機時間: 120秒
- 最大リトライ回数: 10回

### ビジネスロジック固有の関数

```python
def structuring(prompt: str) -> str:
    """Excelシートの生データをAIで構造化されたMarkdownに変換"""
    return call_llm(STRUCTURING_PROMPT, prompt, model_structuring)

def extract_test_perspectives(prompt: str) -> str:
    """設計書からAIでテスト観点を抽出"""
    return call_llm(EXTRACT_TEST_PERSPECTIVES_PROMPT, prompt, model_test_perspectives)

def create_test_spec(prompt: str, granularity: str = "simple") -> str:
    """テスト仕様書を生成"""
    system_prompt = CREATE_TEST_SPEC_PROMPT_DETAILED if granularity == "detailed" else CREATE_TEST_SPEC_PROMPT_SIMPLE
    return call_llm(system_prompt, prompt, model_test_spec)

def detect_diff(prompt: str) -> str:
    """旧版と新版の設計書から差分を検知"""
    return call_llm(DIFF_DETECTION_PROMPT, prompt, model_diff_detection)

def extract_perspectives_with_diff(prompt: str) -> str:
    """差分を考慮してテスト観点を抽出（差分モード用）"""
    return call_llm(EXTRACT_TEST_PERSPECTIVES_PROMPT_WITH_DIFF, prompt, model_test_perspectives)

def create_test_spec_with_diff(prompt: str) -> str:
    """差分と旧版仕様書を考慮してテスト仕様書を生成（差分モード用）"""
    return call_llm(CREATE_TEST_SPEC_PROMPT_WITH_DIFF, prompt, model_test_spec)
```

**設計パターン**: Facade Pattern（複雑なLLM呼び出しを単純なインターフェースで隠蔽）

---

## 2. progress_manager.py: 進捗管理

### ProgressManagerクラス

```python
class ProgressManager:
    def __init__(self):
        connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        if not connection_string:
            raise ValueError("AZURE_STORAGE_CONNECTION_STRINGが設定されていません")
        
        self.blob_service_client = BlobServiceClient.from_connection_string(
            connection_string,
            logging_enable=False  # SDKの詳細ログを無効化
        )
        self.container_name = "progress"
        self._ensure_container()
    
    def update_progress(self, job_id: str, stage: str, message: str, progress: int):
        """進捗情報をBlob Storageに保存"""
        try:
            blob_client = self.blob_service_client.get_blob_client(self.container_name, f"{job_id}.json")
            data = {
                "stage": stage,
                "message": message,
                "progress": progress,
                "timestamp": datetime.utcnow().isoformat()
            }
            blob_client.upload_blob(json.dumps(data, ensure_ascii=False), overwrite=True, logging_enable=False)
            logging.info(f"進捗更新: {stage} ({progress}%)")
        except Exception as e:
            logging.error(f"進捗更新失敗: {e}")
    
    def get_progress(self, job_id: str):
        """進捗情報を取得"""
        blob_client = self.blob_service_client.get_blob_client(self.container_name, f"{job_id}.json")
        try:
            data = blob_client.download_blob(logging_enable=False).readall()
            return json.loads(data)
        except:
            return None
```

**ポイント**:
- `logging_enable=False`: Azure Storage SDKの詳細ログを無効化（ログの肥大化を防止）
- `overwrite=True`: 同じファイルを上書き（最新の進捗情報のみ保持）

---

## 3. utils.py: 共通ユーティリティ

### process_excel_to_markdown: Excel → Markdown変換

```python
def process_excel_to_markdown(files, progress_callback=None, job_id=None) -> str:
    """Excelファイル群を構造化されたMarkdownに変換する"""
    all_md_sheets = []  # 各シートの構造化結果を格納
    all_toc_list = []   # 目次用のリンクリスト
    
    # 総シート数をカウント
    total_sheets = 0
    for file in files:
        file.stream.seek(0)
        file_bytes = file.read()
        excel_data = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None, header=None)
        total_sheets += len(excel_data)
    
    # 進捗計算: 10%から40%までを総シート数で均等に分割
    progress_range = 30
    progress_per_sheet = progress_range / total_sheets if total_sheets > 0 else 0
    current_sheet = 0
    
    for file in files:
        file.stream.seek(0)
        file_bytes = file.read()
        filename = file.filename
        excel_data = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None, header=None)
        
        for sheet_name, df in excel_data.items():
            # シート名をファイル名と組み合わせて一意にする
            full_sheet_name = f"{Path(filename).stem}_{sheet_name}"
            # Markdownアンカー用のIDを生成
            anchor = re.sub(r'[^a-z0-9-]', '', full_sheet_name.strip().lower().replace(' ', '-'))
            all_toc_list.append(f'- [{full_sheet_name}](#{anchor})')
            
            # シートの内容をテキスト化
            sheet_content = f"## {full_sheet_name}\n\n"
            raw_text = '\n'.join(df.apply(lambda row: ' | '.join(row.astype(str).fillna('')), axis=1))
            structuring_prompt = f'--- Excelシート「{full_sheet_name}」 ---\n{raw_text}'
            
            # LLMで構造化
            try:
                current_sheet += 1
                logging.info(f"「{full_sheet_name}」を構造化... ({current_sheet}/{total_sheets})")
                
                # 進捗更新
                progress_percent = int(10 + (current_sheet * progress_per_sheet))
                if progress_callback and job_id:
                    progress_callback("structuring", f"設計書を構造化中... ({current_sheet}/{total_sheets}シート)", progress_percent)
                
                structured_content = llm_service.structuring(structuring_prompt)
                sheet_content += structured_content
            except Exception as e:
                logging.error(f"シート「{full_sheet_name}」の構造化中にエラー: {e}")
                sheet_content += "（AIによる構造化に失敗しました）"
                
            all_md_sheets.append(sheet_content)
    
    # 最終的なMarkdownドキュメントを組み立て
    md_output = "# 詳細設計書\n\n## 目次\n\n"
    md_output += "\n".join(all_toc_list)
    md_output += "\n\n---\n\n"
    md_output += "\n\n---\n\n".join(all_md_sheets)
    return md_output
```

**処理の流れ**:
1. 全ファイルの総シート数をカウント
2. 進捗率を計算（10%～40%を総シート数で均等分割）
3. 各シートをLLMで構造化
4. 目次付きMarkdownドキュメントを生成

**進捗更新の仕組み**:
```python
progress_percent = int(10 + (current_sheet * progress_per_sheet))
if progress_callback and job_id:
    progress_callback("structuring", f"設計書を構造化中... ({current_sheet}/{total_sheets}シート)", progress_percent)
```

### convert_md_to_excel_and_csv: Markdown → Excel/CSV変換

```python
def convert_md_to_excel_and_csv(md_output: str, is_diff_mode: bool = False):
    """生成されたテスト仕様書（Markdown）をExcelとCSVに変換する"""
    
    # Markdown表の行を抽出（|で始まる行のみ）
    md_lines = [line.strip() for line in md_output.splitlines() if line.strip().startswith("|")]
    
    if not md_lines:
        raise ValueError("テスト仕様書にMarkdown表が見つかりませんでした")
    
    # ヘッダー行の解析
    header = [h.strip() for h in md_lines[0].strip('|').split('|')]
    
    # 2行目の区切り行（|---|---|）をスキップしてデータ行を抽出
    data_rows = []
    if len(md_lines) > 1 and all(c in '-|: ' for c in md_lines[1]):
        data_rows = md_lines[2:]
    else:
        data_rows = md_lines[1:]

    # 各データ行をパース
    data = []
    for row in data_rows:
        data.append([item.strip() for item in row.strip('|').split('|')])

    # pandas DataFrameに変換
    df = pd.DataFrame(data, columns=header)

    # Excel用のDataFrame（差分モードの場合は変更種別列を除外）
    df_for_excel = df.copy()
    if is_diff_mode and "変更種別" in df.columns:
        df_for_excel = df.drop(columns=["変更種別"])

    # --- Excel変換 ---
    template_path = "単体テスト仕様書.xlsx"
    wb = load_workbook(template_path)
    ws = wb.active
    
    # 各列のExcel上の位置を定義
    column_map = {
        "No": 1, "大区分": 2, "中区分": 6, "テストケース": 10, "期待結果": 23, "参照元": 42
    }
    start_row = 11  # データの開始行
    
    # 各データをExcelに書き込む
    for i, row in enumerate(df_for_excel.itertuples(index=False), start=start_row):
        for col_name, excel_col in column_map.items():
            if col_name in df_for_excel.columns:
                value = getattr(row, col_name)
                ws.cell(row=i, column=excel_col, value=value)
    
    # Excelをバイナリデータとして保存
    excel_buffer = io.BytesIO()
    wb.save(excel_buffer)
    excel_bytes = excel_buffer.getvalue()
    
    # --- CSV変換 ---
    df_csv = df.copy()
    # <br>タグを改行に変換
    for col in df_csv.columns:
        if df_csv[col].dtype == 'object':
            df_csv[col] = df_csv[col].str.replace('<br>', '\n', regex=False)
    
    # CSVをバイナリデータとして保存（BOM付きUTF-8）
    csv_buffer = io.StringIO()
    df_csv.to_csv(csv_buffer, index=False, encoding='utf-8-sig')
    csv_bytes = csv_buffer.getvalue().encode('utf-8-sig')
    
    return excel_bytes, csv_bytes
```

**ポイント**:
- Markdown表をパースしてpandas DataFrameに変換
- テンプレートExcelファイルに書き込み（既存のフォーマットを維持）
- CSV出力時は`<br>`タグを改行に変換
- BOM付きUTF-8でエンコード（Excelで文字化けを防止）

---

## 4. normal_mode.py: 通常モード処理

```python
def generate_normal_test_spec(files, granularity: str, job_id: str = None) -> bytes:
    """通常モードでテスト仕様書一式を生成し、ZIPファイルのバイナリデータを返す"""
    
    # ProgressManager初期化
    progress = None
    if job_id:
        try:
            progress = ProgressManager()
        except Exception as e:
            logging.error(f"ProgressManager初期化失敗: {e}")
            progress = None
    
    # 進捗コールバック関数を定義
    def progress_callback(stage, message, progress_percent):
        if progress:
            progress.update_progress(job_id, stage, message, progress_percent)
    
    # 1. ExcelファイルをMarkdownに変換
    md_output_first = utils.process_excel_to_markdown(files, progress_callback, job_id)
    
    # 2. AIによるテスト観点抽出
    if progress:
        progress.update_progress(job_id, "perspectives", "テスト観点を抽出中...", 40)
    extract_perspectives_prompt = f"--- 設計書 ---\n{md_output_first}"
    md_output_second = llm_service.extract_test_perspectives(extract_perspectives_prompt)

    # 3. AIによるテスト仕様書生成
    if progress:
        progress.update_progress(job_id, "testspec", "テスト仕様書を生成中...", 70)
    test_gen_prompt = f"--- 設計書 ---\n{md_output_first}\n\n--- テスト観点 ---\n{md_output_second}"
    md_output_third = llm_service.create_test_spec(test_gen_prompt, granularity)

    # 4. 成果物の変換
    if progress:
        progress.update_progress(job_id, "converting", "成果物を変換中...", 90)
    excel_bytes, csv_bytes = utils.convert_md_to_excel_and_csv(md_output_third)

    # 5. 全成果物をZIPファイルにまとめる
    base_name = Path(files[0].filename).stem if len(files) == 1 else "設計書"
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr(f"{base_name}_構造化設計書.md", md_output_first.encode('utf-8'))
        zip_file.writestr(f"{base_name}_テスト観点.md", md_output_second.encode('utf-8'))
        zip_file.writestr(f"{base_name}_テスト仕様書.md", md_output_third.encode('utf-8'))
        zip_file.writestr(f"{base_name}_テスト仕様書.xlsx", excel_bytes)
        zip_file.writestr(f"{base_name}_テスト仕様書.csv", csv_bytes)
    
    zip_buffer.seek(0)
    zip_bytes = zip_buffer.read()
    
    if progress:
        progress.update_progress(job_id, "completed", "完了しました", 100)
    
    return zip_bytes
```

**処理フロー**:
1. Excel → Markdown構造化（10-40%）
2. テスト観点抽出（40-50%）
3. テスト仕様書生成（70%）
4. Excel/CSV変換（90%）
5. ZIP作成（100%）

---

## 5. diff_mode.py: 差分モード処理

```python
def generate_diff_test_spec(new_excel_files, old_structured_md_file, old_test_spec_md_file, granularity: str, job_id: str = None) -> bytes:
    """差分モードでテスト仕様書一式を生成し、ZIPファイルのバイナリデータを返す"""
    
    # 進捗コールバック関数を定義
    def progress_callback(stage, message, progress_percent):
        if progress:
            progress.update_progress(job_id, stage, message, progress_percent)
    
    # Step 1: 新版Excelを構造化
    new_structured_md = utils.process_excel_to_markdown(new_excel_files, progress_callback, job_id)
    
    # Step 2: 旧版情報の取得
    old_structured_md = old_structured_md_file.read().decode('utf-8')
    old_test_spec_md = old_test_spec_md_file.read().decode('utf-8')
    
    # Step 3: 差分検知
    if progress:
        progress.update_progress(job_id, "diff", "差分を検知中...", 40)
    diff_prompt = f"【旧版設計書】\n{old_structured_md}\n\n【新版設計書】\n{new_structured_md}"
    diff_summary = llm_service.detect_diff(diff_prompt)
    
    # Step 4: テスト観点抽出（差分考慮）
    if progress:
        progress.update_progress(job_id, "perspectives", "テスト観点を抽出中...", 60)
    perspectives_prompt = f"【新版設計書】\n{new_structured_md}\n\n【変更差分】\n{diff_summary}"
    test_perspectives = llm_service.extract_perspectives_with_diff(perspectives_prompt)
    
    # Step 5: テスト仕様書生成（差分・旧版考慮）
    if progress:
        progress.update_progress(job_id, "testspec", "テスト仕様書を生成中...", 80)
    spec_prompt = (
        f"【新版設計書】\n{new_structured_md}\n\n"
        f"【テスト観点】\n{test_perspectives}\n\n"
        f"【変更差分】\n{diff_summary}\n\n"
        f"【旧版テスト仕様書】\n{old_test_spec_md}"
    )
    test_spec_md = llm_service.create_test_spec_with_diff(spec_prompt)
    
    # Step 6: 成果物の変換
    if progress:
        progress.update_progress(job_id, "converting", "成果物を変換中...", 90)
    excel_bytes, csv_bytes = utils.convert_md_to_excel_and_csv(test_spec_md, is_diff_mode=True)
    
    # Step 7: ZIP作成
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("新版_構造化設計書.md", new_structured_md.encode('utf-8'))
        zip_file.writestr("差分サマリー.md", diff_summary.encode('utf-8'))
        zip_file.writestr("テスト観点.md", test_perspectives.encode('utf-8'))
        zip_file.writestr("テスト仕様書.md", test_spec_md.encode('utf-8'))
        zip_file.writestr("テスト仕様書.xlsx", excel_bytes)
        zip_file.writestr("テスト仕様書.csv", csv_bytes)
    
    zip_buffer.seek(0)
    zip_bytes = zip_buffer.read()
    
    if progress:
        progress.update_progress(job_id, "completed", "完了しました", 100)
    
    return zip_bytes
```

**通常モードとの違い**:
- 差分検知ステップを追加（40%）
- LLMプロンプトに旧版情報を含める
- `is_diff_mode=True`でExcel変換時に変更種別列を除外

---

## まとめ

### coreモジュールの責務
1. **LLM呼び出しの抽象化**（llm_service.py）
2. **進捗管理**（progress_manager.py）
3. **Excel/Markdown変換**（utils.py）
4. **ビジネスロジックの実装**（normal_mode.py, diff_mode.py）

### 次のパート
- Part 4: フロントエンド詳細解説
