import { BedrockRuntime } from "@aws-sdk/client-bedrock-runtime"
import { rulePrompt } from "../constants"

export interface Message {
  role: string
  content: [
    {
      type: string
      text: string
    }
  ]
}

export const singi = async (
  client: BedrockRuntime,
  messages: Message[]
): Promise<string> => {
  console.log(JSON.stringify(messages))
  const res = await client.invokeModel({
    modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
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
  console.log(bodyObj)
  return bodyObj.content[0].text
}

export const getSystemPrompt = (): string => {
  const rule = rulePrompt
  return rule
}
