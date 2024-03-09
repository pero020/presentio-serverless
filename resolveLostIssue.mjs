import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand
} from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const client = new DynamoDBClient({});

const dynamoDB = DynamoDBDocumentClient.from(client);

const sqsClient = new SQSClient({ region: process.env.AWS_SERVICE_REGION });
const sqsUrl = `https://sqs.${process.env.AWS_SERVICE_REGION}.amazonaws.com/${process.env.AWS_ACCOUNT_ID}/${process.env.PRESENTER_QUEUE}`

const tableName = process.env.DYNAMODB_CUSTOMER_TABLE;

export const handler = async (event, context) => {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const callbackUrl = `https://${domain}/${stage}`;
  const presenterSocket = new ApiGatewayManagementApiClient({ endpoint: callbackUrl });
  const jsonBody = JSON.parse(event.body);
  try {
    const presentationData = await dynamoDB.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          Id: jsonBody.message.data.presentationId,
        }
      })
    );

    const foundIndex = presentationData.Item.lostIssues.findIndex((issue) => issue.issueId === jsonBody.message.data.issueId);

    if (foundIndex === -1) {
      await presenterSocket.send(new PostToConnectionCommand({
        ConnectionId: event.requestContext.connectionId,
        Data: "Lost issue not found",
      }));
      return {
        statusCode: 404,
        body: "Lost issue not found"
      };
    }

    if (presentationData.Item.lostIssues[foundIndex].studentId !== jsonBody.message.data.studentId) {
      await presenterSocket.send(new PostToConnectionCommand({
        ConnectionId: event.requestContext.connectionId,
        Data: "Not the right student",
      }));
      return {
        statusCode: 400,
        body: "Not the right student"
      };
    }

    await dynamoDB.send(new UpdateCommand({
      TableName: tableName,
      Key: { Id: jsonBody.message.data.presentationId },
      UpdateExpression: `SET lostIssues[${foundIndex}].issueStatus = :issueStatus`,
      ExpressionAttributeValues: {
        ":issueStatus": "resolved"
      },
      ReturnValues: "UPDATED_NEW"
    }));

    await presenterSocket.send(new PostToConnectionCommand({
      ConnectionId: event.requestContext.connectionId,
      Data: "Resolved lost issue",
    }));
    
    const sqsParams = {
      QueueUrl: sqsUrl,
      MessageBody: JSON.stringify({ presentationId: jsonBody.message.data.presentationId, domain: event.requestContext.domainName, stage:  event.requestContext.stage})
    };
    await sqsClient.send(new SendMessageCommand(sqsParams));

    return {
      statusCode: 200
    };
  } catch (error) {
    console.error('Error updating item:', error);
    return {
      statusCode: 500,
      body: "Error"
    };
  }
};
