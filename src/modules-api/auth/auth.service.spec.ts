import { BadRequestException, GoneException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { sendVerifyEmail } from 'src/common/email/send-verify-email';
import { RedisService } from 'src/modules-system/redis/redis.service';
import { TokenService } from 'src/modules-system/token/token.service';
import { DocumentMember } from '../document/schemas/document-members.schema';
import { WorkspaceMember } from '../workspace/schemas/workspace_members.schema';
import { WorkspaceService } from '../workspace/workspace.service';
import { AuthService } from './auth.service';
import { User } from './schemas/user.schema';
import { VerificationToken } from './schemas/verification-token.schema';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('src/common/email/send-verify-email', () => ({
  sendVerifyEmail: jest.fn(),
}));

jest.mock('src/common/email/send-workspace-invitation-email', () => ({
  sendWorkspaceInvitationEmail: jest.fn(),
}));

type MockModel = jest.Mock & {
  find: jest.Mock;
  findOne: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
  updateOne: jest.Mock;
  updateMany: jest.Mock;
};

function createExecQuery<T>(value: T) {
  const query: Record<string, jest.Mock> = {};

  query.select = jest.fn(() => query);
  query.sort = jest.fn(() => query);
  query.lean = jest.fn(() => query);
  query.exec = jest.fn().mockResolvedValue(value);

  return query;
}

function createLeanQuery<T>(value: T) {
  const query: Record<string, jest.Mock> = {};

  query.select = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.lean = jest.fn().mockResolvedValue(value);

  return query;
}

function createMockModel(): MockModel {
  return Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
  });
}

function createRequest(cookies: Record<string, string | undefined>): Request {
  return { cookies } as Request;
}

describe('AuthService', () => {
  let service: AuthService;
  let userModel: MockModel;
  let verificationTokenModel: MockModel;
  let workspaceMemberModel: MockModel;
  let documentMemberModel: MockModel;

  let redisClient: {
    set: jest.Mock;
    eval: jest.Mock;
    del: jest.Mock;
  };
  let redisService: { getClient: jest.Mock };
  let tokenService: {
    createAccessToken: jest.Mock;
    createRefreshToken: jest.Mock;
    verifyAccessToken: jest.Mock;
    verifyRefreshToken: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let workspaceService: {
    findPendingInvitationForRegistration: jest.Mock;
    acceptInvitationAfterEmailVerified: jest.Mock;
  };

  const mockedHash = bcrypt.hash as jest.Mock;
  const mockedCompare = bcrypt.compare as jest.Mock;
  const mockedSendVerifyEmail = sendVerifyEmail as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    userModel = createMockModel();
    verificationTokenModel = createMockModel();
    workspaceMemberModel = createMockModel();
    documentMemberModel = createMockModel();

    redisClient = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    };
    redisService = {
      getClient: jest.fn(() => redisClient),
    };
    tokenService = {
      createAccessToken: jest.fn().mockReturnValue('access-token'),
      createRefreshToken: jest.fn().mockReturnValue({
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
      verifyAccessToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
    };
    eventEmitter = {
      emit: jest.fn(),
    };
    workspaceService = {
      findPendingInvitationForRegistration: jest.fn(),
      acceptInvitationAfterEmailVerified: jest.fn(),
    };

    mockedHash.mockResolvedValue('hashed-password');
    mockedCompare.mockResolvedValue(true);
    mockedSendVerifyEmail.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
        {
          provide: getModelToken(VerificationToken.name),
          useValue: verificationTokenModel,
        },
        {
          provide: getModelToken(WorkspaceMember.name),
          useValue: workspaceMemberModel,
        },
        {
          provide: getModelToken(DocumentMember.name),
          useValue: documentMemberModel,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
        {
          provide: TokenService,
          useValue: tokenService,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
        {
          provide: WorkspaceService,
          useValue: workspaceService,
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('creates a new user, invalidates old tokens and sends a verification email', async () => {
      const userId = new Types.ObjectId();
      const newUser = {
        _id: userId,
        email: 'member@example.com',
        fullName: '',
        passwordHash: '',
        save: jest.fn().mockResolvedValue(undefined),
      };
      let createdVerificationToken:
        | { token: unknown; expiresAt: unknown }
        | undefined;
      let verificationEmail: { token: unknown } | undefined;

      userModel.mockImplementation(() => newUser);
      userModel.findOne.mockReturnValue(createExecQuery(null));
      verificationTokenModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
      verificationTokenModel.create.mockImplementation((payload: unknown) => {
        createdVerificationToken = payload as {
          token: unknown;
          expiresAt: unknown;
        };
        return Promise.resolve({});
      });
      mockedSendVerifyEmail.mockImplementation((payload: unknown) => {
        verificationEmail = payload as { token: unknown };
        return Promise.resolve();
      });

      await expect(
        service.register({
          email: '  MEMBER@EXAMPLE.COM ',
          password: 'password123',
          fullName: 'Member Name',
        }),
      ).resolves.toBe(true);

      expect(userModel.findOne).toHaveBeenCalledWith({
        email: 'member@example.com',
      });
      expect(mockedHash).toHaveBeenCalledWith('password123', 10);
      expect(userModel).toHaveBeenCalledWith({
        email: 'member@example.com',
      });
      expect(newUser.passwordHash).toBe('hashed-password');
      expect(newUser.fullName).toBe('Member Name');
      expect(newUser.save).toHaveBeenCalled();
      expect(verificationTokenModel.updateMany).toHaveBeenCalledWith(
        {
          userId,
          isUsed: false,
          isValid: true,
        },
        { $set: { isValid: false } },
      );
      expect(verificationTokenModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
        }),
      );
      expect(typeof createdVerificationToken?.token).toBe('string');
      expect(createdVerificationToken?.expiresAt).toBeInstanceOf(Date);
      expect(mockedSendVerifyEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'member@example.com',
          fullName: 'Member Name',
        }),
      );
      expect(typeof verificationEmail?.token).toBe('string');
    });

    it('updates an existing unverified user and preserves invitation context', async () => {
      const userId = new Types.ObjectId();
      const invitationId = new Types.ObjectId();
      const existingUser = {
        _id: userId,
        email: 'member@example.com',
        fullName: 'Old Name',
        passwordHash: 'old-hash',
        isEmailVerified: false,
        save: jest.fn().mockResolvedValue(undefined),
      };

      userModel.findOne.mockReturnValue(createExecQuery(existingUser));
      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          workspaceInvitationId: invitationId,
          redirectTo: '/workspaces/507f1f77bcf86cd799439011',
        }),
      );
      verificationTokenModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
      verificationTokenModel.create.mockResolvedValue({});

      await service.register({
        email: 'member@example.com',
        password: 'new-password',
        fullName: 'New Name',
      });

      expect(userModel).not.toHaveBeenCalled();
      expect(existingUser.passwordHash).toBe('hashed-password');
      expect(existingUser.fullName).toBe('New Name');
      expect(verificationTokenModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceInvitationId: invitationId,
          redirectTo: '/workspaces/507f1f77bcf86cd799439011',
        }),
      );
    });

    it('registers successfully when redirectTo matches a pending invitation', async () => {
      const userId = new Types.ObjectId();
      const invitationId = new Types.ObjectId();
      const newUser = {
        _id: userId,
        email: 'member@example.com',
        fullName: '',
        passwordHash: '',
        save: jest.fn().mockResolvedValue(undefined),
      };

      userModel.mockImplementation(() => newUser);
      userModel.findOne.mockReturnValue(createExecQuery(null));
      workspaceService.findPendingInvitationForRegistration.mockResolvedValue({
        invitationId,
        redirectTo: '/workspaces/507f1f77bcf86cd799439011',
      });
      verificationTokenModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
      verificationTokenModel.create.mockResolvedValue({});

      await service.register({
        email: 'member@example.com',
        password: 'password123',
        fullName: 'Member',
        redirectTo: '%2Fworkspaces%2F507f1f77bcf86cd799439011',
      });

      expect(
        workspaceService.findPendingInvitationForRegistration,
      ).toHaveBeenCalledWith({
        email: 'member@example.com',
        workspaceId: '507f1f77bcf86cd799439011',
      });
      expect(verificationTokenModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceInvitationId: invitationId,
          redirectTo: '/workspaces/507f1f77bcf86cd799439011',
        }),
      );
    });

    it('throws when the email already belongs to a verified user', async () => {
      userModel.findOne.mockReturnValue(
        createExecQuery({ isEmailVerified: true }),
      );

      await expect(
        service.register({
          email: 'member@example.com',
          password: 'password123',
          fullName: 'Member',
        }),
      ).rejects.toThrow('Existing email address');

      expect(mockedHash).not.toHaveBeenCalled();
    });

    it('throws when redirectTo is not an internal workspace path', async () => {
      userModel.findOne.mockReturnValue(createExecQuery(null));

      await expect(
        service.register({
          email: 'member@example.com',
          password: 'password123',
          fullName: 'Member',
          redirectTo:
            'https://evil.example/workspaces/507f1f77bcf86cd799439011',
        }),
      ).rejects.toThrow('redirectTo must be an internal workspace path');

      expect(
        workspaceService.findPendingInvitationForRegistration,
      ).not.toHaveBeenCalled();
    });

    it('throws when redirectTo has no matching pending invitation', async () => {
      userModel.findOne.mockReturnValue(createExecQuery(null));
      workspaceService.findPendingInvitationForRegistration.mockResolvedValue(
        null,
      );

      await expect(
        service.register({
          email: 'member@example.com',
          password: 'password123',
          fullName: 'Member',
          redirectTo: '/workspaces/507f1f77bcf86cd799439011',
        }),
      ).rejects.toThrow('No pending workspace invitation matches redirectTo');

      expect(mockedHash).not.toHaveBeenCalled();
    });
  });

  describe('resendVerification', () => {
    it('issues a new verification email for an unverified user', async () => {
      const user = {
        _id: new Types.ObjectId(),
        email: 'member@example.com',
        fullName: 'Member',
        isEmailVerified: false,
      };

      userModel.findOne.mockReturnValue(createExecQuery(user));
      verificationTokenModel.findOne.mockReturnValue(createExecQuery(null));
      verificationTokenModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
      verificationTokenModel.create.mockResolvedValue({});

      await expect(
        service.resendVerification({
          email: ' MEMBER@EXAMPLE.COM ',
        }),
      ).resolves.toEqual({ message: 'success' });

      expect(userModel.findOne).toHaveBeenCalledWith({
        email: 'member@example.com',
      });
      expect(mockedSendVerifyEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'member@example.com',
          fullName: 'Member',
        }),
      );
    });

    it('throws when the user does not exist', async () => {
      userModel.findOne.mockReturnValue(createExecQuery(null));

      await expect(
        service.resendVerification({ email: 'missing@example.com' }),
      ).rejects.toThrow('user have verified email');

      expect(verificationTokenModel.create).not.toHaveBeenCalled();
    });

    it('throws when the user is already verified', async () => {
      userModel.findOne.mockReturnValue(
        createExecQuery({ isEmailVerified: true }),
      );

      await expect(
        service.resendVerification({ email: 'member@example.com' }),
      ).rejects.toThrow('user have verified email');
    });

    it('throws when redirectTo has no matching invitation', async () => {
      userModel.findOne.mockReturnValue(
        createExecQuery({
          _id: new Types.ObjectId(),
          email: 'member@example.com',
          isEmailVerified: false,
        }),
      );
      workspaceService.findPendingInvitationForRegistration.mockResolvedValue(
        null,
      );

      await expect(
        service.resendVerification({
          email: 'member@example.com',
          redirectTo: '/workspaces/507f1f77bcf86cd799439011',
        }),
      ).rejects.toThrow('No pending workspace invitation matches redirectTo');
    });
  });

  describe('login', () => {
    it('returns tokens and persists the refresh token in Redis', async () => {
      const userId = new Types.ObjectId();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      userModel.findOne.mockReturnValue(
        createExecQuery({
          _id: userId,
          passwordHash: 'stored-hash',
          isEmailVerified: true,
        }),
      );
      tokenService.createAccessToken.mockReturnValue('new-access-token');
      tokenService.createRefreshToken.mockReturnValue({
        refreshToken: 'new-refresh-token',
        expiresAt,
      });

      await expect(
        service.login({
          email: 'member@example.com',
          password: 'password123',
        }),
      ).resolves.toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        refreshExpiresAt: expiresAt,
      });

      expect(mockedCompare).toHaveBeenCalledWith('password123', 'stored-hash');
      expect(redisClient.set).toHaveBeenCalledWith(
        `refresh_token:${userId.toString()}`,
        'new-refresh-token',
        'EX',
        expect.any(Number),
      );
    });

    it('uses a minimum Redis TTL of one second', async () => {
      const userId = new Types.ObjectId();

      userModel.findOne.mockReturnValue(
        createExecQuery({
          _id: userId,
          passwordHash: 'stored-hash',
          isEmailVerified: true,
        }),
      );
      tokenService.createRefreshToken.mockReturnValue({
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() - 1000),
      });

      await service.login({
        email: 'member@example.com',
        password: 'password123',
      });

      expect(redisClient.set).toHaveBeenCalledWith(
        `refresh_token:${userId.toString()}`,
        'new-refresh-token',
        'EX',
        1,
      );
    });

    it('throws when the user does not exist', async () => {
      userModel.findOne.mockReturnValue(createExecQuery(null));

      await expect(
        service.login({
          email: 'missing@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow('Incorrect email or password. Please try again.');
    });

    it('throws when the password is incorrect', async () => {
      userModel.findOne.mockReturnValue(
        createExecQuery({
          passwordHash: 'stored-hash',
          isEmailVerified: true,
        }),
      );
      mockedCompare.mockResolvedValue(false);

      await expect(
        service.login({
          email: 'member@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow('Incorrect email or password. Please try again.');
    });

    it('throws when the email has not been verified', async () => {
      userModel.findOne.mockReturnValue(
        createExecQuery({
          passwordHash: 'stored-hash',
          isEmailVerified: false,
        }),
      );

      await expect(
        service.login({
          email: 'member@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow('Email has not been verified');
    });
  });

  describe('getUserInfo', () => {
    it('returns the serialized user', async () => {
      const userId = new Types.ObjectId();
      const serializedUser = {
        id: userId.toString(),
        email: 'member@example.com',
      };
      const user = {
        toJSON: jest.fn().mockReturnValue(serializedUser),
      };

      userModel.findById.mockReturnValue(createExecQuery(user));

      await expect(service.getUserInfo(userId)).resolves.toEqual(
        serializedUser,
      );
      expect(user.toJSON).toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
      userModel.findById.mockReturnValue(createExecQuery(null));

      await expect(service.getUserInfo(new Types.ObjectId())).rejects.toThrow(
        'User does not exist',
      );
    });
  });

  describe('refreshToken', () => {
    it('rotates tokens when both cookies belong to the same user', async () => {
      const userId = new Types.ObjectId();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      tokenService.verifyAccessToken.mockReturnValue({
        userId: userId.toString(),
      });
      tokenService.verifyRefreshToken.mockReturnValue({
        userId: userId.toString(),
      });
      userModel.findById.mockReturnValue(createExecQuery({ _id: userId }));
      tokenService.createAccessToken.mockReturnValue('rotated-access-token');
      tokenService.createRefreshToken.mockReturnValue({
        refreshToken: 'rotated-refresh-token',
        expiresAt,
      });
      redisClient.eval.mockResolvedValue(1);

      await expect(
        service.refreshToken(
          createRequest({
            accessToken: 'old-access-token',
            refreshToken: 'old-refresh-token',
          }),
        ),
      ).resolves.toEqual({
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
        refreshExpiresAt: expiresAt,
      });

      expect(tokenService.verifyAccessToken).toHaveBeenCalledWith(
        'old-access-token',
        { ignoreExpiration: true },
      );
      expect(redisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('GET', KEYS[1])"),
        1,
        `refresh_token:${userId.toString()}`,
        'old-refresh-token',
        'rotated-refresh-token',
        expect.any(Number),
      );
    });

    it('throws when the access token cookie is missing', async () => {
      await expect(
        service.refreshToken(createRequest({ refreshToken: 'refresh-token' })),
      ).rejects.toThrow('accessToken does not exist');
    });

    it('throws when the refresh token cookie is missing', async () => {
      await expect(
        service.refreshToken(createRequest({ accessToken: 'access-token' })),
      ).rejects.toThrow('refreshToken does not exist');
    });

    it('throws when access and refresh tokens belong to different users', async () => {
      tokenService.verifyAccessToken.mockReturnValue({ userId: 'user-1' });
      tokenService.verifyRefreshToken.mockReturnValue({ userId: 'user-2' });

      await expect(
        service.refreshToken(
          createRequest({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
          }),
        ),
      ).rejects.toThrow('cannot refresh token');
    });

    it('throws when the token owner no longer exists', async () => {
      tokenService.verifyAccessToken.mockReturnValue({ userId: 'user-1' });
      tokenService.verifyRefreshToken.mockReturnValue({ userId: 'user-1' });
      userModel.findById.mockReturnValue(createExecQuery(null));

      await expect(
        service.refreshToken(
          createRequest({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
          }),
        ),
      ).rejects.toThrow('user does not exist');
    });

    it('throws when Redis rejects the current refresh token', async () => {
      const userId = new Types.ObjectId();

      tokenService.verifyAccessToken.mockReturnValue({
        userId: userId.toString(),
      });
      tokenService.verifyRefreshToken.mockReturnValue({
        userId: userId.toString(),
      });
      userModel.findById.mockReturnValue(createExecQuery({ _id: userId }));
      redisClient.eval.mockResolvedValue(0);

      await expect(
        service.refreshToken(
          createRequest({
            accessToken: 'access-token',
            refreshToken: 'stale-refresh-token',
          }),
        ),
      ).rejects.toThrow('refreshToken is invalid');
    });
  });

  describe('verifyEmail', () => {
    it('verifies the user, emits an event and returns login tokens', async () => {
      const userId = new Types.ObjectId();
      const recordId = new Types.ObjectId();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          _id: recordId,
          userId,
          isUsed: false,
          isValid: true,
          expiresAt: new Date(Date.now() + 60 * 1000),
        }),
      );
      userModel.findById.mockReturnValue(
        createExecQuery({
          _id: userId,
          email: 'member@example.com',
          isEmailVerified: false,
        }),
      );
      verificationTokenModel.updateOne.mockResolvedValue({
        modifiedCount: 1,
      });
      userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      tokenService.createRefreshToken.mockReturnValue({
        refreshToken: 'verified-refresh-token',
        expiresAt,
      });

      const result = await service.verifyEmail('verification-token');

      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'access-token',
          refreshToken: 'verified-refresh-token',
          refreshExpiresAt: expiresAt,
        }),
      );
      expect(verificationTokenModel.updateOne).toHaveBeenCalledWith(
        {
          _id: recordId,
          isUsed: false,
          isValid: true,
        },
        { $set: { isUsed: true, isValid: false } },
      );
      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: userId, isEmailVerified: false },
        { $set: { isEmailVerified: true } },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('user.email.verified', {
        email: 'member@example.com',
        userId: userId.toString(),
      });
      expect(redisClient.set).toHaveBeenCalled();
    });

    it('accepts an invitation and emits the workspace member event', async () => {
      const userId = new Types.ObjectId();
      const invitationId = new Types.ObjectId();
      const workspaceId = new Types.ObjectId().toString();

      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          _id: new Types.ObjectId(),
          userId,
          workspaceInvitationId: invitationId,
          isUsed: false,
          isValid: true,
          expiresAt: new Date(Date.now() + 60 * 1000),
        }),
      );
      userModel.findById.mockReturnValue(
        createExecQuery({
          _id: userId,
          email: 'member@example.com',
          isEmailVerified: false,
        }),
      );
      verificationTokenModel.updateOne.mockResolvedValue({
        modifiedCount: 1,
      });
      userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      workspaceService.acceptInvitationAfterEmailVerified.mockResolvedValue({
        status: 'accepted',
        memberAdded: true,
        workspaceId,
        redirectTo: `/workspaces/${workspaceId}`,
      });

      const result = await service.verifyEmail('verification-token');

      expect(
        workspaceService.acceptInvitationAfterEmailVerified,
      ).toHaveBeenCalledWith({
        invitationId,
        email: 'member@example.com',
        userId: userId.toString(),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('workspace.member.added', {
        workspaceId,
        userId: userId.toString(),
      });
      expect(result.redirectTo).toBe(`/workspaces/${workspaceId}`);
      expect(result.invitationStatus).toBe('accepted');
    });

    it('returns an invitation error status without emitting a workspace event', async () => {
      const userId = new Types.ObjectId();

      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          _id: new Types.ObjectId(),
          userId,
          workspaceInvitationId: new Types.ObjectId(),
          isUsed: true,
          isValid: false,
          expiresAt: new Date(Date.now() - 1000),
        }),
      );
      userModel.findById.mockReturnValue(
        createExecQuery({
          _id: userId,
          email: 'member@example.com',
          isEmailVerified: true,
        }),
      );
      workspaceService.acceptInvitationAfterEmailVerified.mockResolvedValue({
        status: 'expired',
      });

      const result = await service.verifyEmail('verification-token');

      expect(result.invitationStatus).toBe('expired');
      expect(result.redirectTo).toBeUndefined();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'workspace.member.added',
        expect.anything(),
      );
    });

    it('allows an already used token when the user is already verified', async () => {
      const userId = new Types.ObjectId();

      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          _id: new Types.ObjectId(),
          userId,
          isUsed: true,
          isValid: false,
          expiresAt: new Date(Date.now() - 1000),
        }),
      );
      userModel.findById.mockReturnValue(
        createExecQuery({
          _id: userId,
          email: 'member@example.com',
          isEmailVerified: true,
        }),
      );

      await expect(service.verifyEmail('verification-token')).resolves.toEqual(
        expect.objectContaining({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
      );

      expect(verificationTokenModel.updateOne).not.toHaveBeenCalled();
      expect(userModel.updateOne).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'user.email.verified',
        expect.anything(),
      );
    });

    it('recovers from a concurrent token update when token and user are already updated', async () => {
      const userId = new Types.ObjectId();
      const recordId = new Types.ObjectId();

      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          _id: recordId,
          userId,
          isUsed: false,
          isValid: true,
          expiresAt: new Date(Date.now() + 60 * 1000),
        }),
      );
      userModel.findById
        .mockReturnValueOnce(
          createExecQuery({
            _id: userId,
            email: 'member@example.com',
            isEmailVerified: false,
          }),
        )
        .mockReturnValueOnce(
          createExecQuery({
            _id: userId,
            isEmailVerified: true,
          }),
        );
      verificationTokenModel.updateOne.mockResolvedValue({
        modifiedCount: 0,
      });
      verificationTokenModel.findById.mockReturnValue(
        createExecQuery({ isUsed: true }),
      );

      await expect(service.verifyEmail('verification-token')).resolves.toEqual(
        expect.objectContaining({
          accessToken: 'access-token',
        }),
      );

      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('throws when the verification token does not exist', async () => {
      verificationTokenModel.findOne.mockReturnValue(createExecQuery(null));

      await expect(service.verifyEmail('missing-token')).rejects.toThrow(
        'Verification token is invalid.',
      );
    });

    it('throws when the token owner does not exist', async () => {
      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          userId: new Types.ObjectId(),
        }),
      );
      userModel.findById.mockReturnValue(createExecQuery(null));

      await expect(service.verifyEmail('verification-token')).rejects.toThrow(
        'Verification token is invalid.',
      );
    });

    it('throws when a used token belongs to an unverified user', async () => {
      const userId = new Types.ObjectId();

      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          userId,
          isUsed: true,
        }),
      );
      userModel.findById.mockReturnValue(
        createExecQuery({
          _id: userId,
          isEmailVerified: false,
        }),
      );

      await expect(service.verifyEmail('verification-token')).rejects.toThrow(
        'Verification token is invalid.',
      );
    });

    it('throws when an unused token has already been invalidated', async () => {
      const userId = new Types.ObjectId();

      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          userId,
          isUsed: false,
          isValid: false,
        }),
      );
      userModel.findById.mockReturnValue(
        createExecQuery({
          _id: userId,
          isEmailVerified: false,
        }),
      );

      await expect(service.verifyEmail('verification-token')).rejects.toThrow(
        'Verification token is invalid.',
      );
    });

    it('invalidates and rejects an expired token', async () => {
      const recordId = new Types.ObjectId();
      const userId = new Types.ObjectId();

      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          _id: recordId,
          userId,
          isUsed: false,
          isValid: true,
          expiresAt: new Date(Date.now() - 1000),
        }),
      );
      userModel.findById.mockReturnValue(
        createExecQuery({
          _id: userId,
          isEmailVerified: false,
        }),
      );
      verificationTokenModel.updateOne.mockResolvedValue({
        modifiedCount: 1,
      });

      await expect(service.verifyEmail('expired-token')).rejects.toBeInstanceOf(
        GoneException,
      );

      expect(verificationTokenModel.updateOne).toHaveBeenCalledWith(
        { _id: recordId, isUsed: false },
        { $set: { isValid: false } },
      );
    });

    it('throws when a concurrent token update cannot be confirmed', async () => {
      const recordId = new Types.ObjectId();
      const userId = new Types.ObjectId();

      verificationTokenModel.findOne.mockReturnValue(
        createExecQuery({
          _id: recordId,
          userId,
          isUsed: false,
          isValid: true,
          expiresAt: new Date(Date.now() + 60 * 1000),
        }),
      );
      userModel.findById
        .mockReturnValueOnce(
          createExecQuery({
            _id: userId,
            email: 'member@example.com',
            isEmailVerified: false,
          }),
        )
        .mockReturnValueOnce(
          createExecQuery({
            _id: userId,
            isEmailVerified: false,
          }),
        );
      verificationTokenModel.updateOne.mockResolvedValue({
        modifiedCount: 0,
      });
      verificationTokenModel.findById.mockReturnValue(
        createExecQuery({ isUsed: false }),
      );

      await expect(service.verifyEmail('verification-token')).rejects.toThrow(
        'Verification token is invalid.',
      );
    });
  });

  describe('logout', () => {
    it('deletes the current user refresh token from Redis', async () => {
      const userId = new Types.ObjectId();

      await expect(
        service.logout(createRequest({}), { _id: userId } as never),
      ).resolves.toEqual({ message: 'Logout successfully' });

      expect(redisClient.del).toHaveBeenCalledWith(
        `refresh_token:${userId.toString()}`,
      );
    });

    it('throws when no authenticated user is provided', async () => {
      await expect(
        service.logout(createRequest({}), undefined as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(redisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('searchCandidates', () => {
    it('returns an empty array for a blank keyword', async () => {
      await expect(
        service.searchCandidates({ keyword: '   ' }),
      ).resolves.toEqual([]);

      expect(userModel.find).not.toHaveBeenCalled();
    });

    it('returns an empty array when no users match', async () => {
      userModel.find.mockReturnValue(createLeanQuery([]));

      await expect(
        service.searchCandidates({ keyword: 'missing' }),
      ).resolves.toEqual([]);

      expect(workspaceMemberModel.find).not.toHaveBeenCalled();
      expect(documentMemberModel.find).not.toHaveBeenCalled();
    });

    it('returns basic user data when no membership scope is supplied', async () => {
      const userId = new Types.ObjectId();
      userModel.find.mockReturnValue(
        createLeanQuery([
          {
            _id: userId,
            email: 'member@example.com',
            fullName: 'Member',
          },
        ]),
      );

      await expect(
        service.searchCandidates({ keyword: 'member' }),
      ).resolves.toEqual([
        {
          id: userId,
          email: 'member@example.com',
          fullName: 'Member',
        },
      ]);
    });

    it('marks users already present in the workspace and document', async () => {
      const firstUserId = new Types.ObjectId();
      const secondUserId = new Types.ObjectId();
      const workspaceId = new Types.ObjectId().toString();
      const documentId = new Types.ObjectId().toString();

      userModel.find.mockReturnValue(
        createLeanQuery([
          {
            _id: firstUserId,
            email: 'first@example.com',
            fullName: 'First',
          },
          {
            _id: secondUserId,
            email: 'second@example.com',
            fullName: 'Second',
          },
        ]),
      );
      workspaceMemberModel.find.mockReturnValue(
        createLeanQuery([{ userId: firstUserId }]),
      );
      documentMemberModel.find.mockReturnValue(
        createLeanQuery([{ userId: secondUserId }]),
      );

      await expect(
        service.searchCandidates({
          keyword: 'example',
          workspaceId,
          documentId,
        }),
      ).resolves.toEqual([
        {
          id: firstUserId,
          email: 'first@example.com',
          fullName: 'First',
          inWorkspace: true,
          inDocument: false,
        },
        {
          id: secondUserId,
          email: 'second@example.com',
          fullName: 'Second',
          inWorkspace: false,
          inDocument: true,
        },
      ]);

      expect(workspaceMemberModel.find).toHaveBeenCalledWith({
        workspaceId: new Types.ObjectId(workspaceId),
        userId: { $in: [firstUserId, secondUserId] },
        isDeleted: { $ne: true },
      });
      expect(documentMemberModel.find).toHaveBeenCalledWith({
        documentId: new Types.ObjectId(documentId),
        userId: { $in: [firstUserId, secondUserId] },
        isDeleted: { $ne: true },
      });
    });
  });
});
