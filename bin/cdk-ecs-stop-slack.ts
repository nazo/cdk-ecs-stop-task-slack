#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkEcsStopSlackStack } from '../lib/cdk-ecs-stop-slack-stack';

const app = new cdk.App();
new CdkEcsStopSlackStack(app, 'CdkEcsStopSlackStack');
