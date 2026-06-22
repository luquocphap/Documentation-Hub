import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { sendWorkspaceInvitationEmail } from 'src/common/email/send-workspace-invitation-email';
import {
  ACTIVITY_LOG_EVENT,
  ActivityLogAction,
} from 'src/common/events/activity-log.event';
import { ROLE_IDS } from 'src/common/seeds/role.seed';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import { DocumentModel } from '../document/schemas/documents.schema';
import {
  InvitationStatus,
  WorkspaceInvitation,
} from './schemas/workspace-invitation.schema';
import { WorkspaceRole } from './schemas/workspace-roles.schema';
import { WorkspaceMember } from './schemas/workspace_members.schema';
import { Workspace } from './schemas/workspaces.schema';
import { WorkspaceService } from './workspace.service';

jest.mock('src/common/email/send-workspace-invitation-email', () => ({
  sendWorkspaceInvitationEmail: jest.fn(),
}));

type MockModel = Record<string, jest.Mock>;

function createQuery<T>(value: T) {
  const query: Record<string, jest.Mock> = {};

  query.populate = jest.fn(() => query);
  query.select = jest.fn(() => query);
  query.sort = jest.fn(() => query);
  query.lean = jest.fn(() => query);
  query.exec = jest.fn().mockResolvedValue(value);

  return query;
}

function createMockModel(): MockModel {
  return {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    exists: jest.fn(),
    countDocuments: jest.fn(),
  };
}

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let workspaceModel: MockModel;
  let workspaceMemberModel: MockModel;
  let invitationModel: MockModel;
  let userModel: MockModel;
  let roleModel: MockModel;
  let documentModel: MockModel;
  let eventEmitter: {
    emit: jest.Mock;
    emitAsync: jest.Mock;
  };

  const mockedSendWorkspaceInvitationEmail =
    sendWorkspaceInvitationEmail as jest.Mock;

  const createUser = (
    overrides: Partial<{
      _id: Types.ObjectId;
      email: string;
      fullName: string;
      isEmailVerified: boolean;
    }> = {},
  ): UserDocument =>
    ({
      _id: new Types.ObjectId(),
      email: 'owner@example.com',
      fullName: 'Workspace Owner',
      isEmailVerified: true,
      ...overrides,
    }) as unknown as UserDocument;

  beforeEach(async () => {
    jest.clearAllMocks();

    workspaceModel = createMockModel();
    workspaceMemberModel = createMockModel();
    invitationModel = createMockModel();
    userModel = createMockModel();
    roleModel = createMockModel();
    documentModel = createMockModel();
    eventEmitter = {
      emit: jest.fn(),
      emitAsync: jest.fn().mockResolvedValue(undefined),
    };
    mockedSendWorkspaceInvitationEmail.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        {
          provide: getModelToken(Workspace.name),
          useValue: workspaceModel,
        },
        {
          provide: getModelToken(WorkspaceMember.name),
          useValue: workspaceMemberModel,
        },
        {
          provide: getModelToken(WorkspaceInvitation.name),
          useValue: invitationModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
        {
          provide: getModelToken(WorkspaceRole.name),
          useValue: roleModel,
        },
        {
          provide: getModelToken(DocumentModel.name),
          useValue: documentModel,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    service = module.get(WorkspaceService);
  });

  describe('create', () => {
    it('creates a workspace, adds the owner as admin and emits events', async () => {
      const user = createUser();
      const workspaceId = new Types.ObjectId();
      const workspace = {
        _id: workspaceId,
        name: 'Engineering',
        description: null,
      };

      workspaceModel.create.mockResolvedValue(workspace);
      workspaceMemberModel.create.mockResolvedValue({});

      await expect(
        service.create({ name: 'Engineering' }, user),
      ).resolves.toEqual({ _id: workspaceId });

      expect(workspaceModel.create).toHaveBeenCalledWith({
        name: 'Engineering',
        description: null,
        memberCount: 1,
      });
      expect(workspaceMemberModel.create).toHaveBeenCalledWith({
        workspaceId,
        userId: user._id,
        roleId: ROLE_IDS.ADMIN_WORKSPACE,
        workspaceName: 'Engineering',
        workspaceDescription: null,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('workspace.member.added', {
        workspaceId: workspaceId.toString(),
        userId: user._id.toString(),
      });
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ACTIVITY_LOG_EVENT, {
        action: ActivityLogAction.WORKSPACE_CREATION,
        actorId: user._id.toString(),
        workspaceId: workspaceId.toString(),
      });
    });

    it('does not fail workspace creation when activity logging rejects', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const user = createUser();
      const workspaceId = new Types.ObjectId();

      workspaceModel.create.mockResolvedValue({
        _id: workspaceId,
        name: 'Engineering',
        description: 'Team documents',
      });
      workspaceMemberModel.create.mockResolvedValue({});
      eventEmitter.emitAsync.mockRejectedValue(
        new Error('activity service unavailable'),
      );

      await expect(
        service.create(
          {
            name: 'Engineering',
            description: 'Team documents',
          },
          user,
        ),
      ).resolves.toEqual({ _id: workspaceId });

      await Promise.resolve();
      expect(consoleError).toHaveBeenCalledWith(
        '[ActivityLog] Workspace event failed',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });
  });

  describe('findAll', () => {
    it('filters deleted workspaces and maps membership information', async () => {
      const user = createUser();
      const workspaceId = new Types.ObjectId();
      const joinedAt = new Date();
      const createdAt = new Date();
      const query = createQuery([
        {
          workspaceId: {
            _id: workspaceId,
            memberCount: 3,
            created_at: createdAt,
          },
          workspaceName: 'Engineering',
          workspaceDescription: 'Team documents',
          roleId: { name: 'Admin' },
          joinedAt,
        },
        {
          workspaceId: null,
          workspaceName: 'Deleted workspace',
        },
      ]);
      workspaceMemberModel.find.mockReturnValue(query);

      await expect(service.findAll(user)).resolves.toEqual([
        {
          _id: workspaceId,
          workspaceName: 'Engineering',
          workspaceDescription: 'Team documents',
          createdAt,
          userRole: 'Admin',
          memberCount: 3,
          joinedAt,
        },
      ]);

      expect(workspaceMemberModel.find).toHaveBeenCalledWith({
        userId: user._id,
        isDeleted: { $ne: true },
      });
      expect(query.populate).toHaveBeenCalledTimes(2);
      expect(query.sort).toHaveBeenCalledWith({ joinedAt: -1 });
    });
  });

  describe('findOne', () => {
    it('returns workspace details, user role and documents', async () => {
      const user = createUser();
      const workspaceId = new Types.ObjectId();
      const createdAt = new Date();
      const documents = [{ _id: new Types.ObjectId(), title: 'Roadmap' }];

      workspaceModel.findOne.mockReturnValue(
        createQuery({
          _id: workspaceId,
          name: 'Engineering',
          description: 'Team documents',
          memberCount: 2,
          created_at: createdAt,
        }),
      );
      documentModel.find.mockReturnValue(createQuery(documents));
      workspaceMemberModel.findOne.mockReturnValue(
        createQuery({ roleId: { name: 'Admin' } }),
      );

      await expect(
        service.findOne(workspaceId.toString(), user),
      ).resolves.toEqual({
        _id: workspaceId,
        name: 'Engineering',
        description: 'Team documents',
        memberCount: 2,
        created_at: createdAt,
        userRole: 'Admin',
        documents,
      });
    });

    it('throws when the workspace does not exist', async () => {
      const workspaceId = new Types.ObjectId();

      workspaceModel.findOne.mockReturnValue(createQuery(null));
      documentModel.find.mockReturnValue(createQuery([]));
      workspaceMemberModel.findOne.mockReturnValue(createQuery({}));

      await expect(
        service.findOne(workspaceId.toString(), createUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the current user is not a workspace member', async () => {
      const workspaceId = new Types.ObjectId();

      workspaceModel.findOne.mockReturnValue(
        createQuery({
          _id: workspaceId,
          name: 'Engineering',
        }),
      );
      documentModel.find.mockReturnValue(createQuery([]));
      workspaceMemberModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.findOne(workspaceId.toString(), createUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('update', () => {
    it('updates workspace and denormalized member fields', async () => {
      const workspaceId = new Types.ObjectId().toString();
      const user = createUser();
      const updatedWorkspace = {
        _id: new Types.ObjectId(workspaceId),
        name: 'New name',
        description: 'New description',
        isDeleted: false,
      };
      const updateMembersQuery = createQuery({ modifiedCount: 2 });

      workspaceModel.findByIdAndUpdate.mockReturnValue(
        createQuery(updatedWorkspace),
      );
      workspaceMemberModel.updateMany.mockReturnValue(updateMembersQuery);

      await expect(
        service.update(
          workspaceId,
          {
            name: 'New name',
            description: 'New description',
          },
          user,
        ),
      ).resolves.toBe(updatedWorkspace);

      expect(workspaceMemberModel.updateMany).toHaveBeenCalledWith(
        { workspaceId },
        {
          $set: {
            workspaceName: 'New name',
            workspaceDescription: 'New description',
          },
        },
      );
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ACTIVITY_LOG_EVENT, {
        action: ActivityLogAction.UPDATE_SETTINGS,
        actorId: user._id.toString(),
        workspaceId,
      });
    });

    it('throws when the workspace does not exist', async () => {
      workspaceModel.findByIdAndUpdate.mockReturnValue(createQuery(null));

      await expect(
        service.update(
          new Types.ObjectId().toString(),
          { name: 'New name' },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(workspaceMemberModel.updateMany).not.toHaveBeenCalled();
    });

    it('throws when the updated workspace was already deleted', async () => {
      workspaceModel.findByIdAndUpdate.mockReturnValue(
        createQuery({ isDeleted: true }),
      );
      workspaceMemberModel.updateMany.mockReturnValue(createQuery({}));

      await expect(
        service.update(
          new Types.ObjectId().toString(),
          { name: 'New name' },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft deletes the workspace and all memberships', async () => {
      const workspaceId = new Types.ObjectId();
      const user = createUser();
      let capturedMemberUpdate:
        | {
            filter: { workspaceId: Types.ObjectId };
            update: {
              $set: {
                isDeleted: boolean;
                deletedAt: Date;
                deletedBy: Types.ObjectId;
              };
            };
          }
        | undefined;

      workspaceModel.findByIdAndUpdate.mockReturnValue(
        createQuery({ _id: workspaceId, isDeleted: true }),
      );
      workspaceMemberModel.updateMany.mockImplementation(
        (filter: unknown, update: unknown) => {
          capturedMemberUpdate = {
            filter: filter as { workspaceId: Types.ObjectId },
            update: update as {
              $set: {
                isDeleted: boolean;
                deletedAt: Date;
                deletedBy: Types.ObjectId;
              };
            },
          };
          return createQuery({ modifiedCount: 2 });
        },
      );

      await expect(
        service.remove(workspaceId.toString(), user),
      ).resolves.toHaveProperty('message');

      expect(capturedMemberUpdate?.filter).toEqual({ workspaceId });
      expect(capturedMemberUpdate?.update.$set.isDeleted).toBe(true);
      expect(capturedMemberUpdate?.update.$set.deletedAt).toBeInstanceOf(Date);
      expect(capturedMemberUpdate?.update.$set.deletedBy).toEqual(user._id);
    });

    it('throws when the workspace does not exist', async () => {
      workspaceModel.findByIdAndUpdate.mockReturnValue(createQuery(null));

      await expect(
        service.remove(new Types.ObjectId().toString(), createUser()),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(workspaceMemberModel.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('findPendingInvitationForRegistration', () => {
    it('returns invitation context for a matching pending invite', async () => {
      const invitationId = new Types.ObjectId();
      const workspaceId = new Types.ObjectId().toString();

      invitationModel.findOne.mockReturnValue(
        createQuery({ _id: invitationId }),
      );

      await expect(
        service.findPendingInvitationForRegistration({
          email: 'MEMBER@EXAMPLE.COM',
          workspaceId,
        }),
      ).resolves.toEqual({
        invitationId,
        redirectTo: `/workspaces/${workspaceId}`,
      });

      expect(invitationModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'member@example.com',
          status: InvitationStatus.PENDING,
        }),
      );
    });

    it('returns null when no pending invitation matches', async () => {
      invitationModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.findPendingInvitationForRegistration({
          email: 'member@example.com',
          workspaceId: new Types.ObjectId().toString(),
        }),
      ).resolves.toBeNull();
    });
  });

  describe('acceptInvitationAfterEmailVerified', () => {
    function createInvitation(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return {
        _id: new Types.ObjectId(),
        email: 'member@example.com',
        workspaceId: new Types.ObjectId(),
        roleId: ROLE_IDS.MEMBER_WORKSPACE,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 60 * 1000),
        ...overrides,
      };
    }

    function prepareWorkspace(workspaceId: Types.ObjectId) {
      workspaceModel.findOne.mockReturnValue(
        createQuery({
          _id: workspaceId,
          name: 'Engineering',
          description: 'Team documents',
        }),
      );
    }

    it('returns unavailable when the invitation does not exist', async () => {
      invitationModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: new Types.ObjectId(),
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual({ status: 'unavailable' });
    });

    it('expires a pending invitation that has passed its expiry time', async () => {
      const invitation = createInvitation({
        expiresAt: new Date(Date.now() - 1000),
      });
      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      invitationModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'MEMBER@EXAMPLE.COM',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual({ status: 'expired' });

      expect(invitationModel.updateOne).toHaveBeenCalledWith(
        {
          _id: invitation._id,
          status: InvitationStatus.PENDING,
        },
        { $set: { status: InvitationStatus.EXPIRED } },
      );
    });

    it('returns expired without updating an invitation already marked expired', async () => {
      const invitation = createInvitation({
        status: InvitationStatus.EXPIRED,
      });
      invitationModel.findOne.mockReturnValue(createQuery(invitation));

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual({ status: 'expired' });

      expect(invitationModel.updateOne).not.toHaveBeenCalled();
    });

    it('returns unavailable when invitation workspaceId is invalid', async () => {
      const invitation = createInvitation({
        workspaceId: { toString: () => 'invalid-workspace-id' },
      });
      invitationModel.findOne.mockReturnValue(createQuery(invitation));

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual({ status: 'unavailable' });
    });

    it('returns unavailable when the invited workspace was deleted', async () => {
      const invitation = createInvitation();
      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      workspaceModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual({ status: 'unavailable' });
    });

    it('returns accepted idempotently for an accepted invitation with an active member', async () => {
      const workspaceId = new Types.ObjectId();
      const invitation = createInvitation({
        workspaceId,
        status: InvitationStatus.ACCEPTED,
      });

      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      prepareWorkspace(workspaceId);
      workspaceMemberModel.exists.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      workspaceMemberModel.countDocuments.mockResolvedValue(4);
      workspaceModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual({
        status: 'accepted',
        redirectTo: `/workspaces/${workspaceId.toString()}`,
        memberAdded: false,
        workspaceId: workspaceId.toString(),
      });

      expect(workspaceModel.updateOne).toHaveBeenCalledWith(
        { _id: workspaceId, isDeleted: { $ne: true } },
        { $set: { memberCount: 4 } },
      );
    });

    it('returns processed for an accepted invitation without an active member', async () => {
      const workspaceId = new Types.ObjectId();
      const invitation = createInvitation({
        workspaceId,
        status: InvitationStatus.ACCEPTED,
      });

      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      prepareWorkspace(workspaceId);
      workspaceMemberModel.exists.mockResolvedValue(null);

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual({ status: 'processed' });
    });

    it('returns processed when another request already claimed the invitation', async () => {
      const workspaceId = new Types.ObjectId();
      const invitation = createInvitation({ workspaceId });

      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      prepareWorkspace(workspaceId);
      invitationModel.updateOne.mockResolvedValue({ modifiedCount: 0 });

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual({ status: 'processed' });
    });

    it('accepts without adding a duplicate when the member is already active', async () => {
      const workspaceId = new Types.ObjectId();
      const invitation = createInvitation({ workspaceId });

      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      prepareWorkspace(workspaceId);
      invitationModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      workspaceMemberModel.exists
        .mockResolvedValueOnce({ _id: new Types.ObjectId() })
        .mockResolvedValueOnce({ _id: new Types.ObjectId() });
      workspaceMemberModel.countDocuments.mockResolvedValue(2);
      workspaceModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          status: 'accepted',
          memberAdded: false,
        }),
      );

      expect(workspaceMemberModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(workspaceMemberModel.create).not.toHaveBeenCalled();
    });

    it('restores a soft-deleted member when accepting an invitation', async () => {
      const workspaceId = new Types.ObjectId();
      const invitation = createInvitation({ workspaceId });

      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      prepareWorkspace(workspaceId);
      invitationModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      workspaceMemberModel.exists
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: new Types.ObjectId() });
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(
        createQuery({ _id: new Types.ObjectId(), isDeleted: false }),
      );
      workspaceMemberModel.countDocuments.mockResolvedValue(2);
      workspaceModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          status: 'accepted',
          memberAdded: true,
        }),
      );

      expect(workspaceMemberModel.create).not.toHaveBeenCalled();
    });

    it('creates a new member when no active or deleted membership exists', async () => {
      const workspaceId = new Types.ObjectId();
      const invitation = createInvitation({ workspaceId });

      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      prepareWorkspace(workspaceId);
      invitationModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      workspaceMemberModel.exists
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: new Types.ObjectId() });
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(createQuery(null));
      workspaceMemberModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      workspaceMemberModel.countDocuments.mockResolvedValue(2);
      workspaceModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          status: 'accepted',
          memberAdded: true,
        }),
      );

      expect(workspaceMemberModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          roleId: invitation.roleId,
          workspaceName: 'Engineering',
        }),
      );
    });

    it('treats duplicate-key member creation as an idempotent success', async () => {
      const workspaceId = new Types.ObjectId();
      const invitation = createInvitation({ workspaceId });

      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      prepareWorkspace(workspaceId);
      invitationModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      workspaceMemberModel.exists
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: new Types.ObjectId() });
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(createQuery(null));
      workspaceMemberModel.create.mockRejectedValue({ code: 11000 });
      workspaceMemberModel.countDocuments.mockResolvedValue(2);
      workspaceModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          status: 'accepted',
          memberAdded: false,
        }),
      );
    });

    it('rolls the invitation back to pending when member creation fails', async () => {
      const workspaceId = new Types.ObjectId();
      const invitation = createInvitation({ workspaceId });
      const createError = new Error('member write failed');

      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      prepareWorkspace(workspaceId);
      invitationModel.updateOne
        .mockResolvedValueOnce({ modifiedCount: 1 })
        .mockResolvedValueOnce({ modifiedCount: 1 });
      workspaceMemberModel.exists.mockResolvedValue(null);
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(createQuery(null));
      workspaceMemberModel.create.mockRejectedValue(createError);

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).rejects.toBe(createError);

      expect(invitationModel.updateOne).toHaveBeenLastCalledWith(
        {
          _id: invitation._id,
          status: InvitationStatus.ACCEPTED,
        },
        { $set: { status: InvitationStatus.PENDING } },
      );
    });

    it('returns processed when membership is still inactive after acceptance', async () => {
      const workspaceId = new Types.ObjectId();
      const invitation = createInvitation({ workspaceId });

      invitationModel.findOne.mockReturnValue(createQuery(invitation));
      prepareWorkspace(workspaceId);
      invitationModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      workspaceMemberModel.exists
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(
        createQuery({ _id: new Types.ObjectId() }),
      );

      await expect(
        service.acceptInvitationAfterEmailVerified({
          invitationId: invitation._id as Types.ObjectId,
          email: 'member@example.com',
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toEqual({ status: 'processed' });

      expect(workspaceMemberModel.countDocuments).not.toHaveBeenCalled();
    });
  });

  describe('inviteMember', () => {
    const workspaceId = new Types.ObjectId().toString();
    const roleId = ROLE_IDS.MEMBER_WORKSPACE.toString();

    function prepareWorkspaceAndRole() {
      workspaceModel.findOne.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(workspaceId),
          name: 'Engineering',
          description: 'Team documents',
        }),
      );
      roleModel.findById.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(roleId),
          name: 'Member',
        }),
      );
    }

    it('throws when the workspace does not exist', async () => {
      workspaceModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.inviteMember(
          workspaceId,
          { email: 'member@example.com', roleId },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(roleModel.findById).not.toHaveBeenCalled();
    });

    it('throws when the selected role does not exist', async () => {
      workspaceModel.findOne.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(workspaceId),
          name: 'Engineering',
        }),
      );
      roleModel.findById.mockReturnValue(createQuery(null));

      await expect(
        service.inviteMember(
          workspaceId,
          { email: 'member@example.com', roleId },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when a verified user is already an active member', async () => {
      prepareWorkspaceAndRole();
      userModel.findOne.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(),
          isEmailVerified: true,
        }),
      );
      workspaceMemberModel.exists.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      await expect(
        service.inviteMember(
          workspaceId,
          { email: 'MEMBER@EXAMPLE.COM', roleId },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockedSendWorkspaceInvitationEmail).not.toHaveBeenCalled();
    });

    it('adds a verified user directly, sends email and emits events', async () => {
      const inviter = createUser();
      const invitedUserId = new Types.ObjectId();
      let invitationEmail:
        | {
            to: string;
            workspaceName: string;
            inviterName: string;
            roleName: string;
            actionUrl: string;
          }
        | undefined;

      prepareWorkspaceAndRole();
      userModel.findOne.mockReturnValue(
        createQuery({
          _id: invitedUserId,
          isEmailVerified: true,
        }),
      );
      workspaceMemberModel.exists.mockResolvedValue(null);
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(
        createQuery({ _id: new Types.ObjectId() }),
      );
      workspaceModel.findByIdAndUpdate.mockResolvedValue({});
      mockedSendWorkspaceInvitationEmail.mockImplementation(
        (payload: unknown) => {
          invitationEmail = payload as {
            to: string;
            workspaceName: string;
            inviterName: string;
            roleName: string;
            actionUrl: string;
          };
          return Promise.resolve();
        },
      );

      await expect(
        service.inviteMember(
          workspaceId,
          { email: 'MEMBER@EXAMPLE.COM', roleId },
          inviter,
        ),
      ).resolves.toHaveProperty('message');

      expect(invitationEmail).toEqual(
        expect.objectContaining({
          to: 'member@example.com',
          workspaceName: 'Engineering',
          inviterName: inviter.fullName,
          roleName: 'Member',
        }),
      );
      expect(invitationEmail?.actionUrl).toContain(
        `/workspaces/${workspaceId}`,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('workspace.member.added', {
        workspaceId,
        userId: invitedUserId.toString(),
      });
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        ACTIVITY_LOG_EVENT,
        expect.objectContaining({
          action: ActivityLogAction.INVITE_USER,
          targetUserId: invitedUserId.toString(),
        }),
      );
    });

    it('throws when an active pending invitation already exists', async () => {
      prepareWorkspaceAndRole();
      userModel.findOne.mockReturnValue(createQuery(null));
      invitationModel.exists.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      await expect(
        service.inviteMember(
          workspaceId,
          { email: 'member@example.com', roleId },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(invitationModel.create).not.toHaveBeenCalled();
    });

    it('creates and emails an invitation for an unregistered user', async () => {
      const inviter = createUser();

      prepareWorkspaceAndRole();
      userModel.findOne.mockReturnValue(createQuery(null));
      invitationModel.exists.mockResolvedValue(null);
      invitationModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      await expect(
        service.inviteMember(
          workspaceId,
          { email: 'NEW@EXAMPLE.COM', roleId },
          inviter,
        ),
      ).resolves.toHaveProperty('message');

      expect(invitationModel.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        workspaceId: new Types.ObjectId(workspaceId),
        roleId: new Types.ObjectId(roleId),
        inviterId: inviter._id,
      });
      expect(mockedSendWorkspaceInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'new@example.com',
          workspaceName: 'Engineering',
        }),
      );
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        ACTIVITY_LOG_EVENT,
        expect.objectContaining({
          action: ActivityLogAction.INVITE_USER,
          email: 'new@example.com',
          targetUserId: undefined,
        }),
      );
    });

    it('includes an existing unverified user in the invitation activity event', async () => {
      const unverifiedUserId = new Types.ObjectId();

      prepareWorkspaceAndRole();
      userModel.findOne.mockReturnValue(
        createQuery({
          _id: unverifiedUserId,
          isEmailVerified: false,
        }),
      );
      invitationModel.exists.mockResolvedValue(null);
      invitationModel.create.mockResolvedValue({});

      await service.inviteMember(
        workspaceId,
        { email: 'member@example.com', roleId },
        createUser(),
      );

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        ACTIVITY_LOG_EVENT,
        expect.objectContaining({
          targetUserId: unverifiedUserId.toString(),
        }),
      );
    });
  });

  describe('getWorkspaceRoles', () => {
    it('returns roles without permissions', async () => {
      const roles = [
        { _id: ROLE_IDS.ADMIN_WORKSPACE, name: 'Admin' },
        { _id: ROLE_IDS.MEMBER_WORKSPACE, name: 'Member' },
      ];
      const query = createQuery(roles);
      roleModel.find.mockReturnValue(query);

      await expect(service.getWorkspaceRoles()).resolves.toBe(roles);
      expect(query.select).toHaveBeenCalledWith('-permissions');
    });
  });

  describe('getMembers', () => {
    it('maps populated workspace members', async () => {
      const workspaceId = new Types.ObjectId();
      const userId = new Types.ObjectId();
      const roleId = new Types.ObjectId();
      const joinedAt = new Date();
      const query = createQuery([
        {
          userId: {
            _id: userId,
            fullName: 'Member',
            email: 'member@example.com',
          },
          roleId: {
            _id: roleId,
            name: 'Member',
          },
          joinedAt,
        },
      ]);
      workspaceMemberModel.find.mockReturnValue(query);

      await expect(service.getMembers(workspaceId.toString())).resolves.toEqual(
        [
          {
            userId,
            fullName: 'Member',
            email: 'member@example.com',
            role: 'Member',
            roleId,
            joinedAt,
          },
        ],
      );

      expect(query.populate).toHaveBeenCalledTimes(2);
      expect(query.sort).toHaveBeenCalledWith({ joinedAt: 1 });
    });
  });

  describe('changeMemberRole', () => {
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const roleId = new Types.ObjectId().toString();

    it('throws when the new role does not exist', async () => {
      roleModel.findById.mockReturnValue(createQuery(null));

      await expect(
        service.changeMemberRole(workspaceId, { userId, roleId }, createUser()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the target member is missing', async () => {
      roleModel.findById.mockReturnValue(createQuery({ name: 'Member' }));
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(createQuery(null));

      await expect(
        service.changeMemberRole(workspaceId, { userId, roleId }, createUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the role and emits activity with the target email', async () => {
      const currentUser = createUser();

      roleModel.findById.mockReturnValue(createQuery({ name: 'Admin' }));
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(
        createQuery({ _id: new Types.ObjectId() }),
      );
      userModel.findById.mockReturnValue(
        createQuery({ email: 'target@example.com' }),
      );

      await expect(
        service.changeMemberRole(workspaceId, { userId, roleId }, currentUser),
      ).resolves.toHaveProperty('message');

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ACTIVITY_LOG_EVENT, {
        action: ActivityLogAction.CHANGE_USER_ROLE,
        actorId: currentUser._id.toString(),
        workspaceId,
        email: 'target@example.com',
        targetUserId: userId,
        roleId,
        roleName: 'Admin',
      });
    });

    it('uses userId as activity fallback when target user lookup is empty', async () => {
      roleModel.findById.mockReturnValue(createQuery({ name: 'Member' }));
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(
        createQuery({ _id: new Types.ObjectId() }),
      );
      userModel.findById.mockReturnValue(createQuery(null));

      await service.changeMemberRole(
        workspaceId,
        { userId, roleId },
        createUser(),
      );

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        ACTIVITY_LOG_EVENT,
        expect.objectContaining({ email: userId }),
      );
    });
  });

  describe('removeMember', () => {
    const workspaceId = new Types.ObjectId().toString();
    const targetUserId = new Types.ObjectId().toString();

    it('throws when the target member does not exist', async () => {
      workspaceMemberModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.removeMember(workspaceId, targetUserId, createUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when a user attempts to remove themselves', async () => {
      const currentUser = createUser();
      workspaceMemberModel.findOne.mockReturnValue(
        createQuery({ _id: new Types.ObjectId() }),
      );

      await expect(
        service.removeMember(
          workspaceId,
          currentUser._id.toString(),
          currentUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(workspaceMemberModel.find).not.toHaveBeenCalled();
    });

    it('throws when removing the only active workspace admin', async () => {
      workspaceMemberModel.findOne.mockReturnValue(
        createQuery({ _id: new Types.ObjectId() }),
      );
      workspaceMemberModel.find.mockReturnValue(
        createQuery([{ userId: new Types.ObjectId(targetUserId) }]),
      );

      await expect(
        service.removeMember(workspaceId, targetUserId, createUser()),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(workspaceMemberModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('soft deletes a member, decrements count and emits activity', async () => {
      const currentUser = createUser();
      const targetMemberId = new Types.ObjectId();

      workspaceMemberModel.findOne.mockReturnValue(
        createQuery({ _id: targetMemberId }),
      );
      workspaceMemberModel.find.mockReturnValue(
        createQuery([
          { userId: new Types.ObjectId() },
          { userId: new Types.ObjectId(targetUserId) },
        ]),
      );
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(
        createQuery({ _id: targetMemberId, isDeleted: true }),
      );
      workspaceModel.findByIdAndUpdate.mockReturnValue(createQuery({}));
      userModel.findById.mockReturnValue(
        createQuery({ email: 'target@example.com' }),
      );

      await expect(
        service.removeMember(workspaceId, targetUserId, currentUser),
      ).resolves.toHaveProperty('message');

      expect(workspaceModel.findByIdAndUpdate).toHaveBeenCalledWith(
        workspaceId,
        { $inc: { memberCount: -1 } },
        { returnDocument: 'after' },
      );
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ACTIVITY_LOG_EVENT, {
        action: ActivityLogAction.REMOVE_USER,
        actorId: currentUser._id.toString(),
        workspaceId,
        email: 'target@example.com',
        targetUserId,
      });
    });

    it('does not decrement count when the soft delete did not update a member', async () => {
      workspaceMemberModel.findOne.mockReturnValue(
        createQuery({ _id: new Types.ObjectId() }),
      );
      workspaceMemberModel.find.mockReturnValue(createQuery([]));
      workspaceMemberModel.findOneAndUpdate.mockReturnValue(createQuery(null));
      userModel.findById.mockReturnValue(createQuery(null));

      await service.removeMember(workspaceId, targetUserId, createUser());

      expect(workspaceModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        ACTIVITY_LOG_EVENT,
        expect.objectContaining({ email: targetUserId }),
      );
    });
  });
});
