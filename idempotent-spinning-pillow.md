# AICallCenter2 — 医療向け AI 電話 SaaS 設計プラン

## Context

ゼロから `D:\AICallCenter2` に、Dr.JOY「AIコール」(https://drjoy.jp/feature/aicall) 相当の **医療機関向けマルチテナント AI 電話 SaaS** を構築する。Dr.JOY は 191 施設導入・病院 DX アワード 2025 優秀賞の実績があり、本プロジェクトはその機能セットを参考にしつつ、**OpenAI Realtime API による低遅延音声会話**を強みに差別化する。

確定済みの方針:

| 項目 | 決定 |
| --- | --- |
| スコープ | 本格的なマルチテナント SaaS（MVP ではなく将来 100 回線同時対応まで見据える） |
| テレフォニー | Amazon Connect (Tokyo) を主軸、将来 Twilio/WebRTC アダプタを追加可能な設計 |
| AI | OpenAI Realtime API (GPT-4o Realtime) で日本語音声を end-to-end |
| バックエンド | Python 3.11 + FastAPI（user の miniforge `py311env` を使用） |
| フロント | Next.js (App Router, TypeScript) 管理画面 |
| コンプラ | 3 省 2 ガイドライン + ISMS 準拠を最初から織り込む |

最初のマイルストーンは **Phase 1: シングルテナント MVP のデモ可能版**（〜6 週間）。その後マルチテナント化と SaaS 化に拡張する段階的デリバリ。

---

## 推奨アーキテクチャ — "Path C ハイブリッド"

**Amazon Connect は電話の入口専用**（DID 払い出し、IVR の入口、ヒューマンエージェントへの転送、キュー）。**AI 会話ループは Amazon Chime SDK Voice Connector + 自前メディアブリッジ**で SIP/RTP を終端し、OpenAI Realtime WebSocket と双方向ストリーミングする。

理由（短く）:
- 純 KVS 経由（Path A）は再生側 API が貧弱で 300–800ms のバッファ遅延が解消できず、<600ms ファーストレスポンス目標に届かない
- 純 SIP（Path B）は低遅延だが Connect の利点（CCP, キュー, 営業時間ルーティング）を全部自作するコスト
- Path C は Connect 由来の業務機能と SIP 由来の低遅延を両取りできる

### コンポーネント図

```
            PSTN (NTT / 050 / 0120)
                     |
            +--------v---------+
            |  Amazon Connect  |  DID, IVR 入口, キュー, 人間転送
            |  (ap-northeast-1)|  Contact Flow: "AI" 分岐 -> SIP outdial
            +---+----------+---+
                |          |
        Agent CCP          | SIP REFER / outdial
                           v
                +----------------+
                | Chime SDK      |   マネージド SIP トランク
                | Voice Connector|
                +-------+--------+
                        | SIP/RTP (μ-law 8kHz)
                        v
                +--------------------+    WSS (PCM16 24kHz)
                | Media Bridge       +-----> OpenAI Realtime API
                | ECS Fargate (Py)   |<------ (gpt-4o-realtime)
                | aiortc / pjsua2    |
                +-+-----+------+-----+
                  |     |      |
        events    |     | audio frames, partial transcripts, tool calls
                  v     v
            +-----------+   +------------------+
            |EventBridge|   | S3 (recordings,  |
            +-----+-----+   |  KMS encrypted)  |
                  |         +------------------+
                  v
            +-------------+        +--------------+
            | FastAPI     |<------>| Redis        |
            | ECS Fargate |        | (session,    |
            +--+----------+        |  pub/sub)    |
               |                   +--------------+
               v
            +-------------------+
            | RDS PostgreSQL    |  Multi-AZ, KMS, pgvector (FAQ)
            +-------------------+

      Next.js admin -> CloudFront -> API GW -> FastAPI
      SMS: Amazon SNS (国内 SMS) または Twilio JP
      Observability: CloudWatch + OpenTelemetry
```

### 主要技術選定理由

| 関心事 | 選定 | 理由 |
| --- | --- | --- |
| SIP 終端 | `aiortc` ベース or `pjsua2` サイドカー (Python) | Python 一体で OpenAI WS とのブリッジが書きやすい |
| 音声変換 | `audioop` + `soxr-py` で μ-law 8kHz ↔ PCM16 24kHz | 軽量、ECS Fargate のコア内処理で完結 |
| シナリオエンジン | **テナント記述の State Graph + 各 state 内で LLM** | 純ツールコール（自由すぎ）と純 FSM（硬直）の中間。監査要件と相性◎ |
| マルチテナント分離 | アプリ層 `tenant_id` フィルタ + Postgres **RLS** の二重防壁 | 単一スキーマで開始、RLS が安全網 |
| テレフォニー抽象化 | `TelephonyAdapter` インタフェース（Connect 実装が初期、Twilio 実装は Phase 3 で） | 将来 WebRTC・他社移行に備える |

---

## データモデル（コアエンティティ）

```text
tenant(id, name, plan, region, created_at, kms_key_arn)
tenant_user(id, tenant_id, email, role, mfa_secret, last_login_at)   -- owner/admin/operator/viewer
phone_number(id, tenant_id, e164, provider, connect_instance_id, did_status)
scenario(id, tenant_id, name, version, status, root_state_id, created_by)
scenario_state(id, scenario_id, key, prompt, tool_allowlist jsonb, transitions jsonb)
tool_definition(id, tenant_id, key, type, config jsonb)              -- send_sms / create_appointment_draft / transfer_to_human ...
call(id, tenant_id, phone_number_id, scenario_id, scenario_version,
     direction, caller_e164, started_at, ended_at, status,           -- 新着/対応中/完了/折り返し要
     duration_ms, recording_s3_key, cost_jpy, assignee_user_id)
call_event(id, call_id, ts, type, payload jsonb)                    -- state_enter, tool_call, transfer, hangup
transcript_segment(id, call_id, speaker, ts_start, ts_end, text, confidence)
extracted_data(id, call_id, schema_key, payload jsonb, validated bool)
sms_message(id, tenant_id, call_id, to_e164, body, provider, status, sent_at)
appointment_draft(id, tenant_id, call_id, patient_name, dob, dept, requested_slot, status)
audit_log(id, tenant_id, actor_user_id, action, resource_type, resource_id, ts, ip, ua, payload_hash)
api_key(id, tenant_id, hashed_key, scope, last_used_at, revoked_at)
faq_entry(id, tenant_id, question, answer, embedding vector(1536))   -- pgvector
```

すべての PHI を含むテーブルは KMS 暗号化（RDS レベル）+ 行レベル `tenant_id` で RLS ポリシーを設定。

---

## 段階的デリバリ計画

### Phase 0 — 基盤整備（Week 1–2）

**ゴール:** 開発者が `terraform apply` で動く dev 環境を作れる。

- AWS Organization + dev/stg/prod アカウント
- Terraform スケルトン（VPC, RDS, ECS, Connect, Chime, KMS, S3）
- GitHub Actions CI（Python + Web 両方）
- モノレポ scaffold（後述）
- FastAPI hello-world を Fargate にデプロイ
- Next.js hello-world を Vercel または CloudFront+S3 にデプロイ
- Connect インスタンス作成 + テスト DID 取得

**Acceptance:** dev 環境に電話して固定プロンプトが再生される。CI が両方 deploy する。

### Phase 1 — シングルテナント MVP（Week 3–8）

**ゴール:** リアルな日本語電話で AI が予約受付できる、デモ可能版。

- メディアブリッジが OpenAI Realtime 双方向ループを完成
- 録音 → S3, 文字起こし → Postgres
- ハードコードされた `受付→用件聴取→確認→終了` シナリオ（エディタはまだ）
- ツール 3 つ: `create_appointment_draft`, `send_sms`, `transfer_to_human`
- 管理画面: 通話一覧 / 詳細（文字起こし + 音声プレイヤ）/ ステータス更新 / 検索
- 10 回線同時対応

**Acceptance:** 実際の日本語通話で AI が診察予約を受け、患者名・生年月日・希望枠を抽出、SMS 確認送信、管理画面で録音再生、ヒューマン転送が動く。p95 ファーストレスポンス < 700ms。

### Phase 2 — マルチテナント + シナリオエディタ（Week 9–16）

**ゴール:** 2 テナント以上、非エンジニアがシナリオを編集できる。

- テナント発行フロー、RBAC、RLS、テナント別 KMS キー、テナント別電話番号
- ビジュアル State Graph エディタ（Next.js）、プロンプト編集、ツール許可リスト、バージョン管理、publish/rollback
- 架電（アウトバウンドキャンペーン）
- FAQ セルフサービス（pgvector による類似検索）
- ステータスワークフロー、メモ、CSV エクスポート
- 50 回線同時対応の負荷試験

**Acceptance:** 2 テナント運用、データ分離検証済み、非エンジニアがシナリオを編集→公開、50 同時通話で 30 分安定（p95 < 700ms）。

### Phase 3 — 本番 SaaS（Week 17–26）

- 100 回線同時対応、オートスケール検証
- 課金（Stripe、従量制）、セルフサーブオンボーディング
- 全監査レポート、保管期限、BCP ランブック、ISMS 証跡収集
- 業種別シナリオテンプレート（総合病院・健診・薬局・疑義照会）
- SLA 99.9%, ステータスページ
- 多言語対応（英語、中国語の追加）

---

## モノレポ scaffold（Day 1 に作る最小構成）

```
D:\AICallCenter2\
  README.md
  pyproject.toml                 # uv workspace root
  pnpm-workspace.yaml
  .editorconfig
  .gitignore
  .github/workflows/
    ci-python.yml
    ci-web.yml
    deploy-staging.yml
  infra/                         # Terraform
    envs/{dev,stg,prod}/
    modules/{network,ecs,rds,connect,chime,kms,s3-recordings,observability}/
  services/
    api/                         # FastAPI
      pyproject.toml
      src/api/{main.py, config.py, db/, auth/, tenants/, calls/,
               scenarios/, tools/, events/, audit/}
      tests/
    media-bridge/                # SIP + OpenAI Realtime
      pyproject.toml
      src/bridge/{sip_server.py, rtp_session.py, transcoder.py,
                  openai_realtime.py, session_orchestrator.py,
                  recorder.py, metrics.py}
      tests/
    worker/                      # SMS retries, post-call processing
      src/worker/
  packages/
    shared-py/                   # Pydantic models, event schemas, scenario DSL
    shared-ts/                   # TS types generated from Pydantic
  web/
    admin/                       # Next.js App Router
      app/(auth)/  app/(tenant)/{calls,scenarios,numbers,settings}/
      components/  lib/api-client/
      package.json
  docs/
    architecture.md
    compliance-3sho2.md
    runbooks/  adr/
  scripts/
    bootstrap-dev.ps1            # Windows / PowerShell 用
    seed-tenant.py
```

Python は `C:\Users\Aruta\miniforge3\envs\py311env\python.exe` を `uv` のインタプリタとして登録（`uv python pin`）。

---

## 3 省 2 ガイドライン: Day 1 で焼き込む項目

| 項目 | Day 1 で実装 |
| --- | --- |
| リージョン | `ap-northeast-1` 固定、SCP で他リージョン拒否 |
| 暗号化 | RDS / S3 / Secrets Manager すべて KMS CMK（テナント別 or プラン別） |
| 監査ログ | CloudTrail（組織レベル、ログ完全性検証）+ アプリ層 `audit_log` テーブル |
| 保管期限 | S3 Object Lock (governance, 6 年) for `audit/` `recordings/` |
| ネットワーク | プライベートサブネット、RDS パブリック禁止、VPC エンドポイント (S3/KMS/Secrets) |
| IAM | IAM Identity Center + MFA 必須、ブレークグラスを別保管 |
| アプリ層 | RLS、PHI 読み取り時の監査記録、テナント別 IP allowlist |
| 録音同意 | 「この通話は録音されます」を AI の最初の発話に強制 |

Phase 2 以降に追加: GuardDuty, Security Hub, Inspector, AWS Config 適合パック、ベンダー pen-test、ISMS 内部監査。

---

## 重要ファイル（最初に scaffold するもの）

すべて新規作成（既存ファイルなし）:

- `D:\AICallCenter2\infra\envs\dev\main.tf` — Terraform エントリ
- `D:\AICallCenter2\services\media-bridge\src\bridge\sip_server.py` — SIP 終端
- `D:\AICallCenter2\services\media-bridge\src\bridge\openai_realtime.py` — Realtime WS クライアント
- `D:\AICallCenter2\services\media-bridge\src\bridge\session_orchestrator.py` — 状態遷移ドライバ
- `D:\AICallCenter2\services\api\src\api\main.py` — FastAPI エントリ
- `D:\AICallCenter2\packages\shared-py\src\shared\scenario.py` — シナリオ DSL（Pydantic）
- `D:\AICallCenter2\web\admin\app\layout.tsx` — Next.js ルート
- `D:\AICallCenter2\docs\architecture.md` — 本プランの公式版

---

## 検証方法（end-to-end）

Phase 0 完了時:
1. `pwsh scripts/bootstrap-dev.ps1` → dev AWS 環境構築
2. `uv sync` → Python 依存解決
3. `pnpm install && pnpm dev` → 管理画面ローカル起動
4. dev DID に電話 → 固定プロンプトが再生される

Phase 1 完了時:
1. `pytest services/media-bridge/tests/` → 合成 RTP フィクスチャでブリッジ単体テスト
2. dev DID に電話 → AI が日本語で挨拶→診察予約受付→SMS 送信→「担当者におつなぎします」で人間転送
3. 管理画面 `/calls/{id}` で録音再生・文字起こし表示・ステータス更新
4. K6 で 10 同時セッションを 10 分維持して p95 レイテンシ計測

Phase 2 完了時:
1. テナント A/B で同じ電話番号枠を別契約、A の通話が B から SQL レベルで見えないことを確認
2. 非エンジニアロールでシナリオを編集→保存→新版を publish
3. K6 で 50 同時セッション 30 分

Phase 3 完了時:
1. 100 同時セッション 1 時間で SLA 内
2. AWS Config 適合パックで 3 省 2 ガイドラインのコントロールを「準拠」状態に

---

## 主要リスク 5 つ

1. **OpenAI Realtime の日本語品質（特に医療語彙）** — 敬語・フィラー・固有名詞でつまづく可能性。Phase 1 で 2 週間スパイクし、実クリニックで JA 品質を検証。劣化テナント向けに `Whisper JA → GPT-4o → Azure Neural TTS` のパイプライン版へホットスワップ可能なインタフェースを最初から定義する。

2. **Connect ↔ Chime Voice Connector の SIP 連携と国内 DID 取得** — `ap-northeast-1` での 050/0120 番号払い出しに遅延の前例あり。Phase 0 で 1 番号を end-to-end で実証してからアーキ確定。Twilio Japan を代替候補として持っておく。

3. **3 省 2 ガイドラインの監査エビデンス** — 委託先管理規程・監査ログ要件・暗号化方式の文書一式を Phase 3 まで放置すると営業サイクルが詰まる。Phase 1 と並行で `docs/compliance-3sho2.md` 一式をドラフト。

4. **録音 + 文字起こしの 6 年保管ストレージコスト** — 100 回線 × 平均 4 分 × 8h/日 × 250 日/年 × 6 年で TB 級。S3 のライフサイクル（Standard→IA 30d→Glacier IR 180d→Deep 1y）と Opus 16kbps エンコードを Phase 1 から導入。

5. **AI が医療助言をしてしまう法的リスク** — `「この薬飲んでいいですか」`に LLM が答えてしまう危険。State レベルの system_prompt で医療助言を明示的に禁止し、医療助言インテントを安価な GPT-4o-mini 分類器で検出して強制的に `transfer_to_human` へ遷移。利用契約に「本 AI は受付補助であり医療専門家ではない」と明記。

---

## 次のアクション（プラン承認後）

1. `git init` と `.gitignore` 作成
2. `uv` インストール確認 + `uv python pin` で py311env を固定
3. モノレポ scaffold を作成（pyproject.toml workspace, pnpm-workspace.yaml）
4. `infra/envs/dev/main.tf` で最小限の Terraform（VPC + RDS + Connect インスタンス）を書く
5. `services/api/src/api/main.py` で FastAPI hello-world
6. `web/admin` で `pnpm create next-app`
7. CI 2 本（Python lint+test, Web lint+build）を `.github/workflows/` に追加
8. README に開発手順を書く

ここまでが Phase 0 の Week 1 タスク。
