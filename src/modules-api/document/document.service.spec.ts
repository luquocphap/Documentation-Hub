import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { RedisService } from 'src/modules-system/redis/redis.service';
import { sendDocumentInvitationEmail } from 'src/common/email/send-document-invitation-email';
import {
  ACTIVITY_LOG_EVENT,
  ActivityLogAction,
} from 'src/common/events/activity-log.event';
import { DOCUMENT_ROLE_IDS } from 'src/common/seeds/document-role.seed';
import { ROLE_IDS } from 'src/common/seeds/role.seed';
import { CloudinaryService } from 'src/modules-system/cloudinary/cloudinary.service';
import { DocumentContentExtractorService } from 'src/modules-system/document-parser/document-content-extractor.service';
import { PdfService } from 'src/modules-system/pdf/pdf.service';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import { WorkspaceMember } from '../workspace/schemas/workspace_members.schema';
import { DocumentService } from './document.service';
import {
  DocumentInvitation,
  InvitationStatus,
} from './schemas/document-invitation.schemas';
import { DocumentMember } from './schemas/document-members.schema';
import { DocumentRole } from './schemas/document-roles.schema';
import { DocumentModel } from './schemas/documents.schema';

jest.mock('src/common/email/send-document-invitation-email', () => ({
  sendDocumentInvitationEmail: jest.fn(),
}));

jest.mock('src/modules-system/cloudinary/cloudinary.service', () => ({
  CloudinaryService: class CloudinaryService {},
}));

jest.mock('src/modules-system/pdf/pdf.service', () => ({
  PdfService: class PdfService {},
}));

jest.mock(
  'src/modules-system/document-parser/document-content-extractor.service',
  () => ({
    DocumentContentExtractorService: class DocumentContentExtractorService {},
  }),
);

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
    exists: jest.fn(),
    insertMany: jest.fn(),
    bulkWrite: jest.fn(),
  };
}

describe('DocumentService', () => {
  let service: DocumentService;
  let documentModel: MockModel;
  let documentMemberModel: MockModel;
  let workspaceMemberModel: MockModel;
  let documentRoleModel: MockModel;
  let invitationModel: MockModel;
  let userModel: MockModel;
  let cloudinaryService: {
    generatePresignedSignature: jest.Mock;
    deleteFile: jest.Mock;
    uploadFile: jest.Mock;
    downloadPdfFile: jest.Mock;
  };
  let pdfService: {
    generatePdfFromHtml: jest.Mock;
  };
  let documentContentExtractorService: {
    extractFromPdfBuffer: jest.Mock;
    extractFromMarkdown: jest.Mock;
  };
  let eventEmitter: {
    emit: jest.Mock;
    emitAsync: jest.Mock;
  };
  let redisClient: {
    get: jest.Mock;
    set: jest.Mock;
  };
  let redisService: {
    getClient: jest.Mock;
  };

  const mockedSendDocumentInvitationEmail =
    sendDocumentInvitationEmail as jest.Mock;

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
      fullName: 'Document Owner',
      isEmailVerified: true,
      ...overrides,
    }) as unknown as UserDocument;

  beforeEach(async () => {
    jest.clearAllMocks();

    documentModel = createMockModel();
    documentMemberModel = createMockModel();
    workspaceMemberModel = createMockModel();
    documentRoleModel = createMockModel();
    invitationModel = createMockModel();
    userModel = createMockModel();
    cloudinaryService = {
      generatePresignedSignature: jest.fn(),
      deleteFile: jest.fn().mockResolvedValue({ result: 'ok' }),
      uploadFile: jest.fn(),
      downloadPdfFile: jest.fn(),
    };
    pdfService = {
      generatePdfFromHtml: jest.fn(),
    };
    documentContentExtractorService = {
      extractFromPdfBuffer: jest.fn(),
      extractFromMarkdown: jest.fn(),
    };
    eventEmitter = {
      emit: jest.fn(),
      emitAsync: jest.fn().mockResolvedValue(undefined),
    };
    redisClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    redisService = {
      getClient: jest.fn().mockReturnValue(redisClient),
    };
    mockedSendDocumentInvitationEmail.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        {
          provide: getModelToken(DocumentModel.name),
          useValue: documentModel,
        },
        {
          provide: getModelToken(DocumentMember.name),
          useValue: documentMemberModel,
        },
        {
          provide: getModelToken(WorkspaceMember.name),
          useValue: workspaceMemberModel,
        },
        {
          provide: getModelToken(DocumentRole.name),
          useValue: documentRoleModel,
        },
        {
          provide: getModelToken(DocumentInvitation.name),
          useValue: invitationModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
        {
          provide: CloudinaryService,
          useValue: cloudinaryService,
        },
        {
          provide: PdfService,
          useValue: pdfService,
        },
        {
          provide: DocumentContentExtractorService,
          useValue: documentContentExtractorService,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    service = module.get(DocumentService);
  });

  describe('getRoles', () => {
    it('returns document roles without permissions', async () => {
      const roles = [
        { _id: DOCUMENT_ROLE_IDS.OWNER, name: 'Owner' },
        { _id: DOCUMENT_ROLE_IDS.EDITOR, name: 'Editor' },
      ];
      const query = createQuery(roles);
      documentRoleModel.find.mockReturnValue(query);

      await expect(service.getRoles()).resolves.toBe(roles);
      expect(query.select).toHaveBeenCalledWith('-permissions');
    });
  });

  describe('findAll', () => {
    it('throws when workspaceId is missing', async () => {
      await expect(service.findAll('')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(documentModel.find).not.toHaveBeenCalled();
    });

    it('maps active documents and populated owners', async () => {
      const workspaceId = new Types.ObjectId();
      const firstId = new Types.ObjectId();
      const secondId = new Types.ObjectId();
      const ownerId = new Types.ObjectId();
      const updatedAt = new Date();
      const query = createQuery([
        {
          _id: firstId,
          title: 'Roadmap',
          createdBy: { _id: ownerId, fullName: 'Owner' },
          updated_at: updatedAt,
        },
        {
          _id: secondId,
          title: 'Orphan',
          createdBy: null,
          updated_at: updatedAt,
        },
      ]);
      documentModel.find.mockReturnValue(query);

      await expect(service.findAll(workspaceId.toString())).resolves.toEqual([
        {
          id: firstId,
          title: 'Roadmap',
          ownerName: 'Owner',
          ownerId,
          updatedAt,
        },
        {
          id: secondId,
          title: 'Orphan',
          ownerName: 'Unknown',
          ownerId: 'Unknown',
          updatedAt,
        },
      ]);

      expect(query.populate).toHaveBeenCalledWith('createdBy', 'fullName _id');
      expect(query.sort).toHaveBeenCalledWith({ updated_at: -1 });
    });
  });

  describe('create', () => {
    it('creates an owner membership and emits document/activity events', async () => {
      const user = createUser();
      const workspaceId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const newDocument = {
        _id: documentId,
        workspaceId,
        title: 'Roadmap',
      };

      documentModel.find.mockReturnValue(createQuery([]));
      documentModel.create.mockResolvedValue(newDocument);
      documentMemberModel.create.mockResolvedValue({});

      await expect(
        service.create(
          { workspaceId: workspaceId.toString(), title: 'Roadmap' },
          user,
        ),
      ).resolves.toBe(newDocument);

      expect(documentModel.create).toHaveBeenCalledWith({
        workspaceId,
        title: 'Roadmap',
        public_id: '',
        content: '',
        createdBy: user._id,
      });
      expect(documentMemberModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId,
          userId: user._id,
          roleId: DOCUMENT_ROLE_IDS.OWNER,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('document.created', {
        documentId: documentId.toString(),
        workspaceId: workspaceId.toString(),
        ownerId: user._id.toString(),
      });
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ACTIVITY_LOG_EVENT, {
        action: ActivityLogAction.CREATE_DOCUMENT,
        actorId: user._id.toString(),
        workspaceId: workspaceId.toString(),
        documentId: documentId.toString(),
        documentName: 'Roadmap',
      });
    });

    it('generates the next available title and escapes regex characters', async () => {
      const workspaceId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const user = createUser();
      let capturedFindFilter:
        | {
            title: { $regex: RegExp };
          }
        | undefined;

      documentModel.find.mockImplementation(
        (filter: { title: { $regex: RegExp } }) => {
          capturedFindFilter = filter;
          return createQuery([
            { title: 'Plan [v1]' },
            { title: 'Plan [v1] (1)' },
            { title: 'Plan [v1] (3)' },
          ]);
        },
      );
      documentModel.create.mockResolvedValue({
        _id: documentId,
        workspaceId,
        title: 'Plan [v1] (2)',
      });
      documentMemberModel.create.mockResolvedValue({});

      await service.create(
        {
          workspaceId: workspaceId.toString(),
          title: 'Plan [v1]',
        },
        user,
      );

      expect(capturedFindFilter?.title.$regex.test('Plan [v1]')).toBe(true);
      expect(capturedFindFilter?.title.$regex.test('Plan v1')).toBe(false);
      expect(documentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Plan [v1] (2)' }),
      );
    });

    it('does not fail creation when activity logging rejects', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const user = createUser();
      const workspaceId = new Types.ObjectId();
      const documentId = new Types.ObjectId();

      documentModel.find.mockReturnValue(createQuery([]));
      documentModel.create.mockResolvedValue({
        _id: documentId,
        workspaceId,
        title: 'Roadmap',
      });
      documentMemberModel.create.mockResolvedValue({});
      eventEmitter.emitAsync.mockRejectedValue(new Error('event failed'));

      await expect(
        service.create(
          { workspaceId: workspaceId.toString(), title: 'Roadmap' },
          user,
        ),
      ).resolves.toBeDefined();

      await Promise.resolve();
      expect(consoleError).toHaveBeenCalledWith(
        '[ActivityLog] Document event failed',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });
  });

  describe('getUploadSignature', () => {
    it('returns a Cloudinary signature for an active document', async () => {
      const user = createUser();
      const documentId = new Types.ObjectId().toString();
      const signature = { signature: 'signed', timestamp: 123 };

      documentModel.findOne.mockResolvedValue({ _id: documentId });
      cloudinaryService.generatePresignedSignature.mockReturnValue(signature);

      await expect(service.getUploadSignature(documentId, user)).resolves.toBe(
        signature,
      );
      expect(cloudinaryService.generatePresignedSignature).toHaveBeenCalledWith(
        documentId,
        user._id.toString(),
      );
    });

    it('throws when the document does not exist', async () => {
      documentModel.findOne.mockResolvedValue(null);

      await expect(
        service.getUploadSignature(
          new Types.ObjectId().toString(),
          createUser(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('handleCloudinaryWebhook', () => {
    it('ignores non-upload notifications', async () => {
      await expect(
        service.handleCloudinaryWebhook({ notification_type: 'delete' }),
      ).resolves.toEqual({ message: 'Ignored non-upload event' });
      expect(documentModel.findOne).not.toHaveBeenCalled();
    });

    it('processes a first upload without deleting an old file', async () => {
      const documentId = new Types.ObjectId();
      const userId = new Types.ObjectId();
      const document = {
        _id: documentId,
        workspaceId: new Types.ObjectId(),
        title: 'Roadmap',
        public_id: '',
        updatedAt: null as Date | null,
        updatedBy: null as Types.ObjectId | null,
        save: jest.fn().mockResolvedValue(undefined),
      };

      documentModel.findOne.mockResolvedValue(document);

      await expect(
        service.handleCloudinaryWebhook({
          notification_type: 'upload',
          public_id: 'new-public-id',
          secure_url: 'https://cdn.example/file.pdf',
          context: {
            custom: {
              documentId: documentId.toString(),
              userId: userId.toString(),
            },
          },
        }),
      ).resolves.toEqual({ message: 'Webhook processed successfully' });

      expect(cloudinaryService.deleteFile).not.toHaveBeenCalled();
      expect(document.public_id).toBe('new-public-id');
      expect(document.updatedAt).toBeInstanceOf(Date);
      expect(document.updatedBy).toEqual(userId);
      expect(document.save).toHaveBeenCalled();
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        'document.content.extract.pdf',
        {
          documentId: documentId.toString(),
          publicId: 'new-public-id',
          fileUrl: 'https://cdn.example/file.pdf',
        },
      );
    });

    it('deletes an old file and logs an update on replacement upload', async () => {
      const documentId = new Types.ObjectId();
      const userId = new Types.ObjectId();
      const workspaceId = new Types.ObjectId();
      const document = {
        _id: documentId,
        workspaceId,
        title: 'Roadmap',
        public_id: 'old-public-id',
        save: jest.fn().mockResolvedValue(undefined),
      };

      documentModel.findOne.mockResolvedValue(document);

      await service.handleCloudinaryWebhook({
        notification_type: 'upload',
        public_id: 'new-public-id',
        url: 'http://cdn.example/file.pdf',
        context: {
          custom: {
            documentId: documentId.toString(),
            userId: userId.toString(),
          },
        },
      });

      expect(cloudinaryService.deleteFile).toHaveBeenCalledWith(
        'old-public-id',
      );
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ACTIVITY_LOG_EVENT, {
        action: ActivityLogAction.UPDATE_DOCUMENT,
        actorId: userId.toString(),
        workspaceId: workspaceId.toString(),
        documentId: documentId.toString(),
        documentName: 'Roadmap',
      });
    });

    it('continues processing when deleting the old Cloudinary file fails', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const documentId = new Types.ObjectId();
      const document = {
        workspaceId: new Types.ObjectId(),
        title: 'Roadmap',
        public_id: 'old-public-id',
        save: jest.fn().mockResolvedValue(undefined),
      };

      documentModel.findOne.mockResolvedValue(document);
      cloudinaryService.deleteFile.mockRejectedValue(
        new Error('delete failed'),
      );

      await expect(
        service.handleCloudinaryWebhook({
          notification_type: 'upload',
          public_id: 'new-public-id',
          context: {
            custom: {
              documentId: documentId.toString(),
              userId: new Types.ObjectId().toString(),
            },
          },
        }),
      ).resolves.toHaveProperty('message');

      expect(document.save).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('does nothing when upload context is incomplete or document is missing', async () => {
      await service.handleCloudinaryWebhook({
        notification_type: 'upload',
        public_id: 'new-public-id',
      });
      expect(documentModel.findOne).not.toHaveBeenCalled();

      documentModel.findOne.mockResolvedValue(null);
      await service.handleCloudinaryWebhook({
        notification_type: 'upload',
        public_id: 'new-public-id',
        context: {
          custom: {
            documentId: new Types.ObjectId().toString(),
            userId: new Types.ObjectId().toString(),
          },
        },
      });
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it('swallows document-content event failures after a successful upload', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const documentId = new Types.ObjectId();

      documentModel.findOne.mockResolvedValue({
        workspaceId: new Types.ObjectId(),
        title: 'Roadmap',
        public_id: '',
        save: jest.fn().mockResolvedValue(undefined),
      });
      eventEmitter.emitAsync.mockRejectedValue(
        new Error('extract event failed'),
      );

      await service.handleCloudinaryWebhook({
        notification_type: 'upload',
        public_id: 'new-public-id',
        context: {
          custom: {
            documentId: documentId.toString(),
            userId: new Types.ObjectId().toString(),
          },
        },
      });

      await Promise.resolve();
      expect(consoleError).toHaveBeenCalledWith(
        '[DocumentContent] Event failed: document.content.extract.pdf',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });
  });

  describe('update', () => {
    it('renames a document with a unique title and records updater', async () => {
      const workspaceId = new Types.ObjectId();
      const user = createUser();
      const document = {
        workspaceId,
        title: 'Old title',
        updatedBy: null as Types.ObjectId | null,
        save: jest.fn().mockResolvedValue(undefined),
      };

      documentModel.findOne.mockResolvedValue(document);
      documentModel.find.mockReturnValue(createQuery([{ title: 'New title' }]));

      await expect(
        service.update(
          new Types.ObjectId().toString(),
          { title: 'New title' },
          user,
        ),
      ).resolves.toBe(document);

      expect(document.title).toBe('New title (1)');
      expect(document.updatedBy).toEqual(user._id);
      expect(document.save).toHaveBeenCalled();
    });

    it('keeps the title when it is unchanged', async () => {
      const document = {
        workspaceId: new Types.ObjectId(),
        title: 'Roadmap',
        save: jest.fn().mockResolvedValue(undefined),
      };
      documentModel.findOne.mockResolvedValue(document);

      await service.update(
        new Types.ObjectId().toString(),
        { title: 'Roadmap' },
        createUser(),
      );

      expect(documentModel.find).not.toHaveBeenCalled();
    });

    it('throws when the document does not exist', async () => {
      documentModel.findOne.mockResolvedValue(null);

      await expect(
        service.update(
          new Types.ObjectId().toString(),
          { title: 'New title' },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft deletes a document and emits delete activity', async () => {
      const documentId = new Types.ObjectId().toString();
      const workspaceId = new Types.ObjectId();
      const user = createUser();

      documentModel.findByIdAndUpdate.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(documentId),
          workspaceId,
          title: 'Roadmap',
          isDeleted: true,
        }),
      );

      await expect(service.remove(documentId, user)).resolves.toHaveProperty(
        'message',
      );
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ACTIVITY_LOG_EVENT, {
        action: ActivityLogAction.DELETE_DOCUMENT,
        actorId: user._id.toString(),
        workspaceId: workspaceId.toString(),
        documentId,
        documentName: 'Roadmap',
      });
    });

    it('throws when the document does not exist', async () => {
      documentModel.findByIdAndUpdate.mockReturnValue(createQuery(null));

      await expect(
        service.remove(new Types.ObjectId().toString(), createUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getMyRole', () => {
    it('returns the populated role name', async () => {
      documentMemberModel.findOne.mockReturnValue(
        createQuery({ roleId: { name: 'Editor' } }),
      );

      await expect(
        service.getMyRole(new Types.ObjectId().toString(), createUser()),
      ).resolves.toEqual({ role: 'Editor' });
    });

    it('returns Unknown when the populated role is empty', async () => {
      documentMemberModel.findOne.mockReturnValue(
        createQuery({ roleId: null }),
      );

      await expect(
        service.getMyRole(new Types.ObjectId().toString(), createUser()),
      ).resolves.toEqual({ role: 'Unknown' });
    });

    it('throws when the user has no active membership', async () => {
      documentMemberModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.getMyRole(new Types.ObjectId().toString(), createUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createFromMarkdown', () => {
    it('generates PDF, uploads it, creates owner access and emits extraction', async () => {
      const user = createUser();
      const workspaceId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const pdfBuffer = Buffer.from('pdf');
      let uploadedFile: Express.Multer.File | undefined;

      documentModel.find.mockReturnValue(createQuery([]));
      pdfService.generatePdfFromHtml.mockResolvedValue(pdfBuffer);
      cloudinaryService.uploadFile.mockImplementation(
        (file: Express.Multer.File) => {
          uploadedFile = file;
          return Promise.resolve({ public_id: 'markdown-pdf' });
        },
      );
      documentModel.create.mockResolvedValue({
        _id: documentId,
        workspaceId,
        title: 'Guide',
        public_id: 'markdown-pdf',
      });
      documentMemberModel.create.mockResolvedValue({});

      await expect(
        service.createFromMarkdown(
          {
            workspaceId: workspaceId.toString(),
            title: 'Guide',
            markdownContent: '# Hello',
          },
          user,
        ),
      ).resolves.toHaveProperty('_id', documentId);

      expect(pdfService.generatePdfFromHtml).toHaveBeenCalledWith(
        expect.stringContaining('<h1>Hello</h1>'),
      );
      expect(uploadedFile?.originalname).toBe('Guide.pdf');
      expect(uploadedFile?.mimetype).toBe('application/pdf');
      expect(uploadedFile?.buffer).toBe(pdfBuffer);
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        'document.content.extract.markdown',
        {
          documentId: documentId.toString(),
          markdownContent: '# Hello',
        },
      );
    });

    it('throws when Cloudinary upload returns no public id', async () => {
      documentModel.find.mockReturnValue(createQuery([]));
      pdfService.generatePdfFromHtml.mockResolvedValue(Buffer.from('pdf'));
      cloudinaryService.uploadFile.mockResolvedValue({});

      await expect(
        service.createFromMarkdown(
          {
            workspaceId: new Types.ObjectId().toString(),
            title: 'Guide',
            markdownContent: '# Hello',
          },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(documentModel.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns cached document metadata without querying MongoDB', async () => {
      const documentId = new Types.ObjectId().toString();
      const cachedDocument = {
        _id: documentId,
        workspaceId: new Types.ObjectId().toString(),
        title: 'Cached Roadmap',
        public_id: 'cached-pdf-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      redisClient.get.mockResolvedValue(JSON.stringify(cachedDocument));

      await expect(service.findOne(documentId)).resolves.toEqual(
        cachedDocument,
      );

      expect(redisClient.get).toHaveBeenCalledWith(`document:${documentId}`);
      expect(documentModel.findOne).not.toHaveBeenCalled();
      expect(redisClient.set).not.toHaveBeenCalled();
    });

    it('returns document metadata', async () => {
      const documentId = new Types.ObjectId();
      const workspaceId = new Types.ObjectId();
      const createdAt = new Date();
      const updatedAt = new Date();

      documentModel.findOne.mockReturnValue(
        createQuery({
          _id: documentId,
          workspaceId,
          title: 'Roadmap',
          public_id: 'pdf-id',
          created_at: createdAt,
          updated_at: updatedAt,
        }),
      );

      await expect(service.findOne(documentId.toString())).resolves.toEqual({
        _id: documentId,
        workspaceId,
        title: 'Roadmap',
        public_id: 'pdf-id',
        createdAt,
        updatedAt,
      });
      expect(redisClient.get).toHaveBeenCalledWith(
        `document:${documentId.toString()}`,
      );
      expect(redisClient.set).toHaveBeenCalledWith(
        `document:${documentId.toString()}`,
        JSON.stringify({
          _id: documentId,
          workspaceId,
          title: 'Roadmap',
          public_id: 'pdf-id',
          createdAt,
          updatedAt,
        }),
        'EX',
        2,
      );
    });

    it('throws when the document does not exist', async () => {
      documentModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.findOne(new Types.ObjectId().toString()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('inviteMember', () => {
    const documentId = new Types.ObjectId().toString();
    const roleId = DOCUMENT_ROLE_IDS.EDITOR.toString();
    const workspaceId = new Types.ObjectId();

    function prepareDocumentAndRole() {
      documentModel.findOne.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(documentId),
          workspaceId,
          title: 'Roadmap',
        }),
      );
      documentRoleModel.findById.mockReturnValue(
        createQuery({ _id: new Types.ObjectId(roleId), name: 'Editor' }),
      );
    }

    it('throws when the document does not exist', async () => {
      documentModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.inviteMember(
          documentId,
          { email: 'member@example.com', roleId },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the role does not exist', async () => {
      documentModel.findOne.mockReturnValue(createQuery({ _id: documentId }));
      documentRoleModel.findById.mockReturnValue(createQuery(null));

      await expect(
        service.inviteMember(
          documentId,
          { email: 'member@example.com', roleId },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when a verified user already has active access', async () => {
      prepareDocumentAndRole();
      userModel.findOne.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(),
          isEmailVerified: true,
        }),
      );
      documentMemberModel.exists.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      await expect(
        service.inviteMember(
          documentId,
          { email: 'member@example.com', roleId },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('adds a verified user directly and sends a mocked email', async () => {
      const inviter = createUser();
      const userId = new Types.ObjectId();

      prepareDocumentAndRole();
      userModel.findOne.mockReturnValue(
        createQuery({ _id: userId, isEmailVerified: true }),
      );
      documentMemberModel.exists.mockResolvedValue(null);
      documentMemberModel.findOneAndUpdate.mockReturnValue(createQuery({}));

      await expect(
        service.inviteMember(
          documentId,
          { email: 'MEMBER@EXAMPLE.COM', roleId },
          inviter,
        ),
      ).resolves.toHaveProperty('message');

      expect(mockedSendDocumentInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'member@example.com',
          documentName: 'Roadmap',
          inviterName: inviter.fullName,
          roleName: 'Editor',
        }),
      );
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        ACTIVITY_LOG_EVENT,
        expect.objectContaining({
          action: ActivityLogAction.SHARE_DOCUMENT,
          targetUserId: userId.toString(),
        }),
      );
    });

    it('throws when an active pending invitation already exists', async () => {
      prepareDocumentAndRole();
      userModel.findOne.mockReturnValue(createQuery(null));
      invitationModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(
        service.inviteMember(
          documentId,
          { email: 'member@example.com', roleId },
          createUser(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates an invitation for an unregistered user', async () => {
      const inviter = createUser();

      prepareDocumentAndRole();
      userModel.findOne.mockReturnValue(createQuery(null));
      invitationModel.exists.mockResolvedValue(null);
      invitationModel.create.mockResolvedValue({});

      await expect(
        service.inviteMember(
          documentId,
          { email: 'NEW@EXAMPLE.COM', roleId },
          inviter,
        ),
      ).resolves.toHaveProperty('message');

      expect(invitationModel.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        documentId,
        roleId,
        inviterId: inviter._id,
      });
      expect(mockedSendDocumentInvitationEmail).toHaveBeenCalled();
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        ACTIVITY_LOG_EVENT,
        expect.objectContaining({
          email: 'new@example.com',
          targetUserId: undefined,
        }),
      );
    });

    it('includes an existing unverified user in share activity', async () => {
      const userId = new Types.ObjectId();

      prepareDocumentAndRole();
      userModel.findOne.mockReturnValue(
        createQuery({ _id: userId, isEmailVerified: false }),
      );
      invitationModel.exists.mockResolvedValue(null);
      invitationModel.create.mockResolvedValue({});

      await service.inviteMember(
        documentId,
        { email: 'member@example.com', roleId },
        createUser(),
      );

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        ACTIVITY_LOG_EVENT,
        expect.objectContaining({ targetUserId: userId.toString() }),
      );
    });
  });

  describe('handlePendingDocumentInvitationsAfterVerified', () => {
    it('returns without writes when there are no pending invitations', async () => {
      invitationModel.find.mockReturnValue(createQuery([]));

      await service.handlePendingDocumentInvitationsAfterVerified({
        email: 'MEMBER@EXAMPLE.COM',
        userId: new Types.ObjectId().toString(),
      });

      expect(documentMemberModel.exists).not.toHaveBeenCalled();
    });

    it('creates missing memberships and accepts every invitation', async () => {
      const userId = new Types.ObjectId();
      const firstInvite = {
        documentId: new Types.ObjectId(),
        roleId: DOCUMENT_ROLE_IDS.EDITOR,
        status: InvitationStatus.PENDING,
        save: jest.fn().mockResolvedValue(undefined),
      };
      const secondInvite = {
        documentId: new Types.ObjectId(),
        roleId: DOCUMENT_ROLE_IDS.VIEWER,
        status: InvitationStatus.PENDING,
        save: jest.fn().mockResolvedValue(undefined),
      };

      invitationModel.find.mockReturnValue(
        createQuery([firstInvite, secondInvite]),
      );
      documentMemberModel.exists
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: new Types.ObjectId() });
      documentMemberModel.create.mockResolvedValue({});

      await service.handlePendingDocumentInvitationsAfterVerified({
        email: 'MEMBER@EXAMPLE.COM',
        userId: userId.toString(),
      });

      expect(documentMemberModel.create).toHaveBeenCalledTimes(1);
      expect(firstInvite.status).toBe(InvitationStatus.ACCEPTED);
      expect(secondInvite.status).toBe(InvitationStatus.ACCEPTED);
      expect(firstInvite.save).toHaveBeenCalled();
      expect(secondInvite.save).toHaveBeenCalled();
    });
  });

  describe('getExternalMembers', () => {
    it('throws when the document does not exist', async () => {
      documentModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.getExternalMembers(new Types.ObjectId().toString()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns document members who are not workspace members', async () => {
      const documentId = new Types.ObjectId();
      const workspaceId = new Types.ObjectId();
      const workspaceUserId = new Types.ObjectId();
      const externalUserId = new Types.ObjectId();
      const roleId = new Types.ObjectId();

      documentModel.findOne.mockReturnValue(
        createQuery({ _id: documentId, workspaceId }),
      );
      workspaceMemberModel.find.mockReturnValue(
        createQuery([{ userId: workspaceUserId }]),
      );
      documentMemberModel.find.mockReturnValue(
        createQuery([
          {
            userId: {
              _id: workspaceUserId,
              fullName: 'Internal',
              email: 'internal@example.com',
            },
            roleId: { _id: roleId, name: 'Editor' },
          },
          {
            userId: {
              _id: externalUserId,
              fullName: 'External',
              email: 'external@example.com',
            },
            roleId: { _id: roleId, name: 'Viewer' },
          },
          { userId: null, roleId: null },
        ]),
      );

      await expect(
        service.getExternalMembers(documentId.toString()),
      ).resolves.toEqual([
        {
          userId: externalUserId,
          fullName: 'External',
          email: 'external@example.com',
          roleId,
          roleName: 'Viewer',
        },
      ]);
    });
  });

  describe('removeExternalMember', () => {
    const documentId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

    it('throws when the document does not exist', async () => {
      documentModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.removeExternalMember(documentId, userId, createUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the user is missing from the document', async () => {
      documentModel.findOne.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(documentId),
          workspaceId: new Types.ObjectId(),
        }),
      );
      documentMemberModel.findOne.mockReturnValue(createQuery(null));
      workspaceMemberModel.exists.mockResolvedValue(null);

      await expect(
        service.removeExternalMember(documentId, userId, createUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws when the target is also a workspace member', async () => {
      documentModel.findOne.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(documentId),
          workspaceId: new Types.ObjectId(),
        }),
      );
      documentMemberModel.findOne.mockReturnValue(
        createQuery({ _id: new Types.ObjectId() }),
      );
      workspaceMemberModel.exists.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      await expect(
        service.removeExternalMember(documentId, userId, createUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('soft deletes an external member and logs revoked access', async () => {
      const currentUser = createUser();
      const memberId = new Types.ObjectId();
      const workspaceId = new Types.ObjectId();

      documentModel.findOne.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(documentId),
          workspaceId,
          title: 'Roadmap',
        }),
      );
      documentMemberModel.findOne.mockReturnValue(
        createQuery({ _id: memberId }),
      );
      workspaceMemberModel.exists.mockResolvedValue(null);
      userModel.findById.mockReturnValue(
        createQuery({ email: 'external@example.com' }),
      );
      documentMemberModel.findByIdAndUpdate.mockReturnValue(createQuery({}));

      await expect(
        service.removeExternalMember(documentId, userId, currentUser),
      ).resolves.toHaveProperty('message');

      expect(documentMemberModel.findByIdAndUpdate).toHaveBeenCalledWith(
        memberId,
        { $set: { isDeleted: true } },
      );
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ACTIVITY_LOG_EVENT, {
        action: ActivityLogAction.REVOKE_ACCESS,
        actorId: currentUser._id.toString(),
        workspaceId: workspaceId.toString(),
        documentId,
        documentName: 'Roadmap',
        email: 'external@example.com',
        targetUserId: userId,
      });
    });

    it('uses userId as activity fallback when user lookup is empty', async () => {
      documentModel.findOne.mockReturnValue(
        createQuery({
          _id: new Types.ObjectId(documentId),
          workspaceId: new Types.ObjectId(),
          title: 'Roadmap',
        }),
      );
      documentMemberModel.findOne.mockReturnValue(
        createQuery({ _id: new Types.ObjectId() }),
      );
      workspaceMemberModel.exists.mockResolvedValue(null);
      userModel.findById.mockReturnValue(createQuery(null));
      documentMemberModel.findByIdAndUpdate.mockReturnValue(createQuery({}));

      await service.removeExternalMember(documentId, userId, createUser());

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        ACTIVITY_LOG_EVENT,
        expect.objectContaining({ email: userId }),
      );
    });
  });

  describe('changeMemberRole', () => {
    const documentId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const roleId = DOCUMENT_ROLE_IDS.VIEWER.toString();

    it('throws when the document role does not exist', async () => {
      documentRoleModel.findById.mockReturnValue(createQuery(null));

      await expect(
        service.changeMemberRole(documentId, { userId, roleId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the active document membership does not exist', async () => {
      documentRoleModel.findById.mockReturnValue(
        createQuery({ name: 'Viewer' }),
      );
      documentMemberModel.findOneAndUpdate.mockReturnValue(createQuery(null));

      await expect(
        service.changeMemberRole(documentId, { userId, roleId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the role successfully', async () => {
      documentRoleModel.findById.mockReturnValue(
        createQuery({ name: 'Viewer' }),
      );
      documentMemberModel.findOneAndUpdate.mockReturnValue(
        createQuery({ _id: new Types.ObjectId() }),
      );

      await expect(
        service.changeMemberRole(documentId, { userId, roleId }),
      ).resolves.toHaveProperty('message');
    });
  });

  describe('content extraction handlers', () => {
    it('downloads, extracts and saves PDF content', async () => {
      const documentId = new Types.ObjectId();
      const pdfBuffer = Buffer.from('pdf');
      const updateQuery = createQuery({});

      cloudinaryService.downloadPdfFile.mockResolvedValue(pdfBuffer);
      documentContentExtractorService.extractFromPdfBuffer.mockResolvedValue(
        'extracted pdf text',
      );
      documentModel.findOneAndUpdate.mockReturnValue(updateQuery);

      await service.handleExtractPdfContent({
        documentId: documentId.toString(),
        publicId: 'pdf-id',
        fileUrl: 'https://cdn.example/file.pdf',
      });

      expect(cloudinaryService.downloadPdfFile).toHaveBeenCalledWith(
        'pdf-id',
        'https://cdn.example/file.pdf',
      );
      expect(documentModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: documentId,
          isDeleted: { $ne: true },
        },
        { $set: { content: 'extracted pdf text' } },
      );
    });

    it('logs and swallows PDF extraction failures', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      cloudinaryService.downloadPdfFile.mockRejectedValue(
        new Error('download failed'),
      );

      await expect(
        service.handleExtractPdfContent({
          documentId: new Types.ObjectId().toString(),
          publicId: 'pdf-id',
        }),
      ).resolves.toBeUndefined();

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('extracts and saves markdown content', async () => {
      const documentId = new Types.ObjectId();
      documentContentExtractorService.extractFromMarkdown.mockReturnValue(
        'markdown text',
      );
      documentModel.findOneAndUpdate.mockReturnValue(createQuery({}));

      await service.handleExtractMarkdownContent({
        documentId: documentId.toString(),
        markdownContent: '# Hello',
      });

      expect(
        documentContentExtractorService.extractFromMarkdown,
      ).toHaveBeenCalledWith('# Hello');
      expect(documentModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: documentId,
          isDeleted: { $ne: true },
        },
        { $set: { content: 'markdown text' } },
      );
    });

    it('logs and swallows markdown extraction failures', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      documentContentExtractorService.extractFromMarkdown.mockImplementation(
        () => {
          throw new Error('parse failed');
        },
      );

      await expect(
        service.handleExtractMarkdownContent({
          documentId: new Types.ObjectId().toString(),
          markdownContent: '# Hello',
        }),
      ).resolves.toBeUndefined();

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('handleDocumentCreated', () => {
    it('grants owner access to workspace admins before editor access to other members', async () => {
      const documentId = new Types.ObjectId();
      const workspaceId = new Types.ObjectId();
      const ownerId = new Types.ObjectId();
      const adminId = new Types.ObjectId();
      const memberId = new Types.ObjectId();
      let insertedMembers: Array<Record<string, unknown>> | undefined;

      workspaceMemberModel.find.mockReturnValue(
        createQuery([
          { userId: ownerId, roleId: ROLE_IDS.ADMIN_WORKSPACE },
          { userId: memberId, roleId: ROLE_IDS.MEMBER_WORKSPACE },
          { userId: adminId, roleId: ROLE_IDS.ADMIN_WORKSPACE },
        ]),
      );
      documentMemberModel.insertMany.mockImplementation((items: unknown) => {
        insertedMembers = items as Array<Record<string, unknown>>;
        return Promise.resolve([]);
      });

      await service.handleDocumentCreated({
        documentId: documentId.toString(),
        workspaceId: workspaceId.toString(),
        ownerId: ownerId.toString(),
      });

      expect(insertedMembers).toHaveLength(2);
      expect(insertedMembers?.[0]).toEqual(
        expect.objectContaining({
          documentId,
          userId: adminId,
          roleId: DOCUMENT_ROLE_IDS.OWNER,
        }),
      );
      expect(insertedMembers?.[1]).toEqual(
        expect.objectContaining({
          documentId,
          userId: memberId,
          roleId: DOCUMENT_ROLE_IDS.EDITOR,
        }),
      );
    });

    it('does not insert when the owner is the only workspace member', async () => {
      const ownerId = new Types.ObjectId();
      workspaceMemberModel.find.mockReturnValue(
        createQuery([
          { userId: ownerId, roleId: ROLE_IDS.ADMIN_WORKSPACE },
        ]),
      );

      await service.handleDocumentCreated({
        documentId: new Types.ObjectId().toString(),
        workspaceId: new Types.ObjectId().toString(),
        ownerId: ownerId.toString(),
      });

      expect(documentMemberModel.insertMany).not.toHaveBeenCalled();
    });

    it('swallows duplicate insert errors from the event handler', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      workspaceMemberModel.find.mockReturnValue(
        createQuery([
          {
            userId: new Types.ObjectId(),
            roleId: ROLE_IDS.MEMBER_WORKSPACE,
          },
        ]),
      );
      documentMemberModel.insertMany.mockRejectedValue(
        new Error('duplicate key'),
      );

      await expect(
        service.handleDocumentCreated({
          documentId: new Types.ObjectId().toString(),
          workspaceId: new Types.ObjectId().toString(),
          ownerId: new Types.ObjectId().toString(),
        }),
      ).resolves.toBeUndefined();

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('handleWorkspaceMemberAdded', () => {
    it('returns without bulk writes when the workspace has no documents', async () => {
      documentModel.find.mockReturnValue(createQuery([]));

      await service.handleWorkspaceMemberAdded({
        workspaceId: new Types.ObjectId().toString(),
        userId: new Types.ObjectId().toString(),
      });

      expect(documentMemberModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('upserts editor access for every active workspace document', async () => {
      const workspaceId = new Types.ObjectId();
      const userId = new Types.ObjectId();
      const firstDocumentId = new Types.ObjectId();
      const secondDocumentId = new Types.ObjectId();
      let bulkOperations: Array<Record<string, unknown>> | undefined;

      documentModel.find.mockReturnValue(
        createQuery([{ _id: firstDocumentId }, { _id: secondDocumentId }]),
      );
      documentMemberModel.bulkWrite.mockImplementation((ops: unknown) => {
        bulkOperations = ops as Array<Record<string, unknown>>;
        return Promise.resolve({});
      });

      await service.handleWorkspaceMemberAdded({
        workspaceId: workspaceId.toString(),
        userId: userId.toString(),
      });

      expect(bulkOperations).toHaveLength(2);
      const firstBulkOperation = bulkOperations?.[0] as
        | {
            updateOne: {
              filter: {
                documentId: Types.ObjectId;
                userId: Types.ObjectId;
              };
              update: {
                $setOnInsert: {
                  documentId: Types.ObjectId;
                  userId: Types.ObjectId;
                  roleId: Types.ObjectId;
                  joinedAt: Date;
                  isDeleted: boolean;
                };
              };
              upsert: boolean;
            };
          }
        | undefined;
      expect(firstBulkOperation?.updateOne.filter).toEqual({
        documentId: firstDocumentId,
        userId,
      });
      expect(firstBulkOperation?.updateOne.update.$setOnInsert).toEqual(
        expect.objectContaining({
          documentId: firstDocumentId,
          userId,
          roleId: DOCUMENT_ROLE_IDS.EDITOR,
          isDeleted: false,
        }),
      );
      expect(
        firstBulkOperation?.updateOne.update.$setOnInsert.joinedAt,
      ).toBeInstanceOf(Date);
      expect(firstBulkOperation?.updateOne.upsert).toBe(true);
    });

    it('swallows bulk-write errors from the event handler', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      documentModel.find.mockReturnValue(
        createQuery([{ _id: new Types.ObjectId() }]),
      );
      documentMemberModel.bulkWrite.mockRejectedValue(new Error('bulk failed'));

      await expect(
        service.handleWorkspaceMemberAdded({
          workspaceId: new Types.ObjectId().toString(),
          userId: new Types.ObjectId().toString(),
        }),
      ).resolves.toBeUndefined();

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
