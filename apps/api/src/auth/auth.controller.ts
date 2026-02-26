import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const isTest = process.env.NODE_ENV === 'test';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle(
    isTest
      ? { default: { limit: 999999, ttl: 60000 } }
      : { default: { limit: 10, ttl: 60000 } },
  )
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Throttle(
    isTest
      ? { default: { limit: 999999, ttl: 60000 } }
      : { default: { limit: 10, ttl: 60000 } },
  )
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Req() req: any) {
    return this.auth.logout(req.user.id);
  }
}
