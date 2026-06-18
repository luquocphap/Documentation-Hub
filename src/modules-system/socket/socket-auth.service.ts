import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { parse } from 'cookie';
import { Model } from 'mongoose';
import { User } from 'src/modules-api/auth/schemas/user.schema';
import { TokenService } from '../token/token.service';
import type { AppSocket } from './socket.types';

@Injectable()
export class SocketAuthService {
  constructor(
    private readonly tokenService: TokenService,

    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  async authenticate(client: AppSocket): Promise<string> {
    const rawCookie = client.handshake.headers.cookie ?? '';
    const cookies = parse(rawCookie);
    const accessToken = cookies.accessToken;

    if (!accessToken) {
      throw new Error('ACCESS_TOKEN_NOT_FOUND');
    }

    const payload = this.tokenService.verifyAccessToken(accessToken);

    const userExists = await this.userModel.exists({
      _id: payload.userId,
    });

    if (!userExists) {
      throw new Error('USER_NOT_FOUND');
    }

    return payload.userId;
  }
}