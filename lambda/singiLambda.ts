import type { SQSEvent } from "aws-lambda"
import type { AppMentionEvent } from "@slack/bolt"
import { WebClient } from "@slack/web-api"
import { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime'
import { orderMessage, rulePrompt } from "./constants"
import { getParameter } from "./getSecret/getSecret"

let token: string
let slackClient: WebClient
let bedrockClient: BedrockRuntime

const initialize = async () => {
  token = await getParameter(process.env.SLACK_BOT_TOKEN_PARAM || "")
  slackClient = new WebClient(token)
  bedrockClient = new BedrockRuntime({
    region: process.env.AWS_REGION || "us-east-1",
  })
}

export async function handler(event: SQSEvent, context: any): Promise<void> {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
  try {
    // 初期化
    await initialize()
    // イベントから必要な情報を取得
    const slackEventStr = event.Records[0].body
    const body = JSON.parse(slackEventStr) as any
    const slackEvent = body.event as AppMentionEvent
    const threadTs = slackEvent.thread_ts || slackEvent.ts;
    
    // 厳正なる審議
    const judgeResult = await singi(bedrockClient, slackEvent.text)

    // スレッドに対して返信する
    const result = await slackClient.chat.postMessage({
      channel: slackEvent.channel,
      text: judgeResult,
      thread_ts: threadTs
    })
  } catch (error) {
    console.log(error)
  }
}

export const singi = async (
  client: BedrockRuntime,
  message: string
): Promise<string> => {
  const res = await client.invokeModel({
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      temperature: 0.5,
      max_tokens: 5000,
      system: getSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `<judgeTarget>${message}</judgeTarget>`
            }
          ]
        }
      ]
    }),
    accept: 'application/json',
    contentType: 'application/json'
  })

  const body = Buffer.from(res.body).toString('utf-8')
  const bodyObj = JSON.parse(body)
  return bodyObj.content[0].text
}

export const getSystemPrompt = (): string => {
  const rule = rulePrompt
  return `${rule}${orderMessage}`
}
