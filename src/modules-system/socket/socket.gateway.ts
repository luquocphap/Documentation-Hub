import { APP_URL } from "src/common/constants/app.constant";
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { type AppSocket, type WorkspaceRoomPayload, type AppSocketServer, SOCKET_EVENTS, SocketAck } from "./socket.types";
import { SocketAuthService } from "./socket-auth.service";
import { WorkspaceMember } from "src/modules-api/workspace/schemas/workspace_members.schema";
import { Model, Types } from "mongoose";
import { WorkspaceRole, WorkspaceRoleAction, WorkspaceRoleResource } from "src/modules-api/workspace/schemas/workspace-roles.schema";
import { InjectModel } from "@nestjs/mongoose";
import { ActivityLogItem } from "src/modules-api/activity/types/activity.types";

const socketOrigins = [
    ...new Set(
        [APP_URL, 'http://localhost:5173'].filter(
            (origin): origin is string => Boolean(origin),
        ),
    )
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
  ) {}

  afterInit(server: AppSocketServer) {
    server.use(async (client, next) => {
      try {
        client.data.userId =
          await this.socketAuthService.authenticate(client);

        next();
      } catch {
        next(new Error('UNAUTHORIZED'));
      }
    });
  }

  // Listen to event on client
  @SubscribeMessage(SOCKET_EVENTS.JOIN_WORKSPACE)
  async joinWorkspace (
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

  emitActivityCreated(
    workspaceId: string,
    activity: ActivityLogItem
  ): void {
    this.server
        .to(this.getWorkspaceRoom(workspaceId))
        .emit(SOCKET_EVENTS.ACTIVITY_CREATED, activity);
  }

  private getWorkspaceRoom(workspaceId: string): string {
    return `workspace:${workspaceId}`;
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

}