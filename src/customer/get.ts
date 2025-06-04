import { APIGatewayProxyHandler } from "aws-lambda";
import {
  DynamoDBClient,
  GetItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});

export const handler: APIGatewayProxyHandler = async (event) => {
  const customerId = event.pathParameters?.customerId;

  if (!customerId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Missing customerId in path" }),
    };
  }

  try {
    // 1. Get Customer Info
    const getCustomerCmd = new GetItemCommand({
      TableName: process.env.DYNAMODB_CUSTOMERS_TABLE!,
      Key: {
        customerId: { S: customerId },
      },
    });

    const customerData = await client.send(getCustomerCmd);

    if (!customerData.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Customer not found" }),
      };
    }

    // 2. Scan Addresses Table for customerId
    const addressScanCmd = new ScanCommand({
      TableName: process.env.DYNAMODB_ADDRESSES_TABLE!,
      FilterExpression: "customerId = :cid",
      ExpressionAttributeValues: {
        ":cid": { S: customerId }, // ✅ Correct value from path parameter
      },
    });

    const addressResult = await client.send(addressScanCmd);

    const addresses = addressResult.Items?.map((addr) => unmarshall(addr)) || [];

    // 3. Format response
    const customer = {
      customerId: customerData.Item.customerId.S,
      name: customerData.Item.name.S,
      age: Number(customerData.Item.age.N),
      mobileNumber: customerData.Item.mobileNumber.S,
      addresses: addresses,
    };

    return {
      statusCode: 200,
      body: JSON.stringify(customer),
    };
  } catch (err) {
    console.error("Error fetching customer:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
