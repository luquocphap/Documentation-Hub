import { BadRequestException, Injectable } from '@nestjs/common';
import { LoginBody } from './dto/login.dto';
import { PrismaService } from 'src/modules-system/prisma/prisma.service';
import * as bcrypt from "bcrypt";
import { TokenService } from 'src/modules-system/token/token.service';
import { RegisterBody } from './dto/register.dto';
import { Request } from 'express';
@Injectable()
export class AuthService {
    constructor(private prisma: PrismaService, private tokenService: TokenService) {}

    async register(body: RegisterBody) {
        const { email, password, fullName } = body;

        console.log({ email, password, fullName });

        const userExist = await this.prisma.user.findUnique({
            where: {
                email: email
            }
        });

        if (userExist) {
            throw new BadRequestException("User existed");
        }

        const hashPassword = bcrypt.hashSync(password, 10);

        const newUser = await this.prisma.user.create({
            data: {
                email: email,
                passwordHash: hashPassword,
                fullName: fullName
            }
        })
    }

    async login(body: LoginBody){
        const { email, password } = body;

        const userExist = await this.prisma.user.findUnique({
            where: {
                email: email,
            },
            omit: {
                passwordHash: false
            }
        })

        if (!userExist) {
            throw new BadRequestException("Users have not registered");
        }

        const isPassword = bcrypt.compare(password, userExist.passwordHash);

        if (!isPassword){
            throw new BadRequestException("invalid password")
        }

        const accessToken = this.tokenService.createAccessToken(userExist.id);
        const { refreshToken, expiresAt } = this.tokenService.createRefreshToken(userExist.id);

        await this.prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: userExist.id,
                expiresAt: expiresAt,
                isRevoked: false,
            },
        });

        return {
            accessToken: accessToken,
            refreshToken: refreshToken
        }
    }

    async getUserInfo(userId){
        const user = await this.prisma.user.findUnique({
            where: {
                id: userId
            }
        })

        if (!user) {
            throw new BadRequestException("User does not exist");
        }

        return user;
    }

    async refreshToken(req: Request){
        const { accessToken, refreshToken } = req.cookies;

        if (!accessToken) throw new BadRequestException("accessToken does not exist");

        if (!refreshToken) throw new BadRequestException("refreshToken does not exist");

        const decodeAccessToken: any = this.tokenService.verifyAccessToken(accessToken, { ignoreExpiration: true });
        const decodeRefreshToken: any = this.tokenService.verifyRefreshToken(refreshToken);

        if (decodeAccessToken.userId !== decodeRefreshToken.userId) throw new BadRequestException("cannot refresh token");

        const user = await this.prisma.user.findUnique({
            where: {
                id: decodeAccessToken.userId
            }
        })

        if (!user) throw new BadRequestException("user does not exist");

        const newAccesstToken = this.tokenService.createAccessToken(user.id);
        const newRefreshToken = this.tokenService.createRefreshToken(user.id);

        return {
            accessToken: newAccesstToken,
            refreshToken: newRefreshToken
        }
    }
}
