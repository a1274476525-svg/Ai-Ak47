import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Pre-hashed password stored in env as ADMIN_PASSWORD_HASH
  // Generate with: node -e "const b=require('bcrypt');b.hash('yourpassword',12).then(console.log)"
  private readonly adminUsername: string;
  private readonly adminPasswordHash: string;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.adminUsername    = config.get<string>('admin.username') ?? 'admin';
    this.adminPasswordHash = config.get<string>('admin.passwordHash') ?? '';
  }

  async login(username: string, password: string): Promise<{ accessToken: string }> {
    if (username !== this.adminUsername) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // If no hash configured, fall back to plain comparison (dev only)
    let valid = false;
    if (this.adminPasswordHash) {
      valid = await bcrypt.compare(password, this.adminPasswordHash);
    } else {
      const devPassword = this.config.get<string>('admin.password') ?? 'changeme';
      valid = password === devPassword;
      if (valid) {
        this.logger.warn('Using plain-text password — set ADMIN_PASSWORD_HASH for production');
      }
    }

    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: 'admin', username };
    const accessToken = this.jwt.sign(payload);
    this.logger.log('Admin login successful');
    return { accessToken };
  }
}
