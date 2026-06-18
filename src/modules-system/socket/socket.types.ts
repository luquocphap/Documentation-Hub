import type { Server, Socket } from "socket.io";
import { ActivityLogItem } from "src/modules-api/activity/types/activity.types";
export const SOCKET_EVENTS = {
    JOIN_WORKSPACE: 'workspace:join',
    LEAVE_WORKSPACE: 'workspace:leave',
    ACTIVITY_CREATED: 'activity_log:created'
} as const;

// socket when join workspace
export interface WorkspaceRoomPayload {
    workspaceId: string;
}


// response when join successfully
export interface SocketAck {
    success: boolean;
    workspaceId?: string;
    error?: string;
}

// param for socket.on
interface ClientToServerEvents {
    'workspace:join': (
    payload: WorkspaceRoomPayload,
    callback: (response: SocketAck) => void,
  ) => void;

  'workspace:leave': (
    payload: WorkspaceRoomPayload,
    callback: (response: SocketAck) => void,
  ) => void;
}

// param for socket.to
interface ServerToClientEvents {
    'activity_log:created' : (
        activity: ActivityLogItem
    ) => void
}

interface InterServerEvents {}

export interface SocketData {
    userId: string;
    workspaceRoom?: string;
}

export type AppSocket = Socket<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>;

export type AppSocketServer = Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>;