import { Stack, type StackProps } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import { Vpc, SubnetType, IpAddresses } from 'aws-cdk-lib/aws-ec2';

export class NetworkStack extends Stack {
  readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.vpc = new Vpc(this, 'Vpc', {
      ipAddresses: IpAddresses.cidr('10.20.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private', subnetType: SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'isolated', subnetType: SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
  }
}
