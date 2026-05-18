import { Stack, type StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import { type Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  AuroraPostgresEngineVersion,
  DatabaseCluster,
  ClusterInstance,
  Credentials,
  DatabaseClusterEngine,
} from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

interface Props extends StackProps {
  envName: string;
  vpc: Vpc;
}

export class DataStack extends Stack {
  readonly dbSecret: Secret;
  readonly cluster: DatabaseCluster;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.dbSecret = new Secret(this, 'AuroraSecret', {
      secretName: `aicc2/${props.envName}/aurora`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'app' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    this.cluster = new DatabaseCluster(this, 'Aurora', {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_16_2,
      }),
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      credentials: Credentials.fromSecret(this.dbSecret),
      defaultDatabaseName: 'aicc2',
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      writer: ClusterInstance.serverlessV2('writer'),
      readers: [ClusterInstance.serverlessV2('reader-1', { scaleWithWriter: true })],
      backup: { retention: Duration.days(14) },
      iamAuthentication: true,
      storageEncrypted: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
    });
  }
}
