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
import { SearchUserDto } from './dto/search-user.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setAuthCookies(
    res: Response,
    result: {
      accessToken: string;
      refreshToken: string;
      refreshExpiresAt: Date;
    },
  ) {
    const maxAge = Math.max(
      1,
      new Date(result.refreshExpiresAt).getTime() - Date.now(),
    );
    const options = {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "strict" as const,
      maxAge,
    };

    res.cookie("accessToken", result.accessToken, options);
    res.cookie("refreshToken", result.refreshToken, options);
  }

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
    this.setAuthCookies(res, result);
    return result;
  }

  @Post('resend-verification')
  @Public()
  async resendVerification(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerification(body);
  }

  @Get("user-info")
  @UseInterceptors(ClassSerializerInterceptor)
  async getUserInfo(@CurrentUser() user: UserDocument) {
    return await this.authService.getUserInfo(user._id);
  }

  @Post("refresh-token")
  @Public()
  async refreshToken(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.refreshToken(req);
    this.setAuthCookies(res, result);
    res.json({result});
  }

  @Get('verify-email')
  @Public()
  async verifyEmail(
    @Query() query: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyEmail(query.token)
    this.setAuthCookies(res, result);
    return result;
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentUser() user: UserDocument) {
    const result = await this.authService.logout(req, user);

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return result;
  }

  @Get("search-candidates")
  async searchCandidates(@Query() query: SearchUserDto) {
    return await this.authService.searchCandidates(query);
  }
}
