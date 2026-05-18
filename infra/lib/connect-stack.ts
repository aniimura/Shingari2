import { Stack, type StackProps, CfnOutput } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import { CfnInstance } from 'aws-cdk-lib/aws-connect';

interface Props extends StackProps {
  envName: string;
}

/**
 * Amazon Connect instance. Phone number claiming and Contact Flow import are
 * applied imperatively via `scripts/connect-bootstrap.ts` after the instance
 * is created — CloudFormation coverage for those is partial.
 */
export class ConnectStack extends Stack {
  readonly instance: CfnInstance;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.instance = new CfnInstance(this, 'Instance', {
      identityManagementType: 'CONNECT_MANAGED',
      instanceAlias: `aicc2-${props.envName}`,
      attributes: {
        inboundCalls: true,
        outboundCalls: true,
        contactflowLogs: true,
        contactLens: true,
      },
    });

    new CfnOutput(this, 'ConnectInstanceArn', { value: this.instance.attrArn });
  }
}
