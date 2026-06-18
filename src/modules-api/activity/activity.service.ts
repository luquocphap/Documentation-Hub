import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { type Request } from 'express';
import { Model, Types } from 'mongoose';
import {
  ACTIVITY_LOG_EVENT,
  ActivityLogAction,
  type ActivityLogPayload,
} from 'src/common/events/activity-log.event';
import { buildQueryActivities } from 'src/common/helpers/build-query-activities.helper';
import { ACTION_IDS } from 'src/common/seeds/activity-action.seed';
import { User } from '../auth/schemas/user.schema';
import { ActionCategory } from './schemas/action_categories.schema';
import { Action } from './schemas/actions.schema';
import {
  Activity,
  ActivityTarget,
  ActivityTargetType,
} from './schemas/activities.schema';

type ActivityActor = {
  _id: Types.ObjectId;
  fullName?: string;
  email?: string;
};

type ActivityWorkspace = {
  _id: Types.ObjectId;
  name?: string;
};

type ActivityAction = {
  _id: Types.ObjectId;
  code?: ActivityLogAction;
  action?: string;
  categoryId?: Types.ObjectId;
};

type PopulatedActivity = {
  _id: Types.ObjectId;
  actorId: Types.ObjectId | ActivityActor | null;
  workspaceId: Types.ObjectId | ActivityWorkspace | null;
  actionId: Types.ObjectId | ActivityAction | null;
  targets: ActivityTarget[];
  created_at?: Date;
};

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Action.name)
    private readonly actionModel: Model<Action>,
    @InjectModel(ActionCategory.name)
    private readonly actionCategoryModel: Model<ActionCategory>,
  ) {}

  async getActivityActors(workspaceId: string) {
    const actorIds = await this.activityModel
      .distinct('actorId', {
        workspaceId: new Types.ObjectId(workspaceId),
      })
      .exec();

    if (actorIds.length === 0) {
      return [];
    }

    const actors = await this.userModel
      .find({
        _id: { $in: actorIds },
      })
      .select('_id fullName email')
      .sort({ fullName: 1, _id: 1 })
      .lean()
      .exec();

    return actors.map((actor) => ({
      id: actor._id.toString(),
      fullName: actor.fullName,
      email: actor.email,
    }));
  }

  async getActivityActions() {
    const [categories, actions] = await Promise.all([
      this.actionCategoryModel.find().sort({ _id: 1 }).lean().exec(),
      this.actionModel.find().sort({ categoryId: 1, _id: 1 }).lean().exec(),
    ]);

    const actionsByCategory = new Map<
      string,
      Array<{ id: string; code: ActivityLogAction; action: string }>
    >();

    for (const action of actions) {
      const categoryId = action.categoryId.toString();
      const categoryActions = actionsByCategory.get(categoryId) ?? [];

      categoryActions.push({
        id: action._id.toString(),
        code: action.code,
        action: action.action,
      });
      actionsByCategory.set(categoryId, categoryActions);
    }

    return categories.map((category) => ({
      id: category._id.toString(),
      category: category.name,
      actions: actionsByCategory.get(category._id.toString()) ?? [],
    }));
  }

  async getActivityLogs(workspaceId: string, req: Request) {
    const { page, pageSize, skip, limit, filter, sort } =
      buildQueryActivities(req);

    const activityFilter = {
      ...filter,
      workspaceId: new Types.ObjectId(workspaceId),
    };

    const [total, activityDocuments] = await Promise.all([
      this.activityModel.countDocuments(activityFilter).exec(),
      this.activityModel
        .find(activityFilter)
        .populate('actorId', 'fullName email')
        .populate('workspaceId', 'name')
        .populate('actionId', 'code action categoryId')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    const activities = activityDocuments as unknown as PopulatedActivity[];

    return {
      items: activities.map((activity) => {
        const actor =
          activity.actorId instanceof Types.ObjectId
            ? undefined
            : activity.actorId;
        const workspace =
          activity.workspaceId instanceof Types.ObjectId
            ? undefined
            : activity.workspaceId;
        const action =
          activity.actionId instanceof Types.ObjectId
            ? undefined
            : activity.actionId;

        return {
          id: activity._id,
          actorId: actor?._id ?? activity.actorId,
          actorName: actor?.fullName ?? 'Unknown',
          actorEmail: actor?.email,
          workspaceId: workspace?._id ?? activity.workspaceId,
          workspaceName: workspace?.name,
          actionId: action?._id ?? activity.actionId,
          actionCode: action?.code,
          actionName: action?.action,
          actionCategoryId: action?.categoryId,
          targets: (activity.targets ?? []).map((target) => ({
            type: target.type,
            value: target.value,
            entityId: target.entityId?.toString() ?? null,
          })),
          createdAt: activity.created_at,
        };
      }),
      pagination: this.buildPagination(page, pageSize, total),
    };
  }

  @OnEvent(ACTIVITY_LOG_EVENT, { async: true })
  async handleActivityLog(payload: ActivityLogPayload) {
    try {
      const actionId = this.getActionId(payload.action);
      const targets = this.buildTargets(payload);

      await this.activityModel.create({
        actorId: new Types.ObjectId(payload.actorId),
        workspaceId: new Types.ObjectId(payload.workspaceId),
        actionId,
        targets,
      });
    } catch (error) {
      console.error('[ActivityLog] Failed to write activity log', error);
    }
  }

  private getActionId(action: ActivityLogAction) {
    return ACTION_IDS[action];
  }

  private buildPagination(page: number, pageSize: number, total: number) {
    const totalPages = Math.ceil(total / pageSize);

    return {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && totalPages > 0,
    };
  }

  private buildTargets(payload: ActivityLogPayload): ActivityTarget[] {
    switch (payload.action) {
      case ActivityLogAction.CREATE_DOCUMENT:
      case ActivityLogAction.UPDATE_DOCUMENT:
      case ActivityLogAction.DELETE_DOCUMENT:
        return [
          {
            type: ActivityTargetType.DOCUMENT,
            value: payload.documentName,
            entityId: new Types.ObjectId(payload.documentId),
          },
        ];

      case ActivityLogAction.SHARE_DOCUMENT:
      case ActivityLogAction.REVOKE_ACCESS:
        return [
          {
            type: ActivityTargetType.DOCUMENT,
            value: payload.documentName,
            entityId: new Types.ObjectId(payload.documentId),
          },
          {
            type: ActivityTargetType.EMAIL,
            value: payload.email,
            entityId: payload.targetUserId
              ? new Types.ObjectId(payload.targetUserId)
              : null,
          },
        ];

      case ActivityLogAction.INVITE_USER:
      case ActivityLogAction.REMOVE_USER:
        return [
          {
            type: ActivityTargetType.EMAIL,
            value: payload.email,
            entityId: payload.targetUserId
              ? new Types.ObjectId(payload.targetUserId)
              : null,
          },
        ];

      case ActivityLogAction.CHANGE_USER_ROLE:
        return [
          {
            type: ActivityTargetType.EMAIL,
            value: payload.email,
            entityId: new Types.ObjectId(payload.targetUserId),
          },
          {
            type: ActivityTargetType.ROLE,
            value: payload.roleName,
            entityId: new Types.ObjectId(payload.roleId),
          },
        ];

      case ActivityLogAction.UPDATE_SETTINGS:
      case ActivityLogAction.WORKSPACE_CREATION:
        return [];
    }
  }
}
