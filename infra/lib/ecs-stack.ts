import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import { type Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDriver,
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { type Bucket } from 'aws-cdk-lib/aws-s3';
import { type Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

interface Props extends StackProps {
  envName: string;
  vpc: Vpc;
  recordingsBucket: Bucket;
  kmsKey: Key;
  toolRouterUrl: string;
}

export class EcsStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const cluster = new Cluster(this, 'Cluster', { vpc: props.vpc, containerInsights: true });

    const taskDef = new FargateTaskDefinition(this, 'BridgeTaskDef', {
      cpu: 1024,
      memoryLimitMiB: 2048,
    });

    props.recordingsBucket.grantPut(taskDef.taskRole);
    props.kmsKey.grantEncryptDecrypt(taskDef.taskRole);

    taskDef.addContainer('bridge', {
      // Image is built and pushed by CI; placeholder for synth-only.
      image: ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:20.11'),
      logging: LogDriver.awsLogs({
        streamPrefix: 'telephony-bridge',
        logGroup: new LogGroup(this, 'BridgeLogs', {
          retention: RetentionDays.ONE_MONTH,
        }),
      }),
      environment: {
        AWS_REGION: this.region,
        RECORDINGS_S3_BUCKET: props.recordingsBucket.bucketName,
        KMS_KEY_ARN: props.kmsKey.keyArn,
        TOOL_ROUTER_URL: props.toolRouterUrl,
      },
      portMappings: [{ containerPort: 8080 }],
    });

    const service = new FargateService(this, 'BridgeSvc', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: false,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      healthCheckGracePeriod: Duration.seconds(60),
    });

    const alb = new ApplicationLoadBalancer(this, 'BridgeAlb', {
      vpc: props.vpc,
      internetFacing: false,
    });
    const listener = alb.addListener('Http', { port: 80, open: true });
    listener.addTargets('Bridge', { port: 8080, targets: [service] });
  }
}
