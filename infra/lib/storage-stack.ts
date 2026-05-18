import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import { Bucket, BucketEncryption, ObjectOwnership, StorageClass } from 'aws-cdk-lib/aws-s3';
import { Key } from 'aws-cdk-lib/aws-kms';

interface Props extends StackProps {
  envName: string;
}

export class StorageStack extends Stack {
  readonly recordingsBucket: Bucket;
  readonly kmsKey: Key;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.kmsKey = new Key(this, 'PiiKey', {
      enableKeyRotation: true,
      alias: `alias/aicc2-${props.envName}-pii`,
      description: 'Encrypts recordings, transcripts, and Aurora data',
    });

    this.recordingsBucket = new Bucket(this, 'Recordings', {
      bucketName: `aicc2-${props.envName}-recordings-${this.account}`,
      encryption: BucketEncryption.KMS,
      encryptionKey: this.kmsKey,
      enforceSSL: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: true,
      lifecycleRules: [
        {
          id: 'tier-after-30d',
          enabled: true,
          transitions: [
            { storageClass: StorageClass.GLACIER, transitionAfter: Duration.days(30) },
          ],
          expiration: Duration.days(365 * 5 + 1),
        },
      ],
    });
  }
}
