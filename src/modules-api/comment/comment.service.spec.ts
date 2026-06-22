import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { SocketGateway } from 'src/modules-system/socket/socket.gateway';
import { type UserDocument } from '../auth/schemas/user.schema';
import { CommentService } from './comment.service';
import { CommentReply } from './schemas/comment-replies.schema';
import { DocumentAnnotation } from './schemas/document-annotations.schema';
import {
  DocumentComment,
  DocumentCommentStatus,
} from './schemas/document-comments.schema';

jest.mock('src/modules-system/socket/socket.gateway', () => ({
  SocketGateway: class SocketGateway {},
}));

type MockModel = jest.Mock & {
  find: jest.Mock;
  findOne: jest.Mock;
  findById: jest.Mock;
  findByIdAndUpdate: jest.Mock;
  findOneAndUpdate: jest.Mock;
  deleteMany: jest.Mock;
};

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
  return Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteMany: jest.fn(),
  });
}

describe('CommentService', () => {
  let service: CommentService;
  let commentModel: MockModel;
  let annotationModel: MockModel;
  let replyModel: MockModel;
  let socketGateway: {
    emitCommentCreated: jest.Mock;
    emitCommentUpdated: jest.Mock;
    emitCommentDeleted: jest.Mock;
    emitReplyCreatedSummary: jest.Mock;
  };

  const createUser = (
    overrides: Partial<{
      _id: Types.ObjectId;
      email: string;
      fullName: string;
    }> = {},
  ): UserDocument =>
    ({
      _id: new Types.ObjectId(),
      email: 'owner@example.com',
      fullName: 'Comment Owner',
      ...overrides,
    }) as unknown as UserDocument;

  const createPopulatedComment = (overrides: Record<string, unknown> = {}) => {
    const now = new Date();

    return {
      _id: new Types.ObjectId(),
      documentId: new Types.ObjectId(),
      text: 'Initial comment',
      selectedText: 'selected text',
      pageNumber: 1,
      status: DocumentCommentStatus.OPEN,
      replyCount: 0,
      annotationRef: null,
      annotationId: null,
      owner: {
        _id: new Types.ObjectId(),
        fullName: 'Comment Owner',
      },
      created_at: now,
      updated_at: now,
      isUpdated: false,
      ...overrides,
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    commentModel = createMockModel();
    annotationModel = createMockModel();
    replyModel = createMockModel();
    socketGateway = {
      emitCommentCreated: jest.fn(),
      emitCommentUpdated: jest.fn(),
      emitCommentDeleted: jest.fn(),
      emitReplyCreatedSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        {
          provide: getModelToken(DocumentComment.name),
          useValue: commentModel,
        },
        {
          provide: getModelToken(DocumentAnnotation.name),
          useValue: annotationModel,
        },
        {
          provide: getModelToken(CommentReply.name),
          useValue: replyModel,
        },
        {
          provide: SocketGateway,
          useValue: socketGateway,
        },
      ],
    }).compile();

    service = module.get(CommentService);
  });

  describe('findRepliesByComment', () => {
    it('returns all replies including soft-deleted replies in creation order', async () => {
      const commentId = new Types.ObjectId();
      const replies = [
        { _id: new Types.ObjectId(), isDeleted: false },
        { _id: new Types.ObjectId(), isDeleted: true },
      ];
      const query = createQuery(replies);
      replyModel.find.mockReturnValue(query);

      await expect(
        service.findRepliesByComment(commentId.toString()),
      ).resolves.toBe(replies);

      expect(replyModel.find).toHaveBeenCalledWith({ commentId });
      expect(replyModel.find).not.toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
      expect(query.populate).toHaveBeenCalledWith('owner', 'fullName');
      expect(query.sort).toHaveBeenCalledWith({ created_at: 1 });
    });
  });

  describe('findAllByDocument', () => {
    it('returns active comments with annotation and owner populated', async () => {
      const documentId = new Types.ObjectId();
      const comments = [createPopulatedComment()];
      const query = createQuery(comments);
      commentModel.find.mockReturnValue(query);

      await expect(
        service.findAllByDocument(documentId.toString()),
      ).resolves.toBe(comments);

      expect(commentModel.find).toHaveBeenCalledWith({
        documentId,
        isDeleted: false,
      });
      expect(query.populate).toHaveBeenCalledTimes(2);
      expect(query.sort).toHaveBeenCalledWith({ created_at: -1 });
    });
  });

  describe('createReply', () => {
    it('creates a reply, increments replyCount and emits the absolute count', async () => {
      const user = createUser();
      const commentId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const populatedReply = {
        _id: new Types.ObjectId(),
        text: 'Reply text',
        owner: { _id: user._id, fullName: user.fullName },
      };
      const savedReply = {
        populate: jest.fn().mockResolvedValue(populatedReply),
      };
      const replyDocument = {
        save: jest.fn().mockResolvedValue(savedReply),
      };

      commentModel.findOne.mockResolvedValue({
        _id: commentId,
        isDeleted: false,
      });
      replyModel.mockImplementation(() => replyDocument);
      commentModel.findOneAndUpdate.mockReturnValue(
        createQuery({
          documentId,
          replyCount: 4,
        }),
      );

      await expect(
        service.createReply(commentId.toString(), user, {
          text: 'Reply text',
        }),
      ).resolves.toBe(populatedReply);

      expect(replyModel).toHaveBeenCalledWith({
        commentId,
        text: 'Reply text',
        owner: user._id,
      });
      expect(commentModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: commentId,
          isDeleted: false,
        },
        {
          $inc: { replyCount: 1 },
        },
        {
          returnDocument: 'after',
        },
      );
      expect(socketGateway.emitReplyCreatedSummary).toHaveBeenCalledWith({
        documentId: documentId.toString(),
        commentId: commentId.toString(),
        replyCount: 4,
      });
    });

    it('throws when the parent comment does not exist', async () => {
      commentModel.findOne.mockResolvedValue(null);

      await expect(
        service.createReply(new Types.ObjectId().toString(), createUser(), {
          text: 'Reply text',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(replyModel).not.toHaveBeenCalled();
    });

    it('throws when the comment disappears during replyCount update', async () => {
      const commentId = new Types.ObjectId();
      const savedReply = {
        populate: jest.fn(),
      };

      commentModel.findOne.mockResolvedValue({ _id: commentId });
      replyModel.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue(savedReply),
      }));
      commentModel.findOneAndUpdate.mockReturnValue(createQuery(null));

      await expect(
        service.createReply(commentId.toString(), createUser(), {
          text: 'Reply text',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(socketGateway.emitReplyCreatedSummary).not.toHaveBeenCalled();
    });

    it('does not fail reply creation when realtime emission throws', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const commentId = new Types.ObjectId();
      const populatedReply = { _id: new Types.ObjectId() };

      commentModel.findOne.mockResolvedValue({ _id: commentId });
      replyModel.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue({
          populate: jest.fn().mockResolvedValue(populatedReply),
        }),
      }));
      commentModel.findOneAndUpdate.mockReturnValue(
        createQuery({
          documentId: new Types.ObjectId(),
          replyCount: 1,
        }),
      );
      socketGateway.emitReplyCreatedSummary.mockImplementation(() => {
        throw new Error('socket unavailable');
      });

      await expect(
        service.createReply(commentId.toString(), createUser(), {
          text: 'Reply text',
        }),
      ).resolves.toBe(populatedReply);

      expect(consoleError).toHaveBeenCalledWith(
        '[CommentRealtime] Failed to emit reply:created_summary',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });
  });

  describe('updateReply', () => {
    it('updates an owned reply and returns the populated result', async () => {
      const user = createUser();
      const commentId = new Types.ObjectId();
      const replyId = new Types.ObjectId();
      const populatedReply = {
        _id: replyId,
        text: 'Updated reply',
      };
      const savedReply = {
        populate: jest.fn().mockResolvedValue(populatedReply),
      };
      const reply = {
        owner: user._id,
        text: 'Old reply',
        isUpdated: false,
        save: jest.fn().mockResolvedValue(savedReply),
      };

      commentModel.findOne.mockResolvedValue({ _id: commentId });
      replyModel.findOne.mockResolvedValue(reply);

      await expect(
        service.updateReply(commentId.toString(), replyId.toString(), user, {
          text: 'Updated reply',
        }),
      ).resolves.toBe(populatedReply);

      expect(reply.text).toBe('Updated reply');
      expect(reply.isUpdated).toBe(true);
      expect(reply.save).toHaveBeenCalled();
    });

    it('throws when the parent comment is inactive', async () => {
      commentModel.findOne.mockResolvedValue(null);

      await expect(
        service.updateReply(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
          createUser(),
          { text: 'Updated reply' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(replyModel.findOne).not.toHaveBeenCalled();
    });

    it('throws when the reply does not exist', async () => {
      commentModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
      replyModel.findOne.mockResolvedValue(null);

      await expect(
        service.updateReply(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
          createUser(),
          { text: 'Updated reply' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the current user does not own the reply', async () => {
      const reply = {
        owner: new Types.ObjectId(),
        save: jest.fn(),
      };

      commentModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
      replyModel.findOne.mockResolvedValue(reply);

      await expect(
        service.updateReply(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
          createUser(),
          { text: 'Updated reply' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(reply.save).not.toHaveBeenCalled();
    });

    it('throws when a reply has no owner', async () => {
      commentModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
      replyModel.findOne.mockResolvedValue({
        owner: null,
        save: jest.fn(),
      });

      await expect(
        service.updateReply(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
          createUser(),
          { text: 'Updated reply' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('removeReply', () => {
    it('soft deletes an owned reply without decrementing replyCount or emitting summary', async () => {
      const user = createUser();
      const commentId = new Types.ObjectId();
      const replyId = new Types.ObjectId();
      const reply = {
        owner: user._id,
        isDeleted: false,
        deletedAt: null as Date | null,
        save: jest.fn().mockResolvedValue(undefined),
      };

      commentModel.findOne.mockResolvedValue({ _id: commentId });
      replyModel.findOne.mockResolvedValue(reply);

      await expect(
        service.removeReply(commentId.toString(), replyId.toString(), user),
      ).resolves.toEqual({
        message: 'Xoa reply thanh cong',
        replyId: replyId.toString(),
      });

      expect(reply.isDeleted).toBe(true);
      expect(reply.deletedAt).toBeInstanceOf(Date);
      expect(reply.save).toHaveBeenCalled();
      expect(commentModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(socketGateway.emitReplyCreatedSummary).not.toHaveBeenCalled();
    });

    it('throws when the parent comment is inactive', async () => {
      commentModel.findOne.mockResolvedValue(null);

      await expect(
        service.removeReply(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
          createUser(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the reply is missing or already deleted', async () => {
      commentModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
      replyModel.findOne.mockResolvedValue(null);

      await expect(
        service.removeReply(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
          createUser(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the current user does not own the reply', async () => {
      const reply = {
        owner: new Types.ObjectId(),
        save: jest.fn(),
      };
      commentModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
      replyModel.findOne.mockResolvedValue(reply);

      await expect(
        service.removeReply(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
          createUser(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(reply.save).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates an annotation and emits a fully mapped comment payload', async () => {
      const user = createUser();
      const documentId = new Types.ObjectId();
      const commentId = new Types.ObjectId();
      const annotationId = new Types.ObjectId();
      const now = new Date();
      const annotationDocument = {
        _id: annotationId,
        save: jest.fn().mockResolvedValue({ _id: annotationId }),
      };
      const commentDocument = {
        _id: commentId,
        save: jest.fn().mockResolvedValue({ _id: commentId }),
      };
      const populatedAnnotation = {
        _id: annotationId,
        documentId,
        annotationId: 'annotation-1',
        type: 'HIGHLIGHT',
        pageNumber: 2,
        quads: [{ x1: 1 }],
        rect: { x: 1 },
        contents: 'Important',
        color: '#FFEB3B',
        opacity: 0.8,
        xfdf: '<xfdf />',
        owner: user._id,
        created_at: now,
        updated_at: now,
      };
      const populatedComment = createPopulatedComment({
        _id: commentId,
        documentId,
        annotationRef: populatedAnnotation,
        annotationId: 'annotation-1',
        owner: {
          _id: user._id,
          fullName: user.fullName,
        },
        created_at: now,
        updated_at: now,
      });

      annotationModel.mockImplementation(() => annotationDocument);
      commentModel.mockImplementation(() => commentDocument);
      commentModel.findOne.mockReturnValue(createQuery(populatedComment));

      const result = await service.create(user, documentId.toString(), {
        text: 'Initial comment',
        selectedText: 'selected text',
        pageNumber: 2,
        annotationId: 'annotation-1',
        annotation: {
          annotationId: 'annotation-1',
          type: 'HIGHLIGHT',
          pageNumber: 2,
          quads: [{ x1: 1 }],
          rect: { x: 1 },
          contents: 'Important',
          color: '#FFEB3B',
          opacity: 0.8,
          xfdf: '<xfdf />',
        },
      });

      expect(annotationModel).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId,
          owner: user._id,
          annotationId: 'annotation-1',
        }),
      );
      expect(commentModel).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId,
          annotationRef: annotationId,
          owner: user._id,
        }),
      );
      expect(result.annotationRef).toEqual({
        _id: annotationId.toString(),
        documentId: documentId.toString(),
        annotationId: 'annotation-1',
        type: 'HIGHLIGHT',
        pageNumber: 2,
        quads: [{ x1: 1 }],
        rect: { x: 1 },
        contents: 'Important',
        color: '#FFEB3B',
        opacity: 0.8,
        xfdf: '<xfdf />',
        owner: user._id.toString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      expect(result.owner).toEqual({
        id: user._id.toString(),
        fullName: user.fullName,
      });
      expect(socketGateway.emitCommentCreated).toHaveBeenCalledWith(
        documentId.toString(),
        result,
      );
    });

    it('uses an existing annotation reference without creating an annotation', async () => {
      const user = createUser();
      const documentId = new Types.ObjectId();
      const annotationRef = new Types.ObjectId();
      const commentId = new Types.ObjectId();

      commentModel.mockImplementation(() => ({
        _id: commentId,
        save: jest.fn().mockResolvedValue({ _id: commentId }),
      }));
      commentModel.findOne.mockReturnValue(
        createQuery(
          createPopulatedComment({
            _id: commentId,
            documentId,
            annotationRef,
            owner: user._id,
          }),
        ),
      );

      const result = await service.create(user, documentId.toString(), {
        text: 'Comment',
        pageNumber: 1,
        annotationRef: annotationRef.toString(),
      });

      expect(annotationModel).not.toHaveBeenCalled();
      expect(commentModel).toHaveBeenCalledWith(
        expect.objectContaining({ annotationRef }),
      );
      expect(result.annotationRef).toBe(annotationRef.toString());
      expect(result.owner).toEqual({
        id: user._id.toString(),
        fullName: 'Unknown',
      });
    });

    it('creates a comment without an annotation', async () => {
      const user = createUser();
      const documentId = new Types.ObjectId();
      const commentId = new Types.ObjectId();

      commentModel.mockImplementation(() => ({
        _id: commentId,
        save: jest.fn().mockResolvedValue({ _id: commentId }),
      }));
      commentModel.findOne.mockReturnValue(
        createQuery(
          createPopulatedComment({
            _id: commentId,
            documentId,
            annotationRef: null,
          }),
        ),
      );

      const result = await service.create(user, documentId.toString(), {
        text: 'Comment',
        pageNumber: 1,
      });

      expect(commentModel).toHaveBeenCalledWith(
        expect.objectContaining({ annotationRef: null }),
      );
      expect(result.annotationRef).toBeNull();
    });

    it('throws when the saved comment cannot be reloaded for realtime payload', async () => {
      const commentId = new Types.ObjectId();

      commentModel.mockImplementation(() => ({
        _id: commentId,
        save: jest.fn().mockResolvedValue({ _id: commentId }),
      }));
      commentModel.findOne.mockReturnValue(createQuery(null));

      await expect(
        service.create(createUser(), new Types.ObjectId().toString(), {
          text: 'Comment',
          pageNumber: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(socketGateway.emitCommentCreated).not.toHaveBeenCalled();
    });

    it('does not fail creation when realtime emission throws', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const documentId = new Types.ObjectId();
      const commentId = new Types.ObjectId();

      commentModel.mockImplementation(() => ({
        _id: commentId,
        save: jest.fn().mockResolvedValue({ _id: commentId }),
      }));
      commentModel.findOne.mockReturnValue(
        createQuery(
          createPopulatedComment({
            _id: commentId,
            documentId,
          }),
        ),
      );
      socketGateway.emitCommentCreated.mockImplementation(() => {
        throw new Error('socket unavailable');
      });

      await expect(
        service.create(createUser(), documentId.toString(), {
          text: 'Comment',
          pageNumber: 1,
        }),
      ).resolves.toBeDefined();

      expect(consoleError).toHaveBeenCalledWith(
        '[CommentRealtime] Failed to emit comment:created',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });
  });

  describe('update', () => {
    it('updates an owned comment and its annotation, then emits the mapped payload', async () => {
      const user = createUser();
      const commentId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const annotationRef = new Types.ObjectId();
      const comment = {
        _id: commentId,
        documentId,
        owner: user._id,
        annotationRef,
        text: 'Old comment',
        status: DocumentCommentStatus.OPEN,
        isUpdated: false,
        save: jest.fn().mockResolvedValue({ _id: commentId }),
      };
      const populatedComment = createPopulatedComment({
        _id: commentId,
        documentId,
        text: 'Updated comment',
        status: DocumentCommentStatus.RESOLVED,
        isUpdated: true,
        owner: {
          _id: user._id,
          fullName: user.fullName,
        },
      });

      commentModel.findOne
        .mockResolvedValueOnce(comment)
        .mockReturnValueOnce(createQuery(populatedComment));
      annotationModel.findByIdAndUpdate.mockResolvedValue({});

      const result = await service.update(commentId.toString(), user, {
        text: 'Updated comment',
        status: DocumentCommentStatus.RESOLVED,
        annotation: {
          color: '#00FF00',
          opacity: 0.5,
        },
      });

      expect(annotationModel.findByIdAndUpdate).toHaveBeenCalledWith(
        annotationRef,
        {
          color: '#00FF00',
          opacity: 0.5,
        },
        { returnDocument: 'after' },
      );
      expect(comment.text).toBe('Updated comment');
      expect(comment.status).toBe(DocumentCommentStatus.RESOLVED);
      expect(comment.isUpdated).toBe(true);
      expect(socketGateway.emitCommentUpdated).toHaveBeenCalledWith(
        documentId.toString(),
        result,
      );
    });

    it('updates a comment without touching annotation when no annotation update is provided', async () => {
      const user = createUser();
      const commentId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const comment = {
        _id: commentId,
        documentId,
        owner: user._id,
        annotationRef: new Types.ObjectId(),
        save: jest.fn().mockResolvedValue({ _id: commentId }),
      };

      commentModel.findOne.mockResolvedValueOnce(comment).mockReturnValueOnce(
        createQuery(
          createPopulatedComment({
            _id: commentId,
            documentId,
          }),
        ),
      );

      await service.update(commentId.toString(), user, {
        text: 'Updated',
      });

      expect(annotationModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('does not update annotation when the comment has no annotationRef', async () => {
      const user = createUser();
      const commentId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const comment = {
        _id: commentId,
        documentId,
        owner: user._id,
        annotationRef: null,
        save: jest.fn().mockResolvedValue({ _id: commentId }),
      };

      commentModel.findOne.mockResolvedValueOnce(comment).mockReturnValueOnce(
        createQuery(
          createPopulatedComment({
            _id: commentId,
            documentId,
          }),
        ),
      );

      await service.update(commentId.toString(), user, {
        annotation: { color: '#00FF00' },
      });

      expect(annotationModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('throws when the comment does not exist', async () => {
      commentModel.findOne.mockResolvedValue(null);

      await expect(
        service.update(new Types.ObjectId().toString(), createUser(), {
          text: 'Updated',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the current user does not own the comment', async () => {
      const comment = {
        owner: new Types.ObjectId(),
        save: jest.fn(),
      };
      commentModel.findOne.mockResolvedValue(comment);

      await expect(
        service.update(new Types.ObjectId().toString(), createUser(), {
          text: 'Updated',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(comment.save).not.toHaveBeenCalled();
    });

    it('does not fail update when realtime emission throws', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const user = createUser();
      const commentId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const comment = {
        _id: commentId,
        documentId,
        owner: user._id,
        annotationRef: null,
        save: jest.fn().mockResolvedValue({ _id: commentId }),
      };

      commentModel.findOne.mockResolvedValueOnce(comment).mockReturnValueOnce(
        createQuery(
          createPopulatedComment({
            _id: commentId,
            documentId,
          }),
        ),
      );
      socketGateway.emitCommentUpdated.mockImplementation(() => {
        throw new Error('socket unavailable');
      });

      await expect(
        service.update(commentId.toString(), user, { text: 'Updated' }),
      ).resolves.toBeDefined();

      expect(consoleError).toHaveBeenCalledWith(
        '[CommentRealtime] Failed to emit comment:updated',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });
  });

  describe('remove', () => {
    it('soft deletes comment and annotation, deletes replies asynchronously and emits annotationId', async () => {
      const user = createUser();
      const commentId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const annotationRef = new Types.ObjectId();
      const comment = {
        _id: commentId,
        documentId,
        owner: user._id,
        annotationRef,
        annotationId: 'annotation-1',
        isDeleted: false,
        deletedAt: null as Date | null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      const deleteQuery = createQuery({ deletedCount: 2 });

      commentModel.findOne.mockResolvedValue(comment);
      annotationModel.findByIdAndUpdate.mockResolvedValue({});
      replyModel.deleteMany.mockReturnValue(deleteQuery);

      await expect(service.remove(commentId.toString(), user)).resolves.toEqual(
        {
          message: 'Xoa comment thanh cong',
          commentId: commentId.toString(),
        },
      );

      expect(comment.isDeleted).toBe(true);
      expect(comment.deletedAt).toBeInstanceOf(Date);
      expect(annotationModel.findByIdAndUpdate).toHaveBeenCalledWith(
        annotationRef,
        {
          isDeleted: true,
          deletedAt: comment.deletedAt,
        },
      );
      expect(replyModel.deleteMany).toHaveBeenCalledWith({ commentId });
      expect(socketGateway.emitCommentDeleted).toHaveBeenCalledWith({
        documentId: documentId.toString(),
        commentId: commentId.toString(),
        annotationId: 'annotation-1',
      });
    });

    it('loads annotationId from annotationRef when the comment does not store it', async () => {
      const user = createUser();
      const commentId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const annotationRef = new Types.ObjectId();
      const comment = {
        _id: commentId,
        documentId,
        owner: user._id,
        annotationRef,
        annotationId: null,
        save: jest.fn().mockResolvedValue(undefined),
      };

      commentModel.findOne.mockResolvedValue(comment);
      annotationModel.findById.mockReturnValue(
        createQuery({ annotationId: 'loaded-annotation-id' }),
      );
      annotationModel.findByIdAndUpdate.mockResolvedValue({});
      replyModel.deleteMany.mockReturnValue(createQuery({}));

      await service.remove(commentId.toString(), user);

      expect(socketGateway.emitCommentDeleted).toHaveBeenCalledWith({
        documentId: documentId.toString(),
        commentId: commentId.toString(),
        annotationId: 'loaded-annotation-id',
      });
    });

    it('emits a null annotationId when annotation lookup returns nothing', async () => {
      const user = createUser();
      const commentId = new Types.ObjectId();
      const documentId = new Types.ObjectId();
      const annotationRef = new Types.ObjectId();

      commentModel.findOne.mockResolvedValue({
        _id: commentId,
        documentId,
        owner: user._id,
        annotationRef,
        annotationId: null,
        save: jest.fn().mockResolvedValue(undefined),
      });
      annotationModel.findById.mockReturnValue(createQuery(null));
      annotationModel.findByIdAndUpdate.mockResolvedValue({});
      replyModel.deleteMany.mockReturnValue(createQuery({}));

      await service.remove(commentId.toString(), user);

      expect(socketGateway.emitCommentDeleted).toHaveBeenCalledWith(
        expect.objectContaining({ annotationId: null }),
      );
    });

    it('does not query or delete annotation when the comment has no annotationRef', async () => {
      const user = createUser();
      const commentId = new Types.ObjectId();

      commentModel.findOne.mockResolvedValue({
        _id: commentId,
        documentId: new Types.ObjectId(),
        owner: user._id,
        annotationRef: null,
        annotationId: null,
        save: jest.fn().mockResolvedValue(undefined),
      });
      replyModel.deleteMany.mockReturnValue(createQuery({}));

      await service.remove(commentId.toString(), user);

      expect(annotationModel.findById).not.toHaveBeenCalled();
      expect(annotationModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('logs reply cleanup failures without failing comment removal', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const user = createUser();
      const commentId = new Types.ObjectId();
      const deleteQuery = createQuery({});
      deleteQuery.exec.mockRejectedValue(new Error('cleanup failed'));

      commentModel.findOne.mockResolvedValue({
        _id: commentId,
        documentId: new Types.ObjectId(),
        owner: user._id,
        annotationRef: null,
        annotationId: null,
        save: jest.fn().mockResolvedValue(undefined),
      });
      replyModel.deleteMany.mockReturnValue(deleteQuery);

      await expect(
        service.remove(commentId.toString(), user),
      ).resolves.toHaveProperty('message');

      await Promise.resolve();
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to delete comment replies',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });

    it('throws when the comment does not exist', async () => {
      commentModel.findOne.mockResolvedValue(null);

      await expect(
        service.remove(new Types.ObjectId().toString(), createUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the current user does not own the comment', async () => {
      const comment = {
        owner: new Types.ObjectId(),
        save: jest.fn(),
      };
      commentModel.findOne.mockResolvedValue(comment);

      await expect(
        service.remove(new Types.ObjectId().toString(), createUser()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(comment.save).not.toHaveBeenCalled();
    });

    it('does not fail removal when realtime emission throws', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const user = createUser();
      const commentId = new Types.ObjectId();

      commentModel.findOne.mockResolvedValue({
        _id: commentId,
        documentId: new Types.ObjectId(),
        owner: user._id,
        annotationRef: null,
        annotationId: null,
        save: jest.fn().mockResolvedValue(undefined),
      });
      replyModel.deleteMany.mockReturnValue(createQuery({}));
      socketGateway.emitCommentDeleted.mockImplementation(() => {
        throw new Error('socket unavailable');
      });

      await expect(
        service.remove(commentId.toString(), user),
      ).resolves.toHaveProperty('message');

      expect(consoleError).toHaveBeenCalledWith(
        '[CommentRealtime] Failed to emit comment:deleted',
        expect.any(Error),
      );
      consoleError.mockRestore();
    });
  });
});
