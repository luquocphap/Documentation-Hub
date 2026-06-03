import { BadRequestException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { LoginBody } from './dto/login.dto';
import * as bcrypt from "bcrypt";
import { TokenService } from 'src/modules-system/token/token.service';
import { RegisterBody } from './dto/register.dto';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/modules-system/database/schemas/user.schema';
import { Model } from 'mongoose';
import { RefreshToken } from 'src/modules-system/database/schemas/refresh-token.schema';
import { VerificationToken } from 'src/modules-system/database/schemas/verification-token.schema';
import { sendVerifyEmail } from 'src/common/verify-email/send-verify-email';
import crypto from "crypto";

@Injectable()
export class AuthService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<User>,
        @InjectModel(VerificationToken.name) private readonly verificationTokenModel: Model<VerificationToken>,
        @InjectModel(RefreshToken.name) private readonly refreshTokenModel: Model<RefreshToken>, 
        private readonly tokenService: TokenService
    ) {}

    async register(body: RegisterBody) {
        const { email, password, fullName } = body;

        console.log({ email, fullName });

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

        await this.refreshTokenModel.create({
            token: refreshToken,
            userId: user._id,
            expiresAt: expiresAt,
            isRevoked: false
        });

        return {
            accessToken: accessToken,
            refreshToken: refreshToken
        }
    }

    async getUserInfo(userId: string){
        const user = await this.userModel.findById(userId).exec();
        if (!user) {
            throw new BadRequestException("User does not exist");
        }

        return user;
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

        const tokenRecord = await this.refreshTokenModel.findOne({
            token: refreshToken,
            isRevoked: false,
            expiresAt: { $gt: new Date() },
        });

        if (!tokenRecord) throw new BadRequestException("refreshToken is invalid");

        const user = await this.userModel.findById(decodeAccessToken.userId).exec();

        if (!user) throw new BadRequestException("user does not exist");

        const userId = user._id.toString();
        const newAccessToken = this.tokenService.createAccessToken(userId);
        const { refreshToken: newRefreshToken, expiresAt } = this.tokenService.createRefreshToken(userId);

        tokenRecord.isRevoked = true;
        await tokenRecord.save();

        await this.refreshTokenModel.create({
            token: newRefreshToken,
            userId: user._id,
            expiresAt,
            isRevoked: false,
        });

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        }
    }

    async verifyEmail(token: string): Promise<{ message: string }> {
        const record = await this.verificationTokenModel.findOne({ token });
    
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
    
        return { message: 'Xác thực email thành công.' };
    }

    async logout(req: Request) {
        const { refreshToken } = req.cookies;

        if (!refreshToken) {
            throw new BadRequestException('refreshToken does not exist');
        }

        const tokenRecord = await this.refreshTokenModel.findOne({
            token: refreshToken,
            isRevoked: false,
        });

        if (!tokenRecord) {
            throw new BadRequestException('refreshToken is invalid or already revoked');
        }

        tokenRecord.isRevoked = true;
        await tokenRecord.save();

        return {
            message: 'Logout successfully',
        };
    }
}
