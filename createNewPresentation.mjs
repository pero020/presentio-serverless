import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});

const dynamoDB = DynamoDBDocumentClient.from(client);

const tableName = process.env.DYNAMODB_CUSTOMER_TABLE;

function makeId(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}

export const handler = async (event, context) => {
  const jsonBody = JSON.parse(event.body);
  const presentationId = makeId(6)

  const currDateTime = new Date()
    try {
      const itemData = {
 "Id": presentationId,
 "presentationtatus": "started",
 "dateTimeStarted": currDateTime.toISOString(),
 "dateTimeEnded": "",
 "name": jsonBody.message.data.name,
 "presenter": {
  "id": jsonBody.message.data.presenter.id,
  "name": jsonBody.message.data.presenter.name,
  "connectionId": event.requestContext.connectionId || ""
 },
 "settings": {
  "type": jsonBody.message.data.settings.type,
  "minTopicIssueStudents": jsonBody.message.data.settings.minTopicIssueStudents,
  "minLostIssueStudents": jsonBody.message.data.settings.minLostIssueStudents
 },
 "currentStudents": [],
 "topicIssues": [],
 "lostIssues": []
}

    const params = {
      TableName: tableName,
      Item: itemData 
    };
    
    await dynamoDB.send(
      new PutCommand(params)
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        presentationId: presentationId
      })
    };
    
  } catch (error) {
    console.error('Error creating item:', error);
    return {
      statusCode: 500,
      body: "Error"
    };
  }
};
