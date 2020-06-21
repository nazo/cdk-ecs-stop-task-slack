const AWS = require('aws-sdk');
const https = require('https');
const qs = require('querystring');

function postToSlack(message) {
  return new Promise ((resolve, reject) => {
    const postData = qs.stringify(message);
    const req = https.request({
      hostname: 'slack.com',
      path: '/api/chat.postMessage',
      method: "POST",
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    });
    req.on('response', res => {
      resolve(res);
    });

    req.on('error', err => {
      reject(err);
    });
    req.write(postData);
    req.end();
  });
}

exports.handler = async function(event) {
  if (event.detail.containers.find((containerEvent) => containerEvent.exitCode != 0) === undefined) return;

  const region = event.region;
  AWS.config.update({region});
  const startedAt = event.detail.startedAt;
  const stoppedAt = event.detail.stoppedAt;
  const taskDefinitionArn = event.detail.taskDefinitionArn;
  const ecs = new AWS.ECS();
  const taskDefinition = await ecs.describeTaskDefinition({taskDefinition: taskDefinitionArn}).promise();
  const ecsCluster = event.detail.clusterArn.split("/")[1];
  const ecsTaskID = event.detail.taskArn.split("/")[1];
  const detailURL = `https://${region}.console.aws.amazon.com/ecs/home?region=${region}#/clusters/${ecsCluster}/tasks/${ecsTaskID}/details`;
  let text = `Task is STOPPED : ${taskDefinitionArn}\nRunning at: ${startedAt} - ${stoppedAt}\nDetail: ${detailURL}\n`;

  taskDefinition.taskDefinition.containerDefinitions.forEach((containerDefintion) => {
    const name = containerDefintion.name;
    const conatinerEvent = event.detail.containers.find((containerEvent) => containerEvent.name == name);
    const logDriver = containerDefintion.logConfiguration.logDriver;
    text = text + `\`\`\`\nContainer: ${name}\nExitCode: ${conatinerEvent.exitCode}\n`;
    if (logDriver == "awslogs") {
      const logGroup = containerDefintion.logConfiguration.options["awslogs-group"];
      const prefix = containerDefintion.logConfiguration.options["awslogs-stream-prefix"];
      const logStream = `${prefix}/${name}/${ecsTaskID}`;
      const LogURL = `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodeURIComponent(logGroup)}/log-events/${encodeURIComponent(logStream)}`;
      text = text + `LogURL: ${LogURL}\n`;
    }
    text = text + "```\n";
  });

  const message = {
    token: process.env.SLACK_ACCESS_TOKEN,
    channel: process.env.SLACK_CHANNEL,
    text: text
  };

  await postToSlack(message);
};
