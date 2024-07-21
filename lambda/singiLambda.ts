import type { SQSEvent } from "aws-lambda"
import type { AppMentionEvent } from "@slack/bolt"
import { WebClient } from "@slack/web-api"

const token = process.env.SLACK_BOT_TOKEN || ""
const slackClient = new WebClient(token)

export async function handler(event: SQSEvent, context: any): Promise<void> {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
  try {
    const slackEventStr = event.Records[0].body
    const body = JSON.parse(slackEventStr) as any
    const slackEvent = body.event as AppMentionEvent
    const threadTs = slackEvent.thread_ts || slackEvent.ts;
    // スレッドに対して返信する
    const result = await slackClient.chat.postMessage({
      channel: slackEvent.channel,
      text: `審議却下といたしまする。出直して参られよ。`,
      thread_ts: threadTs
    })
  } catch (error) {
    console.log(error)
  }
}
