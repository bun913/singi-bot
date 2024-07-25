import * as path from "path"
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs"
import { Construct } from "constructs"
import {
  ParamsAndSecretsLayerVersion,
  ParamsAndSecretsLogLevel,
  ParamsAndSecretsVersions,
  Runtime,
} from "aws-cdk-lib/aws-lambda"
import { Duration } from "aws-cdk-lib"
import { RetentionDays } from "aws-cdk-lib/aws-logs"
import { Commonparams } from "../../lib/singi-bot-stack"
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2"
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations"
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam"
import { StringParameter } from "aws-cdk-lib/aws-ssm"
import { ITable, ITableV2, TableV2 } from "aws-cdk-lib/aws-dynamodb"

export class WebHandler {
  readonly prefix: string
  readonly construct: Construct
  readonly commonParams: Commonparams

  readonly lamdaExtension: ParamsAndSecretsLayerVersion
  readonly messageTable: ITable
  readonly lambdaFunc: NodejsFunction
  readonly api: HttpApi

  constructor(
    prefix: string,
    construct: Construct,
    commonparams: Commonparams
  ) {
    this.prefix = prefix
    this.construct = construct
    this.commonParams = commonparams

    this.lamdaExtension = this.getLambdaExtension()
    this.messageTable = this.getDynamoDBTable()
    this.lambdaFunc = this.crearteLambda()
    this.api = this.createGateway()
    this.grant()
  }

  private getLambdaExtension(): ParamsAndSecretsLayerVersion {
    return ParamsAndSecretsLayerVersion.fromVersion(
      ParamsAndSecretsVersions.V1_0_103,
      {
        cacheSize: 500,
        logLevel: ParamsAndSecretsLogLevel.INFO,
      }
    )
  }

  private getDynamoDBTable(): ITableV2 {
    return TableV2.fromTableName(
      this.construct,
      "messagesTable",
      this.commonParams.messageTableName
    )
  }

  private crearteLambda(): NodejsFunction {
    const funcName = `${this.prefix}-inque`
    const entry = path.join(process.cwd(), "lambda", "lambda.ts")

    return new NodejsFunction(this.construct, funcName, {
      entry,
      functionName: funcName,
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(10),
      memorySize: 2056,
      environment: {
        SLACK_BOT_TOKEN_PARAM: this.commonParams.slackBotToken,
        SLACK_SIGNING_SECRET_PARAM: this.commonParams.slackSigninSecret,
        MESSAGE_TABLE_NAME: this.commonParams.messageTableName,
      },
      paramsAndSecrets: this.lamdaExtension,
      // TODO: log保存期間と保存場所を変更する
      logRetention: RetentionDays.ONE_DAY,
    })
  }

  private createGateway(): HttpApi {
    const httpLambdaIntegRation = new HttpLambdaIntegration(
      `${this.prefix}-integ`,
      this.lambdaFunc
    )
    const api = new HttpApi(this.construct, `${this.prefix}-gateway`, {
      apiName: `${this.prefix}-gateway`,
      createDefaultStage: true,
    })
    api.addRoutes({
      path: "/slack/singi",
      methods: [HttpMethod.POST],
      integration: httpLambdaIntegRation,
    })
    return api
  }

  private grant() {
    // BedrockRuntimeのinvokeModelを呼び出すための権限を付与
    const policy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["bedrock:InvokeModel"],
      resources: ["*"],
    })
    this.lambdaFunc.addToRolePolicy(policy)
    // Lambdaに SSM ParameterStoreへのアクセス権限を付与
    const slackSigninSecretParam =
      StringParameter.fromStringParameterAttributes(
        this.construct,
        "slackSigninSecretParam",
        {
          parameterName: this.commonParams.slackSigninSecret,
        }
      )
    const slackBotTokenParam = StringParameter.fromStringParameterAttributes(
      this.construct,
      "slackBotTokenParam",
      {
        parameterName: this.commonParams.slackBotToken,
      }
    )
    

    slackSigninSecretParam.grantRead(this.lambdaFunc)
    slackBotTokenParam.grantRead(this.lambdaFunc)
    
    this.messageTable.grantReadWriteData(this.lambdaFunc)
    const indexPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["dynamodb:Query"],
      resources: [
        `${this.messageTable.tableArn}/index/*`,
      ],
    });
    
    this.lambdaFunc.addToRolePolicy(indexPolicy);
  }
}
