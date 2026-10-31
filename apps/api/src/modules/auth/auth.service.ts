import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

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

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Authenticate user with email + password.
   * Returns JWT access + refresh tokens on success.
   */
  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login timestamp
    await this.usersService.updateLastLogin(user.id);

    // Fetch user's authorized location IDs for the JWT payload
    const locationIds = await this.usersService.getUserLocationIds(user.id);

    return this.generateTokenPair({
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
  private generateTokenPair(payload: JwtPayload): TokenPair {
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d') as any,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode a refresh token, then issue a fresh token pair.
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const decoded = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(decoded.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User account is deactivated');
      }

      const locationIds = await this.usersService.getUserLocationIds(user.id);

      return this.generateTokenPair({
        sub: user.id,
        email: user.email,
        role: user.role,
        locationIds,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
