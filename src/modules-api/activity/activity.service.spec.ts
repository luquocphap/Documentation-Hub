import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';
import {
  ActivityLogAction,
  type ActivityLogPayload,
} from 'src/common/events/activity-log.event';
import {
  ACTION_CATEGORY_IDS,
  ACTION_IDS,
} from 'src/common/seeds/activity-action.seed';
import { SocketGateway } from 'src/modules-system/socket/socket.gateway';
import { User } from '../auth/schemas/user.schema';
import { ActivityService } from './activity.service';
import { ActionCategory } from './schemas/action_categories.schema';
import { Action } from './schemas/actions.schema';
import { Activity, ActivityTargetType } from './schemas/activities.schema';

jest.mock('src/modules-system/socket/socket.gateway', () => ({
  SocketGateway: class SocketGateway {},
}));

type MockModel = Record<string, jest.Mock>;

function createQuery<T>(value: T) {
  const query: Record<string, jest.Mock> = {};

  query.populate = jest.fn(() => query);
  query.select = jest.fn(() => query);
  query.sort = jest.fn(() => query);
  query.skip = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.lean = jest.fn(() => query);
  query.exec = jest.fn().mockResolvedValue(value);

  return query;
}

function createMockModel(): MockModel {
  return {
    create: jest.fn(),
    distinct: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
  };
}

function createRequest(query: Request['query']): Request {
  return { query } as Request;
}

describe('ActivityService', () => {
  let service: ActivityService;
  let activityModel: MockModel;
  let userModel: MockModel;
  let actionModel: MockModel;
  let actionCategoryModel: MockModel;
  let socketGateway: {
    emitActivityCreated: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    activityModel = createMockModel();
    userModel = createMockModel();
    actionModel = createMockModel();
    actionCategoryModel = createMockModel();
    socketGateway = {
      emitActivityCreated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        {
          provide: getModelToken(Activity.name),
          useValue: activityModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
        {
          provide: getModelToken(Action.name),
          useValue: actionModel,
        },
        {
          provide: getModelToken(ActionCategory.name),
          useValue: actionCategoryModel,
        },
        {
          provide: SocketGateway,
          useValue: socketGateway,
        },
      ],
    }).compile();

    service = module.get(ActivityService);
  });

  describe('getActivityActors', () => {
    it('returns empty metadata without querying users when workspace has no actors', async () => {
      const workspaceId = new Types.ObjectId();
      activityModel.distinct.mockReturnValue(createQuery([]));

      await expect(
        service.getActivityActors(workspaceId.toString()),
      ).resolves.toEqual([]);

      expect(activityModel.distinct).toHaveBeenCalledWith('actorId', {
        workspaceId,
      });
      expect(userModel.find).not.toHaveBeenCalled();
    });

    it('returns workspace-scoped actors sorted by full name', async () => {
      const workspaceId = new Types.ObjectId();
      const firstActorId = new Types.ObjectId();
      const secondActorId = new Types.ObjectId();
      const actors = [
        {
          _id: firstActorId,
          fullName: 'Alice',
          email: 'alice@example.com',
        },
        {
          _id: secondActorId,
          fullName: 'Bob',
          email: 'bob@example.com',
        },
      ];
      const userQuery = createQuery(actors);

      activityModel.distinct.mockReturnValue(
        createQuery([firstActorId, secondActorId]),
      );
      userModel.find.mockReturnValue(userQuery);

      await expect(
        service.getActivityActors(workspaceId.toString()),
      ).resolves.toEqual([
        {
          id: firstActorId.toString(),
          fullName: 'Alice',
          email: 'alice@example.com',
        },
        {
          id: secondActorId.toString(),
          fullName: 'Bob',
          email: 'bob@example.com',
        },
      ]);

      expect(userModel.find).toHaveBeenCalledWith({
        _id: { $in: [firstActorId, secondActorId] },
      });
      expect(userQuery.select).toHaveBeenCalledWith('_id fullName email');
      expect(userQuery.sort).toHaveBeenCalledWith({ fullName: 1, _id: 1 });
    });
  });

  describe('getActivityActions', () => {
    it('groups actions by category and keeps empty categories', async () => {
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
          _id: ACTION_IDS.SHARE_DOCUMENT,
          code: ActivityLogAction.SHARE_DOCUMENT,
          action: 'Share document',
          categoryId: ACTION_CATEGORY_IDS.ACCESS_SHARING,
        },
      ];
      const categoryQuery = createQuery(categories);
      const actionQuery = createQuery(actions);

      actionCategoryModel.find.mockReturnValue(categoryQuery);
      actionModel.find.mockReturnValue(actionQuery);

      await expect(service.getActivityActions()).resolves.toEqual([
        {
          id: ACTION_CATEGORY_IDS.DOCUMENT.toString(),
          category: 'Document',
          actions: [
            {
              id: ACTION_IDS.CREATE_DOCUMENT.toString(),
              code: ActivityLogAction.CREATE_DOCUMENT,
              action: 'Create document',
            },
            {
              id: ACTION_IDS.UPDATE_DOCUMENT.toString(),
              code: ActivityLogAction.UPDATE_DOCUMENT,
              action: 'Update document',
            },
          ],
        },
        {
          id: ACTION_CATEGORY_IDS.ACCESS_SHARING.toString(),
          category: 'Access & Sharing',
          actions: [
            {
              id: ACTION_IDS.SHARE_DOCUMENT.toString(),
              code: ActivityLogAction.SHARE_DOCUMENT,
              action: 'Share document',
            },
          ],
        },
        {
          id: ACTION_CATEGORY_IDS.WORKSPACE_MEMBERS.toString(),
          category: 'Workspace & Members',
          actions: [],
        },
      ]);

      expect(categoryQuery.sort).toHaveBeenCalledWith({ _id: 1 });
      expect(actionQuery.sort).toHaveBeenCalledWith({
        categoryId: 1,
        _id: 1,
      });
    });
  });

  describe('getActivityLogs', () => {
    it('applies workspace-scoped filters, maps populated activities and paginates', async () => {
      const workspaceId = new Types.ObjectId();
      const firstActorId = new Types.ObjectId();
      const secondActorId = new Types.ObjectId();
      const firstActionId = ACTION_IDS.SHARE_DOCUMENT;
      const secondActionId = ACTION_IDS.UPDATE_SETTINGS;
      const firstActivityId = new Types.ObjectId();
      const secondActivityId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const createdAt = new Date('2026-06-15T12:00:00.000Z');
      const activityQuery = createQuery([
        {
          _id: firstActivityId,
          actorId: {
            _id: firstActorId,
            fullName: 'Alice',
            email: 'alice@example.com',
          },
          workspaceId: {
            _id: workspaceId,
            name: 'Engineering',
          },
          actionId: {
            _id: firstActionId,
            code: ActivityLogAction.SHARE_DOCUMENT,
            action: 'Share document',
            categoryId: ACTION_CATEGORY_IDS.ACCESS_SHARING,
          },
          targets: [
            {
              type: ActivityTargetType.DOCUMENT,
              value: 'Roadmap',
              entityId: documentId,
            },
            {
              type: ActivityTargetType.EMAIL,
              value: 'member@example.com',
              entityId: null,
            },
          ],
          created_at: createdAt,
        },
        {
          _id: secondActivityId,
          actorId: secondActorId,
          workspaceId,
          actionId: {
            _id: secondActionId,
            code: ActivityLogAction.UPDATE_SETTINGS,
          },
          targets: undefined,
          created_at: createdAt,
        },
      ]);
      let capturedCountFilter: Record<string, unknown> | undefined;
      let capturedFindFilter: Record<string, unknown> | undefined;

      activityModel.countDocuments.mockImplementation(
        (filter: Record<string, unknown>) => {
          capturedCountFilter = filter;
          return createQuery(21);
        },
      );
      activityModel.find.mockImplementation(
        (filter: Record<string, unknown>) => {
          capturedFindFilter = filter;
          return activityQuery;
        },
      );

      const result = await service.getActivityLogs(
        workspaceId.toString(),
        createRequest({
          actorIds: `${firstActorId.toString()},invalid,${secondActorId.toString()}`,
          actionIds: `${firstActionId.toString()},${secondActionId.toString()}`,
          createdFrom: '2026-06-01',
          createdTo: '2026-06-17',
          page: '2',
          pageSize: '10',
        }),
      );

      expect(capturedCountFilter).toEqual(capturedFindFilter);
      expect(capturedFindFilter).toEqual({
        actorId: { $in: [firstActorId, secondActorId] },
        actionId: { $in: [firstActionId, secondActionId] },
        created_at: {
          $gte: new Date('2026-06-01'),
          $lte: new Date('2026-06-17'),
        },
        workspaceId,
      });
      expect(activityQuery.populate).toHaveBeenNthCalledWith(
        1,
        'actorId',
        'fullName email',
      );
      expect(activityQuery.populate).toHaveBeenNthCalledWith(
        2,
        'workspaceId',
        'name',
      );
      expect(activityQuery.populate).toHaveBeenNthCalledWith(
        3,
        'actionId',
        'code action categoryId',
      );
      expect(activityQuery.sort).toHaveBeenCalledWith({ created_at: -1 });
      expect(activityQuery.skip).toHaveBeenCalledWith(10);
      expect(activityQuery.limit).toHaveBeenCalledWith(10);

      expect(result.items[0]).toEqual({
        id: firstActivityId.toString(),
        actorId: firstActorId.toString(),
        actorName: 'Alice',
        actorEmail: 'alice@example.com',
        workspaceId: workspaceId.toString(),
        workspaceName: 'Engineering',
        actionId: firstActionId.toString(),
        actionCode: ActivityLogAction.SHARE_DOCUMENT,
        actionName: 'Share document',
        actionCategoryId: ACTION_CATEGORY_IDS.ACCESS_SHARING.toString(),
        targets: [
          {
            type: ActivityTargetType.DOCUMENT,
            value: 'Roadmap',
            entityId: documentId.toString(),
          },
          {
            type: ActivityTargetType.EMAIL,
            value: 'member@example.com',
            entityId: null,
          },
        ],
        createdAt: createdAt.toISOString(),
      });
      expect(result.items[1]).toEqual({
        id: secondActivityId.toString(),
        actorId: secondActorId.toString(),
        actorName: 'Unknown',
        actorEmail: undefined,
        workspaceId: workspaceId.toString(),
        workspaceName: undefined,
        actionId: secondActionId.toString(),
        actionCode: ActivityLogAction.UPDATE_SETTINGS,
        actionName: undefined,
        actionCategoryId: undefined,
        targets: [],
        createdAt: createdAt.toISOString(),
      });
      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 10,
        total: 21,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('uses default pagination, caps pageSize and ignores invalid filters', async () => {
      const workspaceId = new Types.ObjectId();
      const activityQuery = createQuery([]);
      let capturedFilter: Record<string, unknown> | undefined;

      activityModel.countDocuments.mockImplementation(
        (filter: Record<string, unknown>) => {
          capturedFilter = filter;
          return createQuery(0);
        },
      );
      activityModel.find.mockReturnValue(activityQuery);

      const result = await service.getActivityLogs(
        workspaceId.toString(),
        createRequest({
          actorIds: 'invalid',
          actionIds: 'also-invalid',
          createdFrom: 'bad-date',
          createdTo: 'bad-date',
          page: '-1',
          pageSize: '100',
        }),
      );

      expect(capturedFilter).toEqual({ workspaceId });
      expect(activityQuery.skip).toHaveBeenCalledWith(0);
      expect(activityQuery.limit).toHaveBeenCalledWith(50);
      expect(result).toEqual({
        items: [],
        pagination: {
          page: 1,
          pageSize: 50,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    });

    it('uses default pageSize for non-positive values', async () => {
      const workspaceId = new Types.ObjectId();
      const activityQuery = createQuery([]);

      activityModel.countDocuments.mockReturnValue(createQuery(20));
      activityModel.find.mockReturnValue(activityQuery);

      const result = await service.getActivityLogs(
        workspaceId.toString(),
        createRequest({ page: '2', pageSize: '0' }),
      );

      expect(activityQuery.skip).toHaveBeenCalledWith(20);
      expect(activityQuery.limit).toHaveBeenCalledWith(20);
      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 20,
        total: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: true,
      });
    });

    it('throws when an activity has no populated action code', async () => {
      const activityId = new Types.ObjectId();

      activityModel.countDocuments.mockReturnValue(createQuery(1));
      activityModel.find.mockReturnValue(
        createQuery([
          {
            _id: activityId,
            actorId: new Types.ObjectId(),
            workspaceId: new Types.ObjectId(),
            actionId: new Types.ObjectId(),
            targets: [],
            created_at: new Date(),
          },
        ]),
      );

      await expect(
        service.getActivityLogs(
          new Types.ObjectId().toString(),
          createRequest({}),
        ),
      ).rejects.toThrow(`Activity ${activityId.toString()} has no action code`);
    });

    it('throws when required populated activity fields are incomplete', async () => {
      const activityId = new Types.ObjectId();

      activityModel.countDocuments.mockReturnValue(createQuery(1));
      activityModel.find.mockReturnValue(
        createQuery([
          {
            _id: activityId,
            actorId: null,
            workspaceId: new Types.ObjectId(),
            actionId: {
              _id: ACTION_IDS.UPDATE_SETTINGS,
              code: ActivityLogAction.UPDATE_SETTINGS,
            },
            targets: [],
            created_at: new Date(),
          },
        ]),
      );

      await expect(
        service.getActivityLogs(
          new Types.ObjectId().toString(),
          createRequest({}),
        ),
      ).rejects.toThrow(`Activity ${activityId.toString()} is incomplete`);
    });

    it('throws when an activity does not have created_at', async () => {
      const activityId = new Types.ObjectId();

      activityModel.countDocuments.mockReturnValue(createQuery(1));
      activityModel.find.mockReturnValue(
        createQuery([
          {
            _id: activityId,
            actorId: new Types.ObjectId(),
            workspaceId: new Types.ObjectId(),
            actionId: {
              _id: ACTION_IDS.UPDATE_SETTINGS,
              code: ActivityLogAction.UPDATE_SETTINGS,
            },
            targets: [],
          },
        ]),
      );

      await expect(
        service.getActivityLogs(
          new Types.ObjectId().toString(),
          createRequest({}),
        ),
      ).rejects.toThrow(`Activity ${activityId.toString()} is incomplete`);
    });
  });

  describe('handleActivityLog', () => {
    const actorId = new Types.ObjectId();
    const workspaceId = new Types.ObjectId();
    type DocumentActivityAction =
      | ActivityLogAction.CREATE_DOCUMENT
      | ActivityLogAction.UPDATE_DOCUMENT
      | ActivityLogAction.DELETE_DOCUMENT;
    type AccessActivityAction =
      | ActivityLogAction.SHARE_DOCUMENT
      | ActivityLogAction.REVOKE_ACCESS;
    type MemberActivityAction =
      | ActivityLogAction.INVITE_USER
      | ActivityLogAction.REMOVE_USER;
    type WorkspaceActivityAction =
      | ActivityLogAction.UPDATE_SETTINGS
      | ActivityLogAction.WORKSPACE_CREATION;
    const documentActivityActions: readonly DocumentActivityAction[] = [
      ActivityLogAction.CREATE_DOCUMENT,
      ActivityLogAction.UPDATE_DOCUMENT,
      ActivityLogAction.DELETE_DOCUMENT,
    ];
    const accessActivityActions: readonly AccessActivityAction[] = [
      ActivityLogAction.SHARE_DOCUMENT,
      ActivityLogAction.REVOKE_ACCESS,
    ];
    const memberActivityActions: readonly MemberActivityAction[] = [
      ActivityLogAction.INVITE_USER,
      ActivityLogAction.REMOVE_USER,
    ];
    const workspaceActivityActions: readonly WorkspaceActivityAction[] = [
      ActivityLogAction.UPDATE_SETTINGS,
      ActivityLogAction.WORKSPACE_CREATION,
    ];

    function buildDocumentActivityPayload(
      action: DocumentActivityAction,
      documentId: string,
    ): ActivityLogPayload {
      const base = {
        actorId: actorId.toString(),
        workspaceId: workspaceId.toString(),
        documentId,
        documentName: 'Roadmap',
      };

      switch (action) {
        case ActivityLogAction.CREATE_DOCUMENT:
          return { ...base, action: ActivityLogAction.CREATE_DOCUMENT };
        case ActivityLogAction.UPDATE_DOCUMENT:
          return { ...base, action: ActivityLogAction.UPDATE_DOCUMENT };
        case ActivityLogAction.DELETE_DOCUMENT:
          return { ...base, action: ActivityLogAction.DELETE_DOCUMENT };
      }
    }

    function buildAccessActivityPayload(
      action: AccessActivityAction,
      documentId: string,
      targetUserId: string,
    ): ActivityLogPayload {
      const base = {
        actorId: actorId.toString(),
        workspaceId: workspaceId.toString(),
        documentId,
        documentName: 'Roadmap',
        email: 'member@example.com',
        targetUserId,
      };

      switch (action) {
        case ActivityLogAction.SHARE_DOCUMENT:
          return { ...base, action: ActivityLogAction.SHARE_DOCUMENT };
        case ActivityLogAction.REVOKE_ACCESS:
          return { ...base, action: ActivityLogAction.REVOKE_ACCESS };
      }
    }

    function buildMemberActivityPayload(
      action: MemberActivityAction,
      targetUserId: string,
    ): ActivityLogPayload {
      const base = {
        actorId: actorId.toString(),
        workspaceId: workspaceId.toString(),
        email: 'member@example.com',
        targetUserId,
      };

      switch (action) {
        case ActivityLogAction.INVITE_USER:
          return { ...base, action: ActivityLogAction.INVITE_USER };
        case ActivityLogAction.REMOVE_USER:
          return { ...base, action: ActivityLogAction.REMOVE_USER };
      }
    }

    function buildWorkspaceActivityPayload(
      action: WorkspaceActivityAction,
    ): ActivityLogPayload {
      const base = {
        actorId: actorId.toString(),
        workspaceId: workspaceId.toString(),
      };

      switch (action) {
        case ActivityLogAction.UPDATE_SETTINGS:
          return { ...base, action: ActivityLogAction.UPDATE_SETTINGS };
        case ActivityLogAction.WORKSPACE_CREATION:
          return { ...base, action: ActivityLogAction.WORKSPACE_CREATION };
      }
    }

    async function captureCreatedActivity(payload: ActivityLogPayload) {
      let createdData:
        | {
            actorId: Types.ObjectId;
            workspaceId: Types.ObjectId;
            actionId: Types.ObjectId;
            targets: Array<{
              type: ActivityTargetType;
              value: string;
              entityId: Types.ObjectId | null;
            }>;
          }
        | undefined;
      const createdActivityId = new Types.ObjectId();

      activityModel.create.mockImplementation((data: unknown) => {
        createdData = data as NonNullable<typeof createdData>;
        return Promise.resolve({ _id: createdActivityId });
      });
      activityModel.findById.mockReturnValue(createQuery(null));

      await service.handleActivityLog(payload);
      return createdData;
    }

    it.each(documentActivityActions)(
      'builds a document target for %s',
      async (action) => {
        const documentId = new Types.ObjectId();
        const created = await captureCreatedActivity(
          buildDocumentActivityPayload(action, documentId.toString()),
        );

        expect(created).toEqual({
          actorId,
          workspaceId,
          actionId: ACTION_IDS[action],
          targets: [
            {
              type: ActivityTargetType.DOCUMENT,
              value: 'Roadmap',
              entityId: documentId,
            },
          ],
        });
      },
    );

    it.each(accessActivityActions)(
      'builds document and email targets for %s',
      async (action) => {
        const documentId = new Types.ObjectId();
        const targetUserId = new Types.ObjectId();
        const created = await captureCreatedActivity(
          buildAccessActivityPayload(
            action,
            documentId.toString(),
            targetUserId.toString(),
          ),
        );

        expect(created?.targets).toEqual([
          {
            type: ActivityTargetType.DOCUMENT,
            value: 'Roadmap',
            entityId: documentId,
          },
          {
            type: ActivityTargetType.EMAIL,
            value: 'member@example.com',
            entityId: targetUserId,
          },
        ]);
      },
    );

    it('keeps a null target user for a share event without registered user', async () => {
      const created = await captureCreatedActivity({
        action: ActivityLogAction.SHARE_DOCUMENT,
        actorId: actorId.toString(),
        workspaceId: workspaceId.toString(),
        documentId: new Types.ObjectId().toString(),
        documentName: 'Roadmap',
        email: 'new@example.com',
      });

      expect(created?.targets[1]).toEqual({
        type: ActivityTargetType.EMAIL,
        value: 'new@example.com',
        entityId: null,
      });
    });

    it.each(memberActivityActions)(
      'builds an email target for %s',
      async (action) => {
        const targetUserId = new Types.ObjectId();
        const created = await captureCreatedActivity(
          buildMemberActivityPayload(action, targetUserId.toString()),
        );

        expect(created?.targets).toEqual([
          {
            type: ActivityTargetType.EMAIL,
            value: 'member@example.com',
            entityId: targetUserId,
          },
        ]);
      },
    );

    it('keeps a null target user for an invitation to an unregistered email', async () => {
      const created = await captureCreatedActivity({
        action: ActivityLogAction.INVITE_USER,
        actorId: actorId.toString(),
        workspaceId: workspaceId.toString(),
        email: 'new@example.com',
      });

      expect(created?.targets[0].entityId).toBeNull();
    });

    it('builds email and role targets for a role change', async () => {
      const targetUserId = new Types.ObjectId();
      const roleId = new Types.ObjectId();
      const created = await captureCreatedActivity({
        action: ActivityLogAction.CHANGE_USER_ROLE,
        actorId: actorId.toString(),
        workspaceId: workspaceId.toString(),
        email: 'member@example.com',
        targetUserId: targetUserId.toString(),
        roleId: roleId.toString(),
        roleName: 'Admin',
      });

      expect(created?.targets).toEqual([
        {
          type: ActivityTargetType.EMAIL,
          value: 'member@example.com',
          entityId: targetUserId,
        },
        {
          type: ActivityTargetType.ROLE,
          value: 'Admin',
          entityId: roleId,
        },
      ]);
    });

    it.each(workspaceActivityActions)(
      'creates no targets for %s',
      async (action) => {
        const created = await captureCreatedActivity(
          buildWorkspaceActivityPayload(action),
        );

        expect(created?.targets).toEqual([]);
      },
    );

    it('persists, reloads, maps and emits a realtime activity', async () => {
      const createdActivityId = new Types.ObjectId();
      const targetUserId = new Types.ObjectId();
      const createdAt = new Date();

      activityModel.create.mockResolvedValue({ _id: createdActivityId });
      activityModel.findById.mockReturnValue(
        createQuery({
          _id: createdActivityId,
          actorId: {
            _id: actorId,
            fullName: 'Alice',
            email: 'alice@example.com',
          },
          workspaceId: {
            _id: workspaceId,
            name: 'Engineering',
          },
          actionId: {
            _id: ACTION_IDS.INVITE_USER,
            code: ActivityLogAction.INVITE_USER,
            action: 'Invite user',
            categoryId: ACTION_CATEGORY_IDS.WORKSPACE_MEMBERS,
          },
          targets: [
            {
              type: ActivityTargetType.EMAIL,
              value: 'member@example.com',
              entityId: targetUserId,
            },
          ],
          created_at: createdAt,
        }),
      );

      await service.handleActivityLog({
        action: ActivityLogAction.INVITE_USER,
        actorId: actorId.toString(),
        workspaceId: workspaceId.toString(),
        email: 'member@example.com',
        targetUserId: targetUserId.toString(),
      });

      expect(socketGateway.emitActivityCreated).toHaveBeenCalledWith(
        workspaceId.toString(),
        {
          id: createdActivityId.toString(),
          actorId: actorId.toString(),
          actorName: 'Alice',
          actorEmail: 'alice@example.com',
          workspaceId: workspaceId.toString(),
          workspaceName: 'Engineering',
          actionId: ACTION_IDS.INVITE_USER.toString(),
          actionCode: ActivityLogAction.INVITE_USER,
          actionName: 'Invite user',
          actionCategoryId: ACTION_CATEGORY_IDS.WORKSPACE_MEMBERS.toString(),
          targets: [
            {
              type: ActivityTargetType.EMAIL,
              value: 'member@example.com',
              entityId: targetUserId.toString(),
            },
          ],
          createdAt: createdAt.toISOString(),
        },
      );
    });

    it('logs and returns when persistence fails', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const writeError = new Error('database unavailable');
      activityModel.create.mockRejectedValue(writeError);

      await expect(
        service.handleActivityLog({
          action: ActivityLogAction.UPDATE_SETTINGS,
          actorId: actorId.toString(),
          workspaceId: workspaceId.toString(),
        }),
      ).resolves.toBeUndefined();

      expect(consoleError).toHaveBeenCalledWith(
        '[ActivityLog] Failed to write activity log',
        writeError,
      );
      expect(activityModel.findById).not.toHaveBeenCalled();
      expect(socketGateway.emitActivityCreated).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('returns without emitting when the newly created activity cannot be reloaded', async () => {
      activityModel.create.mockResolvedValue({ _id: new Types.ObjectId() });
      activityModel.findById.mockReturnValue(createQuery(null));

      await service.handleActivityLog({
        action: ActivityLogAction.UPDATE_SETTINGS,
        actorId: actorId.toString(),
        workspaceId: workspaceId.toString(),
      });

      expect(socketGateway.emitActivityCreated).not.toHaveBeenCalled();
    });

    it('logs realtime failures after persistence succeeds', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const createdActivityId = new Types.ObjectId();
      const realtimeError = new Error('socket unavailable');

      activityModel.create.mockResolvedValue({ _id: createdActivityId });
      activityModel.findById.mockReturnValue(
        createQuery({
          _id: createdActivityId,
          actorId: {
            _id: actorId,
            fullName: 'Alice',
          },
          workspaceId: {
            _id: workspaceId,
            name: 'Engineering',
          },
          actionId: {
            _id: ACTION_IDS.UPDATE_SETTINGS,
            code: ActivityLogAction.UPDATE_SETTINGS,
          },
          targets: [],
          created_at: new Date(),
        }),
      );
      socketGateway.emitActivityCreated.mockImplementation(() => {
        throw realtimeError;
      });

      await expect(
        service.handleActivityLog({
          action: ActivityLogAction.UPDATE_SETTINGS,
          actorId: actorId.toString(),
          workspaceId: workspaceId.toString(),
        }),
      ).resolves.toBeUndefined();

      expect(consoleError).toHaveBeenCalledWith(
        '[ActivityLog] Failed to emit realtime activity',
        realtimeError,
      );
      consoleError.mockRestore();
    });

    it('logs mapping failures after persistence succeeds', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const createdActivityId = new Types.ObjectId();

      activityModel.create.mockResolvedValue({ _id: createdActivityId });
      activityModel.findById.mockReturnValue(
        createQuery({
          _id: createdActivityId,
          actorId,
          workspaceId,
          actionId: ACTION_IDS.UPDATE_SETTINGS,
          targets: [],
          created_at: new Date(),
        }),
      );

      await service.handleActivityLog({
        action: ActivityLogAction.UPDATE_SETTINGS,
        actorId: actorId.toString(),
        workspaceId: workspaceId.toString(),
      });

      expect(consoleError).toHaveBeenCalledWith(
        '[ActivityLog] Failed to emit realtime activity',
        expect.any(Error),
      );
      expect(socketGateway.emitActivityCreated).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
