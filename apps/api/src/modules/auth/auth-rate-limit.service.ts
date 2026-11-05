import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const IP_ATTEMPT_LIMIT = 300;
const IDENTITY_ATTEMPT_LIMIT = 10;
const EMAIL_ATTEMPT_LIMIT = 20;

@Injectable()
export class AuthRateLimitService {
  private cleanupCounter = 0;
  private readonly hmacSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.hmacSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  async checkLoginAttempt(ipAddress: string, email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const ipKey = this.keyFor(`ip\0${ipAddress}`);
    const identityKey = this.keyFor(`login\0${ipAddress}\0${normalizedEmail}`);
    const emailKey = this.keyFor(`email\0${normalizedEmail}`);

    const [ipAttempts, identityAttempts, emailAttempts] = await Promise.all([
      this.bump(ipKey),
      this.bump(identityKey),
      this.bump(emailKey),
    ]);
    await this.cleanupExpiredBuckets();

    if (
      ipAttempts > IP_ATTEMPT_LIMIT ||
      identityAttempts > IDENTITY_ATTEMPT_LIMIT ||
      emailAttempts > EMAIL_ATTEMPT_LIMIT
    ) {
      throw new HttpException(
        'Too many login attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async clearLoginCombination(ipAddress: string, email: string): Promise<void> {
    const identityKey = this.keyFor(`login\0${ipAddress}\0${email.trim().toLowerCase()}`);
    const emailKey = this.keyFor(`email\0${email.trim().toLowerCase()}`);
    await this.prisma.authRateLimit.deleteMany({
      where: { key: { in: [identityKey, emailKey] } },
    });
  }

  private async bump(key: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ attempts: number }>>`
      INSERT INTO "auth_rate_limits" ("key", "attempts", "window_started_at", "updated_at")
      VALUES (${key}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE
          WHEN "auth_rate_limits"."window_started_at" <= CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN 1
          ELSE "auth_rate_limits"."attempts" + 1
        END,
        "window_started_at" = CASE
          WHEN "auth_rate_limits"."window_started_at" <= CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN CURRENT_TIMESTAMP
          ELSE "auth_rate_limits"."window_started_at"
        END,
        "updated_at" = CURRENT_TIMESTAMP
      RETURNING "attempts"
    `;
    return Number(rows[0]?.attempts ?? 1);
  }

  private keyFor(value: string): string {
    return createHmac('sha256', this.hmacSecret).update(value).digest('hex');
  }

  private async cleanupExpiredBuckets(): Promise<void> {
    this.cleanupCounter += 1;
    if (this.cleanupCounter % 250 !== 0) return;

    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.prisma.authRateLimit.deleteMany({
      where: { windowStartedAt: { lt: staleBefore } },
    });
  }
}
