import logging
import os
import time
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from prompts import (
    STRUCTURING_PROMPT, 
    EXTRACT_TEST_PERSPECTIVES_PROMPT, 
    CREATE_TEST_SPEC_PROMPT_SIMPLE,
    CREATE_TEST_SPEC_PROMPT_DETAILED,
    DIFF_DETECTION_PROMPT,
    EXTRACT_TEST_PERSPECTIVES_PROMPT_WITH_DIFF,
    CREATE_TEST_SPEC_PROMPT_WITH_DIFF
)

# .envファイルから環境変数を読み込む
load_dotenv()

# --- AWS Bedrock 接続情報 ---
aws_region = os.getenv("AWS_REGION", "us-east-1")

# --- モデル選択 ---
model_structuring = os.getenv("MODEL_STRUCTURING", "anthropic.claude-sonnet-4-20250514-v1:0")
model_test_perspectives = os.getenv("MODEL_TEST_PERSPECTIVES", "anthropic.claude-sonnet-4-20250514-v1:0")
model_test_spec = os.getenv("MODEL_TEST_SPEC", "anthropic.claude-sonnet-4-20250514-v1:0")
model_diff_detection = os.getenv("MODEL_DIFF_DETECTION", "anthropic.claude-sonnet-4-20250514-v1:0")

# LLMクライアントの初期化用変数（遅延初期化）
bedrock_client = None

def validate_env():
    """必須環境変数のチェック関数
    
    Raises:
        ValueError: 必須環境変数が不足している場合
    """
    required = [model_structuring, model_test_perspectives, model_test_spec, model_diff_detection]
    if not all(required):
        raise ValueError("AWS Bedrock の必須環境変数が設定されていません。")

def initialize_client():
    """LLMクライアントの初期化関数
    
    初回呼び出し時のみ実行される（遅延初期化）
    """
    global bedrock_client
    validate_env()
    
    # タイムアウト設定（読み取り: 600秒、接続: 60秒）
    config = Config(
        read_timeout=600,
        connect_timeout=60
    )
    
    # AWS Bedrock のクライアントを初期化
    bedrock_client = boto3.client(
        service_name="bedrock-runtime",
        region_name=aws_region,
        config=config
    )

def call_llm(system_prompt: str, user_prompt: str, model: str, max_retries: int = 10) -> tuple[str, dict]:
    """
    AWS Bedrock (Claude) を呼び出す共通関数
    
    Args:
        system_prompt: システムプロンプト（LLMの役割や指示）
        user_prompt: ユーザープロンプト（実際の入力データ）
        model: 使用するモデル名
        max_retries: レート制限エラー時の最大リトライ回数
    
    Returns:
        tuple[str, dict]: (LLMからの応答テキスト, 使用量情報)
            使用量情報: {"input_tokens": int, "output_tokens": int, "model": str}
    
    Raises:
        RuntimeError: API呼び出しに失敗した場合
    """
    global bedrock_client
    
    # クライアントが未初期化の場合は初期化
    if bedrock_client is None:
        initialize_client()
    
    for attempt in range(max_retries):
        try:
            # AWS Bedrock Converse API を呼び出し
            response = bedrock_client.converse(
                modelId=model,
                messages=[{"role": "user", "content": [{"text": user_prompt}]}],
                system=[{"text": system_prompt}],
                inferenceConfig={"maxTokens": 64000}
            )
            
            result = response["output"]["message"]["content"][0]["text"]
            usage_info = {
                "input_tokens": response["usage"]["inputTokens"],
                "output_tokens": response["usage"]["outputTokens"],
                "model": model
            }
            return result, usage_info

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            
            # レート制限エラー（ThrottlingException）
            if error_code == "ThrottlingException" and attempt < max_retries - 1:
                wait_time = min((2 ** attempt) * 3 + (attempt * 5), 120)
                logging.warning(f"AWS Bedrock レート制限エラー。{wait_time}秒後にリトライします（{attempt + 1}/{max_retries}）")
                time.sleep(wait_time)
                continue
            else:
                logging.error(f"AWS Bedrock API呼び出し中にエラーが発生しました: {str(e)}")
                raise RuntimeError(f"AWS Bedrock API呼び出しに失敗しました: {str(e)}")
        
        except Exception as e:
            # その他の予期しないエラー
            logging.error(f"予期しないエラーが発生しました: {str(e)}")
            raise RuntimeError(f"LLM呼び出し中に予期しないエラーが発生しました: {str(e)}")
    
    raise RuntimeError("AWS Bedrock API呼び出しに失敗しました")


# --- ビジネスロジック固有のLLM呼び出し関数 ---

def structuring(prompt: str) -> tuple[str, dict]:
    """Excelシートの生データをAIで構造化されたMarkdownに変換
    
    Returns:
        tuple[str, dict]: (構造化されたMarkdown, 使用量情報)
    """
    return call_llm(STRUCTURING_PROMPT, prompt, model_structuring)

def extract_test_perspectives(prompt: str) -> tuple[str, dict]:
    """設計書からAIでテスト観点を抽出
    
    Returns:
        tuple[str, dict]: (テスト観点, 使用量情報)
    """
    return call_llm(EXTRACT_TEST_PERSPECTIVES_PROMPT, prompt, model_test_perspectives)

def create_test_spec(prompt: str, granularity: str = "simple") -> tuple[str, dict]:
    """テスト仕様書を生成
    
    Args:
        prompt: 設計書とテスト観点を含むプロンプト
        granularity: テスト粒度（"simple" or "detailed"）
    
    Returns:
        tuple[str, dict]: (テスト仕様書, 使用量情報)
    """
    system_prompt = CREATE_TEST_SPEC_PROMPT_DETAILED if granularity == "detailed" else CREATE_TEST_SPEC_PROMPT_SIMPLE
    return call_llm(system_prompt, prompt, model_test_spec)

def detect_diff(prompt: str) -> str:
    """旧版と新版の設計書から差分を検知"""
    result, _ = call_llm(DIFF_DETECTION_PROMPT, prompt, model_diff_detection)
    return result

def extract_perspectives_with_diff(prompt: str) -> tuple[str, dict]:
    """差分を考慮してテスト観点を抽出（差分モード用）
    
    Returns:
        tuple[str, dict]: (テスト観点, 使用量情報)
    """
    return call_llm(EXTRACT_TEST_PERSPECTIVES_PROMPT_WITH_DIFF, prompt, model_test_perspectives)

def create_test_spec_with_diff(prompt: str) -> tuple[str, dict]:
    """差分と旧版仕様書を考慮してテスト仕様書を生成（差分モード用）
    
    Returns:
        tuple[str, dict]: (テスト仕様書, 使用量情報)
    """
    return call_llm(CREATE_TEST_SPEC_PROMPT_WITH_DIFF, prompt, model_test_spec)
