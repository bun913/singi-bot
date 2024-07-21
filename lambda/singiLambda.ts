import { SQSEvent } from "aws-lambda";
import { SQS } from "aws-sdk";

export async function handler(event: SQSEvent, context: any): Promise<void> {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  try {
    console.log(now, ":今呼ばれました");
    console.log(JSON.stringify(event));
    // 本当ならここにメインの処理を書く
  } catch (error) {
    console.log(error);
  }
}