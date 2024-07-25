// server/src/handler.ts
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import advancedFormat from "dayjs/plugin/advancedFormat"
import { orderBy } from "lodash-es"
import type { MessageDdbItem } from "./schema"

dayjs.extend(utc)
dayjs.extend(advancedFormat)

const nanoSecondFormat = "YYYY-MM-DDTHH:mm:ss.SSSSSSSSS[Z]"

const threadTsIndexName = "threadTsIndex"

export interface SaveMessage {
  clientMsgId: string
  content: string
  threadTs: string
}

export type Message = Record<string, any>

export const saveMessage = async (
  ddbDocClient: DynamoDBDocumentClient,
  tableName: string,
  saveMessage: SaveMessage,
  role: "user" | "system" | "assistant" = "user"
) => {
  return await ddbDocClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        id: `${saveMessage.clientMsgId}#${role}`,
        content: trimMention(saveMessage.content),
        threadTs: saveMessage.threadTs,
        saidAt: dayjs().format(nanoSecondFormat),
        role,
      } satisfies MessageDdbItem,
    })
  )
}

export const trimMention = (content: string) => {
  const mentionRegex = /<@.*?>/g
  return content.replaceAll(mentionRegex, "").trim()
}

export const getHistories = async (
  ddbDocClient: DynamoDBDocumentClient,
  tableName: string,
  threadTs: string
): Promise<Record<string, any>[]> => {
  // 会話中ユーザのこれまでの発言履歴を取得する
  const { Items: messages = [] } = await ddbDocClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: threadTsIndexName,
      KeyConditionExpression: "#threadTs = :threadTs",
      ExpressionAttributeNames: {
        "#threadTs": "threadTs",
      },
      ExpressionAttributeValues: {
        ":threadTs": threadTs,
      },
    })
  )
  return messages
}

export const delUnneseccaryMessages = async (
  ddbDocClient: DynamoDBDocumentClient,
  tableName: string,
  messages: Message[]
) => {
  const orderedMessages = sortByTimeStamp(messages)
  // 11件以上のメッセージがある場合は古いメッセージを削除する
  const resentMessages = orderedMessages.splice(-11)
  await Promise.all(
    orderedMessages.map((message) =>
      ddbDocClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            id: message["id"],
          },
        })
      )
    )
  )
  return resentMessages
}

export const sortByTimeStamp = (messages: Message[]) => {
  return orderBy(messages, "saidAt", "asc")
}
