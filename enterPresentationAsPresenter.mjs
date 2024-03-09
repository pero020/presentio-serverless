import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);
const tableName = process.env.DYNAMODB_CUSTOMER_TABLE;

export const handler = async (event, context) => {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const callbackUrl = `https://${domain}/${stage}`;
  const presenterSocket = new ApiGatewayManagementApiClient({ endpoint: callbackUrl });
    try {
        const jsonBody = JSON.parse(event.body);
        const presentationId = jsonBody.message.data.presentationId;
        const newConnectionId = event.requestContext.connectionId;
        
        const presentationData = await dynamoDB.send(new GetCommand({
          TableName: tableName,
          Key: { Id: presentationId }
        }));

        if (presentationData.Item.presenter.id != jsonBody.message.data.presenterId) {
          await notifyPresenter(newConnectionId, `Error, not the original presenter`);
          return { statusCode: 400, body: "Not the original presenter" };
        }

        await dynamoDB.send(new UpdateCommand({
            TableName: tableName,
            Key: { Id: presentationId },
            UpdateExpression: "SET presenter.connectionId = :newConnectionId",
            ExpressionAttributeValues: { ":newConnectionId": newConnectionId }
        }));

        // Notify the presenter about the connection ID change
        await notifyPresenter(presenterSocket, newConnectionId, `Your connection ID has been updated to: ${newConnectionId}`);

        return { statusCode: 200 };
    } catch (error) {
        console.error('Error updating presenter connection ID:', error);
        return { statusCode: 500, body: "Error" };
    }
};

async function notifyPresenter(presenterSocket, connectionId, message) {
    try {
        await presenterSocket.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: message,
        }));
    } catch (error) {
        console.error('Error notifying presenter:', error);
    }
}
