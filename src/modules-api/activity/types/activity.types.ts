import { ActivityLogAction } from 'src/common/events/activity-log.event';
import { ActivityTargetType } from '../schemas/activities.schema';

export interface ActivityLogTarget {
  type: ActivityTargetType;
  value: string;
  entityId: string | null;
}

export interface ActivityLogItem {
  id: string;

  actorId: string;
  actorName: string;
  actorEmail?: string;

  workspaceId: string;
  workspaceName?: string;

  actionId: string;
  actionCode: ActivityLogAction;
  actionName?: string;
  actionCategoryId?: string;

  targets: ActivityLogTarget[];
  createdAt: string;
}