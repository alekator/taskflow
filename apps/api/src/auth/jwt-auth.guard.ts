import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    console.log('=== JWT GUARD ===');
    console.log('Authorization header:', req.headers.authorization);
    console.log('=================');

    return super.canActivate(context);
  }
}
