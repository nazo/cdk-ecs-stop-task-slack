import * as cdk from "@aws-cdk/core";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as logs from "@aws-cdk/aws-logs";
import * as iam from "@aws-cdk/aws-iam";
import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import * as lambda from "@aws-cdk/aws-lambda";
import { ScheduledFargateTask } from "@aws-cdk/aws-ecs-patterns";
import { Schedule } from "@aws-cdk/aws-events";

export class CdkEcsStopSlackStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "TheVPC", {
      cidr: "10.0.0.0/16"
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
    });

    const logGroup = new logs.LogGroup(this, "Log", {
    });

    const executionRole = new iam.Role(this, "EcsTaskExecutionRole", {
      roleName: "ecs-task-execution-role",
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")
      ],
      inlinePolicies: {
        cloudwatchlogs: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
              resources: [logGroup.logGroupArn],
            }),
          ]
        })
      }
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDef", {
      executionRole: executionRole,
    });
    taskDefinition.addContainer("DefaultContainer", {
      image: ecs.ContainerImage.fromRegistry("ubuntu"),
      command: ["/bin/tee", "--error"],
      memoryLimitMiB: 512,
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: "container-",
        logGroup,
      }),
    });
    taskDefinition.addContainer("DefaultContainer2", {
      image: ecs.ContainerImage.fromRegistry("ubuntu"),
      command: ["/bin/true"],
      memoryLimitMiB: 512,
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: "container-",
        logGroup,
      }),
    });

    new ScheduledFargateTask(this, "Schedule", {
      schedule: Schedule.cron({ minute: "*/10" }),
      cluster,
      desiredTaskCount: 1,
      scheduledFargateTaskDefinitionOptions: { taskDefinition },
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
      vpc,
    });

    const ecsToSlackRole = new iam.Role(this, "LambdaEcsToSlackRole", {
      roleName: "lambdaEcsToSlackRole",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
      ],
      inlinePolicies: {
        ecs: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["ecs:DescribeTaskDefinition"],
              resources: ["*"],
            }),
          ]
        })
      }
    });

    const ecsToSlack = new lambda.Function(this, "Handler", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("lambda"),
      role: ecsToSlackRole,
      handler: "index.handler",
      environment: {
        SLACK_ACCESS_TOKEN: process.env.SLACK_ACCESS_TOKEN!,
        SLACK_CHANNEL: process.env.SLACK_CHANNEL!,
      },
      timeout: cdk.Duration.seconds(900),
    });

    const rule = new events.Rule(this, "ECSStop", {
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Task State Change"],
        detail: {
          lastStatus: ["STOPPED"],
        }
      },
      targets: [
        new targets.LambdaFunction(ecsToSlack),
      ]
    });
  }
}
