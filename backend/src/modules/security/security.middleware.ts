import { Injectable, NestMiddleware } from '@nestjs/common';
import { SecurityService } from './security.service';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  constructor(private readonly securityService: SecurityService) {}

  async use(req: any, res: any, next: () => void) {
    try {
      if (await this.securityService.isBanned(req)) {
        res.status(403).json({ statusCode: 403, message: '访问受限' });
        return;
      }
      await this.securityService.track(req);
    } catch {
      /* security failure must never break business */
    }
    next();
  }
}
