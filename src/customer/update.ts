import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

function validateCustomer(body: any): string[] {
  const missing: string[] = [];
  if (!body.name || typeof body.name !== 'string') missing.push('name');
  if (!body.age || typeof body.age !== 'number') missing.push('age (must be a number)');
  if (!body.mobileNumber || typeof body.mobileNumber !== 'string') missing.push('mobileNumber');
  return missing;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const customerId = event.pathParameters?.customerId;
    if (!customerId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing customerId in path" }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const missingFields = validateCustomer(body);

    if (missingFields.length > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Validation failed for customer',
          missingFields,
        }),
      };
    }

    const updateCommand = new UpdateItemCommand({
      TableName: process.env.DYNAMODB_CUSTOMERS_TABLE!,
      Key: {
        customerId: { S: customerId },
      },
      UpdateExpression: 'SET #name = :name, #age = :age, #mobile = :mobile',
      ExpressionAttributeNames: {
        '#name': 'name',
        '#age': 'age',
        '#mobile': 'mobileNumber',
      },
      ExpressionAttributeValues: {
        ':name': { S: body.name },
        ':age': { N: body.age.toString() },
        ':mobile': { S: body.mobileNumber },
      },
      ReturnValues: 'UPDATED_NEW',
    });

    const result = await client.send(updateCommand);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Customer updated successfully',
        customerId,
        updatedFields: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error updating customer:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};
