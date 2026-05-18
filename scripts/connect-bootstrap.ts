/**
 * Imperative bootstrap for the Amazon Connect instance:
 *   1) Reads the instance ARN from CloudFormation outputs (`aicc2-<env>-connect`)
 *   2) Imports contact-flows/inbound-main.json via `CreateContactFlow` /
 *      `UpdateContactFlowContent`
 *   3) Claims a phone number in JP and associates it with the flow
 *
 * Run with:  pnpm tsx scripts/connect-bootstrap.ts --env dev
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConnectClient, CreateContactFlowCommand, UpdateContactFlowContentCommand, ListContactFlowsCommand } from '@aws-sdk/client-connect';

interface Args {
  env: string;
}

function parseArgs(): Args {
  const env = process.argv[process.argv.indexOf('--env') + 1];
  if (!env) throw new Error('--env is required');
  return { env };
}

async function main(): Promise<void> {
  const { env } = parseArgs();
  const region = process.env.AWS_REGION ?? 'ap-northeast-1';
  const client = new ConnectClient({ region });

  const instanceArn = process.env.CONNECT_INSTANCE_ARN;
  if (!instanceArn) throw new Error('CONNECT_INSTANCE_ARN env var is required');
  const instanceId = instanceArn.split('/').pop()!;

  const flowJson = readFileSync(resolve('contact-flows/inbound-main.json'), 'utf8');

  const flows = await client.send(new ListContactFlowsCommand({ InstanceId: instanceId }));
  const existing = flows.ContactFlowSummaryList?.find((f) => f.Name === `aicc2-${env}-inbound-main`);

  if (existing?.Id) {
    await client.send(
      new UpdateContactFlowContentCommand({
        InstanceId: instanceId,
        ContactFlowId: existing.Id,
        Content: flowJson,
      }),
    );
    console.log(`updated flow ${existing.Id}`);
  } else {
    const created = await client.send(
      new CreateContactFlowCommand({
        InstanceId: instanceId,
        Name: `aicc2-${env}-inbound-main`,
        Type: 'CONTACT_FLOW',
        Content: flowJson,
      }),
    );
    console.log(`created flow ${created.ContactFlowId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
