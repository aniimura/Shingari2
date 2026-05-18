import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import { type Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Runtime, Code, Function as LambdaFunction, Architecture } from 'aws-cdk-lib/aws-lambda';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { type Secret } from 'aws-cdk-lib/aws-secretsmanager';

interface Props extends StackProps {
  envName: string;
  vpc: Vpc;
  dbSecret: Secret;
}

const HANDLERS = [
  { name: 'lookup_slot', file: 'lookup_slot.js' },
  { name: 'book_appointment', file: 'book.js' },
  { name: 'cancel_appointment', file: 'cancel.js' },
  { name: 'faq_lookup', file: 'faq.js' },
  { name: 'handoff_to_staff', file: 'handoff.js' },
] as const;

export class ToolRouterStack extends Stack {
  readonly invokeUrl: string;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const api = new HttpApi(this, 'ToolRouterApi', {
      apiName: `aicc2-${props.envName}-tool-router`,
    });

    for (const h of HANDLERS) {
      const fn = new LambdaFunction(this, `Fn-${h.name}`, {
        functionName: `aicc2-${props.envName}-tool-${h.name}`,
        runtime: Runtime.NODEJS_20_X,
        architecture: Architecture.ARM_64,
        // Code is built into apps/tool-router/dist by CI; for synth we point
        // at an empty placeholder.
        code: Code.fromInline(`exports.handler = async () => ({ statusCode: 501 });`),
        handler: `handlers/${h.file.replace('.js', '')}.handler`,
        memorySize: 512,
        timeout: Duration.seconds(15),
        environment: {
          DB_SECRET_ARN: props.dbSecret.secretArn,
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        },
        vpc: props.vpc,
        vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      });

      props.dbSecret.grantRead(fn);
      api.addRoutes({
        path: `/${h.name}`,
        methods: [HttpMethod.POST],
        integration: new HttpLambdaIntegration(`Int-${h.name}`, fn),
      });
    }

    this.invokeUrl = api.apiEndpoint;
  }
}
