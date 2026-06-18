import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ActivityLogAction } from 'src/common/events/activity-log.event';
import { ActionCategory } from 'src/modules-api/activity/schemas/action_categories.schema';
import { Action } from 'src/modules-api/activity/schemas/actions.schema';

export const ACTION_CATEGORY_IDS = {
  DOCUMENT: new Types.ObjectId('222222222222222222222001'),
  ACCESS_SHARING: new Types.ObjectId('222222222222222222222002'),
  WORKSPACE_MEMBERS: new Types.ObjectId('222222222222222222222003'),
};

export const ACTION_IDS = {
  CREATE_DOCUMENT: new Types.ObjectId('333333333333333333333001'),
  UPDATE_DOCUMENT: new Types.ObjectId('333333333333333333333002'),
  DELETE_DOCUMENT: new Types.ObjectId('333333333333333333333003'),
  SHARE_DOCUMENT: new Types.ObjectId('333333333333333333333004'),
  REVOKE_ACCESS: new Types.ObjectId('333333333333333333333005'),
  INVITE_USER: new Types.ObjectId('333333333333333333333006'),
  REMOVE_USER: new Types.ObjectId('333333333333333333333007'),
  CHANGE_USER_ROLE: new Types.ObjectId('333333333333333333333008'),
  UPDATE_SETTINGS: new Types.ObjectId('333333333333333333333009'),
  WORKSPACE_CREATION: new Types.ObjectId('333333333333333333333010'),
};

@Injectable()
export class ActivityActionSeeder {
  constructor(
    @InjectModel(ActionCategory.name)
    private readonly actionCategoryModel: Model<ActionCategory>,
    @InjectModel(Action.name)
    private readonly actionModel: Model<Action>,
  ) {}

  async seed() {
    const categories = [
      {
        _id: ACTION_CATEGORY_IDS.DOCUMENT,
        name: 'Document',
      },
      {
        _id: ACTION_CATEGORY_IDS.ACCESS_SHARING,
        name: 'Access & Sharing',
      },
      {
        _id: ACTION_CATEGORY_IDS.WORKSPACE_MEMBERS,
        name: 'Workspace & Members',
      },
    ];

    const actions = [
      {
        _id: ACTION_IDS.CREATE_DOCUMENT,
        code: ActivityLogAction.CREATE_DOCUMENT,
        action: 'Create document',
        categoryId: ACTION_CATEGORY_IDS.DOCUMENT,
      },
      {
        _id: ACTION_IDS.UPDATE_DOCUMENT,
        code: ActivityLogAction.UPDATE_DOCUMENT,
        action: 'Update document',
        categoryId: ACTION_CATEGORY_IDS.DOCUMENT,
      },
      {
        _id: ACTION_IDS.DELETE_DOCUMENT,
        code: ActivityLogAction.DELETE_DOCUMENT,
        action: 'Delete document',
        categoryId: ACTION_CATEGORY_IDS.DOCUMENT,
      },
      {
        _id: ACTION_IDS.SHARE_DOCUMENT,
        code: ActivityLogAction.SHARE_DOCUMENT,
        action: 'Share document',
        categoryId: ACTION_CATEGORY_IDS.ACCESS_SHARING,
      },
      {
        _id: ACTION_IDS.REVOKE_ACCESS,
        code: ActivityLogAction.REVOKE_ACCESS,
        action: 'Revoke access',
        categoryId: ACTION_CATEGORY_IDS.ACCESS_SHARING,
      },
      {
        _id: ACTION_IDS.INVITE_USER,
        code: ActivityLogAction.INVITE_USER,
        action: 'Invite user',
        categoryId: ACTION_CATEGORY_IDS.WORKSPACE_MEMBERS,
      },
      {
        _id: ACTION_IDS.REMOVE_USER,
        code: ActivityLogAction.REMOVE_USER,
        action: 'Remove user',
        categoryId: ACTION_CATEGORY_IDS.WORKSPACE_MEMBERS,
      },
      {
        _id: ACTION_IDS.CHANGE_USER_ROLE,
        code: ActivityLogAction.CHANGE_USER_ROLE,
        action: 'Change user role',
        categoryId: ACTION_CATEGORY_IDS.WORKSPACE_MEMBERS,
      },
      {
        _id: ACTION_IDS.UPDATE_SETTINGS,
        code: ActivityLogAction.UPDATE_SETTINGS,
        action: 'Update settings',
        categoryId: ACTION_CATEGORY_IDS.WORKSPACE_MEMBERS,
      },
      {
        _id: ACTION_IDS.WORKSPACE_CREATION,
        code: ActivityLogAction.WORKSPACE_CREATION,
        action: 'Workspace creation',
        categoryId: ACTION_CATEGORY_IDS.WORKSPACE_MEMBERS,
      },
    ];

    for (const category of categories) {
      const { _id, ...updateData } = category;

      await this.actionCategoryModel.updateOne(
        { _id },
        { $set: updateData },
        { upsert: true },
      );
    }

    for (const action of actions) {
      const { _id, ...updateData } = action;

      await this.actionModel.updateOne(
        { _id },
        { $set: updateData },
        { upsert: true },
      );
    }

    console.log('Activity actions seeded successfully');
  }
}
