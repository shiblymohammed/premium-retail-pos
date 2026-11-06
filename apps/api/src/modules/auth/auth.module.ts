import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { AuthRateLimitService } from './auth-rate-limit.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('JWT_SECRET');
        const refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
        if (secret.length < 32 || refreshSecret.length < 32 || secret === refreshSecret) {
          throw new Error('JWT secrets must be distinct and at least 32 characters long');
        }
        const placeholderPattern = /your-|change[-_ ]?this|example|generate(?:[-_ ]|$)|replace[-_ ]?me|placeholder|<[^>]+>/i;
        if (config.get('NODE_ENV') === 'production' && [secret, refreshSecret].some((value) => placeholderPattern.test(value))) {
          throw new Error('Production JWT secrets must not use example placeholder values');
        }
        return {
          secret,
          signOptions: {
            algorithm: 'HS256' as const,
            expiresIn: config.get('JWT_EXPIRES_IN', '8h') as any,
          },
        };
      },
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AuthRateLimitService],
  exports: [AuthService],
})
export class AuthModule {}
