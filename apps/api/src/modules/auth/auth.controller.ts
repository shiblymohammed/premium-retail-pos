import { Controller, Post, Body, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() request: Request) {
    const clientIp = request.ip || request.socket.remoteAddress || 'unknown';
    const tokens = await this.authService.login(dto.email, dto.password, clientIp);
    return {
      message: 'Login successful',
      data: tokens,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    const tokens = await this.authService.refreshTokens(dto.refreshToken);
    return {
      message: 'Token refreshed',
      data: tokens,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async logout(@CurrentUser() actor: RequestUser) {
    await this.authService.logout(actor.userId);
    return { message: 'Logged out successfully' };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async changePassword(@CurrentUser() actor: RequestUser, @Body() dto: ChangePasswordDto, @Req() request: Request) {
    await this.authService.changePassword(actor, dto.currentPassword, dto.newPassword, request.ip || request.socket.remoteAddress || 'unknown');
    return { message: 'Password changed. Sign in with your new password.' };
  }
}
