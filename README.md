# AICallCenter2

医療機関向け AI 電話 SaaS。Dr.JOY「AIコール」相当の機能セットを、OpenAI Realtime API + Amazon Connect で実装する。

## 構成
- `apps/telephony-bridge` — Amazon Connect の KVS 顧客音声を OpenAI Realtime API へブリッジする Node.js サービス (ECS Fargate)
- `apps/tool-router` — Realtime からの function_call を裁く Lambda 群 (予約 / キャンセル / 空き照会 / ハンドオフ / FAQ)
- `apps/admin-web` — 通話一覧・抽出情報・録音再生の管理画面 (Next.js)
- `apps/patient-form` — SMS 短縮 URL の着地ページ (予約確認・キャンセル)
- `packages/shared` — zod ベースのツール定義 (Realtime 登録用 JSON Schema 生成)
- `packages/db` — Prisma スキーマ
- `packages/prompts` — 業態別プロンプト & ヒアリング項目 (YAML)
- `infra` — AWS CDK (VPC / Aurora / S3+KMS / ECS / API Gateway+Lambda / Cognito / Connect)
- `contact-flows/inbound-main.json` — Amazon Connect の受電フロー

詳細プランは `/root/.claude/plans/system-reminder-you-re-running-in-tender-harbor.md` を参照。

## セットアップ

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env
pnpm --filter @aicc2/db prisma:generate
pnpm -w typecheck
```

開発時は `pnpm --filter @aicc2/telephony-bridge dev` で bridge をローカル起動できる (OpenAI API キーと AWS 認証情報が必要)。
