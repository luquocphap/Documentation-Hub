import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentRole, DocumentRoleAction, DocumentRoleResource } from 'src/modules-api/document/schemas/document-roles.schema';

export const DOCUMENT_ROLE_IDS = {
  OWNER:     new Types.ObjectId('111111111111111111111001'),
  EDITOR:    new Types.ObjectId('111111111111111111111002'),
  COMMENTER: new Types.ObjectId('111111111111111111111003'),
  VIEWER:    new Types.ObjectId('111111111111111111111004'),
};

@Injectable()
export class DocumentRoleSeeder {
  constructor(
    @InjectModel(DocumentRole.name) private readonly roleModel: Model<DocumentRole>,
  ) {}

  async seed() {
    const roles = [
      {
        _id: DOCUMENT_ROLE_IDS.OWNER,
        name: 'Owner',
        description: "Full control over the document",
        permissions: [
          { action: DocumentRoleAction.VIEW, resource: DocumentRoleResource.DOCUMENT },
          { action: DocumentRoleAction.EDIT, resource: DocumentRoleResource.DOCUMENT },
          { action: DocumentRoleAction.DELETE, resource: DocumentRoleResource.DOCUMENT },
          { action: DocumentRoleAction.SHARE, resource: DocumentRoleResource.DOCUMENT },
          { action: DocumentRoleAction.COMMENT, resource: DocumentRoleResource.DOCUMENT },
          { action: DocumentRoleAction.MANAGE_ACCESS, resource: DocumentRoleResource.DOCUMENT },
        ],
      },
      {
        _id: DOCUMENT_ROLE_IDS.EDITOR,
        name: 'Editor',
        description: "Can edit document content",
        permissions: [
          { action: DocumentRoleAction.VIEW, resource: DocumentRoleResource.DOCUMENT },
          { action: DocumentRoleAction.EDIT, resource: DocumentRoleResource.DOCUMENT },
        ],
      },
      {
        _id: DOCUMENT_ROLE_IDS.COMMENTER,
        name: 'Commenter',
        description: "Can view and leave comments",
        permissions: [
          { action: DocumentRoleAction.VIEW, resource: DocumentRoleResource.DOCUMENT },
          { action: DocumentRoleAction.COMMENT, resource: DocumentRoleResource.DOCUMENT },
        ],
      },
      {
        _id: DOCUMENT_ROLE_IDS.VIEWER,
        name: 'Viewer',
        description: "Can only view document",
        permissions: [
          { action: DocumentRoleAction.VIEW, resource: DocumentRoleResource.DOCUMENT },
        ],
      },
    ];

    for (const role of roles) {
        const { _id, ...updateData } = role;
        await this.roleModel.updateOne({ _id }, { $set: updateData }, { upsert: true });
    }
    console.log('✅ DocumentRoles seeded successfully');
  }
}