// server/src/handler.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
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
import { region } from "../../bin/singi-bot"

dayjs.extend(utc)
dayjs.extend(advancedFormat)

const nanoSecondFormat = "YYYY-MM-DDTHH:mm:ss.SSSSSSSSS[Z]"

const messagesTableName = process.env["MESSAGES_TABLE_NAME"] ?? ""
const threadTsIndexName = "threadTsIndex"

export interface SaveMessage {
  clientMsgId: string
  content: string
  threadTs: string
}

export type Message = Record<string, any>

export const saveMessage = async (
  ddbDocClient: DynamoDBDocumentClient,
  saveMessage: SaveMessage
) => {
  await ddbDocClient.send(
    new PutCommand({
      TableName: messagesTableName,
      Item: {
        id: `${saveMessage.clientMsgId}#user`,
        content: trimMention(saveMessage.content),
        threadTs: saveMessage.threadTs,
        saidAt: dayjs().format(nanoSecondFormat),
        role: "user",
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
  threadTs: string
): Promise<Record<string, any>[]> => {
  // 会話中ユーザのこれまでの発言履歴を取得する
  const { Items: messages = [] } = await ddbDocClient.send(
    new QueryCommand({
      TableName: messagesTableName,
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

export const delUnneseccaryMessages = async (ddbDocClient: DynamoDBDocumentClient,messages: Message[]) => {
  const orderedMessages = sortByTimeStamp(messages)
  const resentMessages = orderedMessages.splice(-10)
  await Promise.all(
    orderedMessages.map((message) =>
      ddbDocClient.send(
        new DeleteCommand({
          TableName: messagesTableName,
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
