import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);
const tableName = process.env.DYNAMODB_CUSTOMER_TABLE;

export const handler = async (event, context) => {
    try {
        const jsonBody = JSON.parse(event.body);
        const presentationId = jsonBody.presentationId;

        // Fetch presentation data from DynamoDB
        const { Item } = await dynamoDB.send(new GetCommand({
            TableName: tableName,
            Key: { Id: presentationId }
        }));
        console.log(Item)

        if (!Item) {
          return {
            statusCode: 400,
            body: "Error, presentation not found"
        };
        }

        if (Item.presenter.id != jsonBody.presenterId) {
            return {
                statusCode: 400,
                body: "Error, not the original presenter"
            };
        }

        // Return the presentation item
        return {
            statusCode: 200,
            body: JSON.stringify(Item)
        };
    } catch (error) {
        console.error('Error fetching presentation item:', error);
        return {
            statusCode: 500,
            body: "Error"
        };
    }
};
