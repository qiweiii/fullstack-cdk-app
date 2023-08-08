import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { nanoid } from "nanoid";

export async function lambdaHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const dynamodb = new DynamoDBClient({
      region: process.env.AWS_REGION,
    });
    const { input_text, input_file_path } = JSON.parse(event.body!);
    const id = nanoid();
    console.log("inputs:", input_text, input_file_path, id);

    const params = {
      TableName: process.env.TABLE_NAME,
      Item: {
        id: { S: id },
        input_text: { S: input_text },
        input_file_path: { S: input_file_path },
      },
    };

    const res = await dynamodb.send(new PutItemCommand(params));
    console.log(`Item saved to DynamoDB with id: ${id}. Result:`, res);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Item saved successfully", res }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error saving item to DynamoDB" }),
    };
  }
}
