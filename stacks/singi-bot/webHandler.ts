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
import { Queue } from "aws-cdk-lib/aws-sqs"
import { RetentionDays } from "aws-cdk-lib/aws-logs"
import { Commonparams } from "../../lib/singi-bot-stack"
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2"
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations"
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam"
import { StringParameter } from "aws-cdk-lib/aws-ssm"
import { ITable, Table } from "aws-cdk-lib/aws-dynamodb"

export class WebHandler {
  readonly prefix: string
  readonly construct: Construct
  readonly commonParams: Commonparams

  readonly lamdaExtension: ParamsAndSecretsLayerVersion
  readonly messageTable: ITable
  readonly inqueLambda: NodejsFunction
  readonly responseLambda: NodejsFunction
  readonly api: HttpApi
  readonly que: Queue

  constructor(
    prefix: string,
    construct: Construct,
    commonparams: Commonparams
  ) {
    this.prefix = prefix
    this.construct = construct
    this.commonParams = commonparams

    this.que = this.createQue()
    this.lamdaExtension = this.getLambdaExtension()
    this.messageTable = this.getDynamoDBTable()
    this.inqueLambda = this.crearteInqueLambda()
    this.responseLambda = this.createResponseLambda()
    this.api = this.createGateway()
    this.grant()
  }

  private createQue(): Queue {
    return new Queue(this.construct, `${this.prefix}-que`, {
      queueName: `${this.prefix}-que`,
    })
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

  private getDynamoDBTable(): ITable {
    return Table.fromTableName(
      this.construct,
      "messagesTable",
      this.commonParams.messageTableName
    )
  }

  private crearteInqueLambda(): NodejsFunction {
    const funcName = `${this.prefix}-inque`
    const entry = path.join(process.cwd(), "lambda", "inqueLambda.ts")

    return new NodejsFunction(this.construct, funcName, {
      entry,
      functionName: funcName,
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(10),
      environment: {
        QUE_URL: this.que.queueUrl,
        SLACK_BOT_TOKEN_PARAM: this.commonParams.slackBotToken,
        SLACK_SIGNING_SECRET_PARAM: this.commonParams.slackSigninSecret,
      },
      paramsAndSecrets: this.lamdaExtension,
      // TODO: log保存期間と保存場所を変更する
      logRetention: RetentionDays.ONE_DAY,
    })
  }

  private createResponseLambda(): NodejsFunction {
    const funcName = `${this.prefix}-response`
    const entry = path.join(process.cwd(), "lambda", "singiLambda.ts")

    const func = new NodejsFunction(this.construct, funcName, {
      entry,
      functionName: funcName,
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(10),
      // TODO: log保存期間と保存場所を変更する
      logRetention: RetentionDays.ONE_DAY,
      environment: {
        SLACK_BOT_TOKEN_PARAM: this.commonParams.slackBotToken,
        SLACK_SIGNING_SECRET_PARAM: this.commonParams.slackSigninSecret,
      },
      paramsAndSecrets: this.lamdaExtension,
    })

    func.addEventSourceMapping("SqsEventSource", {
      eventSourceArn: this.que.queueArn,
    })

    return func
  }

  private createGateway(): HttpApi {
    const httpLambdaIntegRation = new HttpLambdaIntegration(
      `${this.prefix}-integ`,
      this.inqueLambda
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
    // Lambda <=> Que間の権限を付与
    this.que.grantConsumeMessages(this.responseLambda)
    this.que.grantSendMessages(this.inqueLambda)
    // BedrockRuntimeのinvokeModelを呼び出すための権限を付与
    const policy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["bedrock:InvokeModel"],
      resources: ["*"],
    })
    this.responseLambda.addToRolePolicy(policy)
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
    

    slackSigninSecretParam.grantRead(this.inqueLambda)
    slackBotTokenParam.grantRead(this.inqueLambda)
    slackBotTokenParam.grantRead(this.responseLambda)
    
    this.messageTable.grantReadWriteData(this.inqueLambda)
    this.messageTable.grantReadData(this.responseLambda)

  }
}
