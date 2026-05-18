import { Stack, type StackProps, CfnOutput } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import {
  UserPool,
  AccountRecovery,
  Mfa,
  UserPoolClient,
  StringAttribute,
} from 'aws-cdk-lib/aws-cognito';

interface Props extends StackProps {
  envName: string;
}

export class CognitoStack extends Stack {
  readonly userPool: UserPool;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.userPool = new UserPool(this, 'AdminUserPool', {
      userPoolName: `aicc2-${props.envName}-admin`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      mfa: Mfa.REQUIRED,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      customAttributes: {
        tenant_id: new StringAttribute({ mutable: false }),
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
    });

    const client = new UserPoolClient(this, 'AdminClient', {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: { userPassword: true, userSrp: true },
    });

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'ClientId', { value: client.userPoolClientId });
  }
}
