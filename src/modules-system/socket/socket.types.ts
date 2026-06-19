import type { Server, Socket } from "socket.io";
import { ActivityLogItem } from "src/modules-api/activity/types/activity.types";
import { DocumentCommentRealtimePayload } from "src/modules-api/comment/types/comment-realtime.types";

export const SOCKET_EVENTS = {
    JOIN_WORKSPACE: 'workspace:join',
    LEAVE_WORKSPACE: 'workspace:leave',
    ACTIVITY_CREATED: 'activity_log:created',

    JOIN_DOCUMENT: 'document:join',
    LEAVE_DOCUMENT: 'document:leave',

    COMMENT_CREATED: 'comment:created',
    COMMENT_UPDATED: 'comment:updated',
    COMMENT_DELETED: 'comment:deleted',

    REPLY_CREATED_SUMMARY: 'reply:created_summary',
    REPLY_DELETED_SUMMARY: 'reply:deleted_summary',
} as const;

// socket when join workspace
export interface WorkspaceRoomPayload {
    workspaceId: string;
}

// socket when join document
export interface DocumentRoomPayload {
  documentId: string;
}

// event of deleting comment
export interface CommentDeletedPayload {
  documentId: string;
  commentId: string;
  annotationId: string | null;
}

// event reply
export interface ReplySummaryPayload {
  documentId: string;
  commentId: string;
  replyCount: number;
}


// response when join successfully
export interface SocketAck {
    success: boolean;
    workspaceId?: string;
    documentId?: string;
    error?: string;
}

// param for socket.on
interface ClientToServerEvents {
    'document:join': (
        payload: DocumentRoomPayload,
        callback: (response: SocketAck) => void,
    ) => void;

    'document:leave': (
        payload: DocumentRoomPayload,
        callback: (response: SocketAck) => void,
    ) => void;

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
    'comment:created': (
    comment: DocumentCommentRealtimePayload,
  ) => void;

  'comment:updated': (
    comment: DocumentCommentRealtimePayload,
  ) => void;

  'comment:deleted': (
    payload: CommentDeletedPayload,
  ) => void;

  'reply:created_summary': (
    payload: ReplySummaryPayload,
  ) => void;

  'reply:deleted_summary': (
    payload: ReplySummaryPayload,
  ) => void;
    
    'activity_log:created' : (
        activity: ActivityLogItem
    ) => void;
}

interface InterServerEvents {}


export interface SocketData {
    userId: string;
    workspaceRoom?: string;
    documentRoom?: string;
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