
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from 'src/modules-system/prisma/prisma.service';
import { TokenService } from 'src/modules-system/token/token.service';
import { TokenPayload } from 'src/modules-system/token/token.types';
import { TokenExpiredError } from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ProtectGuard implements CanActivate {
    constructor(private tokenService: TokenService, private prisma: PrismaService, private reflector: Reflector) {}
  async canActivate(context: ExecutionContext):  Promise<boolean>{
     try{
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
        return true;
        }
        const req = context.switchToHttp().getRequest();
        const { accessToken } = req.cookies;

        if (!accessToken){
            throw new UnauthorizedException("Not Found Token")
        }

        const decode: TokenPayload = this.tokenService.verifyAccessToken(accessToken)

        const user = await this.prisma.user.findUnique({
            where: {
                id: decode.userId,
            }
        });
        req.user = user;

        if (!user) throw new UnauthorizedException("Fail to Authorize")
        return true;
     } catch (error: any) {
        console.log({error})
        switch (error.constructor) {
            case TokenExpiredError:
                throw new ForbiddenException(error.message);
                break;
        
            default:
                throw new UnauthorizedException("Authentication Error")
                break;
        }
     }
  }
}
