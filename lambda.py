import json
import boto3
from datetime import datetime

# Initialize the API Gateway Management API client
ENDPOINT = '8u1yq4r426.execute-api.us-east-1.amazonaws.com/production/'
client = boto3.client('apigatewaymanagementapi', endpoint_url=f'https://{ENDPOINT}')

# Initialize the S3 client
s3_client = boto3.client('s3')
S3_BUCKET_NAME = 'chatlogger'  # Replace with your S3 bucket name

NAMES_DB = {}

def log_to_s3(message):
    """Logs a message to an S3 bucket."""
    timestamp = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    log_message = f"{timestamp} - {message}\n"
    log_key = f"logs/{datetime.utcnow().strftime('%Y/%m/%d')}/log.txt"
    
    try:
        # Append the log message to the existing log file in S3
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=log_key,
            Body=log_message,
            ContentType='text/plain'
        )
    except Exception as e:
        print(f"Error logging to S3: {e}")

def send_to_one(connection_id, body):
    try:
        log_to_s3(f"Attempting to send message to connection {connection_id}: {body}")
        client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(body).encode('utf-8')
        )
    except client.exceptions.GoneException:
        log_to_s3(f"Connection {connection_id} is gone. Removing from NAMES_DB.")
        NAMES_DB.pop(connection_id, None)  # Safely remove the connection
    except Exception as e:
        log_to_s3(f"Error sending to connection {connection_id}: {e}")

def send_to_all(connection_ids, body):
    log_to_s3(f"Sending message to all connections: {body}")
    for connection_id in list(connection_ids):  # Create a static list of connection IDs
        send_to_one(connection_id, body)

def lambda_handler(event, context):
    log_to_s3(f"Received event: {event}")
    # Determine the type of event
    if event['requestContext']['eventType'] == 'CONNECT':
        return connect(event)
    elif event['requestContext']['eventType'] == 'DISCONNECT':
        return disconnect(event)
    elif event['requestContext']['eventType'] == 'MESSAGE':
        return handle_message(event)

def connect(event):
    connection_id = event['requestContext']['connectionId']
    log_to_s3(f"Connection established: {connection_id}")
    return {}

def setName(payload, connection_id):
    log_to_s3(f"Setting name for connection {connection_id} with payload: {payload}")
    NAMES_DB[connection_id] = payload['name']
    log_to_s3(f"Connection ID {connection_id} set to name: {payload['name']}")
    send_to_all(list(NAMES_DB.keys()), {'members': list(NAMES_DB.values())})
    send_to_all(list(NAMES_DB.keys()), {'systemMessage': f"{NAMES_DB[connection_id]} has joined the chat"})

def sendPublic(payload, connection_id):
    log_to_s3(f"Sending public message from connection {connection_id} with payload: {payload}")
    if connection_id in NAMES_DB:
        send_to_all(list(NAMES_DB.keys()), {'publicMessage': f"{NAMES_DB[connection_id]}: {payload['message']}"})
    else:
        log_to_s3(f"Connection ID {connection_id} not found in NAMES_DB. Cannot send public message.")

def sendPrivate(payload, connection_id):
    log_to_s3(f"Sending private message from connection {connection_id} with payload: {payload}")
    to = next((key for key, value in NAMES_DB.items() if value == payload['to']), None)
    if to:
        send_to_one(to, {'privateMessage': f"{NAMES_DB[connection_id]}: {payload['message']}"})
    else:
        log_to_s3(f"User {payload['to']} not found for private message.")

def handle_message(event):
    connection_id = event['requestContext']['connectionId']
    log_to_s3(f"Handling message for connection {connection_id}")
    try:
        payload = json.loads(event['body'])
        log_to_s3(f"Parsed payload: {payload}")

        if 'action' in payload:
            if payload['action'] == 'setName':
                setName(payload, connection_id)
            elif payload['action'] == 'sendPublic':
                sendPublic(payload, connection_id)
            elif payload['action'] == 'sendPrivate':
                sendPrivate(payload, connection_id)
        else:
            log_to_s3("Invalid action in payload")
    except Exception as e:
        log_to_s3(f"Error processing message: {e}")
        send_to_one(connection_id, {"error": "Failed to process message"})
    
    return {}

def disconnect(event):
    connection_id = event['requestContext']['connectionId']
    log_to_s3(f"Disconnecting connection {connection_id}")
    if connection_id in NAMES_DB:
        send_to_all(list(NAMES_DB.keys()), {'systemMessage': f"{NAMES_DB[connection_id]} has left the chat"})
        del NAMES_DB[connection_id]
        send_to_all(list(NAMES_DB.keys()), {'members': list(NAMES_DB.values())})
    log_to_s3(f"Connection closed: {connection_id}")
    return {}
