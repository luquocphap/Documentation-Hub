import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { type UserDocument } from '../auth/schemas/user.schema';
import { DocumentMember } from '../document/schemas/document-members.schema';
import { DocumentModel } from '../document/schemas/documents.schema';
import { SearchService } from './search.service';

type MockModel = Record<string, jest.Mock>;

function createDistinctQuery<T>(value: T) {
  const query: Record<string, jest.Mock> = {};

  query.distinct = jest.fn(() => query);
  query.exec = jest.fn().mockResolvedValue(value);

  return query;
}

function createDocumentQuery<T>(value: T) {
  const query: Record<string, jest.Mock> = {};

  query.populate = jest.fn(() => query);
  query.sort = jest.fn(() => query);
  query.skip = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.lean = jest.fn(() => query);
  query.exec = jest.fn().mockResolvedValue(value);

  return query;
}

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function createMockModel(): MockModel {
  return {
    find: jest.fn(),
    countDocuments: jest.fn(),
  };
}

function createRequest(query: Request['query']): Request {
  return { query } as Request;
}

describe('SearchService', () => {
  let service: SearchService;
  let documentModel: MockModel;
  let documentMemberModel: MockModel;

  const createUser = (id = new Types.ObjectId()): UserDocument =>
    ({
      _id: id,
      email: 'member@example.com',
      fullName: 'Member',
    }) as unknown as UserDocument;

  beforeEach(async () => {
    jest.clearAllMocks();

    documentModel = createMockModel();
    documentMemberModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: getModelToken(DocumentModel.name),
          useValue: documentModel,
        },
        {
          provide: getModelToken(DocumentMember.name),
          useValue: documentMemberModel,
        },
      ],
    }).compile();

    service = module.get(SearchService);
  });

  it('returns empty results without querying documents when user has no access', async () => {
    const user = createUser();
    const memberQuery = createDistinctQuery<Types.ObjectId[]>([]);
    documentMemberModel.find.mockReturnValue(memberQuery);

    await expect(
      service.searchDocuments(createRequest({}), user),
    ).resolves.toEqual({
      items: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    expect(documentMemberModel.find).toHaveBeenCalledWith({
      userId: user._id,
      isDeleted: { $ne: true },
    });
    expect(memberQuery.distinct).toHaveBeenCalledWith('documentId');
    expect(documentModel.countDocuments).not.toHaveBeenCalled();
    expect(documentModel.find).not.toHaveBeenCalled();
  });

  it('applies search, workspace, date and pagination filters and maps documents', async () => {
    const user = createUser();
    const firstDocumentId = new Types.ObjectId();
    const secondDocumentId = new Types.ObjectId();
    const thirdDocumentId = new Types.ObjectId();
    const accessibleIds = [firstDocumentId, secondDocumentId, thirdDocumentId];
    const firstWorkspaceId = new Types.ObjectId();
    const secondWorkspaceId = new Types.ObjectId();
    const populatedOwnerId = new Types.ObjectId();
    const rawOwnerId = new Types.ObjectId();
    const createdAt = new Date('2026-06-01T00:00:00.000Z');
    const updatedAt = new Date('2026-06-15T00:00:00.000Z');
    const longContent =
      'This introduction contains enough context before the contract keyword and enough trailing words to create a useful preview for the result list without returning the entire document body.';
    const memberQuery = createDistinctQuery(accessibleIds);
    const documentQuery = createDocumentQuery([
      {
        _id: firstDocumentId,
        title: 'Agreement',
        content: longContent,
        workspaceId: {
          _id: firstWorkspaceId,
          name: 'Legal',
        },
        createdBy: {
          _id: populatedOwnerId,
          fullName: 'Alice',
          email: 'alice@example.com',
        },
        public_id: 'first-pdf',
        created_at: createdAt,
        updated_at: updatedAt,
      },
      {
        _id: secondDocumentId,
        title: 'Contract checklist',
        content: 'This content does not contain the requested term.',
        workspaceId: {
          _id: secondWorkspaceId,
          name: 'Operations',
        },
        createdBy: rawOwnerId,
        public_id: 'second-pdf',
        created_at: createdAt,
        updated_at: updatedAt,
      },
      {
        _id: thirdDocumentId,
        title: 'Unrelated title',
        content: '',
        workspaceId: {
          _id: secondWorkspaceId,
          name: 'Operations',
        },
        createdBy: null,
        public_id: '',
        created_at: createdAt,
        updated_at: updatedAt,
      },
    ]);
    let capturedCountFilter: Record<string, unknown> | undefined;
    let capturedFindFilter: Record<string, unknown> | undefined;

    documentMemberModel.find.mockReturnValue(memberQuery);
    documentModel.countDocuments.mockImplementation(
      (filter: Record<string, unknown>) => {
        capturedCountFilter = filter;
        return createExecQuery(25);
      },
    );
    documentModel.find.mockImplementation((filter: Record<string, unknown>) => {
      capturedFindFilter = filter;
      return documentQuery;
    });

    const result = await service.searchDocuments(
      createRequest({
        search: ' contract ',
        workspaceIds: `${firstWorkspaceId.toString()},invalid-id,${secondWorkspaceId.toString()}`,
        updatedFrom: '2026-06-01',
        updatedTo: '2026-06-16',
        page: '2',
        pageSize: '10',
      }),
      user,
    );

    expect(capturedCountFilter).toEqual(capturedFindFilter);
    expect(capturedFindFilter).toEqual({
      isDeleted: false,
      $or: [
        { title: { $regex: 'contract', $options: 'i' } },
        { content: { $regex: 'contract', $options: 'i' } },
      ],
      workspaceId: {
        $in: [firstWorkspaceId, secondWorkspaceId],
      },
      updated_at: {
        $gte: new Date('2026-06-01'),
        $lte: new Date('2026-06-16'),
      },
      _id: { $in: accessibleIds },
    });
    expect(documentQuery.populate).toHaveBeenNthCalledWith(
      1,
      'createdBy',
      'fullName email',
    );
    expect(documentQuery.populate).toHaveBeenNthCalledWith(
      2,
      'workspaceId',
      'name',
    );
    expect(documentQuery.sort).toHaveBeenCalledWith({ updated_at: -1 });
    expect(documentQuery.skip).toHaveBeenCalledWith(10);
    expect(documentQuery.limit).toHaveBeenCalledWith(10);

    expect(result.items[0]).toEqual({
      id: firstDocumentId,
      title: 'Agreement',
      workspaceId: firstWorkspaceId,
      workspaceName: 'Legal',
      public_id: 'first-pdf',
      ownerId: populatedOwnerId,
      ownerName: 'Alice',
      ownerEmail: 'alice@example.com',
      contentPreview: result.items[0].contentPreview,
      matchedField: 'content',
      updatedAt,
      createdAt,
    });
    expect(result.items[0].contentPreview).toContain('contract');
    expect(result.items[0].contentPreview.length).toBeLessThan(
      longContent.length,
    );
    expect(result.items[1]).toEqual(
      expect.objectContaining({
        id: secondDocumentId,
        ownerId: rawOwnerId,
        ownerName: 'Unknown',
        ownerEmail: undefined,
        matchedField: 'title',
      }),
    );
    expect(result.items[2]).toEqual(
      expect.objectContaining({
        id: thirdDocumentId,
        ownerId: null,
        ownerName: 'Unknown',
        ownerEmail: undefined,
        contentPreview: '',
        matchedField: null,
      }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('uses default page, caps pageSize and ignores invalid filters', async () => {
    const documentId = new Types.ObjectId();
    const workspaceId = new Types.ObjectId();
    const shortContent = 'Short content without truncation.';
    const memberQuery = createDistinctQuery([documentId]);
    const documentQuery = createDocumentQuery([
      {
        _id: documentId,
        title: 'Roadmap',
        content: shortContent,
        workspaceId: {
          _id: workspaceId,
          name: 'Engineering',
        },
        createdBy: {
          _id: new Types.ObjectId(),
          fullName: 'Owner',
        },
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    let capturedFilter: Record<string, unknown> | undefined;

    documentMemberModel.find.mockReturnValue(memberQuery);
    documentModel.countDocuments.mockImplementation(
      (filter: Record<string, unknown>) => {
        capturedFilter = filter;
        return createExecQuery(1);
      },
    );
    documentModel.find.mockReturnValue(documentQuery);

    const result = await service.searchDocuments(
      createRequest({
        search: ['not', 'a', 'string'],
        workspaceIds: 'invalid-one,invalid-two',
        updatedFrom: 'invalid-date',
        updatedTo: 'also-invalid',
        page: '-3',
        pageSize: '100',
      }),
      createUser(),
    );

    expect(capturedFilter).toEqual({
      isDeleted: false,
      _id: { $in: [documentId] },
    });
    expect(documentQuery.skip).toHaveBeenCalledWith(0);
    expect(documentQuery.limit).toHaveBeenCalledWith(50);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        contentPreview: shortContent,
        matchedField: null,
      }),
    );
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('uses default pageSize for non-positive values and truncates content without a keyword', async () => {
    const documentId = new Types.ObjectId();
    const workspaceId = new Types.ObjectId();
    const longContent = `${'word '.repeat(40)}tail`;
    const documentQuery = createDocumentQuery([
      {
        _id: documentId,
        title: 'Roadmap',
        content: longContent,
        workspaceId: {
          _id: workspaceId,
          name: 'Engineering',
        },
        createdBy: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    documentMemberModel.find.mockReturnValue(createDistinctQuery([documentId]));
    documentModel.countDocuments.mockReturnValue(createExecQuery(21));
    documentModel.find.mockReturnValue(documentQuery);

    const result = await service.searchDocuments(
      createRequest({
        search: '   ',
        page: '2',
        pageSize: '0',
      }),
      createUser(),
    );

    expect(documentQuery.skip).toHaveBeenCalledWith(20);
    expect(documentQuery.limit).toHaveBeenCalledWith(20);
    expect(result.items[0].contentPreview).toMatch(/\.\.\.$/);
    expect(result.items[0].contentPreview.length).toBeLessThan(
      longContent.length,
    );
    expect(result.items[0].matchedField).toBeNull();
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it('builds a centered preview for a keyword in content without spaces', async () => {
    const documentId = new Types.ObjectId();
    const workspaceId = new Types.ObjectId();
    const content = `${'a'.repeat(200)}Needle${'b'.repeat(200)}`;

    documentMemberModel.find.mockReturnValue(createDistinctQuery([documentId]));
    documentModel.countDocuments.mockReturnValue(createExecQuery(1));
    documentModel.find.mockReturnValue(
      createDocumentQuery([
        {
          _id: documentId,
          title: 'No title match',
          content,
          workspaceId: {
            _id: workspaceId,
            name: 'Engineering',
          },
          createdBy: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    );

    const result = await service.searchDocuments(
      createRequest({ search: 'needle' }),
      createUser(),
    );

    expect(result.items[0].matchedField).toBe('content');
    expect(result.items[0].contentPreview).toMatch(/^\.\.\./);
    expect(result.items[0].contentPreview).toMatch(/\.\.\.$/);
    expect(result.items[0].contentPreview.toLowerCase()).toContain('needle');
  });

  it('keeps preview at the beginning when the keyword starts the content', async () => {
    const documentId = new Types.ObjectId();
    const workspaceId = new Types.ObjectId();
    const content = `Needle ${'context word '.repeat(30)}`;

    documentMemberModel.find.mockReturnValue(createDistinctQuery([documentId]));
    documentModel.countDocuments.mockReturnValue(createExecQuery(1));
    documentModel.find.mockReturnValue(
      createDocumentQuery([
        {
          _id: documentId,
          title: 'Roadmap',
          content,
          workspaceId: {
            _id: workspaceId,
            name: 'Engineering',
          },
          createdBy: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    );

    const result = await service.searchDocuments(
      createRequest({ search: 'needle' }),
      createUser(),
    );

    expect(result.items[0].contentPreview).not.toMatch(/^\.\.\./);
    expect(result.items[0].contentPreview).toMatch(/\.\.\.$/);
  });

  it('shifts the preview window backward when the keyword is near the end', async () => {
    const documentId = new Types.ObjectId();
    const workspaceId = new Types.ObjectId();
    const content = `${'context word '.repeat(30)}needle`;

    documentMemberModel.find.mockReturnValue(createDistinctQuery([documentId]));
    documentModel.countDocuments.mockReturnValue(createExecQuery(1));
    documentModel.find.mockReturnValue(
      createDocumentQuery([
        {
          _id: documentId,
          title: 'Roadmap',
          content,
          workspaceId: {
            _id: workspaceId,
            name: 'Engineering',
          },
          createdBy: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    );

    const result = await service.searchDocuments(
      createRequest({ search: 'needle' }),
      createUser(),
    );

    expect(result.items[0].contentPreview).toMatch(/^\.\.\./);
    expect(result.items[0].contentPreview).not.toMatch(/\.\.\.$/);
    expect(result.items[0].contentPreview).toContain('needle');
  });

  it('expands preview for a keyword longer than the normal preview size', async () => {
    const documentId = new Types.ObjectId();
    const workspaceId = new Types.ObjectId();
    const keyword = 'k'.repeat(160);
    const content = `prefix ${keyword} suffix`;

    documentMemberModel.find.mockReturnValue(createDistinctQuery([documentId]));
    documentModel.countDocuments.mockReturnValue(createExecQuery(1));
    documentModel.find.mockReturnValue(
      createDocumentQuery([
        {
          _id: documentId,
          title: 'Roadmap',
          content,
          workspaceId: {
            _id: workspaceId,
            name: 'Engineering',
          },
          createdBy: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    );

    const result = await service.searchDocuments(
      createRequest({ search: keyword }),
      createUser(),
    );

    expect(result.items[0].contentPreview).toContain(keyword);
    expect(result.items[0].matchedField).toBe('content');
  });

  it('truncates a long no-space content at the exact preview length', async () => {
    const documentId = new Types.ObjectId();
    const workspaceId = new Types.ObjectId();
    const content = 'x'.repeat(200);

    documentMemberModel.find.mockReturnValue(createDistinctQuery([documentId]));
    documentModel.countDocuments.mockReturnValue(createExecQuery(1));
    documentModel.find.mockReturnValue(
      createDocumentQuery([
        {
          _id: documentId,
          title: 'Roadmap',
          content,
          workspaceId: {
            _id: workspaceId,
            name: 'Engineering',
          },
          createdBy: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    );

    const result = await service.searchDocuments(
      createRequest({}),
      createUser(),
    );

    expect(result.items[0].contentPreview).toBe(`${'x'.repeat(150)}...`);
  });
});
