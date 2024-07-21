import * as path from "path"
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs"
import { Construct } from "constructs"
import { Runtime } from "aws-cdk-lib/aws-lambda"
import { Duration } from "aws-cdk-lib"
import { Queue } from "aws-cdk-lib/aws-sqs"
import { RetentionDays } from "aws-cdk-lib/aws-logs"
import { Commonparams } from "../../lib/singi-bot-stack"
import { StringParameter } from "aws-cdk-lib/aws-ssm"
import { HttpApi, HttpMethod, HttpStage } from "aws-cdk-lib/aws-apigatewayv2"
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations"

export class WebHandler {

    readonly prefix: string
    readonly construct: Construct
    readonly commonParams: Commonparams

    readonly inqueLambda: NodejsFunction
    readonly responseLambda: NodejsFunction
    readonly api: HttpApi
    readonly que: Queue

    constructor(prefix: string, construct: Construct, commonparams: Commonparams) {
        this.prefix = prefix
        this.construct = construct
        this.commonParams = commonparams

        this.que = this.createQue()
        this.inqueLambda = this.crearteInqueLambda(this.que)
        this.responseLambda = this.createResponseLambda(this.que)
        this.api = this.createGateway()
        this.grant()
    }
    
    private createQue() : Queue {
        return new Queue(this.construct, `${this.prefix}-que`, {
            queueName: `${this.prefix}-que`,
        })
    }
    
    private crearteInqueLambda(que: Queue): NodejsFunction {
        const funcName = `${this.prefix}-inque`
        const entry = path.join(process.cwd(), "lambda","inqueLambda.ts")
        // parameterStoreから値を取得する
        const slackSigninSecret = StringParameter.valueForStringParameter(this.construct, this.commonParams.slackSigninSecret)
        const slackBotToken = StringParameter.valueForStringParameter(this.construct, this.commonParams.slackBotToken)

        return new NodejsFunction(this.construct, funcName, {
            entry,
            functionName: funcName,
            runtime: Runtime.NODEJS_LATEST,
            timeout: Duration.seconds(10),
            environment: {
                QUE_URL: que.queueUrl,
                SLACK_BOT_TOKEN: slackBotToken,
                SLACK_SIGNING_SECRET: slackSigninSecret
            },
            logRetention: RetentionDays.ONE_DAY
        })
    }
    
    private createResponseLambda(que: Queue): NodejsFunction {
        const funcName = `${this.prefix}-response`
        const entry = path.join(process.cwd(), "lambda","singiLambda.ts")

        // parameterStoreから値を取得する
        const slackBotToken = StringParameter.valueForStringParameter(this.construct, this.commonParams.slackBotToken)

        const func =  new NodejsFunction(this.construct, funcName, {
            entry,
            functionName: funcName,
            runtime: Runtime.NODEJS_LATEST,
            timeout: Duration.seconds(10),
            logRetention: RetentionDays.ONE_DAY,
            environment: {
                SLACK_BOT_TOKEN: slackBotToken,
            },
        })
        
        func.addEventSourceMapping("SqsEventSource", {
            eventSourceArn: que.queueArn,
        })
        
        return func
    }
    
    private createGateway(): HttpApi {
        const httpLambdaIntegRation = new HttpLambdaIntegration(`${this.prefix}-integ`, this.inqueLambda)
        const api =  new HttpApi(this.construct, `${this.prefix}-gateway`, {
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
        this.que.grantConsumeMessages(this.responseLambda)
        this.que.grantSendMessages(this.inqueLambda)
    }
    
}