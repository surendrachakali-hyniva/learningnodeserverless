import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({});

function validateCustomer(body: any): string[] {
  const missing: string[] = [];
  if (!body.name || typeof body.name !== 'string') missing.push('name');
  if (!body.age || typeof body.age !== 'number') missing.push('age (must be a number)');
  if (!body.mobileNumber || typeof body.mobileNumber !== 'string') missing.push('mobileNumber');
  return missing;
}

function validateAddresses(addresses: any[]): string[] {
  const missing: string[] = [];

  if (!Array.isArray(addresses) || addresses.length === 0) {
    missing.push('addresses (must be a non-empty array)');
    return missing;
  }

  const seenTypes = new Set<string>();

  addresses.forEach((addr, index) => {
    if (!addr.addressType || typeof addr.addressType !== 'string') {
      missing.push(`addresses[${index}].addressType`);
    } else {
      if (seenTypes.has(addr.addressType)) {
        missing.push(`Duplicate addressType '${addr.addressType}' at addresses[${index}]`);
      } else {
        seenTypes.add(addr.addressType);
      }
    }

    if (!addr.address || typeof addr.address !== 'string') missing.push(`addresses[${index}].address`);
    if (!addr.city || typeof addr.city !== 'string') missing.push(`addresses[${index}].city`);
    if (!addr.town || typeof addr.town !== 'string') missing.push(`addresses[${index}].town`);
    if (!addr.zipcode || typeof addr.zipcode !== 'string') missing.push(`addresses[${index}].zipcode`);
  });

  return missing;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');

    const missingFields = [
      ...validateCustomer(body),
      ...validateAddresses(body.addresses || []),
    ];

    if (missingFields.length > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Validation Failed for customer or addresses',
          missingFields,
        }),
      };
    }

    const customerId = uuidv4();

    const customerCommand = new PutItemCommand({
      TableName: process.env.DYNAMODB_CUSTOMERS_TABLE!,
      Item: {
        customerId: { S: customerId },
        name: { S: body.name },
        age: { N: body.age.toString() },
        mobileNumber: { S: body.mobileNumber },
      },
    });

    await client.send(customerCommand);

    for (const addr of body.addresses) {
      const addressId = uuidv4();

      const addressCommand = new PutItemCommand({
        TableName: process.env.DYNAMODB_ADDRESSES_TABLE!,
        Item: {
          addressId: { S: addressId },
          customerId: { S: customerId },
          addressType: { S: addr.addressType },
          address: { S: addr.address },
          city: { S: addr.city },
          town: { S: addr.town },
          zipcode: { S: addr.zipcode },
        },
      });

      await client.send(addressCommand);
    }

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'Customer and addresses created successfully',
        customerId,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};
