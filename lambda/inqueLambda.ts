import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { SQS } from "aws-sdk";
import { App, AwsLambdaReceiver } from "@slack/bolt";
import { Context, Callback } from "aws-lambda";
import { getParameter } from "./getSecret/getSecret";

const sqs = new SQS();
const queUrl = process.env.QUE_URL || "";

let awsLambdaReceiver: AwsLambdaReceiver | null = null;
let app: App | null = null;

const initializeApp = async () => {
  if (awsLambdaReceiver && app) {
    // 初期化が既に行われている場合は何もしない
    return;
  }

  const slackBotToken = await getParameter(process.env.SLACK_BOT_TOKEN_PARAM || "");
  const slackSigningSecret = await getParameter(process.env.SLACK_SIGNING_SECRET_PARAM || "");

  awsLambdaReceiver = new AwsLambdaReceiver({
    signingSecret: slackSigningSecret,
  });

  app = new App({
    token: slackBotToken,
    receiver: awsLambdaReceiver,
  });

  app.event("app_mention", async ({ event, context, client, say }) => {
    try {
      await sqs.sendMessage({
        QueueUrl: queUrl,
        MessageBody: JSON.stringify({ event }),
      }).promise();

      await say({
        text: "審議中・・・",
        thread_ts: event.ts,
      });
    } catch (error) {
      console.log(error);
      await say("エラーが発生しました");
    }
  });
};

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Callback
): Promise<APIGatewayProxyResultV2> => {
  try {
    await initializeApp();

    if (!awsLambdaReceiver) {
      throw new Error("AWS Lambda Receiver is not initialized");
    }

    const slackHandler = await awsLambdaReceiver.start();
    return slackHandler(event, context, callback);
  } catch (error) {
    console.error("Error handling Slack event:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};