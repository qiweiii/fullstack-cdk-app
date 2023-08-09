import { DynamoDBStreamEvent, DynamoDBStreamHandler } from "aws-lambda";
import {
  EC2Client,
  RunInstancesCommand,
  RunInstancesCommandInput,
  TerminateInstancesCommand,
  waitUntilInstanceStatusOk,
} from "@aws-sdk/client-ec2";
import {
  SSMClient,
  SendCommandCommand,
  waitUntilCommandExecuted,
} from "@aws-sdk/client-ssm";

const handler: DynamoDBStreamHandler = async (event: DynamoDBStreamEvent) => {
  try {
    // Create an EC2 instance
    const ec2 = new EC2Client({
      region: process.env.AWS_REGION,
    });
    const instanceParams: RunInstancesCommandInput = {
      ImageId: process.env.AMI_ID,
      MinCount: 1,
      MaxCount: 1,
      KeyName: process.env.KEY_NAME,
      SubnetId: process.env.SUBNET_ID,
      IamInstanceProfile: {
        Arn: process.env.ROLE_ARN,
      },
    };
    console.log("instanceParams:", instanceParams);
    const { Instances } = await ec2.send(
      new RunInstancesCommand(instanceParams)
    );
    const instanceId = Instances?.[0].InstanceId;
    console.log(`Run instance command sent, instanceId: ${instanceId}`);
    await waitUntilInstanceStatusOk(
      { client: ec2, maxWaitTime: 300 },
      { InstanceIds: [instanceId || ""] }
    );
    console.log(`Successfully launched instance: ${instanceId}`);

    // Run script in ec2 instance
    const ssm = new SSMClient({ region: process.env.AWS_REGION });
    const command = new SendCommandCommand({
      InstanceIds: [instanceId || ""],
      DocumentName: process.env.SSM_DOCUMENT_NAME || "",
      TimeoutSeconds: 480,
      Parameters: {
        region: [process.env.AWS_REGION || ""],
        bucketName: [process.env.FILE_BUCKET || ""],
        id: [event.Records[0].dynamodb?.NewImage?.id.S || ""],
      },
    });
    const sentCommand = await ssm.send(command);
    console.log(`Successfully sent command to instance: ${sentCommand}`);
    const waitResult = await waitUntilCommandExecuted(
      { client: ssm, maxWaitTime: 480, minDelay: 5 },
      {
        CommandId: sentCommand.Command?.CommandId,
        InstanceId: instanceId || "",
      }
    );
    console.log(`Command execution finish: ${waitResult}`);

    // Terminate the EC2 instance
    await ec2.send(
      new TerminateInstancesCommand({ InstanceIds: [instanceId || ""] })
    );
    console.log(`Instance terminated: ${instanceId}`);
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};

export { handler };
