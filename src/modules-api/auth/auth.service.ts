import { BadRequestException, GoneException, Injectable } from '@nestjs/common';
import { LoginBody } from './dto/login.dto';
import * as bcrypt from "bcrypt";
import { TokenService } from 'src/modules-system/token/token.service';
import { RegisterBody } from './dto/register.dto';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { sendVerifyEmail } from 'src/common/email/send-verify-email';
import crypto from "crypto";
import { RedisService } from 'src/modules-system/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User, UserDocument } from './schemas/user.schema';
import { VerificationToken } from './schemas/verification-token.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { WorkspaceMember } from '../workspace/schemas/workspace_members.schema';
import { DocumentMember } from '../document/schemas/document-members.schema';
import {
  WorkspaceService,
  type WorkspaceInvitationAcceptanceResult,
} from '../workspace/workspace.service';
import { getWorkspaceIdFromRedirect } from './utils/workspace-redirect.util';
import { ResendVerificationDto } from './dto/resend-verification.dto';

type VerificationInvitationContext = {
  invitationId: Types.ObjectId;
  redirectTo: string;
} | null;

const VERIFICATION_TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(VerificationToken.name)
    private readonly verificationTokenModel: Model<VerificationToken>,
    @InjectModel(WorkspaceMember.name)
    private readonly workspaceMemberModel: Model<WorkspaceMember>,
    @InjectModel(DocumentMember.name)
    private readonly documentMemberModel: Model<DocumentMember>,
    private readonly redisService: RedisService,
    private readonly tokenService: TokenService,
    private eventEmitter: EventEmitter2,
    private readonly workspaceService: WorkspaceService,
  ) {}

  // get pending workspace invitation
  private async resolveVerificationInvitationContext(payload: {
    email: string;
    userId?: Types.ObjectId;
    redirectTo?: string;
  }): Promise<VerificationInvitationContext> {
    if (payload.redirectTo) {
      const workspaceId = getWorkspaceIdFromRedirect(payload.redirectTo);
      if (!workspaceId) {
        throw new BadRequestException(
          'redirectTo must be an internal workspace path',
        );
      }

      return this.workspaceService.findPendingInvitationForRegistration({
        email: payload.email,
        workspaceId,
      });
    }

    if (!payload.userId) {
      return null;
    }

    const previousRecord = await this.verificationTokenModel
      .findOne({
        userId: payload.userId,
        workspaceInvitationId: { $ne: null },
        redirectTo: { $ne: null },
      })
      .sort({ createdAt: -1 })
      .select('workspaceInvitationId redirectTo')
      .lean()
      .exec();

    if (!previousRecord?.workspaceInvitationId || !previousRecord.redirectTo) {
      return null;
    }

    return {
      invitationId: previousRecord.workspaceInvitationId,
      redirectTo: previousRecord.redirectTo,
    };
  }

  // invalidate the old verification token and create a new one
  private async issueVerificationEmail(
    user: UserDocument,
    invitationContext: VerificationInvitationContext,
  ): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');

    await this.verificationTokenModel.updateMany(
      {
        userId: user._id,
        isUsed: false,
        isValid: true,
      },
      { $set: { isValid: false } },
    );

    await this.verificationTokenModel.create({
      token,
      userId: user._id,
      workspaceInvitationId: invitationContext?.invitationId,
      redirectTo: invitationContext?.redirectTo,
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    });

    await sendVerifyEmail({
      to: user.email,
      fullName: user.fullName,
      token,
      redirectTo: invitationContext?.redirectTo,
    });
  }

  private async persistRefreshToken(
    userId: string,
    refreshToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const ttlSeconds = this.getRefreshTokenTtlSeconds(expiresAt);

    await this.redisService
      .getClient()
      .set(`refresh_token:${userId}`, refreshToken, 'EX', ttlSeconds);
  }

  private getRefreshTokenTtlSeconds(expiresAt: Date): number {
    return Math.max(
      1,
      Math.ceil((expiresAt.getTime() - Date.now()) / 1000),
    );
  }

  private async rotateRefreshToken(payload: {
    userId: string;
    currentRefreshToken: string;
    newRefreshToken: string;
    expiresAt: Date;
  }): Promise<void> {
    const result = await this.redisService.getClient().eval(
      `
        if redis.call('GET', KEYS[1]) ~= ARGV[1] then
          return 0
        end

        redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
        return 1
      `,
      1,
      `refresh_token:${payload.userId}`,
      payload.currentRefreshToken,
      payload.newRefreshToken,
      this.getRefreshTokenTtlSeconds(payload.expiresAt),
    );

    if (result !== 1) {
      throw new BadRequestException('refreshToken is invalid');
    }
  }

  async register(body: RegisterBody) {
    const { password, fullName, redirectTo } = body;
    const email = body.email.trim().toLowerCase();

    const existingUser = await this.userModel
      .findOne({ email })
      .select('+passwordHash')
      .exec();

    if (existingUser?.isEmailVerified) {
      throw new BadRequestException('Existing email address');
    }

    // if user exists but not verify email yet, get current invitation
    const invitationContext =
      await this.resolveVerificationInvitationContext({
        email,
        userId: existingUser?._id,
        redirectTo,
      });

    if (redirectTo && !invitationContext) {
      throw new BadRequestException(
        'No pending workspace invitation matches redirectTo',
      );
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const user =
      existingUser ??
      new this.userModel({
        email,
      });

    user.passwordHash = hashPassword;
    user.fullName = fullName;
    await user.save();

    // invalidate old token, create new one and send email
    await this.issueVerificationEmail(user, invitationContext);

    return true;
  }

  async resendVerification(body: ResendVerificationDto) {
    const email = body.email.trim().toLowerCase();
    const user = await this.userModel.findOne({ email }).exec();

    if (!user || user.isEmailVerified) {
      throw new BadRequestException("user have verified email");
    }

    const invitationContext =
      await this.resolveVerificationInvitationContext({
        email,
        userId: user._id,
        redirectTo: body.redirectTo,
      });

    if (body.redirectTo && !invitationContext) {
      throw new BadRequestException(
        'No pending workspace invitation matches redirectTo',
      );
    }

    await this.issueVerificationEmail(user, invitationContext);

    return { message: "success" };
  }

    async login(body: LoginBody){
        const { email, password } = body;

        const user = await this.userModel.findOne({ email: email }).select('+passwordHash').exec();

        if (!user) {
            throw new BadRequestException("Incorrect email or password. Please try again.");
        }

        const isPassword = await bcrypt.compare(password, user.passwordHash);

        if (!isPassword){
            throw new BadRequestException("Incorrect email or password. Please try again.")
        }

        // check valid email
        if (!user.isEmailVerified) {
            throw new BadRequestException("Email has not been verified");
        }

        const userId = user._id.toString();
        const accessToken = this.tokenService.createAccessToken(userId);
        const { refreshToken, expiresAt } = this.tokenService.createRefreshToken(userId);

        await this.persistRefreshToken(userId, refreshToken, expiresAt);

        return {
            accessToken: accessToken,
            refreshToken: refreshToken,
            refreshExpiresAt: expiresAt,
        }
    }

    async getUserInfo(userId: Types.ObjectId){
        const user = await this.userModel.findById(userId).exec();
        if (!user) {
            throw new BadRequestException("User does not exist");
        }

        return user.toJSON();
    }

    async refreshToken(req: Request){
        const { accessToken, refreshToken } = req.cookies;

        if (!accessToken) throw new BadRequestException("accessToken does not exist");
        if (!refreshToken) throw new BadRequestException("refreshToken does not exist");

        const decodeAccessToken: any = this.tokenService.verifyAccessToken(accessToken, {
            ignoreExpiration: true
        });

        const decodeRefreshToken: any = this.tokenService.verifyRefreshToken(refreshToken);

        if (decodeAccessToken.userId !== decodeRefreshToken.userId) throw new BadRequestException("cannot refresh token");

        const user = await this.userModel.findById(decodeAccessToken.userId).exec();

        if (!user) throw new BadRequestException("user does not exist");

        const userId = user._id.toString();
        const newAccessToken = this.tokenService.createAccessToken(userId);
        const { refreshToken: newRefreshToken, expiresAt } = this.tokenService.createRefreshToken(userId);

        await this.rotateRefreshToken({
            userId,
            currentRefreshToken: refreshToken,
            newRefreshToken,
            expiresAt,
        });

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            refreshExpiresAt: expiresAt,
        }
    }

  async verifyEmail(token: string) {
    const record = await this.verificationTokenModel.findOne({ token }).exec();

    if (!record) {
      throw new BadRequestException('Verification token is invalid.');
    }

    const user = await this.userModel.findById(record.userId).exec();

    if (!user) {
      throw new BadRequestException('Verification token is invalid.');
    }

    let userVerifiedNow = false;
    let invitationResult: WorkspaceInvitationAcceptanceResult | undefined;

    if (record.isUsed) {
      if (!user.isEmailVerified) {
        throw new BadRequestException('Verification token is invalid.');
      }
    } else {
      if (!record.isValid) {
        throw new BadRequestException('Verification token is invalid.');
      }

      if (record.expiresAt < new Date()) {
        await this.verificationTokenModel.updateOne(
          { _id: record._id, isUsed: false },
          { $set: { isValid: false } },
        );
        throw new GoneException(
          'Token đã hết hạn. Vui lòng yêu cầu gửi lại.',
        );
      }

      const tokenUpdate = await this.verificationTokenModel.updateOne(
        {
          _id: record._id,
          isUsed: false,
          isValid: true,
        },
        { $set: { isUsed: true, isValid: false } },
      );

      // check if duplicate update
      if (tokenUpdate.modifiedCount !== 1) {
        const [latestRecord, latestUser] = await Promise.all([
          this.verificationTokenModel.findById(record._id).lean().exec(),
          this.userModel.findById(user._id).lean().exec(),
        ]);

        if (!latestRecord?.isUsed || !latestUser?.isEmailVerified) {
          throw new BadRequestException('Verification token is invalid.');
        }
      } else {
        const userUpdate = await this.userModel.updateOne(
          { _id: user._id, isEmailVerified: false },
          { $set: { isEmailVerified: true } },
        );
        userVerifiedNow = userUpdate.modifiedCount === 1;
      }
    }

    // post-process for invited people by a workspace
    if (record.workspaceInvitationId) {
      invitationResult =
        await this.workspaceService.acceptInvitationAfterEmailVerified({
          invitationId: record.workspaceInvitationId,
          email: user.email,
          userId: user._id.toString(),
        });
    }

    // if user updated now, emit to update document_member schema
    if (userVerifiedNow) {
      this.eventEmitter.emit('user.email.verified', {
        email: user.email,
        userId: user._id.toString(),
      });
    }

    // emit to update role of all document in workspace for new member
    if (
      invitationResult?.status === 'accepted' &&
      invitationResult.memberAdded &&
      invitationResult.workspaceId
    ) {
      this.eventEmitter.emit('workspace.member.added', {
        workspaceId: invitationResult.workspaceId,
        userId: user._id.toString(),
      });
    }

    const userId = user._id.toString();
    const accessToken = this.tokenService.createAccessToken(userId);
    const { refreshToken, expiresAt } =
      this.tokenService.createRefreshToken(userId);

    await this.persistRefreshToken(
      userId,
      refreshToken,
      expiresAt,
    );

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt,
      redirectTo:
        invitationResult?.status === 'accepted'
          ? invitationResult.redirectTo
          : undefined,
      invitationStatus: invitationResult?.status,
      message: 'Xác thực email thành công.',
    };
  }

    async logout(req: Request, user: UserDocument) {
        const redis = this.redisService.getClient();

        // Validate user exists
        if (!user) {
            throw new BadRequestException('User not found or not authenticated');
        }

        const userId = user._id.toString();

        // Delete refresh token from cache
        await redis.del(
            `refresh_token:${userId}`,
        );

        return {
            message: 'Logout successfully',
        };
    }

    async searchCandidates(query: SearchUserDto) {
        const { keyword, workspaceId, documentId } = query;

        if (!keyword || keyword.trim() === '') {
            return [];
        }

        // Tìm user khớp email
        const users = await this.userModel
            .find({ email: { $regex: keyword, $options: 'i' } })
            .select('email fullName')
            .limit(20)
            .lean();

        if (users.length === 0) return [];

        const userIds = users.map(u => u._id);

        // Chuẩn bị Set để check
        let joinedWorkspaceSet = new Set<string>();
        let joinedDocumentSet = new Set<string>();

        // Nếu có workspaceId -> query xem ai đã join
        if (workspaceId) {
            const joinedWorkspaces = await this.workspaceMemberModel.find({
                workspaceId: new Types.ObjectId(workspaceId),
                userId: { $in: userIds },
                isDeleted: { $ne: true }
            }).select('userId').lean();
            joinedWorkspaceSet = new Set(joinedWorkspaces.map(m => m.userId.toString()));
        }

        //  Nếu có documentId -> query xem ai đã join
        if (documentId) {
            const joinedDocuments = await this.documentMemberModel.find({
                documentId: new Types.ObjectId(documentId),
                userId: { $in: userIds },
                isDeleted: { $ne: true }
            }).select('userId').lean();
            joinedDocumentSet = new Set(joinedDocuments.map(m => m.userId.toString()));
        }

        // Trả về kết quả
        return users.map(user => {
            const result: any = {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
            };

            if (workspaceId) result.inWorkspace = joinedWorkspaceSet.has(user._id.toString());
            if (documentId) result.inDocument = joinedDocumentSet.has(user._id.toString());

            return result;
        });
    }
}
