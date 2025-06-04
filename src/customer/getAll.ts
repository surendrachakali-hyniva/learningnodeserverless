import { APIGatewayProxyHandler } from "aws-lambda";
import {
  DynamoDBClient,
  ScanCommand,
  AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import pino from "pino";

const client = new DynamoDBClient({});
const log = pino();

export const handler: APIGatewayProxyHandler = async (event) => {
  log.info("Lambda invoked with event:", event);

  try {
    // 1. Get total count of customers
    const totalCountCmd = new ScanCommand({
      TableName: process.env.DYNAMODB_CUSTOMERS_TABLE!,
      Select: "COUNT",
    });
    log.info("Sending total count scan command...");

    const totalCountResult = await client.send(totalCountCmd);
    const totalCount = totalCountResult.Count ?? 0;

    log.info({ totalCount }, "Total customer count fetched");
    const limit = parseInt(event.queryStringParameters?.limit || totalCount);
    const pageNo = parseInt(event.queryStringParameters?.pageNo || "1");

    log.info({ limit, pageNo }, "Parsed pagination parameters");

    if (limit <= 0 || pageNo <= 0) {
      log.warn("Invalid limit or pageNo");
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "limit and pageNo must be positive integers",
        }),
      };
    }

    // 2. Paginated scan simulation
    let scannedItems: any[] = [];
    let lastEvaluatedKey: Record<string, AttributeValue> | undefined =
      undefined;
    let currentPage = 1;

    while (currentPage <= pageNo) {
      const pageScan = new ScanCommand({
        TableName: process.env.DYNAMODB_CUSTOMERS_TABLE!,
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey,
      });

      log.info({ currentPage, lastEvaluatedKey }, "Sending paginated scan");

      const pageResult = await client.send(pageScan);
      lastEvaluatedKey = pageResult.LastEvaluatedKey;

      if (currentPage === pageNo) {
        scannedItems = pageResult.Items || [];
        log.info({ count: scannedItems.length }, "Fetched paginated items");
      }

      if (!lastEvaluatedKey) break;

      currentPage++;
    }

    // 3. Get addresses for each customer
    log.info(`Fetching addresses for ${scannedItems.length} customers...`);

    const customersWithAddresses = await Promise.all(
      scannedItems.map(async (item) => {
        const customer = unmarshall(item);
        log.info({ customerId: customer.customerId }, "Fetching addresses");

        const addressScanCmd = new ScanCommand({
          TableName: process.env.DYNAMODB_ADDRESSES_TABLE!,
          FilterExpression: "customerId = :cid",
          ExpressionAttributeValues: {
            ":cid": { S: customer.customerId },
          },
        });

        const addressResult = await client.send(addressScanCmd);
        const addresses =
          addressResult.Items?.map((addr) => unmarshall(addr)) || [];

        return {
          ...customer,
          addresses,
        };
      })
    );

    const totalPages = Math.ceil(totalCount / limit);

    if (customersWithAddresses.length === 0) {
      log.warn({ pageNo }, "No records found for requested page");
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "No records found for the requested page",
          pageNo,
          limit,
          totalCount,
          totalPages,
          data: [],
        }),
      };
    }
    const response = {
      message: "Customers fetched successfully",
      data: customersWithAddresses,
      pageNo,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    };

    log.info(
      { pageNo, limit, totalCount, results: customersWithAddresses.length },
      "Returning paginated customer data"
    );

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    log.error({ error }, "Error occurred during customer fetch");
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
