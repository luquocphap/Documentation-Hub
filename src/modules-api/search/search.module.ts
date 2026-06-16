import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DocumentMember,
  DocumentMemberSchema,
} from '../document/schemas/document-members.schema';
import {
  DocumentModel,
  DocumentSchema,
} from '../document/schemas/documents.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentModel.name, schema: DocumentSchema },
      { name: DocumentMember.name, schema: DocumentMemberSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
