#!/usr/bin/env node
import "source-map-support/register"
import * as cdk from "aws-cdk-lib"
import {
  SingiBotStack,
  ManuallyManagedResourceStack,
} from "../lib/singi-bot-stack"

const app = new cdk.App()

export const region = "us-east-1"

new ManuallyManagedResourceStack(app, "SingiBot-ManuallyManagedResourceStack", {
  env: {
    region
  },
})

new SingiBotStack(app, "SingiBotStack", {
  env: {
    region
  },
})
