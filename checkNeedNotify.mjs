import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
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
  const jsonBody = JSON.parse(event.Records[0].body);
  const domain = jsonBody.domain;
  const stage = jsonBody.stage;
  const callbackUrl = `https://${domain}/${stage}`;
  const presenterSocket = new ApiGatewayManagementApiClient({ endpoint: callbackUrl });
  try {
      
    const presentationData = await dynamoDB.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          Id: jsonBody.presentationId,
        }
      })
    );
    
    const confirmedLost = presentationData.Item.lostIssues.filter(element => element.issueStatus === "confirmed");
    
    if (confirmedLost.length >= presentationData.Item.settings.minLostIssueStudents) {
      await presenterSocket.send(new PostToConnectionCommand({
        ConnectionId: presentationData.Item.presenter.connectionId,
        Data: JSON.stringify({ presentationId: jsonBody.presentationId, confirmedLost: confirmedLost.length }),
      }));      
    }
    
    const descriptionCounts = {};
    presentationData.Item.topicIssues.forEach(issue => {
      if (!descriptionCounts[issue.description]) {
        if (issue.issueStatus === "active") {
          descriptionCounts[issue.description] = {
            count: 1,
            studentIds: [issue.studentId]
          };
        }
      } else if (!descriptionCounts[issue.description].studentIds.includes(issue.studentId) && issue.issueStatus === "active") {
        descriptionCounts[issue.description].count = descriptionCounts[issue.description].count + 1;
        descriptionCounts[issue.description].studentIds.push(issue.studentId);
      }
    });

    const similarDescriptions = Object.keys(descriptionCounts).filter(description => descriptionCounts[description].count >= presentationData.Item.settings.minTopicIssueStudents);
    
    const similarIssues = similarDescriptions.map(description => ({
      description,
      count: descriptionCounts[description].count
    }));

    if (similarIssues.length > 0) {
      await presenterSocket.send(new PostToConnectionCommand({
        ConnectionId: presentationData.Item.presenter.connectionId,
        Data: JSON.stringify({ presentationId: jsonBody.presentationId, similarIssues }),
      }));
    }

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
