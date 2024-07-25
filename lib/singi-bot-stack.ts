import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WebHandler } from '../stacks/singi-bot/webHandler';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { TableEncryptionV2 } from 'aws-cdk-lib/aws-dynamodb';

const commonParams = {
  slackSigninSecret: "/singi-bot/slackSigninSecret",
  slackBotToken: "/singi-bot/slackBotToken",
  dummyString: "dummy",
  messageTableName: "slackChatGptBotNode-messages",
}

export type Commonparams = typeof commonParams

export class ManuallyManagedResourceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // Create Parameter Store and manage it manually
    const slackSigninSecret = new StringParameter(this, "slackSigninSecret", {
      parameterName: commonParams.slackSigninSecret,
      stringValue: commonParams.dummyString,
    })
    
    // Create Parameter Store and manage it manually
    const slackBotToken = new StringParameter(this, "slackBotToken", {
      parameterName: commonParams.slackBotToken,
      stringValue: commonParams.dummyString
    })
    
    // Create DynamoDB
    const messagesTable = new cdk.aws_dynamodb.TableV2(this, "messagesTable", {
      tableName: commonParams.messageTableName,
      partitionKey: {
        name: "id",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      // TODO: 本番環境ではDESTROYを使わない
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: TableEncryptionV2.awsManagedKey()
    });

    messagesTable.addGlobalSecondaryIndex({
      indexName: "threadTsIndex",
      partitionKey: {
        name: "threadTs",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
    });
  }
}

export class SingiBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const webHandler = new WebHandler("singi-bot", this, commonParams)
  }
}
