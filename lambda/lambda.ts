import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda"
import { App, AwsLambdaReceiver } from "@slack/bolt"
import { Context, Callback } from "aws-lambda"
import { getParameter } from "./getSecret/getSecret"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
  delUnneseccaryMessages,
  getHistories,
  saveMessage,
  SaveMessage,
  sortByTimeStamp,
} from "./db/query"
import { BedrockRuntime } from "@aws-sdk/client-bedrock-runtime"
import { Message } from "./aiChat/singi"
import { singi } from "./aiChat/singi"

const tableName = process.env.MESSAGE_TABLE_NAME || ""

let awsLambdaReceiver: AwsLambdaReceiver | null = null
let app: App | null = null
const ddbDocClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: "us-east-1",
  })
)
const bedrockClient = new BedrockRuntime({
  region: process.env.AWS_REGION || "us-east-1",
})

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

  app.event("app_mention", async ({ event, logger, context, client, say }) => {
    const limitedUser = process.env.LIMITED_USER || ""
    const limitedChannel = process.env.LIMITED_CHANNEL || ""
    const threadTs = event.thread_ts || event.ts

    // Output Access Log
    await logger.info({
      type: "access",
      user: event.user || "",
      text: event.text,
      channel: event.channel,
      msgId: event.client_msg_id || "",
      threadTs,
    })

    // if user is limited
    if (limitedUser && limitedUser !== event.user) {
      await logger.info({
        type: "limitedUserAccess",
        user: event.user || "",
        channel: event.channel,
      })
      await say({
        text: "Sorry, user is limited. I can't respond to you.",
        thread_ts: event.ts,
      })
      return
    }

    // if channel is limited
    if (limitedChannel && limitedChannel !== event.channel) {
      await logger.info({
        type: "limitedChannelAccess",
        user: event.user || "",
        channel: event.channel,
      })
      await say({
        text: "Sorry, channel is limited. I can't respond to you.",
        thread_ts: event.ts,
      })
      return
    }

    const message: SaveMessage = {
      clientMsgId: event.client_msg_id || "",
      content: event.text,
      threadTs,
    }
    try {
      // Check for retry attempts
      if (context.retryNum != null && context.retryReason === "http_timeout") {
        await logger.info({
          message: "Ignoring retry due to Slack timeout",
        })
        return
      }

      // Reponse once to the user
      const saidMessage = await say({
        text: "うむ、我が主よ。しばし待たれよ。",
        thread_ts: threadTs,
      })

      // Save message history
      try {
        await saveMessage(ddbDocClient, tableName, message, "user")
        await logger.info({
          message: "User message saved successfully",
          type: "saveUserMessage",
        })
      } catch (error) {
        await logger.error({
          message: "Error saving user message",
          error,
          type: "saveUserMessage",
        })
        throw error
      }

      // Retrieve message history
      let messages
      try {
        messages = await getHistories(ddbDocClient, tableName, threadTs)
        await logger.info({
          message: "Retrieved message history",
          type: "getHistory",
        })
      } catch (error) {
        await logger.error({
          message: "Error retrieving message history",
          error,
          type: "getHistory",
        })
        throw error
      }

      // Clean unnecessary messages
      let restMessages
      try {
        restMessages = await delUnneseccaryMessages(
          ddbDocClient,
          tableName,
          messages
        )
        await logger.info({
          message: "Cleaned unnecessary messages",
          type: "delMessage",
        })
      } catch (error) {
        await logger.error({
          message: "Error cleaning unnecessary messages",
          error,
          type: "delMessage",
        })
        throw error
      }

      // Format messages for AI
      let formattedMessages
      try {
        const sortMessages = sortByTimeStamp(restMessages)
        formattedMessages = sortMessages.map(
          (message): Message => ({
            role: message.role as string,
            content: [
              {
                type: "text",
                text: message.content as string,
              },
            ],
          })
        )
        await logger.info({
          message: "Messages formatted for AI",
          type: "formatMessages",
        })
      } catch (error) {
        await logger.error({
          message: "Error formatting messages for AI",
          error,
          type: "formatMessages",
        })
        throw error
      }

      // Send messages to AI
      let judgeResult
      try {
        judgeResult = await singi(bedrockClient, formattedMessages)
        await logger.info({
          message: "Received AI response",
          type: "AIResponse",
        })
      } catch (error) {
        await logger.error({
          message: "Error in AI processing",
          error,
          type: "AIResponse",
        })
        throw error
      }

      // Save AI response
      try {
        const saveMessageContent: SaveMessage = {
          clientMsgId: event.client_msg_id || "",
          content: judgeResult,
          threadTs,
        }
        await saveMessage(
          ddbDocClient,
          tableName,
          saveMessageContent,
          "assistant"
        )
        await logger.info({
          message: "AI response saved successfully",
          type: "saveAIResponse",
        })
      } catch (error) {
        await logger.error({
          message: "Error saving AI response",
          error,
          type: "saveAIResponse",
        })
        throw error
      }

      // Respond in thread
      try {
        // Edit the response
        await client.chat.update({
          channel: event.channel,
          ts: saidMessage.ts || "",
          text: judgeResult,
        })
        await logger.info({
          message: "Responded to thread with AI response",
          type: "editChatMessage",
        })
      } catch (error) {
        await logger.error({
          message: "Error responding in thread",
          error,
          type: "editChatMessage",
        })
        throw error
      }
    } catch (error) {
      await logger.error({
        message: "An error occurred during message processing",
        error,
      })
      try {
        await client.chat.postMessage({
          channel: event.channel,
          text: "An error occurred. Please start a new thread.",
          thread_ts: threadTs,
        })
      } catch (saveError) {
        await logger.error({
          message: "Error saving error message or responding in thread",
          saveError,
        })
      }
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
