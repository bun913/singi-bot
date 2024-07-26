# Welcome to AI Chatbot Sample Project

![Architecture](./Architecture.drawio.svg)

## Overview

This project is a sample project to demonstrate how to build a chatbot using AWS services. The chatbot is built using Amazon Bedrock and AWS Lambda.

In this project, we are using DynamoDB to store the past conversation history, so that the AI can provide context-appropriate responses. 

## Setup

* `cdk deploy SingiBot-ManuallyManagedResourceStack` 
* set slack token and slack signing secret in to SSM parameter store.
  * FIY: [Amazon BedrockとSlackで生成AIチャットボットアプリを作る (その2：Lambda＋API Gatewayで動かす) | DevelopersIO](https://dev.classmethod.jp/articles/amazon-bedrock-slack-chat-bot-part2/#%25E6%2589%258B%25E9%25A0%2586(1)%2520Slack%25E5%2581%25B4%25E3%2581%25AE%25E8%25A8%25AD%25E5%25AE%259A)
* `cdk deploy SingiBot-Stack`
