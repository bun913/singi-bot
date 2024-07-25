import type { SQSEvent } from "aws-lambda"
import type { AppMentionEvent } from "@slack/bolt"
import { WebClient } from "@slack/web-api"
import { BedrockRuntime } from "@aws-sdk/client-bedrock-runtime"
import { rulePrompt } from "./constants"
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

interface Message {
  role: string
  content: [
    {
      type: string
      text: string
    }
  ]
}

let token: string
let slackClient: WebClient
let bedrockClient: BedrockRuntime
const ddbDocClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: "us-east-1",
  })
)

const initialize = async () => {
  token = await getParameter(process.env.SLACK_BOT_TOKEN_PARAM || "")
  slackClient = new WebClient(token)
  bedrockClient = new BedrockRuntime({
    region: process.env.AWS_REGION || "us-east-1",
  })
}

export async function handler(event: SQSEvent, context: any): Promise<void> {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
  const slackEventStr = event.Records[0].body
  const body = JSON.parse(slackEventStr) as any
  const slackEvent = body.event as AppMentionEvent
  try {
    // 初期化
    await initialize()
    // イベントから必要な情報を取得
    const slackEventStr = event.Records[0].body
    const body = JSON.parse(slackEventStr) as any
    const slackEvent = body.event as AppMentionEvent
    const threadTs = slackEvent.thread_ts || slackEvent.ts

    // ユーザーの発言履歴を保存
    const tableName = process.env.MESSAGE_TABLE_NAME || ""
    const messages = await getHistories(ddbDocClient, tableName || "", threadTs)
    const restMessages = await delUnneseccaryMessages(
      ddbDocClient,
      tableName,
      messages
    )
    const sortMessages = sortByTimeStamp(restMessages)
    // メッセージの形に整形
    const formattedMessages = sortMessages.map((message): Message => {
      return {
        role: message.role as string,
        content: [
          {
            type: "text",
            text: message.content as string,
          },
        ],
      }
    })
    console.log(JSON.stringify(formattedMessages))

    // 厳正なる審議
    const judgeResult = await singi(bedrockClient, formattedMessages)
    // 審議結果を保存する
    const saveMessageContent: SaveMessage = {
      clientMsgId: slackEvent.client_msg_id || "",
      content: judgeResult,
      threadTs: threadTs,
    }
    await saveMessage(ddbDocClient, tableName, saveMessageContent, "assistant")

    // スレッドに対して返信する
    await slackClient.chat.postMessage({
      channel: slackEvent.channel,
      text: judgeResult,
      thread_ts: threadTs,
    })
  } catch (error) {
    await slackClient.chat.postMessage({
      channel: slackEvent.channel,
      text: `エラーが発生しました。申し訳ありませんが新しくスレッドを立ててくだされ`,
      thread_ts: slackEvent.thread_ts || slackEvent.ts,
    })
    console.log(error)
  }
}

export const singi = async (
  client: BedrockRuntime,
  messages: Message[]
): Promise<string> => {
  const res = await client.invokeModel({
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      temperature: 0.5,
      max_tokens: 5000,
      system: getSystemPrompt(),
      messages,
    }),
    accept: "application/json",
    contentType: "application/json",
  })

  const body = Buffer.from(res.body).toString("utf-8")
  const bodyObj = JSON.parse(body)
  return bodyObj.content[0].text
}

export const getSystemPrompt = (): string => {
  const rule = rulePrompt
  return rule
}
