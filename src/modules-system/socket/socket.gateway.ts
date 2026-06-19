import { APP_URL } from 'src/common/constants/app.constant';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  type AppSocket,
  type WorkspaceRoomPayload,
  type AppSocketServer,
  SOCKET_EVENTS,
  SocketAck,
  type DocumentRoomPayload,
} from './socket.types';
import { SocketAuthService } from './socket-auth.service';
import { WorkspaceMember } from 'src/modules-api/workspace/schemas/workspace_members.schema';
import { Model, Types } from 'mongoose';
import {
  WorkspaceRole,
  WorkspaceRoleAction,
  WorkspaceRoleResource,
} from 'src/modules-api/workspace/schemas/workspace-roles.schema';
import { InjectModel } from '@nestjs/mongoose';
import { ActivityLogItem } from 'src/modules-api/activity/types/activity.types';
import { DocumentMember } from 'src/modules-api/document/schemas/document-members.schema';
import {
  DocumentRole,
  DocumentRoleAction,
  DocumentRoleResource,
} from 'src/modules-api/document/schemas/document-roles.schema';
import type {
  CommentDeletedPayload,
  DocumentCommentRealtimePayload,
  ReplySummaryPayload,
} from 'src/modules-api/comment/types/comment-realtime.types';

const socketOrigins = [
  ...new Set(
    [APP_URL, 'http://localhost:5173'].filter((origin): origin is string =>
      Boolean(origin),
    ),
  ),
];

@WebSocketGateway({
  cors: {
    origin: socketOrigins,
    credentials: true,
  },
})
export class SocketGateway implements OnGatewayInit {
  @WebSocketServer()
  private server!: AppSocketServer;

  constructor(
    private readonly socketAuthService: SocketAuthService,

    @InjectModel(WorkspaceMember.name)
    private readonly workspaceMemberModel: Model<WorkspaceMember>,

    @InjectModel(WorkspaceRole.name)
    private readonly workspaceRoleModel: Model<WorkspaceRole>,

    @InjectModel(DocumentMember.name)
    private readonly documentMemberModel: Model<DocumentMember>,

    @InjectModel(DocumentRole.name)
    private readonly documentRoleModel: Model<DocumentRole>,
  ) {}

  afterInit(server: AppSocketServer) {
    server.use((client, next) => {
      void this.socketAuthService
        .authenticate(client)
        .then((userId) => {
          client.data.userId = userId;
          next();
        })
        .catch(() => next(new Error('UNAUTHORIZED')));
    });
  }

  // Listen to event on client
  @SubscribeMessage(SOCKET_EVENTS.JOIN_WORKSPACE)
  async joinWorkspace(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: WorkspaceRoomPayload,
  ): Promise<SocketAck> {
    const workspaceId = payload?.workspaceId;

    if (!workspaceId || !Types.ObjectId.isValid(workspaceId)) {
      return {
        success: false,
        error: 'INVALID_WORKSPACE_ID',
      };
    }

    const canViewWorkspace = await this.canViewWorkspace(
      client.data.userId,
      workspaceId,
    );

    if (!canViewWorkspace) {
      return {
        success: false,
        error: 'WORKSPACE_ACCESS_DENIED',
      };
    }

    if (client.data.workspaceRoom) {
      await client.leave(client.data.workspaceRoom);
    }

    const room = this.getWorkspaceRoom(workspaceId);

    await client.join(room);
    client.data.workspaceRoom = room;

    return {
      success: true,
      workspaceId,
    };
  }

  @SubscribeMessage(SOCKET_EVENTS.LEAVE_WORKSPACE)
  async leaveWorkspace(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: WorkspaceRoomPayload,
  ): Promise<SocketAck> {
    const workspaceId = payload?.workspaceId;

    if (!workspaceId || !Types.ObjectId.isValid(workspaceId)) {
      return {
        success: false,
        error: 'INVALID_WORKSPACE_ID',
      };
    }

    const room = this.getWorkspaceRoom(workspaceId);

    await client.leave(room);

    if (client.data.workspaceRoom === room) {
      client.data.workspaceRoom = undefined;
    }

    return {
      success: true,
      workspaceId,
    };
  }

  emitActivityCreated(workspaceId: string, activity: ActivityLogItem): void {
    this.server
      .to(this.getWorkspaceRoom(workspaceId))
      .emit(SOCKET_EVENTS.ACTIVITY_CREATED, activity);
  }

  @SubscribeMessage(SOCKET_EVENTS.JOIN_DOCUMENT)
  async joinDocument(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DocumentRoomPayload,
  ): Promise<SocketAck> {
    const documentId = payload?.documentId;

    if (!documentId || !Types.ObjectId.isValid(documentId)) {
      return {
        success: false,
        error: 'INVALID_DOCUMENT_ID',
      };
    }

    const canView = await this.canViewDocument(client.data.userId, documentId);

    if (!canView) {
      return {
        success: false,
        error: 'DOCUMENT_ACCESS_DENIED',
      };
    }

    if (client.data.documentRoom) {
      await client.leave(client.data.documentRoom);
    }

    const room = this.getDocumentRoom(documentId);

    await client.join(room);
    client.data.documentRoom = room;

    return {
      success: true,
      documentId,
    };
  }

  @SubscribeMessage(SOCKET_EVENTS.LEAVE_DOCUMENT)
  async leaveDocument(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DocumentRoomPayload,
  ): Promise<SocketAck> {
    const documentId = payload?.documentId;

    if (!documentId || !Types.ObjectId.isValid(documentId)) {
      return {
        success: false,
        error: 'INVALID_DOCUMENT_ID',
      };
    }

    const room = this.getDocumentRoom(documentId);
    await client.leave(room);

    if (client.data.documentRoom === room) {
      client.data.documentRoom = undefined;
    }

    return {
      success: true,
      documentId,
    };
  }

  emitCommentCreated(
    documentId: string,
    comment: DocumentCommentRealtimePayload,
  ): void {
    this.server
      .to(this.getDocumentRoom(documentId))
      .emit(SOCKET_EVENTS.COMMENT_CREATED, comment);
  }

  emitCommentUpdated(
    documentId: string,
    comment: DocumentCommentRealtimePayload,
  ): void {
    this.server
      .to(this.getDocumentRoom(documentId))
      .emit(SOCKET_EVENTS.COMMENT_UPDATED, comment);
  }

  emitCommentDeleted(payload: CommentDeletedPayload): void {
    this.server
      .to(this.getDocumentRoom(payload.documentId))
      .emit(SOCKET_EVENTS.COMMENT_DELETED, payload);
  }

  emitReplyCreatedSummary(payload: ReplySummaryPayload): void {
    this.server
      .to(this.getDocumentRoom(payload.documentId))
      .emit(SOCKET_EVENTS.REPLY_CREATED_SUMMARY, payload);
  }

  private getWorkspaceRoom(workspaceId: string): string {
    return `workspace:${workspaceId}`;
  }

  private getDocumentRoom(documentId: string): string {
    return `document:${documentId}`;
  }

  private async canViewWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const member = await this.workspaceMemberModel
      .findOne({
        userId: new Types.ObjectId(userId),
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .select('roleId')
      .lean()
      .exec();

    if (!member) {
      return false;
    }

    const role = await this.workspaceRoleModel
      .findById(member.roleId)
      .select('permissions')
      .lean()
      .exec();

    if (!role) {
      return false;
    }

    return role.permissions.some(
      (permission) =>
        permission.action === WorkspaceRoleAction.VIEW &&
        permission.resource === WorkspaceRoleResource.WORKSPACE,
    );
  }

  private async canViewDocument(
    userId: string,
    documentId: string,
  ): Promise<boolean> {
    const member = await this.documentMemberModel
      .findOne({
        userId: new Types.ObjectId(userId),
        documentId: new Types.ObjectId(documentId),
        isDeleted: { $ne: true },
      })
      .select('roleId')
      .lean()
      .exec();

    if (!member) return false;

    const role = await this.documentRoleModel
      .findById(member.roleId)
      .select('permissions')
      .lean()
      .exec();

    return Boolean(
      role?.permissions.some(
        (permission) =>
          permission.action === DocumentRoleAction.VIEW &&
          permission.resource === DocumentRoleResource.DOCUMENT,
      ),
    );
  }
}
