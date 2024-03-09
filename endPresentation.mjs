import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);
const tableName = process.env.DYNAMODB_CUSTOMER_TABLE;

export const handler = async (event, context) => {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const callbackUrl = `https://${domain}/${stage}`;
  const apiGatewayClient = new ApiGatewayManagementApiClient({ endpoint: callbackUrl });
  const jsonBody = JSON.parse(event.body);
  const presentationId = jsonBody.message.data.presentationId;

  try {
    const currDateTime = new Date();
    
    const { Item } = await dynamoDB.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          Id: jsonBody.message.data.presentationId,
        }
      })
    );
    
    if (Item.presenter.id != jsonBody.message.data.presenterId) {
      await apiGatewayClient.send(new PostToConnectionCommand({
        ConnectionId: event.requestContext.connectionId,
        Data: "Not the right presenter",
      }));
      return {
        statusCode: 400,
        body: "Not the right presenter"
      };
    }

    const params = {
      TableName: tableName,
      Key: { "Id": presentationId },
      UpdateExpression: "SET #statusAttr = :newStatus, #endTimeAttr = :endTime",
      ExpressionAttributeNames: {
        "#statusAttr": "status",
        "#endTimeAttr": "dateTimeEnded"
      },
      ExpressionAttributeValues: {
        ":newStatus": "finished",
        ":endTime": currDateTime.toISOString()
      },
      ReturnValues: "ALL_NEW" // Return the updated item
    };

    const result = await dynamoDB.send(new UpdateCommand(params));

    await notifyCurrentStudents(apiGatewayClient, presentationId, result.Attributes.currentStudents);
    
    try {
      await apiGatewayClient.send(new PostToConnectionCommand({
        ConnectionId: event.requestContext.connectionId,
        Data: JSON.stringify({ presentationId, message: "Presentation is finished" })
      }));
    } catch (error) {
      console.error(`Failed to notify student with connectionId ${event.requestContext.connectionId} (presenter):`, error);
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Error updating item:', error);
    return {
      statusCode: 500,
      body: "Error"
    };
  }
};

async function notifyCurrentStudents(apiGatewayClient, presentationId, currentStudents) {
  const message = "Presentation is finished";

  for (const student of currentStudents) {
    const connectionId = student.connectionId;
    try {
      await apiGatewayClient.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: message
      }));
    } catch (error) {
      console.error(`Failed to notify student with connectionId ${connectionId}:`, error);
    }
  }
}
