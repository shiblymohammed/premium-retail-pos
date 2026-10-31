import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator: Extract the authenticated user from the request.
 * Populated by JwtStrategy.validate().
 *
 * Usage: @CurrentUser() user: RequestUser
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

/**
 * Shape of the user object attached to every authenticated request.
 */
export interface RequestUser {
  userId: string;
  email: string;
  role: string;
  locationIds: string[];
}
