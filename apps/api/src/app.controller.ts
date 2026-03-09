import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health() {
    return this.appService.health();
  }

  @Get('health/live')
  live() {
    return this.appService.live();
  }

  @Get('health/ready')
  ready() {
    return this.appService.ready();
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics() {
    return this.appService.metrics();
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
