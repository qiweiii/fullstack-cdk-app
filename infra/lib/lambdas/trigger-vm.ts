import { DynamoDBStreamEvent, DynamoDBStreamHandler } from "aws-lambda";
import {
  EC2Client,
  RunInstancesCommand,
  RunInstancesCommandInput,
  TerminateInstancesCommand,
  waitUntilInstanceStatusOk,
} from "@aws-sdk/client-ec2";
import {
  DescribeInstanceInformationCommand,
  DescribeInstanceInformationCommandOutput,
  SSMClient,
  SendCommandCommand,
  waitUntilCommandExecuted,
} from "@aws-sdk/client-ssm";

const handler: DynamoDBStreamHandler = async (event: DynamoDBStreamEvent) => {
  let ec2;
  let instanceId;
  try {
    // Create an EC2 instance
    ec2 = new EC2Client({ region: process.env.AWS_REGION });
    const instanceParams: RunInstancesCommandInput = {
      ImageId: process.env.AMI_ID,
      MinCount: 1,
      MaxCount: 1,
      KeyName: process.env.KEY_NAME,
      InstanceType: "t2.micro",
      IamInstanceProfile: {
        Arn: process.env.INSTANCE_PROFILE_ARN,
      },
      SecurityGroupIds: [process.env.SG_ID || ""],
      SubnetId: process.env.SUBNET_ID,
      UserData: Buffer.from(
        `
        #!/bin/bash
        # start ssm agent, for Amazon Linux 2023
        sudo systemctl enable amazon-ssm-agent
        sudo systemctl start amazon-ssm-agent
        `
      ).toString("base64"),
    };
    console.log("instanceParams:", instanceParams);
    const { Instances } = await ec2.send(
      new RunInstancesCommand(instanceParams)
    );
    instanceId = Instances?.[0].InstanceId;
    console.log(`Run instance command sent, instanceId: ${instanceId}`);
    await waitUntilInstanceStatusOk(
      { client: ec2, maxWaitTime: 480 },
      { InstanceIds: [instanceId || ""] }
    );
    console.log(`Successfully launched instance: ${instanceId}`);

    const ssm = new SSMClient({ region: process.env.AWS_REGION });
    // wait to make sure ssm is ready
    // https://stackoverflow.com/questions/72642852/ssm-is-not-available-after-instance-running-waiter-is-done
    for (let i = 0; i < 10; i++) {
      const res: DescribeInstanceInformationCommandOutput = await ssm.send(
        new DescribeInstanceInformationCommand({
          InstanceInformationFilterList: [
            { key: "InstanceIds", valueSet: [instanceId || ""] },
          ],
        })
      );
      console.log(`SSM describe instance info (loop ${i}):`, res);
      if (
        res.InstanceInformationList?.[0]?.PingStatus === "Online" &&
        res.InstanceInformationList?.[0]?.InstanceId === instanceId
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Run script in ec2 instance
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
      { client: ssm, maxWaitTime: 300, minDelay: 5 },
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
  } finally {
    await ec2!.send(
      new TerminateInstancesCommand({ InstanceIds: [instanceId || ""] })
    );
    console.log(`Instance terminated: ${instanceId}`);
  }
};

export { handler };
