import * as signalR from "@microsoft/signalr";
import { getToken, API_BASE_URL } from "./client";

let connection: signalR.HubConnection | null = null;

/**
 * Returns a shared, lazily-started SignalR connection to PresenceHub. The backend's
 * JwtBearerEvents.OnMessageReceived reads the token from the `access_token` query
 * string specifically for paths under /hubs, since browsers can't set custom headers
 * on the WebSocket handshake — accessTokenFactory below is what supplies that.
 */
export function getPresenceConnection(): signalR.HubConnection {
  if (connection) return connection;

  connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_BASE_URL}/hubs/presence`, {
      accessTokenFactory: () => getToken() ?? "",
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  return connection;
}

export async function ensureConnected(): Promise<signalR.HubConnection> {
  const conn = getPresenceConnection();
  if (conn.state === signalR.HubConnectionState.Disconnected) {
    await conn.start();
  }
  return conn;
}

export async function disconnectPresence(): Promise<void> {
  if (connection && connection.state !== signalR.HubConnectionState.Disconnected) {
    await connection.stop();
  }
}

export async function joinLabGroup(labId: number): Promise<void> {
  const conn = await ensureConnected();
  await conn.invoke("JoinLabGroup", labId);
}

export async function leaveLabGroup(labId: number): Promise<void> {
  if (!connection || connection.state !== signalR.HubConnectionState.Connected) return;
  await connection.invoke("LeaveLabGroup", labId);
}