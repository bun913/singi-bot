#!/usr/bin/env node
import "source-map-support/register"
import * as cdk from "aws-cdk-lib"
import {
  SingiBotStack,
  ManuallyManagedResourceStack,
} from "../lib/singi-bot-stack"

const app = new cdk.App()

new ManuallyManagedResourceStack(app, "SingiBot-ManuallyManagedResourceStack", {
  env: {
    region: "us-east-1",
  },
})

new SingiBotStack(app, "SingiBotStack", {
  env: {
    region: "us-east-1",
  },
})
