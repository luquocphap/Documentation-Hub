import { BadRequestException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { LoginBody } from './dto/login.dto';
import * as bcrypt from "bcrypt";
import { TokenService } from 'src/modules-system/token/token.service';
import { RegisterBody } from './dto/register.dto';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { sendVerifyEmail } from 'src/common/verify-email/send-verify-email';
import crypto from "crypto";
import { RedisService } from 'src/modules-system/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User, UserDocument } from './schemas/user.schema';
import { VerificationToken } from './schemas/verification-token.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { WorkspaceMember } from '../workspace/schemas/workspace_members.schema';
import { DocumentMember } from '../document/schemas/document-members.schema';

@Injectable()
export class AuthService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<User>,
        @InjectModel(VerificationToken.name) private readonly verificationTokenModel: Model<VerificationToken>,
        @InjectModel(WorkspaceMember.name) private readonly workspaceMemberModel: Model<WorkspaceMember>,
        @InjectModel(DocumentMember.name) private readonly documentMemberModel: Model<DocumentMember>,
        private readonly redisService: RedisService,
        private readonly tokenService: TokenService,
        private eventEmitter: EventEmitter2
    ) {}

    async register(body: RegisterBody) {
        const { email, password, fullName } = body;

        const userExist = await this.userModel.exists({ email: email })

        if (userExist) {
            throw new BadRequestException("Existing email address");
        }

        const hashPassword = await bcrypt.hash(password, 10);

        const newUser = await this.userModel.create({
            email: email,
            passwordHash: hashPassword,
            fullName: fullName
        })

        const token = crypto.randomBytes(32).toString('hex'); // 64 ký tự hex

        // Lưu Token, expire time: 1h
        await this.verificationTokenModel.create({
            token,
            userId: newUser._id,
            expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000),
        });
        
        // Gửi email xác thực
        await sendVerifyEmail({
            to: newUser.email,
            fullName: newUser.fullName,
            token,
        });

        return true;
    }

    async login(body: LoginBody){
        const { email, password } = body;
        const redis = this.redisService.getClient();

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

        // save refresh token to cache 60s
        await redis.set(
            `refresh_token:${userId}`,
            refreshToken,
            'EX',
            60,
        );

        return {
            accessToken: accessToken,
            refreshToken: refreshToken
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
        const redis = this.redisService.getClient();

        if (!accessToken) throw new BadRequestException("accessToken does not exist");
        if (!refreshToken) throw new BadRequestException("refreshToken does not exist");

        const decodeAccessToken: any = this.tokenService.verifyAccessToken(accessToken, { 
            ignoreExpiration: true 
        });
        
        const decodeRefreshToken: any = this.tokenService.verifyRefreshToken(refreshToken);

        if (decodeAccessToken.userId !== decodeRefreshToken.userId) throw new BadRequestException("cannot refresh token");

        const tokenRecord = redis.get(
            `refresh_token:${decodeRefreshToken.userId}`,
        )

        if (!tokenRecord) throw new BadRequestException("refreshToken is invalid");

        const user = await this.userModel.findById(decodeAccessToken.userId).exec();

        if (!user) throw new BadRequestException("user does not exist");

        const userId = user._id.toString();
        const newAccessToken = this.tokenService.createAccessToken(userId);
        const { refreshToken: newRefreshToken, expiresAt } = this.tokenService.createRefreshToken(userId);
        
        // revoke token
        await redis.del(
            `refresh_token:${userId}`,
        );

        await redis.set(
            `refresh_token:${userId}`,
            newAccessToken,
            'EX',
            60
        )

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        }
    }

    async verifyEmail(token: string) {
        const record = await this.verificationTokenModel.findOne({ token });
        const redis = this.redisService.getClient();
    
        if (!record) {
            throw new NotFoundException('Verification token không tồn tại.');
        }
    
        //  Kiểm tra đã dùng chưa
        if (record.isUsed || !record.isValid) {
            throw new BadRequestException('Token này đã được sử dụng.');
        }
    
        // Kiểm tra hết hạn
        if (record.expiresAt < new Date()) {
            // Invalidate token hết hạn
            await this.verificationTokenModel.updateOne(
                { _id: record._id },
                { isValid: false },
            );
            // 410 Gone - FE hiện nút "Resend"
            throw new GoneException('Token đã hết hạn. Vui lòng yêu cầu gửi lại.');
        }
    
        //  Kiểm tra user tồn tại
        const user = await this.userModel.findById(record.userId);
    
        if (!user) {
            throw new NotFoundException('Người dùng không tồn tại.');
        }
    
        // Đã verify rồi thì không cần làm gì thêm
        if (user.isEmailVerified) {
            return { message: 'Email đã được xác thực trước đó.' };
        }

        // AUTO-LOGIN
        const userId = user._id.toString();
        const accessToken = this.tokenService.createAccessToken(userId);
        const { refreshToken, expiresAt } = this.tokenService.createRefreshToken(userId);

        // save refresh token to cache 60s
        await redis.set(
            `refresh_token:${userId}`,
            refreshToken,
            'EX',
            60,
        );
    
        // Cập nhật song song: đánh dấu token đã dùng + verify user
        await Promise.all([
            this.verificationTokenModel.updateOne(
                { _id: record._id },
                { isUsed: true, isValid: false },
            ),
            this.userModel.updateOne(
                { _id: user._id },
                { isEmailVerified: true },
            ),
        ]);

        this.eventEmitter.emit('user.email.verified', {
            email: user.email,
            userId: user._id.toString()
        });
    
        return { 
            accessToken: accessToken,
            refreshToken: refreshToken,
            message: 'Xác thực email thành công.' 
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
        const { email: keyword, workspaceId, documentId } = query;

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
