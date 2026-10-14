import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../common/auth';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32 || secret.startsWith('dev-only'))) {
          throw new Error('JWT_SECRET phải được đặt (>= 32 ký tự, không dùng giá trị dev) ở production. Tạo bằng: openssl rand -hex 32');
        }
        return { secret: secret ?? 'dev-only-change-me-dev-only-change-me', signOptions: { expiresIn: '30d' } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}
