import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenModule } from 'src/modules-system/token/token.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { VerificationToken, VerificationTokenSchema } from './schemas/verification-token.schema';
import { WorkspaceMember, WorkspaceMemberSchema } from '../workspace/schemas/workspace_members.schema';
import { DocumentMember, DocumentMemberSchema } from '../document/schemas/document-members.schema';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [
    TokenModule,
    WorkspaceModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: VerificationToken.name, schema: VerificationTokenSchema },
      { name: WorkspaceMember.name, schema: WorkspaceMemberSchema },
      { name: DocumentMember.name, schema: DocumentMemberSchema }
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
