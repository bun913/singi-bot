import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda"
import { SQS } from "aws-sdk"
import { App, AwsLambdaReceiver } from "@slack/bolt"
import { Context, Callback } from "aws-lambda"

const sqs = new SQS()
const queUrl = process.env.QUE_URL || ""

const awsLambdaReciever = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET || "",
})

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReciever,
})

app.event("app_mention", async ({ event, context, client, say }) => {
  try {
    await sqs
      .sendMessage({
        QueueUrl: queUrl,
        MessageBody: JSON.stringify({
          event,
        }),
      })
      .promise()

    await say({
        text: "審議中・・・",
        thread_ts: event.ts
    })        
  } catch (error) {
    console.log(error)
    await say("エラーが発生しました")
  }
})

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Callback
): Promise<APIGatewayProxyResultV2> => {
  const handler = await awsLambdaReciever.start()
  return handler(event, context, callback)
}
