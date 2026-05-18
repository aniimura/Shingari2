import { App, Tags } from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack.js';
import { StorageStack } from '../lib/storage-stack.js';
import { DataStack } from '../lib/data-stack.js';
import { ConnectStack } from '../lib/connect-stack.js';
import { EcsStack } from '../lib/ecs-stack.js';
import { ToolRouterStack } from '../lib/tool-router-stack.js';
import { CognitoStack } from '../lib/cognito-stack.js';

const app = new App();
const envName = (app.node.tryGetContext('env') as string | undefined) ?? 'dev';
const env = { region: 'ap-northeast-1' };

const network = new NetworkStack(app, `aicc2-${envName}-network`, { env });
const storage = new StorageStack(app, `aicc2-${envName}-storage`, { env, envName });
const data = new DataStack(app, `aicc2-${envName}-data`, {
  env,
  envName,
  vpc: network.vpc,
});
const cognito = new CognitoStack(app, `aicc2-${envName}-cognito`, { env, envName });
const toolRouter = new ToolRouterStack(app, `aicc2-${envName}-tool-router`, {
  env,
  envName,
  vpc: network.vpc,
  dbSecret: data.dbSecret,
});
new EcsStack(app, `aicc2-${envName}-ecs`, {
  env,
  envName,
  vpc: network.vpc,
  recordingsBucket: storage.recordingsBucket,
  kmsKey: storage.kmsKey,
  toolRouterUrl: toolRouter.invokeUrl,
});
new ConnectStack(app, `aicc2-${envName}-connect`, { env, envName });

Tags.of(app).add('project', 'aicc2');
Tags.of(app).add('env', envName);
Tags.of(app).add('compliance', 'jp-medical-3sho2gl');
void cognito;
