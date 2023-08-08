import { DynamoDBStreamEvent, DynamoDBStreamHandler } from "aws-lambda";
import {
  EC2Client,
  RunInstancesCommand,
  RunInstancesCommandInput,
  TerminateInstancesCommand,
  waitUntilInstanceStatusOk,
} from "@aws-sdk/client-ec2";
import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";

const lambdaHandler: DynamoDBStreamHandler = async (
  event: DynamoDBStreamEvent
) => {
  try {
    // Create an EC2 instance
    const ec2 = new EC2Client({
      region: process.env.AWS_REGION,
    });
    const instanceParams: RunInstancesCommandInput = {
      ImageId: process.env.AMI_ID,
      InstanceType: "t2.micro",
      MinCount: 1,
      MaxCount: 1,
      KeyName: process.env.KEY_NAME,
      SubnetId: process.env.SUBNET_ID,
    };
    console.log("instanceParams:", instanceParams);
    const { Instances } = await ec2.send(
      new RunInstancesCommand(instanceParams)
    );

    if (Instances && Instances.length > 0) {
      const instanceId = Instances[0].InstanceId;
      await waitUntilInstanceStatusOk(
        { client: ec2, maxWaitTime: 300 },
        { InstanceIds: [instanceId || ""] }
      );
      console.log(`Successfully launched instance: ${instanceId}`);

      // Retrieve the script from S3
      // const s3Client = new S3Client({ region: process.env.AWS_REGION });
      // const getObjectCommand = new GetObjectCommand({
      //   Bucket: process.env.SCRIPT_BUCKET,
      //   Key: process.env.SCRIPT_KEY,
      // });
      // const response = await s3Client.send(getObjectCommand);
      // const chunk = await response.Body?.transformToByteArray();
      // if (!chunk) {
      //   throw new Error("Failed to retrieve script from S3");
      // }
      // const path = "/tmp-scripts/script.sh";
      // await appendFile(path, Buffer.from(chunk), "utf8");

      // Run script in ec2 instance
      const ssm = new SSMClient({ region: process.env.AWS_REGION });
      const command = new SendCommandCommand({
        InstanceIds: [instanceId || ""],
        DocumentName: process.env.SSM_DOCUMENT_NAME || "",
        TimeoutSeconds: 600,
        Parameters: {
          region: [process.env.AWS_REGION || ""],
          bucketName: [process.env.FILE_BUCKET || ""],
          id: [event.Records[0].dynamodb?.NewImage?.id.S || ""],
        },
      });
      await ssm.send(command);
      console.log(`Successfully sent command to instance: ${instanceId}`);

      // Terminate the EC2 instance
      await ec2.send(
        new TerminateInstancesCommand({ InstanceIds: [instanceId || ""] })
      );
      console.log(`Instance terminated: ${instanceId}`);
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};

export { lambdaHandler };