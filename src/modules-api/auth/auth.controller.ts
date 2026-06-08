import { Body, ClassSerializerInterceptor, Controller, Get, Post, Query, Req, Res, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginBody } from './dto/login.dto';
import type { Request, Response } from 'express';
import { RegisterBody } from './dto/register.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { NODE_ENV } from 'src/common/constants/app.constant';
import type { UserDocument } from './schemas/user.schema';

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
    res.cookie("accessToken", result.accessToken, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
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
    res.cookie("accessToken", result.accessToken, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.json({result});
  }

  @Get('verify-email')
  @Public()
  async verifyEmail(@Query() query: VerifyEmailDto, @Res() res: Response) {
    const result = await this.authService.verifyEmail(query.token)
    res.cookie("accessToken", result.accessToken, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return result;
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentUser() user: UserDocument) {
    const result = await this.authService.logout(req, user);

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return result;
  }
}
