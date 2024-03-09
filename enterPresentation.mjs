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

const client = new DynamoDBClient({});

const dynamoDB = DynamoDBDocumentClient.from(client);

// Define the name of your DynamoDB table
const tableName = process.env.DYNAMODB_CUSTOMER_TABLE;

export const handler = async (event, context) => {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const callbackUrl = `https://${domain}/${stage}`;
  const socket = new ApiGatewayManagementApiClient({ endpoint: callbackUrl });
  const jsonBody = JSON.parse(event.body);
    try {
      
      const presentationData = await dynamoDB.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            Id: jsonBody.message.data.presentationId,
          }})
      );
      
      if (!presentationData.Item) {
        await socket.send(new PostToConnectionCommand({
          ConnectionId: event.requestContext.connectionId,
          Data: "Presentation doesn't exist",
        }));
        return {
          statusCode: 404,
          body: "Presentation doesn't exist",
        };
      }

      const found = presentationData.Item.currentStudents.findIndex((student) => student.id == jsonBody.message.data.studentId);
      
      if (found > -1) {
        console.log("found user")
        const removeStatement = 'currentStudents['+found+']'
        await dynamoDB.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              Id: jsonBody.message.data.presentationId,
            },
            UpdateExpression: "REMOVE "+removeStatement,
            ReturnValues: "UPDATED_NEW"
          })
        );
      }
      
      const itemData = {
       "name": jsonBody.message.data.name,
       "id": jsonBody.message.data.studentId,
       "connectionId": event.requestContext.connectionId
      }
    
    await dynamoDB.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          Id: jsonBody.message.data.presentationId,
        },
        UpdateExpression: "SET #c = list_append(#c, :val)",
        ExpressionAttributeNames: {
           "#c": "currentStudents"
        },
        ExpressionAttributeValues: {
          ":val": [itemData]
        },
        ReturnValues: "UPDATED_NEW"
      })
    );
  
    await socket.send(new PostToConnectionCommand({
      ConnectionId: event.requestContext.connectionId,
      Data: "Entered presentation",
    }));

    return {
      statusCode: 200
    };
    
  } catch (error) {
    console.error('Error creating item:', error);
    return {
      statusCode: 500,
      body: "Error"
    };
  }
};
