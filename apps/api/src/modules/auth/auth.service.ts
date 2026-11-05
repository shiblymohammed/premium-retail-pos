import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { AuthRateLimitService } from './auth-rate-limit.service';

export interface JwtPayload {
  sub: string;      // userId
  email: string;
  role: string;
  locationIds: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly BCRYPT_ROUNDS = 12;
  private readonly dummyPasswordHash = bcrypt.hash(
    randomBytes(32).toString('hex'),
    this.BCRYPT_ROUNDS,
  );

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly authRateLimit: AuthRateLimitService,
  ) {}

  /**
   * Authenticate user with email + password.
   * Returns JWT access + refresh tokens on success.
   */
  async login(email: string, password: string, clientIp: string): Promise<TokenPair> {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('Password exceeds the supported maximum length');
    }
    await this.authRateLimit.checkLoginAttempt(clientIp, email);
    const user = await this.usersService.findByEmail(email);
    const passwordHash = user?.passwordHash ?? await this.dummyPasswordHash;
    const passwordValid = await bcrypt.compare(password, passwordHash);
    if (!user || !user.isActive || !passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login timestamp
    await this.usersService.updateLastLogin(user.id);

    // Fetch user's authorized location IDs for the JWT payload
    const locationIds = await this.usersService.getUserLocationIds(user.id);
    await this.authRateLimit.clearLoginCombination(clientIp, email);

    return this.issueTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
      locationIds,
    });
  }

  /**
   * Hash a plaintext password with bcrypt (work factor 12).
   */
  async hashPassword(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, this.BCRYPT_ROUNDS);
  }

  /**
   * Generate access + refresh token pair from JWT payload.
   */
  private async issueTokenPair(payload: JwtPayload, rotateFromHash?: string): Promise<TokenPair> {
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d') as any,
      algorithm: 'HS256',
      jwtid: randomUUID(),
    });

    const refreshTokenHash = this.hashToken(refreshToken);
    if (rotateFromHash) {
      const result = await this.usersService.rotateRefreshTokenHash(
        payload.sub,
        rotateFromHash,
        refreshTokenHash,
      );
      if (result.count !== 1) throw new UnauthorizedException('Refresh token already used');
    } else {
      await this.usersService.setRefreshTokenHash(payload.sub, refreshTokenHash);
    }
    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode a refresh token, then issue a fresh token pair.
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const decoded = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
      });

      const user = await this.usersService.findById(decoded.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User account is deactivated');
      }

      const oldHash = this.hashToken(refreshToken);
      if (!user.refreshTokenHash || user.refreshTokenHash !== oldHash) {
        throw new UnauthorizedException('Refresh token already used or revoked');
      }

      const locationIds = await this.usersService.getUserLocationIds(user.id);

      return this.issueTokenPair({
        sub: user.id,
        email: user.email,
        role: user.role,
        locationIds,
      }, oldHash);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
