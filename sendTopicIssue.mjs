import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const client = new DynamoDBClient({});

const dynamoDB = DynamoDBDocumentClient.from(client);

const sqsClient = new SQSClient({ region: process.env.AWS_SERVICE_REGION });
const sqsUrl = `https://sqs.${process.env.AWS_SERVICE_REGION}.amazonaws.com/${process.env.AWS_ACCOUNT_ID}/${process.env.PRESENTER_QUEUE}`

// Define the name of your DynamoDB table
const tableName = process.env.DYNAMODB_CUSTOMER_TABLE;

export const handler = async (event, context) => {
  const jsonBody = JSON.parse(event.body);
  
  const currDateTime = new Date()
    try {
      const itemData = {
       "issueId": jsonBody.message.data.issueId,
       "dateTime": currDateTime.toISOString(),
       "studentId": jsonBody.message.data.studentId,
       "description": jsonBody.message.data.description,
       "issueStatus": jsonBody.message.data.issueStatus
      }
    
    await dynamoDB.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          Id: jsonBody.message.data.presentationId,
        },
        UpdateExpression: "SET #c = list_append(#c, :val)",
        ExpressionAttributeNames: {
           "#c": "topicIssues"
        },
        ExpressionAttributeValues: {
          ":val": [itemData]
        },
        ReturnValues: "UPDATED_NEW"
      })
    );
    
    // Send a message to SQS
    const sqsParams = {
      QueueUrl: sqsUrl,
      MessageBody: JSON.stringify({ presentationId: jsonBody.message.data.presentationId, domain: event.requestContext.domainName, stage:  event.requestContext.stage})
    };
    await sqsClient.send(new SendMessageCommand(sqsParams));

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
