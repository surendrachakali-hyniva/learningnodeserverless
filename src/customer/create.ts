import { APIGatewayProxyHandler } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const data = JSON.parse(event.body || "{}");

    if (!data.name || !data.mobile || !data.city || !data.area || !data.zipcode) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing required fields" }),
      };
    }

    const customerId = uuidv4();
    const item = {
      customerId,
      name: data.name,
      mobile: data.mobile,
      address: {
        city: data.city,
        area: data.area,
        zipcode: data.zipcode,
      },
      createdDate: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: process.env.DYNAMODB_TABLE!,
        Item: item,
      })
    );

    return {
      statusCode: 201,
      body: JSON.stringify({ message: "Customer created", customerId }),
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
