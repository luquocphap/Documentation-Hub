import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TokenExpiredError } from 'jsonwebtoken';
import { TokenService } from 'src/modules-system/token/token.service';
import { TokenPayload } from 'src/modules-system/token/token.types';
import { User } from 'src/modules-system/database/schemas/user.schema';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ProtectGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isPublic) return true;

      const req = context.switchToHttp().getRequest();
      const { accessToken } = req.cookies;

      if (!accessToken) {
        throw new UnauthorizedException('Not Found Token');
      }

      const decode: TokenPayload = this.tokenService.verifyAccessToken(accessToken);
      const user = await this.userModel.findById(decode.userId).exec();

      if (!user) {
        throw new UnauthorizedException('Fail to Authorize');
      }

      req.user = user;
      return true;
    } catch (error: any) {
      if (error instanceof TokenExpiredError) {
        throw new ForbiddenException(error.message);
      }

      throw new UnauthorizedException('Authentication Error');
    }
  }
}