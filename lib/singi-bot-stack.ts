import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WebHandler } from '../stacks/singi-bot/webHandler';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

const commonParams = {
  slackSigninSecret: "/singi-bot/slackSigninSecret",
  slackBotToken: "/singi-bot/slackBotToken",
  dummyString: "dummy"
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
  }
}

export class SingiBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const webHandler = new WebHandler("singi-bot", this, commonParams)
  }
}
