export const ACTIVITY_LOG_EVENT = 'activity.log';

export enum ActivityLogAction {
  CREATE_DOCUMENT = 'CREATE_DOCUMENT',
  UPDATE_DOCUMENT = 'UPDATE_DOCUMENT',
  DELETE_DOCUMENT = 'DELETE_DOCUMENT',
  SHARE_DOCUMENT = 'SHARE_DOCUMENT',
  REVOKE_ACCESS = 'REVOKE_ACCESS',
  INVITE_USER = 'INVITE_USER',
  REMOVE_USER = 'REMOVE_USER',
  CHANGE_USER_ROLE = 'CHANGE_USER_ROLE',
  UPDATE_SETTINGS = 'UPDATE_SETTINGS',
  WORKSPACE_CREATION = 'WORKSPACE_CREATION',
}

type BaseActivityLogPayload = {
  actorId: string;
  workspaceId: string;
};

type DocumentTargetPayload = {
  documentId: string;
  documentName: string;
};

export type ActivityLogPayload =
  | (BaseActivityLogPayload &
      DocumentTargetPayload & {
        action: ActivityLogAction.CREATE_DOCUMENT;
      })
  | (BaseActivityLogPayload &
      DocumentTargetPayload & {
        action: ActivityLogAction.UPDATE_DOCUMENT;
      })
  | (BaseActivityLogPayload &
      DocumentTargetPayload & {
        action: ActivityLogAction.DELETE_DOCUMENT;
      })
  | (BaseActivityLogPayload &
      DocumentTargetPayload & {
        action: ActivityLogAction.SHARE_DOCUMENT;
        email: string;
        targetUserId?: string;
      })
  | (BaseActivityLogPayload &
      DocumentTargetPayload & {
        action: ActivityLogAction.REVOKE_ACCESS;
        email: string;
        targetUserId: string;
      })
  | (BaseActivityLogPayload & {
      action: ActivityLogAction.INVITE_USER;
      email: string;
      targetUserId?: string;
    })
  | (BaseActivityLogPayload & {
      action: ActivityLogAction.REMOVE_USER;
      email: string;
      targetUserId: string;
    })
  | (BaseActivityLogPayload & {
      action: ActivityLogAction.CHANGE_USER_ROLE;
      email: string;
      targetUserId: string;
      roleId: string;
      roleName: string;
    })
  | (BaseActivityLogPayload & {
      action: ActivityLogAction.UPDATE_SETTINGS;
    })
  | (BaseActivityLogPayload & {
      action: ActivityLogAction.WORKSPACE_CREATION;
    });
