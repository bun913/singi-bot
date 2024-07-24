import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda"
import { SQS } from "@aws-sdk/client-sqs"
import { App, AwsLambdaReceiver } from "@slack/bolt"
import { Context, Callback } from "aws-lambda"
import { getParameter } from "./getSecret/getSecret"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { saveMessage, SaveMessage } from "./db/query"

const sqs = new SQS()
const queUrl = process.env.QUE_URL || ""
const tableName = process.env.MESSAGE_TABLE_NAME || ""

let awsLambdaReceiver: AwsLambdaReceiver | null = null
let app: App | null = null
const ddbDocClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: "us-east-1",
  })
)

const initializeApp = async () => {
  if (awsLambdaReceiver && app) {
    // 初期化が既に行われている場合は何もしない
    return
  }

  const slackBotToken = await getParameter(
    process.env.SLACK_BOT_TOKEN_PARAM || ""
  )
  const slackSigningSecret = await getParameter(
    process.env.SLACK_SIGNING_SECRET_PARAM || ""
  )

  awsLambdaReceiver = new AwsLambdaReceiver({
    signingSecret: slackSigningSecret,
  })

  app = new App({
    token: slackBotToken,
    receiver: awsLambdaReceiver,
  })

  app.event("app_mention", async ({ event, context, client, say }) => {
    try {
      // キューにメッセージを送信
      await sqs.sendMessage({
        QueueUrl: queUrl,
        MessageBody: JSON.stringify({ event }),
      })

      // スレッドの発言履歴を保存する
      const message: SaveMessage = {
        clientMsgId: event.client_msg_id || "",
        content: event.text,
        threadTs: event.thread_ts || event.ts,
      }
      await saveMessage(ddbDocClient, tableName, message)

      // リアクションをつけて考えていることを伝える
      await client.reactions.add({
        name: "+1",
        channel: event.channel,
        timestamp: event.ts,
      })
    } catch (error) {
      console.log(error)
      await say("エラーが発生しました")
    }
  })
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Callback
): Promise<APIGatewayProxyResultV2> => {
  try {
    await initializeApp()

    if (!awsLambdaReceiver) {
      throw new Error("AWS Lambda Receiver is not initialized")
    }

    const slackHandler = await awsLambdaReceiver.start()
    return slackHandler(event, context, callback)
  } catch (error) {
    console.error("Error handling Slack event:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    }
  }
}
