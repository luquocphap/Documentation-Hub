import { Body, ClassSerializerInterceptor, Controller, Get, Post, Req, Res, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginBody } from './dto/login.dto';
import type { Request, Response } from 'express';
import { RegisterBody } from './dto/register.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import type { UserDocument } from 'src/modules-system/database/schemas/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  async register(
    @Body()
    body: RegisterBody
  ) {
    const result = await this.authService.register(body);
    return true
  };

  @Post('login')
  @Public()
  async login(
    @Body() 
    body: LoginBody,
    @Res({ passthrough: true })
    res: Response
  ){
    const result = await this.authService.login(body);
    res.cookie("accessToken", result.accessToken);
    res.cookie("refreshToken", result.refreshToken);
    return result;
  }

  @Get("user-info")
  @UseInterceptors(ClassSerializerInterceptor)
  async getUserInfo(@CurrentUser() user: UserDocument) {
    return user;
  }

  @Post("refresh-token")
  @Public()
  async refreshToken(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.refreshToken(req);
    res.cookie('accessToken', result.accessToken);
    res.cookie('refreshToken', result.refreshToken);
    res.json({result});
  }

  @Post('logout')
  @Public()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.logout(req);

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return result;
  }
}
